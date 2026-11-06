/** 公開用・入力用で共通。末尾 _ の関数はgoogle.script.runから呼べません。 */
function webSpreadsheet_(properties) {
  var id=properties?properties.SPREADSHEET_ID:PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if(!id||!id.trim())throw Error('SPREADSHEET_ID をスクリプトプロパティに設定してください。');
  return SpreadsheetApp.openById(id.trim());
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
    var training={};Ark.fields.forEach(k=>{var v=row[headers.indexOf(Ark.columns[k])];training[k]=k==='owned'?op.owned:k[0]==='s'&&/^s[123]$/.test(k)?op.skills[Number(k[1])-1]:v==null?'':v;});
    op.training=training;op.version=webRevision_(op.name,training);
  }
  return op;
}
/** 各年の値を一括取得する。キャッシュせず、列順・新しい年シートも毎回確認する。 */
function webReadYears_(years,spreadsheetId,mode) {
  mode=String(mode||'auto').trim().toLowerCase();
  if(!['auto','batch','legacy'].includes(mode))throw Error('ROSTER_READ_MODE は auto / batch / legacy を指定してください。');
  var available=typeof Sheets!=='undefined'&&Sheets.Spreadsheets&&Sheets.Spreadsheets.Values&&typeof Sheets.Spreadsheets.Values.batchGet==='function';
  if(mode==='batch'&&!available)throw Error('GASのサービスに Google Sheets API（Sheets）を追加してください。');
  var batch=mode!=='legacy'&&available;
  if(!batch)return {mode:'legacy',values:years.map(y=>y.sheet.getDataRange().getValues())};
  if(!years.length)return {mode:'batch',values:[]};
  // 数値・チェックボックスは型を維持。日付シリアル値は既存のwebDate_で変換する。
  // シート全体を指定し、列の追加・並べ替えで必要列を取りこぼさない。
  var result=Sheets.Spreadsheets.Values.batchGet(spreadsheetId,{
    ranges:years.map(y=>"'"+y.name+"'"),majorDimension:'ROWS',
    valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'
  });
  // API障害を空の一覧や別経路での再試行で隠さない。legacyへは設定で戻せる。
  if(!result||!Array.isArray(result.valueRanges)||result.valueRanges.length!==years.length)throw Error('年別データの取得結果が一致しません。');
  return {mode:'batch',values:result.valueRanges.map(range=>{
    if(!range||typeof range!=='object')throw Error('年別データの形式が一致しません。');
    var rows=range.values===undefined?[]:range.values;
    if(!Array.isArray(rows)||rows.some(row=>!Array.isArray(row)))throw Error('年別データの形式が一致しません。');
    return rows;
  })};
}
function webRoster_(privateData,options) {
  options=options||{};
  var started=Date.now(),metrics=options.metrics||{},settings=PropertiesService.getScriptProperties().getProperties();
  var ss=webSpreadsheet_(settings),operators=[],seen=new Set();
  var years=ss.getSheets().map(sheet=>({sheet:sheet,name:sheet.getName()})).filter(y=>/^\d{4}年$/.test(y.name));
  metrics.setupMs=Date.now()-started;
  var step=Date.now(),read=webReadYears_(years,settings.SPREADSHEET_ID.trim(),options.mode||settings.ROSTER_READ_MODE);
  metrics.mode=read.mode;metrics.readMs=Date.now()-step;step=Date.now();
  read.values.forEach(values=>{
    if(values.length<2)return;
    var headers=webHeaders_(values);
    values.slice(1).forEach(row=>{
      if(!Ark.name(row[headers.indexOf('オペレーター名')]))return;
      var op=webOperator_(row,headers,privateData);
      if(seen.has(op.name))throw Error('同名の行が重複しています：'+op.name);
      seen.add(op.name);operators.push(op);
    });
  });
  metrics.parseMs=Date.now()-step;step=Date.now();
  // 履歴全体をbatchGetに含めると増え続けるため、従来どおり末尾200行だけ読む。
  var history=webHistory_(ss);
  metrics.historyMs=Date.now()-step;metrics.totalMs=Date.now()-started;
  metrics.years=years.length;metrics.operators=operators.length;metrics.privateData=!!privateData;
  // 個人情報・シートID・育成値・認証情報はログや公開レスポンスへ追加しない。
  console.log('[roster timing] '+JSON.stringify(metrics));
  return {version:2,updatedAt:new Date().toISOString(),operators:operators,history:history};
}
/** GASエディタから実行する読み取り専用の比較。末尾_でWeb画面からの直接呼び出しを禁止。 */
function benchmarkRosterReads_() {
  var results=[],previous={};
  // 順序による偏りを減らすため公開/入力で実行順を逆にする。実測は数回比較する。
  [[false,'legacy'],[false,'batch'],[true,'batch'],[true,'legacy']].forEach(pair=>{
    var metrics={},roster=webRoster_(pair[0],{mode:pair[1],metrics:metrics});
    var key=String(pair[0]),snapshot=JSON.stringify({operators:roster.operators,history:roster.history});
    if(previous[key]!==undefined)metrics.sameData=previous[key]===snapshot;
    else previous[key]=snapshot;
    results.push(metrics);
  });
  console.log('[roster benchmark] '+JSON.stringify(results));
  return results;
}
function webHistory_(ss) {
  var sheet=ss.getSheetByName('履歴');if(!sheet)return [];
  var last=sheet.getLastRow();if(last<2)return [];
  var start=Math.max(2,last-199);
  return sheet.getRange(start,1,last-start+1,2).getValues().filter(r=>r[0]&&r[1]).reverse().slice(0,50).map(r=>({time:r[0] instanceof Date?r[0].toISOString():String(r[0]),name:String(r[1])}));
}
function webFindOperator_(ss,name,settings) {
  settings=settings||PropertiesService.getScriptProperties().getProperties();
  var found=null,years=ss.getSheets().map(sheet=>({sheet:sheet,name:sheet.getName()})).filter(y=>/^\d{4}年$/.test(y.name));
  var read=webReadYears_(years,String(settings.SPREADSHEET_ID||'').trim(),settings.ROSTER_READ_MODE);
  read.values.forEach((values,index)=>{
    if(values.length<2)return;
    var headers=webHeaders_(values);
    values.slice(1).forEach((row,i)=>{
      if(Ark.name(row[headers.indexOf('オペレーター名')])!==name)return;
      if(found)throw Error('同名の行が重複しています。');
      // Sheets APIが省略する末尾の空セルを、getValuesと同じ空文字へ戻す。
      // 保存時の差分判定で、未変更の空欄を変更扱いにしない。
      var cells=row.slice();headers.forEach((_,col)=>{if(cells[col]==null)cells[col]='';});
      found={sheet:years[index].sheet,row:i+2,headers:headers,values:cells};
    });
  });
  if(!found)throw Error('オペレーターが見つかりません。再読み込みしてください。');return found;
}
