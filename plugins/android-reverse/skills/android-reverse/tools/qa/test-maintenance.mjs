import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const skill=path.resolve(import.meta.dirname,'../..');
const output=path.resolve(process.env.TASK_LITE_TEST_OUTPUT || path.join(os.tmpdir(),'android-reverse-tests'));
fs.mkdirSync(output,{recursive:true});
const fixture=fs.mkdtempSync(path.join(output,'maintenance-'));
const repo=path.join(fixture,'repo'); fs.cpSync(skill,repo,{recursive:true});
const calls=[];
console.log(`maintenance fixture=${fixture}; cwd=${process.cwd()}; node=${process.version}`);
after(()=>fs.writeFileSync(path.join(fixture,'evidence.json'),JSON.stringify(calls,null,2)));
function run(file,args=[]) {const r=spawnSync(process.execPath,[path.join(repo,file),...args],{cwd:repo,encoding:'utf8',timeout:20000});calls.push({file,args,cwd:repo,exitCode:r.status,error:r.error?.message,stdout:r.stdout,stderr:r.stderr});assert.ifError(r.error);assert.notEqual(r.status,null);return r;}
function snap(){const out={};function walk(dir){for(const name of fs.readdirSync(dir).sort()){const f=path.join(dir,name),s=fs.lstatSync(f),k=path.relative(repo,f);out[k]=s.isDirectory()?'directory':createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(s.isDirectory())walk(f);}}walk(repo);return out;}
const topicFile=path.join(repo,'topics/static-triage/topic.json');
const original=fs.readFileSync(topicFile,'utf8');
function topicMutation(fn,check){try {const topic=JSON.parse(original);fn(topic);fs.writeFileSync(topicFile,JSON.stringify(topic));check();} finally {fs.writeFileSync(topicFile,original);}}
test('read-only maintenance; missing retired file and scaffold are not regenerated',()=>{
  const template=path.join(repo,'artifacts/tasks/_TEMPLATE'),hidden=path.join(fixture,'retired-hidden');
  fs.mkdirSync(hidden);
  const moved=[];
  function hide(rel){const src=path.join(template,rel);if(!fs.existsSync(src))return;const dst=path.join(hidden,`${moved.length}`);fs.renameSync(src,dst);moved.push([src,dst]);}
  try {
    hide('core/run/run-local.mjs');
    assert.equal(fs.existsSync(path.join(template,'core/run/run-local.mjs')),false);
    const beforeLite=snap(),lite=run('tools/qa/test-task-lite.mjs');
    assert.equal(lite.status,0,lite.stdout+lite.stderr);
    assert.deepEqual(snap(),beforeLite);
    hide('core');hide('state');hide('extensions');hide('core-task.json');
    for(const name of fs.readdirSync(template).filter(n=>n.endsWith('.jsonl')))hide(name);
    for(const rel of ['core','state','extensions','core-task.json'])assert.equal(fs.existsSync(path.join(template,rel)),false);
    const before=snap();
    for(const f of ['check-skill-contract','check-framework-layout','check-topic-manifests','lint-cases','check-all']) assert.equal(run(`tools/qa/${f}.mjs`).status,0);
    for(const f of ['tools/docs/fact-sync.mjs','tools/docs/sync-doc-facts.mjs','tools/topic/generate-topic-docs.mjs','tools/task/seed-task-locals.mjs']) {assert.equal(fs.existsSync(path.join(repo,f)),false);assert.notEqual(run(f).status,0);}
    for(const f of ['artifacts/tasks/_TEMPLATE/run/verify-once.mjs','artifacts/tasks/_TEMPLATE/run/closeout.mjs']){const r=run(f);assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/deprecated/);}
    fs.writeFileSync(path.join(fixture,'readonly-probe.mjs'),`import assert from 'node:assert/strict';\nimport {pathToFileURL} from 'node:url';\nconst root=${JSON.stringify(repo)};\nconst url=p=>pathToFileURL(root+'/'+p).href;\nconst m=await import(url('tools/topic-manifests.mjs'));\nassert.ok(m.readTopicRegistryFromSource().length>0);\nassert.deepEqual(Object.keys(m).sort(),['listTopicKeys','readTopicManifest','readTopicRegistryFromSource','topicManifestRoot'].sort());\nfor(const name of ['common','route-state','validation','closeout-state','task-start','task-sync','task-advance','task-cleanup','sync-template-layout'])await assert.rejects(import(url('tools/task/'+name+'.mjs')),{code:'ERR_MODULE_NOT_FOUND'});\nconsole.log('registry called; writer exports absent; nine retired modules removed');\n`);
    const r=run('../readonly-probe.mjs');assert.equal(r.status,0,r.stderr);
    assert.deepEqual(snap(),before);
    calls.push({label:'missing scaffold readonly snapshot',before,after:snap(),missingSingleFileBefore:beforeLite});
  } finally {for(const [src,dst] of moved.reverse())fs.renameSync(dst,src);}
});
test('independent protocol, case and retained optional reference failures; optional absence allowed',()=>{
  for(const [field,value] of [['protocol','references/missing-protocol.md'],['caseFiles',['scripts/cases/missing-case.mjs']],['references',['artifacts/tasks/_TEMPLATE/missing-optional.md']]]) {
    topicMutation(t=>{delete t.taskModelFile;t[field]=value;},()=>{const r=run('tools/qa/check-topic-manifests.mjs');assert.notEqual(r.status,0);assert.match(r.stderr,new RegExp((Array.isArray(value)?value[0]:value).split('/').at(-1)));});
  }
  topicMutation(t=>{delete t.references;delete t.taskModelFile;},()=>assert.equal(run('tools/qa/check-topic-manifests.mjs').status,0));
  assert.equal(run('tools/qa/check-topic-manifests.mjs').status,0);
});
test('invalid JSON, mismatched/duplicate keys and missing topics fail',()=>{
  try{fs.writeFileSync(topicFile,'{');assert.notEqual(run('tools/qa/check-topic-manifests.mjs').status,0);}finally{fs.writeFileSync(topicFile,original);}
  for(const key of ['wrong-directory','crypto-protocol'])topicMutation(t=>t.key=key,()=>assert.notEqual(run('tools/qa/check-topic-manifests.mjs').status,0));
  const dir=path.join(repo,'topics'),away=path.join(fixture,'topics-hidden');
  fs.renameSync(dir,away);try{assert.notEqual(run('tools/qa/check-topic-manifests.mjs').status,0);}finally{fs.renameSync(away,dir);}
  assert.equal(run('tools/qa/check-topic-manifests.mjs').status,0);
});
test('declared case is parsed, never executed; same file syntax and credential negative controls',()=>{
  const rel='scripts/cases/qa-sentinel.mjs',file=path.join(repo,rel),marker=path.join(fixture,'EXECUTED');
  const good=`import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)},'BAD');\n// https://developer.android.com/reference\n`;
  fs.writeFileSync(file,good);
  topicMutation(t=>t.caseFiles=[...(t.caseFiles||[]),rel],()=>{
    const before=snap(),r=run('tools/qa/lint-cases.mjs');assert.equal(r.status,0);assert.ok(r.stdout.includes(`static case: ${rel}`));assert.equal(fs.existsSync(marker),false);assert.deepEqual(snap(),before);
    fs.writeFileSync(file,good+'const = ;');let bad=run('tools/qa/lint-cases.mjs');assert.notEqual(bad.status,0);assert.match(bad.stderr,/qa-sentinel.*syntax/);
    fs.writeFileSync(file,good+'const token = "synthetic-secret-123";');bad=run('tools/qa/lint-cases.mjs');assert.notEqual(bad.status,0);assert.match(bad.stderr,/suspicious credential/);
    fs.writeFileSync(file,good);assert.equal(run('tools/qa/lint-cases.mjs').status,0);assert.equal(fs.existsSync(marker),false);
  });
});
test('current document broken link fails actual navigation checker',()=>{
  const file=path.join(repo,'README.md'),old=fs.readFileSync(file,'utf8');
  try{fs.writeFileSync(file,old+'\n[broken navigation](references/qa-missing.md)\n');const r=run('tools/qa/check-skill-contract.mjs');assert.notEqual(r.status,0);assert.match(r.stderr,/qa-missing.md/);}finally{fs.writeFileSync(file,old);}
  assert.equal(run('tools/qa/check-skill-contract.mjs').status,0);
});
