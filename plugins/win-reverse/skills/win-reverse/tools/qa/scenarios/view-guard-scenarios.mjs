// F-13（round1）：自 check-task-behavior.mjs 等价搬移的场景模块（无行为变化）。
// 通过 ctx 注入宿主脚本的共享工具；新增场景请优先落入本目录，建立模块化先例。
export function createViewGuardScenarios(ctx) {
  const { assert, fs, path, os, crypto, spawnSync, repoRoot, taskStartScript, taskSyncScript, taskAdvanceScript, taskDrillScript, taskCloseScript, taskProbeScript, taskInitScript, taskDispatchScript, makeEnv, runNode, runNodeWithEnv, ensureOk, writeJson, readJson, sha256Text, seedExternalResearch, startBasicTask, buildCloseoutReadyTask, prepareInstalledSkillRoot, evaluateRouteConsistency, detectWebShellTech, readTaskJson, taskFileMatchesTemplate } = ctx;

// V2-5：新任务首次 sync 不产生 orphaned-view-content.md、无 hand-written 告警行。
function scenarioFirstSyncHasNoViewGuardNoise(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-first-sync-quiet");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  ensureOk(runNode(taskStartScript, ["first-sync-quiet"], workspaceRoot), "task-start(first-sync-quiet)");
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "first-sync-quiet");
  const syncResult = runNode(taskSyncScript, ["first-sync-quiet"], workspaceRoot);
  ensureOk(syncResult, "task-sync(first-sync-quiet)");
  const output = `${syncResult.stdout}\n${syncResult.stderr}`;
  assert(!output.includes("orphaned-view-content"), "first sync must not mention orphan snapshots");
  assert(!output.includes("hand-written content"), "first sync must not emit hand-written warnings");
  assert(
    !fs.existsSync(path.join(taskDir, "run", "orphaned-view-content.md")),
    "first sync must not create run/orphaned-view-content.md"
  );
}

// O12（调查项复现测试）：renderer 自比对确定性结论。sync 生成三视图后**不做任何手改**，
// 再 sync——断言无 run/orphaned-view-content.md 快照、无 hand-written warning。
// 红 → 只修 stripRecognizedClueContent/stripVolatileViewLines 白名单（不松判定阈值）；
// 绿 → 误报归因于 agent 手改自由笔记，本项关闭（仅保留 O8 可诊断性收益）。
function scenarioViewGuardSelfCompareNoFalsePositive(tempRoot) {
  const name = "view-guard-self-compare";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) first pass`);
  const second = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(second, `task-sync(${name}) second pass without any hand edit`);
  assert(
    !fs.existsSync(path.join(taskDir, "run", "orphaned-view-content.md")),
    "second sync without hand edits must not create run/orphaned-view-content.md (O12 false-positive reproduction)"
  );
  const output = `${second.stdout || ""}\n${second.stderr || ""}`;
  assert(!output.includes("orphaned-view-content"), `second sync must not mention orphan snapshots\noutput:\n${output}`);
  assert(!output.includes("hand-written content"), `second sync must not emit hand-written warnings\noutput:\n${output}`);
}

// F-O3（先测后修调查项）①：状态迁移复现测试——合法渠道直改 state/route-state.json
// （track nextStep/status，route-plan/clues 渲染行必变；P0-3a 后 progress 不再存在），
// 视图仅是状态过期、仍是框架自产，
// advance/sync 不得产生 run/orphaned-view-content.md 快照与 hand-written warning。
// 红 → 修守卫（渲染哈希自证通道，手改检出零削弱）；绿 → 如实记录。
function scenarioViewGuardStateMigrationNoFalsePositive(tempRoot) {
  const name = "view-guard-state-migration";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.tracks[0].nextStep = "QA 状态迁移：track nextStep 合法改写（route-plan 渲染行必变）";
  routeState.tracks[0].status = "IN_PROGRESS";
  writeJson(routeStatePath, routeState);
  const advance = runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot);
  ensureOk(advance, `task-advance(${name} --to=Rebuild) after legit route-state.json edit`);
  const advanceOutput = `${advance.stdout || ""}\n${advance.stderr || ""}`;
  assert(
    !fs.existsSync(path.join(taskDir, "run", "orphaned-view-content.md")),
    "state migration must not create run/orphaned-view-content.md (F-O3 reproduction)\n" + advanceOutput
  );
  assert(
    !advanceOutput.includes("hand-written content"),
    `state migration must not emit hand-written warnings\noutput:\n${advanceOutput}`
  );
  const sync = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(sync, `task-sync(${name}) steady state`);
  const syncOutput = `${sync.stdout || ""}\n${sync.stderr || ""}`;
  assert(!syncOutput.includes("hand-written content"), `steady-state sync must stay quiet\noutput:\n${syncOutput}`);
}

// F-O3 ②（verify 侧逐字回归锁）：视图引入内嵌哈希行后，evaluateRouteConsistency 的
// normalizeNewlines 逐字比对（不剥 volatile 行）必须保持绿——渲染哈希是内容寻址确定性值，
// 同输入重渲染逐字稳定。（P0-3a/3b：progress 视图删除；clues 转 append-only 骨架无哈希行，
// 仅验 route-plan。）
function scenarioRouteConsistencyVerbatimWithHashLines(tempRoot) {
  const name = "route-consistency-hash";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  for (const rel of ["state/route-plan.md"]) {
    const text = fs.readFileSync(path.join(taskDir, rel), "utf8");
    assert(/^<!-- view-render-sha256: [0-9a-f]{64} -->$/m.test(text), `${rel} must carry the embedded render hash line`);
  }
  const findings = evaluateRouteConsistency(taskDir);
  const stale = findings.filter((finding) => /out of sync/.test(finding));
  assert(stale.length === 0, `evaluateRouteConsistency must stay green with hash lines\nfindings:\n${findings.join("\n")}`);
}

// F-O3 ③（升级回落锁）：升级前旧视图无哈希行 → 守卫回落旧逻辑不炸；旧逻辑对手改/过期
// 的检出能力保持（允许一次性快照，与 O8 升级注记同款），不崩溃、不静默吞掉。
function scenarioViewGuardLegacyViewWithoutHashFallsBack(tempRoot) {
  const name = "view-guard-legacy-view";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) seed views`);
  // 模拟升级前旧任务：剥掉视图的哈希行（P0-3a/3b：progress 删除；clues 骨架无哈希行，
  // 仅 route-plan 参与守卫回落）
  for (const rel of ["state/route-plan.md"]) {
    const viewPath = path.join(taskDir, rel);
    const stripped = fs.readFileSync(viewPath, "utf8").replace(/^<!-- view-render-sha256:.*-->\n?/m, "");
    fs.writeFileSync(viewPath, stripped, "utf8");
  }
  // 旧视图 + 合法状态迁移 → 旧逻辑路径（一次性快照可接受，不得崩溃）
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.tracks[0].nextStep = "QA 旧视图回落：nextStep 合法改写";
  writeJson(routeStatePath, routeState);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name}) with legacy hash-less views must not crash`);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert(
    output.includes("hand-written content"),
    `legacy view fallback must keep the old detection path (one-time snapshot accepted)\noutput:\n${output}`
  );
  // 回落后视图被重写为含哈希行的新版，稳态 sync 必须恢复安静
  const steady = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(steady, `task-sync(${name}) steady after fallback`);
  assert(
    !`${steady.stdout || ""}\n${steady.stderr || ""}`.includes("hand-written content"),
    "after fallback rewrite the steady-state sync must be quiet again"
  );
}

// O8：手改受守卫视图 → sync → warning 含首行摘要（first-line: 触发判定的手改内容）。
// P0-3b（round1 F-03）后受守卫视图仅剩 route-plan（clues 转 append-only，不再快照）。
function scenarioViewGuardWarningIncludesFirstLineSummary(tempRoot) {
  const name = "view-guard-first-line";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) seed views`);
  const planPath = path.join(taskDir, "state", "route-plan.md");
  fs.appendFileSync(planPath, "\n### QA 手写自由线路（qa-handwritten-note-marker 这是 agent 手写自由笔记）\n", "utf8");
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name}) after hand edit`);
  const stderr = result.stderr || "";
  assert(stderr.includes("hand-written content"), `hand edit must trigger view-guard warning\nstderr:\n${stderr}`);
  assert(stderr.includes("first-line:"), `warning must include first-line summary\nstderr:\n${stderr}`);
  assert(stderr.includes("自由"), `first-line summary should surface the hand-written line\nstderr:\n${stderr}`);
}

  return {
    scenarioFirstSyncHasNoViewGuardNoise,
    scenarioViewGuardSelfCompareNoFalsePositive,
    scenarioViewGuardStateMigrationNoFalsePositive,
    scenarioRouteConsistencyVerbatimWithHashLines,
    scenarioViewGuardLegacyViewWithoutHashFallsBack,
    scenarioViewGuardWarningIncludesFirstLineSummary
  };
}


