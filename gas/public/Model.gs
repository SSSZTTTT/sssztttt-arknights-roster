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
  function skill(v){var s=text(v).toUpperCase();return /^[123]$/.test(s)?'M'+s:s==='0'||s==='M0'?'':s;}
  function maxed(o){var c=caps[o.rarity];return !!c&&o.elite===c[0]&&o.level===c[1];}
  function mastered(o){var s=o.skills.filter(v=>v!=='-');return o.rarity>=4&&s.length>0&&s.every(v=>v==='M3');}
  function fromRow(row,headers){
    var get=k=>row[headers.indexOf(k)],r=Number(text(get('レア')).replace(/[★☆]/g,''));
    var elite=number(get('昇進'));if(r<=2&&text(get('昇進'))==='-')elite=0;
    return {name:name(get('オペレーター名')),rarity:r,job:text(get('職業')),owned:get('所持状態')===true||text(get('所持状態')).toUpperCase()==='TRUE',elite:elite,level:number(get('Lv')),potential:number(get('潜在')),skills:['S1','S2','S3'].map(k=>skill(get(k))),modules:modules.map(k=>text(get(k)))};
  }
  function summarize(operators,rarity){
    var counts=jobs.map(job=>({job:job,count:0,skills:0,m3:0,mastered:0,potential:0,max:0}));
    operators.filter(o=>o.owned&&o.rarity>=4&&(!rarity||o.rarity===Number(rarity))).forEach(o=>{
      var c=counts.find(c=>c.job===o.job);if(!c)return;
      c.count++;c.skills+=o.skills.filter(s=>s!=='-').length;c.m3+=o.skills.filter(s=>s==='M3').length;c.mastered+=Number(mastered(o));c.potential+=Number(o.potential>=6);c.max+=Number(maxed(o));
    });
    var total={job:'全職合計',count:0,skills:0,m3:0,mastered:0,potential:0,max:0};
    counts.forEach(c=>Object.keys(total).filter(k=>k!=='job').forEach(k=>total[k]+=c[k]));
    return {rows:counts,total:total};
  }
  function search(operators,filters){
    var q=text(filters.query||'').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
    return operators.filter(o=>{
      var n=text(o.name).toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
      return (!q||n.includes(q))&&(!filters.job||o.job===filters.job)&&(!filters.rarity||o.rarity===Number(filters.rarity))&&(!filters.state||filters.state==='owned'&&o.owned||filters.state==='unowned'&&!o.owned||filters.state==='unfinished'&&o.owned&&(!maxed(o)||(o.rarity>=4&&!mastered(o))));
    }).sort((a,b)=>filters.sort==='name'?a.name.localeCompare(b.name,'ja'):filters.sort==='rarity'?b.rarity-a.rarity||b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'ja'):b.date.localeCompare(a.date)||b.rarity-a.rarity||a.name.localeCompare(b.name,'ja'));
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
  return {jobs:jobs,caps:caps,modules:modules,fields:fields,columns:columns,text:text,name:name,fromRow:fromRow,maxed:maxed,mastered:mastered,summarize:summarize,search:search,validate:validate};
})();
if(typeof module!=='undefined')module.exports=Ark;
