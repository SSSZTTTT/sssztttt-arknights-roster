/** 既存のWiki取得コードを入力API用に再利用。対象シートはSPREADSHEET_IDで指定。 */
const ARK_IMPORT = Object.freeze({
  url: 'https://arknights.wikiru.jp/?' + encodeURIComponent('オペレーター実装履歴'),
  timezone: 'Asia/Tokyo',
  minYear: 2020,
  minimumSourceCount: 300, // HTMLの取得失敗・一覧の大幅な欠損を検知
  maximumAdditions: 50,   // 通常の追加数を大きく超えたら、書き込まず停止
  newOwned: false,        // 新規取得＝所持ではないため未所持で追加
  headers: ['実装日','レア','職業','オペレーター名','昇進','Lv','潜在','S1','S2','S3','X','Y','Δ','α','所持状態'],
  jobs: ['先鋒','前衛','重装','狙撃','術師','医療','補助','特殊']
});

function arkImportFetch_() {
  const response = UrlFetchApp.fetch(ARK_IMPORT.url, {
    muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (response.getResponseCode() !== 200) throw new Error('Wiki取得失敗：HTTP ' + response.getResponseCode());
  // 現行WikiはUTF-8。移行前の文字コードにも対応するが、正しいページか必ず検査する。
  for (const encoding of ['UTF-8', 'EUC-JP', 'Shift_JIS']) {
    const html = response.getContentText(encoding);
    if (/<title[^>]*>[^<]*オペレーター実装履歴[^<]*<\/title>/i.test(html) && html.includes('職業')) return html;
  }
  throw new Error('実装履歴ページを確認できません。エラーページまたは文字コードの変更が考えられます。');
}

function arkImportText_(value) { return value == null ? '' : String(value).normalize('NFC').trim(); }

function arkImportEntities_(text) {
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', ndash:'–', mdash:'—' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, key) => {
    if (key[0] !== '#') return Object.prototype.hasOwnProperty.call(named, key.toLowerCase()) ? named[key.toLowerCase()] : all;
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}

/** 表・行・セルの境界を保持する小さなHTML読み取り処理。入れ子の表も分離する。 */
function arkImportTables_(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tokens = html.match(/<[^>]*>|[^<]+/g) || [];
  const tables = [], stack = [];
  for (const token of tokens) {
    if (token[0] !== '<') {
      if (stack.length && stack[stack.length - 1].cell) stack[stack.length - 1].cell.text += token;
      continue;
    }
    const match = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(token);
    if (!match) continue;
    const closing = !!match[1], tag = match[2].toLowerCase();
    if (tag === 'table') {
      if (closing) { if (stack.length) stack.pop(); }
      else { const table = []; tables.push(table); stack.push({ table:table, row:null, cell:null }); }
      continue;
    }
    if (!stack.length) continue;
    const frame = stack[stack.length - 1];
    if (tag === 'tr') {
      frame.cell = null;
      if (closing) frame.row = null;
      else { frame.row = []; frame.table.push(frame.row); }
    } else if (tag === 'td' || tag === 'th') {
      if (closing) frame.cell = null;
      else if (frame.row) {
        const span = /\b(?:rowspan|colspan)\s*=\s*["']?(\d+)/gi;
        let m, merged = false;
        while ((m = span.exec(token))) if (Number(m[1]) !== 1) merged = true;
        frame.cell = { text:'', image:'', header:tag === 'th', merged:merged };
        frame.row.push(frame.cell);
      }
    } else if (!closing && frame.cell) {
      if (tag === 'br') frame.cell.text += ' ';
      if (tag === 'img') {
        const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(token);
        if (alt) frame.cell.image += alt[1] || alt[2] || '';
      }
    }
  }
  return tables;
}

function arkImportCell_(cell) {
  return arkImportText_(arkImportEntities_(cell.text.trim() || cell.image));
}

function arkImportDate_(text) {
  const m = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(arkImportText_(text));
  if (!m) return null;
  const y = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const date = new Date(Date.UTC(y, month - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return String(y).padStart(4,'0') + '/' + String(month).padStart(2,'0') + '/' + String(day).padStart(2,'0');
}

function arkImportParseHistory_(html, today) {
  if (!arkImportDate_(today)) throw new Error('基準日が不正です。');
  const operators = [], seen = new Map();
  const excluded = { unreleased:0, future:0, before2020:0, duplicate:0 };
  let matchedTables = 0;
  for (const table of arkImportTables_(html)) {
    let columns = null, tableMatched = false;
    for (const row of table) {
      const cells = row.map(arkImportCell_);
      const find = names => cells.findIndex(c => names.includes(c));
      const candidate = { name:find(['名前','オペレーター名','オペレーター']), date:find(['実装日','日本実装日']), rarity:find(['★','レア','レアリティ']), job:find(['職業','兵種']) };
      if (Object.values(candidate).every(i => i >= 0)) {
        if (row.some(c => c.merged)) throw new Error('一覧の見出しに結合セルがあります。列構造を確認してください。');
        columns = candidate;
        if (!tableMatched) { matchedTables++; tableMatched = true; }
        continue;
      }
      if (!columns || cells.every(c => !c)) continue;
      if (row.some(c => c.merged) || Math.max(...Object.values(columns)) >= cells.length) throw new Error('一覧の列構造が変わっています。更新を停止しました。');
      const rawDate = cells[columns.date];
      if (['', '-', '－', '—', '未実装'].includes(rawDate)) { excluded.unreleased++; continue; }
      const date = arkImportDate_(rawDate);
      if (!date) throw new Error('日本実装日を解釈できません：' + rawDate);
      if (Number(date.slice(0,4)) < ARK_IMPORT.minYear) { excluded.before2020++; continue; }
      if (date > today) { excluded.future++; continue; }
      const name = cells[columns.name];
      // 文字数・名前中の単語で除外しない。GALLUS²の上付き文字も保持する。
      if (!name || /^[=+@]/.test(name) || /&(?:#\w+|[a-z]+);/i.test(name)) throw new Error('オペレーター名を確認できません：' + name);
      const rarity = Number(cells[columns.rarity].replace(/^[★☆]\s*/, ''));
      const job = cells[columns.job];
      if (![1,2,3,4,5,6].includes(rarity) || !ARK_IMPORT.jobs.includes(job)) throw new Error(name + '：レアリティまたは職業が不正です。');
      const op = { name:name, date:date, rarity:rarity, job:job };
      if (seen.has(name)) {
        if (JSON.stringify(seen.get(name)) !== JSON.stringify(op)) throw new Error(name + '：取得元に内容の異なる同名行があります。');
        excluded.duplicate++;
        continue;
      }
      seen.set(name, op); operators.push(op);
    }
  }
  if (!matchedTables || operators.length < ARK_IMPORT.minimumSourceCount) throw new Error('取得件数が少なすぎます（' + operators.length + '人）。Wikiの構造または通信結果を確認してください。');
  return { operators:operators, excluded:excluded };
}

function arkImportHeaderMap_(headers, sheetName) {
  const map = {};
  ARK_IMPORT.headers.forEach(name => {
    const indexes = headers.map((h,i) => arkImportText_(h) === name ? i : -1).filter(i => i >= 0);
    if (indexes.length !== 1) throw new Error(sheetName + '：「' + name + '」列がないか重複しています。');
    map[name] = indexes[0];
  });
  return map;
}

function arkImportReadState_(ss, includeSnapshot = true) {
  const sheets = ss.getSheets().filter(s => /^\d{4}年$/.test(s.getName()) && Number(s.getName().slice(0,4)) >= ARK_IMPORT.minYear).map(sheet => {
    const lastRow = sheet.getLastRow(), width = sheet.getLastColumn();
    if (!lastRow || !width) throw new Error(sheet.getName() + '：空の年別シートです。見出しを設定してください。');
    const range = sheet.getRange(1,1,lastRow,width), values = range.getValues(), formulas = includeSnapshot ? range.getFormulas() : null;
    return { sheet:sheet, name:sheet.getName(), lastRow:lastRow, width:width, values:values, formulas:formulas, headers:values[0], map:arkImportHeaderMap_(values[0],sheet.getName()) };
  });
  const rows = [], names = new Set();
  let timeZone;
  sheets.forEach(s => s.values.slice(1).forEach((values,i) => {
    const name = arkImportText_(values[s.map['オペレーター名']]);
    if (!name) {
      if (values.some(v => v !== '' && v != null && v !== false)) throw new Error(s.name + '!' + (i+2) + '行：名前が空のデータがあります。');
      return;
    }
    if (names.has(name)) throw new Error('シート間で名前が重複しています：' + name);
    names.add(name);
    let date = values[s.map['実装日']];
    if (date instanceof Date) {
      if (timeZone === undefined) timeZone = ss.getSpreadsheetTimeZone();
      date = Utilities.formatDate(date, timeZone, 'yyyy/MM/dd');
    }
    else if (typeof date === 'number') date = new Date((date - 25569) * 86400000).toISOString().slice(0,10).replace(/-/g,'/');
    rows.push({ name:name, sheetName:s.name, row:i+2, date:arkImportDate_(date), rarity:Number(values[s.map['レア']]), job:arkImportText_(values[s.map['職業']]) });
  }));
  return { sheets:sheets, rows:rows, signature:includeSnapshot ? JSON.stringify(sheets.map(s => [s.name,s.values,s.formulas])) : null };
}

function arkImportPlan_(source, state) {
  const incoming = new Map(source.operators.map(o => [o.name,o]));
  const missing = state.rows.filter(r => !incoming.has(r.name));
  if (missing.length) throw new Error('既存の ' + missing.length + '人が取得元から見つかりません。削除せず停止します：' + missing.slice(0,10).map(r => r.name).join('、'));
  const existing = new Map(state.rows.map(r => [r.name,r]));
  const additions = [], updates = [];
  source.operators.forEach(op => {
    const row = existing.get(op.name);
    if (!row) { additions.push(op); return; }
    if (row.sheetName !== op.date.slice(0,4) + '年') throw new Error(op.name + '：実装年が変わっています。既存行を手動で移動してから再実行してください。');
    const fields = [];
    if (row.date !== op.date) fields.push('実装日');
    if (row.rarity !== op.rarity) fields.push('レア');
    if (row.job !== op.job) fields.push('職業');
    if (fields.length) {
      const sheet = state.sheets.find(s => s.name === row.sheetName);
      if (fields.some(f => sheet.formulas[row.row-1][sheet.map[f]])) throw new Error(op.name + '：基本情報に数式があるため上書きできません。');
      updates.push({ operator:op, row:row.row, sheetName:row.sheetName, fields:fields });
    }
  });
  if (additions.length > ARK_IMPORT.maximumAdditions) throw new Error('追加予定が ' + additions.length + '人あります。取得内容を確認してください（上限 ' + ARK_IMPORT.maximumAdditions + '人）。');
  additions.sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name,'ja'));
  const newYears = [...new Set(additions.map(o => o.date.slice(0,4)+'年'))].filter(n => !state.sheets.some(s => s.name === n));
  return { additions:additions, updates:updates, newYears:newYears };
}

/** 新規行だけ初期化。例外的なスキル構成は手動修正する運用。 */
function arkImportNewRow_(op, headers) {
  const skillCount = op.rarity >= 6 ? 3 : op.rarity >= 4 ? 2 : op.rarity === 3 ? 1 : 0;
  const data = { '実装日':arkImportSerial_(op.date), 'レア':op.rarity, '職業':op.job, 'オペレーター名':op.name, '所持状態':ARK_IMPORT.newOwned };
  for (let i=1;i<=3;i++) data['S'+i] = i <= skillCount ? '' : '-';
  return headers.map(h => { const key = arkImportText_(h); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : ''; });
}

function arkImportSerial_(date) {
  const parts = date.split('/').map(Number);
  return Date.UTC(parts[0],parts[1]-1,parts[2]) / 86400000 + 25569;
}

function arkImportApply_(ss, state, plan) {
  const states = new Map(state.sheets.map(s => [s.name,s]));
  plan.updates.forEach(u => {
    const s = states.get(u.sheetName);
    const data = { '実装日':arkImportSerial_(u.operator.date), 'レア':u.operator.rarity, '職業':u.operator.job };
    u.fields.forEach(f => {
      const range = s.sheet.getRange(u.row,s.map[f]+1);
      range.setValue(data[f]);
      if (f === '実装日') range.setNumberFormat('yyyy/mm/dd');
    });
  });
  const groups = new Map();
  plan.additions.forEach(op => {
    const name = op.date.slice(0,4)+'年';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(op);
  });
  groups.forEach((ops,name) => {
    let s = states.get(name);
    if (!s) {
      const sheet = ss.insertSheet(name), headers = ARK_IMPORT.headers.slice();
      sheet.getRange(1,1,1,headers.length).setValues([headers]).setBackground('#2c3e50').setFontColor('white').setFontWeight('bold').setHorizontalAlignment('center');
      sheet.setFrozenRows(1); sheet.setFrozenColumns(4);
      sheet.setColumnWidth(1,110); sheet.setColumnWidth(4,200);
      s = { sheet:sheet, headers:headers, width:headers.length, lastRow:1, map:arkImportHeaderMap_(headers,name) };
      states.set(name,s);
    }
    const start = s.lastRow + 1, end = start + ops.length - 1;
    if (s.sheet.getMaxRows() < end) s.sheet.insertRowsAfter(s.sheet.getMaxRows(),end-s.sheet.getMaxRows());
    const target = s.sheet.getRange(start,1,ops.length,s.width);
    if (s.lastRow > 1) {
      const template = s.sheet.getRange(s.lastRow,1,1,s.width);
      for (let i=0;i<ops.length;i++) {
        const destination = s.sheet.getRange(start+i,1,1,s.width);
        template.copyTo(destination,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
        template.copyTo(destination,SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false);
      }
    } else {
      target.setHorizontalAlignment('center');
      s.sheet.getRange(start,s.map['オペレーター名']+1,ops.length,1).setHorizontalAlignment('left');
    }
    // チェックボックス設定は値を書き込む前。既存行には触れない。
    s.sheet.getRange(start,s.map['所持状態']+1,ops.length,1).insertCheckboxes();
    target.setValues(ops.map(op => arkImportNewRow_(op,s.headers)));
    s.sheet.getRange(start,s.map['実装日']+1,ops.length,1).setNumberFormat('yyyy/mm/dd');
  });
}

function arkImportVerify_(ss, plan) {
  // 反映後は結果の行だけを照合するため、競合チェック用の数式と署名は不要。
  const after = arkImportReadState_(ss, false);
  for (const op of plan.additions.concat(plan.updates.map(u => u.operator))) {
    const row = after.rows.find(r => r.name === op.name);
    if (!row || row.date !== op.date || row.rarity !== op.rarity || row.job !== op.job) throw new Error('書き込み結果を確認できません：' + op.name + '。シートを確認してください。');
  }
}

function arkImportColumn_(n) {
  let text = '';
  for (n++;n>0;n=Math.floor((n-1)/26)) text = String.fromCharCode(65+(n-1)%26)+text;
  return text;
}

/** 現在の集計用LET式のVSTACK部分だけ更新する。集計表の数式・書式は保持する。 */
function arkImportHelperPlan_(ss, state, plan) {
  const sheet = ss.getSheetByName('_集計用データ');
  if (!sheet) {
    if (plan.newYears.length) throw new Error('新年の集計参照を更新する補助シートがありません。先に集計用数式を設置してください。');
    return null;
  }
  const before = sheet.getRange('A2').getFormula();
  const prefix = '=ARRAYFORMULA(LET(raw,VSTACK(';
  if (!before.startsWith(prefix)) throw new Error('集計用データA2が想定と異なります。集計の参照を確認してから更新してください。');
  const sources = state.sheets.map(s => ({ name:s.name, headers:s.headers })).concat(plan.newYears.map(name => ({ name:name, headers:ARK_IMPORT.headers })));
  sources.sort((a,b) => a.name.localeCompare(b.name));
  const columns = ['オペレーター名','レア','職業','所持状態','潜在','S1','S2','S3','昇進','Lv'];
  const stack = 'VSTACK(' + sources.map(s => {
    const map = arkImportHeaderMap_(s.headers,s.name);
    return 'HSTACK(' + columns.map(c => { const col = arkImportColumn_(map[c]); return "'"+s.name+"'!"+col+'2:'+col; }).join(',') + ')';
  }).join(',') + ')';
  const start = prefix.indexOf('VSTACK(');
  const after = arkImportReplaceCall_(before,start,stack);
  return { sheet:sheet, before:before, after:after, changed:before!==after, years:sources.map(s => s.name) };
}

function arkImportReplaceCall_(formula, start, replacement) {
  let depth=0, quote='';
  for (let i=start;i<formula.length;i++) {
    const c=formula[i];
    if (quote) {
      if (c===quote) { if (formula[i+1]===quote) i++; else quote=''; }
    } else if (c==='"' || c==="'") quote=c;
    else if (c==='(') depth++;
    else if (c===')' && --depth===0) return formula.slice(0,start)+replacement+formula.slice(i+1);
  }
  throw new Error('集計参照式の括弧を解釈できません。');
}
