/** コンテナバインドGASの旧doGet/doPostと置き換える。Cloud Run不要。 */
function doGet(e) {
  var p=e&&e.parameter||{},result;
  try{
    if(p.action==='receipt')result={ok:true,data:supportReceipt_(p.requestId)};
    else if(!p.action||p.action==='roster'){
      var data=webRoster_(false);
      if(p.format==='compact'){
        // 公開項目の並び順は src/transport.js の復元処理と揃える。
        data.operators=data.operators.map(o=>[o.name,o.rarity,o.job,o.owned,o.elite,o.level,o.potential,o.skills,o.modules,o.date]);
        data.format='compact';
      }
      result={ok:true,data:data};
    }
    else result={ok:false,error:'未対応の操作です。'};
  }catch(_){result={ok:false,error:'記録を取得できませんでした。時間をおいて再度お試しください。'};}
  return publicOutput_(result,p.callback);
}
function publicOutput_(result,callback) {
  var json=JSON.stringify(result).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  if(callback){
    if(!/^__ark_cb_[a-f0-9]{36}$/.test(callback))return ContentService.createTextOutput('Invalid callback').setMimeType(ContentService.MimeType.TEXT);
    return ContentService.createTextOutput(callback+'('+json+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var p=e&&e.parameter||{};
  if(p.action!=='support')return publicOutput_({ok:false,error:'未対応の操作です。'});
  try{return publicOutput_({ok:true,data:receiveSupport_(p)});}
  catch(_){return publicOutput_({ok:false,error:'送信結果を確認できません。'});}
}
function supportToken_(s){return typeof s==='string'&&/^[a-f0-9]{36}$/.test(s);}
function supportReceipt_(id) {
  if(!supportToken_(id))return {status:'not_found'};
  var value=PropertiesService.getScriptProperties().getProperty('ARK_RECEIPT_'+id);
  if(!value)return {status:'not_found'};
  var r=JSON.parse(value);if(Date.now()-r.createdAt>3600000)return {status:'not_found'};
  return {status:r.status,retryAt:r.retryAt||0,message:r.message||''};
}
function supportLimits_(settings) {
  function positive(key,fallback,min,max){var n=Number(settings[key]||fallback);return Number.isFinite(n)&&n>=min&&n<=max?Math.floor(n):fallback;}
  return {cooldown:positive('REQUEST_COOLDOWN_SECONDS',180,30,3600)*1000,global:positive('GLOBAL_COOLDOWN_SECONDS',15,5,300)*1000,daily:positive('DAILY_REQUEST_LIMIT',50,1,500)};
}
function supportReserve_(guard,input,now,day,limits) {
  guard=guard||{day:day,count:0,clients:{},operators:{},globalUntil:0};
  if(guard.day!==day){guard.day=day;guard.count=0;}
  ['clients','operators'].forEach(k=>{guard[k]=guard[k]||{};Object.keys(guard[k]).forEach(key=>{if(guard[k][key]<=now)delete guard[k][key];});});
  var until=Math.max(guard.globalUntil||0,guard.clients[input.clientId]||0,guard.operators[input.name]||0);
  if(guard.count>=limits.daily)return {guard:guard,receipt:{status:'limited',message:'本日の受付上限に達しました。日を改めてお試しください。'}};
  if(until>now)return {guard:guard,receipt:{status:'cooldown',retryAt:until,message:'直前の依頼から時間をおいて、もう一度お試しください。'}};
  guard.clients[input.clientId]=now+limits.cooldown;guard.operators[input.name]=now+limits.cooldown;guard.globalUntil=now+limits.global;guard.count++;
  return {guard:guard,receipt:{status:'pending',retryAt:now+limits.cooldown}};
}
function supportCleanReceipts_(props,settings,now) {
  var rows=[];
  Object.keys(settings).filter(k=>k.startsWith('ARK_RECEIPT_')).forEach(k=>{try{var r=JSON.parse(settings[k]);if(now-r.createdAt>3600000)props.deleteProperty(k);else rows.push({key:k,time:r.createdAt});}catch(_){props.deleteProperty(k);}});
  rows.sort((a,b)=>b.time-a.time).slice(149).forEach(r=>props.deleteProperty(r.key));
}
function receiveSupport_(input) {
  if(!supportToken_(input.requestId)||!supportToken_(input.clientId)||typeof input.name!=='string'||input.name.length>100)throw Error('Invalid request');
  var props=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock(),key='ARK_RECEIPT_'+input.requestId,now=Date.now(),receipt,webhook,ss;
  if(!lock.tryLock(10000))return {status:'pending'};
  try{
    var settings=props.getProperties(),existing=settings[key];if(existing)return JSON.parse(existing);
    supportCleanReceipts_(props,settings,now);
    webhook=settings.DISCORD_WEBHOOK_URL||'';
    if(!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(webhook)){
      receipt={status:'unavailable',message:'サポート依頼は現在準備中です。',createdAt:now};props.setProperty(key,JSON.stringify(receipt));return receipt;
    }
    // 表に実在する全オペレーターが対象。未所持を理由に除外しない。
    ss=webSpreadsheet_(settings);
    var record=webFindOperator_(ss,Ark.name(input.name),settings);input.name=Ark.name(record.values[record.headers.indexOf('オペレーター名')]);
    var raw=settings.ARK_SUPPORT_GUARD,guard=raw?JSON.parse(raw):null;
    var reserved=supportReserve_(guard,input,now,Utilities.formatDate(new Date(now),'Asia/Tokyo','yyyy-MM-dd'),supportLimits_(settings));
    receipt=Object.assign({createdAt:now},reserved.receipt);props.setProperty('ARK_SUPPORT_GUARD',JSON.stringify(reserved.guard));props.setProperty(key,JSON.stringify(receipt));
  }finally{lock.releaseLock();}
  if(receipt.status!=='pending')return receipt;
  try{
    // wait=true でDiscordがメッセージを作成した応答まで待つ。メンションは無効化する。
    var response=UrlFetchApp.fetch(webhook+'?wait=true',{method:'post',contentType:'application/json',payload:JSON.stringify({content:'👤 サポートリクエスト\n「'+input.name+'」がサポート枠にリクエストされました。',allowed_mentions:{parse:[]}}),muteHttpExceptions:true});
    var code=response.getResponseCode();
    if(code>=200&&code<300){
      receipt.status='sent';receipt.message='Discordに送信しました。';
      try{var history=ss.getSheetByName('履歴')||ss.insertSheet('履歴');if(!history.getLastRow())history.appendRow(['日時','オペレーター名']);history.appendRow([new Date(),input.name]);}catch(_){console.error('Discord送信済みですが履歴を書き込めませんでした。');}
    }else if(code>=500){receipt.status='uncertain';receipt.message='通知の結果を確認できません。Discordと履歴を確認してから、時間をおいてお試しください。';}
    else{receipt.status='failed';receipt.message='Discordへの送信に失敗しました。時間をおいてお試しください。';}
  }catch(_){receipt.status='uncertain';receipt.message='通知の結果を確認できません。重複を避けるため、時間をおいて履歴をご確認ください。';}
  props.setProperty(key,JSON.stringify(receipt));return receipt;
}
