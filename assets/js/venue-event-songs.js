import { singerDisplayName } from "./singer-display.js?v=1.0.0";
import { apiGet, escapeHtml, buildSongUrl } from "./api.js?v=4.9.6&cache=revision-nonblocking&songUrls=1";
import { staticEventDetail } from "./static-detail.js?v=1.3.0";

export function titleWithChevron(text) {
  const chars = Array.from(String(text));
  return `${escapeHtml(chars.slice(0, -2).join(""))}<span class="mus-title-tail">${escapeHtml(chars.slice(-2).join(""))}<span class="site-icon-inline mus-link-chevron" data-site-icon="chevron-right" aria-hidden="true"></span></span>`;
}

// Sort performance rows, never unique Songs. Equal positions retain source order.
export function orderedEventSongs(event) {
  const rows = event.songs;
  const positive = value => Number.isInteger(value) && value > 0;
  const absolute = rows.length > 0 && event.songOrderIsSetlist === true && rows.every(s => positive(s.setlistPosition) && s.relativePosition == null);
  const relative = rows.length > 0 && event.songOrderIsSetlist === false && rows.every(s => positive(s.relativePosition) && s.setlistPosition == null);
  const mode = absolute ? "absolute" : relative ? "relative" : "registered";
  const key = absolute ? "setlistPosition" : "relativePosition";
  return { mode, rows: absolute || relative ? rows.map((row,index) => ({row,index})).sort((a,b) => a.row[key]-b.row[key] || a.index-b.index).map(x => x.row) : rows.slice() };
}

export function createVenueEventSongs(root) {
  const expanded = new Set(), states = new Map();
  async function fetchEvent(id) {
    let event;
    try { event = (await staticEventDetail(id)).data.event; }
    catch { event = (await apiGet("event", {id}, {cache:true,retryCount:0,timeoutMs:30000})).data; }
    if (event?.eventId !== id || !Array.isArray(event.songs) || event.songs.some(s => !s || typeof s !== "object" || Array.isArray(s))) throw new Error("Event songs schema invalid");
    return event;
  }
  function rowsHtml(event) {
    const {mode,rows} = orderedEventSongs(event);
    if (!rows.length) return '<p>登録された歌唱曲はありません。</p>';
    const note = mode === "absolute" ? "確認済みのイベント全体の歌唱順です。" : mode === "relative" ? "μ's関連歌唱内で確認できた相対順です。イベント全体の歌唱順ではありません。" : "登録順で掲載しています。実際の歌唱順ではありません。";
    return `<p class="venue-event-order-note">${note}</p>${rows.map((s,i) => `<div class="venue-event-song"><span class="venue-event-song-order">${mode === "absolute" ? s.setlistPosition : mode === "relative" ? `歌唱順 ${s.relativePosition}` : `登録順 ${i+1}`}</span><div>${/^S\d+$/.test(s.songId || "") && s.songName ? `<a class="mus-link-primary mus-chip-link" href="${buildSongUrl(s.songId)}"><span class="mus-title-chip">${titleWithChevron(s.songName)}</span></a>` : `<span>${escapeHtml(s.songName || "曲名未登録")}</span>`}${s.singerDisplayName || s.singer ? `<div>歌唱者：${/^SN\d+$/.test(s.singerId || "") ? `<a class="mus-link-secondary" href="singer.html?id=${encodeURIComponent(s.singerId)}">${escapeHtml(singerDisplayName(s, s.singerDisplayName || s.singer))}</a>` : escapeHtml(singerDisplayName(s, s.singerDisplayName || s.singer))}</div>` : ""}${s.note ? `<p>${escapeHtml(s.note)}</p>` : ""}</div></div>`).join("")}`;
  }
  function paint(panel,id,state) {
    if (!panel.isConnected || !expanded.has(id)) return;
    if (panel.__venueState === state && panel.dataset.paintedStatus === state.status) return;
    panel.__venueState = state; panel.dataset.paintedStatus = state.status;
    panel.setAttribute("aria-busy", String(state.status === "pending"));
    panel.innerHTML = state.status === "success" ? rowsHtml(state.event) : state.status === "error" ? '<p>歌唱曲を取得できませんでした。<button type="button" data-venue-songs-retry>再試行</button></p>' : '<p role="status">歌唱曲を読み込んでいます…</p>';
  }
  function show(panel,id) {
    let state = states.get(id);
    if (!state) {
      state = {status:"pending"}; states.set(id,state);
      state.promise = fetchEvent(id).then(event => {state.status="success";state.event=event;}, () => {state.status="error";});
    }
    paint(panel,id,state);
    if (state.status === "pending") state.promise.then(() => paint(panel,id,state));
  }
  function restore() {
    root.querySelectorAll("[data-venue-event-songs]").forEach(button => {
      const id=button.dataset.venueEventSongs,open=expanded.has(id),panel=document.getElementById(button.getAttribute("aria-controls"));
      button.setAttribute("aria-expanded",String(open));button.textContent=open?"閉じる":"曲を見る";panel.hidden=!open;if(open)show(panel,id);
    });
  }
  root.addEventListener("click", event => {
    const retry=event.target.closest("[data-venue-songs-retry]"),button=event.target.closest("[data-venue-event-songs]");
    if(retry){const panel=retry.closest("[data-venue-event-panel]");states.delete(panel.dataset.venueEventPanel);show(panel,panel.dataset.venueEventPanel);return;}
    if(!button)return;const id=button.dataset.venueEventSongs;if(!/^EV\d+$/.test(id))return;
    if(expanded.has(id))expanded.delete(id);else expanded.add(id);restore();
  });
  return { restore, reset(){expanded.clear();states.clear();} };
}
