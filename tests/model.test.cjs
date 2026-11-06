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

test('potential dash survives row normalization while blanks remain unknown',()=>{
  const headers=['オペレーター名','レア','職業','所持状態','潜在'];
  for(const [input,expected,eligible] of [['-', '-',false],[' － ','-',false],['',null,true],[null,null,true],[6,6,true],[28,28,true]]){
    const row=Ark.fromRow(['テスト',6,'前衛',true,input],headers);
    assert.equal(row.potential,expected);
    assert.equal(Ark.hasPotential(row),eligible);
  }
});

test('potential rates exclude absent potential without excluding missing data or other training metrics',()=>{
  const list=[op({potential:'-'}),op({potential:6}),op({potential:null}),op({potential:5}),op({rarity:6,potential:28,job:'前衛'}),op({potential:'-',owned:false}),op({rarity:3,potential:6})];
  const summary=Ark.summarize(list),t=summary.total;
  assert.deepEqual([t.count,t.potential,t.potentialCount,t.mastered],[5,2,4,5]);
  const caster=summary.rows.find(c=>c.job==='術師');
  assert.deepEqual([caster.count,caster.potential,caster.potentialCount],[4,1,3]);
  assert.equal(Ark.summarize(list,5).total.potentialCount,3);
  assert.equal(Ark.summarize(list,6).total.potentialCount,1);
  const absent=Ark.summarize([op({potential:'-'})]).total;
  assert.deepEqual([absent.count,absent.potential,absent.potentialCount],[1,0,0]);
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

test('all four sort criteria support both directions without mutating source rows',()=>{
  const list=[
    op({name:'ア',rarity:6,elite:1,level:70,date:'2021-01-01'}),
    op({name:'イ',rarity:4,elite:2,level:10,date:'2024-01-01'}),
    op({name:'ウ',rarity:5,elite:0,level:30,date:'2019-01-01'}),
    op({name:'エ',rarity:6,elite:2,level:90,date:'2020-01-01'})
  ];
  const original=structuredClone(list);
  const expected={
    level:{asc:['ウ','ア','イ','エ'],desc:['エ','イ','ア','ウ']},
    rarity:{asc:['イ','ウ','エ','ア'],desc:['エ','ア','ウ','イ']},
    recent:{asc:['ウ','エ','ア','イ'],desc:['イ','ア','エ','ウ']},
    name:{asc:['ア','イ','ウ','エ'],desc:['エ','ウ','イ','ア']}
  };
  for(const [sort,directions] of Object.entries(expected)){
    for(const [direction,names] of Object.entries(directions)){
      assert.deepEqual(Ark.search(list,{sort,direction}).map(o=>o.name),names,sort+' '+direction);
    }
  }
  assert.deepEqual(list,original);
  assert.deepEqual(Ark.search(list,{sort:'name'}),Ark.search(list,{sort:'name',direction:'asc'}));
  assert.deepEqual(Ark.search(list,{sort:'rarity',direction:'invalid'}),Ark.search(list,{sort:'rarity',direction:'desc'}));
  assert.deepEqual(Ark.search(list,{sort:'unknown',direction:'asc'}),Ark.search(list,{sort:'level',direction:'asc'}));
});

test('equal primary values use promotion, level, job and name instead of unrelated criteria',()=>{
  const tied=[
    op({name:'オ',elite:1,level:80,job:'先鋒',rarity:6,date:'2026-01-01'}),
    op({name:'エ',elite:2,level:1,job:'先鋒',rarity:5,date:'2025-01-01'}),
    op({name:'ウ',elite:2,level:90,job:'前衛',rarity:4,date:'2024-01-01'}),
    op({name:'イ',elite:2,level:90,job:'先鋒',rarity:3,date:'2023-01-01'}),
    op({name:'ア',elite:2,level:90,job:'先鋒',rarity:2,date:'2022-01-01'})
  ];
  for(const direction of ['asc','desc']){
    const sameRarity=tied.map(o=>({...o,rarity:6}));
    const sameDate=tied.map(o=>({...o,date:'2020-01-01'}));
    assert.deepEqual(Ark.search(sameRarity,{sort:'rarity',direction}).map(o=>o.name),['ア','イ','ウ','エ','オ']);
    assert.deepEqual(Ark.search(sameDate,{sort:'recent',direction}).map(o=>o.name),['ア','イ','ウ','エ','オ']);
    const sameName=[op({name:'Ａ',id:'lower',elite:1,level:80}),op({name:'A',id:'higher',elite:2,level:1})];
    assert.deepEqual(Ark.search(sameName,{sort:'name',direction}).map(o=>o.id),['higher','lower']);
    const sameLevel=[...Ark.jobs].reverse().map(job=>op({name:job,job}));
    assert.deepEqual(Ark.search(sameLevel,{sort:'level',direction}).map(o=>o.job),Ark.jobs);
  }
});

test('missing sort values stay last in their comparison group for both directions',()=>{
  const levels=[
    op({name:'ア',elite:0,level:10}),op({name:'イ',elite:2,level:1}),
    op({name:'ウ',elite:2,level:null}),op({name:'エ',elite:'',level:90}),
    op({name:'オ',elite:null,level:null}),op({name:'カ',elite:'invalid',level:5})
  ];
  assert.deepEqual(Ark.search(levels,{sort:'level',direction:'asc'}).map(o=>o.name),['ア','イ','ウ','カ','エ','オ']);
  assert.deepEqual(Ark.search(levels,{sort:'level',direction:'desc'}).map(o=>o.name),['イ','ウ','ア','エ','カ','オ']);
  for(const [sort,key,low,high] of [['rarity','rarity',2,6],['recent','date','2020-01-01','2026-01-01'],['name','name','ア','イ']]){
    const list=[op({id:'low',[key]:low}),op({id:'high',[key]:high}),op({id:'missing-low',[key]:'',level:1}),op({id:'missing-high',[key]:null,level:80})];
    assert.deepEqual(Ark.search(list,{sort,direction:'asc'}).map(o=>o.id),['low','high','missing-high','missing-low'],sort+' asc');
    assert.deepEqual(Ark.search(list,{sort,direction:'desc'}).map(o=>o.id),['high','low','missing-high','missing-low'],sort+' desc');
  }
});

test('prepared roster searches preserve all sort and filter modes across repeated searches',()=>{
  const operators=[
    op({name:'W',rarity:6,date:'2020-01-01',job:'狙撃',owned:false}),
    op({name:'アーミヤ',rarity:5,date:'2020-01-01',job:'術師'}),
    op({name:'百錬ガヴィル',rarity:6,date:'2023-01-01',job:'前衛',level:1}),
    op({name:'エイヤフィヤトラ',rarity:6,date:'2020-01-01',job:'術師',level:90})
  ];
  const search=Ark.prepareSearch(operators);
  for(const sort of ['level','name','recent','rarity','unknown']){
    for(const direction of [undefined,'asc','desc','asc','desc','invalid']){
      for(const filters of [{},{query:'ｗ'},{query:'あーみや'},{job:'術師'},{rarity:'6'},
        {state:'owned'},{state:'unowned'},{state:'unfinished'},{query:'い',rarity:'6',job:'術師'}]){
        const request={...filters,sort,direction};
        assert.deepEqual(search(request),Ark.search(operators,request));
      }
    }
  }
  const first=search({sort:'name',direction:'asc'});first.reverse();
  assert.deepEqual(search({sort:'name',direction:'asc'}).map(o=>o.name),['W','アーミヤ','エイヤフィヤトラ','百錬ガヴィル']);
  const updated=operators.map(o=>o.name==='百錬ガヴィル'?{...o,level:90}:o);
  assert.equal(search({query:'百錬'})[0].level,1);
  assert.equal(Ark.prepareSearch(updated)({query:'百錬'})[0].level,90);
});
