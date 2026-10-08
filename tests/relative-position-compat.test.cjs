const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const rawRoot = path.join(root, 'work/raw-appsscript-source');
const apiRoot = path.join(root, 'musdb-public-api-appsscript');
const fixture = require('./fixtures/relative-position-raw.json');
const {validateEventSnapshot} = require('../tools/detail-snapshot-lib.cjs');
function context(file, extra = {}) {
  const c = vm.createContext(extra);
  vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  return c;
}
function sheet(values) {
  return {getLastRow:()=>values.length, getLastColumn:()=>values[0].length,
    getRange:(r,col,n,w)=>({getValues:()=>values.slice(r-1,r-1+n).map(row=>Array.from({length:w},(_,i)=>row[col-1+i]??''))})};
}
for (const width of [8,9,10]) test(`RAW ${width} columns retain A:H and optional positions without drift`, () => {
  const values=fixture.values.map(r=>r.slice(0,width));
  const rs=sheet(values);
  const c=context(path.join(rawRoot,'Common.js'),{CONFIG:{RAW_SHEET:'歌唱RAW'},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>rs})}});
  const result=c.getRawData();
  assert.equal(result.length,1400);
  result.forEach((row,i)=>{
    assert.equal(row.length,width);
    assert.deepEqual(Array.from(row.slice(0,8)),values[i+1].slice(0,8).map(v=>v??''));
    for(let col=8;col<width;col++)assert.equal(row[col],values[i+1][col]??null);
  });
  const admin=context(path.join(rawRoot,'AdminSingingRegistration.js'),{normalizeAdminValidationText_:v=>String(v??'').trim()});
  assert.equal(admin.assertAdminRegistrationRawShape_({getSheetByName:()=>rs}),rs);
  const repo=context(path.join(apiRoot,'DataRepository.js'));
  const objects=repo.getApiSheetObjects_(rs);
  const api=context(path.join(apiRoot,'EventApi.js'));
  const positions=api.getEventSetlistData_({},objects);
  assert.equal(positions.relativePositions.length,1400);
  objects.forEach((r,i)=>assert.equal(positions.relativePositions[i],width===10?(values[i+1][9]??null):null));
});
test('positive relative values, blanks, duplicates, conflicts and Admin validation',()=>{
  const api=context(path.join(apiRoot,'EventApi.js'));
  const admin=context(path.join(rawRoot,'AdminValidation.js'));
  for(const relativePosition of [null,undefined,'',' ',1,25,'3']) {
    const row={relativePosition};
    const value=api.getEventSetlistData_({},[row]).relativePositions[0];
    assert.equal(value,relativePosition==null||String(relativePosition).trim()===''?null:Number(relativePosition));
    const errors=[];admin.validateAdminRelativePosition_(row,2,errors);assert.equal(errors.length,0);
  }
  for(const relativePosition of [0,-1,1.5,true,'bad',Infinity]) {
    assert.throws(()=>api.getEventSetlistData_({},[{relativePosition}]),/Invalid relative/);
    const errors=[];admin.validateAdminRelativePosition_({relativePosition},2,errors);assert.ok(errors.length);
  }
  assert.throws(()=>api.getEventSetlistData_({},[{setlistPosition:1,relativePosition:1}]),/Conflicting/);
  const errors=[];admin.validateAdminRelativePosition_({setlistPosition:1,relativePosition:1},2,errors);assert.ok(errors.length);
  assert.deepEqual(Array.from(api.getEventSetlistData_({},[{relativePosition:2},{relativePosition:2}]).relativePositions),[2,2]);
});
test('generator sorts full 10-column rows; optional defaults never add columns',()=>{
  let width;
  const c=context(path.join(rawRoot,'RawGenerator.js'));
  c.sortRawSheet_({getLastRow:()=>3,getLastColumn:()=>10,getRange:(r,col,n,w)=>({sort:()=>width=w})});
  assert.equal(width,10);
  const admin=context(path.join(rawRoot,'AdminSingingRegistration.js'));
  for(const cols of [8,9,10]) {
    let writes=0;
    const s={getLastColumn:()=>cols,getRange:()=>({getValues:()=>[['relativePosition']],setValues:()=>writes++})};
    admin.writeAdminOptionalSetlistDefault_(s,2,1,10,'relativePosition','');
    assert.equal(writes,cols===10?1:0);
  }
});
test('Static accepts missing/null/positive relative; rejects invalid and simultaneous absolute',()=>{
  const current=require('../data/current.json');
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/snapshots',current.revision,'events/EV0348.json')));
  const rev=source.snapshot.revision,data=source.snapshot.dataRevision||rev;
  for(const relative of [undefined,null,1,3]) {
    const s=structuredClone(source);s.data.event.songs[0].relativePosition=relative;
    validateEventSnapshot('EV0348',s,rev,data);
  }
  for(const relative of [0,-1,1.5,true,'3']) {
    const s=structuredClone(source);s.data.event.songs[0].relativePosition=relative;
    assert.throws(()=>validateEventSnapshot('EV0348',s,rev,data),/Invalid relative/);
  }
  const s=structuredClone(source);Object.assign(s.data.event.songs[0],{setlistPosition:1,relativePosition:1});
  assert.throws(()=>validateEventSnapshot('EV0348',s,rev,data),/Conflicting/);
});
