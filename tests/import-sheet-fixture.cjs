const assert=require('node:assert/strict');
class Range {
 constructor(s,r,col,h=1,w=1){Object.assign(this,{s,r,col,h,w});}
 cells(fn){for(let i=0;i<this.h;i++)for(let j=0;j<this.w;j++)fn(this.s.cell(this.r+i,this.col+j),i,j);return this;}
 getValues(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.s.cell(this.r+i,this.col+j).v??''));}
 getFormulas(){return Array.from({length:this.h},(_,i)=>Array.from({length:this.w},(_,j)=>this.s.cell(this.r+i,this.col+j).f??''));}
 getValue(){return this.getValues()[0][0];} getFormula(){return this.getFormulas()[0][0];}
 setValues(rows){assert.equal(rows.length,this.h);rows.forEach(r=>assert.equal(r.length,this.w));return this.cells((c,i,j)=>{c.v=rows[i][j];delete c.f;this.s.book.writes++;});}
 setValue(v){return this.setValues([[v]]);}
 setFormula(f){this.s.book.writes++;return this.cells(c=>{c.f=f;c.v='';});}
 style(key,value){return this.cells(c=>{c.format[key]=value;});}
 setNumberFormat(v){return this.style('numberFormat',v);} setBackground(v){return this.style('background',v);}
 setFontColor(v){return this.style('color',v);} setFontWeight(v){return this.style('weight',v);} setHorizontalAlignment(v){return this.style('align',v);}
 copyTo(dest,type){for(let i=0;i<this.h;i++)for(let j=0;j<this.w;j++){
  const source=this.s.cell(this.r+i,this.col+j),target=dest.s.cell(dest.r+i,dest.col+j);
  if(type==='format')target.format={...source.format};
  else if(type==='validation')target.validation=source.validation;
  else throw Error('unexpected copy type');
 }return this;}
 insertCheckboxes(){return this.cells(c=>{c.validation='BOOLEAN';c.v=false;this.s.book.writes++;});}
}
class Sheet {
 constructor(book,name,rows=[]){this.book=book;this.name=name;this.data=[];this.maxRows=1000;rows.forEach((r,i)=>r.forEach((v,j)=>this.cell(i+1,j+1).v=v));}
 cell(r,c){this.data[r-1]??=[];return this.data[r-1][c-1]??={v:'',format:{},validation:null};}
 getName(){return this.name;}
 getLastRow(){let n=0;this.data.forEach((r,i)=>{if(r.some(c=>c&&(c.v!==''||c.f)))n=i+1;});return n;}
 getLastColumn(){return Math.max(0,...this.data.map(r=>r.reduce((n,c,i)=>c&&(c.v!==''||c.f)?i+1:n,0)));}
 getRange(r,c,h,w){if(typeof r==='string'){const m=/^([A-Z]+)(\d+)$/.exec(r);assert.ok(m);c=[...m[1]].reduce((n,v)=>n*26+v.charCodeAt(0)-64,0);r=Number(m[2]);}return new Range(this,r,c,h,w);}
 getMaxRows(){return this.maxRows;} insertRowsAfter(n,count){assert.equal(n,this.maxRows);this.maxRows+=count;}
 setFrozenRows(){} setFrozenColumns(){} setColumnWidth(){}
}
class Book {
 constructor(){this.sheets=[];this.writes=0;}
 add(name,rows){const s=new Sheet(this,name,rows);this.sheets.push(s);return s;}
 getId(){return 'TEST_ONLY_SHEET';}
 getSheets(){return this.sheets;} getSheetByName(n){return this.sheets.find(s=>s.name===n)||null;}
 getSpreadsheetTimeZone(){return 'Asia/Tokyo';} insertSheet(n){assert.ok(!this.getSheetByName(n));return this.add(n);}
 toast(){}
}

module.exports={Book};
