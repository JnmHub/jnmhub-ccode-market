import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.env.TASK_LITE_TEST_OUTPUT || path.join(os.tmpdir(), 'android-reverse-tests'));
fs.mkdirSync(output, { recursive: true });
const fixture = fs.mkdtempSync(path.join(output, 'fixture-'));
const calls = [], snapshots = [];
console.log(`fixture=${fixture}; node=${process.version}; platform=${process.platform}`);
function snapshot(root) {
  const result = {};
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name), stat = fs.lstatSync(full);
      const key = path.relative(root, full).split(path.sep).join('/');
      result[key] = stat.isSymbolicLink() ? `link:${fs.readlinkSync(full)}` : stat.isDirectory() ? 'directory'
        : createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(full);
    }
  }
  walk(root); return result;
}
function unchanged(label, root, before) {
  const after = snapshot(root); snapshots.push({ label, root, before, after });
  assert.deepEqual(after, before, label);
}
function make(name) { const dir = path.join(fixture, name); fs.mkdirSync(dir, { recursive: true }); return dir; }
function put(dir, name, text) { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), {recursive:true}); fs.writeFileSync(f, text); }
function run(script, args, cwd, root = cwd) {
  const env = { ...process.env, ANDROID_REVERSE_WORKSPACE_ROOT: root };
  const r = spawnSync(process.execPath, [path.join(skill, script), ...args], { cwd, env, encoding:'utf8', timeout:10000 });
  calls.push({ command:[process.execPath, path.join(skill, script), ...args], cwd, workspaceRoot:root,
    exitCode:r.status, signal:r.signal, stdout:r.stdout, stderr:r.stderr, error:r.error?.message });
  assert.ifError(r.error); return r;
}
const init = 'tools/task/task-init.mjs';
after(() => {
  fs.writeFileSync(path.join(fixture, 'test-evidence.json'), JSON.stringify({calls, snapshots}, null, 2));
  console.log(`evidence=${path.join(fixture, 'test-evidence.json')}`);
});

test('end-to-end init -> retired entries stay removed, project unchanged', () => {
  const root=make('end-to-end'), before=snapshot(skill);
  assert.equal(run(init,['fresh'],root,'').status,0);
  const task=path.join(root,'artifacts/tasks/fresh');
  assert.deepEqual(Object.keys(snapshot(task)),['report.md']);
  const taskBefore=snapshot(root);
  for(const entry of ['tools/task/task-start.mjs','tools/task/task-sync.mjs','tools/task/task-advance.mjs','tools/task/task-cleanup.mjs','tools/task/sync-template-layout.mjs','tools/task/common.mjs','tools/task/route-state.mjs','tools/task/validation.mjs','tools/task/closeout-state.mjs']) {
    assert.equal(fs.existsSync(path.join(skill,entry)),false,`retired file must stay removed: ${entry}`);
  }
  for(const entry of ['artifacts/tasks/_TEMPLATE/run/verify-once.mjs','artifacts/tasks/_TEMPLATE/run/closeout.mjs','artifacts/tasks/_TEMPLATE/core/run/verify-once.mjs','artifacts/tasks/_TEMPLATE/core/run/closeout.mjs']) {
    const r=run(entry,[task],root); assert.notEqual(r.status,0); assert.match(r.stderr,/deprecated/);
  }
  unchanged('end-to-end fixture',root,taskBefore);
  unchanged('end-to-end skill',skill,before);
});

test('minimal init, cwd default, explicit Chinese space root, independent siblings', () => {
  const cwd = make('cwd'), root = make('中文 空格');
  assert.equal(run(init, ['A', '--goal=原始目标 a=b', '--boundary=仅离线'], cwd, '').status, 0);
  assert.deepEqual(Object.keys(snapshot(path.join(cwd,'artifacts/tasks/A'))), ['report.md']);
  assert.match(fs.readFileSync(path.join(cwd,'artifacts/tasks/A/report.md'),'utf8'), /原始目标 a=b/);
  const before = snapshot(cwd);
  assert.equal(run(init, ['B'], cwd, root).status, 0);
  assert.equal(run(init, ['C'], cwd, root).status, 0);
  unchanged('unselected cwd', cwd, before);
  assert.deepEqual(Object.keys(snapshot(path.join(root,'artifacts/tasks/B'))), ['report.md']);
});

test('invalid IDs/options and existing partial tasks never overwrite or fill in', () => {
  const root = make('invalid');
  for (const args of [[], [''], ['.'], ['..'], ['../x'], ['a/b'], ['a\\b'], ['C:\\x'], ['a:b'], ['_TEMPLATE'], ['CON'], ['nul.txt'], ['COM1'], ['LPT9'], ['x.'], ['x '], ['good','--force-new-task'], ['good','--topic=a'], ['good','--task-input=x'], ['good','extra']]) {
    const before = snapshot(root); assert.notEqual(run(init,args,root).status,0); unchanged(`invalid ${JSON.stringify(args)}`,root,before);
  }
  const partial = path.join(root,'artifacts/tasks/partial'); fs.mkdirSync(partial,{recursive:true});
  for (const text of [null, '', 'half report']) {
    if (text !== null) put(partial,'report.md',text);
    put(partial,'asset.bak','evidence');
    const before=snapshot(root); assert.notEqual(run(init,['partial'],root).status,0); unchanged('partial collision',root,before);
  }
});

test('concurrent identical IDs and case collision', async (t) => {
  const root=make('race');
  function launch() {
    return new Promise((resolve,reject) => {
      const command=[process.execPath,path.join(skill,init),'same'];
      const child=spawn(command[0],command.slice(1),{cwd:root,env:{...process.env,ANDROID_REVERSE_WORKSPACE_ROOT:root},timeout:10000});
      let stdout='',stderr=''; child.stdout.on('data',x=>stdout+=x); child.stderr.on('data',x=>stderr+=x);
      child.on('error',reject); child.on('close',(exitCode,signal)=>{calls.push({command,cwd:root,workspaceRoot:root,exitCode,signal,stdout,stderr}); resolve(exitCode);});
    });
  }
  const exits=await Promise.all([launch(),launch()]); assert.deepEqual(exits.sort(),[0,1]);
  assert.deepEqual(Object.keys(snapshot(path.join(root,'artifacts/tasks/same'))),['report.md']);
  await t.test('case insensitive filesystem collision', st=>{
    if(!fs.existsSync(path.join(root,'artifacts/tasks/SAME'))) return st.skip('filesystem is case sensitive; not a collision here');
    const before=snapshot(root); assert.notEqual(run(init,['SAME'],root).status,0); unchanged('case collision',root,before);
  });
});

test('parent junction rejection when supported', async t=>{
  const root=make('links'), outside=make('link-target');
  await t.test('parent link', st=>{
    try {fs.symlinkSync(outside,path.join(root,'artifacts'),process.platform==='win32'?'junction':'dir');}
    catch(e){return st.skip(`link creation unavailable: ${e.code}`);}
    const before=snapshot(root), external=snapshot(outside);
    assert.notEqual(run(init,['blocked'],root).status,0);
    unchanged('parent link',root,before); unchanged('link target',outside,external);
  });
});

test('init preserves assets and legacy state; retired npm aliases absent; never execute sentinels', ()=>{
  const root=make('assets'), task=path.join(root,'artifacts/tasks/existing');
  const sentinel=`import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(path.join(root,'EXECUTED'))},'unexpected'); process.exit(93);`;
  for(const [name,text] of Object.entries({
    'report.md':'Partial, not verified. [unresolved](missing.file)\n```sh\nnode run/verify-once.mjs\n```',
    'task.json':JSON.stringify({roots:{skillRoot:root},status:'passed',nextExecutableAction:'node run/verify-once.mjs'}),
    'state/route-state.json':'{"status":"passed","completionGate":{"passed":true}}',
    'run/verify-once.mjs':sentinel,'run/closeout.mjs':sentinel,'tools/task/validation.mjs':sentinel,
    'run/source.js':'// real-asset-shaped harmless fixture','run/sample.bin':'\u0000\u0001synthetic',
    'run/build.apk':'not an APK: fixture bytes only','run/graph.svg':'<svg/>','run/log.txt':'observed fixture',
    'keep.bak':'keep','keep.tmp':'keep','empty.jsonl':'','node_modules/sentinel.txt':'dependency fixture'
  })) put(task,name,text);
  put(root,'run/verify-once.mjs',sentinel);
  put(root,'tools/task/validation.mjs',sentinel); // actual roots.skillRoot from task.json
  put(task,'run/local-repro-example.js',sentinel);
  put(task,'run/api-call-example.js',sentinel);
  put(task,'__pycache__/keep.pyc','retained fixture');
  const template=path.join(root,'fixture-template/sample.mjs');
  put(root,'fixture-template/sample.mjs','// harmless same-byte preservation fixture\n');
  put(task,'same-as-template.mjs',fs.readFileSync(template));
  assert.deepEqual(fs.readFileSync(path.join(task,'same-as-template.mjs')),fs.readFileSync(template));
  const complexBefore=snapshot(root);
  assert.notEqual(run(init,['existing'],root).status,0);
  unchanged('init collision preserves complex report and declared-root sentinels',root,complexBefore);
  assert.equal(fs.existsSync(path.join(root,'EXECUTED')),false);
  const before=snapshot(root);
  const pkg=JSON.parse(fs.readFileSync(path.join(skill,'package.json'),'utf8'));
  assert.deepEqual(Object.keys(pkg.scripts).filter(k=>k.startsWith('task:')),['task:init']);
  const npmRoot=path.dirname(process.execPath);
  const npmCandidates=[process.env.npm_execpath,path.join(npmRoot,'node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  const npm=npmCandidates.find(p=>fs.existsSync(p)&&p.endsWith('.js'));
  assert.ok(npm,'npm CLI must be discoverable for actual npm entrypoint tests');
  const command=[process.execPath,npm,'--prefix',skill,'run','task:init','--','new-sibling','--goal=npm goal'];
  const r=spawnSync(command[0],command.slice(1),{cwd:root,env:{...process.env,ANDROID_REVERSE_WORKSPACE_ROOT:root},encoding:'utf8',timeout:15000});
  calls.push({command,cwd:root,workspaceRoot:root,exitCode:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message});
  assert.ifError(r.error); assert.equal(r.status,0);
  const expected={...before,'artifacts/tasks/new-sibling':'directory','artifacts/tasks/new-sibling/report.md':snapshot(root)['artifacts/tasks/new-sibling/report.md']};
  unchanged('only new sibling report added',root,expected);
});
