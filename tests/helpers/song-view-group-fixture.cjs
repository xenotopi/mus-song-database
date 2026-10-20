'use strict';
// Independent expected additions, not derived from the UI classifier.
const moves=Object.freeze({S059:'printemps',S090:'printemps',S091:'lily-white',S092:'bibi'});
exports.expectedSongViewGroups=master=>({...master,assignments:master.assignments.map(item=>({...item,songIds:item.songIds.filter(id=>!Object.hasOwn(moves,id)).concat(item.group==='unit'?Object.entries(moves).filter(([,subgroup])=>subgroup===item.subgroup).map(([id])=>id):[]).sort()}))});
