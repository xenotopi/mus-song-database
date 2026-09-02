"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const CLASP_CREDENTIALS_PATH = path.join(os.homedir(), ".clasprc.json");
const TOKEN_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "musdb-post-card");
const TOKEN_PATH = path.join(TOKEN_DIR, "oauth-token.json");
const CLIENT_PATH = path.join(TOKEN_DIR, "oauth-client.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function getClaspOAuthProfile() {
  if (!fs.existsSync(CLASP_CREDENTIALS_PATH)) {
    throw new Error("既存clasp認証が見つかりません。新しいOAuthクライアントは自動作成しません。");
  }
  const credentials = readJson(CLASP_CREDENTIALS_PATH);
  const profile = credentials?.tokens?.default;
  if (!profile?.client_id || !profile?.client_secret || !profile?.refresh_token) {
    throw new Error("既存clasp認証にOAuth clientまたはrefresh tokenがありません。");
  }
  return profile;
}

function getDedicatedOAuthClient() {
  if (process.env.MUSDB_GOOGLE_CLIENT_ID && process.env.MUSDB_GOOGLE_CLIENT_SECRET) {
    return {
      client_id: process.env.MUSDB_GOOGLE_CLIENT_ID,
      client_secret: process.env.MUSDB_GOOGLE_CLIENT_SECRET
    };
  }
  if (!fs.existsSync(CLIENT_PATH)) {
    throw new Error(
      `専用Desktop OAuth clientがありません。Google Cloudから取得したJSONを ${CLIENT_PATH} に保存してください。`
    );
  }
  const source = readJson(CLIENT_PATH);
  const client = source.installed || source;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error(`専用Desktop OAuth client JSONの形式が不正です: ${CLIENT_PATH}`);
  }
  return client;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error(`Google OAuth応答がJSONではありません（HTTP ${response.status}）。`);
  }
  if (!response.ok) {
    const reason = body?.error_description || body?.error?.message || body?.error || `HTTP ${response.status}`;
    throw new Error(`Google OAuth要求に失敗しました: ${reason}`);
  }
  return body;
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  return requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

async function inspectAccessToken(accessToken) {
  const url = new URL("https://www.googleapis.com/oauth2/v3/tokeninfo");
  url.searchParams.set("access_token", accessToken);
  const data = await requestJson(url);
  const scopes = String(data.scope || "").split(/\s+/).filter(Boolean);
  return {
    scopes,
    hasReadonlyScope: scopes.includes(READONLY_SCOPE),
    expiresIn: Number(data.expires_in || 0)
  };
}

async function getClaspReadonlyAccessToken() {
  const clasp = getClaspOAuthProfile();
  const refreshed = await refreshAccessToken({
    clientId: clasp.client_id,
    clientSecret: clasp.client_secret,
    refreshToken: clasp.refresh_token
  });
  const inspection = await inspectAccessToken(refreshed.access_token);
  if (!inspection.hasReadonlyScope) return null;
  return { accessToken: refreshed.access_token, source: "clasp-readonly" };
}

async function getDedicatedReadonlyAccessToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  const stored = readJson(TOKEN_PATH);
  if (!stored?.refresh_token || !String(stored.scope || "").split(/\s+/).includes(READONLY_SCOPE)) {
    throw new Error(`専用tokenの形式またはscopeが不正です: ${TOKEN_PATH}`);
  }
  const client = getDedicatedOAuthClient();
  const refreshed = await refreshAccessToken({
    clientId: client.client_id,
    clientSecret: client.client_secret,
    refreshToken: stored.refresh_token
  });
  const inspection = await inspectAccessToken(refreshed.access_token);
  if (!inspection.hasReadonlyScope) {
    throw new Error("専用OAuth tokenにspreadsheets.readonly scopeがありません。");
  }
  atomicWriteJson(TOKEN_PATH, {
    schemaVersion: 1,
    scope: READONLY_SCOPE,
    refresh_token: stored.refresh_token,
    access_token: refreshed.access_token,
    expiry_date: Date.now() + Number(refreshed.expires_in || 3600) * 1000
  });
  return { accessToken: refreshed.access_token, source: "dedicated-readonly" };
}

async function getSheetsReadonlyAccessToken() {
  const dedicated = await getDedicatedReadonlyAccessToken();
  if (dedicated) return dedicated;
  const clasp = await getClaspReadonlyAccessToken();
  if (clasp) return clasp;
  throw new Error(
    "既存clasp認証にspreadsheets.readonly scopeがありません。" +
    ` 専用Desktop OAuth client JSONを ${CLIENT_PATH} に置き、` +
    "`node tools/google-sheets-readonly-auth.cjs --authorize` を一度実行してください。"
  );
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function openBrowser(url) {
  if (process.platform === "win32") {
    const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function authorizeDedicatedToken() {
  const client = getDedicatedOAuthClient();
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64Url(crypto.randomBytes(24));

  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname !== "/oauth2callback") {
      response.writeHead(404).end();
      return;
    }
    if (requestUrl.searchParams.get("state") !== state) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("OAuth state mismatch. This window can be closed.");
      rejectCode(new Error("OAuth stateが一致しません。"));
      return;
    }
    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    if (error || !code) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Authorization was not completed. This window can be closed.");
      rejectCode(new Error(`Google OAuth認可が完了しませんでした: ${error || "codeなし"}`));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Google Sheets read-only authorization completed. You can close this window.");
    resolveCode(code);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state
  });

  process.stdout.write("Google Sheets read-only認可をブラウザで完了してください。\n");
  process.stdout.write(`${authorizationUrl.href}\n`);
  openBrowser(authorizationUrl.href);
  const timeout = setTimeout(() => rejectCode(new Error("OAuth認可が5分以内に完了しませんでした。")), 300000);
  let code;
  try {
    code = await codePromise;
  } finally {
    clearTimeout(timeout);
    server.close();
  }

  const token = await requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });
  const scopes = String(token.scope || READONLY_SCOPE).split(/\s+/).filter(Boolean);
  if (!scopes.includes(READONLY_SCOPE) || !token.refresh_token) {
    throw new Error("read-only scopeまたはrefresh tokenを取得できませんでした。");
  }
  atomicWriteJson(TOKEN_PATH, {
    schemaVersion: 1,
    scope: READONLY_SCOPE,
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    expiry_date: Date.now() + Number(token.expires_in || 3600) * 1000
  });
  process.stdout.write(`専用read-only tokenを保存しました: ${TOKEN_PATH}\n`);
}

async function checkAuthentication() {
  let claspReadonly = false;
  try {
    claspReadonly = Boolean(await getClaspReadonlyAccessToken());
  } catch (_error) {
    claspReadonly = false;
  }
  let dedicatedReadonly = false;
  try {
    dedicatedReadonly = Boolean(await getDedicatedReadonlyAccessToken());
  } catch (_error) {
    dedicatedReadonly = false;
  }
  process.stdout.write(`${JSON.stringify({
    claspReadonly,
    dedicatedReadonly,
    clientPath: CLIENT_PATH,
    tokenPath: TOKEN_PATH
  }, null, 2)}\n`);
  if (!claspReadonly && !dedicatedReadonly) process.exitCode = 2;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--authorize")) {
    await authorizeDedicatedToken();
    return;
  }
  if (args.size === 0 || args.has("--check")) {
    await checkAuthentication();
    return;
  }
  throw new Error("使用可能な引数は --check または --authorize です。");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  READONLY_SCOPE,
  CLIENT_PATH,
  TOKEN_PATH,
  authorizeDedicatedToken,
  getSheetsReadonlyAccessToken,
  inspectAccessToken
};
