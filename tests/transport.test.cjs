const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(statuses){
  let counter=0;const sent=[],requests=[],store=new Map();
  const window={ARK_CONFIG:{apiUrl:'https://script.google.com/macros/s/TEST/exec'}};
  const ctx=vm.createContext({window,location:{search:''},URL,URLSearchParams,Uint8Array,Date,console,structuredClone,crypto:{getRandomValues(a){a.fill(++counter);return a;}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout:(fn,ms)=>ms===25000?123:setImmediate(fn),clearTimeout(){},fetch:async(u,opts)=>{sent.push(opts);return {type:'opaque',status:0};},document:{createElement:()=>({remove(){}}),head:{append(s){const url=new URL(s.src),cb=url.searchParams.get('callback');requests.push(url);setImmediate(()=>window[cb]({ok:true,data:statuses.shift()||{status:'not_found'}}));}}}});
  vm.runInContext(fs.readFileSync('src/transport.js','utf8'),ctx);return {t:window.ArkTransport,sent,requests,store};
}
test('public roster uses compact JSONP and accepts the old format in a single request',async()=>{
  const roster={version:2,updatedAt:'2026-11-04T00:00:00.000Z',operators:[{name:'ア',rarity:6,job:'特殊',owned:false,elite:null,level:null,potential:'-',skills:['','','-'],modules:['','','',''],date:'2020-01-16'}],history:[{time:'2026-11-04T00:00:00.000Z',name:'ア'}]};
  const compact={...roster,format:'compact',operators:[['ア',6,'特殊',false,null,null,'-',['','','-'],['','','',''],'2020-01-16']]};
  for(const payload of [roster,compact]){
    const f=setup([payload]);
    assert.deepEqual(JSON.parse(JSON.stringify(await f.t.get())),roster);
    assert.equal(f.requests.length,1);
    assert.equal(f.requests[0].searchParams.get('action'),'roster');
    assert.equal(f.requests[0].searchParams.get('format'),'compact');
  }
  const f=setup([{...compact,operators:[['ア']]}]);
  await assert.rejects(f.t.get(),/取得データの形式/);
  assert.equal(f.requests.length,1);
});
test('public and editor screens finish loading as soon as data arrives without timers or animation frames',async()=>{
  const source=fs.readFileSync('src/app.js','utf8'),Ark=require('../src/model.js');
  for(const admin of [false,true]){
    const elements=new Map(),timers=[],frames=[];
    function element(){return {innerHTML:'',textContent:'',hidden:false,classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},addEventListener(){},setAttribute(){},getBoundingClientRect:()=>({height:72}),querySelector:()=>null,querySelectorAll:()=>[]};}
    const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
    const root=get('app');root.innerHTML=fs.readFileSync('src/loading.html','utf8');
    root.querySelector=selector=>selector==='.initial'&&root.innerHTML.includes('class="initial"')?element():null;
    let resolve;const pending=new Promise(r=>resolve=r);
    const ctx=vm.createContext({Ark,ArkTransport:{admin,demo:false,storage:{get:()=>null},get:()=>pending,recover:async()=>null},console,
      document:{getElementById:get,querySelector:get,querySelectorAll:()=>[],documentElement:element()},
      matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){},scrollTo(){},ResizeObserver:class{observe(){}disconnect(){}},
      setTimeout:(callback,delay)=>{timers.push(delay);return timers.length;},clearTimeout(){},requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},performance:{now:()=>0}});
    ctx.window=ctx;const finished=vm.runInContext(source,ctx);
    assert.ok(root.querySelector('.initial'));assert.equal(elements.has('roster'),false);
    resolve({updatedAt:'2026-11-06T00:00:00.000Z',operators:[{name:'テスト',rarity:6,job:'先鋒',owned:true,elite:2,level:90,potential:1,skills:['M3','M3','M3'],modules:['','','','']}],history:[]});
    await new Promise(setImmediate);
    assert.equal(root.querySelector('.initial'),null);
    assert.match(get('roster').innerHTML,/テスト/);
    assert.deepEqual(timers,[]);assert.deepEqual(frames,[]);
    await finished;
  }
});
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
