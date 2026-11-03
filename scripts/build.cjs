const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
function write(p,s){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s);}
// 内容が変わった資産だけURLを変え、以前のブラウザキャッシュが残るのを防ぐ。
const assetVersion=name=>require('node:crypto').createHash('sha256').update(read('src/'+name)).digest('hex').slice(0,12);
const loading=read('src/loading.html').trim();
write('index.html',read('src/index.html').replace('<!-- initial-loading -->',loading).replace(/assets\/([a-z]+\.(?:css|js))/g,(_,name)=>'assets/'+name+'?v='+assetVersion(name)));
for(const name of ['config.js','model.js','transport.js','app.js','style.css','fonts.js'])write('assets/'+name,read('src/'+name));
for(const name of ['admin.css','editor.css','editor-config.js','editor-rpc.js','editor.js'])write('assets/'+name,read('src/'+name));
write('edit/index.html',read('src/editor.html').replace('<!-- initial-loading -->',loading).replace(/assets\/([a-z-]+\.(?:css|js))/g,(_,name)=>'assets/'+name+'?v='+assetVersion(name)));
for(const project of ['public','admin','editor']){
  write('gas/'+project+'/Core.gs',read('backend/Core.gs'));
  write('gas/'+project+'/Model.gs',read('src/model.js'));
  if(project!=='public')write('gas/'+project+'/Training.gs',read('backend/Training.gs'));
  if(project==='editor')for(const file of ['OperatorImport.gs','ImportApi.gs'])write('gas/editor/'+file,read('backend/'+file));
  write('gas/'+project+'/Code.gs',read('backend/'+({public:'PublicApi',admin:'Admin',editor:'EditorApi'}[project])+'.gs'));
  const manifest={timeZone:'Asia/Tokyo',runtimeVersion:'V8',exceptionLogging:'STACKDRIVER',oauthScopes:project!=='admin'?['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/script.external_request']:['https://www.googleapis.com/auth/spreadsheets']};
  if(project==='admin')manifest.webapp={access:'MYSELF',executeAs:'USER_DEPLOYING'};
  if(project==='editor')manifest.webapp={access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'};
  write('gas/'+project+'/appsscript.json',JSON.stringify(manifest,null,2));
}
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
write('gas/admin/Index.html','<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><base target="_top"><title>育成を記録 | ARK RECORD</title><style>'+read('src/style.css')+'\n'+read('src/admin.css')+'</style></head><body><a class="skip" href="#main">一覧へ移動</a><div id="app">'+loading+'</div><script>window.ARK_ADMIN=true;window.ARK_CONFIG={};</script>'+['fonts.js','model.js','transport.js','app.js'].map(n=>'<script>'+safeScript(read('src/'+n))+'</script>').join('')+'</body></html>');
console.log('Built public/editor Pages assets and three GAS packages.');
