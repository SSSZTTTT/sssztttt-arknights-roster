/** 育成保存の共通処理。公開RPCから直接呼べない末尾 _ の関数。 */
function webSaveTraining_(payload) {
  if(!payload||typeof payload.name!=='string'||typeof payload.version!=='string')throw Error('保存要求が不正です。');
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('別の保存処理が進行中です。少し待ってください。');
  try{
    var ss=webSpreadsheet_(),record=webFindOperator_(ss,Ark.name(payload.name)),op=webOperator_(record.values,record.headers,true);
    if(op.version!==payload.version)throw Error('この記録は別の画面で変更されています。編集を閉じて一覧を更新してから、もう一度入力してください。');
    var values=Ark.validate(payload.values,op.rarity),changes=[];
    // 保存直前にも行と版を確認する（シートを直接並べ替えた場合など）。
    var current=record.sheet.getRange(record.row,1,1,record.headers.length).getValues()[0];
    var currentOperator=webOperator_(current,record.headers,true);
    if(currentOperator.version!==op.version)throw Error('保存前に行が変更されました。一覧を更新してください。');
    Ark.fields.forEach(k=>{var col=record.headers.indexOf(Ark.columns[k]);if(record.values[col]!==values[k])changes.push({col:col,value:values[k]});});
    if(!changes.length)return currentOperator;
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
