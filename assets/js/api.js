/**
 * μ's Song Database Web
 * assets/js/api.js
 *
 * v4.9.6 Cache-first Revision Validation
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
const CACHE_VERSION = "v4.9.5";
const SESSION_PREFIX = `mus-db-session-${CACHE_VERSION}:`;
const LOCAL_PREFIX = `mus-db-local-${CACHE_VERSION}:`;
const LEGACY_SESSION_PREFIXES = [
  "mus-db-session-v3.4.0:"
];
const LEGACY_LOCAL_PREFIXES = [
  "mus-db-local-v3.4.0:"
];
const ALL_SESSION_PREFIXES = [
  SESSION_PREFIX,
  ...LEGACY_SESSION_PREFIXES
];
const ALL_LOCAL_PREFIXES = [
  LOCAL_PREFIX,
  ...LEGACY_LOCAL_PREFIXES
];
const MAX_LOCAL_CACHE_BYTES = 4.2 * 1024 * 1024;
const DATA_REVISION_SESSION_KEY =
  `${SESSION_PREFIX}data-revision`;
const DATA_REVISION_TTL_MS =
  15 * 1000;
const DEFAULT_PROVISIONAL_STALE_TTL_MS =
  30 * 60 * 1000;

const inFlightRequests = new Map();
const backgroundRefreshes = new Map();
let requestSequence = 0;
let dataRevisionPromise = null;
let dataRevisionPromiseFetchedAt = 0;


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
  revision,
  action,
  params = {}
) {
  return (
    prefix +
    "revision:" +
    encodeURIComponent(
      String(revision || "")
    ) +
    ":" +
    action +
    ":" +
    JSON.stringify(
      stableParams(params)
    )
  );
}


function createLegacyCacheKey(
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
  revision,
  action,
  params
) {
  try {
    return parseStoredValue(
      storage.getItem(
        createCacheKey(
          prefix,
          revision,
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
  revision,
  action,
  params,
  response
) {
  try {
    storage.setItem(
      createCacheKey(
        prefix,
        revision,
        action,
        params
      ),
      JSON.stringify({
        savedAt:
          Date.now(),

        revision:
          revision,

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


function readNewestStorageFallback(
  storage,
  prefixes,
  action,
  params
) {
  try {
    const suffix =
      ":" +
      action +
      ":" +
      JSON.stringify(
        stableParams(params)
      );

    let newest = null;

    for (
      let index = 0;
      index < storage.length;
      index += 1
    ) {
      const key =
        storage.key(index);

      if (!key) {
        continue;
      }

      const prefix =
        prefixes.find(item =>
          key.startsWith(item)
        );

      if (!prefix) {
        continue;
      }

      const isLegacy =
        key ===
        createLegacyCacheKey(
          prefix,
          action,
          params
        );

      const isRevisionCache =
        key.startsWith(
          prefix +
          "revision:"
        ) &&
        key.endsWith(suffix);

      if (
        !isLegacy &&
        !isRevisionCache
      ) {
        continue;
      }

      const stored =
        parseStoredValue(
          storage.getItem(key)
        );

      if (
        !stored ||
        (
          newest &&
          Number(newest.savedAt) >=
          Number(stored.savedAt)
        )
      ) {
        continue;
      }

      newest = stored;
    }

    return newest;

  } catch (error) {
    console.warn(
      "API fallback cache read failed:",
      error
    );

    return null;
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
        !ALL_LOCAL_PREFIXES.some(
          prefix =>
            key.startsWith(prefix)
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
        !ALL_LOCAL_PREFIXES.some(
          prefix =>
            key.startsWith(prefix)
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
  params,
  revision
) {
  const session =
    readStorage(
      sessionStorage,
      SESSION_PREFIX,
      revision,
      action,
      params
    );

  const local =
    PERSISTENT_ACTIONS.has(action)
      ? readStorage(
          localStorage,
          LOCAL_PREFIX,
          revision,
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


function readBestFallbackCache(
  action,
  params
) {
  const session =
    readNewestStorageFallback(
      sessionStorage,
      ALL_SESSION_PREFIXES,
      action,
      params
    );

  const local =
    PERSISTENT_ACTIONS.has(action)
      ? readNewestStorageFallback(
          localStorage,
          ALL_LOCAL_PREFIXES,
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
  response,
  revision
) {
  writeStorage(
    sessionStorage,
    SESSION_PREFIX,
    revision,
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
      revision,
      action,
      params,
      response
    );

  if (!written) {
    removeOldLocalEntries();

    writeStorage(
      localStorage,
      LOCAL_PREFIX,
      revision,
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
  ALL_SESSION_PREFIXES.forEach(
    prefix =>
      clearStorageByPrefix(
        sessionStorage,
        prefix
      )
  );
}


export function clearApiPersistentCache() {
  ALL_LOCAL_PREFIXES.forEach(
    prefix =>
      clearStorageByPrefix(
        localStorage,
        prefix
      )
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


function readStoredDataRevision(
  options = {}
) {
  const allowExpired =
    options.allowExpired === true;

  try {
    const stored =
      JSON.parse(
        sessionStorage.getItem(
          DATA_REVISION_SESSION_KEY
        ) ||
        "null"
      );

    const revision =
      String(
        stored?.revision ||
        ""
      ).trim();

    const fetchedAt =
      Number(
        stored?.fetchedAt ||
        0
      );

    const ageMs =
      Date.now() -
      fetchedAt;

    const expired =
      ageMs >
      DATA_REVISION_TTL_MS;

    if (
      !revision ||
      !Number.isFinite(fetchedAt) ||
      fetchedAt <= 0 ||
      ageMs < 0 ||
      (
        expired &&
        !allowExpired
      )
    ) {
      return null;
    }

    return {
      revision:
        revision,

      fetchedAt:
        fetchedAt,

      ageMs:
        ageMs,

      expired:
        expired
    };

  } catch (error) {
    console.warn(
      "Data revision cache read failed:",
      error
    );

    return null;
  }
}


function rememberDataRevision(
  revision,
  fetchedAt = Date.now()
) {
  const normalized =
    String(
      revision || ""
    ).trim();

  if (!normalized) {
    return;
  }

  dataRevisionPromiseFetchedAt =
    fetchedAt;

  dataRevisionPromise =
    Promise.resolve(
      normalized
    );

  writeStoredDataRevision(
    normalized,
    fetchedAt
  );
}


function getResponseDataRevision(
  response
) {
  return String(
    response?.data?._cache
      ?.revision ||
    response?.data
      ?.dataRevision ||
    ""
  ).trim();
}


function writeStoredDataRevision(
  revision,
  fetchedAt
) {
  try {
    sessionStorage.setItem(
      DATA_REVISION_SESSION_KEY,
      JSON.stringify({
        revision:
          revision,

        fetchedAt:
          fetchedAt
      })
    );

  } catch (error) {
    console.warn(
      "Data revision cache write failed:",
      error
    );
  }
}


function getCurrentDataRevision() {
  const now =
    Date.now();

  if (
    dataRevisionPromise &&
    now -
      dataRevisionPromiseFetchedAt <=
      DATA_REVISION_TTL_MS
  ) {
    return dataRevisionPromise;
  }

  dataRevisionPromise =
    null;

  dataRevisionPromiseFetchedAt =
    0;

  const stored =
    readStoredDataRevision();

  if (stored) {
    dataRevisionPromiseFetchedAt =
      stored.fetchedAt;

    dataRevisionPromise =
      Promise.resolve(
        stored.revision
      );

    return dataRevisionPromise;
  }

  dataRevisionPromiseFetchedAt =
    now;

  let revisionRequest = null;

  revisionRequest =
    requestWithRetry(
      "revision",
      {},
      {
        timeoutMs:
          8000,

        retryCount:
          0
      }
    )
      .then(response => {
        const revision =
          String(
            response?.data
              ?.dataRevision ||
            ""
          ).trim();

        if (!revision) {
          throw new Error(
            "データRevisionを取得できませんでした。"
          );
        }

        const fetchedAt =
          Date.now();

        rememberDataRevision(
          revision,
          fetchedAt
        );

        return revision;
      })
      .catch(error => {
        if (
          dataRevisionPromise ===
          revisionRequest
        ) {
          dataRevisionPromise =
            null;

          dataRevisionPromiseFetchedAt =
            0;
        }

        throw error;
      });

  dataRevisionPromise =
    revisionRequest;

  return dataRevisionPromise;
}


function cacheNetworkResponse(
  action,
  params,
  response,
  cacheEnabled
) {
  const responseRevision =
    getResponseDataRevision(
      response
    );

  if (
    cacheEnabled &&
    responseRevision
  ) {
    writeCaches(
      action,
      params,
      response,
      responseRevision
    );
  }

  return responseRevision;
}


function startBackgroundRevisionRefresh(
  action,
  params,
  options,
  ttlMs
) {
  const backgroundKey =
    createCacheKey(
      "background:",
      "revision-validation",
      action,
      params
    );

  if (
    backgroundRefreshes.has(
      backgroundKey
    )
  ) {
    return backgroundRefreshes.get(
      backgroundKey
    );
  }

  const promise =
    getCurrentDataRevision()
      .then(currentRevision => {
        const currentCache =
          readBestCache(
            action,
            params,
            currentRevision
          );

        const currentCacheAge =
          currentCache
            ? Date.now() -
              Number(
                currentCache.savedAt ||
                0
              )
            : Infinity;

        if (
          currentCache &&
          currentCacheAge <=
            ttlMs
        ) {
          return null;
        }

        return requestWithRetry(
          action,
          params,
          options
        )
          .then(response => {
            const responseRevision =
              cacheNetworkResponse(
                action,
                params,
                response,
                true
              );

            if (!responseRevision) {
              throw new Error(
                "APIレスポンスのRevisionを確認できないため、バックグラウンドキャッシュを保存しませんでした。"
              );
            }

            return response;
          });
      })
      .finally(() => {
        backgroundRefreshes.delete(
          backgroundKey
        );
      });

  backgroundRefreshes.set(
    backgroundKey,
    promise
  );

  return promise;
}


function requestWithoutRevisionBlock(
  action,
  params,
  options,
  cacheEnabled
) {
  const requestKey =
    createCacheKey(
      "request:",
      "revision-pending",
      action,
      params
    );

  if (
    inFlightRequests.has(
      requestKey
    )
  ) {
    return inFlightRequests.get(
      requestKey
    );
  }

  let validatedRevision = "";

  getCurrentDataRevision()
    .then(revision => {
      validatedRevision =
        revision;
    })
    .catch(error => {
      console.warn(
        "Data revision check failed; the main API response remains available:",
        error
      );
    });

  const promise =
    requestWithRetry(
      action,
      params,
      options
    )
      .then(response => {
        const responseRevision =
          cacheNetworkResponse(
            action,
            params,
            response,
            cacheEnabled
          );

        if (
          responseRevision &&
          (
            !validatedRevision ||
            responseRevision ===
              validatedRevision
          )
        ) {
          rememberDataRevision(
            responseRevision
          );
        }

        if (
          cacheEnabled &&
          !responseRevision
        ) {
          console.warn(
            "API response revision unavailable; response was not cached:",
            action
          );
        }

        return {
          ...response,

          cache: {
            source:
              "network",

            stale:
              false,

            revision:
              responseRevision ||
              null,

            ageMs:
              0
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

  const revisionAware =
    normalizedAction !==
      "revision" &&
    normalizedAction !==
      "gapV2";

  const cacheEnabled =
    options.cache !== false &&
    normalizedAction !==
      "revision";

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
      DEFAULT_PROVISIONAL_STALE_TTL_MS
    );

  const storedRevision =
    revisionAware
      ? readStoredDataRevision({
          allowExpired:
            true
        })
      : null;

  const canUseNonBlockingRevision =
    revisionAware &&
    cacheEnabled &&
    !forceRefresh;

  if (
    canUseNonBlockingRevision &&
    (
      !storedRevision ||
      storedRevision.expired
    )
  ) {
    const provisionalCache =
      readBestFallbackCache(
        normalizedAction,
        params
      );

    const provisionalCacheAge =
      provisionalCache
        ? Date.now() -
          Number(
            provisionalCache.savedAt ||
            0
          )
        : Infinity;

    const provisionalCacheIsUsable =
      Boolean(
        provisionalCache &&
        provisionalCacheAge <=
          staleTtlMs
      );

    if (provisionalCacheIsUsable) {
      startBackgroundRevisionRefresh(
        normalizedAction,
        params,
        options,
        ttlMs
      )
        .catch(error => {
          console.warn(
            "Background revision refresh failed; provisional cache remains visible:",
            error
          );
        });

      return {
        ...provisionalCache.response,

        cache: {
          source:
            provisionalCache.source,

          stale:
            true,

          provisional:
            true,

          revisionPending:
            true,

          revision:
            provisionalCache.revision ||
            null,

          ageMs:
            provisionalCacheAge,

          staleTtlMs:
            staleTtlMs
        }
      };
    }

    return requestWithoutRevisionBlock(
      normalizedAction,
      params,
      options,
      cacheEnabled
    );
  }

  let dataRevision =
    storedRevision &&
    !storedRevision.expired
      ? storedRevision.revision
      : "";

  if (
    revisionAware &&
    !dataRevision
  ) {
    try {
      dataRevision =
        await getCurrentDataRevision();

    } catch (error) {
      console.warn(
        "Data revision check failed; using network-first mode:",
        error
      );
    }
  }

  const cached =
    cacheEnabled &&
    dataRevision
      ? readBestCache(
          normalizedAction,
          params,
          dataRevision
        )
      : null;

  const fallbackCached =
    cacheEnabled
      ? (
          cached ||
          readBestFallbackCache(
            normalizedAction,
            params
          )
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

  const fallbackCacheAge =
    fallbackCached
      ? Date.now() -
        Number(
          fallbackCached.savedAt ||
          0
        )
      : Infinity;

  const fallbackIsUsable =
    Boolean(
      fallbackCached &&
      fallbackCacheAge <=
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

        revision:
          dataRevision,

        ageMs:
          cacheAge
      }
    };
  }

  const requestKey =
    createCacheKey(
      "request:",
      dataRevision ||
        "revision-unavailable",
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
            const responseRevision =
              cacheNetworkResponse(
                normalizedAction,
                params,
                response,
                cacheEnabled
              );

            return {
              ...response,

              cache: {
                source:
                  "network",

                stale:
                  false,

                revision:
                  responseRevision ||
                  null,

                ageMs:
                  0
              }
            };
          })
          .catch(error => {
            if (
              !forceRefresh &&
              fallbackIsUsable
            ) {
              return {
                ...fallbackCached.response,

                cache: {
                  source:
                    fallbackCached.source,

                  stale:
                    true,

                  fallback:
                    true,

                  revisionFallback:
                    true,

                  revision:
                    fallbackCached.revision ||
                    null,

                  ageMs:
                    fallbackCacheAge
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

        revision:
          dataRevision,

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
