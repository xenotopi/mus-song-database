'use strict';
const fs=require('fs'),p=require('path'),a=require('node:assert/strict'),test=require('node:test');const root=p.resolve(__dirname,'..'),cur=require('../data/current.json'),products=require('../data/release-single-products.json').releases,{validateSingleBody}=require('../tools/validate-release-single-products.cjs'),{parseSerializedHtml}=require('../tools/static-html-readonly-lib.cjs');
const specs=[['R0037','S068','RT0068','nGP-3iqhKy0','RT0069'],['R0057','S099','RT0099','YErKL8h7eUQ','RT0098'],['R0061','S105','RT0105','dkl6n38q3r0','RT0106']];
const read=id=>require('../data/snapshots/'+cur.revision+'/releases/'+id+'.json').data;
function baseline(id){return fs.readFileSync(p.join(root,'release',id+'.html'),'utf8').replace(/<div\b[^>]*data-youtube-external-relation="[^"]*"[^>]*>[\s\S]*?<\/div>/g,'');}
function fragment(html,rid){const marker='data-relation-id="'+rid+'"',at=html.indexOf(marker);a.ok(at>=0);a.equal(html.indexOf(marker,at+marker.length),-1);const begin=html.lastIndexOf('<a ',at),end=html.indexOf('</a>',at)+4;a.ok(begin>=0&&end>at);return html.slice(begin,end);}
for(const[id,songId,rid,videoId,neighbour]of specs){const release=read(id),item=products.find(x=>x.releaseId===id),recording=release.includedSongs.find(x=>x.relationId===rid),base=baseline(id),song=fragment(base,rid),url='https://www.youtube.com/watch?v='+videoId;
 const link='<a class="song-youtube-external song-youtube-external-button" href="'+url+'" target="_blank" rel="noopener noreferrer" aria-label="'+recording.songName+'をYouTubeで聴く（新しいタブで開く）">YouTubeで聴く ↗</a>',container='<div class="song-youtube-external-only" data-youtube-external-relation="'+rid+'" data-video-id="'+videoId+'">'+link+'</div>',good=base.replace(song,song+container),check=h=>validateSingleBody(parseSerializedHtml(h),release,item);
 test(id+' retains one exact Song link with optional verified external link',()=>{a.doesNotThrow(()=>check(base));a.doesNotThrow(()=>check(good));});
 const bad={
  'missing Song':good.replace(song,''),
  'duplicate Song':good.replace(song,song+song),
  'wrong Song href':good.replace(song,song.replace('song/'+songId+'.html','song/S999.html')),
  'wrong Song Relation':good.replace(song,song.replace(rid,'RT9999')),
  'wrong external URL':good.replace(url,'https://www.youtube.com/watch?v=wrong'),
  'wrong external Relation':good.replace('data-youtube-external-relation="'+rid+'"','data-youtube-external-relation="RT9999"'),
  'wrong external video':good.replace('data-video-id="'+videoId+'"','data-video-id="wrong"'),
  'same tab':good.replace(container,container.replace('_blank','_self')),
  'missing safety rel':good.replace(container,container.replace('noopener noreferrer','noopener')),
  'wrong label':good.replace(container,container.replace('YouTubeで聴く ↗','wrong')),
  'duplicate external':good.replace(container,container+container),
  'hidden external':good.replace(container,container.replace('<div ','<div hidden ')),
  'wrong placement':base.replace(song,container+song),
  'unbound external':base.replace(song,song+link),
  'iframe':good.replace(container,container.replace('</div>','<iframe src="https://www.youtube-nocookie.com/embed/'+videoId+'"></iframe></div>')),
  'unexpected anchor':good.replace(container,container.replace('</div>','<a href="https://example.org/">other</a></div>')),
  'other recording':base.replace(fragment(base,neighbour),fragment(base,neighbour)+container),
  'plain Off Vocal':base.replace('<span class="release-single-plain-track">','<span class="release-single-plain-track">'+container)
 };
 for(const[name,html]of Object.entries(bad))test(id+' rejects '+name,()=>{a.notEqual(html,good);a.throws(()=>check(html));});
}
test('external allowlist cannot authorize a different Single',()=>{const release=read('R0001'),item=products.find(x=>x.releaseId==='R0001'),base=baseline('R0001'),song=fragment(base,'RT0001'),extra='<div class="song-youtube-external-only" data-youtube-external-relation="RT0001" data-video-id="nGP-3iqhKy0"><a href="https://www.youtube.com/watch?v=nGP-3iqhKy0" target="_blank" rel="noopener noreferrer">YouTubeで聴く ↗</a></div>';a.throws(()=>validateSingleBody(parseSerializedHtml(base.replace(song,song+extra)),release,item));});
