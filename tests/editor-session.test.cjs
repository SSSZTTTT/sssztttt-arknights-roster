const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('src/editor.js','utf8'),key='ark_editor_session_v1:/edit/',endpoint='https://script.google.com/macros/s/TEST/exec',token='a'.repeat(64);
function fixture({local=new Map(),legacy=new Map(),readError,readPromise,loginRoster}={}){
  const elements=new Map(),calls=[],events={},now=1900000000000;let reloads=0;
  let resolveLogin;const loginReady=new Promise(resolve=>{resolveLogin=resolve;});
  function element(){return {hidden:false,disabled:false,textContent:'',dataset:{applicationSrc:'app.js'},classList:{toggle(){}},replaceChildren(){}};}
  const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
  const c=vm.createContext({console,Date:{now:()=>now},crypto:webcrypto,TextEncoder,Uint8Array,setTimeout,clearTimeout,
    ARK_EDITOR_CONFIG:{apiUrl:endpoint},localStorage:storage(local),sessionStorage:storage(legacy),
    location:{pathname:'/edit/',origin:'https://owner.github.io',reload(){reloads++;}},
    document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:()=>element(),head:{append(){}}},
    addEventListener:(name,fn)=>events[name]=fn,
    google:{accounts:{oauth2:{initCodeClient:options=>{resolveLogin(options.callback);return {requestCode(){}};}}}},
    EditorRPC:{create:()=>async(action,input,t)=>{
      calls.push({action,token:t,input});
      if(action==='login')return {token,expiresAt:now+30*86400000,roster:loginRoster};
      if(action==='read'){if(readError)throw readError;return readPromise||{operators:[],history:[],sessionExpiresAt:now+30*86400000};}
      if(action==='prepare')return {origin:'https://owner.github.io',clientId:'test',state:'b'.repeat(64),expiresAt:now+300000};
      if(action==='logout')return {loggedOut:true};
    }}
  });c.window=c;vm.runInContext(source,c);
  return {c,local,legacy,calls,events,elements,loginReady,get reloads(){return reloads;},settle:async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);}};
}
function seed(map,expiry=1900000000000+1000){map.set(key,JSON.stringify({endpoint,token,expiresAt:expiry}));return map;}
test('initial login consumes the bundled roster or reads it separately on older GAS deployments',async()=>{
  const roster={operators:[{name:'ア'}],history:[]};
  for(const loginRoster of [roster,undefined]){
    const f=fixture({loginRoster}),complete=await f.loginReady;
    await complete({state:'b'.repeat(64),code:'one-use-google-code'});
    const data=await f.c.ArkTransport.get();
    assert.equal(data.operators.length,loginRoster?1:0);
    assert.deepEqual(f.calls.map(x=>x.action),loginRoster?['prepare','login']:['prepare','login','read']);
    assert.equal(f.calls[1].input.includeRoster,true);
    assert.deepEqual(Object.keys(JSON.parse(f.local.get(key))).sort(),['endpoint','expiresAt','token']);
  }
});
test('initial roster read failure keeps the issued session and offers a retry',async()=>{
  const f=fixture({readError:Error('Network failed')}),complete=await f.loginReady;
  await complete({state:'b'.repeat(64),code:'one-use-google-code'});
  assert.ok(f.local.has(key));assert.equal(f.c.ArkTransport,undefined);assert.equal(f.elements.get('auth-retry').hidden,false);
});
test('a new browser page restores persistent login, checks the server and stores its extended deadline',async()=>{
  const local=seed(new Map(),1900000000000-1000),f=fixture({local});await f.settle();
  assert.deepEqual(f.calls.map(x=>x.action),['read']);assert.equal(f.elements.get('auth-screen').hidden,true);
  assert.equal(JSON.parse(local.get(key)).expiresAt,1900000000000+30*86400000);
  const reopened=fixture({local});await reopened.settle();assert.equal(reopened.calls[0].token,token);
});
test('an existing tab-only session migrates only after server authentication',async()=>{
  const f=fixture({legacy:seed(new Map())});await f.settle();assert.ok(f.local.has(key));assert.equal(f.legacy.has(key),false);
  const error=Object.assign(Error('Expired'),{code:'AUTH_REQUIRED'}),g=fixture({legacy:seed(new Map()),readError:error});await g.settle();
  assert.equal(g.local.has(key),false);assert.equal(g.legacy.has(key),false);assert.equal(g.c.ArkTransport,undefined);
});
test('a network failure preserves the login and offers retry without exposing the editor',async()=>{
  const local=seed(new Map()),f=fixture({local,readError:Error('Network failed')});await f.settle();
  assert.ok(local.has(key));assert.equal(f.c.ArkTransport,undefined);assert.equal(f.elements.get('auth-retry').hidden,false);
});
test('logout revokes the server session and removes persistent and legacy credentials',async()=>{
  const f=fixture({local:seed(new Map())});await f.settle();await f.c.ArkTransport.logout();
  assert.equal(f.calls.at(-1).action,'logout');assert.equal(f.calls.at(-1).token,token);
  assert.equal(f.local.has(key),false);assert.equal(f.legacy.has(key),false);assert.equal(f.reloads,1);
});
test('a read finishing after another tab logs out cannot restore credentials or reveal the app',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r),f=fixture({local:seed(new Map()),readPromise:pending});
  f.local.delete(key);f.events.storage({key});
  resolve({operators:[],history:[],sessionExpiresAt:1900000000000+30*86400000});await f.settle();
  assert.equal(f.local.has(key),false);assert.equal(f.c.ArkTransport,undefined);assert.equal(f.reloads,1);
});
