// Optional, independently curated audio references; never alter Song/performance data.
const DATA_URL = new URL("../../data/song-youtube.json?v=1.1.0", import.meta.url);
const STYLE_URL = new URL("../css/song-youtube.css?v=1.1.0", import.meta.url);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
let pending;

export function youtubeRecord(data, songId, hostname = location.hostname) {
  if (!/^S\d{3}$/.test(songId) || data?.schemaVersion !== 1) return null;
  const row = data.songs?.[songId];
  if (!row || !/^[A-Za-z0-9_-]{11}$/.test(row.videoId || "") ||
      typeof row.title !== "string" || !row.title.trim() ||
      typeof row.channelName !== "string" || !row.channelName.trim() ||
      !/^UC[A-Za-z0-9_-]{22}$/.test(row.channelId || "") ||
      row.embedAllowedAtVerification !== true ||
      row.sourceUrl !== `https://www.youtube.com/watch?v=${row.videoId}`) return null;
  if (row.loadMode !== undefined && !["click", "visible"].includes(row.loadMode)) return null;
  if (row.publicationStatus === "local_preview_pending_rights_clearance") {
    if (!LOCAL_HOSTS.has(hostname)) return null;
  } else if (row.publicationStatus !== "approved_for_publication") return null;
  if (row.contentType !== "official_audio" || !/^R\d{4}$/.test(row.recording?.releaseId || "") || !/^RT\d{4}$/.test(row.recording?.relationId || "") || typeof row.recording?.songVersion !== "string") return null;
  const box = row.recordingBasis === 'complete_best_box';
  if (row.recordingBasis !== undefined && !box) return null;
  if (box && (row.recording.releaseId !== 'R0090' || row.recording.songVersion !== '通常' || row.recording.variant !== null ||
      !Number.isInteger(row.recording.disc) || row.recording.disc < 1 || !Number.isInteger(row.recording.track) || row.recording.track < 1 ||
      !Number.isInteger(row.recording.displayOrder) || row.recording.displayOrder < 1 || row.loadMode !== 'click')) return null;
  if (!box && row.recording.releaseId === 'R0090') return null;
  if (Object.entries(data.songs).some(([id, other]) => id !== songId && other?.videoId === row.videoId)) return null;
  return row;
}

// External-only references never enter the embeddable registry or createPlayer.
export function externalYoutubeRecord(data, songId) {
  if (data?.schemaVersion !== 1 || !/^S\d{3}$/.test(songId) || data.songs?.[songId]) return null;
  const row = data.externalLinks?.[songId], r = row?.recording;
  if (!row || row.mode !== 'external_only' || row.publicationStatus !== 'approved_for_publication' ||
      row.contentType !== 'official_audio' || !/^[A-Za-z0-9_-]{11}$/.test(row.videoId || '') ||
      typeof row.title !== 'string' || !row.title.trim() ||
      row.sourceUrl !== `https://www.youtube.com/watch?v=${row.videoId}` ||
      row.loadMode !== undefined || row.embedAllowedAtVerification !== undefined || row.recordingBasis !== undefined ||
      !/^R\d{4}$/.test(r?.releaseId || '') || !/^RT\d{4}$/.test(r?.relationId || '') ||
      typeof r?.songVersion !== 'string' || !r.songVersion || r.variant !== null ||
      ![r.disc, r.track].every(n => n === null || Number.isInteger(n) && n > 0) ||
      !Number.isInteger(r.displayOrder) || r.displayOrder < 1) return null;
  if (Object.values(data.songs || {}).some(other => other.videoId === row.videoId) ||
      Object.entries(data.externalLinks).some(([id, other]) => id !== songId && other?.videoId === row.videoId)) return null;
  return row;
}
export function releaseExternalYoutubeRecord(data, release, track) {
  const row = externalYoutubeRecord(data, track?.songId), r = row?.recording;
  if (!r || release?.releaseId !== r.releaseId || track.relationId !== r.relationId ||
      (track.variant ?? null) !== r.variant || (track.disc ?? null) !== r.disc ||
      (track.track ?? null) !== r.track || track.displayOrder !== r.displayOrder) return null;
  return row;
}
export function songExternalYoutubeRecord(data, song) {
  const row = externalYoutubeRecord(data, song?.songId);
  if (!row || song.version !== row.recording.songVersion || song.debutRelease?.releaseId !== row.recording.releaseId) return null;
  const bindings = song.includedReleases?.filter(t => t.releaseId === row.recording.releaseId && t.relationId === row.recording.relationId) || [];
  if (bindings.length !== 1 || !releaseExternalYoutubeRecord(data, {releaseId: bindings[0].releaseId}, {...bindings[0], songId: song.songId})) return null;
  return row;
}
function createExternalLink(row, id, songId, inline = false) {
  ensureStyle();
  const section = document.createElement('div');
  section.id = id;
  section.className = 'song-youtube-external-only' + (inline ? ' song-youtube-inline' : '');
  section.dataset.videoId = row.videoId;
  if (inline) section.dataset.youtubeExternalSong = songId;
  else section.dataset.youtubeExternalRelation = row.recording.relationId;
  const link = document.createElement('a');
  link.className = 'song-youtube-external song-youtube-external-button';
  link.href = row.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'YouTubeで聴く ↗';
  link.setAttribute('aria-label', `${row.title}をYouTubeで聴く（新しいタブで開く）`);
  section.append(link);
  return section;
}
async function loadData() {
  pending ||= fetch(DATA_URL, { signal: AbortSignal.timeout(3000) })
    .then(response => response.ok ? response.json() : null).catch(() => null);
  return pending;
}
function ensureStyle() {
  if (!document.querySelector('link[data-song-youtube-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet';
    style.href = STYLE_URL.href; style.dataset.songYoutubeStyle = ''; document.head.append(style);
  }
}
export function releaseYoutubeRecord(data, release, track, hostname = location.hostname) {
  const row = youtubeRecord(data, track?.songId, hostname), r = row?.recording;
  if (!r || release?.releaseId !== r.releaseId || track.relationId !== r.relationId ||
      (track.variant ?? null) !== r.variant || (track.disc ?? null) !== r.disc ||
      (track.track ?? null) !== r.track || track.displayOrder !== r.displayOrder) return null;
  return row;
}
export function songYoutubeRecord(data, song, hostname = location.hostname) {
  const row = youtubeRecord(data, song?.songId, hostname);
  if (!row || song.version !== row.recording.songVersion) return null;
  const box = row.recordingBasis === 'complete_best_box';
  if (!box && song.debutRelease?.releaseId !== row.recording.releaseId) return null;
  const bindings = song.includedReleases?.filter(t => t.releaseId === row.recording.releaseId && t.relationId === row.recording.relationId) || [];
  if (bindings.length !== 1 || !releaseYoutubeRecord(data, {releaseId: bindings[0].releaseId}, {...bindings[0], songId: song.songId}, hostname)) return null;
  return row;
}
export async function renderSongYoutube(song, after) {
  if (!after?.isConnected) return null;
  const data = await loadData(), row = songYoutubeRecord(data, song);
  const external = row ? null : songExternalYoutubeRecord(data, song);
  if (!row && !external) return null;
  const existing = document.getElementById('songYoutubeSection') || document.getElementById('songYoutubeExternalSection');
  const statsCard = after.querySelector('#songStats')?.closest('.card');
  if (!statsCard) return null;
  const section = row ? createPlayer(row, 'songYoutubeSection', true) : createExternalLink(external, 'songYoutubeExternalSection', song.songId, true);
  if (row?.recordingBasis === 'complete_best_box') {
    const binding = song.includedReleases.find(t => t.releaseId === row.recording.releaseId && t.relationId === row.recording.relationId);
    const source = document.createElement('p'); source.className = 'song-youtube-note';
    source.dataset.youtubeRecordingSource = 'complete_best_box';
    const link = document.createElement('a'); link.href = 'release/R0090.html'; link.textContent = "μ's Complete BEST BOX";
    const year = /^\d{4}-\d{2}-\d{2}$/.test(binding.releaseDate || '') ? '（' + binding.releaseDate.slice(0, 4) + '年）' : '';
    source.append('収録音源：', link, year + ' / Disc ' + row.recording.disc + ' / Track ' + row.recording.track);
    section.querySelector('.song-youtube-credit').after(source);
  }
  statsCard.classList.add('song-audio-stats');
  if (existing) existing.replaceWith(section);
  else statsCard.prepend(section);
  return section;
}
export async function attachReleaseYoutube(release, host) {
  if (!host?.isConnected) return;
  const data = await loadData();
  for (const track of release.includedSongs || []) {
    const row = releaseYoutubeRecord(data, release, track);
    const external = row ? null : releaseExternalYoutubeRecord(data, release, track);
    if (!row && !external) continue;
    const anchors = [...host.querySelectorAll('.release-included-song-row[data-relation-id]')].filter(n => n.dataset.relationId === track.relationId);
    if (anchors.length !== 1 || anchors[0].getAttribute('href') !== 'song/' + track.songId + '.html') continue;
    const existing = host.querySelector('[data-youtube-relation="' + track.relationId + '"], [data-youtube-external-relation="' + track.relationId + '"]');
    ensureStyle();
    if (external) {
      const section = createExternalLink(external, 'releaseYoutubeExternal-' + track.relationId, track.songId);
      if (existing) existing.replaceWith(section);
      else anchors[0].after(section);
      continue;
    }
    const details = document.createElement('details'); details.className = 'song-youtube-disclosure'; details.dataset.youtubeRelation = track.relationId;
    const summary = document.createElement('summary'); summary.textContent = '公式音源を聴く'; details.append(summary);
    details.addEventListener('toggle', () => { if (details.open && !details.querySelector('.song-youtube')) details.append(createPlayer(row, 'releaseYoutube-' + track.relationId)); });
    if (existing) existing.replaceWith(details);
    else anchors[0].after(details);
  }
}
function createPlayer(row, id, clickPreview = false) {
  ensureStyle();
  const section = document.createElement(clickPreview ? "div" : "section");
  section.id = id;
  section.className = clickPreview ? "song-youtube song-youtube-inline" : "section card song-youtube";
  section.dataset.videoId = row.videoId;
  section.setAttribute("aria-labelledby", id + "-heading");
  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "OFFICIAL AUDIO";
  const heading = document.createElement("h2");
  heading.id = id + "-heading";
  heading.textContent = "公式音源";
  const credit = document.createElement("p");
  credit.className = "song-youtube-credit";
  credit.textContent = `${row.title} · ${row.channelName}`;
  const stage = document.createElement("div");
  stage.className = "song-youtube-stage";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "song-youtube-load";
  button.setAttribute("aria-label", `${row.title}のYouTubeプレーヤーを読み込む`);
  const icon = document.createElement("span");
  icon.className = "song-youtube-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "▶";
  const label = document.createElement("span");
  label.textContent = "YouTubeプレーヤーを読み込む";
  const hint = document.createElement("small");
  const loadOnVisible = !clickPreview && row.loadMode === "visible" && "IntersectionObserver" in window;
  hint.textContent = loadOnVisible
    ? "表示領域に入るとYouTubeに接続します"
    : "クリックするまでYouTubeへ接続しません";
  button.append(icon, label, hint);
  stage.append(button);
  const status = document.createElement("p");
  status.className = "song-youtube-note";
  status.setAttribute("role", "status");
  const readyMessage = "自動再生はしません。プレーヤーの再生ボタンを押してください。";
  status.textContent = loadOnVisible
    ? "音源欄の表示時にYouTubeへ接続します。自動再生はしません。"
    : "自動再生はしません。読み込み後、プレーヤーの再生ボタンを押してください。";
  const fallback = document.createElement("a");
  fallback.className = "song-youtube-external";
  fallback.href = row.sourceUrl;
  fallback.target = "_blank";
  fallback.rel = "noopener noreferrer";
  fallback.textContent = "YouTubeで開く ↗";
  const fallbackNote = document.createElement("p");
  fallbackNote.className = "song-youtube-note";
  fallbackNote.textContent = "再生できない場合はYouTubeで開いてください。";
  section.append(kicker, heading, credit, stage, status, fallback, fallbackNote);
  if (clickPreview) {
    // Same thumbnail URL returned by YouTube's oEmbed for this official audio.
    // External display only: no downloaded copy, crop, or data-master change.
    const image = document.createElement('img');
    image.src = `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`;
    image.alt = `${row.title} — YouTube公式音源のサムネイル`;
    image.referrerPolicy = 'strict-origin-when-cross-origin';
    button.classList.add('song-youtube-preview');
    label.textContent = 'YouTubeプレーヤーを開く';
    button.replaceChildren(image, label);
    status.textContent = 'YouTubeのサムネイルを表示しています。プレーヤーは操作時に読み込みます。';
  }
  let observer;
  const mountPlayer = (focus) => {
    if (stage.querySelector("iframe")) return;
    if (clickPreview && stage.clientWidth < Math.ceil(200 * 16 / 9)) {
      status.textContent = '小さい画面では「YouTubeで開く」から再生してください。';
      return;
    }
    observer?.disconnect();
    stage.setAttribute("aria-busy", "true");
    status.textContent = "公式プレーヤーを読み込んでいます。自動再生はしません。";
    const iframe = document.createElement("iframe");
    iframe.title = `${row.title} — YouTube公式音源`;
    const url = new URL(`https://www.youtube-nocookie.com/embed/${row.videoId}`);
    url.searchParams.set("autoplay", "0");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    iframe.src = url.href;
    iframe.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.addEventListener("load", () => {
      stage.setAttribute("aria-busy", "false");
      status.textContent = readyMessage;
    });
    iframe.addEventListener("error", () => {
      stage.setAttribute("aria-busy", "false");
      status.textContent = "プレーヤーを読み込めませんでした。YouTubeで開いてください。";
    });
    iframe.tabIndex = 0;
    stage.replaceChildren(iframe);
    // Hand keyboard focus to the replacement instead of losing the focused button.
    if (focus) iframe.focus();
  };
  button.addEventListener("click", () => mountPlayer(true));
  if (loadOnVisible) {
    const observe = () => {
      if (!section.isConnected || stage.querySelector("iframe")) return;
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) mountPlayer(false);
      }, { rootMargin: "0px", threshold: 0.01 });
      observer.observe(stage);
    };
    // Observe final geometry, not the temporarily unstyled, shorter card.
    const style = document.querySelector("link[data-song-youtube-style]");
    if (style.sheet) requestAnimationFrame(observe);
    else style.addEventListener("load", observe, { once: true });
  }
  return section;
}
