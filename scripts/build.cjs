const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
function write(p,s){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s);}
// 内容が変わった資産だけURLを変え、以前のブラウザキャッシュが残るのを防ぐ。
const assetVersion=name=>require('node:crypto').createHash('sha256').update(read('src/'+name)).digest('hex').slice(0,12);
const loading=read('src/loading.html').trim();
write('index.html',read('src/index.html').replace('<!-- initial-loading -->',loading).replace(/assets\/([a-z]+\.(?:css|js))/g,(_,name)=>'assets/'+name+'?v='+assetVersion(name)));
for(const name of ['config.js','model.js','transport.js','app.js','style.css','fonts.js'])write('assets/'+name,read('src/'+name));
for(const name of ['editor.css','editor-config.js','editor-rpc.js','editor.js'])write('assets/'+name,read('src/'+name));
write('edit/index.html',read('src/editor.html').replace('<!-- initial-loading -->',loading).replace(/assets\/([a-z-]+\.(?:css|js))/g,(_,name)=>'assets/'+name+'?v='+assetVersion(name)));
for(const project of ['public','editor']){
  write('gas/'+project+'/Core.gs',read('backend/Core.gs'));
  write('gas/'+project+'/Model.gs',read('src/model.js'));
  if(project==='editor')for(const file of ['Training.gs','OperatorImport.gs','ImportApi.gs'])write('gas/editor/'+file,read('backend/'+file));
  write('gas/'+project+'/Code.gs',read('backend/'+({public:'PublicApi',editor:'EditorApi'}[project])+'.gs'));
  const manifest={timeZone:'Asia/Tokyo',runtimeVersion:'V8',exceptionLogging:'STACKDRIVER',oauthScopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/script.external_request']};
  if(project==='editor')manifest.webapp={access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'};
  write('gas/'+project+'/appsscript.json',JSON.stringify(manifest,null,2));
}
console.log('Built public/editor Pages assets and two GAS packages.');
