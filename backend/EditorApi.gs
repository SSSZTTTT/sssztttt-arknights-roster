/** GitHub入力画面専用の独立GAS。旧入力用Admin.gs・公開用APIとは混ぜない。 */
function doGet() {
  return ContentService.createTextOutput('Training editor API. Authentication is required.');
}
function doPost(e) {
  var envelope,config,result;
  try {
    var raw=e&&e.parameter&&e.parameter.payload;
    if(typeof raw!=='string'||raw.length>20000)throw Error('Invalid request');
    envelope=JSON.parse(raw);
    if(!envelope||!editorToken_(envelope.nonce))throw Error('Invalid request');
    config=editorConfig_();
  } catch(_) {return ContentService.createTextOutput('Request unavailable');}
  try {result={ok:true,data:editorDispatch_(envelope,config)};}
  catch(error) {result={ok:false,error:{code:error.editorCode||'FAILED',message:error.editorCode?error.message:'処理を完了できませんでした。設定または通信状態を確認してください。'}};}
  return editorReply_(envelope.nonce,result,config.origin);
}
function editorError_(code,message) {var e=Error(message);e.editorCode=code;throw e;}
function editorToken_(value) {return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
function editorHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>((b+256)%256).toString(16).padStart(2,'0')).join('');
}
function editorRandom_() {return (Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'').toLowerCase();}
function editorConfig_() {
  var properties=PropertiesService.getScriptProperties().getProperties(),c={
    clientId:(properties.OAUTH_CLIENT_ID||'').trim(),secret:(properties.OAUTH_CLIENT_SECRET||'').trim(),
    owner:(properties.OWNER_EMAIL||'').trim().toLowerCase(),sub:(properties.OWNER_GOOGLE_SUB||'').trim(),
    origin:(properties.EDITOR_ORIGIN||'').trim()
  };
  if(!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(c.clientId)||!c.secret||!c.owner.includes('@')||!/^https:\/\/[a-z0-9-]+\.github\.io$/.test(c.origin))throw Error('Editor settings missing');
  c.stamp=editorHash_([c.clientId,c.secret,c.owner,c.origin,c.sub,properties.SESSION_VERSION||'1'].join('\n'));
  return c;
}
function editorLock_(fn) {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))editorError_('BUSY','別の処理が進行中です。少し待ってからお試しください。');
  try{return fn(PropertiesService.getScriptProperties());}finally{lock.releaseLock();}
}
function editorJson_(raw) {try{return raw?JSON.parse(raw):null;}catch(_){return null;}}
function editorClean_(p,prefix,now,max) {
  var all=p.getProperties(),rows=[];
  Object.keys(all).filter(k=>k.startsWith(prefix)).forEach(k=>{
    var value=editorJson_(all[k]);
    if(!value||value.expiresAt<=now)p.deleteProperty(k);else rows.push({key:k,createdAt:value.createdAt});
  });
  rows.sort((a,b)=>b.createdAt-a.createdAt).slice(max).forEach(r=>p.deleteProperty(r.key));
}
function editorPrepare_(input,config) {
  if(!input||!editorToken_(input.binding))editorError_('INVALID','ログイン要求が不正です。');
  return editorLock_(p=>{
    var now=Date.now(),rate=editorJson_(p.getProperty('ARK_EDITOR_LOGIN_RATE'));
    if(!rate||now-rate.start>=3600000)rate={start:now,count:0};
    if(rate.count>=80)editorError_('LIMITED','ログイン試行が多いため、しばらく待ってからお試しください。');
    rate.count++;p.setProperty('ARK_EDITOR_LOGIN_RATE',JSON.stringify(rate));
    editorClean_(p,'ARK_EDITOR_CHALLENGE_',now,19);
    var state=editorRandom_(),expiresAt=now+300000;
    p.setProperty('ARK_EDITOR_CHALLENGE_'+editorHash_(state),JSON.stringify({binding:input.binding,createdAt:now,expiresAt:expiresAt,stamp:config.stamp}));
    return {clientId:config.clientId,origin:config.origin,state:state,expiresAt:expiresAt,sessionIdleDays:30};
  });
}
function editorIdentity_(token,config) {
  // この関数にはGoogleのHTTPSトークン交換応答だけを渡す。クライアントのIDトークンは受け付けない。
  var claims;
  try {
    var parts=token.split('.');if(parts.length!==3)throw Error('Invalid JWT');
    claims=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString('UTF-8'));
  } catch(_) {editorError_('LOGIN_FAILED','Googleの認証結果を確認できませんでした。');}
  var now=Math.floor(Date.now()/1000);
  if(!claims||!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==config.clientId||(claims.azp&&claims.azp!==config.clientId)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||typeof claims.sub!=='string'||!claims.sub||claims.email_verified!==true||typeof claims.email!=='string')editorError_('LOGIN_FAILED','Googleの認証結果を確認できませんでした。');
  if(claims.email.toLowerCase()!==config.owner||(config.sub&&claims.sub!==config.sub))editorError_('FORBIDDEN','このGoogleアカウントでは入力ツールを利用できません。');
  return {sub:claims.sub,email:claims.email.toLowerCase()};
}
function editorLogin_(input,config) {
  if(!input||!editorToken_(input.state)||!editorToken_(input.bindingSecret)||typeof input.code!=='string'||!input.code||input.code.length>4096)editorError_('LOGIN_FAILED','ログイン要求が不正です。');
  editorLock_(p=>{
    var key='ARK_EDITOR_CHALLENGE_'+editorHash_(input.state),challenge=editorJson_(p.getProperty(key));
    if(!challenge||challenge.expiresAt<=Date.now()||challenge.stamp!==config.stamp||challenge.binding!==editorHash_(input.bindingSecret))editorError_('LOGIN_FAILED','ログイン要求の期限が切れました。もう一度ログインしてください。');
    p.deleteProperty(key); // 認証コード交換は一度だけ。通信失敗でも再利用しない。
  });
  var response;
  try {response=UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{
    method:'post',payload:{code:input.code,client_id:config.clientId,client_secret:config.secret,redirect_uri:config.origin,grant_type:'authorization_code'},
    followRedirects:false,muteHttpExceptions:true
  });}catch(_){editorError_('LOGIN_FAILED','Googleとの通信に失敗しました。もう一度ログインしてください。');}
  if(response.getResponseCode()!==200)editorError_('LOGIN_FAILED','Googleログインを完了できませんでした。もう一度お試しください。');
  var tokens=editorJson_(response.getContentText());
  if(!tokens||typeof tokens.id_token!=='string')editorError_('LOGIN_FAILED','Googleの認証結果を取得できませんでした。');
  var identity=editorIdentity_(tokens.id_token,config);
  // Googleのアクセストークン・更新トークン・IDトークンは保存・返却しない。
  return editorLock_(p=>{
    var current=editorConfig_();if(current.stamp!==config.stamp)editorError_('LOGIN_FAILED','設定が変更されました。もう一度ログインしてください。');
    if(!current.sub){p.setProperty('OWNER_GOOGLE_SUB',identity.sub);current=editorConfig_();}
    var now=Date.now(),token=editorRandom_(),expiresAt=now+30*86400000;
    editorClean_(p,'ARK_EDITOR_SESSION_',now,4);
    p.setProperty('ARK_EDITOR_SESSION_'+editorHash_(token),JSON.stringify({sub:identity.sub,stamp:current.stamp,createdAt:now,expiresAt:expiresAt}));
    return {token:token,expiresAt:expiresAt};
  });
}
function editorRequireSession_(token,config) {
  if(!editorToken_(token))editorError_('AUTH_REQUIRED','ログインしてください。');
  // 照合と延長を同じロック内で行い、ログアウト済みのセッションを復活させない。
  return editorLock_(p=>{
    var key='ARK_EDITOR_SESSION_'+editorHash_(token),session=editorJson_(p.getProperty(key)),now=Date.now(),current=editorConfig_();
    if(!session||session.expiresAt<=now||session.stamp!==current.stamp||session.sub!==current.sub)editorError_('AUTH_REQUIRED','ログイン期限が切れました。再読み込みしてログインしてください。未保存の内容は反映されていません。');
    session.expiresAt=now+30*86400000;
    p.setProperty(key,JSON.stringify(session));
    return session;
  });
}
function editorDispatch_(envelope,config) {
  var input=envelope.input;
  if(envelope.action==='prepare')return editorPrepare_(input,config);
  if(envelope.action==='login'){
    var login=editorLogin_(input,config);
    if(input.includeRoster===true){
      // セッション発行後にシートを読み、読み込みに失敗してもログイン結果は返す。
      try{login.roster=webRoster_(true);}catch(_){}
    }
    return login;
  }
  if(envelope.action==='logout') {
    if(editorToken_(envelope.token))editorLock_(p=>p.deleteProperty('ARK_EDITOR_SESSION_'+editorHash_(envelope.token)));
    return {loggedOut:true};
  }
  if(!['read','save','importPreview','importCommit'].includes(envelope.action))editorError_('INVALID','未対応の操作です。');
  var session=editorRequireSession_(envelope.token,config);
  if(envelope.action==='importPreview')return Object.assign(editorImportPreview_(envelope.token),{sessionExpiresAt:session.expiresAt});
  if(envelope.action==='importCommit')return Object.assign(editorImportCommit_(input,envelope.token),{sessionExpiresAt:session.expiresAt});
  if(envelope.action==='read')return Object.assign(webRoster_(true),{sessionExpiresAt:session.expiresAt});
  try{return Object.assign(webSaveTraining_(input),{sessionExpiresAt:session.expiresAt});}catch(error){
    // 保存処理の既知の入力・競合エラーだけを画面へ返す。
    var message=String(error.message||'');
    if(/別の画面|行が変更|数式|別の保存|オペレーターが見つかりません|同名の行|保存中に行/.test(message))editorError_('SAVE_REJECTED',message);
    editorError_('SAVE_REJECTED','保存できませんでした。入力値を確認し、一覧を更新してからお試しください。');
  }
}
function editorReply_(nonce,result,origin) {
  var json=JSON.stringify({type:'ARK_EDITOR_REPLY',nonce:nonce,result:result}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  // 表示用画面ではない。返答は設定済みGitHubオリジンへだけ送り、URLに認証情報を置かない。
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+json+','+JSON.stringify(origin)+');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
