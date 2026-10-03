import { renderCommon } from "./common.js?v=4.9.1&cache=revision-nonblocking";
import { staticMemberAnalytics } from "./static-detail.js";

renderCommon();

const status = document.getElementById("memberAnalyticsStatus");
const content = document.getElementById("memberAnalyticsContent");
const summaryHost = document.getElementById("memberAnalyticsSummary");
const mobileSummaryHost = document.getElementById("memberAnalyticsMobileSummary");
const table = document.getElementById("memberAnalyticsTable");
const mobileSongsHost = document.getElementById("memberAnalyticsMobileSongs");
const filterHost = document.getElementById("memberAnalyticsFilters");
const filterPanel = document.getElementById("memberAnalyticsFilterPanel");
const filterToggle = document.getElementById("memberAnalyticsFilterToggle");
const filterText = document.getElementById("memberAnalyticsFilterText");
const visibleCount = document.getElementById("memberAnalyticsVisibleCount");
const buttons = [...document.querySelectorAll(".member-analytics-switch button")];
const colors = ["var(--h)", "var(--e)", "var(--k)", "var(--u)", "var(--r)", "var(--m)", "var(--n)", "var(--ha)", "var(--ni)"];
const shortNames = {
  character: ["穂乃果", "絵里", "ことり", "海未", "凛", "真姫", "希", "花陽", "にこ"],
  cast: ["新田", "南條", "内田", "三森", "飯田", "Pile", "楠田", "久保", "徳井"]
};
let data;
let orderedSongs;
let filterGroups;
const selectedGroups = new Set();
let mode = new URLSearchParams(location.search).get("mode") === "cast" ? "cast" : "character";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function columnHead(name, fullName, index) {
  const th = element("th", "member-analytics-person-head", name);
  th.style.setProperty("--member-color", colors[index]);
  th.title = fullName;
  th.setAttribute("aria-label", fullName);
  return th;
}

function renderSummary(rows, names) {
  const head = element("thead");
  const header = element("tr");
  header.append(element("th", "member-analytics-metric", "指標"));
  rows.forEach((row, index) => header.append(columnHead(names[index], row.memberName, index)));
  head.append(header);
  const body = element("tbody");
  for (const [label, key, unit] of [["歌唱記録", "performanceCount", "件"], ["歌唱曲", "uniqueSongCount", "曲"], ["出演イベント", "eventCount", "件"]]) {
    const maximum = Math.max(...rows.map(row => row[key]));
    const tr = element("tr");
    tr.append(element("th", "member-analytics-metric", label));
    rows.forEach(row => tr.append(element("td", row[key] === maximum ? "member-analytics-maximum" : "", `${row[key]}${unit}`)));
    body.append(tr);
  }
  summaryHost.replaceChildren(head, body);

  mobileSummaryHost.replaceChildren();
  rows.forEach((row, index) => {
    const item = element("div", "member-analytics-mobile-person");
    item.style.setProperty("--member-color", colors[index]);
    const name = element("strong", "", names[index]);
    name.title = row.memberName;
    item.append(name);
    for (const [key, unit] of [["performanceCount", "件"], ["uniqueSongCount", "曲"], ["eventCount", "イベント"]]) {
      const maximum = Math.max(...rows.map(other => other[key]));
      item.append(element("span", row[key] === maximum ? "member-analytics-maximum" : "", `${row[key]}${unit}`));
    }
    mobileSummaryHost.append(item);
  });
}

function renderTable(fullNames, names, songs, countKey) {
  const head = element("thead");
  const heading = element("tr");
  heading.append(element("th", "member-analytics-song", "曲名"));
  names.forEach((name, index) => heading.append(columnHead(name, fullNames[index], index)));
  head.append(heading);
  const body = element("tbody");
  for (const song of songs) {
    const maximum = Math.max(...song[countKey]);
    const row = element("tr");
    row.dataset.songId = song.songId;
    const title = element("td", "member-analytics-song");
    const link = element("a", "", song.songName);
    link.href = `song.html?id=${encodeURIComponent(song.songId)}`;
    title.append(link);
    row.append(title);
    for (const count of song[countKey]) row.append(element("td", count === 0 ? "member-analytics-zero" : count === maximum ? "member-analytics-maximum" : "", count));
    body.append(row);
  }
  table.replaceChildren(head, body);

  mobileSongsHost.replaceChildren();
  for (const song of songs) {
    const maximum = Math.max(...song[countKey]);
    const article = element("article", "member-analytics-mobile-song");
    article.dataset.songId = song.songId;
    const header = element("div", "member-analytics-mobile-song-head");
    const link = element("a", "", song.songName);
    link.href = `song.html?id=${encodeURIComponent(song.songId)}`;
    header.append(link);
    const grid = element("div", "member-analytics-mobile-counts");
    song[countKey].forEach((count, index) => {
      const cell = element("span", count === 0 ? "member-analytics-zero" : count === maximum ? "member-analytics-maximum" : "");
      cell.title = fullNames[index];
      cell.style.setProperty("--member-color", colors[index]);
      cell.append(element("span", "", names[index]), element("strong", "", count));
      grid.append(cell);
    });
    article.append(header, grid);
    mobileSongsHost.append(article);
  }
}

function prepareGroups(master, songs) {
  const songById = new Map(songs.map(song => [song.songId, song]));
  const seen = new Set();
  const groups = master.groups.slice().sort((a, b) => a.order - b.order).map(group => {
    const assignments = master.assignments.filter(item => item.group === group.id);
    const leaves = assignments.map(item => {
      const subgroup = group.subgroups.find(candidate => candidate.id === item.subgroup);
      if (item.subgroup !== null && !subgroup) throw new Error("Unknown Song subgroup");
      const ids = item.songIds.slice().sort();
      for (const id of ids) {
        if (!songById.has(id) || seen.has(id)) throw new Error("Invalid Song group assignment");
        seen.add(id);
      }
      return { key: item.subgroup === null ? group.id : `${group.id}:${item.subgroup}`, subgroup, ids, order: subgroup?.order ?? 0 };
    }).filter(item => item.ids.length).sort((a, b) => a.order - b.order);
    return { ...group, leaves, ids: leaves.flatMap(item => item.ids) };
  }).filter(group => group.ids.length);
  if (seen.size !== songs.length) throw new Error("Incomplete Song group assignment");
  return { groups, songs: groups.flatMap(group => group.ids.map(id => songById.get(id))) };
}

function filterOption(label, count, groupId, key) {
  const wrapper = element("label", `member-analytics-filter-option${key ? " member-analytics-filter-subgroup" : ""}`);
  const input = element("input");
  input.type = "checkbox";
  input.dataset.group = groupId;
  if (key) input.dataset.key = key;
  wrapper.append(input, element("span", "", label), element("small", "", count));
  return wrapper;
}

function renderFilters() {
  filterHost.replaceChildren();
  const displayRows = [
    ["general", "blu-ray", "game"],
    ["solo", "duo-trio", "unit"]
  ];
  const rows = displayRows.map(() => element("div", "member-analytics-filter-row"));
  for (const group of filterGroups) {
    const row = element("div", "member-analytics-filter-group");
    const label = group.id === "general" ? "TVアニメ・映画・CD・誌面企画・ラジオ系" : group.id === "game" ? "スクフェス／スクパラ曲" : group.label;
    row.append(filterOption(label, group.ids.length, group.id));
    if (group.id === "unit") {
      row.classList.add("member-analytics-filter-unit");
      const children = element("div", "member-analytics-filter-subgroups");
      for (const leaf of group.leaves) children.append(filterOption(leaf.subgroup.label, leaf.ids.length, group.id, leaf.key));
      row.append(children);
    }
    const rowIndex = displayRows.findIndex(ids => ids.includes(group.id));
    if (rowIndex < 0) throw new Error("Unknown Song group display position");
    rows[rowIndex].append(row);
  }
  filterHost.append(...rows);
  updateFilterChecks();
}

function updateFilterChecks() {
  for (const group of filterGroups) {
    const selected = group.leaves.filter(leaf => selectedGroups.has(leaf.key)).length;
    const parent = filterHost.querySelector(`input[data-group="${group.id}"]:not([data-key])`);
    parent.checked = selected === group.leaves.length;
    parent.indeterminate = selected > 0 && selected < group.leaves.length;
    for (const leaf of group.leaves) {
      const child = filterHost.querySelector(`input[data-key="${leaf.key}"]`);
      if (child) child.checked = selectedGroups.has(leaf.key);
    }
  }
}

function setFilterOpen(open) {
  filterPanel.hidden = !open;
  filterToggle.setAttribute("aria-expanded", String(open));
  if (open) filterPanel.scrollIntoView({ block: "nearest" });
}

filterToggle.addEventListener("click", () => setFilterOpen(filterPanel.hidden));
document.addEventListener("pointerdown", event => {
  if (!filterPanel.hidden && !event.target.closest(".member-analytics-filters")) setFilterOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !filterPanel.hidden) {
    setFilterOpen(false);
    filterToggle.focus();
  }
});

filterPanel.querySelector(".member-analytics-filter-actions").addEventListener("click", event => {
  const action = event.target.dataset.action;
  if (action === "all") for (const group of filterGroups) for (const leaf of group.leaves) selectedGroups.add(leaf.key);
  else if (action === "clear") selectedGroups.clear();
  else return;
  updateFilterChecks();
  render();
});

filterHost.addEventListener("change", event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
  const group = filterGroups.find(item => item.id === input.dataset.group);
  const leaves = input.dataset.key ? group.leaves.filter(leaf => leaf.key === input.dataset.key) : group.leaves;
  for (const leaf of leaves) {
    if (input.checked) selectedGroups.add(leaf.key);
    else selectedGroups.delete(leaf.key);
  }
  updateFilterChecks();
  render();
});

function render() {
  if (!data || !orderedSongs) return;
  const character = mode === "character";
  buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  const names = shortNames[mode];
  renderSummary(data[character ? "characterSummary" : "castSummary"], names);
  const songs = selectedGroups.size ? orderedSongs.filter(song => filterGroups.some(group => group.leaves.some(leaf => selectedGroups.has(leaf.key) && leaf.ids.includes(song.songId)))) : orderedSongs;
  visibleCount.textContent = `${songs.length} / ${orderedSongs.length}曲`;
  const selectedGroupCount = filterGroups.filter(group => group.leaves.some(leaf => selectedGroups.has(leaf.key))).length;
  filterText.textContent = selectedGroupCount ? `${selectedGroupCount}グループを選択中` : "すべての曲グループ";
  renderTable(data[character ? "characterMembers" : "castMembers"], names, songs,
    character ? "characterCounts" : "castCounts");
  status.hidden = true;
  content.hidden = false;
}

buttons.forEach(button => button.addEventListener("click", () => {
  if (mode === button.dataset.mode) return;
  mode = button.dataset.mode;
  const url = new URL(location.href);
  url.searchParams.set("mode", mode);
  history.replaceState(null, "", url);
  render();
}));

Promise.all([staticMemberAnalytics(), fetch("data/song-view-groups.json").then(response => {
  if (!response.ok) throw new Error("Song view groups unavailable");
  return response.json();
})]).then(([result, master]) => {
  data = result.data;
  ({ groups: filterGroups, songs: orderedSongs } = prepareGroups(master, data.songs));
  renderFilters();
  render();
}).catch(() => {
  status.textContent = "集計データを読み込めませんでした。時間をおいて再読み込みしてください。";
});
