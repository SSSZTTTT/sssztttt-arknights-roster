const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
function write(p,s){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),s);}
// 内容が変わった資産だけURLを変え、以前のブラウザキャッシュが残るのを防ぐ。
const assetVersion=name=>require('node:crypto').createHash('sha256').update(read('src/'+name)).digest('hex').slice(0,12);
write('index.html',read('src/index.html').replace(/assets\/([a-z]+\.(?:css|js))/g,(_,name)=>'assets/'+name+'?v='+assetVersion(name)));
for(const name of ['config.js','model.js','transport.js','app.js','style.css'])write('assets/'+name,read('src/'+name));
for(const project of ['public','admin']){
  write('gas/'+project+'/Core.gs',read('backend/Core.gs'));
  write('gas/'+project+'/Model.gs',read('src/model.js'));
  write('gas/'+project+'/Code.gs',read('backend/'+(project==='public'?'PublicApi':'Admin')+'.gs'));
  const manifest={timeZone:'Asia/Tokyo',runtimeVersion:'V8',exceptionLogging:'STACKDRIVER',oauthScopes:project==='public'?['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/script.external_request']:['https://www.googleapis.com/auth/spreadsheets']};
  if(project==='admin')manifest.webapp={access:'MYSELF',executeAs:'USER_DEPLOYING'};
  write('gas/'+project+'/appsscript.json',JSON.stringify(manifest,null,2));
}
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
write('gas/admin/Index.html','<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101216"><base target="_top"><title>育成を記録 | ARK RECORD</title><style>'+read('src/style.css')+'</style></head><body><a class="skip" href="#main">一覧へ移動</a><div id="app"><div class="initial">育成記録を読み込んでいます…</div></div><script>window.ARK_ADMIN=true;window.ARK_CONFIG={};</script>'+['model.js','transport.js','app.js'].map(n=>'<script>'+safeScript(read('src/'+n))+'</script>').join('')+'</body></html>');
console.log('Built GitHub Pages assets and two GAS packages.');
