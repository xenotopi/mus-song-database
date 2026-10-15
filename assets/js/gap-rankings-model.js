export const SCOPES = { all: "すべて", official: "公式", solo: "ソロ" };
export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" && value <= "2100-12-31" &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function dayDifference(from, to) {
  if (!validDate(from) || !validDate(to)) throw new Error("日付が不正です。");
  return (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
}
export function categoryOf(performance, event) {
  return ["公式", "ソロ"].includes(event?.category) ? event.category : performance.type;
}
export function buildPayload(songs, eventRows) {
  const events = Object.fromEntries(eventRows.map(e => [e.eventId, { eventId: e.eventId, eventName: e.eventName, category: e.category, date: e.date }]));
  const usedEvents = new Set();
  const rows = songs.map(song => {
    const dates = new Map();
    for (const p of song.performances) {
      const event = events[p.eventId];
      if (!event || !validDate(event.date)) throw new Error(`正式イベントを確認できません: ${song.songId}/${p.eventId}`);
      usedEvents.add(p.eventId);
      const date = event.date;
      if (!dates.has(date)) dates.set(date, { date, all: new Set(), official: new Set(), solo: new Set(), recordCount: 0 });
      const bucket = dates.get(date);
      bucket.recordCount += 1; bucket.all.add(p.eventId);
      const category = categoryOf(p, event);
      if (category === "公式") bucket.official.add(p.eventId);
      if (category === "ソロ") bucket.solo.add(p.eventId);
    }
    return { id: song.songId, name: song.displayName || song.songName, recordCount: song.performances.length,
      dates: [...dates.values()].sort((a,b) => a.date.localeCompare(b.date)).map(b => ({ ...b, all: [...b.all].sort(), official: [...b.official].sort(), solo: [...b.solo].sort() })) };
  }).sort((a,b) => a.id.localeCompare(b.id));
  return { events: Object.fromEntries([...usedEvents].sort().map(id => [id, events[id]])), songs: rows };
}
export function validateDataset(data, pointer) {
  if (data?.schemaVersion !== 1 || data.source?.outputRevision !== pointer.outputRevision || data.source?.dataRevision !== pointer.dataRevision) throw new Error("Revision不一致です。派生データの正式再生成が必要です。");
  const songs = data.payload?.songs;
  const ids = Array.from({length:117},(_,i)=>'S'+String(i+1).padStart(3,'0'));
  if (!Array.isArray(songs) || songs.length !== 117 || songs.map(s=>s.id).sort().join() !== ids.join()) throw new Error("117曲の完全性を確認できません。");
  for (const song of songs) {
    if (typeof song.name !== 'string' || !Array.isArray(song.dates) || !Number.isInteger(song.recordCount) || song.recordCount<0) throw new Error('Song schema不正');
    let previous=''; let count=0;
    for (const bucket of song.dates) {
      if (!validDate(bucket.date) || bucket.date<=previous || !Number.isInteger(bucket.recordCount) || bucket.recordCount<1) throw new Error('歌唱日schema不正');
      previous=bucket.date; count+=bucket.recordCount;
      for (const scope of Object.keys(SCOPES)) {
        const entries=bucket[scope];
        if (!Array.isArray(entries) || new Set(entries).size!==entries.length || (scope==='all' && !entries.length)) throw new Error('区分schema不正');
        for(const id of entries) if(!/^EV\d+$/.test(id)||data.payload.events[id]?.date!==bucket.date||typeof data.payload.events[id]?.eventName!=='string'||!bucket.all.includes(id)) throw new Error('イベント参照不正');
      }
    }
    if(count!==song.recordCount)throw new Error('歌唱記録数不一致');
  }
  return data;
}
export function rankSongs(payload, scope, mode, baseDate) {
  if (!Object.hasOwn(SCOPES,scope) || !['current','history'].includes(mode) || !validDate(baseDate)) throw new Error('集計条件不正');
  const rows=[], noHistory=[], noInterval=[];
  for (const song of payload.songs) {
    const dates=song.dates.filter(d=>d[scope].length && d.date<=baseDate);
    const before=dates.filter(d=>d.date<baseDate);
    const today=dates.find(d=>d.date===baseDate);
    if(!before.length)noHistory.push(song);
    let interval=null;
    if(mode==='current' && before.length) {
      const from=before.at(-1);
      interval={days:dayDifference(from.date,baseDate),fromDate:from.date,toDate:baseDate,fromEvents:from[scope],toEvents:[],todayEvents:today?.[scope]||[]};
    }
    if(mode==='history') {
      for(let i=1;i<dates.length;i++) {
        const from=dates[i-1],to=dates[i],days=dayDifference(from.date,to.date);
        if(!interval || days>interval.days || days===interval.days&&to.date>interval.toDate)interval={days,fromDate:from.date,toDate:to.date,fromEvents:from[scope],toEvents:to[scope],todayEvents:[]};
      }
      if(!interval)noInterval.push(song);
    }
    if(interval)rows.push({id:song.id,name:song.name,...interval});
  }
  rows.sort((a,b)=>b.days-a.days||a.id.localeCompare(b.id));
  rows.forEach((row,i)=>row.rank=i&&row.days===rows[i-1].days?rows[i-1].rank:i+1);
  return { rows:rows.slice(0,20), population:rows.length, noHistory, noInterval };
}
