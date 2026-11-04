(function(){
  'use strict';
  var params=new URLSearchParams(location.search),demo=params.get('demo')==='1',admin=demo&&params.get('screen')==='admin';
  var config=window.ARK_CONFIG||{},snapshot=null;
  var storage={get(k){try{return localStorage.getItem(k);}catch(_){return null;}},set(k,v){try{localStorage.setItem(k,String(v));}catch(_){}}};
  function token(){if(!crypto.getRandomValues)throw Error('安全な接続で開いてください。');return Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('');}
  function apiUrl(){var u;try{u=new URL(config.apiUrl);}catch(_){throw Error('公開APIの接続設定がまだ完了していません。');}if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname))throw Error('公開APIのURLが不正です。');return u;}
  function jsonp(action,query){
    return new Promise((resolve,reject)=>{
      var u;try{u=apiUrl();}catch(e){reject(e);return;}
      var callback='__ark_cb_'+token(),script=document.createElement('script'),done=false;
      var timer=setTimeout(()=>finish(Error('通信がタイムアウトしました。時間をおいて再読み込みしてください。')),25000);
      function finish(error,data){if(done)return;done=true;clearTimeout(timer);script.remove();delete window[callback];error?reject(error):resolve(data);}
      window[callback]=data=>data&&data.ok?finish(null,data.data):finish(Error(data&&data.error||'読み込みに失敗しました。'));
      u.searchParams.set('action',action);u.searchParams.set('callback',callback);u.searchParams.set('ts',Date.now());
      Object.entries(query||{}).forEach(([k,v])=>u.searchParams.set(k,v));script.src=u.href;script.onerror=()=>finish(Error('公開APIに接続できません。'));document.head.append(script);
    });
  }
  async function get(){
    if(demo){if(!snapshot){var r=await fetch('preview-data/roster.json');if(!r.ok)throw Error('プレビューデータがありません。');snapshot=await r.json();}return structuredClone(snapshot);}
    var data=await jsonp('roster',{format:'compact'});
    // 旧デプロイの通常形式も、この応答をそのまま使う。
    if(!data||data.format!=='compact')return data;
    if(!Array.isArray(data.operators))throw Error('取得データの形式が一致しません。');
    var operators=data.operators.map(row=>{
      if(!Array.isArray(row)||row.length!==10)throw Error('取得データの形式が一致しません。');
      var [name,rarity,job,owned,elite,level,potential,skills,modules,date]=row;
      return {name,rarity,job,owned,elite,level,potential,skills,modules,date};
    });
    return {version:data.version,updatedAt:data.updatedAt,operators,history:data.history};
  }
  async function save(op,values){
    if(!demo)throw Error('育成入力は入力画面から開いてください。');
    var item=snapshot.operators.find(o=>o.name===op.name),valid=Ark.validate(values,op.rarity);
    if(item.version!==op.version)throw Error('記録が変更されました。再読み込みしてください。');
    item.training=valid;Object.assign(item,Ark.fromRow(['2026/01/01',item.rarity,item.job,item.name,valid.elite,valid.level,valid.potential,valid.s1,valid.s2,valid.s3,valid.x,valid.y,valid.delta,valid.alpha,valid.owned],['実装日','レア','職業','オペレーター名','昇進','Lv','潜在','S1','S2','S3','X','Y','Δ','α','所持状態']));item.version=token();return structuredClone(item);
  }
  async function receipt(requestId){return jsonp('receipt',{requestId:requestId});}
  async function poll(requestId){
    var deadline=Date.now()+60000;
    for(var i=0;i<12&&Date.now()<deadline;i++){
      await new Promise(resolve=>setTimeout(resolve,i<2?1200:2500));
      try{var r=await receipt(requestId);if(r.status!=='pending'&&r.status!=='not_found')return r;}catch(e){if(i===11)throw e;}
    }
    return {status:'uncertain',message:'送信結果を確認できませんでした。重複を避けるため、少し待って履歴をご確認ください。'};
  }
  async function request(name){
    if(demo){storage.set('ark_demo_ct',Date.now()+180000);return {status:'sent',retryAt:Date.now()+180000};}
    var client=storage.get('ark_client');if(!client){client=token();storage.set('ark_client',client);}
    var id=token();storage.set('ark_pending',JSON.stringify({requestId:id,name:name}));
    // opaqueなPOST応答を成功扱いしない。読み取り用の受領照会でDiscordへの送信完了を確認する。
    fetch(apiUrl(),{method:'POST',mode:'no-cors',credentials:'omit',body:new URLSearchParams({action:'support',name:name,clientId:client,requestId:id})}).catch(()=>{});
    var result=await poll(id);
    if(result.status!=='uncertain'&&result.status!=='pending')storage.set('ark_pending','');
    return result;
  }
  async function recover(){var raw=storage.get('ark_pending');if(!raw||demo)return null;try{var p=JSON.parse(raw),r=await receipt(p.requestId);if(r.status==='not_found')return {status:'uncertain',message:'前回の送信結果を確認できません。履歴をご確認ください。'};if(r.status==='pending')return poll(p.requestId);if(r.status!=='uncertain')storage.set('ark_pending','');return r;}catch(_){return {status:'uncertain',message:'前回の送信結果を確認できません。時間をおいて再読み込みしてください。'};}}
  window.ArkTransport={admin:admin,demo:demo,get:get,save:save,request:request,recover:recover,storage:storage};
})();
