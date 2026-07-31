export function renderCommon(active = "") {
  const header = document.getElementById("siteHeader");
  const footer = document.getElementById("siteFooter");

  if (header) {
    header.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand" href="index.html">
            <b>μ's Song Database</b>
            <small>μ's歌唱履歴データベース</small>
          </a>

          <div class="global-search">
            <span>⌕</span>
            <input id="globalSearchInput" placeholder="μ'sの歴史を検索">
          </div>

          <nav class="nav">
            <a href="index.html">ホーム</a>
            <a href="song.html?id=S003">曲</a>
            <a class="${active === "event" ? "active" : ""}" href="event.html?id=EV0002">イベント</a>
            <a href="venue.html?id=VE0002">会場</a>
            <a href="rankings.html">ランキング</a>
          </nav>
        </div>
      </header>`;
  }

  if (footer) {
    footer.innerHTML = `
      <footer class="site-footer">
        <div>
          <b>μ's Song Database</b><br>
          μ's歌唱履歴データベース
        </div>
        <div>Web Prototype v2.0 Foundation</div>
      </footer>`;
  }

  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && searchInput.value.trim()) {
        location.href = `search.html?q=${encodeURIComponent(searchInput.value.trim())}`;
      }
    });
  }
}
