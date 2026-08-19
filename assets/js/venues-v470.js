import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.6.2";

import {
  renderCommon
} from "./common.js?v=4.9.1";

renderCommon("venue");

const $ = id =>
  document.getElementById(id);

const el = {
  status: $("status"),
  heroSummary: $("heroSummary"),
  totalVenuesChip: $("totalVenuesChip"),
  prefectureChip: $("prefectureChip"),
  countryChip: $("countryChip"),
  pickupSection: $("pickupSection"),
  pickupGrid: $("pickupGrid"),
  allVenuesSection: $("allVenuesSection"),
  venueSearch: $("venueSearch"),
  allVenueSelect: $("allVenueSelect"),
  scopeFilters: $("scopeFilters"),
  prefectureSelect: $("prefectureSelect"),
  countrySelect: $("countrySelect"),
  venueSort: $("venueSort"),
  resultText: $("resultText"),
  venuesList: $("venuesList"),
  moreButton: $("moreButton")
};

let allVenues = [];
let selectedScope = "";
let visibleLimit = 24;

const params =
  new URLSearchParams(
    location.search
  );


function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
}


function isJapan(item) {
  const country =
    String(
      item.country || ""
    ).trim();

  return (
    !country ||
    country === "日本" ||
    country === "Japan" ||
    country === "JAPAN"
  );
}


function shortDate(value) {
  return formatDate(value) || "—";
}


function locationLabel(item) {
  return [
    item.prefectureCity,
    item.region,
    item.country ||
      (
        isJapan(item)
          ? "日本"
          : ""
      )
  ]
    .filter(Boolean)
    .filter(
      (value,index,array) =>
        array.indexOf(value) ===
        index
    )
    .join("｜");
}


function renderPickupCard(
  label,
  item,
  value,
  meta
) {
  if (!item?.venueId) {
    return "";
  }

  return `
    <a
      class="venue-pickup-card"
      href="venue.html?id=${encodeURIComponent(item.venueId)}"
    >
      <div class="venue-pickup-label">
        ${escapeHtml(label)}
      </div>

      <div class="venue-pickup-title">
        ${escapeHtml(
          item.venueName ||
          "会場名未設定"
        )}
      </div>

      <div class="venue-pickup-value">
        ${escapeHtml(value)}
      </div>

      <div class="venue-pickup-meta">
        ${escapeHtml(meta)}
      </div>
    </a>
  `;
}


function renderPickup(data) {
  const pickup =
    data.pickup || {};

  const cards = [
    renderPickupCard(
      "MOST EVENTS",
      pickup.mostUsed,
      `${Number(
        pickup.mostUsed?.eventCount || 0
      ).toLocaleString("ja-JP")}イベント`,
      "最も多く歌唱イベント記録がある会場"
    ),

    renderPickupCard(
      "FIRST VENUE",
      pickup.firstVenue,
      shortDate(
        pickup.firstVenue?.firstDate
      ),
      "記録上、最初にμ's楽曲が歌われた会場"
    ),

    renderPickupCard(
      "LATEST VENUE",
      pickup.latestVenue,
      shortDate(
        pickup.latestVenue?.latestDate
      ),
      "最近μ's楽曲が歌われた会場"
    )
  ].filter(Boolean);

  el.pickupGrid.innerHTML =
    cards.join("");

  el.pickupSection.hidden =
    !cards.length;
}


function populateSelect(
  select,
  values,
  label
) {
  select.innerHTML =
    [
      `<option value="">${escapeHtml(label)}</option>`,
      ...(values || []).map(
        value =>
          `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    ].join("");
}


function populateAllVenueSelect() {
  if (!el.allVenueSelect) return;

  const sorted = allVenues
    .slice()
    .sort((a,b) =>
      String(a.venueId || "").localeCompare(
        String(b.venueId || ""),
        "ja",
        { numeric:true }
      )
    );

  el.allVenueSelect.innerHTML = [
    `<option value="">会場を選択してください（全${sorted.length.toLocaleString("ja-JP")}会場）</option>`,
    ...sorted.map(item => {
      const name = item.venueName || "会場名未設定";
      return `<option value="${escapeHtml(item.venueId)}">${escapeHtml(name)}</option>`;
    })
  ].join("");
}


function applyInitialState() {
  const q =
    String(
      params.get("q") || ""
    ).trim();

  const scope =
    String(
      params.get("scope") || ""
    ).trim();

  const prefecture =
    String(
      params.get("prefecture") || ""
    ).trim();

  const country =
    String(
      params.get("country") || ""
    ).trim();

  const sort =
    String(
      params.get("sort") || ""
    ).trim();

  el.venueSearch.value = q;

  if (
    ["japan","overseas"]
      .includes(scope)
  ) {
    selectedScope = scope;

    el.scopeFilters
      .querySelectorAll(
        "[data-scope]"
      )
      .forEach(button =>
        button.classList.toggle(
          "active",
          button.dataset.scope ===
          scope
        )
      );
  }

  if (
    prefecture &&
    [...el.prefectureSelect.options]
      .some(option =>
        option.value ===
        prefecture
      )
  ) {
    el.prefectureSelect.value =
      prefecture;
  }

  if (
    country &&
    [...el.countrySelect.options]
      .some(option =>
        option.value ===
        country
      )
  ) {
    el.countrySelect.value =
      country;
  }

  if (
    sort &&
    [...el.venueSort.options]
      .some(option =>
        option.value ===
        sort
      )
  ) {
    el.venueSort.value =
      sort;
  }
}


function getFilteredVenues() {
  const q =
    normalize(
      el.venueSearch.value
    );

  const prefecture =
    el.prefectureSelect.value;

  const country =
    el.countrySelect.value;

  const filtered =
    allVenues.filter(item => {
      const searchText =
        normalize(
          [
            item.venueName,
            item.prefectureCity,
            item.region,
            item.country
          ].join(" ")
        );

      const queryOK =
        !q ||
        searchText.includes(q);

      const scopeOK =
        !selectedScope ||
        (
          selectedScope === "japan"
            ? isJapan(item)
            : !isJapan(item)
        );

      const prefectureOK =
        !prefecture ||
        item.prefectureCity ===
          prefecture;

      const countryOK =
        !country ||
        item.country ===
          country;

      return (
        queryOK &&
        scopeOK &&
        prefectureOK &&
        countryOK
      );
    });

  const sorted =
    filtered.slice();

  switch (
    el.venueSort.value
  ) {
    case "songs":
      sorted.sort((a,b) =>
        Number(
          b.uniqueSongCount || 0
        ) -
        Number(
          a.uniqueSongCount || 0
        ) ||
        b.eventCount -
        a.eventCount
      );
      break;

    case "recent":
      sorted.sort((a,b) =>
        String(
          b.latestDate || ""
        ).localeCompare(
          String(
            a.latestDate || ""
          )
        ) ||
        b.eventCount -
        a.eventCount
      );
      break;

    case "first":
      sorted.sort((a,b) =>
        String(
          a.firstDate ||
          "9999-99-99"
        ).localeCompare(
          String(
            b.firstDate ||
            "9999-99-99"
          )
        )
      );
      break;

    case "name":
      sorted.sort((a,b) =>
        String(
          a.venueName || ""
        ).localeCompare(
          String(
            b.venueName || ""
          ),
          "ja"
        )
      );
      break;

    case "events":
    default:
      sorted.sort((a,b) =>
        b.eventCount -
        a.eventCount ||
        b.performanceCount -
        a.performanceCount ||
        String(
          a.venueName || ""
        ).localeCompare(
          String(
            b.venueName || ""
          ),
          "ja"
        )
      );
  }

  return sorted;
}


function buildRecordMaps() {
  const byEvents =
    allVenues
      .slice()
      .sort((a,b) =>
        b.eventCount -
        a.eventCount
      );

  const bySongs =
    allVenues
      .slice()
      .sort((a,b) =>
        Number(
          b.uniqueSongCount || 0
        ) -
        Number(
          a.uniqueSongCount || 0
        )
      );

  const firstOverseas =
    allVenues
      .filter(item =>
        !isJapan(item) &&
        item.firstDate
      )
      .slice()
      .sort((a,b) =>
        String(
          a.firstDate
        ).localeCompare(
          String(
            b.firstDate
          )
        )
      )[0];

  return {
    eventRank:
      new Map(
        byEvents.map(
          (item,index) =>
            [
              item.venueId,
              index + 1
            ]
        )
      ),

    songRank:
      new Map(
        bySongs.map(
          (item,index) =>
            [
              item.venueId,
              index + 1
            ]
        )
      ),

    firstOverseasId:
      firstOverseas?.venueId ||
      ""
  };
}


function getRecordTag(
  item,
  maps
) {
  const eventRank =
    maps.eventRank.get(
      item.venueId
    );

  const songRank =
    maps.songRank.get(
      item.venueId
    );

  if (eventRank === 1) {
    return "最多イベント会場";
  }

  if (
    eventRank &&
    eventRank <= 3
  ) {
    return "イベント数 TOP3";
  }

  if (
    songRank &&
    songRank <= 10
  ) {
    return "歌唱曲数 TOP10";
  }

  if (
    maps.firstOverseasId ===
    item.venueId
  ) {
    return "初の海外会場";
  }

  return "";
}


function renderVenues() {
  const items =
    getFilteredVenues();

  const visible =
    items.slice(
      0,
      visibleLimit
    );

  const maps =
    buildRecordMaps();

  el.resultText.textContent =
    `${visible.length.toLocaleString("ja-JP")}/${items.length.toLocaleString("ja-JP")}会場表示`;

  el.venuesList.innerHTML =
    visible.length
      ? visible.map(
          (item,index) => {
            const tag =
              getRecordTag(
                item,
                maps
              );

            const location =
              locationLabel(item);

            return `
              <a
                class="venue-list-card"
                href="venue.html?id=${encodeURIComponent(item.venueId)}"
              >
                <div class="venue-list-top">
                  <div class="venue-list-title">
                    ${escapeHtml(
                      item.venueName ||
                      "会場名未設定"
                    )}
                  </div>

                  <span class="venue-list-rank">
                    ${index + 1}
                  </span>
                </div>

                <div class="venue-list-location">
                  ${escapeHtml(
                    location ||
                    "所在地情報なし"
                  )}
                </div>

                <div class="venue-list-stats">
                  <div class="venue-list-stat">
                    <b>
                      ${Number(
                        item.eventCount || 0
                      ).toLocaleString("ja-JP")}回
                    </b>
                    <span>イベント</span>
                  </div>

                  <div class="venue-list-stat">
                    <b>
                      ${Number(
                        item.uniqueSongCount || 0
                      ).toLocaleString("ja-JP")}曲
                    </b>
                    <span>歌唱曲数</span>
                  </div>

                  <div class="venue-list-stat">
                    <b>
                      ${escapeHtml(
                        shortDate(
                          item.latestDate
                        )
                      )}
                    </b>
                    <span>最近</span>
                  </div>
                </div>

                ${
                  tag
                    ? `<span class="venue-record-tag">${escapeHtml(tag)}</span>`
                    : ""
                }
              </a>
            `;
          }
        ).join("")
      : `
        <div class="venues-empty">
          条件に該当する会場はありません。
        </div>
      `;

  el.moreButton.hidden =
    visible.length >=
    items.length;

  if (
    !el.moreButton.hidden
  ) {
    el.moreButton.textContent =
      `もっと見る（残り${(items.length - visible.length).toLocaleString("ja-JP")}会場）`;
  }
}


function syncUrl() {
  const url =
    new URL(location.href);

  const q =
    el.venueSearch.value.trim();

  const prefecture =
    el.prefectureSelect.value;

  const country =
    el.countrySelect.value;

  const sort =
    el.venueSort.value;

  if (q) {
    url.searchParams.set(
      "q",
      q
    );
  } else {
    url.searchParams.delete("q");
  }

  if (selectedScope) {
    url.searchParams.set(
      "scope",
      selectedScope
    );
  } else {
    url.searchParams.delete("scope");
  }

  if (prefecture) {
    url.searchParams.set(
      "prefecture",
      prefecture
    );
  } else {
    url.searchParams.delete(
      "prefecture"
    );
  }

  if (country) {
    url.searchParams.set(
      "country",
      country
    );
  } else {
    url.searchParams.delete(
      "country"
    );
  }

  if (
    sort &&
    sort !== "events"
  ) {
    url.searchParams.set(
      "sort",
      sort
    );
  } else {
    url.searchParams.delete("sort");
  }

  history.replaceState(
    null,
    "",
    url
  );
}


function setupControls() {
  if (el.allVenueSelect) {
    el.allVenueSelect.addEventListener("change", () => {
      const venueId = el.allVenueSelect.value;
      if (!venueId) return;
      location.href = `venue.html?id=${encodeURIComponent(venueId)}`;
    });
  }

  el.scopeFilters
    .querySelectorAll(
      "[data-scope]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          selectedScope =
            button.dataset.scope ||
            "";

          el.scopeFilters
            .querySelectorAll(
              "[data-scope]"
            )
            .forEach(item =>
              item.classList.toggle(
                "active",
                item === button
              )
            );

          visibleLimit = 24;

          syncUrl();
          renderVenues();
        }
      );
    });

  [
    el.venueSearch,
    el.prefectureSelect,
    el.countrySelect,
    el.venueSort
  ].forEach(control => {
    const eventName =
      control ===
      el.venueSearch
        ? "input"
        : "change";

    control.addEventListener(
      eventName,
      () => {
        visibleLimit = 24;

        syncUrl();
        renderVenues();
      }
    );
  });

  el.moreButton
    .addEventListener(
      "click",
      () => {
        visibleLimit += 24;
        renderVenues();
      }
    );
}


async function loadVenues() {
  try {
    const response =
      await apiGet(
        "venueHistory",
        {},
        {
          timeoutMs:30000,
          retryCount:1,
          cache:true,
          cacheTtlMs:300000
        }
      );

    const data =
      response.data || {};

    allVenues =
      Array.isArray(data.venues)
        ? data.venues
        : [];

    if (!allVenues.length) {
      throw new Error(
        "会場一覧を取得できませんでした。"
      );
    }

    populateAllVenueSelect();

    const summary =
      data.summary || {};

    el.totalVenuesChip.textContent =
      `全${Number(
        summary.totalVenues || 0
      ).toLocaleString("ja-JP")}会場`;

    el.prefectureChip.textContent =
      `${Number(
        summary.prefectureCount || 0
      ).toLocaleString("ja-JP")}地域`;

    el.countryChip.textContent =
      `${Number(
        summary.countryCount || 0
      ).toLocaleString("ja-JP")}か国`;

    populateSelect(
      el.prefectureSelect,
      data.prefectures || [],
      "すべて"
    );

    populateSelect(
      el.countrySelect,
      data.countries || [],
      "すべて"
    );

    renderPickup(data);

    applyInitialState();
    setupControls();
    renderVenues();

    el.status.hidden = true;
    el.heroSummary.hidden = false;
    el.allVenuesSection.hidden = false;

  } catch (error) {
    console.error(error);

    el.status.hidden = false;

    el.status.textContent =
      error?.message ||
      "会場データを取得できませんでした。";
  }
}


loadVenues();
