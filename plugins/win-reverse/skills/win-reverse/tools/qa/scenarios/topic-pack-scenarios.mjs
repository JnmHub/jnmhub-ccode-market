// F-13（round1）：自 check-task-behavior.mjs 等价搬移的场景模块（无行为变化）。
// 通过 ctx 注入宿主脚本的共享工具；新增场景请优先落入本目录，建立模块化先例。
export function createTopicPackScenarios(ctx) {
  const { assert, fs, path, os, crypto, spawnSync, repoRoot, taskStartScript, taskSyncScript, taskAdvanceScript, taskDrillScript, taskCloseScript, taskProbeScript, taskInitScript, taskDispatchScript, makeEnv, runNode, runNodeWithEnv, ensureOk, writeJson, readJson, sha256Text, seedExternalResearch, startBasicTask, buildCloseoutReadyTask, prepareInstalledSkillRoot, evaluateRouteConsistency, detectWebShellTech, readTaskJson, taskFileMatchesTemplate, writeSubstantiveReport } = ctx;

// R3-O1/R3-O3：topic 包产物模板不再向任务目录物化（全量过滤：notes/report/hook/patch
// 等 run/ 下文件全部是 agent 待写交付物）；task-start 开工提示输出各 topic 在
// report.md「专题发现」节应覆盖的小节关键词（report-only 改造：requiredArtifacts 文件
// 清单提示随文件义务退役，提示源改为 formalValidation.requirementsAll 的 reportSection
// 谓词，与 validation.mjs 门禁同源）；再 sync 不重建桩文件；agent 逐字抄仍保留的
// _TEMPLATE 模板（如 packer-unpack 的 dump-manifest.json）仍判占位（占位检测零削弱锁）。
function scenarioTopicPackTemplatesAreNotMaterialized(tempRoot) {
  const name = "pack-no-materialize";
  const workspaceRoot = path.join(tempRoot, `workspace-${name}`);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const taskInputPath = path.join(workspaceRoot, `${name}-input.json`);
  writeJson(taskInputPath, {
    target: {
      value: `${name}-sample`,
      binaryPath: `samples/${name}-sample.exe`
    },
    objective: `验证 ${name} 的 QA 行为`,
    requirements: {
      deliverables: ["report.md", "route-state.json"],
      completionCriteria: [
        { text: `${name} 的核心行为断言全部通过`, status: "pending" }
      ]
    },
    boundaries: {
      inScope: ["静态分析"],
      outOfScope: ["未授权对外联机"]
    },
    runtime: {
      architecture: "x64",
      wow64: "unknown",
      managed: false,
      kernelMode: false
    },
    access: {
      adminRequired: false,
      interactiveUnlockRequired: false,
      driverSigningBypassRequired: false
    }
  });
  const startResult = runNode(
    taskStartScript,
    [name, `--task-input=${taskInputPath}`, "--topics=static-triage,packer-unpack"],
    workspaceRoot
  );
  ensureOk(startResult, `task-start(${name})`);
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", name);

  // R3-O3（report-only 改版）：开工提示须逐 topic 列出 report.md 专题小节关键词
  // （reportSection 谓词原文，与 topic.json formalValidation 同源）
  assert(
    startResult.stdout.includes("topic static-triage 的 report.md 专题小节: 静态分诊|static.?triage|导入表"),
    `task-start prompt must list static-triage report-section keywords\nstdout:\n${startResult.stdout}`
  );
  assert(
    startResult.stdout.includes("topic packer-unpack 的 report.md 专题小节: 脱壳|Unpack|OEP"),
    `task-start prompt must list packer-unpack report-section keywords\nstdout:\n${startResult.stdout}`
  );
  assert(
    !startResult.stdout.includes("待写产物"),
    `retired requiredArtifacts prompt must not reappear\nstdout:\n${startResult.stdout}`
  );

  // R3-O1①：task-start（带 topics）后任务目录无任何 topic 包占位文件
  const packStubPaths = [
    "run/static-triage-notes.md",
    "run/import-surface.md",
    "run/unpack-notes.md",
    "run/iat-rebuild-notes.md",
    "run/oep-proof.md",
    "run/crash-diagnostics.md",
    "run/dump-manifest.json",
    "run/vmp-triage-notes.md",
    "run/vmp-devirt-notes.md"
  ];
  const assertStubsAbsent = (stage) => {
    for (const relPath of packStubPaths) {
      assert(
        !fs.existsSync(path.join(taskDir, ...relPath.split("/"))),
        `${stage}: pack stub must not be materialized: ${relPath}`
      );
    }
  };
  assertStubsAbsent("after task-start");

  // R3-O1②：再 sync 不重建（ensureTaskScaffold -> ensureTopicPackArtifacts 函数体级过滤）
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  assertStubsAbsent("after task-sync");

  // R3-O1⑤（report-only 改版）：agent 逐字抄仍保留的 topic-pack 模板文件仍被判占位——
  // 检测源改指 packer-unpack/run/dump-manifest.json（static-triage-notes 等 doc 模板已随
  // 改造删除；dump-manifest 是保留的机器清单模板，占位检测语义不变）。
  fs.mkdirSync(path.join(taskDir, "run"), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "artifacts", "tasks", "_TEMPLATE", "topic-packs", "packer-unpack", "run", "dump-manifest.json"),
    path.join(taskDir, "run", "dump-manifest.json")
  );
  assert(
    taskFileMatchesTemplate(taskDir, "run/dump-manifest.json") === true,
    "verbatim _TEMPLATE copy must still be judged as placeholder (detection not weakened)"
  );
}

// R3-O1③④（report-only 改版）：缺失态 dry-run 报「report.md 缺少专题小节」finding
// （requiredArtifacts 文件缺失 finding 随文件义务退役，专题覆盖验收载体 = report.md
// 专题小节谓词，与 topic.json formalValidation 同源）；写入含达标专题小节的实质
// report.md 后 finding 消失（谓词 + minChars 双闸，门禁强度等价迁移）。
function scenarioTopicPackMissingArtifactFindingFlow(tempRoot) {
  const name = "pack-missing-finding";
  const workspaceRoot = path.join(tempRoot, `workspace-${name}`);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const taskInputPath = path.join(workspaceRoot, `${name}-input.json`);
  writeJson(taskInputPath, {
    target: {
      value: `${name}-sample`,
      binaryPath: `samples/${name}-sample.exe`
    },
    objective: `验证 ${name} 的 QA 行为`,
    requirements: {
      deliverables: ["report.md", "route-state.json"],
      completionCriteria: [
        { text: `${name} 的核心行为断言全部通过`, status: "pending" }
      ]
    },
    boundaries: {
      inScope: ["静态分析"],
      outOfScope: ["未授权对外联机"]
    },
    runtime: {
      architecture: "x64",
      wow64: "unknown",
      managed: false,
      kernelMode: false
    },
    access: {
      adminRequired: false,
      interactiveUnlockRequired: false,
      driverSigningBypassRequired: false
    }
  });
  ensureOk(
    runNode(taskStartScript, [name, `--task-input=${taskInputPath}`, "--topic=static-triage"], workspaceRoot),
    `task-start(${name})`
  );
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.phase = "Capture";
  writeJson(taskJsonPath, task);

  const missingRun = runNode(taskCloseScript, [name, "--dry-run"], workspaceRoot);
  assert(missingRun.status !== 0, "dry-run must fail while the topic report-section is missing");
  const missingOutput = `${missingRun.stdout}\n${missingRun.stderr}`;
  assert(
    missingOutput.includes("staticTriage.present=true 但 report.md 缺少「PE triage / imports / resources」专题小节"),
    `dry-run must report the topic report-section finding\noutput:\n${missingOutput}`
  );
  assert(
    missingOutput.includes("在 report.md 补一个匹配「静态分诊|static.?triage|导入表」的专题小节"),
    `topic finding fix text must point at the report.md topic section\noutput:\n${missingOutput}`
  );

  // 写入实质 report.md（含达标的静态分诊专题小节，正文 ≥120 字符满足 minChars 谓词）
  writeSubstantiveReport(taskDir, {
    extraTopicSections: [
      {
        heading: "静态分诊（static-triage）",
        body:
          "PE triage / imports / resources 结论：导入表含 kernel32/advapi32 常规导入与自定义校验相关符号，" +
          "资源段无内嵌载荷；入口点属性与节表一致性已核验，分诊结论支撑后续 Capture 阶段取证范围划定" +
          "（QA 夹具实质内容，长度满足 minChars=120 谓词）。"
      }
    ]
  });
  const fixedRun = runNode(taskCloseScript, [name, "--dry-run"], workspaceRoot);
  const fixedOutput = `${fixedRun.stdout}\n${fixedRun.stderr}`;
  assert(
    !fixedOutput.includes("staticTriage.present=true 但 report.md 缺少「PE triage / imports / resources」专题小节"),
    `report-section finding must clear after substantive report write\noutput:\n${fixedOutput}`
  );
}

  return {
    scenarioTopicPackTemplatesAreNotMaterialized,
    scenarioTopicPackMissingArtifactFindingFlow
  };
}


