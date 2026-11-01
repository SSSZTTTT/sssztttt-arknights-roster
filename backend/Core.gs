/** 公開用・入力用で共通。末尾 _ の関数はgoogle.script.runから呼べません。 */
function webSpreadsheet_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || 'REDACTED_SPREADSHEET_ID');
}
function webHeaders_(values) {
  var headers=values[0].map(Ark.name),required=['実装日','レア','職業','オペレーター名'].concat(Object.values(Ark.columns));
  required.forEach(h=>{if(headers.indexOf(h)<0||headers.indexOf(h)!==headers.lastIndexOf(h))throw Error('シートの見出し「'+h+'」を確認してください。');});
  return headers;
}
function webDate_(value) {
  if(value instanceof Date)return Utilities.formatDate(value,'Asia/Tokyo','yyyy-MM-dd');
  if(typeof value==='number')return new Date((value-25569)*86400000).toISOString().slice(0,10);
  return String(value||'').replace(/\//g,'-');
}
function webRevision_(name,training) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([name,training]),Utilities.Charset.UTF_8).map(b=>((b+256)%256).toString(16).padStart(2,'0')).join('');
}
function webOperator_(row,headers,privateData) {
  var op=Ark.fromRow(row,headers);op.date=webDate_(row[headers.indexOf('実装日')]);
  if(privateData){
    var training={};Ark.fields.forEach(k=>{var v=row[headers.indexOf(Ark.columns[k])];training[k]=k==='owned'?op.owned:k[0]==='s'&&/^s[123]$/.test(k)?Ark.fromRow(row,headers).skills[Number(k[1])-1]:v==null?'':v;});
    op.training=training;op.version=webRevision_(op.name,training);
  }
  return op;
}
function webRoster_(privateData) {
  var ss=webSpreadsheet_(),operators=[],seen=new Set();
  ss.getSheets().filter(s=>/^\d{4}年$/.test(s.getName())).forEach(sheet=>{
    if(sheet.getLastRow()<2)return;
    var values=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues(),headers=webHeaders_(values);
    values.slice(1).forEach(row=>{
      if(!Ark.name(row[headers.indexOf('オペレーター名')]))return;
      var op=webOperator_(row,headers,privateData);
      if(seen.has(op.name))throw Error('同名の行が重複しています：'+op.name);
      seen.add(op.name);operators.push(op);
    });
  });
  return {version:2,updatedAt:new Date().toISOString(),operators:operators,history:webHistory_(ss)};
}
function webHistory_(ss) {
  var sheet=ss.getSheetByName('履歴');if(!sheet||sheet.getLastRow()<2)return [];
  var last=sheet.getLastRow(),start=Math.max(2,last-199);
  return sheet.getRange(start,1,last-start+1,2).getValues().filter(r=>r[0]&&r[1]).reverse().slice(0,50).map(r=>({time:r[0] instanceof Date?r[0].toISOString():String(r[0]),name:String(r[1])}));
}
function webFindOperator_(ss,name) {
  var found=null;
  ss.getSheets().filter(s=>/^\d{4}年$/.test(s.getName())).forEach(sheet=>{
    if(sheet.getLastRow()<2)return;
    var values=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues(),headers=webHeaders_(values);
    values.slice(1).forEach((row,i)=>{if(Ark.name(row[headers.indexOf('オペレーター名')])===name){if(found)throw Error('同名の行が重複しています。');found={sheet:sheet,row:i+2,headers:headers,values:row};}});
  });
  if(!found)throw Error('オペレーターが見つかりません。再読み込みしてください。');return found;
}
