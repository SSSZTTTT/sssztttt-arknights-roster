const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {isNoreply}=require('./git-privacy.cjs');
function git(args,cwd){
  const result=spawnSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  if(result.error||result.status!==0)throw Error('Could not configure local Git privacy protection.');
  return result.stdout.trim();
}
function install(email,name,cwd=path.resolve(__dirname,'..')){
  if(!isNoreply(email||'')||!name||/[\r\n<>@]/.test(name))throw Error('Specify your GitHub noreply email and GitHub username.');
  const root=git(['rev-parse','--show-toplevel'],cwd);
  for(const hook of ['pre-commit','pre-push']){
    const file=path.join(root,'.githooks',hook);
    if(!fs.existsSync(file))throw Error('Tracked Git privacy hooks are missing.');
    fs.chmodSync(file,0o755);
  }
  git(['config','--local','user.name',name],root);
  git(['config','--local','user.email',email],root);
  git(['config','--local','user.useConfigOnly','true'],root);
  git(['config','--local','core.hooksPath','.githooks'],root);
  console.log('Enabled repository-local noreply identity, pre-commit checks and pre-push history checks.');
}
module.exports={install};
if(require.main===module){try{install(process.argv[2],process.argv[3]);}catch(error){console.error(error.message);process.exitCode=1;}}
