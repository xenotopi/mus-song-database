/**
 * μ's Song Database Web
 * assets/js/api.js
 *
 * v2.7 Performance Update
 * JSONP + sessionStorage cache
 */

export const API_URL =
  "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";

const DEFAULT_TIMEOUT_MS = 15000;
const CACHE_PREFIX = "mus-db-api-v27:";
const inFlightRequests = new Map();
let requestSequence = 0;


const DEFAULT_CACHE_TTL = {
  home: 10 * 60 * 1000,
  rankings: 15 * 60 * 1000,
  trends: 30 * 60 * 1000,
  about: 30 * 60 * 1000,
  song: 15 * 60 * 1000,
  event: 15 * 60 * 1000,
  venue: 15 * 60 * 1000,
  discover: 15 * 60 * 1000,
  search: 5 * 60 * 1000
};


function stableParams(params = {}) {
  return Object.keys(params)
    .sort()
    .reduce(
      (result, key) => {
        const value = params[key];

        if (
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          result[key] = String(value);
        }

        return result;
      },
      {}
    );
}


function createCacheKey(
  action,
  params = {}
) {
  return (
    CACHE_PREFIX +
    action +
    ":" +
    JSON.stringify(
      stableParams(params)
    )
  );
}


function readSessionCache(
  action,
  params
) {
  try {
    const raw =
      sessionStorage.getItem(
        createCacheKey(
          action,
          params
        )
      );

    if (!raw) {
      return null;
    }

    const stored =
      JSON.parse(raw);

    if (
      !stored ||
      !stored.response ||
      !stored.savedAt
    ) {
      return null;
    }

    return stored;

  } catch (error) {
    console.warn(
      "API cache read failed:",
      error
    );

    return null;
  }
}


function writeSessionCache(
  action,
  params,
  response
) {
  try {
    sessionStorage.setItem(
      createCacheKey(
        action,
        params
      ),
      JSON.stringify({
        savedAt: Date.now(),
        response: response
      })
    );

  } catch (error) {
    // 容量上限などで保存できなくても通信自体は継続する。
    console.warn(
      "API cache write failed:",
      error
    );
  }
}


export function clearApiSessionCache() {
  try {
    Object.keys(sessionStorage)
      .filter(key =>
        key.startsWith(
          CACHE_PREFIX
        )
      )
      .forEach(key =>
        sessionStorage.removeItem(
          key
        )
      );

  } catch (error) {
    console.warn(
      "API cache clear failed:",
      error
    );
  }
}


export function jsonpRequest(options) {
  const action = String(
    options?.action || ""
  ).trim();

  const params =
    options?.params || {};

  const timeoutMs =
    options?.timeoutMs ||
    DEFAULT_TIMEOUT_MS;

  requestSequence += 1;

  const callbackName =
    `__musJsonpCallback_${Date.now()}_${requestSequence}`;

  const script =
    document.createElement(
      "script"
    );

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

  // ブラウザのscriptキャッシュだけを避ける。
  // GAS側キャッシュキーには含めない。
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
      window[callbackName] =
        undefined;
    }
  }

  const promise =
    new Promise(
      (resolve, reject) => {
        window[callbackName] =
          result => {
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
        script.src =
          url.toString();

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

        timer =
          window.setTimeout(
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
    promise: promise,

    cancel() {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
    }
  };
}


async function requestWithRetry(
  action,
  params,
  options
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
      const request =
        jsonpRequest({
          action: action,
          params: params,
          timeoutMs: timeoutMs
        });

      return await request.promise;

    } catch (error) {
      lastError = error;

      if (
        attempt <
        retryCount
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              500 *
              (attempt + 1)
            )
        );
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "APIへ接続できませんでした。"
    )
  );
}


export async function apiGet(
  action,
  params = {},
  options = {}
) {
  const normalizedAction =
    String(action || "").trim();

  const cacheEnabled =
    options.cache !== false;

  const forceRefresh =
    options.forceRefresh === true;

  const staleWhileRevalidate =
    options.staleWhileRevalidate === true;

  const ttlMs =
    Number(
      options.cacheTtlMs ??
      DEFAULT_CACHE_TTL[
        normalizedAction
      ] ??
      5 * 60 * 1000
    );

  const cached =
    cacheEnabled
      ? readSessionCache(
          normalizedAction,
          params
        )
      : null;

  const cacheAge =
    cached
      ? Date.now() -
        Number(
          cached.savedAt || 0
        )
      : Infinity;

  const cacheIsFresh =
    cached &&
    cacheAge <= ttlMs;

  if (
    !forceRefresh &&
    cacheIsFresh
  ) {
    return {
      ...cached.response,
      cache: {
        source: "session",
        stale: false,
        ageMs: cacheAge
      }
    };
  }

  const requestKey =
    createCacheKey(
      normalizedAction,
      params
    );

  const startNetworkRequest =
    () => {
      if (
        inFlightRequests.has(
          requestKey
        )
      ) {
        return inFlightRequests.get(
          requestKey
        );
      }

      const promise =
        requestWithRetry(
          normalizedAction,
          params,
          options
        )
          .then(response => {
            if (cacheEnabled) {
              writeSessionCache(
                normalizedAction,
                params,
                response
              );
            }

            return {
              ...response,
              cache: {
                source: "network",
                stale: false,
                ageMs: 0
              }
            };
          })
          .finally(() => {
            inFlightRequests.delete(
              requestKey
            );
          });

      inFlightRequests.set(
        requestKey,
        promise
      );

      return promise;
    };

  if (
    !forceRefresh &&
    cached &&
    staleWhileRevalidate
  ) {
    // 古い表示を即時返し、裏で新しいデータへ更新する。
    startNetworkRequest()
      .catch(error => {
        console.warn(
          "Background API refresh failed:",
          error
        );
      });

    return {
      ...cached.response,
      cache: {
        source: "session",
        stale: true,
        ageMs: cacheAge
      }
    };
  }

  return startNetworkRequest();
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
    ? String(value).replaceAll(
        "-",
        "/"
      )
    : "—";
}
