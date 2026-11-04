const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {Book}=require('./import-sheet-fixture.cjs');
const H=['実装日','レア','職業','オペレーター名','昇進','Lv','潜在','S1','S2','S3','X','Y','Δ','α','所持状態'];
const row=(name,date='2026/01/01',rarity=6,job='狙撃')=>[rarity,job,name,date];
const html=rows=>'<title>オペレーター実装履歴</title><table><tr><th>★</th><th>職業</th><th>名前</th><th>実装日</th></tr>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</table>';
function fixture(){
  let now=Date.UTC(2026,10,3),locked=false,fetches=0;const props=new Map(),cache=new Map(),book=new Book();
  const sheet=book.add('2026年',[H,['2026/01/01',6,'狙撃','既存',2,90,14,'M3','M3','M3',3,3,'','',true]]);
  const p={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
  const c=vm.createContext({console,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
    PropertiesService:{getScriptProperties:()=>p},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>locked=false})},
    Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:d=>d.toISOString().slice(0,10).replace(/-/g,'/'),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],newBlob:s=>({getBytes:()=>Buffer.from(s)})},
    SpreadsheetApp:{openById:()=>book,CopyPasteType:{PASTE_FORMAT:'format',PASTE_DATA_VALIDATION:'validation'},flush(){}},
    ContentService:{createTextOutput:text=>({text})},HtmlService:{XFrameOptionsMode:{ALLOWALL:'all'},createHtmlOutput:text=>({text,setXFrameOptionsMode(){return this;}})},
    UrlFetchApp:{fetch:()=>{fetches++;return {getResponseCode:()=>c.http,getContentText:()=>c.html};}},webSpreadsheet_:()=>book
  });c.http=200;c.html=html([row('既存'),row('ア'),row('W')]);
  for(const file of ['EditorApi','OperatorImport','ImportApi'])vm.runInContext(fs.readFileSync('backend/'+file+'.gs','utf8').replace('minimumSourceCount: 300','minimumSourceCount: 1'),c);
  Object.entries({OAUTH_CLIENT_ID:'test.apps.googleusercontent.com',OAUTH_CLIENT_SECRET:'test-secret',OWNER_EMAIL:'owner@example.test',OWNER_GOOGLE_SUB:'owner-sub',EDITOR_ORIGIN:'https://owner.github.io'}).forEach(([k,v])=>props.set(k,v));
  const token='a'.repeat(64),sessionKey='ARK_EDITOR_SESSION_'+c.editorHash_(token);
  props.set(sessionKey,JSON.stringify({sub:'owner-sub',stamp:c.editorConfig_().stamp,expiresAt:now+30*86400000}));
  function dispatch(action,input={},t=token){return c.editorDispatch_({action,input,token:t},c.editorConfig_());}
  return {c,book,sheet,cache,props,token,sessionKey,dispatch,advance:ms=>now+=ms,get fetches(){return fetches;}};
}
test('preview uses the existing parser, excludes unreleased operators, and never writes the sheet',()=>{
  const f=fixture();f.c.html=html([row('既存'),row('ア'),row('W'),row('未来','2099/01/01'),row('未実装','-')]);
  const p=f.dispatch('importPreview');
  assert.deepEqual(Array.from(p.additions,o=>o.name).sort(),['W','ア']);assert.equal(p.excluded.future,1);assert.equal(p.excluded.unreleased,1);assert.equal(f.book.writes,0);
  assert.equal(f.sheet.getLastRow(),2);assert.equal(f.fetches,1);assert.match(p.planId,/^[a-f0-9]{64}$/);
});
test('commit applies only the server preview, preserves training, and cannot be repeated',()=>{
  const f=fixture(),before=JSON.stringify(f.sheet.data[1]),p=f.dispatch('importPreview');
  const result=f.dispatch('importCommit',{planId:p.planId,additions:[{name:'Forged'}]});
  assert.equal(result.added,2);assert.equal(f.sheet.getLastRow(),4);assert.equal(JSON.stringify(f.sheet.data[1]),before);
  assert.equal(f.sheet.cell(3,15).v,false);assert.equal(f.sheet.cell(3,5).v,'');assert.equal(f.fetches,1);
  const writes=f.book.writes;assert.throws(()=>f.dispatch('importCommit',{planId:p.planId}),/期限/);assert.equal(f.book.writes,writes);
  assert.equal(f.dispatch('importPreview').additions.length,0);
});
test('preview/commit reject anonymous, expired or revoked sessions before Wiki fetch or mutation',()=>{
  const f=fixture();for(const action of ['importPreview','importCommit'])assert.throws(()=>f.dispatch(action,{},''),/ログイン/);
  assert.equal(f.fetches,0);const p=f.dispatch('importPreview');f.props.delete(f.sessionKey);
  assert.throws(()=>f.dispatch('importCommit',{planId:p.planId}),/ログイン/);assert.equal(f.book.writes,0);
});
test('confirmation expires, is session-bound, and is replaced by a fresh preview',()=>{
  for(const mode of ['expire','evict','replace','session']){
    const f=fixture(),p=f.dispatch('importPreview');
    if(mode==='expire')f.advance(600001);if(mode==='evict')f.cache.clear();if(mode==='replace')f.dispatch('importPreview');
    const t=mode==='session'?'b'.repeat(64):f.token;
    if(mode==='session')f.props.set('ARK_EDITOR_SESSION_'+f.c.editorHash_(t),f.props.get(f.sessionKey));
    assert.throws(()=>f.dispatch('importCommit',{planId:p.planId},t),/期限/);assert.equal(f.book.writes,0);
  }
});
test('sheet edits after preview stop the import before any new writes',()=>{
  for(const edit of [cell=>cell.v=15,cell=>cell.f='=14']){
    const f=fixture(),p=f.dispatch('importPreview');edit(f.sheet.cell(2,7));
    assert.throws(()=>f.dispatch('importCommit',{planId:p.planId}),/シートが変更/);assert.equal(f.book.writes,0);
  }
});
test('import snapshots read the time zone once and post-write verification skips formulas',()=>{
  const f=fixture(),date=iso=>vm.runInContext(`new Date('${iso}T00:00:00Z')`,f.c);
  f.sheet.cell(2,1).v=date('2026-01-01');
  f.book.add('2025年',[H,[date('2025-01-01'),6,'狙撃','前年']]);
  f.c.html=html([row('前年','2025/01/01'),row('既存'),row('ア')]);
  let timeZoneReads=0,formulaReads=0;
  f.book.getSpreadsheetTimeZone=()=>{timeZoneReads++;return 'Asia/Tokyo';};
  for(const sheet of f.book.getSheets()){
    const getRange=sheet.getRange.bind(sheet);
    sheet.getRange=(...args)=>{
      const range=getRange(...args),getFormulas=range.getFormulas.bind(range);
      range.getFormulas=()=>{formulaReads++;return getFormulas();};
      return range;
    };
  }
  const p=f.dispatch('importPreview');
  assert.deepEqual([timeZoneReads,formulaReads],[1,2]);
  assert.equal(p.updates.length,0);
  assert.equal(f.dispatch('importCommit',{planId:p.planId}).added,1);
  assert.deepEqual([timeZoneReads,formulaReads],[3,4]);
});
test('metadata corrections are shown before confirmation and leave existing skill exceptions intact',()=>{
  const f=fixture();f.c.html=html([row('既存','2026/01/02',5,'術師')]);
  const p=f.dispatch('importPreview');assert.equal(p.updates[0].before.rarity,6);assert.equal(p.updates[0].after.rarity,5);assert.equal(f.book.writes,0);
  f.dispatch('importCommit',{planId:p.planId});assert.equal(f.sheet.cell(2,2).v,5);assert.equal(f.sheet.cell(2,10).v,'M3');assert.equal(f.sheet.cell(2,7).v,14);
});
test('fetch errors, missing existing operators and excessive additions fail without writes',()=>{
  for(const mode of ['http','wrongPage','missing','tooMany']){
    const f=fixture();if(mode==='http')f.c.http=503;if(mode==='wrongPage')f.c.html='<title>Error</title>';if(mode==='missing')f.c.html=html([row('新規')]);
    if(mode==='tooMany')f.c.html=html([row('既存'),...Array.from({length:51},(_,i)=>row('新規'+i))]);
    assert.throws(()=>f.dispatch('importPreview'));assert.equal(f.book.writes,0);
  }
});
test('a partial write failure consumes the preview and is reported as uncertain',()=>{
  const f=fixture(),p=f.dispatch('importPreview');f.c.arkImportVerify_=()=>{throw Error('failure after write');};
  assert.throws(()=>f.dispatch('importCommit',{planId:p.planId}),/一部反映/);const writes=f.book.writes;assert.ok(writes>0);
  assert.throws(()=>f.dispatch('importCommit',{planId:p.planId}),/期限/);assert.equal(f.book.writes,writes);
});
