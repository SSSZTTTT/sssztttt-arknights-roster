/** 認証済み入力画面からの確認・追加。確認内容はサーバーだけに保存する。 */
function editorImportKey_(token) {return 'ARK_IMPORT_PREVIEW_'+editorHash_(token);}
function editorImportPreview_(token) {
  try {
    var today=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd');
    var source=arkImportParseHistory_(arkImportFetch_(),today);
    return editorLock_(p=>{
      var config=editorImportSession_(token,p),ss=webSpreadsheet_(),state=arkImportReadState_(ss);
      var plan=arkImportPlan_(source,state),helper=arkImportHelperPlan_(ss,state,plan);
      var id=editorRandom_(),expiresAt=Date.now()+600000;
      var preview={planId:id,expiresAt:expiresAt,sourceCount:source.operators.length,excluded:source.excluded,
        additions:plan.additions,updates:plan.updates.map(u=>{
          var before=state.rows.find(r=>r.name===u.operator.name);
          return {name:u.operator.name,before:{date:before.date,job:before.job,rarity:before.rarity},after:u.operator,fields:u.fields};
        }),newYears:plan.newYears,summaryReferenceUpdate:!!(helper&&helper.changed)};
      var record={id:id,expiresAt:expiresAt,stamp:config.stamp,spreadsheetId:ss.getId(),stateHash:editorHash_(state.signature),
        helperBefore:helper?helper.before:null,plan:plan,preview:preview};
      var json=JSON.stringify(record);
      if(Utilities.newBlob(json).getBytes().length>90000)editorError_('IMPORT_FAILED','変更予定が多すぎます。シート側から取得内容を確認してください。');
      CacheService.getScriptCache().put(editorImportKey_(token),json,600);
      return preview;
    });
  }catch(error){
    if(error.editorCode)throw error;
    // Wiki解析エラーには検出した名前や列名が含まれる。フロントは必ずエスケープする。
    editorError_('IMPORT_FAILED','取得・確認に失敗しました。'+String(error.message||'').slice(0,240));
  }
}
function editorImportSession_(token,p) {
  var config=editorConfig_(),session=editorJson_(p.getProperty('ARK_EDITOR_SESSION_'+editorHash_(token)));
  if(!session||session.expiresAt<=Date.now()||session.stamp!==config.stamp||session.sub!==config.sub)editorError_('AUTH_REQUIRED','ログイン期限が切れました。再読み込みしてログインしてください。');
  return config;
}
function editorImportCommit_(input,token) {
  if(!input||!editorToken_(input.planId))editorError_('IMPORT_EXPIRED','追加前にWikiから取得して内容を確認してください。');
  return editorLock_(p=>{
    var config=editorImportSession_(token,p),cache=CacheService.getScriptCache(),key=editorImportKey_(token),record=editorJson_(cache.get(key));
    if(!record||record.id!==input.planId||record.expiresAt<=Date.now()||record.stamp!==config.stamp)editorError_('IMPORT_EXPIRED','確認内容の期限が切れたか、別の取得で更新されました。もう一度取得してください。');
    var ss=webSpreadsheet_(),state=arkImportReadState_(ss),helper=arkImportHelperPlan_(ss,state,record.plan);
    if(ss.getId()!==record.spreadsheetId||editorHash_(state.signature)!==record.stateHash||(helper?helper.before:null)!==record.helperBefore)editorError_('IMPORT_CHANGED','確認後にシートが変更されています。もう一度取得して内容を確認してください。');
    // 消費してから書き込み。通信切断や途中失敗でも同じ計画を再実行しない。
    cache.remove(key);
    try {
      arkImportApply_(ss,state,record.plan);
      if(helper&&helper.changed){
        helper.sheet.getRange('A2').setFormula(helper.after);
        var summary=ss.getSheetByName('集計');
        if(summary&&String(summary.getRange('A57').getValue()).startsWith('数式で自動更新。参照先：'))summary.getRange('A57').setValue('数式で自動更新。参照先：'+helper.years.join('・')+'。新しい年のシートは参照先への追加が必要です。');
      }
      SpreadsheetApp.flush();arkImportVerify_(ss,record.plan);
      return {added:record.plan.additions.length,updated:record.plan.updates.length,newYears:record.plan.newYears};
    }catch(error){editorError_('IMPORT_UNCERTAIN','反映を最後まで確認できませんでした。一部反映されている可能性があります。一覧を更新し、もう一度Wikiから差分を取得してください。');}
  });
}
