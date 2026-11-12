const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {run,pushRefs}=require('../scripts/git-privacy.cjs');
const source=path.resolve(__dirname,'..');
const safeEmail='12345+privacy-test@users.noreply.github.com';
const privateEmail='private@example.test';

function fixture(t){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'ark-git-privacy-'));
  t.after(()=>{
    const resolved=fs.realpathSync(base),temp=fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved).toLowerCase(),temp.toLowerCase());
    assert.match(path.basename(resolved),/^ark-git-privacy-/);
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const root=path.join(base,'work');fs.mkdirSync(root);
  const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'};
  for(const key of Object.keys(env))if(/^GIT_(?:AUTHOR|COMMITTER)_|^GIT_CONFIG_(?:COUNT|KEY_|VALUE_)|^GIT_(?:DIR|WORK_TREE|INDEX_FILE)$/.test(key))delete env[key];
  const config=path.join(base,'empty-config');fs.writeFileSync(config,'');env.GIT_CONFIG_GLOBAL=config;
  function git(args,extra={}){return spawnSync('git',args,{cwd:root,env:{...env,...extra},encoding:'utf8'});}
  function ok(args,extra={}){const r=git(args,extra);assert.equal(r.status,0,'Git fixture operation failed');return r.stdout.trim();}
  ok(['init','-q']);
  for(const directory of ['scripts','.githooks'])fs.mkdirSync(path.join(root,directory));
  for(const file of ['scripts/check.cjs','scripts/git-privacy.cjs','scripts/install-git-privacy.cjs','.githooks/pre-commit','.githooks/pre-push'])fs.copyFileSync(path.join(source,file),path.join(root,file));
  const installed=spawnSync(process.execPath,['scripts/install-git-privacy.cjs',safeEmail,'privacy-test'],{cwd:root,env,encoding:'utf8'});
  assert.equal(installed.status,0,'Hook installation failed');
  fs.writeFileSync(path.join(root,'record.txt'),'safe content\n');ok(['add','record.txt']);ok(['commit','-qm','Initial safe record']);
  function change(content='next safe content\n'){fs.writeFileSync(path.join(root,'record.txt'),content);ok(['add','record.txt']);}
  function blocks(result){assert.notEqual(result.status,0);assert.match(result.stderr,/blocked:/);assert.equal((result.stdout+result.stderr).includes(privateEmail),false);}
  return {base,root,env,git,ok,change,blocks};
}

test('installed hooks allow safe identities and block explicit author and committer overrides',t=>{
  const f=fixture(t);f.change();
  f.blocks(f.git(['-c','user.email='+privateEmail,'commit','-qm','Unsafe config override']));
  f.blocks(f.git(['commit','--author=Private <'+privateEmail+'>','-qm','Unsafe author override']));
  f.blocks(f.git(['commit','-qm','Unsafe committer environment'],{GIT_COMMITTER_EMAIL:privateEmail}));
  f.ok(['commit','-qm','Safe change']);
  assert.equal(f.ok(['log','-1','--format=%ae%n%ce']),safeEmail+'\n'+safeEmail);
});

test('pre-commit checks staged bytes rather than only the working file',t=>{
  const f=fixture(t),secret='x'.repeat(35);
  f.change("const SPREADSHEET_ID = '"+secret+"';\n");
  fs.writeFileSync(path.join(f.root,'record.txt'),'clean working file\n');
  const r=f.git(['commit','-qm','Staged private setting']);
  f.blocks(r);assert.match(r.stderr,/Hardcoded spreadsheet ID/);assert.equal(r.stderr.includes(secret),false);
});

test('amending a commit with a retained private author is blocked',t=>{
  const f=fixture(t);f.change();
  f.ok(['-c','core.hooksPath=disabled-hooks','commit','--author=Private <'+privateEmail+'>','-qm','Untrusted imported author']);
  f.blocks(f.git(['commit','--amend','--no-edit']));
});

test('pre-push scans ancestors even when the latest commit and local config are safe',t=>{
  const f=fixture(t),remote=path.join(f.base,'remote.git');
  f.ok(['init','--bare','-q',remote]);f.ok(['remote','add','local-test',remote]);
  f.ok(['push','-q','local-test','HEAD:refs/heads/main']);
  const before=f.ok(['ls-remote','local-test','refs/heads/main']);
  f.change();f.ok(['-c','core.hooksPath=disabled-hooks','commit','--author=Private <'+privateEmail+'>','-qm','Untrusted ancestor']);
  f.change('safe tip\n');f.ok(['commit','-qm','Safe latest change']);
  f.blocks(f.git(['push','-q','local-test','HEAD:refs/heads/main']));
  assert.equal(f.ok(['ls-remote','local-test','refs/heads/main']),before);
});

test('push input handles multiple refs, deletion and malformed input without disclosing values',()=>{
  const a='1'.repeat(40),b='2'.repeat(40),zero='0'.repeat(40);
  assert.deepEqual(pushRefs('refs/heads/a '+a+' refs/heads/a '+zero+'\nrefs/heads/b '+b+' refs/heads/b '+zero+'\n(delete) '+zero+' refs/heads/c '+b+'\n'),[a,b]);
  assert.throws(()=>pushRefs('unexpected input'),/invalid pre-push input/);
  assert.doesNotThrow(()=>run('pre-push',[],process.cwd(),'(delete) '+zero+' refs/heads/c '+b+'\n'));
});
