/**
 * μ's Song Database Web
 * assets/js/api.js
 * JSONP通信対応版
 */

export const API_URL = "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";

const DEFAULT_TIMEOUT_MS = 15000;
let requestSequence = 0;

export function jsonpRequest(options) {
  const action = String(
    options?.action || ""
  ).trim();

  const params = options?.params || {};
  const timeoutMs =
    options?.timeoutMs ||
    DEFAULT_TIMEOUT_MS;

  requestSequence += 1;

  const callbackName =
    `__musJsonpCallback_${Date.now()}_${requestSequence}`;

  const script =
    document.createElement("script");

  const url =
    new URL(API_URL);

  url.searchParams.set(
    "action",
    action
  );

  url.searchParams.set(
    "callback",
    callbackName
  );

  url.searchParams.set(
    "_t",
    String(Date.now())
  );

  Object.entries(params).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    }
  );

  let timer = null;
  let settled = false;

  function cleanup() {
    if (timer) {
      clearTimeout(timer);
    }

    if (script.parentNode) {
      script.parentNode.removeChild(
        script
      );
    }

    try {
      delete window[callbackName];
    } catch {
      window[callbackName] = undefined;
    }
  }

  const promise = new Promise(
    (resolve, reject) => {
      window[callbackName] = result => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        if (!result?.success) {
          reject(
            new Error(
              result?.error?.message ||
              "API処理に失敗しました。"
            )
          );
          return;
        }

        resolve(result);
      };

      script.async = true;
      script.src = url.toString();

      script.onerror = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        reject(
          new Error(
            "JSONPスクリプトを読み込めませんでした。"
          )
        );
      };

      timer = window.setTimeout(
        () => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();

          reject(
            new Error(
              "API接続がタイムアウトしました。"
            )
          );
        },
        timeoutMs
      );

      document.head.appendChild(
        script
      );
    }
  );

  return {
    promise,

    cancel() {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
    },
  };
}

export async function apiGet(
  action,
  params = {},
  options = {}
) {
  const retryCount =
    Number.isInteger(
      options.retryCount
    )
      ? options.retryCount
      : 1;

  const timeoutMs =
    options.timeoutMs ||
    DEFAULT_TIMEOUT_MS;

  let lastError = null;

  for (
    let attempt = 0;
    attempt <= retryCount;
    attempt += 1
  ) {
    try {
      const request = jsonpRequest({
        action,
        params,
        timeoutMs,
      });

      return await request.promise;

    } catch (error) {
      lastError = error;

      if (attempt < retryCount) {
        await new Promise(
          resolve => setTimeout(
            resolve,
            600 * (attempt + 1)
          )
        );
      }
    }
  }

  throw lastError ||
    new Error(
      "APIへ接続できませんでした。"
    );
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
  return value
    ? String(value).replaceAll("-", "/")
    : "—";
}
