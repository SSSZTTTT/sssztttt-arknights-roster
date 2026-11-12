const fs=require('node:fs'),path=require('node:path'),Ark=require('../src/model.js');
const target=path.resolve(__dirname,'../preview-data/roster.json');
if(fs.existsSync(target)){console.log('Existing local preview data retained.');process.exit(0);}
const rows=[['ア',6,'特殊',22],['W',6,'狙撃',13],['アーミヤ',5,'術師',6],['テンニンカ',4,'先鋒',6],['クルース',3,'狙撃',6],['Lancet-2',1,'医療',6]];
const operators=rows.map(([name,rarity,job,potential],i)=>{
  const [elite,level]=Ark.caps[rarity],skills=rarity<3?['-','-','-']:rarity===3?['7','-','-']:rarity===4?['M3','7','-']:['M3','M3','M3'];
  const modules=i<2?['3','-','-','-']:['-','-','-','-'];
  return {name,rarity,job,potential,elite,level,skills,modules,owned:true,date:'2020-01-16',version:'demo',training:{owned:true,elite,level,potential,s1:skills[0],s2:skills[1],s3:skills[2],x:modules[0],y:modules[1],delta:modules[2],alpha:modules[3]}};
});
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({version:2,updatedAt:new Date().toISOString(),operators,history:[]}));
console.log('Created sample preview data. Training values are fictional.');
