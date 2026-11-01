const {test}=require('node:test');
const assert=require('node:assert/strict');
const Ark=require('../src/model.js');
const values={owned:true,elite:2,level:80,potential:6,s1:'M3',s2:'7',s3:'-',x:3,y:'-',delta:'',alpha:0};
const op=(extra={})=>({name:'アーミヤ',rarity:5,job:'術師',owned:true,elite:2,level:80,potential:6,skills:['M3','M3','M3'],date:'2020-01-16',...extra});
test('all six rarities require both final promotion and final level',()=>{
  for(const [rarity,[elite,level]] of Object.entries(Ark.caps)){
    assert.equal(Ark.maxed(op({rarity:Number(rarity),elite,level})),true);
    assert.equal(Ark.maxed(op({rarity:Number(rarity),elite,level:level-1})),false);
    assert.equal(Ark.maxed(op({rarity:Number(rarity),elite:elite+1,level})),false);
  }
});
test('summary counts actual skill slots including star-five S3 and blank, excludes dash',()=>{
  const all=[op(),op({name:'通常',rarity:4,level:70,skills:['M3','','-'],potential:5}),op({rarity:6,level:90,potential:28,skills:['M3','M2','7']}),op({rarity:3}),op({owned:false})];
  const t=Ark.summarize(all).total;
  assert.deepEqual([t.count,t.skills,t.m3,t.mastered,t.potential,t.max],[3,8,5,1,2,3]);
  assert.equal(Ark.summarize(all,5).total.skills,3);
  assert.equal(Ark.summarize(all,4).total.skills,2);
  assert.equal(Ark.summarize([]).total.count,0);
});
test('potential beyond six is retained only for star six',()=>{
  assert.equal(Ark.validate({...values,potential:28},6).potential,28);
  assert.throws(()=>Ark.validate({...values,potential:7},5));
});
test('validation rejects invalid fields, formulas, fractions and above-cap values',()=>{
  for(const bad of [{...values,owned:'true'},{...values,level:81},{...values,level:1.5},{...values,level:'=NOW()'},{...values,s3:'M4'},{...values,x:4},{...values,extra:1}])assert.throws(()=>Ark.validate(bad,5));
  assert.throws(()=>Ark.validate({...values,elite:1,level:55},3));
  assert.equal(Ark.validate({...values,elite:1,level:55,s1:7,s2:'-',s3:'-'},3).s1,'7');
});
test('skill slots can be changed manually without hardcoded Amiya exception',()=>{
  assert.equal(Ark.validate({...values,s3:'M3'},5).s3,'M3');
  assert.equal(Ark.validate({...values,s3:'-'},5).s3,'-');
});
test('name identity preserves superscript; search normalizes kana and width',()=>{
  assert.equal(Ark.name(' GALLUS² '),'GALLUS²');
  assert.equal(Ark.search([op()],{query:'あーみや'}).length,1);
  assert.equal(Ark.search([op({name:'W'})],{query:'ｗ'}).length,1);
  assert.equal(Ark.search([op()],{state:'unfinished'}).length,0);
  assert.equal(Ark.search([op({skills:['M3','7','-']})],{state:'unfinished'}).length,1);
});

test('level order prioritizes promotion, level, job and name without a rarity tie-break',()=>{
  const list=[op({name:'ア',elite:1,level:80,job:'先鋒'}),op({name:'ウ',elite:2,level:1,job:'先鋒'}),op({name:'イ',elite:2,level:90,job:'前衛'}),op({name:'エ',elite:2,level:90,job:'先鋒',rarity:4}),op({name:'オ',elite:2,level:90,job:'先鋒',rarity:6}),op({name:'未入力',elite:null,level:null}),op({name:'未昇進',elite:0,level:30}),op({name:'レベル未入力',elite:2,level:null})];
  assert.deepEqual(Ark.search(list,{sort:'level'}).map(o=>o.name),['エ','オ','イ','ウ','レベル未入力','ア','未昇進','未入力']);
  assert.deepEqual(Ark.search(list,{}),Ark.search(list,{sort:'level'}));
  assert.equal(list[0].name,'ア');
  assert.deepEqual(Ark.search([...Ark.jobs].reverse().map(job=>op({name:job,job})),{sort:'level'}).map(o=>o.job),Ark.jobs);
});

test('tied levels sort kana before Han and reproduce the supplied seven-name game order',()=>{
  const han=['百錬ガヴィル','赤刃明霄チェン','豊川祥子','怒潮ズィマー','聖約イグゼキュター','司霆レイズ','耀騎士ニアール'];
  const list=[...han].reverse().concat(['ウタゲ','アーミヤ','イネス']).map(name=>op({name,job:'前衛'}));
  for(const sort of ['level','name'])assert.deepEqual(Ark.search(list,{sort}).map(o=>o.name),['アーミヤ','イネス','ウタゲ',...han]);
});

test('explicit recent and rarity sorts remain available alongside level sorting',()=>{
  const list=[op({name:'新しい',rarity:4,date:'2026-01-01'}),op({name:'高レア',rarity:6,date:'2020-01-01'})];
  assert.equal(Ark.search(list,{sort:'recent'})[0].name,'新しい');
  assert.equal(Ark.search(list,{sort:'rarity'})[0].name,'高レア');
});
