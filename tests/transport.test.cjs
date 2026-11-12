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
function appFixture({admin=false,reduced=false,hidden=false,failShell=false,transforms=['matrix(0.97, 0, 0, 1, 0, 0)','matrix(0.97, 0, 0, 1, 0, 0)'],animateSupported=true,throwAnimationIndex=-1,cssAnimations='ready',throwPauseIndex=-1,getAnimationsThrows=false}={}){
  const elements=new Map(),timers=[],frames=[],events=new Map(),animations=[],pendingAnimations=[],styleReads=[],moveSnapshots=[],completionSnapshots=[],layoutSnapshots=[];
  let now=0;
  const settle=()=>new Promise(setImmediate);
  function element(){const classes=new Set();return {innerHTML:'',textContent:'',hidden:false,attributes:{},children:[],parentElement:null,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(){},contains:c=>classes.has(c)},style:{setProperty(){}},addEventListener(){},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);},remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;},getBoundingClientRect:()=>({height:72}),querySelector:()=>null,querySelectorAll:()=>[]};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const root=get('app'),loader=element();
  loader.setAttribute('id','main');root.append(loader);
  root.innerHTML=fs.readFileSync('src/loading.html','utf8');
  root.querySelector=selector=>selector==='.initial'&&loader.parentElement===root&&root.innerHTML.includes('class="initial"')?loader:null;
  let resolve;const pending=new Promise(r=>resolve=r);
  const document={hidden,getElementById:get,querySelector:selector=>{if(failShell&&selector==='.site-header')throw Error('Render failed');return get(selector);},querySelectorAll:()=>[],documentElement:element(),body:element(),addEventListener:(name,callback)=>events.set(name,callback),removeEventListener:name=>events.delete(name)};
  const lines=transforms.map((transform,index)=>{
    const line=element();line.computedTransform=transform;
    if(cssAnimations){
      let resolveReady,rejectReady,ready=Promise.resolve(),settled=true;
      const animation={animationName:'initial-connect',playState:'running',pending:false,pauseCalls:0,readyReads:[],currentTimeWrites:[],
        get currentTime(){return 2400;},set currentTime(value){this.currentTimeWrites.push(value);},
        get ready(){this.readyReads.push(this.pauseCalls);return ready;},
        pause(){
          this.pauseCalls++;
          if(index===throwPauseIndex)throw Error('Pause unavailable');
          this.pending=true;settled=false;
          ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
          if(cssAnimations==='ready')this.settle();
        },
        settle(transform){if(transform!==undefined)line.computedTransform=transform;if(!settled){settled=true;this.pending=false;this.playState='paused';resolveReady(this);}},
        reject(){if(!settled){settled=true;this.pending=false;rejectReady(Error('Pause interrupted'));}}
      };
      pendingAnimations.push(animation);
      line.getAnimations=()=>{if(getAnimationsThrows)throw Error('Animation inspection unavailable');return [animation,{animationName:'unrelated',pause(){throw Error('Unrelated animation must not be paused');}}];};
    }
    if(animateSupported)line.animate=(keyframes,options)=>{
      if(index===throwAnimationIndex)throw Error('Animation unavailable');
      let resolveFinished,rejectFinished,settled=false;
      const animation={keyframes,options,cancelled:false,covered:document.body.children.includes(loader),roster:elements.get('roster')?.innerHTML,layouts:layoutSnapshots.length,
        finished:new Promise((resolve,reject)=>{resolveFinished=resolve;rejectFinished=reject;}),
        finish(){if(!settled){settled=true;resolveFinished();}},
        reject(){if(!settled){settled=true;rejectFinished(Error('Animation interrupted'));}},
        cancel(){this.cancelled=true;this.reject();}
      };
      animations.push(animation);return animation;
    };
    return line;
  });
  loader.querySelectorAll=selector=>selector==='.initial-line'?lines:[];
  const currentTransform=line=>loader.classList.contains('is-finishing')||loader.classList.contains('is-complete')?line.style.transform||'matrix(0, 0, 0, 1, 0, 0)':line.computedTransform;
  const appendToBody=document.body.append;
  document.body.append=child=>{
    appendToBody.call(document.body,child);
    if(child===loader){
      // Reparenting can restart the pending CSS animation. Its visible position must already be frozen.
      lines.forEach(line=>{line.computedTransform='matrix(0, 0, 0, 1, 0, 0)';});
      moveSnapshots.push({transforms:lines.map(currentTransform),animations:animations.length});
    }
  };
  root.getBoundingClientRect=()=>{layoutSnapshots.push({roster:elements.get('roster')?.innerHTML,covered:document.body.children.includes(loader),complete:loader.classList.contains('is-complete')});return {height:72};};
  const addClass=loader.classList.add;loader.classList.add=c=>{addClass(c);if(c==='is-complete')completionSnapshots.push({roster:elements.get('roster')?.innerHTML,covered:document.body.children.includes(loader),layouts:layoutSnapshots.length});};
  const ctx=vm.createContext({Ark:require('../src/model.js'),ArkTransport:{admin,demo:false,storage:{get:()=>null},get:()=>pending,recover:async()=>null},console,
    document,
    getComputedStyle:line=>{styleReads.push({beforeMove:loader.parentElement===root,finishing:loader.classList.contains('is-finishing'),inline:lines.map(line=>line.style.transform)});return {transform:currentTransform(line)};},
    matchMedia:query=>({matches:reduced&&query.includes('prefers-reduced-motion'),addEventListener(){}}),addEventListener(){},scrollTo(){},ResizeObserver:class{observe(){}disconnect(){}},
    setTimeout:(callback,delay)=>{timers.push({callback,delay,at:now+delay,cancelled:false,fired:false});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].cancelled=true;},requestAnimationFrame:callback=>{frames.push({callback,cancelled:false,fired:false});return frames.length;},cancelAnimationFrame:id=>{if(frames[id-1])frames[id-1].cancelled=true;},performance:{now:()=>now}});
  ctx.window=ctx;const finished=vm.runInContext(fs.readFileSync('src/app.js','utf8'),ctx);
  const activeTimers=()=>timers.filter(timer=>!timer.cancelled&&!timer.fired);
  async function advance(ms){
    const until=now+ms;
    for(;;){
      const timer=activeTimers().filter(timer=>timer.at<=until).sort((a,b)=>a.at-b.at)[0];
      if(!timer)break;
      now=timer.at;timer.fired=true;timer.callback();await settle();
    }
    now=until;await settle();
  }
  async function paintFrame(ms=16){
    await advance(ms);
    const frame=frames.find(frame=>!frame.fired&&!frame.cancelled);
    assert.ok(frame,'a frame is scheduled');frame.fired=true;frame.callback(now);await settle();
  }
  const paint=async()=>{await paintFrame();await paintFrame();};
  return {get,root,loader,lines,document,elements,timers,frames,events,animations,pendingAnimations,styleReads,moveSnapshots,completionSnapshots,layoutSnapshots,finished,resolve,settle,advance,activeTimers,paintFrame,paint,setReducedMotion:value=>{reduced=value;}};
}
const displayRoster={updatedAt:'2026-11-06T00:00:00.000Z',operators:[{name:'テスト',rarity:6,job:'先鋒',owned:true,elite:2,level:90,potential:1,skills:['M3','M3','M3'],modules:['','','','']}],history:[]};
const scaleProgress=transform=>Number(/^(?:matrix(?:3d)?|scaleX)\(([^,)]+)/.exec(transform)[1]);
async function finishVisibleLoad(f){
  for(let i=0;!f.animations.length&&!f.loader.removed&&i<4;i++)await f.paintFrame();
  assert.equal(f.animations.length,2);f.animations.forEach(animation=>animation.finish());await f.settle();
  const [hold]=f.activeTimers();assert.ok(hold);await f.advance(hold.delay);await f.finished;
}
test('public and editor wait for both pending CSS pauses and capture the newer rendered position before building the list',async()=>{
  for(const admin of [false,true]){
    const f=appFixture({admin,cssAnimations:true,transforms:['matrix(0.94, 0, 0, 1, 0, 0)','matrix(0.94, 0, 0, 1, 0, 0)']});
    f.resolve(displayRoster);await f.settle();
    assert.deepEqual(f.pendingAnimations.map(animation=>animation.pauseCalls),[1,1]);
    assert.ok(f.pendingAnimations.every(animation=>animation.readyReads.length&&animation.readyReads.every(calls=>calls===1)));
    assert.equal(f.loader.parentElement,f.root);assert.deepEqual(f.styleReads,[]);assert.deepEqual(f.moveSnapshots,[]);assert.deepEqual(f.layoutSnapshots,[]);
    assert.equal(f.elements.has('roster'),false);assert.equal(f.loader.classList.contains('is-finishing'),false);assert.deepEqual(f.frames,[]);
    assert.ok(f.lines.every(line=>line.style.transform===undefined));
    f.pendingAnimations[0].settle('matrix(0.97, 0, 0, 1, 0, 0)');await f.settle();
    assert.equal(f.loader.parentElement,f.root);assert.deepEqual(f.styleReads,[]);assert.equal(f.elements.has('roster'),false);
    f.pendingAnimations[1].settle('matrix(0.97, 0, 0, 1, 0, 0)');await f.settle();
    assert.equal(f.loader.parentElement,f.document.body);assert.deepEqual(f.lines.map(line=>scaleProgress(line.style.transform)),[.97,.97]);
    assert.deepEqual(f.moveSnapshots[0].transforms.map(scaleProgress),[.97,.97]);
    assert.ok(f.pendingAnimations.every(animation=>animation.currentTimeWrites.length===0));
    await finishVisibleLoad(f);
    assert.deepEqual(f.animations.map(animation=>scaleProgress(animation.keyframes[0].transform)),[.97,.97]);
    assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('hiding or enabling reduced motion while CSS pauses are pending skips the remaining animation safely',async()=>{
  for(const hidden of [false,true]){
    const f=appFixture({cssAnimations:true});f.resolve(displayRoster);await f.settle();
    if(hidden){f.document.hidden=true;f.events.get('visibilitychange')();}
    else{f.setReducedMotion(true);f.pendingAnimations.forEach(animation=>animation.settle());}
    await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.equal(f.loader.removed,true);assert.deepEqual(f.animations,[]);assert.deepEqual(f.frames,[]);
    assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
    const moves=f.moveSnapshots.length;f.pendingAnimations.forEach(animation=>animation.settle());await f.advance(1000);
    assert.equal(f.moveSnapshots.length,moves);assert.deepEqual(f.animations,[]);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('a rejected CSS pause pauses both lines through CSS before falling back and cannot strand the cover',async()=>{
  const f=appFixture({cssAnimations:true});f.resolve(displayRoster);await f.settle();
  f.pendingAnimations[0].reject();await f.settle();
  assert.equal(f.loader.parentElement,f.root);assert.deepEqual(f.styleReads,[]);
  assert.ok(f.lines.every(line=>line.style.animationPlayState==='paused'));
  await f.paintFrame();assert.equal(f.loader.parentElement,f.root);assert.deepEqual(f.styleReads,[]);
  f.lines.forEach(line=>{line.computedTransform='matrix(0.97, 0, 0, 1, 0, 0)';});
  await f.paintFrame();assert.equal(f.loader.parentElement,f.document.body);await finishVisibleLoad(f);
  f.pendingAnimations[1].settle();await f.advance(1000);
  assert.equal(f.moveSnapshots.length,1);assert.equal(f.animations.length,2);
  assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
});
test('an unresolved CSS pause uses a bounded fallback and late readiness cannot restart the load',async()=>{
  for(const onePaused of [false,true]){
    const f=appFixture({cssAnimations:true});f.resolve(displayRoster);await f.settle();
    if(onePaused){f.pendingAnimations[0].settle();await f.settle();}
    const [deadline]=f.activeTimers();assert.ok(deadline.delay>0&&deadline.delay<=500);
    await f.advance(deadline.delay-1);assert.equal(f.loader.parentElement,f.root);assert.deepEqual(f.styleReads,[]);
    await f.advance(1);await f.finished;assert.equal(f.loader.removed,true);assert.deepEqual(f.animations,[]);assert.deepEqual(f.styleReads,[]);
    const moves=f.moveSnapshots.length,frames=f.frames.length,animations=f.animations.length;
    f.pendingAnimations.forEach(animation=>animation.settle());await f.advance(1000);
    assert.equal(f.moveSnapshots.length,moves);assert.equal(f.frames.length,frames);assert.equal(f.animations.length,animations);
    assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('unavailable CSS animation inspection or pause falls back without blocking the roster',async()=>{
  for(const options of [{cssAnimations:false},{cssAnimations:true,getAnimationsThrows:true},{cssAnimations:true,throwPauseIndex:0},{cssAnimations:true,throwPauseIndex:1}]){
    const f=appFixture(options);f.resolve(displayRoster);await f.settle();
    assert.equal(f.loader.parentElement,f.root);assert.ok(f.lines.every(line=>line.style.animationPlayState==='paused'));
    assert.deepEqual(f.styleReads,[]);assert.equal(f.elements.has('roster'),false);
    f.pendingAnimations.forEach(animation=>animation.settle());await f.settle();await finishVisibleLoad(f);
    assert.equal(f.loader.removed,true);assert.match(f.get('roster').innerHTML,/テスト/);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('hiding during the CSS fallback cancels pending frames and ignores late callbacks',async()=>{
  for(const onePainted of [false,true]){
    const f=appFixture({cssAnimations:false});f.resolve(displayRoster);await f.settle();
    if(onePainted)await f.paintFrame();
    const pendingFrame=f.frames.at(-1),frameCount=f.frames.length;
    f.document.hidden=true;f.events.get('visibilitychange')();await f.finished;
    assert.equal(f.loader.removed,true);assert.equal(pendingFrame.cancelled,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
    pendingFrame.callback();await f.advance(1000);
    assert.equal(f.frames.length,frameCount);assert.deepEqual(f.styleReads,[]);assert.deepEqual(f.animations,[]);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('a stalled CSS fallback frame skips motion at its deadline and cannot later rebuild the list',async()=>{
  const f=appFixture({cssAnimations:false});f.resolve(displayRoster);await f.settle();
  const [deadline]=f.activeTimers(),pendingFrame=f.frames.at(-1);
  assert.ok(deadline.delay>0&&deadline.delay<=500);
  await f.advance(deadline.delay);await f.finished;
  assert.equal(f.loader.removed,true);assert.equal(pendingFrame.cancelled,true);assert.deepEqual(f.styleReads,[]);assert.deepEqual(f.animations,[]);
  const moves=f.moveSnapshots.length,frames=f.frames.length;
  pendingFrame.callback();await f.advance(1000);
  assert.equal(f.moveSnapshots.length,moves);assert.equal(f.frames.length,frames);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
});
test('public and editor prepare the list under black, continue both current line positions, then briefly show the connection',async()=>{
  for(const admin of [false,true]){
    const transforms=['matrix(0.31, 0, 0, 1, 0, 0)','matrix3d(0.46, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'];
    const f=appFixture({admin,transforms});
    assert.ok(f.root.querySelector('.initial'));assert.equal(f.elements.has('roster'),false);
    assert.equal(f.loader.classList.contains('is-complete'),false);assert.deepEqual(f.animations,[]);assert.deepEqual(f.timers,[]);
    f.resolve(displayRoster);await f.settle();
    assert.equal(f.loader.classList.contains('is-complete'),false);assert.equal(f.loader.parentElement,f.document.body);
    assert.equal(f.loader.attributes.id,undefined);assert.deepEqual(f.animations,[]);assert.equal(f.frames.length,1);
    assert.equal(f.styleReads.length,2);
    for(const read of f.styleReads){assert.equal(read.beforeMove,true);assert.equal(read.finishing,false);assert.deepEqual(read.inline,[undefined,undefined]);}
    assert.equal(f.moveSnapshots.length,1);assert.equal(f.moveSnapshots[0].animations,0);
    assert.deepEqual(f.moveSnapshots[0].transforms.map(scaleProgress),transforms.map(scaleProgress));
    assert.equal(f.layoutSnapshots[0].covered,true);
    assert.equal(f.layoutSnapshots[0].complete,false);assert.match(f.layoutSnapshots[0].roster,/テスト/);
    await f.paintFrame();assert.deepEqual(f.animations,[]);assert.equal(f.loader.parentElement,f.document.body);
    await f.paintFrame();assert.equal(f.animations.length,2);
    f.animations.forEach((animation,index)=>{
      assert.equal(scaleProgress(animation.keyframes[0].transform),scaleProgress(transforms[index]));assert.equal(animation.keyframes.at(-1).transform,'scaleX(1)');
      assert.equal(scaleProgress(f.lines[index].style.transform),scaleProgress(transforms[index]));
      assert.equal(animation.covered,true);assert.match(animation.roster,/テスト/);assert.equal(animation.layouts,1);
      assert.ok(animation.options.duration>=260&&animation.options.duration<=450);
    });
    assert.equal(f.animations[0].options.duration,f.animations[1].options.duration);
    f.animations[0].finish();await f.settle();
    assert.equal(f.loader.classList.contains('is-complete'),false);assert.equal(f.loader.parentElement,f.document.body);
    f.animations[1].finish();await f.settle();
    assert.equal(f.completionSnapshots.length,1);assert.equal(f.completionSnapshots[0].covered,true);assert.match(f.completionSnapshots[0].roster,/テスト/);
    assert.equal(f.completionSnapshots[0].layouts,1);assert.equal(f.loader.classList.contains('is-complete'),true);
    assert.ok(f.lines.every(line=>line.style.transform==='scaleX(1)'));
    const [hold]=f.activeTimers();assert.equal(f.activeTimers().length,1);assert.ok(hold.delay>0&&hold.delay<=100);
    await f.advance(hold.delay-1);assert.equal(f.loader.parentElement,f.document.body);
    await f.advance(1);await f.finished;
    assert.equal(f.loader.removed,true);assert.equal(f.document.body.children.length,0);assert.match(f.get('roster').innerHTML,/テスト/);
    assert.equal(f.timers[0].cancelled,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
    assert.ok(f.animations.every(animation=>animation.cancelled));
    await f.get('refresh').onclick();assert.equal(f.animations.length,2);assert.match(f.get('roster').innerHTML,/テスト/);
    assert.equal(f.layoutSnapshots.length,1);assert.equal(f.completionSnapshots.length,1);assert.equal(f.frames.length,2);
  }
});
test('zero and early progress use compatible transform functions and a longer connection than a nearly connected line',async()=>{
  const durations=[];
  for(const progress of [0,0.02,0.97]){
    const f=appFixture({transforms:[`matrix(${progress}, 0, 0, 1, 0, 0)`,`matrix(${progress}, 0, 0, 1, 0, 0)`]});
    f.resolve(displayRoster);await f.settle();await f.paint();
    const duration=f.animations[0].options.duration;durations.push(duration);
    assert.ok(duration>=260&&duration<=450);
    for(const animation of f.animations){
      assert.match(animation.keyframes[0].transform,/^scaleX\(/);assert.equal(scaleProgress(animation.keyframes[0].transform),progress);
      assert.equal(animation.keyframes.at(-1).transform,'scaleX(1)');
    }
    await f.advance(duration-1);assert.equal(f.loader.parentElement,f.document.body);assert.equal(f.loader.classList.contains('is-complete'),false);
    f.animations.forEach(animation=>animation.finish());await f.settle();
    const [hold]=f.activeTimers();assert.ok(duration+hold.delay<=550);
    await f.advance(hold.delay);await f.finished;assert.equal(f.loader.removed,true);
  }
  assert.ok(durations[0]>durations[2]);assert.ok(durations[1]>durations[2]);
});
test('a slow first paint does not consume the connection animation or its deadline',async()=>{
  const f=appFixture();f.resolve(displayRoster);await f.settle();
  const [paintDeadline]=f.activeTimers();
  await f.paintFrame();assert.deepEqual(f.animations,[]);assert.deepEqual(f.activeTimers(),[paintDeadline]);
  await f.paintFrame(400);
  assert.equal(f.animations.length,2);assert.equal(paintDeadline.cancelled,true);
  const [motionDeadline]=f.activeTimers(),duration=f.animations[0].options.duration;
  assert.equal(f.activeTimers().length,1);assert.equal(motionDeadline.at,416+motionDeadline.delay);
  await f.advance(duration-1);assert.equal(f.loader.classList.contains('is-complete'),false);assert.equal(f.loader.parentElement,f.document.body);
  f.animations.forEach(animation=>animation.finish());await f.settle();
  await f.advance(f.activeTimers()[0].delay);await f.finished;
  assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
});
test('throttled paint frames use a bounded fallback before starting the connection',async()=>{
  for(const onePainted of [false,true]){
    const f=appFixture();f.resolve(displayRoster);await f.settle();
    if(onePainted)await f.paintFrame();
    const [deadline]=f.activeTimers(),pendingFrame=f.frames.at(-1);
    assert.ok(deadline.delay>=400&&deadline.delay<=600);assert.deepEqual(f.animations,[]);
    await f.advance(deadline.delay);
    assert.equal(f.animations.length,2);assert.equal(pendingFrame.cancelled,true);assert.equal(f.loader.classList.contains('is-complete'),false);
    const frameCount=f.frames.length;pendingFrame.callback();await f.settle();
    assert.equal(f.frames.length,frameCount);assert.equal(f.animations.length,2);
    f.animations.forEach(animation=>animation.finish());await f.settle();
    await f.advance(f.activeTimers()[0].delay);await f.finished;
    assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('hiding during either paint frame cancels the wait and late frame callbacks cannot start motion',async()=>{
  for(const onePainted of [false,true]){
    const f=appFixture();f.resolve(displayRoster);await f.settle();
    if(onePainted)await f.paintFrame();
    const pendingFrame=f.frames.at(-1),frameCount=f.frames.length;
    f.document.hidden=true;f.events.get('visibilitychange')();await f.finished;
    assert.equal(f.loader.removed,true);assert.equal(pendingFrame.cancelled,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
    pendingFrame.callback();await f.advance(1000);
    assert.equal(f.frames.length,frameCount);assert.deepEqual(f.animations,[]);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('enabling reduced motion while the first list paints skips the subsequent animation',async()=>{
  const f=appFixture();f.resolve(displayRoster);await f.settle();await f.paintFrame();
  f.setReducedMotion(true);await f.paintFrame();await f.finished;
  assert.equal(f.loader.removed,true);assert.deepEqual(f.animations,[]);assert.deepEqual(f.activeTimers(),[]);assert.equal(f.events.size,0);
});
test('hidden or reduced-motion pages show data without waiting for a connection animation',async()=>{
  for(const options of [{hidden:true},{reduced:true}]){
    const f=appFixture(options);f.resolve(displayRoster);await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.deepEqual(f.timers,[]);assert.deepEqual(f.frames,[]);assert.deepEqual(f.animations,[]);
    assert.equal(f.events.size,0);assert.equal(f.document.body.children.length,0);
  }
});
test('hiding the page during motion or the connected hold releases the cover and cleans up pending work',async()=>{
  for(const connected of [false,true]){
    const f=appFixture();f.resolve(displayRoster);await f.settle();await f.paint();
    if(connected){f.animations.forEach(animation=>animation.finish());await f.settle();}
    assert.equal(f.loader.classList.contains('is-complete'),connected);
    f.document.hidden=true;f.events.get('visibilitychange')();await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.ok(f.animations.every(animation=>animation.cancelled));
    assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);assert.equal(f.document.body.children.length,0);
    await f.advance(1000);assert.equal(f.completionSnapshots.length,connected?1:0);
  }
});
test('an unresolved animation has a bounded deadline followed by a short connected hold',async()=>{
  for(const oneFinished of [false,true]){
    const f=appFixture();f.resolve(displayRoster);await f.settle();await f.paint();
    if(oneFinished)f.animations[0].finish();await f.settle();
    const [deadline]=f.activeTimers(),duration=f.animations[0].options.duration;
    assert.ok(deadline.delay>=duration&&deadline.delay<=duration+200);
    await f.advance(deadline.delay-1);assert.equal(f.loader.parentElement,f.document.body);assert.equal(f.loader.classList.contains('is-complete'),false);
    await f.advance(1);assert.equal(f.loader.classList.contains('is-complete'),true);assert.equal(f.loader.parentElement,f.document.body);
    const [hold]=f.activeTimers();assert.ok(hold.delay>0&&hold.delay<=100);
    await f.advance(hold.delay);await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.equal(f.document.body.children.length,0);
    assert.ok(f.animations.every(animation=>animation.cancelled));assert.deepEqual(f.activeTimers(),[]);assert.equal(f.events.size,0);
    f.animations.forEach(animation=>animation.finish());await f.settle();assert.equal(f.completionSnapshots.length,1);
  }
});
test('unsupported or partially failing animation APIs still show the connection and release the black cover',async()=>{
  for(const options of [{animateSupported:false},{throwAnimationIndex:1}]){
    const f=appFixture(options);f.resolve(displayRoster);await f.settle();await f.paint();
    assert.equal(f.loader.classList.contains('is-complete'),true);assert.equal(f.loader.parentElement,f.document.body);
    assert.equal(f.animations.length,options.animateSupported===false?0:1);assert.ok(f.animations.every(animation=>animation.cancelled));
    const [hold]=f.activeTimers();assert.equal(f.activeTimers().length,1);assert.ok(hold.delay>0&&hold.delay<=100);
    await f.advance(hold.delay);await f.finished;
    assert.match(f.get('roster').innerHTML,/テスト/);assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
  }
});
test('a rejected animation cannot strand the loader or leave the other animation running',async()=>{
  const f=appFixture();f.resolve(displayRoster);await f.settle();await f.paint();f.animations[0].reject();await f.settle();
  assert.equal(f.loader.classList.contains('is-complete'),true);assert.ok(f.animations.every(animation=>animation.cancelled));
  const [hold]=f.activeTimers();assert.equal(f.activeTimers().length,1);assert.ok(hold.delay>0&&hold.delay<=100);
  await f.advance(hold.delay);await f.finished;
  assert.equal(f.loader.removed,true);assert.equal(f.events.size,0);assert.deepEqual(f.activeTimers(),[]);
});
test('invalid initial data displays an error without showing a completed line',async()=>{
  const f=appFixture();f.resolve({operators:[]});await f.finished;
  assert.match(f.root.innerHTML,/記録を読み込めませんでした/);assert.equal(f.loader.classList.contains('is-complete'),false);assert.deepEqual(f.animations,[]);assert.deepEqual(f.timers,[]);
});
test('initial list construction failure removes the black cover and shows a retryable error',async()=>{
  const f=appFixture({failShell:true});f.resolve(displayRoster);await f.finished;
  assert.match(f.root.innerHTML,/記録を読み込めませんでした/);assert.match(f.root.innerHTML,/Render failed/);
  assert.equal(f.loader.removed,true);assert.equal(f.document.body.children.length,0);
  assert.equal(f.loader.classList.contains('is-complete'),false);assert.deepEqual(f.animations,[]);assert.deepEqual(f.activeTimers(),[]);
  assert.equal(typeof f.get('retry-load').onclick,'function');
});
test('public and editor direction controls sort, retain tie rules and reset with filters',async()=>{
  const operators=[
    {...displayRoster.operators[0],name:'低レベル',level:20},
    {...displayRoster.operators[0],name:'高レベル',level:90},
    {...displayRoster.operators[0],name:'星5',rarity:5,level:80}
  ];
  for(const admin of [false,true]){
    const f=appFixture({admin,reduced:true});f.resolve({...displayRoster,operators});await f.finished;
    const names=()=>[...f.get('roster').innerHTML.matchAll(/class="op-name">([^<]+)</g)].map(match=>match[1]);
    assert.deepEqual(names(),['高レベル','星5','低レベル']);
    f.get('direction').onclick();
    assert.deepEqual(names(),['低レベル','星5','高レベル']);
    assert.equal(f.get('direction').attributes['aria-checked'],'true');
    assert.equal(f.get('direction-label').textContent,'↑ 昇順');
    f.get('sort').onchange({target:{value:'rarity'}});
    assert.deepEqual(names(),['星5','高レベル','低レベル']);
    f.get('direction').onclick();
    assert.deepEqual(names(),['高レベル','低レベル','星5']);
    assert.equal(f.get('direction').attributes['aria-checked'],'false');
    assert.equal(f.get('direction-label').textContent,'↓ 降順');
    f.get('rarity').onchange({target:{value:'6'}});
    assert.deepEqual(names(),['高レベル','低レベル']);
    f.get('direction').onclick();
    f.get('roster').onclick({target:{closest:()=>({id:'reset-filters'})}});
    assert.deepEqual(names(),['高レベル','星5','低レベル']);
    assert.match(f.get('screen').innerHTML,/id="direction" role="switch" aria-label="昇順で表示" aria-checked="false"/);
    assert.match(f.get('screen').innerHTML,/id="direction-label">↓ 降順</);
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
