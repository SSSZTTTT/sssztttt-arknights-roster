const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const headers=['実装日','レア','職業','オペレーター名','昇進','Lv','潜在','S1','S2','S3','X','Y','Δ','α','所持状態'];
function fixture(kind='PublicApi'){
  const props=new Map(),writes=[],notifications=[],history=[];
  const row=['2020-01-16',6,'特殊','ア',2,90,18,'M3','M3','M3',3,'-','-','-',true];
  const sheet={getName:()=> '2020年',getLastRow:()=>2,getLastColumn:()=>15,getRange(r,c,h,w){return {getValues:()=>r===1?[headers.slice(),row.slice()]:[row.slice(c-1,c-1+w)],getFormulas:()=>[headers.map((_,i)=>sheet.formula===i?'=1':'')],setValues(v){writes.push({c,values:v[0]});row.splice(c-1,w,...v[0]);}}}};
  const ss={getSheets:()=>[sheet],getSheetByName:()=>({getLastRow:()=>1,appendRow:r=>history.push(r)})};
  const properties={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
  const ctx=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>properties},SpreadsheetApp:{openById:()=>ss,flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>!ctx.locked,releaseLock(){ctx.released=true;}})},Session:{getActiveUser:()=>({getEmail:()=>ctx.email})},Utilities:{formatDate:()=> '2026-11-01',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},UrlFetchApp:{fetch(url,opts){notifications.push({url,opts});if(ctx.networkError)throw Error('mock timeout');return {getResponseCode:()=>ctx.httpStatus};}},ContentService:{MimeType:{TEXT:'text',JSON:'json',JAVASCRIPT:'js'},createTextOutput(text){return {text,setMimeType(type){this.type=type;return this;}}}}});
  ctx.httpStatus=200;ctx.email='owner@example.test';props.set('OWNER_EMAIL',ctx.email);
  function html(text){return {text,setTitle(title){this.title=title;return this;},addMetaTag(name,content){this.meta={name,content};return this;}};}
  ctx.HtmlService={createHtmlOutput:html,createHtmlOutputFromFile(name){if(ctx.htmlError)throw Error('missing '+name);return html('<html>入力画面</html>');}};
  // Placeholder value, no live network: UrlFetchApp is entirely mocked.
  props.set('DISCORD_WEBHOOK_URL','https://discord.com/api/webhooks/0/FAKE_TEST_ONLY');
  for(const file of ['src/model.js','backend/Core.gs','backend/'+kind+'.gs'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return {ctx,props,row,sheet,ss,writes,notifications,history};
}
const input=(id='a',client='b',name='ア')=>({requestId:id.repeat(36),clientId:client.repeat(36),name});
test('support sends once, disables mentions, writes history only after Discord success',()=>{
  const f=fixture();assert.equal(f.ctx.receiveSupport_(input()).status,'sent');
  assert.equal(f.ctx.receiveSupport_(input()).status,'sent');
  assert.equal(f.notifications.length,1);assert.equal(f.history.length,1);
  assert.match(f.notifications[0].url,/\?wait=true$/);
  assert.deepEqual(JSON.parse(f.notifications[0].opts.payload).allowed_mentions,{parse:[]});
  assert.equal(f.ctx.supportReceipt_('a'.repeat(36)).status,'sent');
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
test('receipt cleanup keeps bounded recent receipts and removes expired entries',()=>{
  const f=fixture(),now=Date.now();for(let i=0;i<160;i++)f.props.set('ARK_RECEIPT_'+i,JSON.stringify({createdAt:now-i}));
  f.props.set('ARK_RECEIPT_old',JSON.stringify({createdAt:0}));f.ctx.supportCleanReceipts_({getProperties:()=>Object.fromEntries(f.props),deleteProperty:k=>f.props.delete(k)},now);
  assert.equal([...f.props.keys()].filter(k=>k.startsWith('ARK_RECEIPT_')).length,149);
});
test('owner-only deployment does not depend on availability of email identity',()=>{
  const f=fixture('Admin');
  delete f.ctx.Session;f.props.delete('OWNER_EMAIL');
  assert.match(f.ctx.doGet().text,/入力画面/);
  const op=f.ctx.getTrainingData().operators[0];
  assert.equal(f.ctx.saveTraining({name:op.name,version:op.version,values:{...op.training,potential:19}}).potential,19);
});
test('HTML failures have a specific message instead of an authentication error',()=>{
  const f=fixture('Admin');f.ctx.htmlError=true;f.ctx.console={error(){}};
  const response=f.ctx.doGet();assert.match(response.text,/ADMIN_HTML_LOAD/);assert.doesNotMatch(response.text,/OWNER_EMAIL|本人専用の入力ツールです/);
  assert.equal(response.meta.name,'viewport');assert.equal(f.writes.length,0);
});
test('admin deployment manifest uses Google owner-only access without email scope',()=>{
  const manifest=JSON.parse(fs.readFileSync('gas/admin/appsscript.json','utf8'));
  assert.deepEqual(manifest.webapp,{access:'MYSELF',executeAs:'USER_DEPLOYING'});
  assert.equal(manifest.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'),false);
});
test('private save updates only changed editable cells, retains excess potential and metadata',()=>{
  const f=fixture('Admin'),op=f.ctx.webOperator_(f.row,headers,true),before=f.row.slice();
  const saved=f.ctx.saveTraining({name:op.name,version:op.version,values:{...op.training,potential:19,s2:'M2'}});
  assert.equal(saved.potential,19);assert.equal(saved.skills[1],'M2');assert.equal(saved.name,'ア');assert.equal(f.ctx.released,true);
  assert.deepEqual(f.row.slice(0,6),before.slice(0,6));assert.deepEqual(f.writes.map(w=>w.c),[7,9]);assert.notEqual(saved.version,op.version);
  assert.throws(()=>f.ctx.saveTraining({name:op.name,version:op.version,values:op.training}),/別の画面/);
});
test('private save refuses formulas, duplicate names, and busy locks',()=>{
  const f=fixture('Admin'),op=f.ctx.webOperator_(f.row,headers,true),p={name:op.name,version:op.version,values:{...op.training,potential:19}};
  f.sheet.formula=6;assert.throws(()=>f.ctx.saveTraining(p),/数式/);assert.equal(f.writes.length,0);
  f.sheet.formula=null;f.ss.getSheets=()=>[f.sheet,f.sheet];assert.throws(()=>f.ctx.saveTraining(p),/重複/);
  f.ctx.locked=true;assert.throws(()=>f.ctx.saveTraining(p),/別の保存/);
});
