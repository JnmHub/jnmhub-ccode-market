// F-13（round1）：自 check-task-behavior.mjs 等价搬移的场景模块（无行为变化）。
// 通过 ctx 注入宿主脚本的共享工具；新增场景请优先落入本目录，建立模块化先例。
export function createCloseoutViewScenarios(ctx) {
  const { assert, fs, path, os, crypto, spawnSync, repoRoot, taskStartScript, taskSyncScript, taskAdvanceScript, taskDrillScript, taskCloseScript, taskProbeScript, taskInitScript, taskDispatchScript, makeEnv, runNode, runNodeWithEnv, ensureOk, writeJson, readJson, sha256Text, seedExternalResearch, startBasicTask, buildCloseoutReadyTask, prepareInstalledSkillRoot, evaluateRouteConsistency, detectWebShellTech, readTaskJson, taskFileMatchesTemplate } = ctx;

// F1：顺利收口 + 手改 clues.md 合回 route-state + 未触碰的视图不产生误报快照。
function scenarioCloseoutHappyPathMergesHandEditedClues(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-happy");
  const { codexHome, installedRoot } = prepareInstalledSkillRoot(tempRoot);

  fs.appendFileSync(
    path.join(taskDir, "state", "clues.md"),
    [
      "",
      "## CLUE-099",
      "",
      "- Source Track: A",
      "- Source Entrypoint: EP-001",
      "- Discovered At: 2026-08-02T00:00:00.000Z",
      "- Content: 手工补充的关键线索：入口校验函数已定位",
      "- Verification: 反汇编锚点 0x140001000",
      "- Impact: 缩窄主阻塞点",
      "- Action: 继续静态确认",
      "- Confidence: high",
      ""
    ].join("\n"),
    "utf8"
  );

  const closeResult = runNodeWithEnv(taskCloseScript, ["closeout-happy"], workspaceRoot, {
    CODEX_HOME: codexHome
  });
  ensureOk(closeResult, "task-close(closeout-happy)");
  assert(closeResult.stdout.includes("verify-once: passed"), "happy path should pass formal validation");

  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  assert(
    (routeState.clues || []).some((clue) => String(clue.content || "").includes("手工补充的关键线索")),
    "hand-written clue should be merged back into route-state.json"
  );
  assert(
    !fs.existsSync(path.join(taskDir, "run", "orphaned-view-content.md")),
    "untouched views must not produce false orphan snapshots"
  );
  assert(routeState.execution?.status === "completed", "real close should mark execution completed");
  assert(
    fs.existsSync(path.join(installedRoot, "artifacts", "tasks", "closeout-happy", "task.json")),
    "real close should archive the task snapshot into the installed skill root"
  );
}

// F2：task.json 镜像字段漂移 → close 入口 resync 覆写并打印可见性行。
function scenarioCloseoutMirrorDriftIsResynced(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-drift");
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.routeState.executionStatus = "blocked-on-user";
  task.routeState.pauseReason = "手工写入的漂移暂停原因";
  writeJson(taskJsonPath, task);

  const closeResult = runNode(taskCloseScript, ["closeout-drift", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(closeout-drift)");
  assert(
    closeResult.stdout.includes("[resync] task.json mirror fields overwritten from route-state.json:"),
    "close should print the mirror-overwrite visibility line"
  );
  assert(
    closeResult.stdout.includes("executionStatus") && closeResult.stdout.includes("pauseReason"),
    "overwrite line should name the drifted mirror fields"
  );
  const persisted = readJson(taskJsonPath);
  assert(
    persisted.routeState.executionStatus === "ready-to-continue",
    "mirror drift should be overwritten from route-state.json"
  );
  assert(persisted.routeState.pauseReason === "", "mirror pauseReason drift should be cleared");
}

// F3：三条反捷径闸门在改造后依然拦得住：(a) 判据未命中 (b) 证据无效 (c) 阶段产物占位。
function scenarioCloseoutAntiShortcutGates(tempRoot) {
  const pending = buildCloseoutReadyTask(tempRoot, "closeout-pending", { pendingCriteriaIndexes: [1] });
  const pendingResult = runNode(taskCloseScript, ["closeout-pending", "--dry-run"], pending.workspaceRoot);
  assert(pendingResult.status !== 0, "pending completionCriteria must block closeout");
  const pendingOutput = `${pendingResult.stdout}\n${pendingResult.stderr}`;
  assert(pendingOutput.includes("pending indexes=1"), "gate should name the pending criteria index");
  assert(
    !pendingOutput.includes("closeout requires validation.status=passed"),
    "dry-run must not emit a false validation.status error"
  );
  const pendingAttemptsPath = path.join(pending.taskDir, "run", "closeout-attempts.jsonl");
  assert(
    fs.existsSync(pendingAttemptsPath) && fs.readFileSync(pendingAttemptsPath, "utf8").includes('"closeout"'),
    "failed closeout gate should record telemetry"
  );

  const noEvidence = buildCloseoutReadyTask(tempRoot, "closeout-noevidence", { invalidEvidence: true });
  const noEvidenceResult = runNode(taskCloseScript, ["closeout-noevidence", "--dry-run"], noEvidence.workspaceRoot);
  assert(noEvidenceResult.status !== 0, "hit criteria without valid evidenceRefs must block closeout");
  assert(
    `${noEvidenceResult.stdout}\n${noEvidenceResult.stderr}`.includes("valid evidenceRefs"),
    "gate should explain the evidenceRefs requirement"
  );

  // V2-9 后 evidence tier 豁免 run-local 守卫；本场景改用 patch tier 锁定「仍挂」半边。
  const placeholder = buildCloseoutReadyTask(tempRoot, "closeout-placeholder", {
    phase: "Rebuild",
    deliverableTier: "patch"
  });
  const placeholderResult = runNode(taskCloseScript, ["closeout-placeholder", "--dry-run"], placeholder.workspaceRoot);
  assert(placeholderResult.status !== 0, "placeholder run-local.mjs must block closeout at Rebuild phase");
  const placeholderOutput = `${placeholderResult.stdout}\n${placeholderResult.stderr}`;
  assert(placeholderOutput.includes("verify-once: FAILED"), "formal validation stage should fail first");
  assert(
    placeholderOutput.includes("run-local.mjs is still the template placeholder"),
    "phase artifact guard should fire"
  );
  const placeholderAttempts = fs.readFileSync(
    path.join(placeholder.taskDir, "run", "closeout-attempts.jsonl"),
    "utf8"
  );
  assert(placeholderAttempts.includes('"verify-once"'), "verify-once failure should record telemetry");

  // (d) run-local 占位闸门（round1 F-07 并轨后）：local-repro/protocol-replay 示例文件
  // 已并入参数化 run-local.mjs 骨架——逐字照抄合并骨架交付仍被 artifactTouchedAgainstTemplate
  // 判占位（第三候选回退保住检测强度），占位分支判定不变。
  const localRepro = buildCloseoutReadyTask(tempRoot, "closeout-localrepro", {
    deliveryRequirements: { localReproductionRequested: true, protocolReplayExampleRequired: true }
  });
  fs.copyFileSync(
    path.join(repoRoot, "artifacts", "tasks", "_TEMPLATE", "core", "run", "run-local.mjs"),
    path.join(localRepro.taskDir, "run", "run-local.mjs")
  );
  const localReproResult = runNode(taskCloseScript, ["closeout-localrepro", "--dry-run"], localRepro.workspaceRoot);
  assert(localReproResult.status !== 0, "placeholder merged run-local.mjs must block closeout");
  const localReproOutput = `${localReproResult.stdout}\n${localReproResult.stderr}`;
  assert(
    localReproOutput.includes("run/run-local.mjs is still the template placeholder"),
    "merged run-local placeholder gate should fire"
  );
}

// V3-5/Q9（行为）：close --dry-run 后 task.json validation 字段零变更（内容变更型竞态改道）+
// run/validation-last.json 存在且与 validation 字段同构 + evaluateCloseoutGate 不误挂
// （task.json 留 "not-started" 陈旧值时 gate 回读改道文件而非误挂）。
function scenarioCloseoutDryRunReroutesValidationState(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-dryrun-reroute");

  const before = readJson(path.join(taskDir, "task.json")).validation;
  assert(before?.status === "not-started", "fixture sanity: validation should start not-started (fallback is exercised)");

  const closeResult = runNode(taskCloseScript, ["closeout-dryrun-reroute", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(closeout-dryrun-reroute): gate must not false-fire on the stale task.json value");

  const after = readJson(path.join(taskDir, "task.json")).validation;
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    "dry-run must leave the task.json validation field unchanged (rerouted)"
  );

  const lastPath = path.join(taskDir, "run", "validation-last.json");
  assert(fs.existsSync(lastPath), "dry-run should persist run/validation-last.json");
  const last = readJson(lastPath);
  assert(last.status === "passed", "validation-last.json should carry the dry-run status");
  assert(
    typeof last.lastVerifiedAt === "string" && last.lastVerifiedAt.length > 0,
    "validation-last.json should carry lastVerifiedAt"
  );
  assert(Array.isArray(last.notes), "validation-last.json should carry notes (same shape as task.json validation)");
}

// F4：dry-run 共享完整求值路径但不产生收口副作用（不归档、不清理、不写 completed）。
function scenarioCloseoutDryRunHasNoSideEffects(tempRoot) {
  const { codexHome, installedRoot } = prepareInstalledSkillRoot(tempRoot);
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-dryrun");

  const dryResult = runNodeWithEnv(taskCloseScript, ["closeout-dryrun", "--dry-run"], workspaceRoot, {
    CODEX_HOME: codexHome
  });
  ensureOk(dryResult, "task-close --dry-run(closeout-dryrun)");
  assert(dryResult.stdout.includes("--dry-run: all gates passed"), "dry-run should print the skip notice");
  assert(
    !fs.existsSync(path.join(installedRoot, "artifacts", "tasks", "closeout-dryrun")),
    "dry-run must not archive the task snapshot"
  );
  assert(
    fs.existsSync(path.join(taskDir, "run", "verify-output.log")),
    "dry-run must not run cleanup deletions"
  );
  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  assert(
    routeState.execution?.status !== "completed",
    "dry-run must not run the closeout state synchronization"
  );

  const failing = buildCloseoutReadyTask(tempRoot, "closeout-dryrun-fail", { pendingCriteriaIndexes: [1] });
  const dryFail = runNode(taskCloseScript, ["closeout-dryrun-fail", "--dry-run"], failing.workspaceRoot);
  const realFail = runNode(taskCloseScript, ["closeout-dryrun-fail"], failing.workspaceRoot);
  assert(dryFail.status !== 0 && realFail.status !== 0, "dry-run and real close should both fail on pending criteria");
  assert(
    `${dryFail.stdout}\n${dryFail.stderr}`.includes("pending indexes=1"),
    "dry-run should surface the same finding as a real close"
  );
  assert(
    `${realFail.stdout}\n${realFail.stderr}`.includes("pending indexes=1"),
    "real close should surface the same finding as the dry-run"
  );
}

// F5：close 时刻新命中的 topic 信号被 freezeNewTopics 冻结，闸门不自造 finding。
// P0-3b（round1 F-03）夹具改写：clue 内容不再经渲染镜像进 clues.md——agent 直写
// append-only 账本。线索与报告证据都在 build sync 之后落盘，使推断只在 close 入口
// 读取时才首次命中（与旧镜像流的冻结触发时序等价）。
function scenarioCloseoutFreezesNewTopicInference(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-freeze");
  fs.appendFileSync(
    path.join(taskDir, "state", "clues.md"),
    [
      "",
      "## CLUE-002",
      "",
      "- Source Track: A",
      "- Content: 发现 DriverEntry 风格入口迹象，留待后续任务确认",
      "- Verification: 静态字符串锚点",
      "- Confidence: medium",
      ""
    ].join("\n"),
    "utf8"
  );
  // report + clues 双命中才会触发推断（corroboratedFreeText）；report 在 sync 后手写，
  // 使推断只在 close 入口读取时才首次命中。report-only 改造：report.md 必须保持实质内容
  // （收口 substance 门禁），驱动信号行并入实质报告的专题发现节。
  const reportPath = path.join(taskDir, "report.md");
  fs.appendFileSync(
    reportPath,
    "\n- 补充信号：目标存在 DriverEntry 风格入口迹象，本任务仅做静态确认，后续另行处理。\n",
    "utf8"
  );

  const unfrozen = readTaskJson(taskDir);
  assert(
    (unfrozen.taskPacks?.selectedTopics || []).includes("driver"),
    "control: unfrozen read should infer driver from the corroborated signals"
  );
  const frozen = readTaskJson(taskDir, { freezeNewTopics: true });
  assert(
    !(frozen.taskPacks?.selectedTopics || []).includes("driver"),
    "frozen read must not infer new topics"
  );

  const closeResult = runNode(taskCloseScript, ["closeout-freeze", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(closeout-freeze)");
  const closeOutput = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(!closeOutput.includes("driverAnalysis"), "frozen close must not surface driver topic findings");
  const persisted = readJson(path.join(taskDir, "task.json"));
  assert(
    !(persisted.taskPacks?.selectedTopics || []).includes("driver"),
    "close must not persist newly inferred topics"
  );
  assert(
    !fs.existsSync(path.join(taskDir, "run", "driver-dispatch-map.md")),
    "close must not materialize new topic artifacts"
  );

  // 真实 close（含归档）：归档步骤曾绕过 freezeNewTopics 重读 task.json，把重新推断的
  // topic 与扩展模板占位字段写回 workspace 和归档副本。这里锁住"真实收口后冻结不变量仍成立"。
  const { codexHome, installedRoot } = prepareInstalledSkillRoot(tempRoot);
  const realCloseResult = runNodeWithEnv(taskCloseScript, ["closeout-freeze"], workspaceRoot, {
    CODEX_HOME: codexHome
  });
  ensureOk(realCloseResult, "task-close(closeout-freeze)");
  const afterRealClose = readJson(path.join(taskDir, "task.json"));
  assert(
    !(afterRealClose.taskPacks?.selectedTopics || []).includes("driver") && !afterRealClose.driverAnalysis,
    "real close + archive must not resurrect inferred topics into the workspace task.json"
  );
  const archivedTask = readJson(path.join(installedRoot, "artifacts", "tasks", "closeout-freeze", "task.json"));
  assert(
    !(archivedTask.taskPacks?.selectedTopics || []).includes("driver") && !archivedTask.driverAnalysis,
    "archived snapshot must not contain topics the task never actually covered"
  );
}

// F6：route-state 只剩 lossy 标记时，回填链路必须工作并以 needs-route-rebuild 阻断收口，
// 且手写的 route-plan 残骸先被快照再被覆盖（灾难证据不丢）。
function scenarioCloseoutLossyRouteStateBlocks(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-lossy");

  writeJson(path.join(taskDir, "state", "route-state.json"), {
    schemaVersion: 2,
    syncStatus: "backfilled-from-markdown-lossy",
    tracks: [],
    entrypoints: [],
    retrospectives: [],
    clues: []
  });
  fs.writeFileSync(
    path.join(taskDir, "state", "route-plan.md"),
    "# Route Plan\n\nEP-001 切入点残骸：结构化字段已在事故中丢失，只剩这段自由文本。\n",
    "utf8"
  );

  const closeResult = runNode(taskCloseScript, ["closeout-lossy", "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "lossy route-state must block closeout");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(output.includes("lossily backfilled"), "lossy backfill finding should surface");
  const orphanPath = path.join(taskDir, "run", "orphaned-view-content.md");
  assert(fs.existsSync(orphanPath), "hand-written route-plan remnants should be snapshotted before overwrite");
  assert(
    fs.readFileSync(orphanPath, "utf8").includes("切入点残骸"),
    "snapshot should preserve the orphaned content"
  );
}

// F7：混合手改 clues.md（新 CLUE 段 + 段内自由笔记 + 段外自由笔记）→ 新 clue 合回
// route-state，两种位置的自由文本都必须在覆写前快照保全。锁住守卫快照条件的回归：
// 旧的 novel.length === 0 代理判据在混合场景下漏判，自由文本会静默丢失。
// P0-3b（round1 F-03）改写：clues.md 转 append-only 账本后的混合手写场景——
// novel 结构化 clue 仍被单向吸收进 route-state.json；自由文本（段内/段外）与
// 无 Content 的不可合并段**原文保留在 clues.md**（永不覆写，无需快照兜底），
// orphaned-view-content.md 对 clues 不再新增。
function scenarioCloseoutMixedHandEditPreservesFreeText(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "closeout-mixed");

  fs.appendFileSync(
    path.join(taskDir, "state", "clues.md"),
    [
      "",
      "## CLUE-099",
      "",
      "- Source Track: A",
      "- Content: 混合场景的新线索",
      "- Confidence: medium",
      "随手记：段内的这条自由笔记不属于任何标签行",
      "",
      "段外自由笔记：0x140005000 处的偏移量待复核",
      "",
      "## CLUE-100",
      "",
      "- Content: ",
      "- Verification: 只有验证方式没有线索内容的手写段，字段值不得丢失",
      ""
    ].join("\n"),
    "utf8"
  );

  ensureOk(runNode(taskSyncScript, ["closeout-mixed"], workspaceRoot), "task-sync(closeout-mixed)");

  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  assert(
    (routeState.clues || []).some((clue) => String(clue.content || "").includes("混合场景的新线索")),
    "novel hand-written clue should be merged into route-state.json"
  );
  const cluesText = fs.readFileSync(path.join(taskDir, "state", "clues.md"), "utf8");
  assert(cluesText.includes("段内的这条自由笔记"), "append-only ledger must keep free text inside a clue section");
  assert(cluesText.includes("段外自由笔记"), "append-only ledger must keep free text outside clue sections");
  assert(
    cluesText.includes("只有验证方式没有线索内容"),
    "append-only ledger must keep values of unmergeable clues (empty Content, other labels non-empty)"
  );
  assert(
    !fs.existsSync(path.join(taskDir, "run", "orphaned-view-content.md")),
    "clues hand-edits must no longer create run/orphaned-view-content.md snapshots"
  );
}

  return {
    scenarioCloseoutHappyPathMergesHandEditedClues,
    scenarioCloseoutMirrorDriftIsResynced,
    scenarioCloseoutAntiShortcutGates,
    scenarioCloseoutDryRunReroutesValidationState,
    scenarioCloseoutDryRunHasNoSideEffects,
    scenarioCloseoutFreezesNewTopicInference,
    scenarioCloseoutLossyRouteStateBlocks,
    scenarioCloseoutMixedHandEditPreservesFreeText
  };
}


