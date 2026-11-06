const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const headers=['実装日','レア','職業','オペレーター名','昇進','Lv','潜在','S1','S2','S3','X','Y','Δ','α','所持状態'];
function fixture(kind='PublicApi'){
  const props=new Map([['SPREADSHEET_ID','TEST_ONLY_SHEET']]),writes=[],notifications=[],history=[],opened=[];
  const row=['2020-01-16',6,'特殊','ア',2,90,18,'M3','M3','M3',3,'-','-','-',true];
  const sheet={getName:()=> '2020年',getLastRow:()=>2,getLastColumn:()=>15,getRange(r,c,h,w){return {getValues:()=>r===1?[headers.slice(),row.slice()]:[row.slice(c-1,c-1+w)],getFormulas:()=>[headers.map((_,i)=>sheet.formula===i?'=1':'')],setValues(v){writes.push({c,values:v[0]});row.splice(c-1,w,...v[0]);}}}};
  sheet.getDataRange=()=>({getValues:()=>[headers.slice(),row.slice()]});
  const ss={getSheets:()=>[sheet],getSheetByName:()=>({getLastRow:()=>1,appendRow:r=>history.push(r)})};
  const properties={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
  const ctx=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>properties},SpreadsheetApp:{openById(id){opened.push(id);return ss;},flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>!ctx.locked,releaseLock(){ctx.released=true;}})},Utilities:{formatDate:()=> '2026-11-01',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},UrlFetchApp:{fetch(url,opts){notifications.push({url,opts});if(ctx.networkError)throw Error('mock timeout');return {getResponseCode:()=>ctx.httpStatus};}},ContentService:{MimeType:{TEXT:'text',JSON:'json',JAVASCRIPT:'js'},createTextOutput(text){return {text,setMimeType(type){this.type=type;return this;}}}}});
  ctx.httpStatus=200;
  // Placeholder value, no live network: UrlFetchApp is entirely mocked.
  props.set('DISCORD_WEBHOOK_URL','https://discord.com/api/webhooks/0/FAKE_TEST_ONLY');
  for(const file of ['src/model.js','backend/Core.gs','backend/'+kind+'.gs'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return {ctx,props,row,sheet,ss,writes,notifications,history,opened};
}
const input=(id='a',client='b',name='ア')=>({requestId:id.repeat(36),clientId:client.repeat(36),name});
function batchService(f,read){
  const calls=[];
  f.ctx.Sheets={Spreadsheets:{Values:{batchGet(id,options){calls.push({id,options});return read(options);}}}};
  return calls;
}

test('batch roster reads all year sheets once and preserves public/private values and save revisions',()=>{
  const f=fixture('Training');
  f.row[0]=new Date('2020-01-15T15:00:00Z');f.row[6]='-';f.row[8]='2';f.row[10]='';f.row[14]=false;
  f.ctx.Utilities.formatDate=v=>new Date(+v+9*3600000).toISOString().slice(0,10);
  const legacyPublic=f.ctx.webRoster_(false),legacyPrivate=f.ctx.webRoster_(true);
  const calls=batchService(f,()=>({valueRanges:[{values:[headers.slice(),[...f.row]]}]}));
  // The API returns numeric serial dates, not Date objects.
  f.ctx.Sheets.Spreadsheets.Values.batchGet=(id,options)=>{
    calls.push({id,options});const row=f.row.slice();row[0]=Date.parse('2020-01-16T00:00:00Z')/86400000+25569;
    return {valueRanges:[{values:[headers.slice(),row]}]};
  };
  const before=f.sheet.getDataRange;f.sheet.getDataRange=()=>{throw Error('per-year read must not run');};
  const pick=r=>JSON.parse(JSON.stringify({operators:r.operators,history:r.history}));
  const metrics={};
  assert.deepEqual(pick(f.ctx.webRoster_(false,{metrics})),pick(legacyPublic));
  const current=f.ctx.webRoster_(true);
  assert.deepEqual(pick(current),pick(legacyPrivate));
  assert.equal(calls.length,2);assert.equal(metrics.mode,'batch');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{id:'TEST_ONLY_SHEET',options:{ranges:["'2020年'"],majorDimension:'ROWS',valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}});
  f.sheet.getDataRange=before;
  const op=current.operators[0];const saved=f.ctx.webSaveTraining_({name:op.name,version:op.version,values:{...op.training,s2:'M3'}});
  assert.equal(saved.skills[1],'M3');assert.equal(saved.potential,'-');
  assert.throws(()=>f.ctx.webSaveTraining_({name:op.name,version:op.version,values:op.training}),/別の画面/);
});

test('batch discovers new years each time, skips other sheets and handles omitted trailing cells',()=>{
  const f=fixture();let years=['2020年','2021年','集計','2022年','2023年','2024年'];
  f.ss.getSheets=()=>years.map(name=>({getName:()=>name,getDataRange(){throw Error('not used');}}));
  const headersReordered=[...headers].reverse();
  let rows=[{values:[headers.slice(),f.row.slice()]},{},{values:[headers.slice()]},{values:[headers.slice(),[],['2023-01-01',4,'医療','追加',2,70]]},{values:[headersReordered,[...f.row.slice(0,3),'別名',...f.row.slice(4)].reverse()]}];
  const calls=batchService(f,()=>({valueRanges:rows}));
  const roster=f.ctx.webRoster_(true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.ranges)),["'2020年'","'2021年'","'2022年'","'2023年'","'2024年'"]);
  assert.deepEqual(Array.from(roster.operators,o=>o.name),['ア','追加','別名']);
  assert.equal(roster.operators[1].owned,false);assert.equal(roster.operators[1].potential,null);
  assert.equal(roster.operators[1].training.s1,'');assert.equal(roster.operators[1].training.alpha,'');
  assert.equal(roster.operators[2].potential,18);
  years.push('2025年');rows.push({values:[headers.slice(),['2025-01-01',2,'先鋒','新年度','-',30,6,'-','-','-','-','-','-','-',true]]});
  assert.equal(f.ctx.webRoster_(false).operators.length,4);assert.equal(calls[1].options.ranges.length,6);
  years=[];rows=[];assert.equal(f.ctx.webRoster_(false).operators.length,0);assert.equal(calls.length,2);
});

test('batch keeps duplicate/header checks and does not hide API failures with partial or stale data',()=>{
  const f=fixture();let response={valueRanges:[{values:[headers.slice(),f.row.slice(),f.row.slice()]}]};
  batchService(f,()=>response);
  assert.throws(()=>f.ctx.webRoster_(false),/重複/);
  response={valueRanges:[{values:[['名前'],['ア']]}]};assert.throws(()=>f.ctx.webRoster_(true),/見出し/);
  for(const bad of [null,{}, {valueRanges:[]},{valueRanges:[null]},{valueRanges:[{values:'bad'}]},{valueRanges:[{values:[123]}]}]){
    response=bad;assert.throws(()=>f.ctx.webRoster_(false),/取得結果|形式/);
  }
  f.sheet.getDataRange=()=>{throw Error('must not retry per sheet');};
  batchService(f,()=>{throw Error('mock quota');});assert.throws(()=>f.ctx.webRoster_(false),/mock quota/);
});

test('missing advanced service uses legacy; strict batch and explicit legacy are selectable',()=>{
  const f=fixture(),metrics={};
  f.ctx.webRoster_(false,{metrics});assert.equal(metrics.mode,'legacy');
  f.props.set('ROSTER_READ_MODE','batch');assert.throws(()=>f.ctx.webRoster_(false),/Google Sheets API/);
  const calls=batchService(f,()=>{throw Error('disabled by legacy mode');});
  f.props.set('ROSTER_READ_MODE','legacy');f.ctx.webRoster_(false,{metrics});assert.equal(metrics.mode,'legacy');assert.equal(calls.length,0);
  f.props.set('ROSTER_READ_MODE','typo');assert.throws(()=>f.ctx.webRoster_(false),/ROSTER_READ_MODE/);
});

test('batch GET remains fresh and never includes private fields or timing diagnostics',()=>{
  const f=fixture();let calls=0;batchService(f,()=>{calls++;return {valueRanges:[{values:[headers.slice(),f.row.slice()]}]};});
  const get=()=>JSON.parse(f.ctx.doGet({parameter:{action:'roster',format:'compact'}}).text);
  const first=get();assert.equal(first.ok,true);assert.equal(first.data.operators[0][6],18);
  f.row[6]=19;const second=get();assert.equal(second.data.operators[0][6],19);assert.equal(calls,2);
  assert.deepEqual(Object.keys(second.data).sort(),['format','history','operators','updatedAt','version']);
  assert.equal(second.data.operators[0].length,10);
});

test('benchmark reads both paths without writes and returns only timing/counts and equivalence',()=>{
  const f=fixture();batchService(f,()=>({valueRanges:[{values:[headers.slice(),f.row.slice()]}]}));
  const results=f.ctx.benchmarkRosterReads_();
  assert.equal(results.length,4);assert.equal(results[1].sameData,true);assert.equal(results[3].sameData,true);
  assert.deepEqual(Array.from(results,r=>r.mode),['legacy','batch','batch','legacy']);
  assert.equal(f.writes.length,0);assert.equal(f.notifications.length,0);
  assert.doesNotMatch(JSON.stringify(results),/TEST_ONLY_SHEET|training|version|ア/);
});

test('spreadsheet access uses only the script property and fails closed when missing',()=>{
  const f=fixture();
  assert.equal(f.ctx.webSpreadsheet_(),f.ss);
  assert.deepEqual(f.opened,['TEST_ONLY_SHEET']);
  for(const value of [null,'','   ']){
    if(value===null)f.props.delete('SPREADSHEET_ID');else f.props.set('SPREADSHEET_ID',value);
    assert.throws(()=>f.ctx.webSpreadsheet_(),/SPREADSHEET_ID/);
    const response=JSON.parse(f.ctx.doGet({parameter:{action:'roster'}}).text);
    assert.equal(response.ok,false);assert.doesNotMatch(response.error,/SPREADSHEET_ID|TEST_ONLY/);
  }
  assert.equal(f.opened.length,1);
});

test('privacy checker blocks private identifiers without rejecting examples or the mocked webhook',()=>{
  const {privacyIssues}=require('../scripts/check.cjs');
  const id='1'+'x'.repeat(40),email='private-user'+'@'+'gmail.com';
  for(const source of ["SpreadsheetApp.openById('"+id+"')","const SPREADSHEET_ID = '"+id+"';","getProperty('SPREADSHEET_ID') || '"+id+"'",'https://docs.google.com/spreadsheets/d/'+id+'/edit'])assert.deepEqual(privacyIssues(source,'backend/Core.gs'),['Hardcoded spreadsheet ID']);
  assert.deepEqual(privacyIssues(email,'README.md'),['Email address']);
  assert.deepEqual(privacyIssues('owner@example.test person@example.com 123+handle@users.noreply.github.com','README.md'),[]);
  const webhook='https://discord.com/api/webhooks/0/FAKE_TEST_ONLY';
  assert.deepEqual(privacyIssues(webhook,'tests/backend.test.cjs'),[]);
  assert.deepEqual(privacyIssues(webhook,'assets/config.js'),['Discord webhook']);
});

test('public and private responses retain absent potential and editing another field preserves it',()=>{
  const f=fixture('Training');f.row[6]='-';
  assert.equal(f.ctx.webRoster_(false).operators[0].potential,'-');
  const op=f.ctx.webRoster_(true).operators[0];
  assert.equal(op.potential,'-');assert.equal(op.training.potential,'-');
  const saved=f.ctx.webSaveTraining_({name:op.name,version:op.version,values:{...op.training,s2:'M2'}});
  assert.equal(saved.potential,'-');assert.equal(f.row[6],'-');
  assert.deepEqual(f.writes.map(w=>w.c),[9]);
  f.row[6]='';assert.equal(f.ctx.webRoster_(false).operators[0].potential,null);
});
test('private rows are parsed once while preserving normalized training values and existing revision hashes',()=>{
  const f=fixture();f.row[7]='ｍ３';f.row[8]='2';f.row[9]='-';f.row[10]=null;f.row[12]=undefined;f.row[14]='TRUE';
  let parses=0;const original=f.ctx.Ark.fromRow;f.ctx.Ark.fromRow=(...args)=>{parses++;return original(...args);};
  const op=f.ctx.webOperator_(f.row,headers,true);
  const training={owned:true,elite:2,level:90,potential:18,s1:'M3',s2:'M2',s3:'-',x:'',y:'-',delta:'',alpha:'-'};
  assert.equal(parses,1);assert.deepEqual(JSON.parse(JSON.stringify(op.training)),training);
  assert.equal(op.version,crypto.createHash('sha256').update(JSON.stringify(['ア',training])).digest('hex'));
  const {training:privateTraining,version,...visible}=JSON.parse(JSON.stringify(op));
  assert.deepEqual(visible,JSON.parse(JSON.stringify(f.ctx.webOperator_(f.row,headers,false))));
});

test('roster and operator lookup read one data range per year and retain history order and empty-sheet handling',()=>{
  const f=fixture(),calls={year:0,empty:0,headerOnly:0,history:0};
  const getDataRange=f.sheet.getDataRange;
  f.sheet.getDataRange=()=>{calls.year++;return getDataRange();};
  f.sheet.getLastRow=f.sheet.getLastColumn=f.sheet.getRange=()=>{throw Error('year sheet data range must be used');};
  const empty={getName:()=> '2021年',getDataRange:()=>({getValues(){calls.empty++;return [['']];}})};
  const headerOnly={getName:()=> '2022年',getDataRange:()=>({getValues(){calls.headerOnly++;return [headers.slice()];}})};
  const unrelated={getName:()=> '集計',getDataRange(){throw Error('summary must not be read');}};
  f.ss.getSheets=()=>[f.sheet,empty,headerOnly,unrelated];
  f.ss.getSheetByName=()=>({getLastRow(){calls.history++;return 3;},getRange(r,c,h,w){assert.deepEqual([r,c,h,w],[2,1,2,2]);return {getValues:()=>[['2026-01-01','ア'],['2026-02-01','イ']]};}});
  const roster=f.ctx.webRoster_(true);
  assert.equal(roster.operators.length,1);assert.deepEqual(JSON.parse(JSON.stringify(roster.history)),[{time:'2026-02-01',name:'イ'},{time:'2026-01-01',name:'ア'}]);
  assert.deepEqual(calls,{year:1,empty:1,headerOnly:1,history:1});
  const found=f.ctx.webFindOperator_(f.ss,'ア');assert.equal(found.sheet,f.sheet);assert.equal(found.row,2);
  assert.deepEqual(calls,{year:2,empty:2,headerOnly:2,history:1});
  f.ss.getSheetByName=()=>null;assert.equal(f.ctx.webHistory_(f.ss).length,0);
  f.ss.getSheetByName=()=>({getLastRow:()=>1,getRange(){throw Error('empty history must not be read');}});assert.equal(f.ctx.webHistory_(f.ss).length,0);
});

test('batch operator lookup preserves sheet and row identity, reordered columns and omitted blank cells',()=>{
  const f=fixture(),order=[headers[14],...headers.slice(0,14)],target=f.row.slice();target[3]='対象';target[4]=0;target[14]=false;target.fill('',10,14);
  const row=[target[14],...target.slice(0,14)];
  const tables=new Map([['2020年',[headers.slice(),f.row.slice()]],['2021年',[]],['2022年',[['旧見出し']]],['2026年',[order,[],row.slice(0,11)]]]);
  const makeSheet=name=>({getName:()=>name,getDataRange(){throw Error('per-year read must not run');}});
  const year=makeSheet('2026年'),years=[makeSheet('2020年'),makeSheet('集計'),makeSheet('2021年'),makeSheet('2022年'),year];
  f.ss.getSheets=()=>years;
  const calls=batchService(f,options=>({valueRanges:options.ranges.map(name=>({values:tables.get(name.slice(1,-1))}))}));
  const found=f.ctx.webFindOperator_(f.ss,'対象');
  assert.equal(found.sheet,year);assert.equal(found.row,3);
  assert.deepEqual(Array.from(found.headers),order);assert.deepEqual(Array.from(found.values),row);
  assert.equal(f.ctx.webOperator_(found.values,found.headers,true).version,f.ctx.webOperator_(target,headers,true).version);
  assert.deepEqual(Array.from(calls[0].options.ranges),["'2020年'","'2021年'","'2022年'","'2026年'"]);
  const added=makeSheet('2027年');years.push(added);tables.set('2027年',[headers.slice(),[...f.row.slice(0,3),'新年度',...f.row.slice(4)]]);
  assert.equal(f.ctx.webFindOperator_(f.ss,'新年度').sheet,added);assert.equal(calls.length,2);
  tables.set('2027年',[headers.slice(),target]);assert.throws(()=>f.ctx.webFindOperator_(f.ss,'対象'),/重複/);
  tables.set('2027年',[['名前'],['別名']]);assert.throws(()=>f.ctx.webFindOperator_(f.ss,'対象'),/見出し/);
  years.splice(0);assert.throws(()=>f.ctx.webFindOperator_(f.ss,'対象'),/見つかりません/);assert.equal(calls.length,4);
});

test('lookup modes retain legacy support and batch failures never retry individual year reads',()=>{
  const f=fixture();assert.equal(f.ctx.webFindOperator_(f.ss,'ア').row,2);
  f.props.set('ROSTER_READ_MODE','batch');assert.throws(()=>f.ctx.webFindOperator_(f.ss,'ア'),/Google Sheets API/);
  const calls=batchService(f,()=>{throw Error('mock batch unavailable');});
  f.props.set('ROSTER_READ_MODE','legacy');assert.equal(f.ctx.webFindOperator_(f.ss,'ア').row,2);assert.equal(calls.length,0);
  f.props.set('ROSTER_READ_MODE','auto');f.sheet.getDataRange=()=>{throw Error('must not retry per year');};
  assert.throws(()=>f.ctx.webFindOperator_(f.ss,'ア'),/mock batch unavailable/);assert.equal(calls.length,1);
});

test('support sends once, disables mentions, writes history only after Discord success',()=>{
  const f=fixture(),properties=f.ctx.PropertiesService.getScriptProperties();
  const calls=batchService(f,()=>({valueRanges:[{values:[headers.slice(),f.row.slice()]}]}));
  f.sheet.getDataRange=()=>{throw Error('per-year read must not run');};
  const getProperties=properties.getProperties,getProperty=properties.getProperty;
  let snapshots=0,individualReads=0;
  properties.getProperties=()=>{snapshots++;return getProperties();};
  properties.getProperty=key=>{individualReads++;return getProperty(key);};
  f.props.set('REQUEST_COOLDOWN_SECONDS','45');
  const receipt=f.ctx.receiveSupport_(input());
  assert.equal(receipt.status,'sent');assert.equal(receipt.retryAt-receipt.createdAt,45000);
  assert.equal(snapshots,1);assert.equal(individualReads,0);
  assert.equal(f.ctx.receiveSupport_(input()).status,'sent');
  assert.equal(calls.length,1);
  assert.deepEqual(f.opened,['TEST_ONLY_SHEET']);
  assert.equal(f.notifications.length,1);assert.equal(f.history.length,1);
  assert.match(f.notifications[0].url,/\?wait=true$/);
  assert.deepEqual(JSON.parse(f.notifications[0].opts.payload).allowed_mentions,{parse:[]});
  assert.equal(f.ctx.supportReceipt_('a'.repeat(36)).status,'sent');
});

test('invalid or failed batch support lookup never notifies or reserves the request',()=>{
  for(const kind of ['missing','duplicate','header','failed']){
    const f=fixture();f.sheet.getDataRange=()=>{throw Error('must not retry per year');};
    const calls=batchService(f,()=>{
      if(kind==='failed')throw Error('mock batch unavailable');
      return {valueRanges:[{values:kind==='header'?[['名前'],['ア']]:[headers.slice(),f.row.slice(),...(kind==='duplicate'?[f.row.slice()]:[])]}]};
    });
    assert.throws(()=>f.ctx.receiveSupport_(input('a','b',kind==='missing'?'不在':'ア')));
    assert.equal(calls.length,1);assert.equal(f.notifications.length,0);assert.equal(f.history.length,0);
    assert.equal(f.props.has('ARK_SUPPORT_GUARD'),false);assert.equal(f.props.has('ARK_RECEIPT_'+'a'.repeat(36)),false);
    assert.equal(f.ctx.released,true);
  }
});
test('rotating client cannot bypass same-operator cooldown; global and daily guards apply',()=>{
  const f=fixture(),c=f.ctx,limits={cooldown:180000,global:15000,daily:2};
  let a=c.supportReserve_(null,input(),1000,'day1',limits);
  assert.equal(c.supportReserve_(a.guard,input('c','d'),17000,'day1',limits).receipt.status,'cooldown');
  assert.equal(c.supportReserve_(a.guard,input('c','d','W'),2000,'day1',limits).receipt.status,'cooldown');
  let b=c.supportReserve_(a.guard,input('c','d','W'),17000,'day1',limits);
  assert.equal(b.receipt.status,'pending');
  assert.equal(c.supportReserve_(b.guard,input('e','f','別'),400000,'day1',limits).receipt.status,'limited');
  assert.equal(c.supportReserve_(b.guard,input('e','f','別'),400000,'day2',limits).receipt.status,'pending');
});
test('Discord failure or ambiguous response is never recorded as successful',()=>{
  for(const [code,status] of [[400,'failed'],[429,'failed'],[500,'uncertain']]){
    const f=fixture();f.ctx.httpStatus=code;assert.equal(f.ctx.receiveSupport_(input()).status,status);assert.equal(f.history.length,0);
  }
  const f=fixture();f.ctx.networkError=true;assert.equal(f.ctx.receiveSupport_(input()).status,'uncertain');assert.equal(f.history.length,0);
});
test('missing webhook, unknown operator, invalid token and GET log never send',()=>{
  const f=fixture();f.props.delete('DISCORD_WEBHOOK_URL');assert.equal(f.ctx.receiveSupport_(input()).status,'unavailable');assert.equal(f.notifications.length,0);
  const g=fixture();assert.throws(()=>g.ctx.receiveSupport_(input('a','b','不在')));assert.throws(()=>g.ctx.receiveSupport_({...input(),requestId:'x'}));
  assert.equal(JSON.parse(g.ctx.doGet({parameter:{action:'log'}}).text).ok,false);assert.equal(g.notifications.length,0);
});
test('JSONP allows only generated callback names and escapes script delimiters',()=>{
  const c=fixture().ctx;
  assert.equal(c.publicOutput_({},'alert(1)').text,'Invalid callback');
  const r=c.publicOutput_({name:'</script>\u2028'},'__ark_cb_'+'a'.repeat(36));
  assert.equal(r.type,'js');assert.equal(r.text.includes('</script>'),false);assert.match(r.text,/\\u003c/);
});
test('compact public roster is opt-in, contains the same public data, and reads fresh values',()=>{
  const f=fixture();f.row[6]='-';
  const callback='__ark_cb_'+'a'.repeat(36);
  const read=(parameter)=>{
    const r=f.ctx.doGet({parameter:{action:'roster',callback,...parameter}});
    assert.equal(r.type,'js');
    assert.ok(r.text.startsWith(callback+'(')&&r.text.endsWith(');'));
    const response=JSON.parse(r.text.slice(callback.length+1,-2));
    assert.equal(response.ok,true);
    return response.data;
  };
  const original=read(),compact=read({format:'compact'});
  assert.equal(original.format,undefined);
  assert.equal(compact.format,'compact');
  assert.equal(compact.version,original.version);
  assert.deepEqual(compact.history,original.history);
  assert.deepEqual(original.operators,[{name:'ア',rarity:6,job:'特殊',owned:true,elite:2,level:90,potential:'-',skills:['M3','M3','M3'],modules:['3','-','-','-'],date:'2020-01-16'}]);
  assert.deepEqual(compact.operators,[['ア',6,'特殊',true,2,90,'-',['M3','M3','M3'],['3','-','-','-'],'2020-01-16']]);
  f.row[6]='';
  assert.equal(read({format:'compact'}).operators[0][6],null);
});
test('receipt cleanup keeps bounded recent receipts and removes expired entries',()=>{
  const f=fixture(),now=Date.now();for(let i=0;i<160;i++)f.props.set('ARK_RECEIPT_'+i,JSON.stringify({createdAt:now-i}));
  f.props.set('ARK_RECEIPT_old',JSON.stringify({createdAt:0}));
  const properties=f.ctx.PropertiesService.getScriptProperties();
  f.ctx.supportCleanReceipts_(properties,properties.getProperties(),now);
  assert.equal([...f.props.keys()].filter(k=>k.startsWith('ARK_RECEIPT_')).length,149);
});
test('private save updates only changed editable cells, retains excess potential and metadata',()=>{
  const f=fixture('Training'),op=f.ctx.webOperator_(f.row,headers,true),before=f.row.slice();
  const saved=f.ctx.webSaveTraining_({name:op.name,version:op.version,values:{...op.training,potential:19,s2:'M2'}});
  assert.equal(saved.potential,19);assert.equal(saved.skills[1],'M2');assert.equal(saved.name,'ア');assert.equal(f.ctx.released,true);
  assert.deepEqual(f.row.slice(0,6),before.slice(0,6));assert.deepEqual(f.writes.map(w=>w.c),[7,9]);assert.notEqual(saved.version,op.version);
  assert.throws(()=>f.ctx.webSaveTraining_({name:op.name,version:op.version,values:op.training}),/別の画面/);
});

test('batch save searches once with one settings snapshot and preserves fresh-row checks and changed-column writes',()=>{
  const f=fixture('Training'),op=f.ctx.webOperator_(f.row,headers,true),properties=f.ctx.PropertiesService.getScriptProperties();
  let snapshots=0,currentReads=0;const getProperties=properties.getProperties,getRange=f.sheet.getRange;
  properties.getProperties=()=>{snapshots++;return getProperties();};
  properties.getProperty=()=>{throw Error('settings must be reused');};
  f.sheet.getDataRange=()=>{throw Error('per-year read must not run');};
  f.sheet.getRange=(...args)=>{const range=getRange(...args),getValues=range.getValues;range.getValues=()=>{currentReads++;return getValues();};return range;};
  const calls=batchService(f,()=>{const row=f.row.slice();row[0]=Date.parse('2020-01-16T00:00:00Z')/86400000+25569;return {valueRanges:[{values:[headers.slice(),row]}]};});
  const saved=f.ctx.webSaveTraining_({name:op.name,version:op.version,values:{...op.training,potential:19,s2:'M2'}});
  assert.equal(calls.length,1);assert.equal(snapshots,1);assert.equal(currentReads,2);
  assert.equal(saved.date,'2020-01-16');assert.equal(saved.potential,19);assert.equal(saved.skills[1],'M2');
  assert.deepEqual(f.writes.map(w=>w.c),[7,9]);assert.equal(f.ctx.released,true);
});

test('batch save pads omitted blank cells without creating writes or checking unchanged formulas',()=>{
  const f=fixture('Training'),order=[headers[14],...headers.slice(0,14)];f.row.fill('',10,14);
  const current=[f.row[14],...f.row.slice(0,14)],op=f.ctx.webOperator_(current,order,true);let reads=0;
  f.sheet.getDataRange=()=>{throw Error('per-year read must not run');};
  f.sheet.getRange=(r,c,h,w)=>{
    assert.deepEqual([r,c,h,w],[3,1,1,order.length]);
    return {getValues(){reads++;return [current.slice()];},getFormulas(){throw Error('unchanged formulas must not be read');},setValues(){throw Error('unchanged blank cells must not be written');}};
  };
  f.ctx.SpreadsheetApp.flush=()=>{throw Error('unchanged save must not flush');};
  const calls=batchService(f,()=>({valueRanges:[{values:[order,[],current.slice(0,11)]}]}));
  const saved=f.ctx.webSaveTraining_({name:op.name,version:op.version,values:op.training});
  assert.equal(saved.version,op.version);assert.equal(reads,1);assert.equal(calls.length,1);assert.equal(f.writes.length,0);
});

test('batch save still rejects stale edits, row movement, formulas, duplicates and unavailable reads before writing',()=>{
  for(const kind of ['stale','row-change','formula','duplicate','failed']){
    const f=fixture('Training'),op=f.ctx.webOperator_(f.row,headers,true),getRange=f.sheet.getRange;
    f.sheet.getDataRange=()=>{throw Error('must not retry per year');};
    if(kind==='stale')f.row[6]=20;
    if(kind==='formula')f.sheet.formula=6;
    if(kind==='row-change')f.sheet.getRange=(...args)=>{const range=getRange(...args);range.getValues=()=>{const row=f.row.slice();row[3]='移動後の別人';return [row];};return range;};
    const calls=batchService(f,()=>{
      if(kind==='failed')throw Error('mock batch unavailable');
      return {valueRanges:[{values:[headers.slice(),f.row.slice(),...(kind==='duplicate'?[f.row.slice()]:[])]}]};
    });
    const pattern={'stale':/別の画面/,'row-change':/保存前に行が変更/,'formula':/数式/,'duplicate':/重複/,'failed':/mock batch unavailable/}[kind];
    assert.throws(()=>f.ctx.webSaveTraining_({name:op.name,version:op.version,values:{...op.training,potential:19}}),pattern);
    assert.equal(calls.length,1);assert.equal(f.writes.length,0);assert.equal(f.ctx.released,true);
  }
});
test('private save refuses formulas, duplicate names, and busy locks',()=>{
  const f=fixture('Training'),op=f.ctx.webOperator_(f.row,headers,true),p={name:op.name,version:op.version,values:{...op.training,potential:19}};
  f.sheet.formula=6;assert.throws(()=>f.ctx.webSaveTraining_(p),/数式/);assert.equal(f.writes.length,0);
  f.sheet.formula=null;f.ss.getSheets=()=>[f.sheet,f.sheet];assert.throws(()=>f.ctx.webSaveTraining_(p),/重複/);
  f.ctx.locked=true;assert.throws(()=>f.ctx.webSaveTraining_(p),/別の保存/);
});

test('unchanged training checks the current row and skips formula reads, writes and flush',()=>{
  const f=fixture('Training'),op=f.ctx.webOperator_(f.row,headers,true);
  let currentReads=0,current=f.row.slice();
  f.sheet.getRange=(row,column,height,width)=>{
    assert.deepEqual([row,column,height,width],[2,1,1,headers.length]);
    return {getValues(){currentReads++;return [current.slice()];},getFormulas(){throw Error('unexpected formula read');}};
  };
  f.ctx.SpreadsheetApp.flush=()=>{throw Error('unexpected flush');};
  const request={name:op.name,version:op.version,values:op.training};
  current[0]='2020-01-17';
  const saved=f.ctx.webSaveTraining_(request);
  assert.equal(saved.version,op.version);
  assert.equal(saved.date,'2020-01-17');
  assert.equal(currentReads,1);
  current[6]=19;
  assert.throws(()=>f.ctx.webSaveTraining_(request),/保存前に行が変更/);
  assert.equal(currentReads,2);
});
