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
function appFixture({admin=false,reduced=false,hidden=false,failShell=false}={}){
  const elements=new Map(),timers=[],frames=[],events=new Map(),completionSnapshots=[],layoutSnapshots=[];
  function element(){const classes=new Set();return {innerHTML:'',textContent:'',hidden:false,attributes:{},children:[],parentElement:null,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(){},contains:c=>classes.has(c)},style:{setProperty(){}},addEventListener(){},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);},remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;},getBoundingClientRect:()=>({height:72}),querySelector:()=>null,querySelectorAll:()=>[]};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const root=get('app'),loader=element();
  loader.setAttribute('id','main');root.append(loader);
  root.innerHTML=fs.readFileSync('src/loading.html','utf8');
  root.querySelector=selector=>selector==='.initial'&&loader.parentElement===root&&root.innerHTML.includes('class="initial"')?loader:null;
  let resolve;const pending=new Promise(r=>resolve=r);
  const document={hidden,getElementById:get,querySelector:selector=>{if(failShell&&selector==='.site-header')throw Error('Render failed');return get(selector);},querySelectorAll:()=>[],documentElement:element(),body:element(),addEventListener:(name,callback)=>events.set(name,callback),removeEventListener:name=>events.delete(name)};
  root.getBoundingClientRect=()=>{layoutSnapshots.push({roster:elements.get('roster')?.innerHTML,covered:document.body.children.includes(loader),complete:loader.classList.contains('is-complete')});return {height:72};};
  const addClass=loader.classList.add;loader.classList.add=c=>{addClass(c);if(c==='is-complete')completionSnapshots.push({roster:elements.get('roster')?.innerHTML,covered:document.body.children.includes(loader),layouts:layoutSnapshots.length});};
  const ctx=vm.createContext({Ark:require('../src/model.js'),ArkTransport:{admin,demo:false,storage:{get:()=>null},get:()=>pending,recover:async()=>null},console,
    document,
    matchMedia:query=>({matches:reduced&&query.includes('prefers-reduced-motion'),addEventListener(){}}),addEventListener(){},scrollTo(){},ResizeObserver:class{observe(){}disconnect(){}},
    setTimeout:(callback,delay)=>{timers.push({callback,delay,cancelled:false});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].cancelled=true;},requestAnimationFrame:callback=>{frames.push({callback,cancelled:false});return frames.length;},cancelAnimationFrame:id=>{if(frames[id-1])frames[id-1].cancelled=true;},performance:{now:()=>0}});
  ctx.window=ctx;const finished=vm.runInContext(fs.readFileSync('src/app.js','utf8'),ctx);
  return {get,root,loader,document,elements,timers,frames,events,completionSnapshots,layoutSnapshots,finished,resolve,settle:()=>new Promise(setImmediate)};
}
const displayRoster={updatedAt:'2026-11-06T00:00:00.000Z',operators:[{name:'テスト',rarity:6,job:'先鋒',owned:true,elite:2,level:90,potential:1,skills:['M3','M3','M3'],modules:['','','','']}],history:[]};
test('public and editor connect after DOM preparation and show the list on the next painted frame without a minimum timed delay',async()=>{
  for(const admin of [false,true]){
    const f=appFixture({admin});
    assert.ok(f.root.querySelector('.initial'));assert.equal(f.elements.has('roster'),false);
    assert.equal(f.loader.classList.contains('is-complete'),false);assert.deepEqual(f.frames,[]);assert.deepEqual(f.timers,[]);
    f.resolve(displayRoster);await f.settle();
    assert.equal(f.loader.classList.contains('is-complete'),true);assert.equal(f.loader.parentElement,f.document.body);
    assert.equal(f.loader.attributes.id,undefined);assert.equal(f.frames.length,1);assert.deepEqual(f.timers.map(t=>t.delay),[50]);
    assert.equal(f.completionSnapshots.length,1);assert.equal(f.completionSnapshots[0].covered,true);assert.match(f.completionSnapshots[0].roster,/テスト/);
    assert.equal(f.completionSnapshots[0].layouts,1);assert.equal(f.layoutSnapshots[0].covered,true);
    assert.equal(f.layoutSnapshots[0].complete,false);assert.match(f.layoutSnapshots[0].roster,/テスト/);
    f.frames[0].callback();await f.settle();
    assert.equal(f.loader.parentElement,f.document.body);assert.equal(f.frames.length,2);
    f.frames[1].callback();await f.finished;
    assert.equal(f.loader.removed,true);assert.equal(f.document.body.children.length,0);assert.match(f.get('roster').innerHTML,/テスト/);
    // タイマーを一度も発火させずに表示でき、安全弁も取り消されている。
    assert.equal(f.timers[0].cancelled,true);assert.equal(f.events.size,0);
    await f.get('refresh').onclick();assert.equal(f.frames.length,2);assert.match(f.get('roster').innerHTML,/テスト/);
    assert.equal(f.timers.filter(t=>t.delay===50).length,1);assert.equal(f.layoutSnapshots.length,1);
  }
});
test('hidden or reduced-motion pages show data without waiting for animation frames',async()=>{
  for(const options of [{hidden:true},{reduced:true}]){
    const f=appFixture(options);f.resolve(displayRoster);await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.deepEqual(f.timers,[]);assert.deepEqual(f.frames,[]);
    assert.equal(f.events.size,0);assert.equal(f.document.body.children.length,0);
  }
});
test('hiding the page during the completed-line frame cancels the frame wait and releases the listener',async()=>{
  for(const advanceFrame of [false,true]){
    const f=appFixture();f.resolve(displayRoster);await f.settle();
    if(advanceFrame)f.frames[0].callback();
    f.document.hidden=true;f.events.get('visibilitychange')();await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.equal(f.frames.at(-1).cancelled,true);
    assert.equal(f.events.size,0);assert.equal(f.timers[0].cancelled,true);assert.equal(f.document.body.children.length,0);
  }
});
test('throttled animation frames cannot indefinitely retain the completed black loader',async()=>{
  for(const advanceFrame of [false,true]){
    const f=appFixture();f.resolve(displayRoster);await f.settle();
    if(advanceFrame)f.frames[0].callback();
    assert.equal(f.loader.parentElement,f.document.body);assert.equal(f.loader.classList.contains('is-complete'),true);
    assert.equal(f.timers[0].delay,50);f.timers[0].callback();await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.equal(f.document.body.children.length,0);
    assert.equal(f.frames.at(-1).cancelled,true);assert.equal(f.timers[0].cancelled,true);assert.equal(f.events.size,0);
    const frameCount=f.frames.length;f.frames[0].callback();assert.equal(f.frames.length,frameCount);
  }
});
test('invalid initial data displays an error without showing a completed line',async()=>{
  const f=appFixture();f.resolve({operators:[]});await f.finished;
  assert.match(f.root.innerHTML,/記録を読み込めませんでした/);assert.equal(f.loader.classList.contains('is-complete'),false);assert.deepEqual(f.frames,[]);
});
test('initial list construction failure removes the black cover and shows a retryable error',async()=>{
  const f=appFixture({failShell:true});f.resolve(displayRoster);await f.finished;
  assert.match(f.root.innerHTML,/記録を読み込めませんでした/);assert.match(f.root.innerHTML,/Render failed/);
  assert.equal(f.loader.removed,true);assert.equal(f.document.body.children.length,0);
  assert.equal(f.loader.classList.contains('is-complete'),false);assert.deepEqual(f.frames,[]);
  assert.equal(typeof f.get('retry-load').onclick,'function');
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
