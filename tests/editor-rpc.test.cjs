const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const rpc=require('../src/editor-rpc.js');
function fixture(){
  const listeners=new Set(),timers=new Set(),submitted=[],frames=[];const top={};top.parent=top;
  const env={crypto:{getRandomValues:a=>crypto.randomFillSync(a)},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)};
  env.document={createElement(tag){const e={tag,style:{},children:[],setAttribute(){},append(c){this.children.push(c);},remove(){this.removed=true;}};if(tag==='iframe'){e.contentWindow={parent:top};frames.push(e);}if(tag==='form')e.submit=()=>submitted.push({action:e.action,target:e.target,payload:JSON.parse(e.children[0].value)});return e;},body:{append(){}}};
  const call=rpc.create('https://script.google.com/macros/s/TEST/exec',env);
  function reply(index,overrides={}){const p=submitted[index].payload,child={parent:frames[index].contentWindow};for(const listener of [...listeners])listener({origin:'https://test-script.googleusercontent.com',source:child,data:{type:'ARK_EDITOR_REPLY',nonce:p.nonce,result:{ok:true,data:{saved:true}}},...overrides});}
  return {call,submitted,frames,listeners,timers,reply};
}
test('credentials go only into POST body; correct origin, frame and nonce are all required',async()=>{
  const f=fixture();let settled=false;const p=f.call('save',{name:'ア'},'sensitive-session').then(r=>{settled=true;return r;});
  assert.equal(f.submitted[0].action,'https://script.google.com/macros/s/TEST/exec');assert.equal(f.submitted[0].payload.token,'sensitive-session');
  f.reply(0,{origin:'https://evil.example.test'});f.reply(0,{source:{parent:null}});f.reply(0,{data:{type:'ARK_EDITOR_REPLY',nonce:'wrong',result:{ok:true}}});await Promise.resolve();assert.equal(settled,false);
  f.reply(0);assert.deepEqual(await p,{saved:true});assert.equal(f.listeners.size,0);assert.equal(f.frames[0].removed,true);
});
test('unrelated Google frames cannot spoof responses and concurrent calls cannot cross',async()=>{
  const f=fixture(),a=f.call('read'),b=f.call('save');assert.notEqual(f.submitted[0].payload.nonce,f.submitted[1].payload.nonce);
  f.reply(0,{source:{parent:f.frames[1].contentWindow}});assert.equal(f.listeners.size,2);f.reply(1);await b;assert.equal(f.listeners.size,1);f.reply(0);await a;
});
test('timeout does not retry a write or assume it succeeded',async()=>{
  const f=fixture(),p=f.call('save');const rejection=assert.rejects(p,/保存結果を確認できません/);for(const timer of [...f.timers])timer();await rejection;assert.equal(f.submitted.length,1);assert.equal(f.listeners.size,0);
});
test('server auth errors remain distinguishable and endpoint URLs cannot redirect secrets elsewhere',async()=>{
  const f=fixture(),p=f.call('read');const rejection=assert.rejects(p,e=>e.code==='AUTH_REQUIRED');f.reply(0,{data:{type:'ARK_EDITOR_REPLY',nonce:f.submitted[0].payload.nonce,result:{ok:false,error:{code:'AUTH_REQUIRED',message:'ログインしてください'}}}});await rejection;
  for(const url of ['http://script.google.com/macros/s/TEST/exec','https://evil.example.test/exec','https://script.google.com/macros/s/TEST/exec?next=evil','https://script.google.com/macros/s/TEST/exec#secret'])assert.throws(()=>rpc.apiUrl(url));
});
