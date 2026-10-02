import {
  apiGet,
  escapeHtml,
  formatDate
} from "./api.js?v=4.9.6&cache=revision-nonblocking";

import {
  renderCommon
} from "./common.js?v=4.9.1&cache=revision-nonblocking";

import {
  buildSingerUrl
} from "./singer-links.js?v=4.8.0";

renderCommon("singer");

const $ = id =>
  document.getElementById(id);

const el = {
  status: $("status"),
  heroSummary: $("heroSummary"),
  totalChip: $("totalChip"),
  officialChip: $("officialChip"),
  soloChip: $("soloChip"),
  scopeSection: $("scopeSection"),
  scopeButtons: $("scopeButtons"),
  membersSection: $("membersSection"),
  musLink: $("musLink"),
  majorMembers: $("majorMembers"),
  listSection: $("listSection"),
  nameSearch: $("nameSearch"),
  countFilters: $("countFilters"),
  memberFilterLabel: $("memberFilterLabel"),
  memberFilters: $("memberFilters"),
  resultText: $("resultText"),
  singerSort: $("singerSort"),
  singersList: $("singersList"),
  moreButton: $("moreButton")
};

let data = {
  official: [],
  solo: [],
  memberFilters: {
    official: [],
    solo: []
  }
};

let scope = "official";
let memberCount = "";
let selectedMember = "";
let visibleLimit = 24;

const params =
  new URLSearchParams(location.search);


function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");
}


function shortDate(value) {
  return formatDate(value) || "—";
}


function scopeItems() {
  return scope === "solo"
    ? data.solo
    : data.official;
}


function colorLine(members, className) {
  const spans =
    (members || [])
      .map(member =>
        `<span style="background:${escapeHtml(member.color || "#c9c9d5")}"></span>`
      )
      .join("");

  return spans
    ? `<div class="${className}">${spans}</div>`
    : "";
}


function memberCountLabel(count) {
  const n = Number(count || 0);

  if (n === 1) return "1人";
  if (n === 2) return "DUO";
  if (n === 3) return "TRIO";
  if (n === 9) return "9人";
  if (n >= 4 && n <= 8) return `${n}人`;

  return "人数不明";
}


function buildCountFilters() {
  const options = [
    ["", "すべて"],
    ["1", "1人"],
    ["2", "デュオ"],
    ["3", "トリオ"],
    ["4-8", "4〜8人"],
    ["9", "9人"]
  ];

  el.countFilters.innerHTML =
    options.map(([value,label]) => `
      <button
        class="singers-pill ${memberCount === value ? "active" : ""}"
        type="button"
        data-count="${escapeHtml(value)}"
      >${escapeHtml(label)}</button>
    `).join("");

  el.countFilters
    .querySelectorAll("[data-count]")
    .forEach(button => {
      button.addEventListener("click", () => {
        memberCount =
          button.dataset.count || "";

        visibleLimit = 24;
        buildCountFilters();
        syncUrl();
        renderList();
      });
    });
}


function buildMemberFilters() {
  const items =
    data.memberFilters?.[scope] || [];

  el.memberFilterLabel.textContent =
    scope === "official"
      ? "含まれるキャラクターで絞る"
      : "含まれるキャストで絞る";

  el.memberFilters.innerHTML = [
    `<button
      class="singers-pill ${!selectedMember ? "active" : ""}"
      type="button"
      data-member=""
    >すべて</button>`,

    ...items.map(item => `
      <button
        class="singers-pill member-pill ${selectedMember === item.key ? "active" : ""}"
        type="button"
        data-member="${escapeHtml(item.key)}"
      >
        <span
          class="member-dot"
          style="background:${escapeHtml(item.color || "#bbb")}"
        ></span>
        ${escapeHtml(item.label)}
      </button>
    `)
  ].join("");

  el.memberFilters
    .querySelectorAll("[data-member]")
    .forEach(button => {
      button.addEventListener("click", () => {
        selectedMember =
          button.dataset.member || "";

        visibleLimit = 24;
        buildMemberFilters();
        syncUrl();
        renderList();
      });
    });
}


function filteredItems() {
  const q =
    normalize(el.nameSearch.value);

  const items =
    scopeItems().filter(item => {
      const queryOK =
        !q ||
        normalize(
          [
            item.displayName,
            item.rawName,
            ...(item.members || []).map(member => member.label)
          ].join(" ")
        ).includes(q);

      const count =
        Number(item.memberCount || 0);

      let countOK = true;

      if (memberCount === "1") {
        countOK = count === 1;
      } else if (memberCount === "2") {
        countOK = count === 2;
      } else if (memberCount === "3") {
        countOK = count === 3;
      } else if (memberCount === "4-8") {
        countOK = count >= 4 && count <= 8;
      } else if (memberCount === "9") {
        countOK = count === 9;
      }

      const memberOK =
        !selectedMember ||
        (item.memberShorts || [])
          .includes(selectedMember);

      return (
        queryOK &&
        countOK &&
        memberOK
      );
    });

  const sorted =
    items.slice();

  switch (el.singerSort.value) {
    case "composition":
      {
        const order = new Map(
          (data.memberFilters?.official || [])
            .map((member, index) => [member.key, index])
        );
        const memberOrder = item =>
          (item.memberShorts || item.members?.map(member => member.key) || [])
            .map(key => order.get(key) ?? Number.MAX_SAFE_INTEGER)
            .sort((a,b) => a - b);
        sorted.sort((a,b) => {
          const countDifference =
            Number(a.memberCount || 0) - Number(b.memberCount || 0);
          if (countDifference) return countDifference;
          const left = memberOrder(a);
          const right = memberOrder(b);
          for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
            const difference = (left[index] ?? Number.MAX_SAFE_INTEGER) -
              (right[index] ?? Number.MAX_SAFE_INTEGER);
            if (difference) return difference;
          }
          return String(a.displayName || "")
            .localeCompare(String(b.displayName || ""), "ja");
        });
      }
      break;

    case "songs":
      sorted.sort((a,b) =>
        Number(b.songCount || 0) -
        Number(a.songCount || 0) ||
        Number(b.performanceCount || 0) -
        Number(a.performanceCount || 0)
      );
      break;

    case "recent":
      sorted.sort((a,b) =>
        String(b.latestDate || "")
          .localeCompare(String(a.latestDate || "")) ||
        Number(b.performanceCount || 0) -
        Number(a.performanceCount || 0)
      );
      break;

    case "first":
      sorted.sort((a,b) =>
        String(a.firstDate || "9999-99-99")
          .localeCompare(String(b.firstDate || "9999-99-99"))
      );
      break;

    case "name":
      sorted.sort((a,b) =>
        String(a.displayName || "")
          .localeCompare(String(b.displayName || ""), "ja")
      );
      break;

    case "performance":
    default:
      sorted.sort((a,b) =>
        Number(b.performanceCount || 0) -
        Number(a.performanceCount || 0) ||
        Number(b.songCount || 0) -
        Number(a.songCount || 0)
      );
  }

  return sorted;
}


function renderMajorMembers() {
  const matchMembers = mode => {
    const filters = data.memberFilters?.[mode] || [];
    const items = mode === "solo" ? data.solo : data.official;
    if (filters.length !== 9) return null;
    const matches = filters.map(filter => {
      const found = items.filter(item =>
        Number(item.memberCount) === 1 &&
        item.singerId &&
        item.members?.length === 1 &&
        item.members[0].key === filter.key &&
        item.members[0].label === filter.label
      );
      return found.length === 1 ? { filter, item: found[0] } : null;
    });
    return matches.every(Boolean) ? matches : null;
  };
  const characters = matchMembers("official");
  const casts = matchMembers("solo");
  if (!characters || !casts) {
    el.membersSection.hidden = true;
    console.warn("主要メンバーの単体歌唱名義を一意に特定できませんでした。");
    return;
  }
  const castByKey = new Map(casts.map(match => [match.filter.key, match]));
  if (castByKey.size !== 9 || characters.some(({ filter }) => !castByKey.has(filter.key))) {
    el.membersSection.hidden = true;
    console.warn("キャラクターとキャストの対応を一意に特定できませんでした。");
    return;
  }
  el.majorMembers.innerHTML = characters.map(({ filter, item }) => {
    const cast = castByKey.get(filter.key);
    return `
      <div class="singers-member-card"
        style="--member-color:${escapeHtml(filter.color || "#dfdced")}">
        <a class="singers-member-link" href="${buildSingerUrl(item)}">${escapeHtml(filter.label)}</a>
        <span class="singers-member-divider" aria-hidden="true">｜</span>
        <a class="singers-member-link" href="${buildSingerUrl(cast.item)}">${escapeHtml(cast.filter.label)}</a>
      </div>
    `;
  }).join("");

  const keys = new Set(characters.map(({ filter }) => filter.key));
  const mus = data.official.filter(item =>
    item.singerId && item.displayName === "μ's" &&
    Number(item.memberCount) === 9 &&
    item.members?.length === 9 &&
    item.members.every(member => keys.has(member.key))
  );
  if (mus.length === 1) {
    el.musLink.href = buildSingerUrl(mus[0]);
    el.musLink.hidden = false;
  } else {
    el.musLink.hidden = true;
  }
  el.membersSection.hidden = false;
}


function buildRecordMaps() {
  const items =
    scopeItems();

  const performance =
    items.slice()
      .sort((a,b) =>
        Number(b.performanceCount || 0) -
        Number(a.performanceCount || 0)
      );

  const duo =
    items.filter(item =>
      Number(item.memberCount || 0) === 2
    ).sort((a,b) =>
      Number(b.performanceCount || 0) -
      Number(a.performanceCount || 0)
    );

  const trio =
    items.filter(item =>
      Number(item.memberCount || 0) === 3
    ).sort((a,b) =>
      Number(b.performanceCount || 0) -
      Number(a.performanceCount || 0)
    );

  return {
    top:
      performance[0]?.key || "",

    duo:
      duo[0]?.key || "",

    trio:
      trio[0]?.key || ""
  };
}


function recordTag(item, maps) {
  if (item.key === maps.top) {
    return "最多歌唱名義";
  }

  if (item.key === maps.duo) {
    return "最多歌唱デュオ";
  }

  if (item.key === maps.trio) {
    return "最多歌唱トリオ";
  }

  return "";
}


function renderList() {
  const items =
    filteredItems();

  const visible =
    items.slice(0, visibleLimit);

  const maps =
    buildRecordMaps();

  el.resultText.textContent =
    `${visible.length.toLocaleString("ja-JP")}/${items.length.toLocaleString("ja-JP")}名義表示`;

  el.singersList.innerHTML =
    visible.length
      ? visible.map((item,index) => {
          const href =
            buildSingerUrl(item);

          const tag =
            recordTag(item, maps);

          return `
            <a class="singer-list-card" href="${href}">
              ${colorLine(item.members, "singer-card-colors")}

              <div class="singer-card-top">
                <div class="singer-card-badges">
                  <span class="singer-card-badge scope">
                    ${escapeHtml(item.category)}
                  </span>

                  <span class="singer-card-badge">
                    ${escapeHtml(memberCountLabel(item.memberCount))}
                  </span>
                </div>

                <span class="singer-card-badge">
                  ${index + 1}
                </span>
              </div>

              <div class="singer-card-title">
                ${escapeHtml(item.displayName)}
              </div>

              ${
                item.members?.length
                  ? `<div class="singer-card-member-list">${escapeHtml(
                      item.members.map(member => member.label).join(" / ")
                    )}</div>`
                  : ""
              }

              <div class="singer-card-stats">
                <div class="singer-card-stat">
                  <b>${Number(item.performanceCount || 0).toLocaleString("ja-JP")}回</b>
                  <span>歌唱記録</span>
                </div>

                <div class="singer-card-stat">
                  <b>${Number(item.songCount || 0).toLocaleString("ja-JP")}曲</b>
                  <span>歌唱曲</span>
                </div>

                <div class="singer-card-stat">
                  <b>${escapeHtml(shortDate(item.latestDate))}</b>
                  <span>最近</span>
                </div>
              </div>

              ${
                tag
                  ? `<span class="singer-record-tag">${escapeHtml(tag)}</span>`
                  : ""
              }
            </a>
          `;
        }).join("")
      : `
        <div class="singers-empty">
          条件に該当する歌唱名義はありません。
        </div>
      `;

  el.moreButton.hidden =
    visible.length >= items.length;

  if (!el.moreButton.hidden) {
    el.moreButton.textContent =
      `もっと見る（残り${(items.length - visible.length).toLocaleString("ja-JP")}名義）`;
  }
}


function updateScopeUI(resetFilters = true) {
  el.scopeButtons
    .querySelectorAll("[data-scope]")
    .forEach(button => {
      const active = button.dataset.scope === scope;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

  if (resetFilters) {
    memberCount = "";
    selectedMember = "";
    visibleLimit = 24;
  }

  buildCountFilters();
  buildMemberFilters();
  renderList();
}


function syncUrl() {
  const url =
    new URL(location.href);

  url.searchParams.set(
    "scope",
    scope
  );

  const q =
    el.nameSearch.value.trim();

  if (q) {
    url.searchParams.set("q", q);
  } else {
    url.searchParams.delete("q");
  }

  if (memberCount) {
    url.searchParams.set(
      "count",
      memberCount
    );
  } else {
    url.searchParams.delete("count");
  }

  if (selectedMember) {
    url.searchParams.set(
      "member",
      selectedMember
    );
  } else {
    url.searchParams.delete("member");
  }

  if (
    el.singerSort.value !==
    "composition"
  ) {
    url.searchParams.set(
      "sort",
      el.singerSort.value
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


function applyInitialState() {
  const requestedScope =
    String(params.get("scope") || "")
      .trim();

  if (
    ["official","solo"]
      .includes(requestedScope)
  ) {
    scope = requestedScope;
  }

  el.nameSearch.value =
    String(params.get("q") || "");

  memberCount =
    String(params.get("count") || "");

  selectedMember =
    String(params.get("member") || "");

  const sort =
    String(params.get("sort") || "");

  if (
    sort &&
    [...el.singerSort.options]
      .some(option =>
        option.value === sort
      )
  ) {
    el.singerSort.value = sort;
  }
}


function setupControls() {
  el.scopeButtons
    .querySelectorAll("[data-scope]")
    .forEach(button => {
      button.addEventListener("click", () => {
        scope =
          button.dataset.scope ||
          "official";

        updateScopeUI();
        syncUrl();
      });
    });

  el.nameSearch.addEventListener("input", () => {
    visibleLimit = 24;
    syncUrl();
    renderList();
  });

  el.singerSort.addEventListener("change", () => {
    visibleLimit = 24;
    syncUrl();
    renderList();
  });

  el.moreButton.addEventListener("click", () => {
    visibleLimit += 24;
    renderList();
  });
}


async function loadSingers() {
  try {
    const response =
      await apiGet(
        "singerList",
        {},
        {
          timeoutMs:30000,
          retryCount:1,
          cache:true,
          cacheTtlMs:300000
        }
      );

    const result =
      response.data || {};

    data = {
      official:
        Array.isArray(result.official)
          ? result.official
          : [],

      solo:
        Array.isArray(result.solo)
          ? result.solo
          : [],

      memberFilters:
        result.memberFilters || {
          official: [],
          solo: []
        }
    };

    const summary =
      result.summary || {};

    el.totalChip.textContent =
      `全${Number(summary.total || 0).toLocaleString("ja-JP")}名義`;

    el.officialChip.textContent =
      `公式 ${Number(summary.official || 0).toLocaleString("ja-JP")}名義`;

    el.soloChip.textContent =
      `ソロ ${Number(summary.solo || 0).toLocaleString("ja-JP")}名義`;

    applyInitialState();
    setupControls();

    el.status.hidden = true;
    el.heroSummary.hidden = false;
    el.scopeSection.hidden = false;
    el.listSection.hidden = false;

    renderMajorMembers();
    updateScopeUI(false);

  } catch (error) {
    console.error(error);

    el.status.hidden = false;
    el.status.textContent =
      error?.message ||
      "歌唱名義データを取得できませんでした。";
  }
}


loadSingers();
