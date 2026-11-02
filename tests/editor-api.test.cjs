const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function fixture(){
  let now=1900000000000,reads=0,writes=0;const calls=[];
  const props=new Map([['OAUTH_CLIENT_ID','test-client.apps.googleusercontent.com'],['OAUTH_CLIENT_SECRET','test-secret'],['OWNER_EMAIL','owner@example.test'],['EDITOR_ORIGIN','https://owner.github.io']]);
  const p={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
  const c=vm.createContext({console,Date:{now:()=>now},PropertiesService:{getScriptProperties:()=>p},LockService:{getScriptLock:()=>({tryLock:()=>!c.busy,releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString('utf8')})},webRoster_:()=>{reads++;return {operators:[],history:[]};},webSaveTraining_:input=>{writes++;return input;},ContentService:{createTextOutput:text=>({text})},HtmlService:{XFrameOptionsMode:{ALLOWALL:'all'},createHtmlOutput:text=>({text,setXFrameOptionsMode(value){this.mode=value;return this;}})},UrlFetchApp:{fetch(url,options){calls.push({url,options});if(c.networkError)throw Error('secret error');return {getResponseCode:()=>c.http,getContentText:()=>JSON.stringify({id_token:'header.'+Buffer.from(JSON.stringify(c.claims)).toString('base64url')+'.signature',access_token:'DO_NOT_RETURN',refresh_token:'DO_NOT_STORE'})};}}});
  c.http=200;c.claims={iss:'https://accounts.google.com',aud:'test-client.apps.googleusercontent.com',sub:'google-user-123',email:'owner@example.test',email_verified:true,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600};
  vm.runInContext(fs.readFileSync('backend/EditorApi.gs','utf8'),c);
  function prepare(){const secret='b'.repeat(64),r=c.editorPrepare_({binding:c.editorHash_(secret)},c.editorConfig_());return {...r,bindingSecret:secret,code:'one-use-google-code'};}
  function login(){return c.editorLogin_(prepare(),c.editorConfig_());}
  function request(action,input={},token=''){return c.doPost({parameter:{payload:JSON.stringify({nonce:'a'.repeat(64),action,input,token})}});}
  return {c,props,calls,prepare,login,request,advance:ms=>now+=ms,get reads(){return reads;},get writes(){return writes;}};
}
test('editor rejects unauthenticated reads and writes before accessing the sheet',()=>{
  const f=fixture();for(const action of ['read','save']){
    const r=f.request(action,{name:'ア'});assert.match(r.text,/AUTH_REQUIRED/);assert.equal(r.mode,'all');
  }
  assert.equal(f.reads,0);assert.equal(f.writes,0);assert.equal(f.calls.length,0);
  assert.doesNotMatch(f.request('read').text,/owner@example|test-secret|client\.apps/);
});
test('Google code exchange accepts only owner and stores hashed expiring sessions, not Google tokens',()=>{
  const f=fixture(),s=f.login();assert.match(s.token,/^[a-f0-9]{64}$/);assert.equal(f.props.get('OWNER_GOOGLE_SUB'),'google-user-123');
  const call=f.calls[0];assert.equal(call.url,'https://oauth2.googleapis.com/token');assert.equal(call.options.payload.redirect_uri,'https://owner.github.io');assert.equal(call.options.followRedirects,false);assert.equal(call.options.payload.client_secret,'test-secret');
  assert.equal(JSON.stringify([...f.props]).includes(s.token),false);assert.doesNotMatch(JSON.stringify([...f.props]),/DO_NOT_RETURN|DO_NOT_STORE|signature/);
  assert.match(f.request('read',{},s.token).text,/"ok":true/);assert.equal(f.reads,1);
  assert.match(f.request('save',{name:'ア'},s.token).text,/"ok":true/);assert.equal(f.writes,1);
});
test('wrong account, unverified email, wrong audience, issuer, azp, expiration and subject are rejected',()=>{
  const changes=[{email:'other@example.test'},{email_verified:false},{aud:'other-client'},{iss:'https://attacker.example.test'},{azp:'other-client'},{exp:1},{iat:9999999999},{sub:''}];
  for(const change of changes){const f=fixture();Object.assign(f.c.claims,change);assert.throws(()=>f.login());assert.equal([...f.props.keys()].some(k=>k.startsWith('ARK_EDITOR_SESSION_')),false);assert.equal(f.reads,0);assert.equal(f.writes,0);}
  const f=fixture();f.props.set('OWNER_GOOGLE_SUB','different-user');assert.throws(()=>f.login(),/利用できません/);
});
test('state is single-use, expires, is bound to this browser and invalidates on config changes',()=>{
  const f=fixture(),a=f.prepare();assert.throws(()=>f.c.editorLogin_({...a,bindingSecret:'c'.repeat(64)},f.c.editorConfig_()));assert.equal(f.calls.length,0);
  f.c.editorLogin_(a,f.c.editorConfig_());assert.throws(()=>f.c.editorLogin_(a,f.c.editorConfig_()));assert.equal(f.calls.length,1);
  const g=fixture(),b=g.prepare();g.advance(300001);assert.throws(()=>g.c.editorLogin_(b,g.c.editorConfig_()));assert.equal(g.calls.length,0);
  const h=fixture(),d=h.prepare();h.props.set('OAUTH_CLIENT_SECRET','changed');assert.throws(()=>h.c.editorLogin_(d,h.c.editorConfig_()));assert.equal(h.calls.length,0);
});
test('client-supplied identity tokens cannot bypass code exchange; failed exchange never creates session',()=>{
  const f=fixture(),a=f.prepare();assert.throws(()=>f.c.editorLogin_({...a,code:undefined,id_token:'forged'},f.c.editorConfig_()));assert.equal(f.calls.length,0);
  f.c.http=400;assert.throws(()=>f.c.editorLogin_(a,f.c.editorConfig_()));assert.equal([...f.props.keys()].some(k=>k.startsWith('ARK_EDITOR_SESSION_')),false);
  assert.throws(()=>f.c.editorLogin_(a,f.c.editorConfig_()));assert.equal(f.calls.length,1);
});
test('expired, revoked and configuration-invalidated sessions cannot read or write',()=>{
  for(const mode of ['expired','logout','version','owner','secret']){
    const f=fixture(),s=f.login();
    if(mode==='expired')f.advance(12*3600000+1);
    if(mode==='logout')f.request('logout',{},s.token);
    if(mode==='version')f.props.set('SESSION_VERSION','2');
    if(mode==='owner')f.props.set('OWNER_EMAIL','changed@example.test');
    if(mode==='secret')f.props.set('OAUTH_CLIENT_SECRET','new-secret');
    assert.match(f.request('read',{},s.token).text,/AUTH_REQUIRED/);assert.match(f.request('save',{},s.token).text,/AUTH_REQUIRED/);assert.equal(f.reads,0);assert.equal(f.writes,0);
  }
});
test('anonymous state storage and hourly login attempts are bounded',()=>{
  const f=fixture();for(let i=0;i<80;i++)f.prepare();assert.equal([...f.props.keys()].filter(k=>k.startsWith('ARK_EDITOR_CHALLENGE_')).length,20);
  assert.throws(()=>f.prepare(),/しばらく待って/);f.advance(3600001);f.prepare();assert.equal([...f.props.keys()].filter(k=>k.startsWith('ARK_EDITOR_CHALLENGE_')).length,1);
});
test('only five active sessions are retained and raw tokens are not properties',()=>{
  const f=fixture(),sessions=[];for(let i=0;i<6;i++){sessions.push(f.login());f.advance(1);}
  assert.equal([...f.props.keys()].filter(k=>k.startsWith('ARK_EDITOR_SESSION_')).length,5);assert.match(f.request('read',{},sessions[0].token).text,/AUTH_REQUIRED/);assert.match(f.request('read',{},sessions[5].token).text,/"ok":true/);
});
test('reply escapes executable markup and targets only configured origin',()=>{
  const f=fixture(),r=f.c.editorReply_('a'.repeat(64),{value:'</script><script>alert(1)</script>\u2028'},'https://owner.github.io');
  assert.equal((r.text.match(/<script>/g)||[]).length,1);assert.match(r.text,/\\u003c/);assert.match(r.text,/\\u2028/);assert.match(r.text,/,"https:\/\/owner.github.io"\)/);assert.doesNotMatch(r.text,/,"\*"\)/);
});
test('malformed envelopes, oversized requests, GET and missing config never expose data',()=>{
  const f=fixture();assert.equal(f.c.doPost({parameter:{payload:'not-json'}}).text,'Request unavailable');assert.equal(f.c.doPost({parameter:{payload:'x'.repeat(20001)}}).text,'Request unavailable');assert.doesNotMatch(f.c.doGet().text,/operators|email|secret/i);
  f.props.delete('OWNER_EMAIL');assert.equal(f.request('read').text,'Request unavailable');assert.equal(f.reads,0);
});
test('new public endpoint exposes no unauthenticated training RPC; old owner-only app remains separate',()=>{
  const files=fs.readdirSync('gas/editor').filter(n=>n.endsWith('.gs')).map(n=>fs.readFileSync('gas/editor/'+n,'utf8')).join('\n');
  const globals=vm.createContext({});vm.runInContext(files,globals);
  const exposed=Object.keys(globals).filter(n=>typeof globals[n]==='function'&&!n.endsWith('_')).sort();
  assert.deepEqual(exposed,['doGet','doPost']);
  assert.equal(JSON.parse(fs.readFileSync('gas/admin/appsscript.json','utf8')).webapp.access,'MYSELF');
  assert.equal(JSON.parse(fs.readFileSync('gas/editor/appsscript.json','utf8')).webapp.access,'ANYONE_ANONYMOUS');
});
