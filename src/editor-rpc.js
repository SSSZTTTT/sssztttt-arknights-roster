(function(root){
  'use strict';
  function apiUrl(value){
    var u=new URL(value);
    if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)||u.search||u.hash)throw Error('入力ツールの接続先が未設定か、不正です。');
    return u.href;
  }
  function googleOrigin(origin){return origin==='https://script.google.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin);}
  function belongsToFrame(source,frame){
    try{for(var i=0;source&&i<5;i++){if(source===frame)return true;var parent=source.parent;if(parent===source)return false;source=parent;}}catch(_){}
    return false;
  }
  function create(endpoint,env){
    env=env||root;var url=apiUrl(endpoint),doc=env.document;
    return function(action,input,token){
      return new Promise((resolve,reject)=>{
        var nonce=Array.from(env.crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
        var frame=doc.createElement('iframe'),form=doc.createElement('form'),field=doc.createElement('input'),finished=false;
        frame.name='ark_rpc_'+nonce;frame.title='入力ツールの通信';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.style.cssText='position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
        form.method='POST';form.action=url;form.target=frame.name;form.hidden=true;
        field.type='hidden';field.name='payload';field.value=JSON.stringify({nonce:nonce,action:action,input:input||{},token:token||''});form.append(field);
        function finish(error,data){
          if(finished)return;finished=true;env.clearTimeout(timer);env.removeEventListener('message',receive);form.remove();frame.remove();
          if(error)reject(error);else resolve(data);
        }
        function receive(event){
          var message=event.data;
          if(!googleOrigin(event.origin)||!belongsToFrame(event.source,frame.contentWindow)||!message||message.type!=='ARK_EDITOR_REPLY'||message.nonce!==nonce)return;
          var result=message.result;if(!result||typeof result.ok!=='boolean')return;
          if(result.ok)finish(null,result.data);
          else {var error=Error(result.error&&result.error.message||'処理に失敗しました。');error.code=result.error&&result.error.code;finish(error);}
        }
        var timer=env.setTimeout(()=>{var error=Error((action==='save'||action==='importCommit')?'保存結果を確認できませんでした。自動再送はしません。一覧を更新して保存状態を確認してください。':'入力用GASからの応答を確認できませんでした。接続先とデプロイ設定を確認してください。');error.code='TIMEOUT';finish(error);},60000);
        env.addEventListener('message',receive);doc.body.append(frame,form);
        try{form.submit();field.value='';form.remove();}catch(_){finish(Error('通信を開始できませんでした。'));}
      });
    };
  }
  var api={create:create,apiUrl:apiUrl,googleOrigin:googleOrigin,belongsToFrame:belongsToFrame};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.EditorRPC=api;
})(typeof window==='object'?window:globalThis);
