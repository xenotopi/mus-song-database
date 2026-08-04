/**
 * μ's Song Database Web
 * assets/js/api.js
 *
 * v3.4 Performance & Cache Optimization
 *
 * - sessionStorage: 同一タブ内の高速再表示
 * - localStorage: 再訪時の即時表示
 * - stale-while-revalidate: 古い表示を先に返し、裏で更新
 * - in-flight deduplication: 同一通信の重複防止
 * - stale fallback: 通信失敗時に保存済みデータを利用
 */

export const API_URL =
  "https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec";

const DEFAULT_TIMEOUT_MS = 15000;
const CACHE_VERSION = "v3.4.0";
const SESSION_PREFIX = `mus-db-session-${CACHE_VERSION}:`;
const LOCAL_PREFIX = `mus-db-local-${CACHE_VERSION}:`;
const MAX_LOCAL_CACHE_BYTES = 4.2 * 1024 * 1024;

const inFlightRequests = new Map();
let requestSequence = 0;


const DEFAULT_CACHE_TTL = {
  home: 10 * 60 * 1000,
  rankings: 30 * 60 * 1000,
  trends: 60 * 60 * 1000,
  about: 24 * 60 * 60 * 1000,
  song: 30 * 60 * 1000,
  event: 30 * 60 * 1000,
  venue: 30 * 60 * 1000,
  discover: 30 * 60 * 1000,
  search: 5 * 60 * 1000
};


const DEFAULT_STALE_TTL = {
  home: 24 * 60 * 60 * 1000,
  rankings: 24 * 60 * 60 * 1000,
  trends: 24 * 60 * 60 * 1000,
  about: 7 * 24 * 60 * 60 * 1000,
  song: 7 * 24 * 60 * 60 * 1000,
  event: 7 * 24 * 60 * 60 * 1000,
  venue: 7 * 24 * 60 * 60 * 1000,
  discover: 24 * 60 * 60 * 1000,
  search: 30 * 60 * 1000
};


const PERSISTENT_ACTIONS = new Set([
  "home",
  "rankings",
  "trends",
  "about",
  "song",
  "event",
  "venue",
  "discover"
]);


const SWR_ACTIONS = new Set([
  "home",
  "rankings",
  "trends",
  "about",
  "song",
  "event",
  "venue",
  "discover"
]);


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
  prefix,
  action,
  params = {}
) {
  return (
    prefix +
    action +
    ":" +
    JSON.stringify(
      stableParams(params)
    )
  );
}


function parseStoredValue(raw) {
  if (!raw) {
    return null;
  }

  try {
    const stored =
      JSON.parse(raw);

    if (
      !stored ||
      !stored.response ||
      !Number(stored.savedAt)
    ) {
      return null;
    }

    return stored;

  } catch {
    return null;
  }
}


function readStorage(
  storage,
  prefix,
  action,
  params
) {
  try {
    return parseStoredValue(
      storage.getItem(
        createCacheKey(
          prefix,
          action,
          params
        )
      )
    );

  } catch (error) {
    console.warn(
      "API cache read failed:",
      error
    );

    return null;
  }
}


function writeStorage(
  storage,
  prefix,
  action,
  params,
  response
) {
  try {
    storage.setItem(
      createCacheKey(
        prefix,
        action,
        params
      ),
      JSON.stringify({
        savedAt:
          Date.now(),

        response:
          response
      })
    );

    return true;

  } catch (error) {
    console.warn(
      "API cache write failed:",
      error
    );

    return false;
  }
}


function removeOldLocalEntries() {
  try {
    const entries = [];

    for (
      let index = 0;
      index < localStorage.length;
      index += 1
    ) {
      const key =
        localStorage.key(index);

      if (
        !key ||
        !key.startsWith(
          LOCAL_PREFIX
        )
      ) {
        continue;
      }

      const raw =
        localStorage.getItem(key);

      const parsed =
        parseStoredValue(raw);

      entries.push({
        key:
          key,

        bytes:
          raw
            ? new Blob([raw]).size
            : 0,

        savedAt:
          Number(
            parsed?.savedAt || 0
          )
      });
    }

    const totalBytes =
      entries.reduce(
        (sum, item) =>
          sum + item.bytes,
        0
      );

    if (
      totalBytes <=
      MAX_LOCAL_CACHE_BYTES
    ) {
      return;
    }

    entries
      .sort((a, b) =>
        a.savedAt -
        b.savedAt
      )
      .forEach(item => {
        if (
          estimateLocalCacheBytes() <=
          MAX_LOCAL_CACHE_BYTES *
          0.8
        ) {
          return;
        }

        localStorage.removeItem(
          item.key
        );
      });

  } catch (error) {
    console.warn(
      "Local cache cleanup failed:",
      error
    );
  }
}


function estimateLocalCacheBytes() {
  let total = 0;

  try {
    for (
      let index = 0;
      index < localStorage.length;
      index += 1
    ) {
      const key =
        localStorage.key(index);

      if (
        !key ||
        !key.startsWith(
          LOCAL_PREFIX
        )
      ) {
        continue;
      }

      const raw =
        localStorage.getItem(key);

      total +=
        new Blob([
          key,
          raw || ""
        ]).size;
    }

  } catch {
    return 0;
  }

  return total;
}


function readBestCache(
  action,
  params
) {
  const session =
    readStorage(
      sessionStorage,
      SESSION_PREFIX,
      action,
      params
    );

  const local =
    PERSISTENT_ACTIONS.has(action)
      ? readStorage(
          localStorage,
          LOCAL_PREFIX,
          action,
          params
        )
      : null;

  if (!session) {
    return local
      ? {
          ...local,
          source:
            "local"
        }
      : null;
  }

  if (!local) {
    return {
      ...session,
      source:
        "session"
    };
  }

  return Number(
    session.savedAt
  ) >=
  Number(
    local.savedAt
  )
    ? {
        ...session,
        source:
          "session"
      }
    : {
        ...local,
        source:
          "local"
      };
}


function writeCaches(
  action,
  params,
  response
) {
  writeStorage(
    sessionStorage,
    SESSION_PREFIX,
    action,
    params,
    response
  );

  if (
    !PERSISTENT_ACTIONS.has(
      action
    )
  ) {
    return;
  }

  removeOldLocalEntries();

  const written =
    writeStorage(
      localStorage,
      LOCAL_PREFIX,
      action,
      params,
      response
    );

  if (!written) {
    removeOldLocalEntries();

    writeStorage(
      localStorage,
      LOCAL_PREFIX,
      action,
      params,
      response
    );
  }
}


function clearStorageByPrefix(
  storage,
  prefix
) {
  try {
    Object.keys(storage)
      .filter(key =>
        key.startsWith(prefix)
      )
      .forEach(key =>
        storage.removeItem(key)
      );

  } catch (error) {
    console.warn(
      "API cache clear failed:",
      error
    );
  }
}


export function clearApiSessionCache() {
  clearStorageByPrefix(
    sessionStorage,
    SESSION_PREFIX
  );
}


export function clearApiPersistentCache() {
  clearStorageByPrefix(
    localStorage,
    LOCAL_PREFIX
  );
}


export function clearAllApiCaches() {
  clearApiSessionCache();
  clearApiPersistentCache();
}


export function jsonpRequest(options) {
  const action =
    String(
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
    promise:
      promise,

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
          action:
            action,

          params:
            params,

          timeoutMs:
            timeoutMs
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
              350 *
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
    String(
      action || ""
    ).trim();

  const cacheEnabled =
    options.cache !== false;

  const forceRefresh =
    options.forceRefresh === true;

  const explicitSWR =
    typeof options
      .staleWhileRevalidate ===
      "boolean";

  const staleWhileRevalidate =
    explicitSWR
      ? options.staleWhileRevalidate
      : SWR_ACTIONS.has(
          normalizedAction
        );

  const ttlMs =
    Number(
      options.cacheTtlMs ??
      DEFAULT_CACHE_TTL[
        normalizedAction
      ] ??
      5 * 60 * 1000
    );

  const staleTtlMs =
    Number(
      options.staleCacheTtlMs ??
      DEFAULT_STALE_TTL[
        normalizedAction
      ] ??
      30 * 60 * 1000
    );

  const cached =
    cacheEnabled
      ? readBestCache(
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
    Boolean(
      cached &&
      cacheAge <= ttlMs
    );

  const cacheIsUsable =
    Boolean(
      cached &&
      cacheAge <=
        staleTtlMs
    );

  if (
    !forceRefresh &&
    cacheIsFresh
  ) {
    return {
      ...cached.response,

      cache: {
        source:
          cached.source,

        stale:
          false,

        ageMs:
          cacheAge
      }
    };
  }

  const requestKey =
    createCacheKey(
      "request:",
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
              writeCaches(
                normalizedAction,
                params,
                response
              );
            }

            return {
              ...response,

              cache: {
                source:
                  "network",

                stale:
                  false,

                ageMs:
                  0
              }
            };
          })
          .catch(error => {
            if (
              !forceRefresh &&
              cacheIsUsable
            ) {
              return {
                ...cached.response,

                cache: {
                  source:
                    cached.source,

                  stale:
                    true,

                  fallback:
                    true,

                  ageMs:
                    cacheAge
                }
              };
            }

            throw error;
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
    cacheIsUsable &&
    staleWhileRevalidate
  ) {
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
        source:
          cached.source,

        stale:
          true,

        ageMs:
          cacheAge
      }
    };
  }

  return startNetworkRequest();
}


export function prefetchApi(
  action,
  params = {},
  options = {}
) {
  const run =
    () =>
      apiGet(
        action,
        params,
        {
          ...options,

          staleWhileRevalidate:
            true
        }
      )
        .catch(error => {
          console.warn(
            `API prefetch failed: ${action}`,
            error
          );
        });

  if (
    "requestIdleCallback" in
    window
  ) {
    window.requestIdleCallback(
      run,
      {
        timeout:
          2500
      }
    );

    return;
  }

  window.setTimeout(
    run,
    700
  );
}


export function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


export function formatDate(value) {
  return value
    ? String(value)
        .replaceAll(
          "-",
          "/"
        )
    : "—";
}
