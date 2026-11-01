const fs=require('node:fs'),vm=require('node:vm');
for(const f of ['src/model.js','src/config.js','src/transport.js','src/app.js','backend/Core.gs','backend/Admin.gs','backend/PublicApi.gs'])new vm.Script(fs.readFileSync(f,'utf8'),{filename:f});
const all=['index.html',...fs.readdirSync('assets').map(f=>'assets/'+f),...['public','admin'].flatMap(d=>fs.readdirSync('gas/'+d).map(f=>'gas/'+d+'/'+f))];
for(const f of all){const s=fs.readFileSync(f,'utf8');if(/https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+/.test(s))throw Error('Webhook secret in '+f);}
console.log('Syntax and secret checks passed.');
