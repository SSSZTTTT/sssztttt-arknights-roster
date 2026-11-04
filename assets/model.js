/* 公開画面・入力画面・GASで共有する育成データのルール。 */
var Ark = (function () {
  'use strict';
  var jobs=['先鋒','前衛','重装','狙撃','術師','医療','補助','特殊'];
  var caps={1:[0,30],2:[0,30],3:[1,55],4:[2,70],5:[2,80],6:[2,90]};
  var modules=['X','Y','Δ','α'];
  var fields=['owned','elite','level','potential','s1','s2','s3','x','y','delta','alpha'];
  var columns={owned:'所持状態',elite:'昇進',level:'Lv',potential:'潜在',s1:'S1',s2:'S2',s3:'S3',x:'X',y:'Y',delta:'Δ',alpha:'α'};
  function text(v){return v==null?'':String(v).normalize('NFKC').trim();}
  function name(v){return v==null?'':String(v).normalize('NFC').trim();}
  function number(v){return text(v)===''||text(v)==='-'?null:Number(text(v));}
  // 「-」は潜在そのものが存在しない。空欄（未入力）とは区別する。
  function hasPotential(o){return text(o.potential)!=='-';}
  function skill(v){var s=text(v).toUpperCase();return /^[123]$/.test(s)?'M'+s:s==='0'||s==='M0'?'':s;}
  function maxed(o){var c=caps[o.rarity];return !!c&&o.elite===c[0]&&o.level===c[1];}
  function mastered(o){var s=o.skills.filter(v=>v!=='-');return o.rarity>=4&&s.length>0&&s.every(v=>v==='M3');}
  function fromRow(row,headers){
    var get=k=>row[headers.indexOf(k)],r=Number(text(get('レア')).replace(/[★☆]/g,''));
    var elite=number(get('昇進'));if(r<=2&&text(get('昇進'))==='-')elite=0;
    return {name:name(get('オペレーター名')),rarity:r,job:text(get('職業')),owned:get('所持状態')===true||text(get('所持状態')).toUpperCase()==='TRUE',elite:elite,level:number(get('Lv')),potential:text(get('潜在'))==='-'?'-':number(get('潜在')),skills:['S1','S2','S3'].map(k=>skill(get(k))),modules:modules.map(k=>text(get(k)))};
  }
  function summarize(operators,rarity){
    var counts=jobs.map(job=>({job:job,count:0,skills:0,m3:0,mastered:0,potential:0,potentialCount:0,max:0}));
    operators.filter(o=>o.owned&&o.rarity>=4&&(!rarity||o.rarity===Number(rarity))).forEach(o=>{
      var c=counts.find(c=>c.job===o.job);if(!c)return;
      c.count++;c.skills+=o.skills.filter(s=>s!=='-').length;c.m3+=o.skills.filter(s=>s==='M3').length;c.mastered+=Number(mastered(o));c.potential+=Number(o.potential>=6);c.potentialCount+=Number(hasPotential(o));c.max+=Number(maxed(o));
    });
    var total={job:'全職合計',count:0,skills:0,m3:0,mastered:0,potential:0,potentialCount:0,max:0};
    counts.forEach(c=>Object.keys(total).filter(k=>k!=='job').forEach(k=>total[k]+=c[k]));
    return {rows:counts,total:total};
  }
  // 漢字名は後方へ。提示されたゲーム内の7名の順序に一致するピンイン順を使用。
  // ゲーム内部の全ソート仕様を確認したものではない。読み仮名や個別名の決め打ちはしない。
  var kanaOrder,hanOrder;
  function compareNames(a,b){
    var an=text(a),bn=text(b),ah=/^\p{Script=Han}/u.test(an),bh=/^\p{Script=Han}/u.test(bn);
    if(ah!==bh)return ah?1:-1;
    kanaOrder=kanaOrder||new Intl.Collator('ja',{numeric:true});
    hanOrder=hanOrder||new Intl.Collator('zh-u-co-pinyin',{numeric:true});
    return (ah?hanOrder:kanaOrder).compare(an,bn)||(an<bn?-1:an>bn?1:0);
  }
  function levelOrder(a,b){
    var rank=v=>v==null||v===''?-1:Number(v);
    var jobRank=j=>jobs.includes(j)?jobs.indexOf(j):jobs.length;
    return rank(b.elite)-rank(a.elite)||rank(b.level)-rank(a.level)||jobRank(a.job)-jobRank(b.job)||compareNames(a.name,b.name);
  }
  function searchName(value){return text(value).toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));}
  function filterOperators(operators,filters,getSearchName){
    var query=searchName(filters.query||''),rarity=Number(filters.rarity),state=filters.state;
    return operators.filter(o=>
      (!filters.job||o.job===filters.job)&&(!filters.rarity||o.rarity===rarity)&&(!query||getSearchName(o).includes(query))&&
      (!state||state==='owned'&&o.owned||state==='unowned'&&!o.owned||state==='unfinished'&&o.owned&&(!maxed(o)||(o.rarity>=4&&!mastered(o))))
    );
  }
  function operatorOrder(sort){
    if(sort==='name')return (a,b)=>compareNames(a.name,b.name);
    if(sort==='rarity')return (a,b)=>b.rarity-a.rarity||String(b.date||'').localeCompare(String(a.date||''))||compareNames(a.name,b.name);
    if(sort==='recent')return (a,b)=>String(b.date||'').localeCompare(String(a.date||''))||b.rarity-a.rarity||compareNames(a.name,b.name);
    return levelOrder;
  }
  function search(operators,filters){
    return filterOperators(operators,filters,o=>searchName(o.name)).sort(operatorOrder(filters.sort));
  }
  function prepareSearch(operators){
    var snapshot=operators.slice(),orders=new Map(),names=new Map();
    function normalizedName(o){
      if(!names.has(o))names.set(o,searchName(o.name));
      return names.get(o);
    }
    return filters=>{
      var sort=filters.sort||'level';
      if(!orders.has(sort))orders.set(sort,snapshot.slice().sort(operatorOrder(sort)));
      return filterOperators(orders.get(sort),filters,normalizedName);
    };
  }
  function validate(values,rarity){
    if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length!==fields.length||fields.some(k=>!Object.prototype.hasOwnProperty.call(values,k)))throw Error('入力項目が一致しません。再読み込みしてください。');
    if(typeof values.owned!=='boolean')throw Error('所持状態が不正です。');
    var c=caps[rarity];if(!c)throw Error('レアリティが不正です。');
    var out={owned:values.owned};
    function integer(key,min,max,label){var v=text(values[key]);if(v===''||v==='-'){out[key]=v;return;}if(!/^\d+$/.test(v)||Number(v)<min||Number(v)>max)throw Error(label+'は'+min+'〜'+max+'の整数で入力してください。');out[key]=Number(v);}
    integer('elite',0,c[0],'昇進');integer('level',1,c[1],'レベル');integer('potential',1,rarity===6?9999:6,'潜在');
    ['s1','s2','s3'].forEach(k=>{var v=skill(values[k]);if(!['','-','7','M1','M2','M3'].includes(v)||rarity<4&&/^M/.test(v))throw Error('スキルの値が不正です。');out[k]=v;});
    ['x','y','delta','alpha'].forEach(k=>{var v=text(values[k]);if(!['','-','0','1','2','3'].includes(v))throw Error('モジュールは1〜3で選択してください。');out[k]=v===''||v==='-'?v:Number(v);});
    return out;
  }
  return {jobs:jobs,caps:caps,modules:modules,fields:fields,columns:columns,text:text,name:name,fromRow:fromRow,maxed:maxed,mastered:mastered,hasPotential:hasPotential,summarize:summarize,search:search,prepareSearch:prepareSearch,validate:validate};
})();
if(typeof module!=='undefined')module.exports=Ark;
