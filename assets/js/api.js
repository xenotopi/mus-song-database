const API_URL = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_COUNT = 2;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createApiUrl(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  // GitHub Pages・ブラウザキャッシュの影響を避ける
  url.searchParams.set("_t", String(Date.now()));

  return url.toString();
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "Accept": "application/json,text/plain,*/*"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGet(action, params = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const requestUrl = createApiUrl(action, params);

    try {
      const response = await fetchWithTimeout(requestUrl, timeoutMs);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();

      if (!text) {
        throw new Error("APIの応答が空でした。");
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error("APIの応答をJSONとして解析できませんでした。");
      }

      if (!result.success) {
        throw new Error(result.error?.message || "API処理に失敗しました。");
      }

      return result;

    } catch (error) {
      lastError = error;

      if (attempt < retryCount) {
        await wait(700 * (attempt + 1));
      }
    }
  }

  const message = lastError?.name === "AbortError"
    ? "API接続がタイムアウトしました。"
    : lastError?.message || "APIへ接続できませんでした。";

  throw new Error(message);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDate(value) {
  return value ? String(value).replaceAll("-", "/") : "—";
}

export { API_URL };
