// Song ID assignments and interaction pattern shared with Member Analytics.
import { songUnitMembership } from "./song-unit-memberships.js?v=1.0.0";

export function loadSongGroupMemberships() {
  return fetch("data/song-unit-memberships.json", { cache: "no-cache", signal: AbortSignal.timeout(3000) }).then(response => {
    if (!response.ok) throw new Error("ユニット所属情報を取得できませんでした。");
    return response.json();
  });
}

export function prepareSongViewGroups(master, songs, memberships) {
  // Validate the original assignment first: projection must not conceal duplicates.
  buildSongViewGroups(master, songs);
  if (!Array.isArray(memberships?.memberships) || memberships.memberships.length !== 31) throw new Error("ユニット所属情報が不正です。");
  const byId = new Set(songs.map(song => song.songId));
  const projected = { ...master, assignments: master.assignments.map(item => ({ ...item, songIds: item.songIds.slice() })) };
  const subgroupIds = { printemps: "printemps", lily_white: "lily-white", bibi: "bibi" };
  for (const row of memberships.memberships) {
    const membership = songUnitMembership(memberships, row.songId);
    if (!membership || !byId.has(row.songId)) throw new Error("ユニット所属のSong IDが不正です。");
    const target = projected.assignments.find(item => item.group === "unit" && item.subgroup === subgroupIds[membership.unitKey]);
    if (!target) throw new Error("ユニット曲の内訳が不正です。");
    for (const item of projected.assignments) item.songIds = item.songIds.filter(id => id !== row.songId);
    target.songIds.push(row.songId);
  }
  // Membership wins over browsing media/category, without rewriting either source.
  return buildSongViewGroups(projected, songs);
}

function buildSongViewGroups(master, songs) {
  const byId = new Map(songs.map(song => [song.songId, song]));
  const seen = new Set();
  const groups = master.groups.slice().sort((a, b) => a.order - b.order).map(group => {
    const leaves = master.assignments.filter(item => item.group === group.id).map(item => {
      const subgroup = group.subgroups.find(candidate => candidate.id === item.subgroup);
      if (item.subgroup !== null && !subgroup) throw new Error("曲グループの内訳が不正です。");
      const ids = item.songIds.slice().sort();
      for (const id of ids) {
        if (!byId.has(id) || seen.has(id)) throw new Error("曲グループのSong IDが不正です。");
        seen.add(id);
      }
      return { key: item.subgroup === null ? group.id : `${group.id}:${item.subgroup}`, subgroup, ids, order: subgroup?.order ?? 0 };
    }).filter(leaf => leaf.ids.length).sort((a, b) => a.order - b.order);
    return { ...group, leaves, ids: leaves.flatMap(leaf => leaf.ids) };
  }).filter(group => group.ids.length);
  if (seen.size !== songs.length) throw new Error("曲グループに未割当の曲があります。");
  return groups;
}

export function createSongViewGroupFilter(root, groups, onChange) {
  const selected = new Set();
  const toggle = root.querySelector(".song-group-toggle");
  const text = toggle.querySelector(".song-group-text");
  const panel = root.querySelector(".song-group-panel");
  const host = root.querySelector(".song-group-list");
  const make = (tag, className, value) => {
    const node = document.createElement(tag);
    node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  function option(label, count, groupId, key) {
    const wrapper = make("label", `song-group-option${key ? " song-group-subgroup" : ""}`);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.group = groupId;
    if (key) input.dataset.key = key;
    const labelText = make("span", "");
    const parts = label.split("・");
    parts.forEach((part, index) => labelText.append(make("span", "song-group-label-part", part + (index < parts.length - 1 ? "・" : ""))));
    wrapper.append(input, labelText, make("small", "", count));
    return wrapper;
  }
  for (const rowIds of [["general", "blu-ray", "game"], ["solo", "duo-trio", "unit"]]) {
    const row = make("div", "song-group-row");
    for (const id of rowIds) {
      const group = groups.find(group => group.id === id);
      if (!group) continue;
      const box = make("div", "song-group-group");
      const label = id === "general" ? "TVアニメ・映画・CD・誌面企画・ラジオ系" : id === "game" ? "スクフェス／スクパラ曲" : group.label;
      box.append(option(label, group.ids.length, id));
      if (id === "unit") {
        box.classList.add("song-group-unit");
        const children = make("div", "song-group-subgroups");
        for (const leaf of group.leaves) children.append(option(leaf.subgroup.label, leaf.ids.length, id, leaf.key));
        box.append(children);
      }
      row.append(box);
    }
    host.append(row);
  }
  function update() {
    let count = 0;
    for (const group of groups) {
      const active = group.leaves.filter(leaf => selected.has(leaf.key)).length;
      if (active) count++;
      const parent = host.querySelector(`input[data-group="${group.id}"]:not([data-key])`);
      parent.checked = active === group.leaves.length;
      parent.indeterminate = active > 0 && active < group.leaves.length;
      for (const leaf of group.leaves) {
        const child = host.querySelector(`input[data-key="${leaf.key}"]`);
        if (child) child.checked = selected.has(leaf.key);
      }
    }
    text.textContent = count ? `${count}グループを選択中` : "すべての曲グループ";
  }
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("pointerdown", event => { if (!root.contains(event.target)) setOpen(false); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) { setOpen(false); toggle.focus(); }
  });
  host.addEventListener("change", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const group = groups.find(group => group.id === input.dataset.group);
    for (const leaf of group.leaves.filter(leaf => !input.dataset.key || leaf.key === input.dataset.key)) {
      if (input.checked) selected.add(leaf.key); else selected.delete(leaf.key);
    }
    update(); onChange();
  });
  root.querySelector(".song-group-actions").addEventListener("click", event => {
    const action = event.target.closest("button")?.dataset.action;
    if (action === "all") for (const group of groups) for (const leaf of group.leaves) selected.add(leaf.key);
    else if (action === "clear") selected.clear();
    else return;
    update(); onChange();
  });
  update();
  return {
    get active() { return selected.size > 0; },
    get ids() { return groups.flatMap(group => group.leaves.filter(leaf => !selected.size || selected.has(leaf.key)).flatMap(leaf => leaf.ids)); }
  };
}
