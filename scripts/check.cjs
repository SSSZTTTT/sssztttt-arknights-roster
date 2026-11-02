const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');

// Report the location and type only; never print the matched private value.
function privacyIssues(source,file){
  const issues=[];
  const emails=source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  if(emails.some(email=>!/@(?:[A-Z0-9.-]+\.)?example\.(?:com|org|net|test)$/i.test(email)&&!/@[A-Z0-9.-]+\.test$/i.test(email)&&!/@users\.noreply\.github\.com$/i.test(email)))issues.push('Email address');
  const spreadsheetPatterns=[
    /(?:spreadsheet_?id|sheet_?id)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
    /openById\(\s*['"][A-Za-z0-9_-]{20,}['"]/,
    /getProperty\(['"]SPREADSHEET_ID['"]\)\s*\|\|\s*['"][A-Za-z0-9_-]{20,}['"]/,
    /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/
  ];
  if(spreadsheetPatterns.some(pattern=>pattern.test(source)))issues.push('Hardcoded spreadsheet ID');
  const webhooks=source.match(/https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+/g)||[];
  if(webhooks.some(url=>!file.startsWith('tests/')||!url.endsWith('/0/FAKE_TEST_ONLY')))issues.push('Discord webhook');
  if(/GOCSPX-[A-Za-z0-9_-]{10,}/.test(source))issues.push('Google OAuth client secret');
  return issues;
}

function check(){
  const root=path.resolve(__dirname,'..');
  for(const dir of ['src','backend'])for(const name of fs.readdirSync(path.join(root,dir)).filter(n=>/\.(js|gs)$/.test(n))){const f=dir+'/'+name;new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});}
  const files=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean));
  // Also inspect newly generated or untracked files in publication/source directories.
  function collect(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const f=dir+'/'+entry.name;if(entry.isDirectory())collect(f);else files.add(f);}}
  for(const dir of ['assets','backend','gas','src','scripts','tests','edit'])collect(dir);
  files.add('index.html');
  const problems=[];
  for(const f of files){
    const absolute=path.join(root,f);if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())continue;
    const source=fs.readFileSync(absolute,'utf8');
    for(const issue of privacyIssues(source,f))problems.push(issue+' in '+f);
  }
  if(problems.length)throw Error(problems.join('\n'));
  console.log('Syntax and privacy checks passed ('+files.size+' files).');
}

module.exports={privacyIssues};
if(require.main===module)check();
