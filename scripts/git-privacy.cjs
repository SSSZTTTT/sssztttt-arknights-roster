const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const {privacyIssues}=require('./check.cjs');

function git(args,cwd=process.cwd()){
  const result=spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});
  if(result.error||result.status!==0)throw Error('Git privacy check could not read the repository. Nothing was published.');
  return result.stdout;
}
function isNoreply(email){
  return /^[^\s<>@]+@users\.noreply\.github\.com$/i.test(email)||/^noreply@github\.com$/i.test(email);
}
function identityEmail(identity){
  const match=identity.trim().match(/<([^<>]*)>\s+\d+\s+[+-]\d{4}$/);
  return match?match[1]:'';
}
function checkIdentities(cwd){
  for(const field of ['AUTHOR','COMMITTER']){
    if(!isNoreply(identityEmail(git(['var','GIT_'+field+'_IDENT'],cwd)))){
      throw Error('Commit blocked: '+field.toLowerCase()+' email must be a GitHub noreply address. No email value is printed.');
    }
  }
}
function checkStaged(cwd){
  const files=git(['diff','--cached','--name-only','--diff-filter=ACMR','-z','--'],cwd).split('\0').filter(Boolean);
  const issues=[];
  for(const file of files){
    const source=git(['show',':'+file],cwd);
    for(const issue of privacyIssues(source,file))issues.push(issue);
  }
  if(issues.length)throw Error('Commit blocked: staged content contains '+[...new Set(issues)].join(', ')+'. No private value is printed.');
}
function checkHistory(refs,cwd){
  const seen=new Set();
  for(const ref of refs){
    const records=git(['log','--format=%H%x00%ae%x00%ce',ref,'--'],cwd).trim().split('\n').filter(Boolean);
    for(const record of records){
      const [sha,author,committer]=record.split('\0');
      if(seen.has(sha))continue;
      seen.add(sha);
      for(const [field,email] of [['author',author],['committer',committer]]){
        if(!isNoreply(email||''))throw Error('Push blocked: commit '+sha+' has a non-noreply '+field+' email. Rewrite the affected history before pushing. No email value is printed.');
      }
    }
  }
  return seen.size;
}
function pushRefs(input){
  const refs=[];
  for(const line of input.split(/\r?\n/).filter(Boolean)){
    const fields=line.trim().split(/\s+/);
    if(fields.length!==4||! /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(fields[1]))throw Error('Push blocked: invalid pre-push input.');
    if(!/^0+$/.test(fields[1]))refs.push(fields[1]);
  }
  return [...new Set(refs)];
}
function run(mode,args=[],cwd=process.cwd(),input=''){
  if(mode==='pre-commit'){checkIdentities(cwd);checkStaged(cwd);return;}
  if(mode==='pre-push'){checkHistory(pushRefs(input),cwd);return;}
  if(mode==='history'){return checkHistory(args.length?args:['HEAD'],cwd);}
  throw Error('Usage: node scripts/git-privacy.cjs pre-commit|pre-push|history [ref ...]');
}
module.exports={isNoreply,identityEmail,checkIdentities,checkStaged,checkHistory,pushRefs,run};
if(require.main===module){
  try{run(process.argv[2],process.argv.slice(3),process.cwd(),process.argv[2]==='pre-push'?fs.readFileSync(0,'utf8'):'');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
