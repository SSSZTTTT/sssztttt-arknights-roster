(function(){
  'use strict';
  var config=window.ARK_EDITOR_CONFIG||{},auth=document.getElementById('auth-screen'),button=document.getElementById('google-login'),message=document.getElementById('auth-message'),retry=document.getElementById('auth-retry'),app=document.getElementById('app');
  var rpc,session=null,client=null,challenge=null,bindingSecret='',launched=false,firstData=null,gisPromise;
  var storageKey='ark_editor_session_v1:'+location.pathname;
  function status(text,error){message.textContent=text;message.classList.toggle('error',!!error);}
  function storeSession(value){session=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify({...value,endpoint:config.apiUrl}));else sessionStorage.removeItem(storageKey);}catch(_){}}
  function storedSession(){try{var s=JSON.parse(sessionStorage.getItem(storageKey)||'null');return s&&s.endpoint===config.apiUrl&&/^[a-f0-9]{64}$/.test(s.token)&&s.expiresAt>Date.now()?s:null;}catch(_){return null;}}
  function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
  async function hash(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');}
  function loadGoogle(){
    if(window.google&&google.accounts&&google.accounts.oauth2)return Promise.resolve();
    if(gisPromise)return gisPromise;
    gisPromise=new Promise((resolve,reject)=>{
      var s=document.createElement('script'),done=false,timer=setTimeout(()=>finish(Error('Googleログインを読み込めませんでした。')),20000);
      function finish(error){if(done)return;done=true;clearTimeout(timer);if(error){gisPromise=null;s.remove();reject(error);}else resolve();}
      s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>finish();s.onerror=()=>finish(Error('Googleログインを読み込めませんでした。'));document.head.append(s);
    });return gisPromise;
  }
  async function prepare(){
    button.disabled=true;retry.hidden=true;status('ログインを準備しています…');
    try {
      bindingSecret=random();
      var results=await Promise.all([rpc('prepare',{binding:await hash(bindingSecret)}),loadGoogle()]);challenge=results[0];
      if(challenge.origin!==location.origin||!challenge.clientId||!/^[a-f0-9]{64}$/.test(challenge.state))throw Error('入力ツールの接続設定が一致しません。');
      client=google.accounts.oauth2.initCodeClient({client_id:challenge.clientId,scope:'openid email',include_granted_scopes:false,ux_mode:'popup',state:challenge.state,select_account:true,
        callback:completeLogin,error_callback:()=>{button.disabled=false;status('ログイン画面を開けなかったか、閉じられました。もう一度お試しください。',true);}
      });
      status('このタブでは最大12時間、ログインを保持します。');button.disabled=false;
    }catch(error){status(error.message,true);retry.hidden=false;}
  }
  async function completeLogin(response){
    button.disabled=true;status('アカウントを確認しています…');
    try {
      if(response.error||response.state!==challenge.state||!response.code)throw Error('ログインを完了できませんでした。もう一度お試しください。');
      var s=await rpc('login',{state:challenge.state,bindingSecret:bindingSecret,code:response.code});
      if(!s||!/^[a-f0-9]{64}$/.test(s.token)||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now())throw Error('ログイン結果を確認できませんでした。');
      storeSession(s);await launch();
    }catch(error){storeSession(null);status(error.message,true);retry.hidden=false;}
  }
  async function authenticated(action,input){
    if(!session||session.expiresAt<=Date.now()){storeSession(null);throw Error('ログイン期限が切れました。再読み込みしてログインしてください。未保存の内容は反映されていません。');}
    try{return await rpc(action,input,session.token);}catch(error){if(error.code==='AUTH_REQUIRED')storeSession(null);throw error;}
  }
  async function launch(){
    status('育成記録を読み込んでいます…');firstData=await authenticated('read');
    if(!firstData||!Array.isArray(firstData.operators)||!Array.isArray(firstData.history))throw Error('取得データの形式が一致しません。');
    window.ARK_ADMIN=true;
    window.ArkTransport={admin:true,demo:false,storage:{get:()=>null,set:()=>{}},
      get:async()=>{if(firstData){var d=firstData;firstData=null;return d;}return authenticated('read');},
      save:(op,values)=>authenticated('save',{name:op.name,version:op.version,values:values}),
      logout:async()=>{if(session)await rpc('logout',{},session.token);storeSession(null);app.replaceChildren();location.reload();}
    };
    if(!launched){launched=true;var script=document.createElement('script');script.src=document.getElementById('editor-bootstrap').dataset.applicationSrc;script.onerror=()=>{auth.hidden=false;app.hidden=true;status('入力画面を読み込めませんでした。再読み込みしてください。',true);};document.head.append(script);}
    auth.hidden=true;app.hidden=false;
  }
  button.onclick=()=>{
    if(!client||!challenge||challenge.expiresAt<=Date.now()){prepare();return;}
    button.disabled=true;status('Googleのログイン画面でアカウントを選択してください。');
    try{client.requestCode();}catch(_){button.disabled=false;status('ログイン画面を開けませんでした。もう一度お試しください。',true);}
  };
  retry.onclick=()=>prepare();
  async function start(){
    if(!config.apiUrl){status('入力ツールは接続準備中です。');return;}
    try{rpc=EditorRPC.create(config.apiUrl);}catch(error){status(error.message,true);return;}
    session=storedSession();
    if(session){try{await launch();return;}catch(error){storeSession(null);status(error.message,true);}}
    await prepare();
  }
  start();
})();
