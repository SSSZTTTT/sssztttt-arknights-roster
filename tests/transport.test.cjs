const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(statuses){
  let counter=0;const sent=[],store=new Map();
  const window={ARK_CONFIG:{apiUrl:'https://script.google.com/macros/s/TEST/exec'}};
  const ctx=vm.createContext({window,location:{search:''},URL,URLSearchParams,Uint8Array,Date,console,structuredClone,crypto:{getRandomValues(a){a.fill(++counter);return a;}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout:(fn,ms)=>ms===25000?123:setImmediate(fn),clearTimeout(){},fetch:async(u,opts)=>{sent.push(opts);return {type:'opaque',status:0};},document:{createElement:()=>({remove(){}}),head:{append(s){const url=new URL(s.src),cb=url.searchParams.get('callback');setImmediate(()=>window[cb]({ok:true,data:statuses.shift()||{status:'not_found'}}));}}}});
  vm.runInContext(fs.readFileSync('src/transport.js','utf8'),ctx);return {t:window.ArkTransport,sent,store};
}
test('opaque POST is followed by receipt polling and only sent status is success',async()=>{
  const f=setup([{status:'pending'},{status:'sent',retryAt:1234}]);const r=await f.t.request('ア');
  assert.equal(r.status,'sent');assert.equal(f.sent.length,1);assert.equal(f.sent[0].mode,'no-cors');assert.equal(f.sent[0].body.get('name'),'ア');assert.equal(f.store.get('ark_pending'),'');
});
test('opaque POST without receipt becomes uncertain, not successful or auto-resubmitted',async()=>{
  const f=setup([]);const r=await f.t.request('W');assert.equal(r.status,'uncertain');assert.equal(f.sent.length,1);assert.ok(f.store.get('ark_pending'));
});
test('pending result recovery never repeats the POST',async()=>{
  const f=setup([{status:'sent'}]);f.store.set('ark_pending',JSON.stringify({requestId:'a'.repeat(36),name:'W'}));
  assert.equal((await f.t.recover()).status,'sent');assert.equal(f.sent.length,0);assert.equal(f.store.get('ark_pending'),'');
});
