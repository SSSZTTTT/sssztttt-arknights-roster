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
function saveTraining(payload) {return webSaveTraining_(payload);}
