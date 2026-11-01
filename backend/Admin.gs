/**
 * 独立した本人専用GAS Webアプリ。
 * デプロイは必ず「実行するユーザー：自分」「アクセス：自分のみ」。
 * Googleのデプロイ権限で利用者を制限する。公開用GASには配置しない。
 */
function doGet() {
  try{
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('育成を記録 | ARK RECORD')
      .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
  }catch(error){
    console.error('入力画面の生成失敗: '+String(error&&error.message||error));
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><meta charset="utf-8"><body style="background:#101216;color:#eff2f8;font-family:sans-serif;padding:32px;line-height:1.9"><h1>入力画面を読み込めませんでした</h1><p>エラーコード：ADMIN_HTML_LOAD</p><p>HTMLファイル名が「Index」で、内容を全文貼り付けてあることを確認してください。保存後、デプロイを新しいバージョンへ更新してください。</p><p>詳しい原因は、Apps Scriptの「実行数」から該当するdoGetの実行ログで確認できます。</p></body></html>')
      .setTitle('入力画面の設定を確認してください')
      .addMetaTag('viewport','width=device-width, initial-scale=1');
  }
}
function getTrainingData() {return webRoster_(true);}
function saveTraining(payload) {
  if(!payload||typeof payload.name!=='string'||typeof payload.version!=='string')throw Error('保存要求が不正です。');
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('別の保存処理が進行中です。少し待ってください。');
  try{
    var ss=webSpreadsheet_(),record=webFindOperator_(ss,Ark.name(payload.name)),op=webOperator_(record.values,record.headers,true);
    if(op.version!==payload.version)throw Error('この記録は別の画面で変更されています。編集を閉じて一覧を更新してから、もう一度入力してください。');
    var values=Ark.validate(payload.values,op.rarity),changes=[];
    // 保存直前にも行と版を確認する（シートを直接並べ替えた場合など）。
    var current=record.sheet.getRange(record.row,1,1,record.headers.length).getValues()[0];
    if(webOperator_(current,record.headers,true).version!==op.version)throw Error('保存前に行が変更されました。一覧を更新してください。');
    Ark.fields.forEach(k=>{var col=record.headers.indexOf(Ark.columns[k]);if(record.values[col]!==values[k])changes.push({col:col,value:values[k]});});
    var formulas=record.sheet.getRange(record.row,1,1,record.headers.length).getFormulas()[0];
    if(changes.some(c=>formulas[c.col]))throw Error('編集対象に数式があります。シートを確認してください。');
    // 他の列の数式や入力を上書きしない。連続した変更列ごとに保存する。
    changes.sort((a,b)=>a.col-b.col);var groups=[];
    changes.forEach(c=>{var last=groups[groups.length-1];if(last&&last.start+last.values.length===c.col)last.values.push(c.value);else groups.push({start:c.col,values:[c.value]});});
    groups.forEach(g=>record.sheet.getRange(record.row,g.start+1,1,g.values.length).setValues([g.values]));
    SpreadsheetApp.flush();
    var saved=record.sheet.getRange(record.row,1,1,record.headers.length).getValues()[0];
    if(Ark.name(saved[record.headers.indexOf('オペレーター名')])!==op.name)throw Error('保存中に行の位置が変更されました。シートを確認してください。');
    return webOperator_(saved,record.headers,true);
  }finally{lock.releaseLock();}
}
