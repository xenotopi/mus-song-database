
export function common(active=""){
  siteHeader.innerHTML=`<header class="site-header"><div class="header-inner">
    <a class="brand" href="index.html"><b>μ's Song Database</b><small>μ's歌唱履歴データベース</small></a>
    <div class="search">⌕<input id="globalQ" placeholder="μ'sの歴史を検索"></div>
    <nav class="nav">
      <a class="${active==="home"?"active":""}" href="index.html">ホーム</a>
      <a class="${active==="song"?"active":""}" href="song.html?id=S003">曲</a>
      <a class="${active==="event"?"active":""}" href="event.html?id=EV0002">イベント</a>
      <a class="${active==="venue"?"active":""}" href="venue.html?id=VE0002">会場</a>
      <a href="rankings.html">ランキング</a>
    </nav></div></header>`;
  siteFooter.innerHTML=`<footer class="footer"><div><b>μ's Song Database</b><br>μ's歌唱履歴データベース</div><div>Web Prototype v1.1</div></footer>`;
  globalQ.addEventListener("keydown",e=>{if(e.key==="Enter"&&globalQ.value.trim())location.href=`search.html?q=${encodeURIComponent(globalQ.value.trim())}`});
}
