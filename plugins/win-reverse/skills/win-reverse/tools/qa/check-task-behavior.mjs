import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detect as detectWebShellTech } from "../task/detect-web-shell-tech.mjs";
import { archiveTaskSnapshot } from "../task/task-archive.mjs";
import { assertSafeWorkspaceRoot, getTopicBySpecifier, phaseOrder, readTaskJson, taskFileMatchesTemplate } from "../task/common.mjs";
import { defaultRouteStateDocument, resolveExecutionState } from "../task/route-state.mjs";
import { artifactTouched, collectCloseoutObligations, evaluateCloseoutGate, evaluateRouteConsistency, runFormalValidation } from "../task/validation.mjs";

// F-13（round1）：三簇场景迁入 tools/qa/scenarios/（模块化先例，内容等价搬移）。
import { createCloseoutViewScenarios } from "./scenarios/closeout-view-scenarios.mjs";
import { createViewGuardScenarios } from "./scenarios/view-guard-scenarios.mjs";
import { createTopicPackScenarios } from "./scenarios/topic-pack-scenarios.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const taskStartScript = path.join(repoRoot, "tools", "task", "task-start.mjs");
const taskSyncScript = path.join(repoRoot, "tools", "task", "task-sync.mjs");
const taskAdvanceScript = path.join(repoRoot, "tools", "task", "task-advance.mjs");
const taskDrillScript = path.join(repoRoot, "tools", "task", "task-drill.mjs");
const taskCloseScript = path.join(repoRoot, "tools", "task", "task-close.mjs");
const taskProbeScript = path.join(repoRoot, "tools", "task", "task-probe.mjs");
const taskInitScript = path.join(repoRoot, "tools", "task", "task-init.mjs");
const taskDispatchScript = path.join(repoRoot, "tools", "task", "task-dispatch.mjs");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeEnv(workspaceRoot) {
  return {
    ...process.env,
    WIN_REVERSE_SKILL_ROOT: repoRoot,
    WIN_REVERSE_WORKSPACE_ROOT: workspaceRoot,
    // 多 Agent 改造（win 改造 §2.1）：历史 QA 场景一律按 single/legacy 口径跑
    // （协作判据 advisory 化）；协作硬门禁由专门的 multi 场景用 --execution-model=multi 覆盖。
    WIN_REVERSE_EXECUTION_MODEL: "single",
    // 影子账本隔离到 QA 临时工作区，不写真实 ~/.win-reverse/ledger
    WIN_REVERSE_LEDGER_ROOT: path.join(workspaceRoot, ".ledger")
  };
}

function runNode(scriptPath, args, workspaceRoot) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: makeEnv(workspaceRoot),
    encoding: "utf8"
  });
}

function ensureOk(result, label) {
  if (result.status === 0) {
    return;
  }
  throw new Error(
    `${label} failed\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`
  );
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

// task-advance 对 T3+ 目标要求先完成外部研究（task-probe 的启发式定级会把
// "套壳/packed" 类 objective 定到 T3+）。不涉及该门禁的用例在 advance 前播种
// 研究笔记，模拟真实工作流中 agent 必须先完成的调研步骤。
// 内容须满足 task-advance 的内容门禁（V2-8）：≥200 字符且含 query/检索、sources/来源、findings/结论 三节标记。
function seedExternalResearch(taskDir, note = "公开资料与工具链调研已完成。") {
  const researchPath = path.join(taskDir, "state", "external-research.md");
  fs.mkdirSync(path.dirname(researchPath), { recursive: true });
  fs.writeFileSync(
    researchPath,
    [
      "# 外部研究",
      "",
      "## 检索 / query",
      `- QA 夹具播种：${note}模拟针对该类防护公开资料、工具链与已知限制的检索过程。`,
      "## 来源 / sources",
      "- QA 夹具播种：公开技术博客、厂商文档与社区论坛的工具发布页（夹具内容，非真实链接）。",
      "## 结论 / findings",
      "- QA 夹具播种：公开工具链仅覆盖已知模式，剩余路径需手工分析并按黑盒边界推进，",
      "  相关风险与替代路线已记入 assumptions，供复核者据此重走调研路径。",
      ""
    ].join("\n"),
    "utf8"
  );
}

function scenarioTaskLifecycle(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-lifecycle");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const taskInputPath = path.join(workspaceRoot, "valid-task-input.json");
  writeJson(taskInputPath, {
    target: {
      value: "behavior-sample",
      binaryPath: "samples/behavior-sample.exe"
    },
    objective: "验证 task-start/task-sync/task-advance 的行为闭环",
    requirements: {
      deliverables: [
        "report.md",
        "route-state.json"
      ],
      completionCriteria: [
        { text: "task-start/task-sync/task-advance 全链可复跑且状态一致", status: "pending" }
      ],
      localReproductionRequested: true
    },
    boundaries: {
      inScope: [
        "静态分析",
        "本地调试"
      ],
      outOfScope: [
        "未授权对外联机"
      ]
    },
    runtime: {
      architecture: "x64",
      wow64: "unknown",
      managed: false,
      kernelMode: false
    },
    access: {
      adminRequired: true,
      interactiveUnlockRequired: false,
      driverSigningBypassRequired: false
    },
    focusSignals: [
      "CreateRemoteThread",
      "WinHttpSendRequest"
    ]
  });

  const startResult = runNode(
    taskStartScript,
    [
      "behavior-start",
      "--topics=static-triage,packer-unpack",
      `--task-input=${taskInputPath}`,
      "--local-repro"
    ],
    workspaceRoot
  );
  ensureOk(startResult, "task-start(new)");

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "behavior-start");
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.taskPacks.selectedTopics.includes("static-triage"), "selectedTopics missing static-triage");
  assert(task.taskPacks.selectedTopics.includes("packer-unpack"), "selectedTopics missing packer-unpack");
  assert(task.objective === "验证 task-start/task-sync/task-advance 的行为闭环", "root objective not mapped");
  assert(task.deliverableTier === "evidence", "deliverableTier should default to evidence for evidence-only deliverables");
  assert(
    Array.isArray(task.completionCriteria) &&
      task.completionCriteria.length === 1 &&
      typeof task.completionCriteria[0] === "object" &&
      task.completionCriteria[0].text === "task-start/task-sync/task-advance 全链可复跑且状态一致",
    "explicit object-form completionCriteria should pass through unchanged (P1-5: no synthesis from deliverables)"
  );
  assert(task.targetContext.inputTarget === "behavior-sample", "task input target not mapped");
  assert(task.targetContext.targetBinaryPath === "samples/behavior-sample.exe", "binaryPath not mapped");
  assert(task.runtime.architecture === "x64", "runtime.architecture not mapped");
  assert(task.accessRequirements.adminRequired === true, "access.adminRequired not mapped");
  assert(task.deliveryRequirements.localReproductionRequested === true, "local reproduction flag not inferred");

  const syncResult = runNode(taskSyncScript, ["behavior-start"], workspaceRoot);
  ensureOk(syncResult, "task-sync");

  const advanceResult = runNode(taskAdvanceScript, ["behavior-start", "--json"], workspaceRoot);
  ensureOk(advanceResult, "task-advance");
  const advancePayload = JSON.parse(advanceResult.stdout);
  assert(advancePayload.execution.status === "ready-to-continue", "execution.status should be ready-to-continue");
  assert(
    String(advancePayload.execution.nextExecutableAction || "").trim().length > 0,
    "nextExecutableAction should not be empty"
  );

  const blockedStart = runNode(taskStartScript, ["second-task"], workspaceRoot);
  assert(blockedStart.status !== 0, "task-start should block second task-local without --force-new-task");

  const forcedStart = runNode(
    taskStartScript,
    ["second-task", "--force-new-task", "--topic=dotnet"],
    workspaceRoot
  );
  ensureOk(forcedStart, "task-start(force-new-task)");
}

function scenarioSchemaEnforcement(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-schema");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const invalidTaskInputPath = path.join(workspaceRoot, "invalid-task-input.json");
  writeJson(invalidTaskInputPath, {
    target: {
      value: "invalid-sample"
    },
    objective: "验证 schema 强制执行",
    requirements: {
      deliverables: [
        "report.md"
      ],
      protocolReplayExampleRequired: true,
      localReproductionRequested: false
    },
    boundaries: {
      inScope: [
        "协议重放"
      ]
    }
  });

  const result = runNode(
    taskStartScript,
    ["schema-bad", `--task-input=${invalidTaskInputPath}`],
    workspaceRoot
  );
  assert(result.status !== 0, "invalid task input should fail");
  assert(
    `${result.stdout}\n${result.stderr}`.includes("task input failed schema validation"),
    "schema failure message should be surfaced"
  );
}

// R2-1/F-14（回归锁）：内联 JSON 误当 --task-input 路径时，报文须点名误用形态并给出
// "写文件再传路径"指引，且不得把原始 JSON 拼进 ENOENT 路径（复测会话三连败之①）。
function scenarioTaskInitInlineJsonRejected(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-inline-json");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const inlineJson = JSON.stringify({
    target: "inline-sample",
    objective: "内联 JSON 误用检测",
    requirements: ["report.md"],
    boundaries: ["静态分析"]
  });
  const result = runNode(
    taskStartScript,
    ["inline-json", `--task-input=${inlineJson}`],
    workspaceRoot
  );
  assert(result.status !== 0, "inline JSON task input should fail");
  const output = `${result.stdout}\n${result.stderr}`;
  assert(output.includes("须为 JSON 文件路径"), "inline JSON misuse should be named");
  assert(!output.includes("inline-sample"), "error must not echo raw inline JSON content");
}

// R2-1/F-14（回归锁）：task-start 预建目录后重跑 task-init，dir-exists 报文须指明
// Edit 直改出路，并明示 --force-new-task 不豁免本检查（复测会话三连败之③）。
function scenarioTaskInitDirExistsGuidance(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-dir-exists");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const startResult = runNode(taskStartScript, ["dir-exists"], workspaceRoot);
  ensureOk(startResult, "task-start(dir-exists seed)");

  const retryResult = runNode(
    taskInitScript,
    ["dir-exists", "--force-new-task"],
    workspaceRoot
  );
  assert(retryResult.status !== 0, "re-init on existing dir should still fail");
  const output = `${retryResult.stdout}\n${retryResult.stderr}`;
  assert(output.includes("task directory already exists"), "dir-exists message should stay");
  assert(
    output.includes("--force-new-task 不豁免本检查"),
    "dir-exists guidance must say force-new-task does not exempt"
  );
}

function scenarioContractLockBlocksAutoAdvance(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-contract-lock");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const startResult = runNode(taskStartScript, ["contract-lock"], workspaceRoot);
  ensureOk(startResult, "task-start(contract-lock)");

  const advanceResult = runNode(taskAdvanceScript, ["contract-lock", "--json"], workspaceRoot);
  ensureOk(advanceResult, "task-advance(contract-lock)");
  const payload = JSON.parse(advanceResult.stdout);
  assert(payload.execution.status === "needs-contract-lock", "empty task contract should block auto-advance");
  assert(payload.execution.autoAdvanceEligible === false, "contract lock should not be auto-advance eligible");
  assert(
    String(payload.execution.pauseReason || "").includes("objective") &&
      String(payload.execution.pauseReason || "").includes("completionCriteria"),
    "contract lock should name missing contract fields"
  );
}

// RT-4/Q8（回归锁）：删 run/env-capability.json + 手注 objective → ensureTaskArmed 走
// 内联 probe 分支（common.mjs），task-advance --json 的 stdout 必须纯净：首行即 JSON
// 负载起始（probe 日志等噪音不得混入 stdout），整体可 JSON.parse。
// 注：工单字面「首行可 JSON.parse」按「stdout 第一行就是 JSON 起始符、无任何前置噪音行」
// 落地——payload 为 pretty-print 多行 JSON，首行 "{" 本身不可单独 parse。
function scenarioAdvanceJsonStdoutStaysPureThroughProbeBranch(tempRoot) {
  const name = "advance-json-pure";
  const workspaceRoot = path.join(tempRoot, `workspace-${name}`);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  ensureOk(runNode(taskStartScript, [name], workspaceRoot), `task-start(${name})`);
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", name);

  // 手注 objective（避开 packer-signal 关键词，防 T3 外部研究门禁干扰本回归锁）
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.objective = "分析样本入口校验逻辑并记录调用链";
  writeJson(taskJsonPath, task);

  // 覆盖 ensureTaskArmed 的 probe 分支（common.mjs 内联 probe）：env-capability 必须缺失
  const envCapabilityPath = path.join(taskDir, "run", "env-capability.json");
  if (fs.existsSync(envCapabilityPath)) {
    fs.rmSync(envCapabilityPath);
  }
  assert(!fs.existsSync(envCapabilityPath), "fixture must delete run/env-capability.json to cover the probe branch");

  const advanceResult = runNode(taskAdvanceScript, [name, "--json"], workspaceRoot);
  ensureOk(advanceResult, `task-advance(${name} --json) through the inline probe branch`);
  assert(fs.existsSync(envCapabilityPath), "probe branch should regenerate run/env-capability.json");
  const stdout = advanceResult.stdout || "";
  assert(stdout.split("\n")[0] === "{", "advance --json stdout first line must be the JSON opening brace (no noise)");
  const payload = JSON.parse(stdout);
  assert(payload && typeof payload === "object" && payload.execution, "advance --json stdout should stay JSON.parse-able");
}

// O1：task-advance --to=<phase> 显式推进。① 合法前进落盘 task.json 与 route-state.json。
function scenarioAdvanceToPhaseMovesForward(tempRoot) {
  const name = "advance-to-forward";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot), `task-advance(${name} --to=Capture)`);
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.phase === "Capture", `--to=Capture should write task.phase=Capture, got ${task.phase}`);
  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  assert(routeState.phase === "Capture", `--to=Capture should write route-state phase=Capture, got ${routeState.phase}`);
}

// O1：② 非法 phase 拒绝且 stderr 含全部 6 个合法值（词表 import 自 common.mjs 单源）。
function scenarioAdvanceToBogusPhaseRejected(tempRoot) {
  const name = "advance-to-bogus";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const result = runNode(taskAdvanceScript, [name, "--to=Bogus"], workspaceRoot);
  assert(result.status !== 0, "--to=Bogus must exit non-zero");
  const stderr = result.stderr || "";
  for (const phase of phaseOrder) {
    assert(stderr.includes(phase), `--to=Bogus stderr must list legal value ${phase}\nstderr:\n${stderr}`);
  }
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.phase === "Observe", "rejected --to must not mutate task.phase");
}

// O1：③ 回退拒绝（无 --allow-regress 通道），stderr 报"不允许回退"。
function scenarioAdvanceToEarlierPhaseRejected(tempRoot) {
  const name = "advance-to-regress";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot), `task-advance(${name} --to=Capture)`);
  const result = runNode(taskAdvanceScript, [name, "--to=Observe"], workspaceRoot);
  assert(result.status !== 0, "--to=Observe after Capture must exit non-zero (regression rejected)");
  assert((result.stderr || "").includes("不允许回退"), `regression rejection must say 不允许回退\nstderr:\n${result.stderr || ""}`);
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.phase === "Capture", "rejected regression must not mutate task.phase");
}

// O1：④ 等值推进提示"phase 未变"（仅非 --json 分支）；--json 分支 stdout 纯净性不被 --to 破坏。
function scenarioAdvanceToSamePhaseHintsAndJsonStaysPure(tempRoot) {
  const name = "advance-to-same";
  const { workspaceRoot } = startBasicTask(tempRoot, name);
  const plain = runNode(taskAdvanceScript, [name, "--to=Observe"], workspaceRoot);
  ensureOk(plain, `task-advance(${name} --to=Observe)`);
  assert((plain.stdout || "").includes("phase 未变"), `same-phase advance should hint phase 未变\nstdout:\n${plain.stdout || ""}`);
  assert((plain.stdout || "").includes("--to=<phase>"), "same-phase hint should mention the --to=<phase> form");
  const jsonResult = runNode(taskAdvanceScript, [name, "--to=Observe", "--json"], workspaceRoot);
  ensureOk(jsonResult, `task-advance(${name} --to=Observe --json)`);
  const stdout = jsonResult.stdout || "";
  assert(stdout.split("\n")[0] === "{", "advance --to=<same> --json stdout first line must be the JSON opening brace");
  assert(!stdout.includes("phase 未变"), "phase 未变 hint must not leak into --json stdout");
  JSON.parse(stdout);
}

function scenarioDefaultRouteDoesNotInferWebShell(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-default-route-topic");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const startResult = runNode(
    taskStartScript,
    ["static-topic-stays-static", "--topics=static-triage,packer-unpack"],
    workspaceRoot
  );
  ensureOk(startResult, "task-start(default-route-topic)");

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "static-topic-stays-static");
  const normalizedTask = readTaskJson(taskDir);
  assert(
    !normalizedTask.taskPacks.selectedTopics.includes("web-shell-triage"),
    "default EP-002 route candidate must not infer web-shell-triage"
  );

  const syncResult = runNode(taskSyncScript, ["static-topic-stays-static"], workspaceRoot);
  ensureOk(syncResult, "task-sync(default-route-topic)");
  const persistedTask = readJson(path.join(taskDir, "task.json"));
  assert(
    !persistedTask.taskPacks.selectedTopics.includes("web-shell-triage"),
    "task-sync should preserve explicit non-web-shell topics when no target evidence exists"
  );
}

function scenarioCrashDiagnosticsAndGenericBackupGuard(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-compliance");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const startResult = runNode(taskStartScript, ["compliance-guard"], workspaceRoot);
  ensureOk(startResult, "task-start(compliance-guard)");

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "compliance-guard");
  const runDir = path.join(taskDir, "run");
  fs.writeFileSync(path.join(runDir, "crash_state.flag"), "crashed\n", "utf8");
  fs.writeFileSync(
    path.join(runDir, "crash-diagnostics.md"),
    [
      "Windbg captured ExceptionCode 0xC0000005 at RIP 0x00007ff700001234.",
      "Stack frames include module!WinMain+0x42 and module!VerifyLicense+0x91.",
      "EventVwr Application Error reports Fault offset 0x1234 and crash dump address 0x0000000140001234.",
      "x64dbg register snapshot: RAX=0x0 RCX=0x1 RDX=0x2 RIP=0x00007ff700001234."
    ].join("\n"),
    "utf8"
  );

  const crashAllowed = runNode(taskAdvanceScript, ["compliance-guard", "--json"], workspaceRoot);
  ensureOk(crashAllowed, "task-advance(crash-diagnostics)");

  const originalPath = path.join(workspaceRoot, "target.bin");
  const backupName = "target.bin.clean.bak";
  const backupContent = "clean-reference\n";
  fs.writeFileSync(originalPath, "modified-current\n", "utf8");
  fs.writeFileSync(path.join(runDir, backupName), backupContent, "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    `| original | backup | sha256 |\n| ${originalPath} | ${backupName} | ${sha256Text(backupContent)} |\n`,
    "utf8"
  );

  const blocked = runNode(taskAdvanceScript, ["compliance-guard", "--json"], workspaceRoot);
  assert(blocked.status !== 0, "generic .clean.bak hash mismatch should block task-advance");
  assert(
    `${blocked.stdout}\n${blocked.stderr}`.includes("SHA256"),
    "generic hash mismatch should surface a SHA256 guard message"
  );

  fs.writeFileSync(path.join(runDir, "hash_mismatch_authorized.flag"), "authorized\n", "utf8");
  const authorized = runNode(taskAdvanceScript, ["compliance-guard", "--json"], workspaceRoot);
  ensureOk(authorized, "task-advance(hash-mismatch-authorized)");
}

function scenarioFormalValidationRequiresCoreContract(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-core-contract");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const startResult = runNode(taskStartScript, ["core-contract"], workspaceRoot);
  ensureOk(startResult, "task-start(core-contract)");

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "core-contract");
  const validation = runFormalValidation(taskDir);
  const errors = validation.errors.join("\n");
  for (const needle of [
    "task.json objective is empty",
    "task.json deliverableTier is empty",
    "task.json completionCriteria is empty",
    "report.md is still the scaffold template"
  ]) {
    assert(errors.includes(needle), `formal validation should report: ${needle}`);
  }
  // report-only 改造：core 三件套文档门禁（investigation/plan/assumptions）已退役，
  // 缺失 run/*.md 过程文档不得再产生任何 error。
  for (const retiredNeedle of [
    "core phase gate requires run/investigation.md",
    "core phase gate requires run/plan.md",
    "core phase gate requires run/assumptions.md"
  ]) {
    assert(!errors.includes(retiredNeedle), `formal validation must not report retired gate: ${retiredNeedle}`);
  }
}

function scenarioDrillFlow(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-drill");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const result = runNode(
    taskDrillScript,
    ["packed-dotnet-loader", "behavior-drill"],
    workspaceRoot
  );
  ensureOk(result, "task-drill");

  const task = readJson(
    path.join(workspaceRoot, "artifacts", "tasks", "behavior-drill", "task.json")
  );
  assert(task.taskDrill.scenarioId === "packed-dotnet-loader", "taskDrill.scenarioId mismatch");
  assert(
    Array.isArray(task.taskDrill.topics) && task.taskDrill.topics.length >= 2,
    "drill topics should be materialized"
  );
  assert(
    task.deliveryRequirements.localReproductionRequested === true,
    "drill should seed local reproduction requirement"
  );
}

function scenarioDrillListBypassesWorkspaceGuard() {
  const result = spawnSync(process.execPath, [taskDrillScript, "--list"], {
    cwd: repoRoot,
    env: makeEnv(repoRoot),
    encoding: "utf8"
  });
  ensureOk(result, "task-drill(list)");
  assert(result.stdout.includes("packed-dotnet-loader"), "task-drill --list should print published drills");
}

function scenarioUserPauseSemantics() {
  const task = {
    taskId: "pause-semantics",
    phase: "Observe",
    objective: "验证交互解锁标签不自动阻塞",
    deliverableTier: "evidence",
    completionCriteria: [{ text: "route-state 仍可继续", status: "pending" }],
    targetContext: {
      inputTarget: "pause-semantics-sample"
    },
    boundaries: {
      input: {
        inScope: ["静态分析"],
        outOfScope: ["等待用户手动确认前不运行样本"]
      }
    },
    accessRequirements: {
      interactiveUnlockRequired: true
    },
    routeState: {}
  };
  const baseRouteState = defaultRouteStateDocument(task);
  const ready = resolveExecutionState(task, {
    ...baseRouteState,
    execution: {
      ...baseRouteState.execution,
      pauseCategory: "none",
      pauseReason: ""
    }
  });
  assert(
    ready.status === "ready-to-continue",
    "interactiveUnlockRequired metadata alone must not force blocked-on-user"
  );
  assert(
    Array.isArray(baseRouteState.tracks) && baseRouteState.tracks.some((track) => track.title === "C"),
    "default route-state should include Web shell / WebView fingerprint track C"
  );
  assert(
    Array.isArray(baseRouteState.entrypoints) && baseRouteState.entrypoints.some((entrypoint) => entrypoint.id === "EP-002"),
    "default route-state should include Web shell / WebView candidate EP-002"
  );

  const blocked = resolveExecutionState(task, {
    ...baseRouteState,
    execution: {
      ...baseRouteState.execution,
      pauseCategory: "user",
      pauseReason: "等待用户在 IDA 中加载新样本"
    }
  });
  assert(blocked.status === "blocked-on-user", "explicit pauseCategory=user should still block");
}

function scenarioRiskActionAutoPause() {
  const baseTask = {
    taskId: "risk-pause",
    phase: "Observe",
    objective: "验证动态风险动作自动暂停",
    deliverableTier: "evidence",
    completionCriteria: [{ text: "route-state 风险暂停", status: "pending" }],
    targetContext: {
      inputTarget: "risk-sample"
    },
    boundaries: {
      input: {
        inScope: ["静态分析"],
        outOfScope: ["未确认前不注入真实进程"]
      }
    },
    routeState: {}
  };
  const routeState = defaultRouteStateDocument(baseTask);
  routeState.entrypoints = [
    {
      id: "EP-RISK",
      title: "动态注入验证",
      probe: "Frida attach 到真实进程并注入 hook",
      status: "CANDIDATE"
    }
  ];

  const blocked = resolveExecutionState(baseTask, routeState);
  assert(blocked.status === "blocked-on-risk", "dynamic attach/injection action should auto-pause on risk");
  assert(blocked.pauseCategory === "risk", "dynamic risk action should set pauseCategory=risk");

  const allowed = resolveExecutionState(
    {
      ...baseTask,
      boundaries: {
        ...baseTask.boundaries,
        activeTriggerAllowed: true
      }
    },
    routeState
  );
  assert(allowed.status === "ready-to-continue", "explicit activeTriggerAllowed should allow the same action");

  const staticRouteState = defaultRouteStateDocument(baseTask);
  staticRouteState.entrypoints = [
    {
      id: "EP-STATIC",
      title: "只读静态分诊",
      probe: "静态扫描导入表和字符串，确认入口链路",
      status: "CANDIDATE"
    }
  ];
  const ready = resolveExecutionState(baseTask, staticRouteState);
  assert(ready.status === "ready-to-continue", "read-only static action should not be risk-paused");

  const loopbackRouteState = defaultRouteStateDocument(baseTask);
  loopbackRouteState.entrypoints = [
    {
      id: "EP-LOOPBACK",
      title: "本地协议复现",
      probe: "curl http://localhost:8080/replay 做本地协议重放",
      status: "CANDIDATE"
    }
  ];
  const loopbackReady = resolveExecutionState(baseTask, loopbackRouteState);
  assert(loopbackReady.status === "ready-to-continue", "loopback protocol replay should not be risk-paused");
}

function scenarioWorkspaceGuard() {
  let threw = false;
  try {
    assertSafeWorkspaceRoot({
      workspace: repoRoot,
      skillRoot: repoRoot,
      installedSkillRoot: repoRoot,
      commandName: "check-task-behavior"
    });
  } catch (error) {
    threw = String(error?.message || error).includes("workspace root resolves inside the skill directory");
  }
  assert(threw, "workspace guard should reject creating running tasks inside the skill root");
}

function scenarioArchiveSnapshot(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-archive");
  const installedSkillRoot = path.join(tempRoot, "installed-skills", "win-reverse");
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "archive-me");

  fs.mkdirSync(path.join(taskDir, "state"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "run"), { recursive: true });
  fs.mkdirSync(installedSkillRoot, { recursive: true });

  fs.writeFileSync(path.join(installedSkillRoot, "SKILL.md"), "---\nname: win-reverse\n---\n", "utf8");
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify(
      {
        taskId: "archive-me",
        phase: "Port",
        roots: {
          skillRoot: repoRoot,
          workspaceRoot
        },
        routeState: {
          statePath: "state/route-state.json",
          planPath: "state/route-plan.md",
          cluesPath: "state/clues.md",
          progressPath: "state/progress.md"
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  fs.writeFileSync(path.join(taskDir, "report.md"), "# report\n", "utf8");
  fs.writeFileSync(path.join(taskDir, "run", "fixtures.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(taskDir, "state", "route-state.json"), "{}\n", "utf8");
  // P1-9（round1 F-08）：归档排除清单生效——重产物不入快照。
  fs.mkdirSync(path.join(taskDir, "run", "tools"), { recursive: true });
  fs.writeFileSync(path.join(taskDir, "run", "tools", "upx.exe"), "MZ", "utf8");
  fs.writeFileSync(path.join(taskDir, "run", "packed-sample.zip"), "PK", "utf8");
  fs.writeFileSync(path.join(taskDir, "run", "target.clean.bak"), "orig", "utf8");
  fs.writeFileSync(path.join(taskDir, "run", "keep-me.md"), "# keep\n", "utf8");

  const result = archiveTaskSnapshot(taskDir, {
    taskSkillRoot: repoRoot,
    installedSkillRoot
  });
  const archivedTaskDir = path.join(installedSkillRoot, "artifacts", "tasks", "archive-me");
  assert(result.archiveTaskDir === archivedTaskDir, "archiveTaskDir mismatch");
  assert(fs.existsSync(path.join(archivedTaskDir, "task.json")), "archived task.json missing");
  assert(fs.existsSync(path.join(archivedTaskDir, "report.md")), "archived report.md missing");
  assert(
    !fs.existsSync(path.join(archivedTaskDir, "run", "tools", "upx.exe")),
    "archived snapshot must exclude run/tools/**"
  );
  assert(
    !fs.existsSync(path.join(archivedTaskDir, "run", "packed-sample.zip")),
    "archived snapshot must exclude *.zip"
  );
  assert(
    !fs.existsSync(path.join(archivedTaskDir, "run", "target.clean.bak")),
    "archived snapshot must exclude *.bak"
  );
  assert(fs.existsSync(path.join(archivedTaskDir, "run", "keep-me.md")), "non-excluded files must be kept");
  assert(result.excludedCount >= 3, `excludedCount should count excluded entries\n got ${result.excludedCount}`);
}

function scenarioWebShellTechDetection(tempRoot) {
  const root = path.join(tempRoot, "workspace-web-shell");
  const appDir = path.join(root, "TargetApp");
  fs.mkdirSync(path.join(appDir, "resources"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "dist", "assets"), { recursive: true });
  fs.writeFileSync(path.join(appDir, "resources", "app.asar"), "placeholder", "utf8");
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "target-app",
        main: "main.js",
        dependencies: {
          electron: "^30.0.0",
          react: "^19.0.0"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(appDir, "dist", "assets", "index.js"),
    "const root=createRoot(document.getElementById('root')); const x=__webpack_require__;",
    "utf8"
  );

  const result = detectWebShellTech(appDir, {
    maxDepth: 4,
    maxFiles: 2000,
    maxReadBytes: 64 * 1024
  });
  assert(result.summary.looksLikeWebShell === true, "web-shell detector should flag Electron-like app");
  assert(
    result.summary.probableRuntimes.some((item) => item.key === "electron"),
    "web-shell detector should identify electron"
  );
  assert(
    result.summary.probableFrontend.some((item) => item.key === "react"),
    "web-shell detector should identify react"
  );
  assert(
    result.summary.probablePackagers.some((item) => item.key === "webpack"),
    "web-shell detector should identify webpack"
  );
}

function scenarioWebShellTopicAutoAdvance(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-web-shell-topic");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const taskInputPath = path.join(workspaceRoot, "web-shell-topic-input.json");
  writeJson(taskInputPath, {
    target: {
      value: "C:/TargetApp"
    },
    objective: "验证 Web 套壳识别后自动分流到具体后续动作",
    requirements: {
      deliverables: ["web-shell-tech.json"],
      completionCriteria: [
        { text: "web-shell 定性结论与后续动作已落盘", status: "pending" }
      ]
    },
    boundaries: {
      inScope: ["静态资源扫描"],
      outOfScope: ["运行未知样本"]
    }
  });

  const startResult = runNode(
    taskStartScript,
    ["web-shell-auto", "--topic=web-shell-triage", `--task-input=${taskInputPath}`],
    workspaceRoot
  );
  ensureOk(startResult, "task-start(web-shell-triage)");

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "web-shell-auto");
  writeJson(path.join(taskDir, "run", "web-shell-tech.json"), {
    generatedAt: new Date().toISOString(),
    scannedRoot: "C:/TargetApp",
    summary: {
      looksLikeWebShell: true,
      confidence: "high",
      probableRuntimes: [{ key: "electron", score: 11 }],
      probableFrontend: [{ key: "react", score: 6 }],
      probablePackagers: [{ key: "webpack", score: 7 }]
    },
    entryHints: ["resources/app.asar", "package.json", "preload.js"],
    recommendedNextSteps: [
      "优先检查 resources/app.asar、package.json 和 preload.js"
    ],
    matches: []
  });

  const syncResult = runNode(taskSyncScript, ["web-shell-auto"], workspaceRoot);
  ensureOk(syncResult, "task-sync(web-shell-triage)");

  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.webShellTriage.status === "fingerprinted", "webShellTriage.status should be fingerprinted after task-sync");
  assert(
    task.webShellTriage.probableRuntimes.includes("electron"),
    "task-sync should ingest probable runtime"
  );
  assert(
    task.webShellTriage.entryHints.includes("resources/app.asar"),
    "task-sync should ingest entry hints"
  );
  assert(
    task.webShellTriage.downstreamTopics.includes("config-recovery") &&
    task.webShellTriage.downstreamTopics.includes("ui-runtime") &&
    task.webShellTriage.downstreamTopics.includes("tls-network"),
    "web-shell routing should auto-suggest downstream topics for electron-like targets"
  );
  assert(
    task.taskPacks.selectedTopics.includes("config-recovery") &&
    task.taskPacks.selectedTopics.includes("ui-runtime") &&
    task.taskPacks.selectedTopics.includes("tls-network"),
    "task-sync should auto-infer downstream topics from web-shell detection result"
  );
  assert(
    fs.existsSync(path.join(taskDir, "run", "web-shell-next-steps.md")),
    "task-sync should auto-generate run/web-shell-next-steps.md"
  );
  const nextStepsText = fs.readFileSync(path.join(taskDir, "run", "web-shell-next-steps.md"), "utf8");
  assert(
    nextStepsText.includes("contextBridge") && nextStepsText.includes("ipcMain"),
    "electron next-step template should include Electron-specific bridge actions"
  );
  const reportText = fs.readFileSync(path.join(taskDir, "report.md"), "utf8");
  // report-only 改造：框架不再向 report.md 注入「Runtime 专用后续动作模板摘要」节，
  // report.md 完全归 agent 所有；web-shell 结论机器通道 = run/web-shell-tech.json。
  assert(
    !reportText.includes("## Runtime 专用后续动作模板摘要"),
    "task-sync must NOT inject runtime summary sections into report.md"
  );

  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  const ep2 = (routeState.entrypoints || []).find((entrypoint) => entrypoint.id === "EP-002");
  assert(ep2?.status === "SUCCESS", "EP-002 should be marked SUCCESS after meaningful web-shell detection");

  seedExternalResearch(taskDir, "QA 夹具播种：Web 套壳技术路线的公开资料调研已完成（启发式 packer-signal 定级与本场景无关）。");
  const advanceResult = runNode(taskAdvanceScript, ["web-shell-auto", "--json"], workspaceRoot);
  ensureOk(advanceResult, "task-advance(web-shell-triage)");
  const payload = JSON.parse(advanceResult.stdout);
  assert(
    String(payload.execution.nextExecutableAction || "").includes("app.asar"),
    "nextExecutableAction should be tailored from web-shell detection result"
  );
  assert(
    String(payload.execution.nextExecutableAction || "").includes("config-recovery"),
    "nextExecutableAction should include downstream routing hint"
  );
}

function scenarioInvalidTaskIdIsRejected(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-invalid-task-id");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const result = runNode(taskStartScript, ["..\\escaped-task"], workspaceRoot);
  assert(result.status !== 0, "path-like task id should be rejected");
  assert(
    `${result.stdout}\n${result.stderr}`.includes("invalid task id"),
    "invalid task id error should be surfaced"
  );
  assert(!fs.existsSync(path.join(tempRoot, "escaped-task")), "invalid task id must not create a sibling task directory");
}

function scenarioPartialCompletionCriteriaBlocksCloseout(tempRoot) {
  const taskDir = path.join(tempRoot, "workspace-partial-closeout");
  fs.mkdirSync(taskDir, { recursive: true });
  writeJson(path.join(taskDir, "task.json"), {
    taskId: "partial-closeout",
    phase: "Port",
    validation: { status: "passed" },
    routeState: {},
    successCriteria: [{ text: "至少一个成功条件", status: "done" }],
    completionCriteria: [
      { text: "证据 A 已满足", status: "done" },
      { text: "证据 B 仍未满足", status: "pending" }
    ]
  });

  const result = evaluateCloseoutGate(taskDir);
  assert(result.ok === false, "closeout must fail when any completionCriteria entry is pending");
  assert(
    result.errors.some((item) => item.includes("pending indexes=1")),
    "closeout error should identify pending completionCriteria index"
  );
}

function scenarioCompletionCriteriaRequiresEvidenceRefs(tempRoot) {
  const taskDir = path.join(tempRoot, "workspace-evidence-closeout");
  fs.mkdirSync(path.join(taskDir, "run"), { recursive: true });
  writeJson(path.join(taskDir, "task.json"), {
    taskId: "evidence-closeout",
    phase: "Port",
    validation: { status: "passed" },
    routeState: {},
    successCriteria: [{ text: "至少一个成功条件", status: "done" }],
    completionCriteria: [
      { text: "证据 A 已满足", status: "done" }
    ]
  });

  const noEvidence = evaluateCloseoutGate(taskDir);
  assert(noEvidence.ok === false, "hit completionCriteria without evidenceRefs should fail closeout");
  assert(
    noEvidence.errors.some((item) => item.includes("valid evidenceRefs")),
    "closeout should explain missing evidenceRefs"
  );

  fs.writeFileSync(path.join(taskDir, "run", "verify-output.log"), "验证输出: completion criteria A satisfied\n", "utf8");
  const task = readJson(path.join(taskDir, "task.json"));
  task.completionCriteria[0].evidenceRefs = ["run/verify-output.log"];
  writeJson(path.join(taskDir, "task.json"), task);

  const withEvidence = evaluateCloseoutGate(taskDir);
  assert(withEvidence.ok === true, "hit completionCriteria with valid evidenceRefs should pass closeout");
}

function scenarioReferenceOnlyTopicsAreRoutable(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-reference-only-topic");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const taskInputPath = path.join(workspaceRoot, "malware-task-input.json");
  writeJson(taskInputPath, {
    target: {
      value: "authorized-malware-lab-sample"
    },
    objective: "在授权实验室环境中做恶意样本静态分析路线规划",
    requirements: {
      deliverables: ["malware analysis notes"],
      completionCriteria: [
        { text: "恶意样本静态分析路线规划已落盘", status: "pending" }
      ]
    },
    boundaries: {
      inScope: ["静态分析", "IoC 提取"],
      outOfScope: ["运行未知样本", "对真实网络目标联机"]
    }
  });

  assert(getTopicBySpecifier("malware-analysis"), "malware-analysis should be registered as a topic");
  const startResult = runNode(
    taskStartScript,
    ["malware-reference", "--topic=malware-analysis", `--task-input=${taskInputPath}`],
    workspaceRoot
  );
  ensureOk(startResult, "task-start(reference-only-malware)");
  const task = readJson(path.join(workspaceRoot, "artifacts", "tasks", "malware-reference", "task.json"));
  assert(
    task.taskPacks.selectedTopics.includes("malware-analysis"),
    "reference-only topic should be selected without requiring a task model extension"
  );
}

// ---------------------------------------------------------------------------
// closeout fixture 系列（F1-F6）：构建"closeout 前夜"任务夹具，注入特定漂移后
// 直接跑真实 task-close / task-close --dry-run，验证收口链路的行为与无副作用承诺。
// ---------------------------------------------------------------------------

function runNodeWithEnv(scriptPath, args, workspaceRoot, envExtra = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...makeEnv(workspaceRoot), ...envExtra },
    encoding: "utf8"
  });
}

// task-close 真实收口会归档到"已安装同名 SKILL"；把 CODEX_HOME 指到临时目录，
// 让归档落在夹具内，不污染真实仓库与用户目录。
function prepareInstalledSkillRoot(tempRoot) {
  const codexHome = path.join(tempRoot, "codex-home");
  const installedRoot = path.join(codexHome, "skills", "win-reverse");
  fs.mkdirSync(path.join(installedRoot, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(installedRoot, "SKILL.md"), "---\nname: win-reverse\n---\n", "utf8");
  return { codexHome, installedRoot };
}

// 构建一个"可直接收口"的任务：契约齐全、核心阶段门禁产物齐全、完成判据全部命中
// 且证据有效、视图与 route-state 一致。options 支持注入特定失败/漂移形态。
// report-only 改造：收口夹具的「实质 report.md」单源生成器——
// 八节齐全、去空白字符 ≥600（validateReportSubstance 阈值），achieved 必须含
// 任务摘要 / 实现路径 / 验证证据 三节；partial/infeasible 用例额外要求
// 「未竟事项」节正文 ≥200 字符（evaluateInfeasibleGate 同源口径）。
// options.extraTopicLines：「专题发现」节内追加的项目符号行；
// options.extraTopicSections：追加的 {heading, body} 专题小节（### 级标题，置于
// 「未竟事项」之前），供 reportSection 谓词（^#{2,4} 标题匹配）使用。
function buildSubstantiveReportText(taskDir, options = {}) {
  const filler =
    "本小节记录真实逆向结论：目标入口校验链经 IDA 反汇编逐块核对，" +
    "锚点 0x140001000 至 0x140003000 全部落位，判读依据、中间假设与排除过程如下详述。";
  const unfinished =
    options.closeoutMode === "partial" || options.closeoutMode === "infeasible"
      ? "尚未完成：动态运行时验证因环境缺驱动未能执行，已排除的路线包括直接 patch " +
        "校验返回（被二次校验拦截）与纯静态断链（副作用不可控）；根因是缺失签名环境，" +
        "建议下一步在具备驱动的沙箱重试动态路线。" +
        filler
      : "无。";
  const topicLines = ["- 本任务未命中任何专题分流，无专题发现。"];
  for (const line of options.extraTopicLines || []) {
    topicLines.push(line);
  }
  const sections = [
    `# ${path.basename(taskDir)} 收口报告`,
    "",
    "## 任务摘要",
    "",
    `- ${filler}`,
    "",
    "## 实现路径",
    "",
    `- 静态分诊 → 调用链确认 → 验证脚本复核。${filler}`,
    "",
    "## 逆向思路",
    "",
    `- 先锁入口分发，再沿 XREF 下探叶节点比对。${filler}`,
    "",
    "## 任务难点",
    "",
    `- 校验分布在三处叶节点，需逐一确认语义一致性。${filler}`,
    "",
    "## 坑点与经验",
    "",
    `- 二次校验分支易被首处成功路径掩盖，需对照完整调用链复核。${filler}`,
    "",
    "## 验证证据",
    "",
    "- 判据 1：入口校验链路已确认 → run/verify-output.log（验证输出：全部完成判据均已命中）",
    "- 判据 2：验证证据已落盘并可复核 → run/verify-output.log",
    "",
    "## 专题发现",
    "",
    ...topicLines,
    ""
  ];
  for (const section of options.extraTopicSections || []) {
    sections.push(`### ${section.heading}`, "", section.body, "");
  }
  sections.push("## 未竟事项", "", unfinished, "");
  return sections.join("\n");
}

function writeSubstantiveReport(taskDir, options = {}) {
  fs.writeFileSync(
    path.join(taskDir, "report.md"),
    buildSubstantiveReportText(taskDir, options),
    "utf8"
  );
}

// report-only 改造夹具助手：staticTriage.present=true 的验收载体从
// run/static-triage-notes.md 迁移为 report.md 专题小节（reportSection 谓词 +
// minChars=120，见 topics/static-triage/topic.json）；向 report.md「专题发现」节
// 追加一个达标的静态分诊小节。
function appendStaticTriageReportSection(taskDir) {
  fs.appendFileSync(
    path.join(taskDir, "report.md"),
    [
      "",
      "### 静态分诊（static-triage）",
      "",
      "PE triage / imports / resources 结论：入口校验链已确认（0x140001000 -> 0x140002000），",
      "导入表与字符串交叉引用一致，节区布局无异常；kernel32/advapi32 导入面完整，",
      "资源段未发现内嵌载荷迹象；本小节为 QA 夹具实质内容，长度满足 minChars=120 谓词。",
      ""
    ].join("\n"),
    "utf8"
  );
}

function buildCloseoutReadyTask(tempRoot, name, options = {}) {
  const workspaceRoot = path.join(tempRoot, `workspace-${name}`);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const taskInputPath = path.join(workspaceRoot, `${name}-input.json`);
  writeJson(taskInputPath, {
    target: {
      value: `${name}-sample`,
      binaryPath: `samples/${name}-sample.exe`
    },
    objective: `验证 ${name} 的 closeout 行为`,
    requirements: {
      deliverables: ["report.md", "route-state.json"],
      // P1-5（round1 F-06）：夹具显式给两条对象形判据——pendingCriteriaIndexes=[1] 的
      // 用例依赖判据数 ≥2；框架不再从 deliverables 合成伪判据。
      completionCriteria: [
        { text: `成功条件：入口校验链路已确认`, status: "pending" },
        { text: `验证证据已落盘并可通过复核`, status: "pending" }
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
    runNode(taskStartScript, [name, `--task-input=${taskInputPath}`], workspaceRoot),
    `task-start(${name})`
  );

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", name);
  const runDir = path.join(taskDir, "run");

  // report-only 改造：run/investigation.md / plan.md / assumptions.md / fixtures.json
  // 夹具写入已退役（过程文档门禁整体取消）；收口验收夹具改为写实质 report.md。
  if (options.writeReport !== false) {
    writeSubstantiveReport(taskDir, options);
  }
  fs.writeFileSync(path.join(runDir, "verify-output.log"), "验证输出：全部完成判据均已命中。\n", "utf8");

  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.phase = options.phase || "Capture";
  if (options.deliverableTier) {
    task.deliverableTier = options.deliverableTier;
  }
  if (options.deliveryRequirements) {
    task.deliveryRequirements = { ...(task.deliveryRequirements || {}), ...options.deliveryRequirements };
  }
  task.successCriteria = [{ text: "成功条件：入口校验链路已确认", status: "done" }];
  const pendingIndexes = new Set(options.pendingCriteriaIndexes || []);
  task.completionCriteria = (task.completionCriteria || []).map((item, index) => {
    const normalized = typeof item === "object" && item !== null ? { ...item } : { text: String(item) };
    if (pendingIndexes.has(index)) {
      normalized.status = "pending";
      delete normalized.evidenceRefs;
      return normalized;
    }
    normalized.status = "done";
    normalized.evidenceRefs =
      options.invalidEvidence === true ? ["run/missing-evidence.log"] : ["run/verify-output.log"];
    return normalized;
  });
  writeJson(taskJsonPath, task);

  if (typeof options.beforeSync === "function") {
    options.beforeSync(taskDir);
  }

  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  return { workspaceRoot, taskDir };
}

function scenarioWebShellTopicAutoInference(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-web-shell-auto-infer");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const appDir = path.join(workspaceRoot, "TargetAutoApp");
  fs.mkdirSync(path.join(appDir, "resources"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(appDir, "resources", "app.asar"), "placeholder", "utf8");
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({
      name: "auto-app",
      dependencies: {
        electron: "^30.0.0",
        react: "^19.0.0"
      }
    }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(appDir, "TargetAutoApp.exe"), "MZ", "utf8");

  const taskInputPath = path.join(workspaceRoot, "web-shell-task-input.json");
  writeJson(taskInputPath, {
    target: {
      value: "TargetAutoApp",
      binaryPath: path.join(appDir, "TargetAutoApp.exe")
    },
    objective: "验证未显式选 topic 时可自动推断 web-shell-triage",
    requirements: {
      deliverables: ["report.md"],
      completionCriteria: [
        { text: "web-shell 技术指纹结论已落盘并可复核", status: "pending" }
      ]
    },
    boundaries: {
      inScope: ["静态分析"]
    }
  });

  const startResult = runNode(
    taskStartScript,
    ["web-shell-auto-infer", `--task-input=${taskInputPath}`],
    workspaceRoot
  );
  ensureOk(startResult, "task-start(auto-infer-web-shell)");

  const syncResult = runNode(taskSyncScript, ["web-shell-auto-infer"], workspaceRoot);
  ensureOk(syncResult, "task-sync(auto-infer-web-shell)");

  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "web-shell-auto-infer");
  const task = readJson(path.join(taskDir, "task.json"));
  assert(
    task.taskPacks.selectedTopics.includes("web-shell-triage"),
    "task-sync should auto-infer web-shell-triage from target directory signals"
  );
  assert(
    fs.existsSync(path.join(taskDir, "run", "web-shell-tech.json")),
    "task-sync should auto-generate run/web-shell-tech.json when target path strongly matches web-shell app"
  );
  assert(
    fs.existsSync(path.join(taskDir, "run", "web-shell-notes.md")),
    "task-sync should auto-generate run/web-shell-notes.md when target path strongly matches web-shell app"
  );
  assert(
    fs.existsSync(path.join(taskDir, "run", "web-shell-next-steps.md")),
    "auto-inferred web-shell flow should also generate runtime-specific next steps"
  );
  assert(
    task.taskPacks.selectedTopics.includes("config-recovery") &&
    task.taskPacks.selectedTopics.includes("ui-runtime") &&
    task.taskPacks.selectedTopics.includes("tls-network"),
    "auto-inferred web-shell flow should also infer downstream topics"
  );
}

// V2-4-1：writeTaskJson 全量键 diff 打点可见性；同时坐实 Q1 定性——
// sync 不抹手改的 boundaries / target 字段（"被抹掉"是感知错位，真实覆写只有镜像字段）。
function scenarioWriteTaskJsonDiffVisibility(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-write-diff");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const taskInputPath = path.join(workspaceRoot, "write-diff-input.json");
  writeJson(taskInputPath, {
    target: {
      value: "write-diff-sample",
      binaryPath: "samples/write-diff-sample.exe"
    },
    objective: "验证 writeTaskJson diff 打点与手改字段存活",
    requirements: {
      deliverables: ["report.md", "route-state.json"],
      completionCriteria: [
        { text: "契约字段 diff 留痕可复核", status: "pending" }
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
    runNode(taskStartScript, ["write-diff", `--task-input=${taskInputPath}`], workspaceRoot),
    "task-start(write-diff)"
  );
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "write-diff");
  const taskJsonPath = path.join(taskDir, "task.json");

  // Q1 坐实：手改 boundaries / targetContext 后 sync，值必须存活。
  const handEdited = readJson(taskJsonPath);
  handEdited.boundaries.input.inScope.push("手工补充范围项");
  handEdited.targetContext.targetKeywords.push("手工关键词");
  writeJson(taskJsonPath, handEdited);
  ensureOk(runNode(taskSyncScript, ["write-diff"], workspaceRoot), "task-sync(write-diff hand-edit)");
  const persisted = readJson(taskJsonPath);
  assert(
    persisted.boundaries.input.inScope.includes("手工补充范围项"),
    "sync must not erase hand-edited boundaries"
  );
  assert(
    persisted.targetContext.targetKeywords.includes("手工关键词"),
    "sync must not erase hand-edited target fields"
  );

  // 手改镜像字段（sync 会按 route-state 重算覆写）→ diff 输出必须点名该键。
  const drifted = readJson(taskJsonPath);
  drifted.routeState.pauseReason = "手工写入的漂移原因";
  writeJson(taskJsonPath, drifted);
  const syncAfterDrift = runNode(taskSyncScript, ["write-diff"], workspaceRoot);
  ensureOk(syncAfterDrift, "task-sync(write-diff mirror drift)");
  const driftOutput = `${syncAfterDrift.stdout}\n${syncAfterDrift.stderr}`;
  assert(
    driftOutput.includes("[write] task.json changed:"),
    "write diff line should be emitted when a key really changes"
  );
  assert(driftOutput.includes("pauseReason"), "write diff should name the changed mirror field");

  // noop sync → 无 changed 噪音行。
  const noopSync = runNode(taskSyncScript, ["write-diff"], workspaceRoot);
  ensureOk(noopSync, "task-sync(write-diff noop)");
  const noopOutput = `${noopSync.stdout}\n${noopSync.stderr}`;
  assert(!noopOutput.includes("[write] task.json changed:"), "noop sync must not emit changed lines");
}

// ---------------------------------------------------------------------------
// V2-1 棘轮拆除系列：web-shell present 语义 / verdict 人工否决 / routeHit 降级 /
// excludedTopics 摘除 / C15 旧语义续跑。fixture 笔记均为中文自由文本（兼 C16 回归）。
// ---------------------------------------------------------------------------

function writeNoHitWebShellTechResult(taskDir) {
  writeJson(path.join(taskDir, "run", "web-shell-tech.json"), {
    generatedAt: new Date().toISOString(),
    scannedRoot: "samples/native-sample.exe",
    summary: {
      looksLikeWebShell: false,
      confidence: "low",
      probableRuntimes: [],
      probableFrontend: [],
      probablePackagers: []
    },
    entryHints: [],
    recommendedNextSteps: [],
    matches: []
  });
}

// 最小 meaningful fixture：looksLikeWebShell=true 但无任何 runtime/frontend/packager/entryHint 细节。
// 它让 present=true 成立，同时让 keyFindings/downstreamTopics/probable* 义务必然不满足，
// 用于坐实"义务不豁免"（resync 无法自愈这些空字段）。
function writeMinimalMeaningfulWebShellTechResult(taskDir) {
  writeJson(path.join(taskDir, "run", "web-shell-tech.json"), {
    generatedAt: new Date().toISOString(),
    scannedRoot: "C:/TargetApp",
    summary: {
      looksLikeWebShell: true,
      confidence: "medium",
      probableRuntimes: [],
      probableFrontend: [],
      probablePackagers: []
    },
    entryHints: [],
    recommendedNextSteps: [],
    matches: []
  });
}

// V2-1(a)：原生 fixture + 中文笔记含 "html"/"javascript" → web-shell-triage 不进 selectedTopics；
// routeHit（激活 EP-002 使其 boundTopics 命中）只产生 candidate-only 提示行，仍不自动纳入。
function scenarioNativeNotesDoNotRatchetWebShell(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-native-no-ratchet");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const taskInputPath = path.join(workspaceRoot, "native-input.json");
  writeJson(taskInputPath, {
    target: {
      value: "native-no-ratchet-sample",
      binaryPath: "samples/native-no-ratchet-sample.exe"
    },
    objective: "验证原生任务的中文笔记不会把 web-shell-triage 棘轮纳入",
    requirements: {
      deliverables: ["report.md", "route-state.json"],
      completionCriteria: [
        { text: "原生路线结论已落盘且无 web-shell 棘轮误纳", status: "pending" }
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
    runNode(taskStartScript, ["native-no-ratchet", `--task-input=${taskInputPath}`], workspaceRoot),
    "task-start(native-no-ratchet)"
  );
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "native-no-ratchet");

  fs.appendFileSync(
    path.join(taskDir, "state", "clues.md"),
    [
      "",
      "## CLUE-099",
      "",
      "- Source Track: A",
      "- Source Entrypoint: EP-001",
      "- Content: 导入表只见 kernel32 与 user32；字符串表里出现的 html、javascript 字样经核对只是资源段误读，目标是纯原生程序",
      "- Confidence: high",
      ""
    ].join("\n"),
    "utf8"
  );

  const syncResult = runNode(taskSyncScript, ["native-no-ratchet"], workspaceRoot);
  ensureOk(syncResult, "task-sync(native-no-ratchet)");
  const task = readJson(path.join(taskDir, "task.json"));
  assert(
    !task.taskPacks.selectedTopics.includes("web-shell-triage"),
    "html/javascript 中文字样不得把 web-shell-triage 棘轮纳入 selectedTopics"
  );

  // routeHit 独立分支降级：激活 EP-002（其 boundTopics 含 web-shell-triage）后，
  // 仍不得自动纳入，只打印 candidate-only 提示行。
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.activeEntrypoints = ["EP-002"];
  writeJson(routeStatePath, routeState);

  const routeHitSync = runNode(taskSyncScript, ["native-no-ratchet"], workspaceRoot);
  ensureOk(routeHitSync, "task-sync(native-no-ratchet routeHit)");
  const routeHitOutput = `${routeHitSync.stdout}\n${routeHitSync.stderr}`;
  assert(
    routeHitOutput.includes("[topics] candidate-only signals:") && routeHitOutput.includes("web-shell-triage"),
    "routeHit should surface as candidate-only signal for web-shell-triage"
  );
  const afterRouteHit = readJson(path.join(taskDir, "task.json"));
  assert(
    !afterRouteHit.taskPacks.selectedTopics.includes("web-shell-triage"),
    "routeHit must not auto-include web-shell-triage after demotion"
  );
}

// V2-1(b)：verdict=not-web-shell + 无实锤结果文件 → verdict 生效且存活：
// present=false、formalValidation 不报该 topic、closeout warnings 含 [manual-override] 留痕行。
function scenarioWebShellVerdictOverridesNoHit(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "verdict-nohit", {
    beforeSync: (dir) => {
      writeNoHitWebShellTechResult(dir);
      const taskJsonPath = path.join(dir, "task.json");
      const task = readJson(taskJsonPath);
      task.webShellTriage = {
        present: true,
        status: "fingerprinted",
        keyFindings: ["旧语义误报固化的结论"],
        downstreamTopics: ["config-recovery"],
        verdict: "not-web-shell",
        verdictRationale: "人工核对安装目录为纯原生程序，探针命中来自字符串误报"
      };
      writeJson(taskJsonPath, task);
    }
  });

  const closeResult = runNode(taskCloseScript, ["verdict-nohit", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(verdict-nohit)");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("[manual-override] web-shell verdict=not-web-shell"),
    "closeout warnings should carry the manual-override verdict trail"
  );
  assert(
    !output.includes("webShellTriage.present=true but"),
    "formalValidation must not fire web-shell obligations after effective verdict"
  );

  const persisted = readJson(path.join(taskDir, "task.json"));
  assert(persisted.webShellTriage.verdict === "not-web-shell", "verdict should survive sync + close");
  assert(persisted.webShellTriage.present === false, "effective verdict should force present=false");
  assert(
    persisted.webShellTriage.status === "overridden-not-web-shell",
    "effective verdict should set status=overridden-not-web-shell"
  );
  assert(
    (persisted.webShellTriage.keyFindings || []).length === 0 &&
      (persisted.webShellTriage.downstreamTopics || []).length === 0,
    "effective verdict should clear obligation fields"
  );
}

// V2-1(c)：verdict + meaningful 实锤 → verdict 完全无效：义务不豁免且打出「真命中不可豁免」WARNING。
function scenarioWebShellVerdictRejectedOnMeaningfulHit(tempRoot) {
  const { workspaceRoot } = buildCloseoutReadyTask(tempRoot, "verdict-meaningful", {
    beforeSync: (dir) => {
      writeMinimalMeaningfulWebShellTechResult(dir);
      const taskJsonPath = path.join(dir, "task.json");
      const task = readJson(taskJsonPath);
      task.webShellTriage = {
        present: false,
        status: "not-started",
        verdict: "not-web-shell",
        verdictRationale: "尝试否决真命中（QA 夹具）"
      };
      writeJson(taskJsonPath, task);
    }
  });

  const closeResult = runNode(taskCloseScript, ["verdict-meaningful", "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "verdict must not exempt web-shell obligations on a meaningful hit");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(output.includes("真命中不可豁免"), "WARNING should state 真命中不可豁免 with the meaningful hit");
  assert(
    output.includes("webShellTriage.present=true but"),
    "formalValidation obligations should still fire when verdict is rejected"
  );

  const persisted = readJson(path.join(workspaceRoot, "artifacts", "tasks", "verdict-meaningful", "task.json"));
  assert(persisted.webShellTriage.present === true, "meaningful hit should keep present=true despite verdict");
  assert(
    persisted.webShellTriage.status !== "overridden-not-web-shell",
    "rejected verdict must not set the overridden status"
  );
}

// ---------------------------------------------------------------------------
// V3-2 夹具：真实可扫描的 Electron 形态目录（resources/app.asar + electron/react
// package.json + webpack 入口），detectWebShellTech 现场重扫必然 meaningful 命中。
// ---------------------------------------------------------------------------

function writeElectronAppFixture(appDir) {
  fs.mkdirSync(path.join(appDir, "resources"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "dist", "assets"), { recursive: true });
  fs.writeFileSync(path.join(appDir, "resources", "app.asar"), "placeholder", "utf8");
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "target-app",
        main: "main.js",
        dependencies: { electron: "^30.0.0", react: "^19.0.0" }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(appDir, "dist", "assets", "index.js"),
    "const root=createRoot(document.getElementById('root')); const x=__webpack_require__;",
    "utf8"
  );
}

function startBasicTask(tempRoot, name) {
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
      // P1-5（round1 F-06）：显式对象形判据（框架不再从 deliverables 合成）
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
  ensureOk(runNode(taskStartScript, [name, `--task-input=${taskInputPath}`], workspaceRoot), `task-start(${name})`);
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", name);
  return { workspaceRoot, taskDir };
}

function declareVerdictTargeting(taskDir, targetPath) {
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.targetContext ||= {};
  task.targetContext.targetBinaryPath = String(targetPath).replaceAll("\\", "/");
  task.webShellTriage = {
    present: false,
    status: "not-started",
    verdict: "not-web-shell",
    verdictRationale: "QA 夹具：人工否决声明（攻击面模拟）"
  };
  writeJson(taskJsonPath, task);
}

// V3-2/Q1（对抗 delete-then-verdict）：meaningful 结果文件被删 + verdict 声明 →
// sync 无条件现场重扫真命中、结果文件重新固化、present=true 义务保留、WARNING 真命中不可豁免。
function scenarioVerdictDeleteThenRescanRestoresHit(tempRoot) {
  const name = "verdict-delete-rescan";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const appDir = path.join(workspaceRoot, "TargetApp");
  writeElectronAppFixture(appDir);

  // 攻击前状态：指向 fixture 后首轮 sync 现场扫描固化 meaningful 结果
  declareVerdictTargeting(taskDir, appDir);
  let task = readJson(path.join(taskDir, "task.json"));
  delete task.webShellTriage;
  writeJson(path.join(taskDir, "task.json"), task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name} pre-attack)`);
  const resultPath = path.join(taskDir, "run", "web-shell-tech.json");
  assert(fs.existsSync(resultPath), "pre-attack sync should persist the meaningful scan result");

  // 攻击：删结果文件 + 声明 verdict
  fs.rmSync(resultPath);
  declareVerdictTargeting(taskDir, appDir);

  const syncResult = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(syncResult, `task-sync(${name} delete-then-verdict)`);
  const output = `${syncResult.stdout}\n${syncResult.stderr}`;
  assert(output.includes("真命中不可豁免"), "delete-then-verdict should print the 真命中不可豁免 WARNING after rescan");
  assert(fs.existsSync(resultPath), "rescan must re-persist the meaningful result file (delete attack neutralized)");
  task = readJson(path.join(taskDir, "task.json"));
  assert(task.webShellTriage.present === true, "rescan hit should keep present=true despite the verdict");
  assert(
    task.webShellTriage.status === "fingerprinted",
    "rescan hit should restore fingerprinted status, not the overridden status"
  );
  assert(
    (task.webShellTriage.keyFindings || []).length > 0 && (task.webShellTriage.downstreamTopics || []).length > 0,
    "rescan hit should repopulate the obligation fields (义务保留)"
  );
}

// V3-2/Q1b（对抗 forge-no-hit-verdict）：手写非模板 no-hit 结果文件 + verdict 声明 →
// sync 无视伪造 existing，现场重扫真命中并覆盖伪造文件，present=true 义务保留。
function scenarioVerdictForgedNoHitRescanRestoresHit(tempRoot) {
  const name = "verdict-forge-rescan";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const appDir = path.join(workspaceRoot, "TargetApp");
  writeElectronAppFixture(appDir);

  // 攻击：伪造非模板 no-hit 结果文件 + 声明 verdict
  declareVerdictTargeting(taskDir, appDir);
  writeNoHitWebShellTechResult(taskDir);

  const syncResult = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(syncResult, `task-sync(${name} forge-no-hit-verdict)`);
  const output = `${syncResult.stdout}\n${syncResult.stderr}`;
  assert(output.includes("真命中不可豁免"), "forge-no-hit-verdict should print the 真命中不可豁免 WARNING after rescan");
  const persisted = readJson(path.join(taskDir, "run", "web-shell-tech.json"));
  assert(
    persisted.summary?.looksLikeWebShell === true,
    "rescan must overwrite the forged no-hit file with the real meaningful result"
  );
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.webShellTriage.present === true, "rescan hit should keep present=true despite the forged no-hit file");
  assert(
    (task.webShellTriage.probableRuntimes || []).includes("electron"),
    "rescan should ingest the real electron runtime signal"
  );
}

// V3-2/Q11（误伤对照）：verdict + 结果文件缺失 + 无本地候选路径 → 短路行为不变：
// present=false、status=overridden-not-web-shell、不固化任何结果文件。
// 候选清单来自 agent 可写 targetContext，本场景锁定的是短路语义而非防护有效性，残余见 acceptance-criteria 注记 (a)。
function scenarioVerdictNoCandidatesKeepsShortCircuit(tempRoot) {
  const name = "verdict-no-candidates";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);

  // 默认 binaryPath 指向不存在的 samples/ 路径 → 无本地候选；不创建结果文件
  declareVerdictTargeting(taskDir, path.join(workspaceRoot, "samples", `${name}-sample.exe`));

  const syncResult = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(syncResult, `task-sync(${name})`);
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.webShellTriage.present === false, "verdict without candidates should keep present=false");
  assert(
    task.webShellTriage.status === "overridden-not-web-shell",
    "verdict without candidates should keep the overridden-not-web-shell short-circuit"
  );
  assert(
    !fs.existsSync(path.join(taskDir, "run", "web-shell-tech.json")),
    "short-circuit must not persist any scan result file"
  );
}

// V2-1(d)：excludedTopics 摘除 present=true 的 topic → closeout 不再要求其产物，warnings 含留痕行。
// 夹具与 (c) 同款（web-shell 义务必然不满足），摘除后 close 必须转绿，形成对照。
// 注意：meaningful fixture 会按设计级联纳入 static-triage，这里把 static-triage 义务做成已满足，
// 让 close 的唯一失败源就是被摘除的 web-shell-triage。
// R3-O1 注记：topic 产物模板不再预物化，static-triage 的第二个必备产物 import-surface.md
// 须由夹具自写实质内容（此前依赖脚手架拷入的占位副本满足存在性检查）。
function scenarioExcludedTopicsBypassFormalValidation(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "excluded-topic", {
    beforeSync: (dir) => {
      writeMinimalMeaningfulWebShellTechResult(dir);
      fs.writeFileSync(
        path.join(dir, "run", "static-triage-notes.md"),
        "# 静态分诊笔记\n\n入口校验链已确认：0x140001000 -> 0x140002000，导入面与字符串交叉引用一致，QA 夹具实质内容。\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(dir, "run", "import-surface.md"),
        "# 导入面\n\n导入表与字符串交叉引用一致，QA 夹具实质内容。\n",
        "utf8"
      );
      const taskJsonPath = path.join(dir, "task.json");
      const task = readJson(taskJsonPath);
      task.staticTriage = {
        present: true,
        status: "triaged",
        keyFindings: ["QA 夹具：静态分诊已完成，入口校验链已确认"],
        blockers: [],
        notes: [],
        artifacts: ["run/static-triage-notes.md", "run/import-surface.md"]
      };
      task.taskPacks ||= {};
      task.taskPacks.excludedTopics = ["web-shell-triage"];
      writeJson(taskJsonPath, task);
      appendStaticTriageReportSection(dir);
    }
  });

  const closeResult = runNode(taskCloseScript, ["excluded-topic", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(excluded-topic)");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("[manual-override] topics excluded: web-shell-triage"),
    "closeout warnings should carry the excluded-topics trail"
  );
  assert(
    !output.includes("webShellTriage.present=true but"),
    "excluded topic must not trigger formalValidation even when presentPath is true"
  );

  const persisted = readJson(path.join(taskDir, "task.json"));
  assert(
    !persisted.taskPacks.selectedTopics.includes("web-shell-triage"),
    "excluded topic should be filtered out of selectedTopics"
  );
  assert(
    (persisted.taskPacks.excludedTopics || []).includes("web-shell-triage"),
    "excludedTopics declaration should persist"
  );
}

// V3-3/Q2（对抗）：tier="banana-tier" 非法值 → close --dry-run exit=1 且 error 含五枚举。
function scenarioInvalidDeliverableTierRejected(tempRoot) {
  const { workspaceRoot } = buildCloseoutReadyTask(tempRoot, "banana-tier", { deliverableTier: "banana-tier" });

  const closeResult = runNode(taskCloseScript, ["banana-tier", "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "invalid deliverableTier must fail close --dry-run");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(output.includes('deliverableTier="banana-tier" is not a valid tier'), "enum guard should name the invalid tier");
  for (const tier of ["evidence", "hook-script", "patch", "protocol-doc", "pure-algorithm"]) {
    assert(output.includes(tier), `enum error should list the valid tier ${tier}`);
  }
  assert(output.includes("不享受任何豁免"), "enum error should state that invalid tiers get no exemptions");
}

// V3-3/Q3（对抗）：tier 中途 patch→evidence 翻转 → evidence 豁免 run-local 生效放行 +
// contract-change-log 变更行 + closeout warnings [manual-override] 双留痕。
function scenarioDeliverableTierFlipLeavesTrail(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "tier-flip", {
    phase: "Rebuild",
    deliverableTier: "patch"
  });

  // 中途翻转：patch -> evidence（evidence 在 Rebuild 豁免 run-local 占位要求，V2-9）
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "evidence";
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, ["tier-flip"], workspaceRoot), "task-sync(tier-flip) should record the drift");

  const logText = fs.readFileSync(path.join(taskDir, "run", "contract-change-log.md"), "utf8");
  assert(
    logText.includes('deliverableTier changed: "patch" -> "evidence"'),
    "contract-change-log should carry the deliverableTier changed line"
  );

  const closeResult = runNode(taskCloseScript, ["tier-flip", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(tier-flip): evidence exemption should take effect");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("[manual-override] contract field changed: deliverableTier"),
    "closeout warnings should surface the deliverableTier drift trail"
  );
  assert(
    !output.includes("run-local.mjs is still the template placeholder"),
    "evidence tier must stay exempt from the run-local placeholder guard"
  );
}

// V3-5/Q3'（对抗，Q3 直 close 变体）：tier 中途 patch→evidence 翻转但跳过 sync 直 close --dry-run。
// close 咽喉必须自行完成 drift 检测：contract-change-log changed 行 + [manual-override] 双留痕不缺席。
// 子案 B（删日志变体，锁 C1 残余窗口）：篡改后删除 run/contract-change-log.md 再直 close——
// baseline 首观测不可验证，close 侧必须把「静默」降级为必有 first-sight WARNING（已知残余而非隐身通道）。
function scenarioDeliverableTierFlipDirectCloseLeavesTrail(tempRoot) {
  // 子案 A：flip 后跳过 sync 直 close
  const direct = buildCloseoutReadyTask(tempRoot, "tier-flip-direct-close", {
    phase: "Rebuild",
    deliverableTier: "patch"
  });

  const directTaskJsonPath = path.join(direct.taskDir, "task.json");
  const directTask = readJson(directTaskJsonPath);
  directTask.deliverableTier = "evidence";
  writeJson(directTaskJsonPath, directTask);

  const directClose = runNode(taskCloseScript, ["tier-flip-direct-close", "--dry-run"], direct.workspaceRoot);
  ensureOk(directClose, "task-close --dry-run(tier-flip-direct-close): evidence exemption should take effect");
  const directOutput = `${directClose.stdout}\n${directClose.stderr}`;
  const directLog = fs.readFileSync(path.join(direct.taskDir, "run", "contract-change-log.md"), "utf8");
  assert(
    directLog.includes('deliverableTier changed: "patch" -> "evidence"'),
    "direct close should record the deliverableTier drift into contract-change-log (close 咽喉 drift 检测)"
  );
  assert(
    directOutput.includes("[manual-override] contract field changed: deliverableTier"),
    "closeout warnings should surface the deliverableTier drift trail on direct close"
  );

  // 子案 B：flip 后删除 contract-change-log.md 再直 close
  const deleted = buildCloseoutReadyTask(tempRoot, "tier-flip-deleted-log", {
    phase: "Rebuild",
    deliverableTier: "patch"
  });

  const deletedTaskJsonPath = path.join(deleted.taskDir, "task.json");
  const deletedTask = readJson(deletedTaskJsonPath);
  deletedTask.deliverableTier = "evidence";
  writeJson(deletedTaskJsonPath, deletedTask);
  fs.rmSync(path.join(deleted.taskDir, "run", "contract-change-log.md"));

  const deletedClose = runNode(taskCloseScript, ["tier-flip-deleted-log", "--dry-run"], deleted.workspaceRoot);
  ensureOk(deletedClose, "task-close --dry-run(tier-flip-deleted-log): evidence exemption should take effect");
  const deletedOutput = `${deletedClose.stdout}\n${deletedClose.stderr}`;
  assert(
    deletedOutput.includes("[manual-override] contract baseline first observed at close: deliverableTier"),
    "deleted-log direct close should emit the first-sight WARNING instead of staying silent"
  );
}

// V3-4/Q4（对抗，修正版）：先播种真 topic（web-shell-triage 级联 static-triage）再全摘——
// 摘光后单轮 sync 即稳定 selected=[]、mode=core-only，框架自产「自动分流」行不得回流再播种（W5）。
// error 文案指向 verdict 通道（W4），不再误导「修正 taskPacks.mode=core-only」。
function scenarioExcludeAllTopicsFailsClosed(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "exclude-all", {
    beforeSync: (dir) => {
      writeMinimalMeaningfulWebShellTechResult(dir);
      fs.writeFileSync(
        path.join(dir, "run", "static-triage-notes.md"),
        "# 静态分诊笔记\n\n入口校验链已确认：0x140001000 -> 0x140002000，导入面与字符串交叉引用一致，QA 夹具实质内容。\n",
        "utf8"
      );
      const seedTaskJsonPath = path.join(dir, "task.json");
      const seedTask = readJson(seedTaskJsonPath);
      seedTask.staticTriage = {
        present: true,
        status: "triaged",
        keyFindings: ["QA 夹具：静态分诊已完成，入口校验链已确认"],
        blockers: [],
        notes: [],
        artifacts: ["run/static-triage-notes.md"]
      };
      writeJson(seedTaskJsonPath, seedTask);
    }
  });

  const taskJsonPath = path.join(taskDir, "task.json");
  const seeded = readJson(taskJsonPath);
  assert(
    (seeded.taskPacks.selectedTopics || []).length > 0,
    "fixture sanity: 播种后 selectedTopics 必须非空（web-shell-triage 级联 static-triage）"
  );

  // 摘光：以 sync 后读回的 selectedTopics 全集为准（不写死两元素，含级联）
  seeded.taskPacks ||= {};
  seeded.taskPacks.excludedTopics = [...seeded.taskPacks.selectedTopics];
  writeJson(taskJsonPath, seeded);
  ensureOk(runNode(taskSyncScript, ["exclude-all"], workspaceRoot), "task-sync(exclude-all) should settle core-only mode");

  const persisted = readJson(taskJsonPath);
  assert(persisted.taskPacks.mode === "core-only", "全摘 should force taskPacks.mode=core-only");
  assert(
    (persisted.taskPacks.selectedTopics || []).length === 0,
    "fixture sanity: 全摘 requires selectedTopics empty（框架自产行不得再播种）"
  );

  const closeResult = runNode(taskCloseScript, ["exclude-all", "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "全摘 excludedTopics must fail close --dry-run");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("excludedTopics 摘除了全部已分流 topic"),
    "close should report the 全摘 error"
  );
  assert(
    output.includes("webShellTriage.verdict 通道声明非 Web 套壳"),
    "全摘 error should point at the verdict channel"
  );
  assert(
    !output.includes("修正 taskPacks.mode=core-only"),
    "全摘 error must not keep the misleading core-only fix hint（sync 早已置 core-only，照做零效果）"
  );
}

// report-only 改造：原 scenarioCallChainTitleGateWarnsNotErrors 删除——
// core 三件套文档门禁（investigation.md 调用链标题检查）已退役，无行为可锁。

// P0-4（round1 F-04）用例 3：复刻 acceptance-criteria (j) 场景——
// winhttp/schannel 证据与一句【无标记】自然中文"下一步自动分流到对应专题"同行时，
// 该行不再被语料过滤误杀，selectedTopics 保持含 tls-network 不翻空。
function scenarioAutoRouteMarkerNarrowing(tempRoot) {
  const name = "auto-route-marker";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  fs.writeFileSync(
    path.join(taskDir, "report.md"),
    [
      "# 调查报告",
      "",
      "## 当前阶段",
      "",
      "- Observe",
      "",
      "## 下一步",
      "",
      "- 继续网络栈取证",
      "",
      "## 自动续跑决策",
      "",
      "- 继续",
      "",
      "## 发现",
      "",
      "- 抓包确认 winhttp 与 schannel 完成 TLS 握手协商，下一步自动分流到对应专题",
      ""
    ].join("\n"),
    "utf8"
  );
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const task = readJson(path.join(taskDir, "task.json"));
  assert(
    (task.taskPacks?.selectedTopics || []).includes("tls-network"),
    `自然语言复述"自动分流"（无标记）不得使证据行陪葬：selectedTopics 应含 tls-network\ngot: ${JSON.stringify(task.taskPacks?.selectedTopics)}`
  );
}

// V3-5/Q13（W6 行为锁）：excludedTopics 纯顺序变化（同集不同序）不得追加伪 changed 留痕——
// 比对前必须排序归一，否则逐字节比对把无意义重排放大成 contract-change-log 噪音。
function scenarioExcludedTopicsReorderLeavesNoChangedTrail(tempRoot) {
  const name = "exclude-reorder";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const logPath = path.join(taskDir, "run", "contract-change-log.md");
  const taskJsonPath = path.join(taskDir, "task.json");

  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name} baseline)`);

  const task = readJson(taskJsonPath);
  task.taskPacks ||= {};
  task.taskPacks.excludedTopics = ["static-triage", "web-shell-triage"];
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name} excluded-set)`);
  const logAfterSet = fs.readFileSync(logPath, "utf8");

  const reordered = readJson(taskJsonPath);
  reordered.taskPacks.excludedTopics = ["web-shell-triage", "static-triage"];
  writeJson(taskJsonPath, reordered);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name} reordered)`);
  const logAfterReorder = fs.readFileSync(logPath, "utf8");

  assert(
    logAfterReorder === logAfterSet,
    "纯顺序变化的 excludedTopics must not append a pseudo changed line to contract-change-log"
  );
}

// V3-5/Q14（W10 行为锁）：task-probe 必须探测宿主机 r2 CLI 并落盘
// env-capability.json 的 fallbackLadder.r2Cli（取值环境无关，heuristic 不阻断）。
function scenarioEnvProbeReportsR2CliFallback(tempRoot) {
  const name = "probe-r2cli";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);

  ensureOk(runNode(taskProbeScript, [name], workspaceRoot), `task-probe(${name})`);

  const capability = readJson(path.join(taskDir, "run", "env-capability.json"));
  assert(
    capability.fallbackLadder && typeof capability.fallbackLadder === "object",
    "env-capability.json should carry the fallbackLadder object"
  );
  assert(
    ["available", "missing"].includes(capability.fallbackLadder.r2Cli),
    'fallbackLadder.r2Cli should be one of "available"/"missing"（环境无关断言）'
  );
}

// V3-5/Q15（W2 forge 对抗，直 close 变体）：伪造非模板 no-hit 结果文件 + verdict 声明，
// 跳过 sync 直 close --dry-run。无 core 契约产物必挂 verify-once（exit≠0 为预期）；
// 断言对象为 verify-once 之前的副作用：close 咽喉有界重扫覆写伪造文件、present=true 义务保留、
// 输出含真命中 WARNING。
function scenarioVerdictForgedNoHitDirectCloseRescans(tempRoot) {
  const name = "verdict-forge-direct-close";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const appDir = path.join(workspaceRoot, "TargetApp");
  writeElectronAppFixture(appDir);

  writeNoHitWebShellTechResult(taskDir);
  declareVerdictTargeting(taskDir, appDir);

  const closeResult = runNode(taskCloseScript, [name, "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "无 core 契约产物的直 close 必挂 verify-once（断言对象为其前副作用）");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;

  const rescanned = readJson(path.join(taskDir, "run", "web-shell-tech.json"));
  assert(
    rescanned.summary?.looksLikeWebShell === true,
    "close 咽喉 rescan should overwrite the forged no-hit file with the real hit"
  );
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.webShellTriage.present === true, "rescan hit should keep present=true despite the forged no-hit file");
  assert(
    (task.webShellTriage.downstreamTopics || []).length > 0,
    "rescan hit should repopulate the obligation fields（义务保留）"
  );
  assert(output.includes("真命中不可豁免"), "direct close should print the 真命中不可豁免 WARNING after rescan");
}

// V3-5/Q16（H2 行为锁）：无 run/web-shell-tech.json + 真实本地候选路径 + 直 close --dry-run
// （无 verdict、不经过 sync）→ close 咽喉的有界重扫必须实际发生并固化 meaningful 结果文件。
function scenarioDirectCloseWithoutResultFileRescans(tempRoot) {
  const name = "direct-close-rescan";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const appDir = path.join(workspaceRoot, "TargetApp");
  writeElectronAppFixture(appDir);

  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.targetContext ||= {};
  task.targetContext.targetBinaryPath = String(appDir).replaceAll("\\", "/");
  writeJson(taskJsonPath, task);

  const resultPath = path.join(taskDir, "run", "web-shell-tech.json");
  assert(!fs.existsSync(resultPath), "fixture sanity: no scan result file before direct close");

  const closeResult = runNode(taskCloseScript, [name, "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "无 core 契约产物的直 close 必挂 verify-once（断言对象为其前副作用）");
  assert(fs.existsSync(resultPath), "close 咽喉 rescan should persist the scan result file");
  const rescanned = readJson(resultPath);
  assert(
    rescanned.summary?.looksLikeWebShell === true,
    "rescan should capture the real electron fixture hit"
  );
}

// V3-4/Q12（误伤对照）：单 topic 摘除（selectedTopics 非空）→ 不误伤放行，
// 既有 [manual-override] topics excluded WARNING 保留，全摘 error 不触发，mode 不变。
// R3-O1 注记：topic 产物模板不再预物化，import-surface.md 由夹具自写实质内容。
function scenarioExcludeSingleTopicStillPasses(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "exclude-single", {
    beforeSync: (dir) => {
      writeMinimalMeaningfulWebShellTechResult(dir);
      fs.writeFileSync(
        path.join(dir, "run", "static-triage-notes.md"),
        "# 静态分诊笔记\n\n入口校验链已确认：0x140001000 -> 0x140002000，导入面与字符串交叉引用一致，QA 夹具实质内容。\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(dir, "run", "import-surface.md"),
        "# 导入面\n\n导入表与字符串交叉引用一致，QA 夹具实质内容。\n",
        "utf8"
      );
      const taskJsonPath = path.join(dir, "task.json");
      const task = readJson(taskJsonPath);
      task.staticTriage = {
        present: true,
        status: "triaged",
        keyFindings: ["QA 夹具：静态分诊已完成，入口校验链已确认"],
        blockers: [],
        notes: [],
        artifacts: ["run/static-triage-notes.md", "run/import-surface.md"]
      };
      task.taskPacks ||= {};
      task.taskPacks.excludedTopics = ["web-shell-triage"];
      writeJson(taskJsonPath, task);
      appendStaticTriageReportSection(dir);
    }
  });

  const closeResult = runNode(taskCloseScript, ["exclude-single", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(exclude-single): single exclusion must not be blocked");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("[manual-override] topics excluded: web-shell-triage"),
    "single exclusion should keep the existing [manual-override] WARNING"
  );
  assert(
    !output.includes("excludedTopics 摘除了全部已分流 topic"),
    "single exclusion must not trigger the 全摘 error"
  );
  const persisted = readJson(path.join(taskDir, "task.json"));
  assert(
    persisted.taskPacks.mode === "selected-topic-packs",
    "single exclusion should keep mode=selected-topic-packs"
  );
}

// C15：旧语义存档任务续跑——present=true + scanned-no-hit + 已固化义务字段 + no-hit 结果文件。
// 新语义下 sync 必须治愈：present 翻 false、义务字段清空、closeout 不再报该 topic。
function scenarioLegacyRatchetTaskHealsOnResume(tempRoot) {
  const { workspaceRoot, taskDir } = buildCloseoutReadyTask(tempRoot, "legacy-ratchet", {
    beforeSync: (dir) => {
      writeNoHitWebShellTechResult(dir);
      const taskJsonPath = path.join(dir, "task.json");
      const task = readJson(taskJsonPath);
      task.webShellTriage = {
        present: true,
        status: "scanned-no-hit",
        keyFindings: ["目录与二进制尚未发现高置信 Web 套壳证据"],
        probableRuntimes: [],
        probableFrontend: [],
        probablePackagers: [],
        entryHints: [],
        downstreamTopics: ["config-recovery"],
        artifacts: ["run/web-shell-notes.md", "run/web-shell-tech.json"]
      };
      writeJson(taskJsonPath, task);
    }
  });

  const closeResult = runNode(taskCloseScript, ["legacy-ratchet", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(legacy-ratchet)");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    !output.includes("webShellTriage.present=true but"),
    "healed legacy task must not trigger web-shell obligations"
  );

  const persisted = readJson(path.join(taskDir, "task.json"));
  assert(persisted.webShellTriage.present === false, "no-hit result should flip present to false on resume");
  assert(persisted.webShellTriage.status === "scanned-no-hit", "status should stay scanned-no-hit");
  assert(
    (persisted.webShellTriage.keyFindings || []).length === 0 &&
      (persisted.webShellTriage.downstreamTopics || []).length === 0,
    "resume should clear ratcheted obligation fields"
  );
}

// report-only 改造：原 autoFix「本地复现交付」节注入/保留行为已退役（autoFix 只剩
// ensureReportExists），改写为 localRepro 交付门禁的行为锁——
// 用例 1：agent 手写「## 本地复现交付」节（含算法实现/调用示例/运行命令/输出摘要四行）
// + run/pure-*.js + 非模板 run/run-local.mjs → close --dry-run 通过 localRepro 门禁；
// 用例 2：缺本地复现交付节 → close --dry-run 报 local-repro 缺节 error。
function scenarioLocalReproDeliveryGate(tempRoot) {
  const seeded = buildCloseoutReadyTask(tempRoot, "localrepro-happy", {
    deliveryRequirements: { localReproductionRequested: true }
  });
  fs.writeFileSync(
    path.join(seeded.taskDir, "run", "pure-license-check.js"),
    "// QA 夹具：纯算法本地复现实现\nmodule.exports = (input) => input === 'sample';\n",
    "utf8"
  );
  const runLocalPath = path.join(seeded.taskDir, "run", "run-local.mjs");
  fs.appendFileSync(runLocalPath, "\n// QA 夹具实现：algo 分支调用 pure-license-check.js\n", "utf8");
  fs.appendFileSync(
    path.join(seeded.taskDir, "report.md"),
    [
      "",
      "## 本地复现交付",
      "",
      "- 本地算法实现: run/pure-license-check.js",
      "- 调用示例: run/run-local.mjs --mode=algo",
      "- 运行命令: node run/run-local.mjs --mode=algo --input sample",
      "- 输出 / 响应摘要: verified=true（QA 夹具）",
      ""
    ].join("\n"),
    "utf8"
  );
  const happy = runNode(taskCloseScript, ["localrepro-happy", "--dry-run"], seeded.workspaceRoot);
  ensureOk(happy, "task-close --dry-run(localrepro-happy)");
  assert(
    happy.stdout.includes("verify-once: passed"),
    "localRepro 交付齐备时 close --dry-run 应通过 formal validation"
  );

  const missing = buildCloseoutReadyTask(tempRoot, "localrepro-missing", {
    deliveryRequirements: { localReproductionRequested: true }
  });
  const missingResult = runNode(taskCloseScript, ["localrepro-missing", "--dry-run"], missing.workspaceRoot);
  assert(missingResult.status !== 0, "localRepro 缺节时 close --dry-run 必须失败");
  assert(
    `${missingResult.stdout}\n${missingResult.stderr}`.includes("本地复现交付 / Local Reproduction Deliverables section"),
    "缺「本地复现交付」节必须报 local-repro error"
  );
}

// O4：① entrypoint status "SKIP" 归一化为 SKIPPED（含 N/A 等别名），不被静默重置为 CANDIDATE。
function scenarioEntrypointStatusSkipNormalizesToSkipped(tempRoot) {
  const name = "ep-status-skip";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.entrypoints[0].status = "SKIP";
  routeState.entrypoints[1].status = "N/A";
  writeJson(routeStatePath, routeState);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const next = readJson(routeStatePath);
  assert(next.entrypoints[0].status === "SKIPPED", `SKIP must normalize to SKIPPED, got ${next.entrypoints[0].status}`);
  assert(next.entrypoints[1].status === "SKIPPED", `N/A must normalize to SKIPPED, got ${next.entrypoints[1].status}`);
}

// O4：② 未知 status 回落 CANDIDATE 前 stderr 告警且含完整合法词表。
function scenarioEntrypointStatusUnknownWarnsWithVocabulary(tempRoot) {
  const name = "ep-status-bogus";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.entrypoints[0].status = "BogusStatus";
  writeJson(routeStatePath, routeState);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  const stderr = result.stderr || "";
  for (const status of ["CANDIDATE", "PROBING", "EXPANDED", "PARKED", "EXHAUSTED", "SKIPPED", "SUCCESS"]) {
    assert(stderr.includes(status), `unknown-status warning must list legal value ${status}\nstderr:\n${stderr}`);
  }
  const next = readJson(routeStatePath);
  assert(next.entrypoints[0].status === "CANDIDATE", `unknown status must fall back to CANDIDATE, got ${next.entrypoints[0].status}`);
}

// O4：③ 全部 entrypoint 为 SKIPPED/EXHAUSTED 时 allEntrypointsExhausted 分支可触发（needs-retrospective）。
function scenarioAllEntrypointsSkippedTriggersExhaustedBranch(tempRoot) {
  const name = "ep-all-skipped";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.entrypoints = routeState.entrypoints.map((entrypoint, index) => ({
    ...entrypoint,
    status: index === 0 ? "EXHAUSTED" : "SKIPPED"
  }));
  routeState.activeEntrypoints = [];
  writeJson(routeStatePath, routeState);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const next = readJson(routeStatePath);
  assert(
    next.execution.status === "needs-retrospective",
    `all SKIPPED/EXHAUSTED without retrospective must yield needs-retrospective, got ${next.execution.status}`
  );
}

// O11：① webShellTriage.status=scanned-no-hit → EP-002 置 EXHAUSTED 且不再被选为下一步。
function scenarioEp002ExhaustedAfterScannedNoHit(tempRoot) {
  const name = "ep002-scanned-no-hit";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.webShellTriage = { present: false, status: "scanned-no-hit" };
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskAdvanceScript, [name], workspaceRoot), `task-advance(${name})`);
  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  const ep002 = routeState.entrypoints.find((entrypoint) => (entrypoint.boundTopics || []).includes("web-shell-triage"));
  assert(ep002, "fixture must contain a web-shell-triage entrypoint (EP-002)");
  assert(ep002.status === "EXHAUSTED", `scanned-no-hit must flip EP-002 to EXHAUSTED, got ${ep002.status}`);
  assert(
    routeState.execution.nextEntrypointId !== ep002.id,
    "nextEntrypointId must not stay on the exhausted EP-002"
  );
}

// O11：② verdict=not-web-shell（生效，present!==true）→ EP-002 同样置 EXHAUSTED。
function scenarioEp002ExhaustedAfterVerdictNotWebShell(tempRoot) {
  const name = "ep002-verdict-not-web-shell";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.webShellTriage = { present: false, status: "not-started", verdict: "not-web-shell" };
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskAdvanceScript, [name], workspaceRoot), `task-advance(${name})`);
  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  const ep002 = routeState.entrypoints.find((entrypoint) => (entrypoint.boundTopics || []).includes("web-shell-triage"));
  assert(ep002 && ep002.status === "EXHAUSTED", `effective not-web-shell verdict must flip EP-002 to EXHAUSTED, got ${ep002?.status}`);
}

// O11：③ 未扫描任务 EP-002 保持 CANDIDATE（默认探针行为不变）。
function scenarioEp002StaysCandidateWhenUnscanned(tempRoot) {
  const name = "ep002-unscanned";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskAdvanceScript, [name], workspaceRoot), `task-advance(${name})`);
  const routeState = readJson(path.join(taskDir, "state", "route-state.json"));
  const ep002 = routeState.entrypoints.find((entrypoint) => (entrypoint.boundTopics || []).includes("web-shell-triage"));
  assert(ep002 && ep002.status === "CANDIDATE", `unscanned task must keep EP-002 CANDIDATE, got ${ep002?.status}`);
}

// O5a：① workspace 放 run-local.py（非模板）→ sync 桥接生成转发桩 run-local.mjs，
// artifactTouched 为真（与 validatePhaseArtifacts 门禁同一份判定），桩无 child_process 字面量。
function scenarioRunLocalPyBridgedAsProxyStub(tempRoot) {
  const name = "bridge-run-local-py";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "patch";
  writeJson(taskJsonPath, task);
  fs.mkdirSync(path.join(workspaceRoot, "run"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "run", "run-local.py"), "print('real local reproduction')\n", "utf8");
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const stubPath = path.join(taskDir, "run", "run-local.mjs");
  assert(fs.existsSync(stubPath), "run-local.py in workspace must be bridged into run/run-local.mjs");
  const stub = fs.readFileSync(stubPath, "utf8");
  assert(stub.includes("python"), "stub must forward to the python interpreter");
  assert(!stub.includes("child_process"), "stub must not contain the child_process literal (pure-algorithm forbiddenPatterns)");
  assert(stub.includes('child_" + "process'), "stub must assemble the child_process module name by concatenation");
  assert(
    artifactTouched(taskDir, "run/run-local.mjs"),
    "bridged stub must count as artifactTouched (same predicate as the run-local gate)"
  );
}

// O5a：② run-local.ps1 变体 → 桩转发 pwsh -File。
function scenarioRunLocalPs1BridgedAsProxyStub(tempRoot) {
  const name = "bridge-run-local-ps1";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  fs.mkdirSync(path.join(workspaceRoot, "run"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "run", "run-local.ps1"), "Write-Output 'real local reproduction'\n", "utf8");
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const stubPath = path.join(taskDir, "run", "run-local.mjs");
  assert(fs.existsSync(stubPath), "run-local.ps1 in workspace must be bridged into run/run-local.mjs");
  const stub = fs.readFileSync(stubPath, "utf8");
  assert(stub.includes("pwsh"), "stub must forward to pwsh");
  assert(stub.includes('"-File"'), "stub must pass -File to pwsh");
  assert(!stub.includes("child_process"), "ps1 stub must not contain the child_process literal");
}

// O5a：③ patch tier + Rebuild 阶段下，桥接桩使 run-local 门禁不再报模板占位。
function scenarioRunLocalStubSatisfiesGate(tempRoot) {
  const name = "bridge-run-local-gate";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "patch";
  writeJson(taskJsonPath, task);
  fs.mkdirSync(path.join(workspaceRoot, "run"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "run", "run-local.py"), "print('gate satisfaction')\n", "utf8");
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const validation = runFormalValidation(taskDir);
  const messages = JSON.stringify(validation);
  assert(
    !messages.includes("run-local.mjs is still the template placeholder"),
    `patch tier at Rebuild with a bridged stub must not hit the run-local placeholder gate\n${messages.slice(0, 800)}`
  );
}

// O5b：bridgedScripts 按 relPath upsert 合并——手工登记的其它 relPath 保留，同 relPath 被框架值覆盖。
function scenarioBridgedScriptsUpsertMerges(tempRoot) {
  const name = "bridge-upsert-merge";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.workspaceArtifacts = {
    bridgedScripts: [
      { relPath: "run/run-local.mjs", source: "stale/old-run-local.mjs" },
      { relPath: "run/custom-manual.js", source: "agent-manual-registration" }
    ]
  };
  writeJson(taskJsonPath, task);
  fs.mkdirSync(path.join(workspaceRoot, "run"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "run", "run-local.py"), "print('merge test')\n", "utf8");
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const next = readJson(taskJsonPath);
  const entries = next.workspaceArtifacts?.bridgedScripts || [];
  const manual = entries.find((entry) => entry.relPath === "run/custom-manual.js");
  assert(manual && manual.source === "agent-manual-registration", "hand-registered entry must be preserved by upsert merge");
  const runLocal = entries.find((entry) => entry.relPath === "run/run-local.mjs");
  assert(runLocal && runLocal.source !== "stale/old-run-local.mjs", "same-relPath entry must be overwritten by the framework value");
  assert(runLocal && runLocal.source.includes("run-local.py"), `merged entry must point at the real source, got ${runLocal?.source}`);
}

// O7：① Observe 阶段缺调用链 → 无 WARN（Rebuild 门槛生效）。
function scenarioPreGateWarnsSuppressedBeforeRebuild(tempRoot) {
  const name = "pregate-observe-quiet";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  fs.writeFileSync(path.join(taskDir, "run", "investigation.md"), "# 调查记录\n\n暂无调用链。\n", "utf8");
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  assert(
    !(result.stderr || "").includes("WARN [pre-gate]"),
    `Observe phase must not emit pre-gate warnings (threshold)\nstderr:\n${result.stderr || ""}`
  );
}

// O7（精简后，win 改造 §2.4.4）：pre-gate 只剩两条无门槛词表预警（②非法 phase /
// ⑥非法 tier）；缺调用链 / plan 未引用 / criteria 未命中等「近门禁镜像」预警已裁——
// 同一信息由 task-close --dry-run 的错误流承担，sync 不再镜像。本场景锁定新契约：
// Rebuild 阶段缺调用链/缺 plan 引用 → 无 WARN；非法 tier → WARN 且带词表与 fix。
function scenarioPreGateWarnsAtRebuild(tempRoot) {
  const name = "pregate-rebuild-warns";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  fs.writeFileSync(path.join(taskDir, "run", "investigation.md"), "# 调查记录\n\n暂无调用链。\n", "utf8");
  fs.writeFileSync(path.join(taskDir, "run", "plan.md"), "# 实现计划\n\n步骤 1: 开始实现。\n", "utf8");
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  const stderr = result.stderr || "";
  assert(
    !stderr.includes("WARN [pre-gate]"),
    `lean pre-gate must stay quiet for near-gate mirror conditions (they live in task-close --dry-run)\nstderr:\n${stderr}`
  );

  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "bogus-tier";
  writeJson(taskJsonPath, task);
  const tierResult = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(tierResult, `task-sync(${name}, bogus tier)`);
  const tierStderr = tierResult.stderr || "";
  assert(tierStderr.includes("WARN [pre-gate]"), `illegal tier must warn at any phase\nstderr:\n${tierStderr}`);
  assert(tierStderr.includes("deliverableTier"), `tier warning must name the field\nstderr:\n${tierStderr}`);
  assert(tierStderr.includes("fix:"), `warnings must carry fix actions\nstderr:\n${tierStderr}`);
  assert(!(tierResult.stdout || "").includes("WARN [pre-gate]"), "pre-gate warnings must go to stderr, not stdout");
}

// O7：③ 非法 phase 残留 → 任意阶段（含 Observe）WARN。
function scenarioPreGateWarnsOnInvalidPhaseAnyPhase(tempRoot) {
  const name = "pregate-invalid-phase";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.phase = "BogusPhase";
  writeJson(taskJsonPath, task);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  const stderr = result.stderr || "";
  assert(stderr.includes("WARN [pre-gate]"), `invalid phase must warn at any phase\nstderr:\n${stderr}`);
  for (const phase of phaseOrder) {
    assert(stderr.includes(phase), `invalid-phase warning must list legal value ${phase}\nstderr:\n${stderr}`);
  }
}

// O7：④ Rebuild 阶段产物补齐后 WARN 消失（精简后契约：缺调用链/plan 引用本就不预警，
// 本场景锁的是「合法 phase + 合法 tier + 其余镜像条件」下 sync 完全静默）。
function scenarioPreGateWarnsClearWhenArtifactsReady(tempRoot) {
  const name = "pregate-rebuild-clean";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  fs.writeFileSync(
    path.join(taskDir, "run", "investigation.md"),
    "# 调查记录\n\n## 完整调用链\n入口 0x140001000 -> 叶节点 0x140002000，每步附锚点。\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(taskDir, "run", "plan.md"),
    "# 实现计划\n\n步骤 1: 引用: investigation.md 完整调用链 一节。\n",
    "utf8"
  );
  fs.writeFileSync(path.join(taskDir, "run", "evidence.md"), "# 证据\n\n交付核对输出（QA 夹具）。\n", "utf8");
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.completionCriteria = [{ text: "交付可验证产物: report.md", hit: true, evidenceRefs: ["run/evidence.md"] }];
  task.successCriteria = [{ text: "调用链已确认", status: "done" }];
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  assert(
    !(result.stderr || "").includes("WARN [pre-gate]"),
    `ready artifacts at Rebuild must clear pre-gate warnings\nstderr:\n${result.stderr || ""}`
  );
}

// O2：注入非法 phase → 正式验证 error 含全部 6 个合法值（词表从 phaseOrder join 生成，不硬编码）。
function scenarioInvalidPhaseErrorListsLegalValues(tempRoot) {
  const name = "invalid-phase-error-vocab";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.phase = "BogusPhase";
  writeJson(taskJsonPath, task);
  const validation = runFormalValidation(taskDir);
  const messages = JSON.stringify(validation);
  assert(messages.includes("BogusPhase"), "validation error must echo the invalid phase value");
  for (const phase of phaseOrder) {
    assert(messages.includes(phase), `invalid-phase error must list legal value ${phase}\n${messages.slice(0, 1200)}`);
  }
}

// V2-7(a)：合规 manifest + 哈希不一致 → advance 物理阻断。
function scenarioBackupManifestHashMismatchBlocksAdvance(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-backup-mismatch");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  ensureOk(runNode(taskStartScript, ["backup-mismatch"], workspaceRoot), "task-start(backup-mismatch)");
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-mismatch");
  const runDir = path.join(taskDir, "run");

  // 伪造受损现场：原始文件当前内容与干净备份不同 → 哈希必然不一致
  const originalPath = path.join(workspaceRoot, "original-target.exe").replaceAll("\\", "/");
  fs.writeFileSync(originalPath, "tampered-current-content", "utf8");
  fs.writeFileSync(path.join(runDir, "original-target.exe.clean.bak"), "clean-original-content", "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    [
      "# 备份清单",
      "",
      "| originalPath | backup | sha256 |",
      "| --- | --- | --- |",
      `| ${originalPath} | original-target.exe.clean.bak | ${"0".repeat(64)} |`,
      ""
    ].join("\n"),
    "utf8"
  );

  const advanceResult = runNode(taskAdvanceScript, ["backup-mismatch"], workspaceRoot);
  const output = `${advanceResult.stdout}\n${advanceResult.stderr}`;
  assert(advanceResult.status !== 0, "hash mismatch must block task-advance");
  assert(output.includes("哈希值与干净备份不一致"), "hash mismatch violation should fire");
}

// V2-7(b)：存在 .clean.bak 但 manifest 缺失/解析为空 → 模板按需落地 + WARNING 指明期望格式；
// 非 patch 任务目录默认不带 backup-manifest.md（run/ 模板不在全民分发面内）。
function scenarioBackupManifestMissingWarnsAndMaterializes(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-backup-warn");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  ensureOk(runNode(taskStartScript, ["backup-warn"], workspaceRoot), "task-start(backup-warn)");
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-warn");
  const runDir = path.join(taskDir, "run");

  assert(
    !fs.existsSync(path.join(runDir, "backup-manifest.md")),
    "fresh task must not ship backup-manifest.md"
  );
  fs.writeFileSync(path.join(runDir, "target.exe.clean.bak"), "clean-bytes", "utf8");

  // advance 随后会因缺 route-state 失败，但熔断 WARNING 必须先于它出现
  const advanceResult = runNode(taskAdvanceScript, ["backup-warn"], workspaceRoot);
  const output = `${advanceResult.stdout}\n${advanceResult.stderr}`;
  assert(
    output.includes("[backup-manifest] WARNING: 备份 target.exe.clean.bak 未在 run/backup-manifest.md 解析到有效原始路径"),
    "empty parse should print the per-backup WARNING"
  );
  const manifestPath = path.join(runDir, "backup-manifest.md");
  assert(fs.existsSync(manifestPath), "manifest template should materialize on first .clean.bak");
  assert(
    fs.readFileSync(manifestPath, "utf8").includes("<sha256-hex>"),
    "materialized manifest should keep the placeholder hash"
  );
}

// V3-6/Q6（行为锁）：错误格式 manifest（含 64hex 但解析不出原始路径）+ .clean.bak 在场时，
// advance 宽容期 exit=0 可推进，WARNING 必须出现且含 close 升级预告。
function scenarioBackupManifestMalformedAdvanceWarnsOnly(tempRoot) {
  const { workspaceRoot } = buildCloseoutReadyTask(tempRoot, "backup-malformed-advance");
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-malformed-advance");
  const runDir = path.join(taskDir, "run");

  fs.writeFileSync(path.join(runDir, "target.exe.clean.bak"), "clean-bytes", "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    [
      "# 备份清单",
      "",
      "| originalPath | backup | sha256 |",
      "| --- | --- | --- |",
      `| not-an-absolute-path | target.exe.clean.bak | ${"0".repeat(64)} |`,
      ""
    ].join("\n"),
    "utf8"
  );

  const advanceResult = runNode(taskAdvanceScript, ["backup-malformed-advance"], workspaceRoot);
  ensureOk(advanceResult, "task-advance(backup-malformed-advance) tolerance window must stay open");
  const output = `${advanceResult.stdout}\n${advanceResult.stderr}`;
  assert(
    output.includes("[backup-manifest] WARNING: 备份 target.exe.clean.bak 未在 run/backup-manifest.md 解析到有效原始路径"),
    "advance should keep the per-backup WARNING for malformed manifest lines"
  );
  assert(
    output.includes("close 阶段将升级为 error"),
    "advance WARNING should preview the close-stage fail-closed escalation"
  );
}

// V3-6/Q7（对抗）：错误格式 manifest + .clean.bak 在场 → close --dry-run fail-closed error。
// manifest 含 64hex（过哈希条目存在性检查），错误点被隔离为「解析不出原始路径」。
function scenarioBackupManifestMalformedCloseFailsClosed(tempRoot) {
  const { workspaceRoot } = buildCloseoutReadyTask(tempRoot, "backup-malformed-close", { phase: "Patch" });
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-malformed-close");
  const runDir = path.join(taskDir, "run");

  fs.writeFileSync(path.join(runDir, "target.exe.clean.bak"), "clean-bytes", "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    [
      "# 备份清单",
      "",
      "| originalPath | backup | sha256 |",
      "| --- | --- | --- |",
      `| not-an-absolute-path | target.exe.clean.bak | ${"0".repeat(64)} |`,
      ""
    ].join("\n"),
    "utf8"
  );

  const closeResult = runNode(taskCloseScript, ["backup-malformed-close", "--dry-run"], workspaceRoot);
  assert(closeResult.status !== 0, "malformed manifest + .clean.bak must fail close --dry-run (fail-closed)");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("解析不出原始路径"),
    "close should escalate the unparseable original path to an error"
  );
  assert(
    output.includes("| <原始文件绝对路径> | target.exe.clean.bak | <sha256-hex> |"),
    "close error should carry the expected line-format fix example"
  );
}

// V3-6/Q7b（误伤对照）：manifest 行解析成功但原始文件已合法清理（不存在）→ close 维持 WARNING 不误挂。
function scenarioBackupManifestCleanedOriginalKeepsWarning(tempRoot) {
  const { workspaceRoot } = buildCloseoutReadyTask(tempRoot, "backup-cleaned-close", { phase: "Patch" });
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-cleaned-close");
  const runDir = path.join(taskDir, "run");
  const cleanedOriginal = path.join(workspaceRoot, "already-cleaned-target.exe").replaceAll("\\", "/");

  fs.writeFileSync(path.join(runDir, "already-cleaned-target.exe.clean.bak"), "clean-bytes", "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    [
      "# 备份清单",
      "",
      "| originalPath | backup | sha256 |",
      "| --- | --- | --- |",
      `| ${cleanedOriginal} | already-cleaned-target.exe.clean.bak | ${"0".repeat(64)} |`,
      ""
    ].join("\n"),
    "utf8"
  );
  assert(!fs.existsSync(cleanedOriginal), "fixture original must stay absent (legitimately cleaned)");

  const closeResult = runNode(taskCloseScript, ["backup-cleaned-close", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(backup-cleaned-close) must not fail on cleaned originals");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("[backup-manifest]") && output.includes("已不存在"),
    "close should keep a WARNING (not an error) for legitimately cleaned originals"
  );
}

// R1-S1（核心回归）：备份放 run/ 之外（manifest 第二列登记绝对路径）+ 原始文件被篡改
// → advance 哈希断路器必须真实阻断。修复前该形态被整体静默跳过（P2 漏洞）。
function scenarioBackupManifestExternalPathBlocksAdvance(tempRoot) {
  const workspaceRoot = path.join(tempRoot, "workspace-backup-external");
  fs.mkdirSync(workspaceRoot, { recursive: true });

  ensureOk(runNode(taskStartScript, ["backup-external"], workspaceRoot), "task-start(backup-external)");
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-external");
  const runDir = path.join(taskDir, "run");

  const originalPath = path.join(workspaceRoot, "ext-target.exe").replaceAll("\\", "/");
  const externalBackupPath = path.join(workspaceRoot, "ext-target.exe.clean.bak").replaceAll("\\", "/");
  fs.writeFileSync(originalPath, "tampered-current-content", "utf8");
  fs.writeFileSync(externalBackupPath, "clean-original-content", "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    [
      "# 备份清单",
      "",
      "| originalPath | backup | sha256 |",
      "| --- | --- | --- |",
      `| ${originalPath} | ${externalBackupPath} | ${"0".repeat(64)} |`,
      ""
    ].join("\n"),
    "utf8"
  );

  const advanceResult = runNode(taskAdvanceScript, ["backup-external"], workspaceRoot);
  const output = `${advanceResult.stdout}\n${advanceResult.stderr}`;
  assert(advanceResult.status !== 0, "external backup hash mismatch must block task-advance");
  assert(output.includes("哈希值与干净备份不一致"), "external backup should trigger the hash circuit breaker");
}

// R1-B2（close 侧 WARNING 分层锁）：备份在 run/ 之外 + 哈希不一致 + 无豁免旗标
// → close --dry-run 放行（exit=0）但必须出现 WARNING 级哈希比对提示，不升 error。
function scenarioBackupManifestExternalPathCloseHashWarnsOnly(tempRoot) {
  const { workspaceRoot } = buildCloseoutReadyTask(tempRoot, "backup-external-close", { phase: "Patch" });
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", "backup-external-close");
  const runDir = path.join(taskDir, "run");

  const originalPath = path.join(workspaceRoot, "ext-close-target.exe").replaceAll("\\", "/");
  const externalBackupPath = path.join(workspaceRoot, "ext-close-target.exe.clean.bak").replaceAll("\\", "/");
  fs.writeFileSync(originalPath, "patched-current-content", "utf8");
  fs.writeFileSync(externalBackupPath, "clean-original-content", "utf8");
  fs.writeFileSync(
    path.join(runDir, "backup-manifest.md"),
    [
      "# 备份清单",
      "",
      "| originalPath | backup | sha256 |",
      "| --- | --- | --- |",
      `| ${originalPath} | ${externalBackupPath} | ${"0".repeat(64)} |`,
      ""
    ].join("\n"),
    "utf8"
  );

  const closeResult = runNode(taskCloseScript, ["backup-external-close", "--dry-run"], workspaceRoot);
  ensureOk(closeResult, "task-close --dry-run(backup-external-close) must stay WARNING-level on hash mismatch");
  const output = `${closeResult.stdout}\n${closeResult.stderr}`;
  assert(
    output.includes("SHA256 不一致") && output.includes("hash_mismatch_authorized.flag"),
    "close should emit the WARNING-level hash comparison for external backups"
  );
}

// report-only 改造：原 scenarioExternalResearchContentGate 删除——T3+ 外部研究
// 物理阻断门禁（state/external-research.md 内容检查）已退役，无行为可锁。

// V2-9：run-local 实现物只对实现类交付分层强制——evidence 豁免，patch 仍挂。
function scenarioRunLocalGateFollowsDeliverableTier(tempRoot) {
  // buildCloseoutReadyTask 的默认 deliverableTier 即 evidence
  const evidenceTask = buildCloseoutReadyTask(tempRoot, "runlocal-evidence", { phase: "Rebuild" });
  const evidenceResult = runNode(taskCloseScript, ["runlocal-evidence", "--dry-run"], evidenceTask.workspaceRoot);
  const evidenceOutput = `${evidenceResult.stdout}\n${evidenceResult.stderr}`;
  assert(
    !evidenceOutput.includes("run-local.mjs is still the template placeholder"),
    "evidence tier must be exempt from the run-local placeholder guard"
  );

  const patchTask = buildCloseoutReadyTask(tempRoot, "runlocal-patch", {
    phase: "Rebuild",
    deliverableTier: "patch"
  });
  const patchResult = runNode(taskCloseScript, ["runlocal-patch", "--dry-run"], patchTask.workspaceRoot);
  const patchOutput = `${patchResult.stdout}\n${patchResult.stderr}`;
  assert(patchResult.status !== 0, "patch tier at Rebuild must still fail closeout");
  assert(
    patchOutput.includes("run-local.mjs is still the template placeholder"),
    "patch tier must keep the run-local placeholder guard"
  );
}

// F-O1：cwd-hint 覆盖面——从任务 run/ 子目录（artifacts/tasks/<id>/run，中间任意子目录）
// 无 WIN_REVERSE_WORKSPACE_ROOT 运行 task-sync → stderr 含 [cwd-hint] 而非裸栈；
// cwd=项目根（负向锁）不受影响。
function scenarioCwdHintFromTaskSubdirectory(tempRoot) {
  const name = "cwd-hint-subdir";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const envWithoutWorkspace = { ...process.env, WIN_REVERSE_SKILL_ROOT: repoRoot };
  delete envWithoutWorkspace.WIN_REVERSE_WORKSPACE_ROOT;
  const deepCwd = path.join(taskDir, "run");
  const result = spawnSync(process.execPath, [taskSyncScript, name], {
    cwd: deepCwd,
    env: envWithoutWorkspace,
    encoding: "utf8"
  });
  assert(result.status !== 0, "task-sync from a task subdirectory must fail");
  const stderr = result.stderr || "";
  assert(stderr.includes("[cwd-hint]"), `stderr must carry the cwd-hint, not a bare stack\nstderr:\n${stderr}`);
  assert(stderr.includes("WIN_REVERSE_WORKSPACE_ROOT"), `cwd-hint must point at the workspace-root escape hatch\nstderr:\n${stderr}`);
  // 负向锁：cwd=项目根（无 env 覆盖）正常解析，不受影响
  const rootResult = spawnSync(process.execPath, [taskSyncScript, name], {
    cwd: workspaceRoot,
    env: envWithoutWorkspace,
    encoding: "utf8"
  });
  ensureOk(rootResult, "task-sync from workspace root without env override (negative lock)");
}

// F-O2 规则⑥：非法 deliverableTier 任意阶段（含 Observe，无门槛）WARN 且含五枚举。
function scenarioPreGateWarnsOnInvalidTierAnyPhase(tempRoot) {
  const name = "pregate-invalid-tier";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "补丁交付";
  writeJson(taskJsonPath, task);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  const stderr = result.stderr || "";
  assert(stderr.includes("WARN [pre-gate]"), `invalid tier must warn at any phase (Observe included)\nstderr:\n${stderr}`);
  for (const tier of ["evidence", "hook-script", "patch", "protocol-doc", "pure-algorithm"]) {
    assert(stderr.includes(tier), `invalid-tier warning must list legal value ${tier}\nstderr:\n${stderr}`);
  }
  assert(!(result.stdout || "").includes("WARN [pre-gate]"), "pre-gate warnings must go to stderr, not stdout");
}

// F-O2 规则⑦（已裁，win 改造 §2.4.4）：topic 包形式校验的 sync 摘要 WARN 已删——
// 明细由 task-close --dry-run 错误流承担。本场景反向锁定新契约：Rebuild 阶段
// topic 校验未完备时 sync 不再出现该摘要行。
function scenarioPreGateTopicFormalSummaryAtRebuild(tempRoot) {
  const name = "pregate-topic-formal";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.staticTriage = { present: true, status: "not-started", keyFindings: [] };
  writeJson(taskJsonPath, task);
  const observe = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(observe, `task-sync(${name}) at Observe`);
  assert(
    !(observe.stderr || "").includes("topic 包形式校验"),
    `Observe phase must not emit topic formal-validation warnings\nstderr:\n${observe.stderr || ""}`
  );
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  const rebuild = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(rebuild, `task-sync(${name}) at Rebuild`);
  const stderr = rebuild.stderr || "";
  assert(
    !stderr.includes("topic 包形式校验"),
    `lean pre-gate must not mirror topic formal-validation at sync (details live in task-close --dry-run)\nstderr:\n${stderr}`
  );
}

// F-O2 规则⑧（已裁，win 改造 §2.4.4）：hit 判据缺合法 evidenceRefs 的 sync 摘要 WARN 已删；
// 硬判定仍在 closeout 门禁（evaluateCloseoutGate / dry-run 错误流）。本场景反向锁定：
// 字符串形态 [x] 判据在 sync 不再触发该摘要。
function scenarioPreGateHitCriteriaWithoutEvidenceWarns(tempRoot) {
  const name = "pregate-evidence-refs";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.completionCriteria = ["[x] 调用链已确认"];
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  const result = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(result, `task-sync(${name})`);
  const stderr = result.stderr || "";
  assert(
    !stderr.includes("缺合法 evidenceRefs"),
    `lean pre-gate must not mirror the evidenceRefs gate at sync\nstderr:\n${stderr}`
  );
}

// F-O2 补齐消失锁（精简后，win 改造 §2.4.4）：非法 tier → WARN 在列；修为合法 tier 后
// WARN 消失。原「字符串形态 hit 判据缺 evidenceRefs」WARN 已随规则⑧裁撤——该判据的
// 硬判定由 closeout 门禁承担，sync 不再镜像。
function scenarioPreGateNewRulesClearWhenFixed(tempRoot) {
  const name = "pregate-new-rules-clear";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "补丁交付";
  task.completionCriteria = ["[x] 调用链已确认"];
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  const dirty = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(dirty, `task-sync(${name}) dirty state`);
  assert(!(dirty.stderr || "").includes("缺合法 evidenceRefs"), "lean pre-gate must not warn on missing evidenceRefs");
  assert((dirty.stderr || "").includes("不在合法值"), "dirty state must warn on the invalid tier");

  fs.writeFileSync(path.join(taskDir, "run", "evidence.md"), "# 证据\n\n调用链核对输出（QA 夹具）。\n", "utf8");
  const fixed = readJson(taskJsonPath);
  fixed.deliverableTier = "evidence";
  fixed.completionCriteria = [{ text: "调用链已确认", hit: true, evidenceRefs: ["run/evidence.md"] }];
  writeJson(taskJsonPath, fixed);
  const clean = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(clean, `task-sync(${name}) fixed state`);
  const stderr = clean.stderr || "";
  assert(!stderr.includes("缺合法 evidenceRefs"), `evidenceRefs warning must clear after fix\nstderr:\n${stderr}`);
  assert(!stderr.includes("不在合法值"), `invalid-tier warning must clear after fix\nstderr:\n${stderr}`);
}

// F-O4：全 SKIPPED/EXHAUSTED 任务——route-state 侧 needs-retrospective 分支触发
// （耗尽集合单源常量 ENTRYPOINT_EXHAUSTED_STATUSES）；report-only 改造后
// validation 侧的义务类 finding 已退役（不再惩罚不跑 sync 的任务）。
function scenarioAllSkippedTriggersConsistentExhaustedJudgment(tempRoot) {
  const name = "ep-all-skipped-consistent";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const routeStatePath = path.join(taskDir, "state", "route-state.json");
  const routeState = readJson(routeStatePath);
  routeState.entrypoints = routeState.entrypoints.map((entrypoint, index) => ({
    ...entrypoint,
    status: index === 0 ? "EXHAUSTED" : "SKIPPED"
  }));
  routeState.activeEntrypoints = [];
  writeJson(routeStatePath, routeState);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
  const next = readJson(routeStatePath);
  assert(
    next.execution.status === "needs-retrospective",
    `route-state side must yield needs-retrospective, got ${next.execution.status}`
  );
  const findings = evaluateRouteConsistency(taskDir);
  // report-only 改造：validation 侧的「切入点全耗尽但无 retrospective」义务类 finding
  // 已退役——route-state 是可选续跑辅助，不跑 sync/advance 不得被门禁惩罚；
  // 锁的是"不再出现该 finding"而非其存在。
  assert(
    !findings.some((finding) => finding.includes("all entrypoints are exhausted/parked")),
    `validation side must NOT fire the retired exhausted-obligation finding\nfindings:\n${findings.join("\n")}`
  );
}

// F-O5①（复测实测场景）：baseline=非法 + 非法→合法纠错 → [contract-fix]，无 [manual-override]。
function scenarioContractFixReclassifiesCorrection(tempRoot) {
  const name = "contract-fix-correction";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  let task = readJson(taskJsonPath);
  task.deliverableTier = "补丁交付";
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) baseline=illegal`);
  task = readJson(taskJsonPath);
  task.deliverableTier = "patch";
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) illegal->legal correction`);
  const validation = runFormalValidation(taskDir);
  const warnings = (validation.warnings || []).join("\n");
  assert(
    warnings.includes("[contract-fix] contract field corrected: deliverableTier"),
    `illegal baseline + illegal->legal correction must reclassify to [contract-fix]\nwarnings:\n${warnings}`
  );
  assert(
    !warnings.includes("[manual-override] contract field changed: deliverableTier"),
    `[contract-fix] case must not double-report as [manual-override]\nwarnings:\n${warnings}`
  );
}

// F-O5②（负向锁）：baseline=合法 + 合法 A→合法 B → 维持 [manual-override]，不得豁免。
function scenarioContractFixLegalToLegalStaysManualOverride(tempRoot) {
  const name = "contract-fix-legal-flip";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) baseline=legal`);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "patch";
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) legal A->legal B`);
  const validation = runFormalValidation(taskDir);
  const warnings = (validation.warnings || []).join("\n");
  assert(
    warnings.includes("[manual-override] contract field changed: deliverableTier"),
    `legal baseline + legal->legal flip must stay [manual-override]\nwarnings:\n${warnings}`
  );
  assert(!warnings.includes("[contract-fix]"), `legal->legal flip must never earn [contract-fix]\nwarnings:\n${warnings}`);
}

// F-O5③（洗白序列对抗）：baseline=合法，合法→非法→合法弱——末次 changed 的 oldValue 非法，
// 但 baseline 合法 → 末态仍 [manual-override]，洗白不得逞。
function scenarioContractFixWashoutSequenceStaysManualOverride(tempRoot) {
  const name = "contract-fix-washout";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) baseline=legal`);
  const taskJsonPath = path.join(taskDir, "task.json");
  let task = readJson(taskJsonPath);
  task.deliverableTier = "补丁交付";
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) legal->illegal`);
  task = readJson(taskJsonPath);
  task.deliverableTier = "hook-script";
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) illegal->legal-weaker`);
  const validation = runFormalValidation(taskDir);
  const warnings = (validation.warnings || []).join("\n");
  assert(
    warnings.includes("[manual-override] contract field changed: deliverableTier"),
    `washout sequence (legal baseline) must stay [manual-override]\nwarnings:\n${warnings}`
  );
  assert(!warnings.includes("[contract-fix]"), `washout sequence must never earn [contract-fix]\nwarnings:\n${warnings}`);
}

// F-O5④（baseline 缺失对抗）：日志只有 changed 行（非法→合法）而无 baseline 行——
// 首观测不可验证，标签不得奖励不可追溯历史，维持 [manual-override]。
function scenarioContractFixMissingBaselineStaysManualOverride(tempRoot) {
  const name = "contract-fix-no-baseline";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.deliverableTier = "patch";
  writeJson(taskJsonPath, task);
  fs.writeFileSync(
    path.join(taskDir, "run", "contract-change-log.md"),
    '# Contract Change Log\n\n- 2026-01-01T00:00:00.000Z deliverableTier changed: "补丁交付" -> "patch"\n',
    "utf8"
  );
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) with baseline-less log`);
  const validation = runFormalValidation(taskDir);
  const warnings = (validation.warnings || []).join("\n");
  assert(
    warnings.includes("[manual-override] contract field changed: deliverableTier"),
    `missing baseline must stay [manual-override]\nwarnings:\n${warnings}`
  );
  assert(!warnings.includes("[contract-fix]"), `missing baseline must never earn [contract-fix]\nwarnings:\n${warnings}`);
}

// F-O9：连续两次 sync（无字段变化）→ 第二次 task.json mtime 不变；
// 有非时钟变化（task-advance 推进 phase）→ 正常落盘且 diff 打印不变。
function scenarioNoopSyncDoesNotRefreshTaskJsonMtime(tempRoot) {
  const name = "noop-sync-mtime";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) settle`);
  const taskJsonPath = path.join(taskDir, "task.json");
  const mtimeBefore = fs.statSync(taskJsonPath).mtimeMs;
  // 等出 mtime 分辨粒度，避免同毫秒误判
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) noop second pass`);
  const mtimeAfter = fs.statSync(taskJsonPath).mtimeMs;
  assert(
    mtimeAfter === mtimeBefore,
    `noop sync must not refresh task.json mtime (before=${mtimeBefore}, after=${mtimeAfter})`
  );
  const advance = runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot);
  ensureOk(advance, `task-advance(${name} --to=Capture) real change`);
  const mtimeAdvanced = fs.statSync(taskJsonPath).mtimeMs;
  assert(mtimeAdvanced > mtimeAfter, "a real (non-clock) change must still be persisted");
  assert(
    (advance.stderr || "").includes("[write] task.json changed"),
    `real change must keep the diff visibility print\nstderr:\n${advance.stderr || ""}`
  );
}

// R3-O2①：Rebuild 相位 + 判据全标记命中 + 证据引用齐 → ready-to-close 完成态短路。
// F-3 回归锁：必须断言持久化 route-state.json 的 execution.status——stamp 内的
// normalize 会在枚举缺失时把新 status 静默压回 not-evaluated，仅查 action 文本抓不到。
function scenarioReadyToCloseShortCircuit(tempRoot) {
  const name = "ready-to-close";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  fs.writeFileSync(path.join(taskDir, "run", "evidence.md"), "# 证据\n\n交付核对输出（QA 夹具）。\n", "utf8");
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.completionCriteria = [{ text: "交付可验证产物: report.md", hit: true, evidenceRefs: ["run/evidence.md"] }];
  writeJson(taskJsonPath, task);
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), `task-advance(${name} --to=Rebuild)`);
  const sync = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(sync, `task-sync(${name})`);
  assert(
    sync.stdout.includes("task-close --dry-run"),
    `sync stdout must point at close dry-run precheck\nstdout:\n${sync.stdout}`
  );
  const persisted = readJson(path.join(taskDir, "state", "route-state.json"));
  assert(
    persisted.execution.status === "ready-to-close",
    `persisted execution.status must be ready-to-close, got ${persisted.execution.status}`
  );
  assert(persisted.execution.nextEntrypointId === "", "ready-to-close must clear nextEntrypointId");
  assert(persisted.execution.autoAdvanceEligible === false, "ready-to-close must not be auto-advance eligible");
  assert(persisted.execution.pauseCategory === "none", "ready-to-close pauseCategory must be none");
  assert(
    persisted.execution.nextExecutableAction.includes("agent 自申报"),
    "action text must honestly mark criteria hits as agent self-reported"
  );
  const persistedTask = readJson(taskJsonPath);
  assert(
    persistedTask.routeState.executionStatus === "ready-to-close",
    "task.json mirror field must follow route-state execution status"
  );
}

// R3-O2②③：四把负向锁——部分命中 / Observe 相位全命中（phase 门）/ 全命中但缺
// evidenceRefs（证据形态门）/ pauseCategory=user/risk（上游暂停分支优先）时均不得
// 触发 ready-to-close，持久化输出与现状逐字节一致（ready-to-continue / blocked-*）。
function scenarioReadyToCloseNegativeLocks(tempRoot) {
  const seedHitWithEvidence = (taskDir, criteria) => {
    fs.writeFileSync(path.join(taskDir, "run", "evidence.md"), "# 证据\n\nQA 夹具。\n", "utf8");
    const taskJsonPath = path.join(taskDir, "task.json");
    const task = readJson(taskJsonPath);
    task.completionCriteria = criteria;
    writeJson(taskJsonPath, task);
  };
  const persistedStatus = (taskDir) =>
    readJson(path.join(taskDir, "state", "route-state.json")).execution.status;

  // (a) 部分命中 → 不触发
  const nameA = "rtc-partial-hit";
  const a = startBasicTask(tempRoot, nameA);
  seedHitWithEvidence(a.taskDir, [
    { text: "交付可验证产物: report.md", hit: true, evidenceRefs: ["run/evidence.md"] },
    { text: "交付可验证产物: route-state.json", status: "pending" }
  ]);
  ensureOk(runNode(taskAdvanceScript, [nameA, "--to=Rebuild"], a.workspaceRoot), `task-advance(${nameA} --to=Rebuild)`);
  ensureOk(runNode(taskSyncScript, [nameA], a.workspaceRoot), `task-sync(${nameA})`);
  assert(
    persistedStatus(a.taskDir) === "ready-to-continue",
    `partial hit must stay ready-to-continue, got ${persistedStatus(a.taskDir)}`
  );

  // (b) Observe 相位全命中 + 证据齐 → phase 门拦回
  const nameB = "rtc-observe-gate";
  const b = startBasicTask(tempRoot, nameB);
  seedHitWithEvidence(b.taskDir, [{ text: "调用链已确认", hit: true, evidenceRefs: ["run/evidence.md"] }]);
  ensureOk(runNode(taskSyncScript, [nameB], b.workspaceRoot), `task-sync(${nameB})`);
  assert(
    persistedStatus(b.taskDir) === "ready-to-continue",
    `Observe phase all-hit must stay ready-to-continue (phase gate), got ${persistedStatus(b.taskDir)}`
  );

  // (c) Rebuild 相位全命中但字符串形态 [x] 判据无 evidenceRefs → 证据形态门拦回
  const nameC = "rtc-evidence-gate";
  const c = startBasicTask(tempRoot, nameC);
  seedHitWithEvidence(c.taskDir, ["[x] 调用链已确认"]);
  ensureOk(runNode(taskAdvanceScript, [nameC, "--to=Rebuild"], c.workspaceRoot), `task-advance(${nameC} --to=Rebuild)`);
  ensureOk(runNode(taskSyncScript, [nameC], c.workspaceRoot), `task-sync(${nameC})`);
  assert(
    persistedStatus(c.taskDir) === "ready-to-continue",
    `all-hit without evidenceRefs must stay ready-to-continue (evidence-shape gate), got ${persistedStatus(c.taskDir)}`
  );

  // (d) pauseCategory=user/risk 时条件全满也不触发（上游暂停分支优先，倒挂锁）
  const pauseTask = {
    taskId: "rtc-pause-lock",
    phase: "Rebuild",
    objective: "验证暂停分支优先于 ready-to-close",
    deliverableTier: "evidence",
    completionCriteria: [{ text: "调用链已确认", hit: true, evidenceRefs: ["run/evidence.md"] }],
    targetContext: { inputTarget: "rtc-pause-lock-sample" },
    boundaries: { input: { inScope: ["静态分析"], outOfScope: ["未授权对外联机"] } },
    routeState: {}
  };
  for (const [category, expected] of [["user", "blocked-on-user"], ["risk", "blocked-on-risk"]]) {
    const baseRouteState = defaultRouteStateDocument(pauseTask);
    const execution = resolveExecutionState(pauseTask, {
      ...baseRouteState,
      execution: { ...baseRouteState.execution, pauseCategory: category }
    });
    assert(
      execution.status === expected,
      `pauseCategory=${category} must stay ${expected} even with all-hit criteria, got ${execution.status}`
    );
  }
}

// R2-G01/G-02（round2）共享基座：startBasicTask + 一次 sync 收敛镜像，返回可复用的
// setTask / writeTaskFile / renderReport 工具。report-only 改造：fixtures / 三核心产物 /
// unpack·iat 笔记写入已退役；renderReport 改用实质报告生成器（buildSubstantiveReportText），
// keyFindingLine 落「专题发现」节为项目符号行（不命中任何 reportSection 标题谓词），
// extraTopicSections 可补达标专题小节。
function startVmpGateScenarioTask(tempRoot, name) {
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) settle`);

  const writeTaskFile = (relPath, content) => {
    const target = path.join(taskDir, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  };

  const renderReport = (keyFindingLine, extraTopicSections = []) =>
    buildSubstantiveReportText(taskDir, {
      extraTopicLines: [keyFindingLine],
      extraTopicSections
    });

  const setTask = (mutator) => {
    const taskJsonPath = path.join(taskDir, "task.json");
    const task = readJson(taskJsonPath);
    mutator(task);
    writeJson(taskJsonPath, task);
  };

  return { workspaceRoot, taskDir, writeTaskFile, renderReport, setTask };
}

// packer-unpack topic 的 reportSection 谓词（脱壳|Unpack|OEP，minChars=120）达标小节夹具——
// 供「非 VMP」场景满足 packerUnpack.present=true 的专题门禁，把注意力留给 VMP 语料 WARN 断言。
const PACKER_TOPIC_SECTION = {
  heading: "脱壳分诊（packer-unpack）",
  body:
    "Packer / OEP / dump / IAT rebuild 结论：样本为加壳目标，静态分诊已完成；" +
    "OEP 定位与 dump 产物核验见验证证据节，导入表重建状态已登记 task.json 结构化字段；" +
    "本小节为 QA 夹具实质内容，长度满足 minChars=120 谓词。"
};

const VMP_CORPUS_WARN_PREFIX = "VMP-related wording found in task corpus";

// R2-G01 场景 A/C/D + B 黄金数组锁（report-only 改造后重录）：present 唯一武装开关 +
// corpus WARN 化后——
// A：否定语料簇 + 干净结构指标 + vmp.present≠true → errors=0 且恰 1 条分诊 WARN；
// C：hints≥2 真 VMP 语料 + vmp.present≠true → 同上（旧代码此处是 error 级联胁迫）；
// D：packed 非 VMP + 崩溃语料 + crash-diagnostics 缺失 → crash evidence finding 仍在
// （终审保护项：crash 检查位于 vmpPresent 块之外、仅受 present 早退保护）；
// B：真 VMP 任务的 findings 数组逐字锁定为 report-only 口径（golden diff 固化为常量断言，
// 取值=改造后实测输出并逐条人工核对过合法性）。
// 命名纪律：任务 id / objective 一律不含 vmp 及否定词——taskId 会进 validation corpus，
// 命名污染会让 WARN 断言失去区分度。
function scenarioVmpGateSemanticNarrowing(tempRoot) {
  const goldenTrueVmpFindings = [
    "packerUnpack.present=true 但 report.md 缺少「Packer / OEP / dump / IAT rebuild」专题小节 fix: 在 report.md 补一个匹配「脱壳|Unpack|OEP」的专题小节并写入实质内容（report-only：不再要求专题 notes 文件）",
    "packerUnpack.vmp.present=true but report.md lacks a 脱壳/VMP topic section fix: 在 report.md 专题发现节补脱壳/VMP 小节（分诊结论、OEP 证据、路线取舍），写实质内容",
    "VMP dump manifest requires run/dump-manifest.json",
    "VMP evidence found but packerUnpack.vmp.antiDebug.status is still unknown",
    "active/virtualized VMP requires a classified localized-devirt route or explicit blackbox-boundary",
    "VMP localized devirtualization requires a report.md 去虚拟化 topic section fix: 在 report.md 专题发现节补去虚拟化小节（vpc/vsp/vkey 证据、handler 切分、黑盒边界取舍）",
    "VMP localized devirtualization requires packerUnpack.vmp.devirtualization.status to be classified",
    "VMP localized devirtualization requires traceFiles or an explicit blackbox-boundary",
    "VMP localized devirtualization requires specialRegisters evidence for vpc/vsp/vkey/vbase or an explicit blackbox-boundary",
    "VMP cmp/jcc devirtualization requires flagsRecovered or branchTargets evidence"
  ];
  const corpusWarnCount = (result) => (result.warnings || []).filter((item) => item.includes(VMP_CORPUS_WARN_PREFIX)).length;

  // 基线自检：中性语料 → 0 error 0 warning（证明后续断言的差异只来自注入语料）
  const scenBase = startVmpGateScenarioTask(tempRoot, "gate-sem-base");
  fs.writeFileSync(path.join(scenBase.taskDir, "report.md"), scenBase.renderReport("- 事实: QA 夹具中性结论。"), "utf8");
  const baseline = runFormalValidation(scenBase.taskDir);
  assert(
    baseline.errors.length === 0 && (baseline.warnings || []).length === 0,
    `vmp gate scenario baseline must be clean\nerrors:\n${baseline.errors.join("\n")}\nwarnings:\n${(baseline.warnings || []).join("\n")}`
  );

  // —— 场景 A ——
  const scenA = startVmpGateScenarioTask(tempRoot, "gate-sem-a");
  scenA.setTask((task) => {
    task.packerUnpack = { present: true, status: "triaged", keyFindings: ["样本存在 VM entry 与 dispatcher 双重结构特征"], notes: [] };
  });
  fs.writeFileSync(path.join(scenA.taskDir, "report.md"), scenA.renderReport("- 推断: 已排除代码虚拟化——无反调试、无 VMP 化，未见 handler table 或 dispatcher 结构，遗留标记串仅为命名残留。", [PACKER_TOPIC_SECTION]), "utf8");
  const resultA = runFormalValidation(scenA.taskDir);
  assert(resultA.errors.length === 0, `scenario A must produce zero errors (no more coercion cascade)\nerrors:\n${resultA.errors.join("\n")}`);
  assert(corpusWarnCount(resultA) === 1, `scenario A must produce exactly one corpus WARN\nwarnings:\n${resultA.warnings.join("\n")}`);

  // —— 场景 C ——
  const scenC = startVmpGateScenarioTask(tempRoot, "gate-sem-c");
  scenC.setTask((task) => {
    task.packerUnpack = { present: true, status: "triaged", keyFindings: ["样本存在 VM entry 与 dispatcher 表结构"], notes: [] };
  });
  fs.writeFileSync(path.join(scenC.taskDir, "report.md"), scenC.renderReport("- 事实: 结构特征记录见关键发现。", [PACKER_TOPIC_SECTION]), "utf8");
  const resultC = runFormalValidation(scenC.taskDir);
  assert(resultC.errors.length === 0, `scenario C must produce zero errors\nerrors:\n${resultC.errors.join("\n")}`);
  assert(corpusWarnCount(resultC) === 1, `scenario C must produce exactly one corpus WARN\nwarnings:\n${resultC.warnings.join("\n")}`);

  // —— 场景 D ——
  const scenD = startVmpGateScenarioTask(tempRoot, "gate-sem-d");
  scenD.setTask((task) => {
    task.packerUnpack = { present: true, status: "triaged", keyFindings: ["运行至 OEP 后进程以 ExceptionCode 0xC0000005 终止"], notes: [] };
  });
  fs.writeFileSync(path.join(scenD.taskDir, "report.md"), scenD.renderReport("- 事实: 崩溃现场记录待补。", [PACKER_TOPIC_SECTION]), "utf8");
  const resultD = runFormalValidation(scenD.taskDir);
  assert(
    resultD.errors.some((item) => item.includes("crash evidence")),
    `scenario D must keep the crash-evidence finding alive\nerrors:\n${resultD.errors.join("\n")}`
  );

  // —— 场景 B（黄金数组锁，取值=report-only 改造后实测输出）——
  const scenB = startVmpGateScenarioTask(tempRoot, "gate-sem-b");
  scenB.setTask((task) => {
    task.packerUnpack = {
      present: true,
      status: "investigating",
      keyFindings: ["检出 VM entry 与 dispatcher；handler table 已定位"],
      vmp: {
        present: true,
        mode: "mixed",
        runtimeDependency: { status: "active" },
        antiDebug: { status: "unknown" },
        toolRoutes: [
          { route: "anti-debug-to-oep", status: "selected", decision: "先过反调试" },
          { route: "static-unpack-first-pass", status: "candidate" }
        ],
        devirtualization: { required: true, status: "not-started" },
        oep: { status: "unknown" },
        dump: { status: "not-started" }
      }
    };
  });
  for (const relPath of ["run/vmp-triage-notes.md", "run/oep-proof.md", "run/dump-manifest.json"]) {
    const target = path.join(scenB.taskDir, relPath);
    if (fs.existsSync(target)) {
      fs.rmSync(target);
    }
  }
  fs.writeFileSync(path.join(scenB.taskDir, "report.md"), scenB.renderReport("- 事实: VM entry 与 dispatcher 结构确认，handler table 定位完成。"), "utf8");
  const resultB = runFormalValidation(scenB.taskDir);
  assert(
    JSON.stringify(resultB.errors) === JSON.stringify(goldenTrueVmpFindings),
    `scenario B golden diff drifted (true-VMP obligations must be verbatim-preserved)\nexpected:\n${goldenTrueVmpFindings.join("\n")}\nactual:\n${resultB.errors.join("\n")}`
  );
}

// R2-G04（round2）M10-a 机械锁：义务计数随产物落盘严格递减至 0（全部已满足分支）。
function scenarioObligationCountTracksProgress(tempRoot) {
  const name = "obl-track";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const parseProgress = (stdout) => {
    const partial = stdout.match(/\[closeout-obligations\] 未满足\((\d+)\/(\d+)\)/);
    if (partial) {
      return { n: Number(partial[1]), total: Number(partial[2]) };
    }
    const full = stdout.match(/\[closeout-obligations\] 全部已满足 \(0\/(\d+)\)/);
    if (full) {
      return { n: 0, total: Number(full[1]) };
    }
    throw new Error(`obligation progress line missing from sync stdout\nstdout:\n${stdout}`);
  };

  // 初始缺口（report-only 口径）：report.md 待写 + successCriteria 无 hit +
  // completionCriteria 全 pending，共 3 行未满足；分母全程不变。
  const first = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(first, `task-sync(${name}) #1`);
  const p1 = parseProgress(first.stdout);
  assert(p1.n === 3, `initial obligations must be report+两个判据状态行 (3/${p1.total})，实际 ${p1.n}\nstdout:\n${first.stdout}`);

  // report.md 义务行随实质报告落盘消失
  writeSubstantiveReport(taskDir);
  const second = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(second, `task-sync(${name}) #2`);
  const p2 = parseProgress(second.stdout);
  assert(
    p2.n === p1.n - 1 && p2.total === p1.total,
    `实质 report.md 落盘后计数必须下降 1 (${p1.n}/${p1.total} -> ${p2.n}/${p2.total})`
  );

  // 判据状态两行随 hit + 合法 evidenceRefs 消失（evidenceRefs 指向真实存在文件）
  fs.writeFileSync(path.join(taskDir, "run", "evidence.md"), "# 证据\n\n交付核对输出（QA 夹具）。\n", "utf8");
  const taskJsonPath = path.join(taskDir, "task.json");
  const task = readJson(taskJsonPath);
  task.completionCriteria = [{ text: "核心行为断言全部通过", hit: true, evidenceRefs: ["run/evidence.md"] }];
  task.successCriteria = [{ text: "成功条件：核心行为断言全部通过", status: "done" }];
  writeJson(taskJsonPath, task);
  const third = runNode(taskSyncScript, [name], workspaceRoot);
  ensureOk(third, `task-sync(${name}) #3`);
  const p3 = parseProgress(third.stdout);
  assert(p3.n === 0, `义务清单必须可达全绿，实际 ${p3.n}/${p3.total}\nstdout:\n${third.stdout}`);
  assert(third.stdout.includes("全部已满足 (0"), "terminal state must print the all-green branch");
}

// R2-G05（round2）：corpus 探测行单一通道——语料净提及 VMP 且 vmp.present!==true 时
// sync/init 义务清单出现分诊提醒行；present 置真或语料为纯否定语境时消失（与 G-01
// dry-run/close 的 WARN 同源不同文案、不同生命周期，不开双通道竞争）。
function scenarioVmpCorpusProbeInSyncObligations(tempRoot) {
  const scen = startVmpGateScenarioTask(tempRoot, "gate-probe-line");
  const probeHit = (result) =>
    result.conditional.some((item) => item.includes("任务语料提及 VMP 但 packerUnpack.vmp.present"));

  scen.setTask((task) => {
    task.packerUnpack = { present: true, status: "triaged", keyFindings: ["样本存在 VM entry 与 dispatcher 双重结构特征"], notes: [] };
  });
  const hit = collectCloseoutObligations(scen.taskDir);
  assert(probeHit(hit), "probe line must appear when corpus mentions VMP while present!==true");

  scen.setTask((task) => {
    task.packerUnpack = { ...task.packerUnpack, vmp: { ...(task.packerUnpack?.vmp || {}), present: true } };
  });
  const armed = collectCloseoutObligations(scen.taskDir);
  assert(!probeHit(armed), "probe line must disappear once packerUnpack.vmp.present=true");

  scen.setTask((task) => {
    task.packerUnpack = { ...task.packerUnpack, vmp: { ...(task.packerUnpack?.vmp || {}), present: false }, keyFindings: ["无 VMP 化痕迹，未见 handler table 或 dispatcher 结构"] };
  });
  const negated = collectCloseoutObligations(scen.taskDir);
  assert(!probeHit(negated), "pure negation corpus must not raise the probe line");
}

// R2-G03（round2）：脏数据 fixture 资产化回归锁——marker-only 形态在修正后门禁下
// （三产物齐备时）必须零 error 通过、WARN≤1；夹具来自 E:\ 现场脱敏副本。
function scenarioVmpCoercedDirtyFixture(tempRoot) {
  const fixturePath = path.join(repoRoot, "tools", "qa", "fixtures", "vmp-coerced-dirty-task.json");
  const fixture = readJson(fixturePath);
  assert(
    fixture.packerUnpack?.vmp?.present === true && fixture.packerUnpack?.vmp?.mode === "marker-only",
    "fixture must preserve the coerced dirty shape (vmp.present=true + mode=marker-only)"
  );

  const scen = startVmpGateScenarioTask(tempRoot, "gate-fixture-dirty");
  scen.setTask((task) => {
    task.deliverableTier = fixture.deliverableTier || "evidence";
    task.packerUnpack = fixture.packerUnpack;
  });
  // 产物齐备（对应现场终态）：dump-manifest 已实质化（机器清单类产物义务保留）；
  // 原 vmp-triage-notes / oep-proof 文件义务已退役，report-only 载体 = report.md 的
  // 脱壳/VMP 专题小节（同时满足 packer topic 谓词 minChars=120 与 vmp 谓词 minChars=100）。
  scen.writeTaskFile("run/dump-manifest.json", '{\n  "files": ["sample.unpacked.out.exe"],\n  "timing": "static unpack"\n}\n');
  fs.writeFileSync(
    path.join(scen.taskDir, "report.md"),
    scen.renderReport("- 事实: 标记串仅为命名残留，结构面无虚拟化证据。", [
      {
        heading: "脱壳 / VMP 分诊",
        body:
          "Packer / OEP / dump / IAT rebuild 结论：标准压缩壳一次完整还原，OEP 与 dump 产物核验通过；" +
          "VMP 分诊结论：壳层标记串位于非常规节且未参与执行，无 dispatcher / handler / VM entry 结构，" +
          "按非虚拟化路线收口（QA 夹具实质内容，长度满足两个 minChars 谓词）。"
      }
    ]),
    "utf8"
  );

  const result = runFormalValidation(scen.taskDir);
  assert(result.errors.length === 0, `dirty fixture must pass with zero errors\nerrors:\n${result.errors.join("\n")}`);
  assert((result.warnings || []).length <= 1, `dirty fixture must keep warnings<=1\nwarnings:\n${(result.warnings || []).join("\n")}`);
}

// R2-G02 五句行为锁 + R3'-08（round3 H-09）十句矩阵：否定语境过滤经 WARN 可观测面回归——
// present=false 时 mention=true ⇔ 恰好一条分诊 WARN；mention=false ⇔ 零 WARN。
// 新增五句：副词性反例（「不仅有…」应 true）、D1 抗噪边界句（单 hint 不触发，登记于
// acceptance-criteria）、前置否定远距离反例 ≥2 句（否定词距命中词 5–40 字符应 true——
// 防缩窗后同族误报换位复发）。
function scenarioVmpNegationContextFiltering(tempRoot) {
  const cases = [
    { sentence: "壳已剥离；无 VMP 化痕迹", expectMention: false },
    { sentence: "未见 handler table 或 dispatcher 结构", expectMention: false },
    { sentence: "VMP 相关技术在本样本中不存在", expectMention: false },
    { sentence: "存在 handler table 与 VM entry", expectMention: true },
    { sentence: "VMPProtect begin/end 标记串", expectMention: false },
    // —— round3 扩充（≥10 句）——
    { sentence: "不仅有 dispatcher 还有 handler table", expectMention: true },
    { sentence: "样本不含虚拟化，但存在独立 VM entry 结构", expectMention: false },
    { sentence: "未使用任何 VMP 技术", expectMention: true },
    { sentence: "入口段并无可疑跳转，VMP 保护痕迹为零", expectMention: true },
    { sentence: "全文件扫描并无异常，未检出 VMP 保护结构", expectMention: true }
  ];
  let index = 0;
  for (const { sentence, expectMention } of cases) {
    index += 1;
    const name = `gate-neg-${index}`;
    const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
    ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name})`);
    const target = path.join(taskDir, "task.json");
    const task = readJson(target);
    task.deliverableTier = "evidence";
    task.packerUnpack = { present: true, status: "triaged", keyFindings: [sentence] };
    writeJson(target, task);
    const validation = runFormalValidation(taskDir);
    const warnHits = (validation.warnings || []).filter((item) => item.includes(VMP_CORPUS_WARN_PREFIX)).length;
    assert(
      warnHits === (expectMention ? 1 : 0),
      `negation case "${sentence}" expected mention=${expectMention} (warnHits=${warnHits})\nerrors:\n${validation.errors.join("\n")}\nwarnings:\n${(validation.warnings || []).join("\n")}`
    );
  }
}


// R3'-04/C3+C5（round3 H-04）四态回归锁：pure-* 相位普适 conditional 行与判据状态两行——
// ① phase=Observe 无 pure 文件：pure-* 行不显示；② advance 至 PureExtraction 后显示
// （sync stdout 可观测）；③ 落地 touched pure-* 实现物后消失；④ 判据状态两行在
// 全 pending 任务出现，逐条标 hit 后消失。L1729-1731 informational 行不受影响。
function scenarioCloseoutObligationPreviewFourStates(tempRoot) {
  const name = "obl-preview-4state";
  const { workspaceRoot, taskDir } = startBasicTask(tempRoot, name);
  const pureRow = (obligations) => obligations.conditional.filter((item) => item.startsWith("pure-*:"));
  const criteriaRows = (obligations) =>
    obligations.conditional.filter(
      (item) => item.startsWith("successCriteria 状态：") || item.startsWith("completionCriteria 状态：")
    );

  // 判据状态两行：全 pending（successCriteria 缺席视为零 hit）
  const initial = collectCloseoutObligations(taskDir);
  assert(pureRow(initial).length === 0, "phase=Observe must NOT raise the pure-* preview row");
  assert(criteriaRows(initial).length === 2, "all-pending task must show both criteria-state rows");

  // 状态②：phase=PureExtraction 后 pure-* 行显示（收集器 + sync stdout 双面验证）
  const taskJsonPath = path.join(taskDir, "task.json");
  let task = readJson(taskJsonPath);
  task.phase = "PureExtraction";
  writeJson(taskJsonPath, task);
  const raised = collectCloseoutObligations(taskDir);
  assert(pureRow(raised).length === 1 && pureRow(raised)[0].includes("PureExtraction 及之后阶段"),
    `phase=PureExtraction with no pure file must show the pure-* row\nconditional:\n${raised.conditional.join("\n")}`);
  ensureOk(runNode(taskSyncScript, [name], workspaceRoot), `task-sync(${name}) four-states`);
  // 状态④前半：判据逐条标 hit 后两行消失
  task = readJson(taskJsonPath);
  task.successCriteria = [{ text: "成功条件：入口校验链路已确认", status: "done" }];
  task.completionCriteria = task.completionCriteria.map((item) => ({
    ...item,
    status: "done",
    evidenceRefs: ["run/verify-output.log"]
  }));
  writeJson(taskJsonPath, task);
  fs.writeFileSync(path.join(taskDir, "run", "verify-output.log"), "QA 夹具验证输出。\n", "utf8");
  const criteriaHit = collectCloseoutObligations(taskDir);
  assert(criteriaRows(criteriaHit).length === 0,
    `criteria rows must disappear once all entries hit\nconditional:\n${criteriaHit.conditional.join("\n")}`);

  // 状态③：落地 touched pure-* 实现物后 pure-* 行消失
  fs.writeFileSync(path.join(taskDir, "run", "pure-algorithm.mjs"), "// QA 夹具纯算法实现物\nexport default 1;\n", "utf8");
  const satisfied = collectCloseoutObligations(taskDir);
  assert(pureRow(satisfied).length === 0,
    `touched pure-* artifact must clear the pure-* row\nconditional:\n${satisfied.conditional.join("\n")}`);
}

// R3'-05（round3 H-05）快照行回归锁：跃迁成功输出 `[closeout-obligations] 相位跃迁后义务
// 快照`；同相位重复 advance 与 --json 分支均无快照行；--json stdout 纯净性不被破坏。
function scenarioAdvanceSnapshotOnPhaseTransition(tempRoot) {
  const name = "advance-snapshot";
  const { workspaceRoot } = startBasicTask(tempRoot, name);
  const moved = runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot);
  ensureOk(moved, `task-advance(${name} --to=Capture)`);
  assert((moved.stdout || "").includes("[closeout-obligations] 相位跃迁后义务快照：未满足("),
    `transition advance must print the obligation snapshot line\nstdout:\n${moved.stdout || ""}`);
  const repeat = runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot);
  ensureOk(repeat, `task-advance(${name} --to=Capture again)`);
  assert(!(repeat.stdout || "").includes("相位跃迁后义务快照"),
    `same-phase advance must stay silent about the snapshot\nstdout:\n${repeat.stdout || ""}`);
  const jsonMoved = runNode(taskAdvanceScript, [name, "--to=Rebuild", "--json"], workspaceRoot);
  ensureOk(jsonMoved, `task-advance(${name} --to=Rebuild --json)`);
  const jsonStdout = jsonMoved.stdout || "";
  assert(jsonStdout.split("\n")[0] === "{", "--json stdout first line must stay the JSON opening brace");
  assert(!jsonStdout.includes("相位跃迁后义务快照"), "--json branch must not leak the snapshot line");
  JSON.parse(jsonStdout);
}

// R3'-07（round3 H-06）收口提示行回归锁：verify-once FAIL + 判据缺口 → stderr 出 hint 且
// closeout-attempts.jsonl 仅记 verify-once 一批（≤1 实证）；全绿路径无 hint；
// L398 recover 长文本不提前出现（零 finding 语义变化）。
function scenarioVerifyOnceFailurePrintsCloseoutHint(tempRoot) {
  const { codexHome } = prepareInstalledSkillRoot(tempRoot);

  // —— FAIL + pending 构造 ——
  // report-only 改造：原触发器（assumptions.md OPEN 门禁）已随过程文档门禁退役；
  // 改用 writeReport:false —— report.md 维持开工骨架，verify-once 以
  // 「report.md is still the scaffold template」FAIL（真实的第一阶段失败源）。
  const failing = buildCloseoutReadyTask(tempRoot, "hint-fail", {
    writeReport: false,
    pendingCriteriaIndexes: [0, 1]
  });
  const failRun = runNodeWithEnv(taskCloseScript, ["hint-fail", "--dry-run"], failing.workspaceRoot, {
    CODEX_HOME: codexHome
  });
  assert(failRun.status !== 0, "verify-once failure must exit non-zero");
  const failOutput = `${failRun.stdout}\n${failRun.stderr}`;
  assert(failOutput.includes("[hint] verify-once 未过后"), `hint line must appear on verify-once failure\nstderr:\n${failRun.stderr || ""}`);
  assert(failOutput.includes("completionCriteria pending="), "hint must report pending completion count");
  assert(!failOutput.includes("[recover] 以上是 closeout 字段级形态要求"),
    "recover text belongs to the closeout-gate stage and must not appear at verify-once stage");
  const attemptsPath = path.join(failing.taskDir, "run", "closeout-attempts.jsonl");
  assert(fs.existsSync(attemptsPath), "attempts ledger must exist after failed dry-run");
  const attemptsLines = fs.readFileSync(attemptsPath, "utf8").trim().split("\n").filter(Boolean);
  assert(attemptsLines.length === 1, `attempts ledger must record exactly the verify-once batch (got ${attemptsLines.length})`);
  assert(attemptsLines[0].includes('"verify-once"'), "the single batch must be verify-once");

  // —— 全绿路径无 hint ——
  const green = buildCloseoutReadyTask(tempRoot, "hint-green");
  const greenRun = runNodeWithEnv(taskCloseScript, ["hint-green", "--dry-run"], green.workspaceRoot, {
    CODEX_HOME: codexHome
  });
  ensureOk(greenRun, "green-path dry-run must pass");
  assert(!`${greenRun.stdout}\n${greenRun.stderr}`.includes("[hint] verify-once 未过后"),
    "green path must not print the hint");
}

function scenarioExecutionStatusModuleGraph() {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        "const c = await import('./tools/task/common.mjs');",
        "const r = await import('./tools/task/route-state.mjs');",
        "const v = await import('./tools/task/validation.mjs');",
        "if (typeof c.criteriaItemHit !== 'function' || typeof c.collectCriterionEvidenceRefs !== 'function') throw new Error('common sink missing leaf functions');",
        "if (v.criteriaItemHit !== c.criteriaItemHit || v.collectCriterionEvidenceRefs !== c.collectCriterionEvidenceRefs) throw new Error('validation re-export surface drift');",
        "if (v.CRITERIA_HIT_STATUS_WORDS.join('/') !== 'hit/met/passed/done/satisfied') throw new Error('hit vocabulary drift');",
        "if (typeof r.resolveExecutionState !== 'function') throw new Error('route-state surface broken');",
        "console.log('module-graph-ok');"
      ].join("\n")
    ],
    { cwd: repoRoot, env: process.env, encoding: "utf8" }
  );
  assert(
    result.status === 0 && (result.stdout || "").includes("module-graph-ok"),
    `module graph import must be TDZ-clean with intact re-export surface\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

// R2-G07（round2）：stale-edit 守卫与方向提示行。
// (a) WARN 路径：以 --require 预载补丁模拟「sync 运行期间」外部修改——守卫基线在自愈型
//     setup 之后建立；预载在管线首次写 route-state.json（必然位于守卫窗口内）时对
//     task.json 做一次真实磁盘改写（注入良性键），写前比对必然失配。WARN-only：sync 照常成功。
// (b) 方向提示：真实字段变更后 sync 在 stdout 尾部列出变更 top-level 字段；
// (c) noop sync 两行均不出现。
function scenarioStaleEditGuardAndDirectionHint(tempRoot) {
  const preloadPath = path.join(tempRoot, "qa-race-inject.cjs");
  fs.writeFileSync(
    preloadPath,
    [
      '"use strict";',
      'const fs = require("node:fs");',
      'let injected = false;',
      'const origRead = fs.readFileSync;',
      'const origWrite = fs.writeFileSync;',
      'fs.readFileSync = function (...args) {',
      '  return origRead.apply(fs, args);',
      '};',
      'fs.writeFileSync = function (...args) {',
      '  try {',
      '    const p = String(args[0] || "");',
      '    if (!injected && p.endsWith("route-state.json")) {',
      '      injected = true;',
      '      const taskJsonPath = p.replace(/state[\\\\/]route-state\\.json$/, "task.json");',
      '      const raw = origRead.call(fs, taskJsonPath, "utf8");',
      "      const mutated = raw.replace(/^\\{/, '{\\n  \"qaRaceProbe\": \"external-edit\",');",
      '      if (mutated !== raw) {',
      '        origWrite.call(fs, taskJsonPath, mutated, "utf8");',
      '      }',
      '    }',
      '  } catch (err) {}',
      '  return origWrite.apply(fs, args);',
      '};',
      ''
    ].join("\n"),
    "utf8"
  );

  // (a) 运行期外部修改 → WARN
  const raceName = "stale-race";
  const race = startBasicTask(tempRoot, raceName);
  const raced = spawnSync(
    process.execPath,
    ["--require", preloadPath, taskSyncScript, raceName],
    { cwd: repoRoot, env: makeEnv(race.workspaceRoot), encoding: "utf8" }
  );
  assert(raced.status === 0, `race-injected sync must still succeed\nstderr:\n${raced.stderr}`);
  assert(
    (raced.stderr || "").includes("[contract] task.json 于 sync 运行期间被外部修改"),
    `external modification during sync must WARN\nstderr:\n${raced.stderr}`
  );

  // (b) 真实变更 → 方向提示行列出字段。制造确定性 sync 改写的姿势：手改 task.json 的
  //     routeState 镜像字段制造漂移，sync 从 route-state.json 吸收回正确值并落盘——
  //     提示以进程入口快照为原点列出被 sync 更新的字段（正是"后续编辑前请重读"的目标场景）。
  const hintName = "stale-hint";
  const hint = startBasicTask(tempRoot, hintName);
  ensureOk(runNode(taskSyncScript, [hintName], hint.workspaceRoot), `task-sync(${hintName}) settle`);
  const taskJsonPath = path.join(hint.taskDir, "task.json");
  const tamperedTask = readJson(taskJsonPath);
  tamperedTask.routeState.executionStatus = "blocked-on-user";
  tamperedTask.routeState.pauseReason = "QA 手改镜像漂移探针";
  writeJson(taskJsonPath, tamperedTask);
  const hinted = runNode(taskSyncScript, [hintName], hint.workspaceRoot);
  ensureOk(hinted, `task-sync(${hintName}) after mirror drift`);
  assert(
    /\[contract\] 本次 sync 更新了 task\.json（.+），后续编辑前请重读/.test(hinted.stdout),
    `direction hint must list changed fields\nstdout:\n${hinted.stdout}`
  );
  assert(
    /\[contract\] 本次 sync 更新了 task\.json（.*routeState/.test(hinted.stdout),
    `direction hint should name the resynced mirror fields\nstdout:\n${hinted.stdout}`
  );

  // (c) noop sync → 两行均不出现
  const noop = runNode(taskSyncScript, [hintName], hint.workspaceRoot);
  ensureOk(noop, `task-sync(${hintName}) noop`);
  assert(!noop.stdout.includes("[contract] 本次 sync 更新了"), `noop sync must not print the direction hint\nstdout:\n${noop.stdout}`);
  assert(!(noop.stderr || "").includes("于 sync 运行期间被外部修改"), "noop sync must not print the stale-edit WARN");
}

// R2-G08 的 scenarioPhaseHintNoInducement 已随「[phase] plan/investigation 已存在」
// 提示行一起退役（report-only 改造：这两个文件不再是任何门禁对象，见 task-sync.mjs
// 尾部退役注记）；取而代之的是下方 report.md 字节级恒等锁。

// report-only 改造（替代 R2-G08 来源戳场景）：框架不再向 report.md 注入任何段落
// （syncReportMarkdown / closeout-state 的 upsert 全部退役）。行为锁反转——
// close --dry-run 与正式 close 都不得改动 agent 手写的 report.md（字节级恒等）；
// init 骨架不含任何来源戳（亦无「当前阶段」等机器节）。
function scenarioReportSourceStamps(tempRoot) {
  const dry = buildCloseoutReadyTask(tempRoot, "stamp-dry");
  const dryBefore = fs.readFileSync(path.join(dry.taskDir, "report.md"), "utf8");
  const dryResult = runNode(taskCloseScript, ["stamp-dry", "--dry-run"], dry.workspaceRoot);
  ensureOk(dryResult, "task-close --dry-run(stamp-dry)");
  const dryAfter = fs.readFileSync(path.join(dry.taskDir, "report.md"), "utf8");
  assert(dryAfter === dryBefore, "dry-run must leave agent-written report.md byte-identical");

  const full = buildCloseoutReadyTask(tempRoot, "stamp-close");
  const closeBefore = fs.readFileSync(path.join(full.taskDir, "report.md"), "utf8");
  const { codexHome } = prepareInstalledSkillRoot(tempRoot);
  const closeResult = spawnSync(process.execPath, [taskCloseScript, "stamp-close"], {
    cwd: repoRoot,
    env: { ...makeEnv(full.workspaceRoot), CODEX_HOME: codexHome },
    encoding: "utf8"
  });
  ensureOk(closeResult, "task-close(stamp-close)");
  const closeAfter = fs.readFileSync(path.join(full.taskDir, "report.md"), "utf8");
  assert(closeAfter === closeBefore, "formal close must leave agent-written report.md byte-identical");

  const fresh = startBasicTask(tempRoot, "stamp-fresh");
  const freshReport = fs.readFileSync(path.join(fresh.taskDir, "report.md"), "utf8");
  assert(!freshReport.includes("（autoFix @ "), "init skeleton must carry no autoFix stamp");
  assert(!freshReport.includes("（closeout @ "), "init skeleton must carry no closeout stamp");
  assert(!freshReport.includes("## 当前阶段"), "init skeleton must carry no machine-owned 当前阶段 section");
}

// ===== 多 Agent 协作门禁（win 改造 §2.1–2.3）=====

function startMultiTask(tempRoot, name) {
  const workspaceRoot = path.join(tempRoot, `workspace-${name}`);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  ensureOk(
    runNode(taskStartScript, [name, "--execution-model=multi"], workspaceRoot),
    `task-start(${name}, multi)`
  );
  return {
    workspaceRoot,
    taskDir: path.join(workspaceRoot, "artifacts", "tasks", name),
    ledgerPath: path.join(workspaceRoot, ".ledger", `${name}.jsonl`)
  };
}

function dispatchWorker(workspaceRoot, name, focus) {
  return runNode(taskDispatchScript, [name, "--kind=worker", `--focus=${focus}`], workspaceRoot);
}

function dispatchAudit(workspaceRoot, name, auditKind) {
  return runNode(taskDispatchScript, [name, "--kind=audit", `--audit-kind=${auditKind}`], workspaceRoot);
}

function writeAuditVerdict(taskDir, auditId, verdictLine) {
  const auditPath = path.join(taskDir, "state", "audits", `${auditId}.md`);
  fs.appendFileSync(auditPath, `\n- 审计记录（QA 夹具）。\n\n${verdictLine}\n`, "utf8");
}

// 初始化：multi flag 落契约 + task-created 账本创世事件；哈希链字段完整。
function scenarioCollaborationInitWritesLedger(tempRoot) {
  const name = "collab-init";
  const { taskDir, ledgerPath } = startMultiTask(tempRoot, name);
  const task = readJson(path.join(taskDir, "task.json"));
  assert(task.executionModel?.concurrency === "multi", "task.json must record executionModel.concurrency=multi");
  assert(fs.existsSync(ledgerPath), "multi init must create the shadow ledger");
  const first = JSON.parse(fs.readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/)[0]);
  assert(first.kind === "task-created" && first.seq === 1, "ledger genesis event must be task-created seq=1");
  assert(first.prevHash === "GENESIS" && typeof first.hash === "string" && first.hash.length === 64,
    "genesis event must carry GENESIS prevHash + sha256 hash");
}

// 全链路：无签字拦截 → dispatch 派工/派审 → 裸行 verdict（锁 web 坑点 1/2：缩进/列表
// 前缀不收）→ collect 入账 → 推进放行 → 相位增量锚定 → 伪证拦截 → VIOLATION 拦截 →
// completion-claim 判据在 close 生效。
function scenarioCollaborationMultiFullFlow(tempRoot) {
  const name = "collab-flow";
  const { workspaceRoot, taskDir, ledgerPath } = startMultiTask(tempRoot, name);

  // (1) 未 dispatch 且已有 run/ 产物：advance 必须被拦，报 work-before-dispatch + 缺口清单。
  const earlyArtifact = path.join(taskDir, "run", "early-work.md");
  fs.writeFileSync(earlyArtifact, "# 早于派发的产物\n", "utf8");
  const backdated = new Date(Date.now() - 60000);
  fs.utimesSync(earlyArtifact, backdated, backdated);
  const blocked1 = runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot);
  assert(blocked1.status !== 0, "advance without dispatch evidence must be blocked (multi)");
  const blocked1Out = `${blocked1.stdout}\n${blocked1.stderr}`;
  assert(blocked1Out.includes("协作签字缺失"), `gate must print the signature-missing banner\n${blocked1Out}`);
  assert(blocked1Out.includes("work-before-dispatch"), `gate must cite work-before-dispatch\n${blocked1Out}`);
  fs.rmSync(earlyArtifact);

  // (2) dispatch 通道派工：包文件落盘 + 头部 dispatch 标记 + 账本 dispatch-worker 事件。
  ensureOk(dispatchWorker(workspaceRoot, name, "入口校验链路静态分析"), "dispatch worker");
  const pkgPath = path.join(taskDir, "state", "packages", "package-001.md");
  assert(fs.existsSync(pkgPath), "worker package must land at state/packages/package-001.md");
  const pkgText = fs.readFileSync(pkgPath, "utf8");
  assert(/<!--\s*dispatch:\s*[0-9a-f]{16}\s*-->/.test(pkgText), "package must carry the dispatch marker header");
  assert(fs.readFileSync(ledgerPath, "utf8").includes('"dispatch-worker"'), "ledger must record dispatch-worker");

  // (3) dispatch 派审 + verdict 形态锁定：缩进的 `- verdict:` 不收（web 坑点 1/2）。
  ensureOk(dispatchAudit(workspaceRoot, name, "phase-gate"), "dispatch phase-gate audit");
  writeAuditVerdict(taskDir, "audit-001", "- verdict: PASS");
  const collectBad = runNode(taskDispatchScript, [name, "--collect=audit-001"], workspaceRoot);
  assert(collectBad.status !== 0, "indented/list-prefixed verdict must NOT be collectible");
  writeAuditVerdict(taskDir, "audit-001", "verdict: PASS");
  ensureOk(runNode(taskDispatchScript, [name, "--collect=audit-001"], workspaceRoot), "collect audit-001 PASS");
  assert(fs.readFileSync(ledgerPath, "utf8").includes('"audit-verdict"'), "ledger must record audit-verdict");

  // (4) 协作证据齐备 → 推进放行，账本落 phase-advance。
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot), "advance to Capture after signatures");
  assert(fs.readFileSync(ledgerPath, "utf8").includes('"phase-advance"'), "ledger must record phase-advance");
  assert(readJson(path.join(taskDir, "task.json")).phase === "Capture", "task.json phase must be Capture");

  // (5) 伪证拦截：手写无标记包文件 → package-not-dispatched。
  fs.writeFileSync(path.join(taskDir, "state", "packages", "package-999.md"), "# 手写伪证\n", "utf8");
  const blocked2 = runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot);
  assert(blocked2.status !== 0, "hand-written package must block advance");
  assert(
    `${blocked2.stdout}\n${blocked2.stderr}`.includes("package-not-dispatched"),
    `gate must cite package-not-dispatched\n${blocked2.stdout}\n${blocked2.stderr}`
  );
  fs.rmSync(path.join(taskDir, "state", "packages", "package-999.md"));

  // (6) 相位增量锚定：Capture 相位内先给 VIOLATION（不收）→ 拦；再补 PASS → 放。
  ensureOk(dispatchWorker(workspaceRoot, name, "捕获面核对"), "dispatch worker for Capture");
  ensureOk(dispatchAudit(workspaceRoot, name, "phase-gate"), "dispatch second audit");
  writeAuditVerdict(taskDir, "audit-002", "verdict: VIOLATION");
  ensureOk(runNode(taskDispatchScript, [name, "--collect=audit-002"], workspaceRoot), "collect VIOLATION verdict");
  const blocked3 = runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot);
  assert(blocked3.status !== 0, "VIOLATION verdict must block advance");
  assert(
    `${blocked3.stdout}\n${blocked3.stderr}`.includes("no-passing-audit-this-phase"),
    `gate must cite no-passing-audit-this-phase\n${blocked3.stdout}\n${blocked3.stderr}`
  );
  ensureOk(dispatchAudit(workspaceRoot, name, "phase-gate"), "dispatch third audit");
  writeAuditVerdict(taskDir, "audit-003", "verdict: PASS");
  ensureOk(runNode(taskDispatchScript, [name, "--collect=audit-003"], workspaceRoot), "collect audit-003 PASS");
  ensureOk(runNode(taskAdvanceScript, [name, "--to=Rebuild"], workspaceRoot), "advance to Rebuild after PASS");

  // (7) completion-claim 判据：未做完成宣称审计 → closeout gate 报
  //     collaboration[no-completion-claim-audit]；补齐 completion-claim PASS 后该前缀
  //     错误消失。直接调 evaluateCloseoutGate（CLI 的 close 在 verify-once 失败时根本走不到
  //     gate 层，本场景契约面是 gate 判定本身）。注意：in-process 调用需临时把账本根
  //     指到本工作区（makeEnv 只影响子进程）。
  const previousLedgerRoot = process.env.WIN_REVERSE_LEDGER_ROOT;
  process.env.WIN_REVERSE_LEDGER_ROOT = path.join(workspaceRoot, ".ledger");
  try {
    const gateBefore = evaluateCloseoutGate(taskDir);
    assert(
      gateBefore.errors.some((entry) => entry.includes("collaboration[no-completion-claim-audit]")),
      `closeout gate must cite the completion-claim collaboration gap\nerrors:\n${gateBefore.errors.join("\n")}`
    );
    ensureOk(dispatchAudit(workspaceRoot, name, "completion-claim"), "dispatch completion-claim audit");
    writeAuditVerdict(taskDir, "audit-004", "verdict: PASS");
    ensureOk(runNode(taskDispatchScript, [name, "--collect=audit-004"], workspaceRoot), "collect completion-claim PASS");
    // 当前相位（Rebuild）的增量也要补齐：close 的门禁面 = 当前相位包 + 当前相位 PASS + completion-claim PASS。
    ensureOk(dispatchWorker(workspaceRoot, name, "重建面核对"), "dispatch worker for Rebuild");
    ensureOk(dispatchAudit(workspaceRoot, name, "phase-gate"), "dispatch Rebuild phase-gate audit");
    writeAuditVerdict(taskDir, "audit-005", "verdict: PASS");
    ensureOk(runNode(taskDispatchScript, [name, "--collect=audit-005"], workspaceRoot), "collect Rebuild phase-gate PASS");
    const gateAfter = evaluateCloseoutGate(taskDir);
    assert(
      !gateAfter.errors.some((entry) => entry.includes("collaboration[")),
      `collaboration errors must clear after completion-claim PASS\nerrors:\n${gateAfter.errors.join("\n")}`
    );
  } finally {
    if (previousLedgerRoot === undefined) {
      delete process.env.WIN_REVERSE_LEDGER_ROOT;
    } else {
      process.env.WIN_REVERSE_LEDGER_ROOT = previousLedgerRoot;
    }
  }
}

// single/legacy：协作门禁整体跳过（advance 放行、无协作噪音、不建账本）。
function scenarioCollaborationSingleModeSkipsGate(tempRoot) {
  const name = "collab-single-quiet";
  const workspaceRoot = path.join(tempRoot, `workspace-${name}`);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  ensureOk(
    runNode(taskStartScript, [name, "--execution-model=single"], workspaceRoot),
    `task-start(${name}, single)`
  );
  const taskDir = path.join(workspaceRoot, "artifacts", "tasks", name);
  assert(
    readJson(path.join(taskDir, "task.json")).executionModel?.concurrency === "single",
    "task.json must record executionModel.concurrency=single"
  );
  assert(
    !fs.existsSync(path.join(workspaceRoot, ".ledger", `${name}.jsonl`)),
    "single mode must not create a shadow ledger"
  );
  const advanced = runNode(taskAdvanceScript, [name, "--to=Capture"], workspaceRoot);
  ensureOk(advanced, "single mode advance must not be blocked by collaboration gate");
  const output = `${advanced.stdout}\n${advanced.stderr}`;
  assert(!output.includes("协作签字缺失") && !output.includes("[collaboration]"),
    `single mode must not emit collaboration gate noise\n${output}`);
}

// F-13：ctx 注入共享工具，三簇场景以解构名参与下方 main() 调用序列（调用点未变）。
const scenarioModuleCtx = {
  assert, fs, path, os, crypto, spawnSync,
  repoRoot, taskStartScript, taskSyncScript, taskAdvanceScript, taskDrillScript, taskCloseScript, taskProbeScript, taskInitScript, taskDispatchScript,
  makeEnv, runNode, runNodeWithEnv, ensureOk, writeJson, readJson, sha256Text,
  seedExternalResearch, startBasicTask, buildCloseoutReadyTask, prepareInstalledSkillRoot,
  evaluateRouteConsistency, detectWebShellTech,
  readTaskJson, taskFileMatchesTemplate, writeSubstantiveReport
};
const {
  scenarioCloseoutHappyPathMergesHandEditedClues,
  scenarioCloseoutMirrorDriftIsResynced,
  scenarioCloseoutAntiShortcutGates,
  scenarioCloseoutDryRunReroutesValidationState,
  scenarioCloseoutDryRunHasNoSideEffects,
  scenarioCloseoutFreezesNewTopicInference,
  scenarioCloseoutLossyRouteStateBlocks,
  scenarioCloseoutMixedHandEditPreservesFreeText,
  scenarioFirstSyncHasNoViewGuardNoise,
  scenarioViewGuardSelfCompareNoFalsePositive,
  scenarioViewGuardStateMigrationNoFalsePositive,
  scenarioRouteConsistencyVerbatimWithHashLines,
  scenarioViewGuardLegacyViewWithoutHashFallsBack,
  scenarioViewGuardWarningIncludesFirstLineSummary,
  scenarioTopicPackTemplatesAreNotMaterialized,
  scenarioTopicPackMissingArtifactFindingFlow
} = {
  ...createCloseoutViewScenarios(scenarioModuleCtx),
  ...createViewGuardScenarios(scenarioModuleCtx),
  ...createTopicPackScenarios(scenarioModuleCtx)
};

// 场景注册表：数组顺序即原串行语义顺序。--shard=i/n 按 index%n===i 切片，
// 由 tools/qa/run-task-behavior.mjs 以多进程并发驱动（每分片独立 tempRoot 与进程）。
const SCENARIOS = [
  ["scenarioTaskLifecycle", scenarioTaskLifecycle],
  ["scenarioSchemaEnforcement", scenarioSchemaEnforcement],
  ["scenarioTaskInitInlineJsonRejected", scenarioTaskInitInlineJsonRejected],
  ["scenarioTaskInitDirExistsGuidance", scenarioTaskInitDirExistsGuidance],
  ["scenarioContractLockBlocksAutoAdvance", scenarioContractLockBlocksAutoAdvance],
  ["scenarioAdvanceJsonStdoutStaysPureThroughProbeBranch", scenarioAdvanceJsonStdoutStaysPureThroughProbeBranch],
  ["scenarioAdvanceToPhaseMovesForward", scenarioAdvanceToPhaseMovesForward],
  ["scenarioAdvanceToBogusPhaseRejected", scenarioAdvanceToBogusPhaseRejected],
  ["scenarioAdvanceToEarlierPhaseRejected", scenarioAdvanceToEarlierPhaseRejected],
  ["scenarioAdvanceToSamePhaseHintsAndJsonStaysPure", scenarioAdvanceToSamePhaseHintsAndJsonStaysPure],
  ["scenarioDefaultRouteDoesNotInferWebShell", scenarioDefaultRouteDoesNotInferWebShell],
  ["scenarioCrashDiagnosticsAndGenericBackupGuard", scenarioCrashDiagnosticsAndGenericBackupGuard],
  ["scenarioFormalValidationRequiresCoreContract", scenarioFormalValidationRequiresCoreContract],
  ["scenarioDrillFlow", scenarioDrillFlow],
  ["scenarioDrillListBypassesWorkspaceGuard", scenarioDrillListBypassesWorkspaceGuard],
  ["scenarioUserPauseSemantics", scenarioUserPauseSemantics],
  ["scenarioRiskActionAutoPause", scenarioRiskActionAutoPause],
  ["scenarioWorkspaceGuard", scenarioWorkspaceGuard],
  ["scenarioArchiveSnapshot", scenarioArchiveSnapshot],
  ["scenarioWebShellTechDetection", scenarioWebShellTechDetection],
  ["scenarioWebShellTopicAutoAdvance", scenarioWebShellTopicAutoAdvance],
  ["scenarioWebShellTopicAutoInference", scenarioWebShellTopicAutoInference],
  ["scenarioInvalidTaskIdIsRejected", scenarioInvalidTaskIdIsRejected],
  ["scenarioPartialCompletionCriteriaBlocksCloseout", scenarioPartialCompletionCriteriaBlocksCloseout],
  ["scenarioCompletionCriteriaRequiresEvidenceRefs", scenarioCompletionCriteriaRequiresEvidenceRefs],
  ["scenarioReferenceOnlyTopicsAreRoutable", scenarioReferenceOnlyTopicsAreRoutable],
  ["scenarioCloseoutHappyPathMergesHandEditedClues", scenarioCloseoutHappyPathMergesHandEditedClues],
  ["scenarioCloseoutMirrorDriftIsResynced", scenarioCloseoutMirrorDriftIsResynced],
  ["scenarioCloseoutAntiShortcutGates", scenarioCloseoutAntiShortcutGates],
  ["scenarioCloseoutDryRunReroutesValidationState", scenarioCloseoutDryRunReroutesValidationState],
  ["scenarioCloseoutDryRunHasNoSideEffects", scenarioCloseoutDryRunHasNoSideEffects],
  ["scenarioCloseoutFreezesNewTopicInference", scenarioCloseoutFreezesNewTopicInference],
  ["scenarioCloseoutLossyRouteStateBlocks", scenarioCloseoutLossyRouteStateBlocks],
  ["scenarioCloseoutMixedHandEditPreservesFreeText", scenarioCloseoutMixedHandEditPreservesFreeText],
  ["scenarioWriteTaskJsonDiffVisibility", scenarioWriteTaskJsonDiffVisibility],
  ["scenarioNativeNotesDoNotRatchetWebShell", scenarioNativeNotesDoNotRatchetWebShell],
  ["scenarioWebShellVerdictOverridesNoHit", scenarioWebShellVerdictOverridesNoHit],
  ["scenarioWebShellVerdictRejectedOnMeaningfulHit", scenarioWebShellVerdictRejectedOnMeaningfulHit],
  ["scenarioVerdictDeleteThenRescanRestoresHit", scenarioVerdictDeleteThenRescanRestoresHit],
  ["scenarioVerdictForgedNoHitRescanRestoresHit", scenarioVerdictForgedNoHitRescanRestoresHit],
  ["scenarioVerdictNoCandidatesKeepsShortCircuit", scenarioVerdictNoCandidatesKeepsShortCircuit],
  ["scenarioVerdictForgedNoHitDirectCloseRescans", scenarioVerdictForgedNoHitDirectCloseRescans],
  ["scenarioDirectCloseWithoutResultFileRescans", scenarioDirectCloseWithoutResultFileRescans],
  ["scenarioExcludedTopicsBypassFormalValidation", scenarioExcludedTopicsBypassFormalValidation],
  ["scenarioInvalidDeliverableTierRejected", scenarioInvalidDeliverableTierRejected],
  ["scenarioDeliverableTierFlipLeavesTrail", scenarioDeliverableTierFlipLeavesTrail],
  ["scenarioDeliverableTierFlipDirectCloseLeavesTrail", scenarioDeliverableTierFlipDirectCloseLeavesTrail],
  ["scenarioExcludeAllTopicsFailsClosed", scenarioExcludeAllTopicsFailsClosed],
  ["scenarioAutoRouteMarkerNarrowing", scenarioAutoRouteMarkerNarrowing],
  ["scenarioExcludeSingleTopicStillPasses", scenarioExcludeSingleTopicStillPasses],
  ["scenarioExcludedTopicsReorderLeavesNoChangedTrail", scenarioExcludedTopicsReorderLeavesNoChangedTrail],
  ["scenarioLegacyRatchetTaskHealsOnResume", scenarioLegacyRatchetTaskHealsOnResume],
  ["scenarioLocalReproDeliveryGate", scenarioLocalReproDeliveryGate],
  ["scenarioFirstSyncHasNoViewGuardNoise", scenarioFirstSyncHasNoViewGuardNoise],
  ["scenarioViewGuardSelfCompareNoFalsePositive", scenarioViewGuardSelfCompareNoFalsePositive],
  ["scenarioViewGuardStateMigrationNoFalsePositive", scenarioViewGuardStateMigrationNoFalsePositive],
  ["scenarioRouteConsistencyVerbatimWithHashLines", scenarioRouteConsistencyVerbatimWithHashLines],
  ["scenarioViewGuardLegacyViewWithoutHashFallsBack", scenarioViewGuardLegacyViewWithoutHashFallsBack],
  ["scenarioEntrypointStatusSkipNormalizesToSkipped", scenarioEntrypointStatusSkipNormalizesToSkipped],
  ["scenarioEntrypointStatusUnknownWarnsWithVocabulary", scenarioEntrypointStatusUnknownWarnsWithVocabulary],
  ["scenarioAllEntrypointsSkippedTriggersExhaustedBranch", scenarioAllEntrypointsSkippedTriggersExhaustedBranch],
  ["scenarioEp002ExhaustedAfterScannedNoHit", scenarioEp002ExhaustedAfterScannedNoHit],
  ["scenarioEp002ExhaustedAfterVerdictNotWebShell", scenarioEp002ExhaustedAfterVerdictNotWebShell],
  ["scenarioEp002StaysCandidateWhenUnscanned", scenarioEp002StaysCandidateWhenUnscanned],
  ["scenarioViewGuardWarningIncludesFirstLineSummary", scenarioViewGuardWarningIncludesFirstLineSummary],
  ["scenarioRunLocalPyBridgedAsProxyStub", scenarioRunLocalPyBridgedAsProxyStub],
  ["scenarioRunLocalPs1BridgedAsProxyStub", scenarioRunLocalPs1BridgedAsProxyStub],
  ["scenarioRunLocalStubSatisfiesGate", scenarioRunLocalStubSatisfiesGate],
  ["scenarioBridgedScriptsUpsertMerges", scenarioBridgedScriptsUpsertMerges],
  ["scenarioPreGateWarnsSuppressedBeforeRebuild", scenarioPreGateWarnsSuppressedBeforeRebuild],
  ["scenarioPreGateWarnsAtRebuild", scenarioPreGateWarnsAtRebuild],
  ["scenarioPreGateWarnsOnInvalidPhaseAnyPhase", scenarioPreGateWarnsOnInvalidPhaseAnyPhase],
  ["scenarioPreGateWarnsClearWhenArtifactsReady", scenarioPreGateWarnsClearWhenArtifactsReady],
  ["scenarioInvalidPhaseErrorListsLegalValues", scenarioInvalidPhaseErrorListsLegalValues],
  ["scenarioBackupManifestHashMismatchBlocksAdvance", scenarioBackupManifestHashMismatchBlocksAdvance],
  ["scenarioBackupManifestMissingWarnsAndMaterializes", scenarioBackupManifestMissingWarnsAndMaterializes],
  ["scenarioBackupManifestMalformedAdvanceWarnsOnly", scenarioBackupManifestMalformedAdvanceWarnsOnly],
  ["scenarioBackupManifestMalformedCloseFailsClosed", scenarioBackupManifestMalformedCloseFailsClosed],
  ["scenarioBackupManifestCleanedOriginalKeepsWarning", scenarioBackupManifestCleanedOriginalKeepsWarning],
  ["scenarioBackupManifestExternalPathBlocksAdvance", scenarioBackupManifestExternalPathBlocksAdvance],
  ["scenarioBackupManifestExternalPathCloseHashWarnsOnly", scenarioBackupManifestExternalPathCloseHashWarnsOnly],
  ["scenarioRunLocalGateFollowsDeliverableTier", scenarioRunLocalGateFollowsDeliverableTier],
  ["scenarioEnvProbeReportsR2CliFallback", scenarioEnvProbeReportsR2CliFallback],
  ["scenarioCwdHintFromTaskSubdirectory", scenarioCwdHintFromTaskSubdirectory],
  ["scenarioPreGateWarnsOnInvalidTierAnyPhase", scenarioPreGateWarnsOnInvalidTierAnyPhase],
  ["scenarioPreGateTopicFormalSummaryAtRebuild", scenarioPreGateTopicFormalSummaryAtRebuild],
  ["scenarioPreGateHitCriteriaWithoutEvidenceWarns", scenarioPreGateHitCriteriaWithoutEvidenceWarns],
  ["scenarioPreGateNewRulesClearWhenFixed", scenarioPreGateNewRulesClearWhenFixed],
  ["scenarioAllSkippedTriggersConsistentExhaustedJudgment", scenarioAllSkippedTriggersConsistentExhaustedJudgment],
  ["scenarioContractFixReclassifiesCorrection", scenarioContractFixReclassifiesCorrection],
  ["scenarioContractFixLegalToLegalStaysManualOverride", scenarioContractFixLegalToLegalStaysManualOverride],
  ["scenarioContractFixWashoutSequenceStaysManualOverride", scenarioContractFixWashoutSequenceStaysManualOverride],
  ["scenarioContractFixMissingBaselineStaysManualOverride", scenarioContractFixMissingBaselineStaysManualOverride],
  ["scenarioNoopSyncDoesNotRefreshTaskJsonMtime", scenarioNoopSyncDoesNotRefreshTaskJsonMtime],
  ["scenarioVmpGateSemanticNarrowing", scenarioVmpGateSemanticNarrowing],
  ["scenarioVmpCoercedDirtyFixture", scenarioVmpCoercedDirtyFixture],
  ["scenarioVmpNegationContextFiltering", scenarioVmpNegationContextFiltering],
  ["scenarioObligationCountTracksProgress", scenarioObligationCountTracksProgress],
  ["scenarioVmpCorpusProbeInSyncObligations", scenarioVmpCorpusProbeInSyncObligations],
  ["scenarioCloseoutObligationPreviewFourStates", scenarioCloseoutObligationPreviewFourStates],
  ["scenarioAdvanceSnapshotOnPhaseTransition", scenarioAdvanceSnapshotOnPhaseTransition],
  ["scenarioVerifyOnceFailurePrintsCloseoutHint", scenarioVerifyOnceFailurePrintsCloseoutHint],
  ["scenarioStaleEditGuardAndDirectionHint", scenarioStaleEditGuardAndDirectionHint],
  ["scenarioReportSourceStamps", scenarioReportSourceStamps],
  ["scenarioTopicPackTemplatesAreNotMaterialized", scenarioTopicPackTemplatesAreNotMaterialized],
  ["scenarioTopicPackMissingArtifactFindingFlow", scenarioTopicPackMissingArtifactFindingFlow],
  ["scenarioReadyToCloseShortCircuit", scenarioReadyToCloseShortCircuit],
  ["scenarioReadyToCloseNegativeLocks", scenarioReadyToCloseNegativeLocks],
  ["scenarioCollaborationInitWritesLedger", scenarioCollaborationInitWritesLedger],
  ["scenarioCollaborationMultiFullFlow", scenarioCollaborationMultiFullFlow],
  ["scenarioCollaborationSingleModeSkipsGate", scenarioCollaborationSingleModeSkipsGate],
  ["scenarioExecutionStatusModuleGraph", scenarioExecutionStatusModuleGraph],
];

function parseShardArg() {
  const arg = process.argv.slice(2).find((value) => value.startsWith("--shard="));
  if (!arg) {
    return { shardIndex: 0, shardCount: 1 };
  }
  const match = arg.match(/^--shard=(\d+)\/(\d+)$/);
  if (!match || Number(match[2]) < 1 || Number(match[1]) >= Number(match[2])) {
    throw new Error(`illegal --shard value: ${arg}（期望 --shard=i/n，0<=i<n）`);
  }
  return { shardIndex: Number(match[1]), shardCount: Number(match[2]) };
}

function main() {
  const { shardIndex, shardCount } = parseShardArg();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "win-reverse-behavior-"));
  let ran = 0;
  try {
    SCENARIOS.forEach(([name, fn], index) => {
      if (index % shardCount !== shardIndex) {
        return;
      }
      ran += 1;
      // 分片失败定位锚点：场景名先打出来，断言抛错时本分片输出最后一行即失事现场。
      console.log(`[scenario ${index}] ${name}`);
      fn(tempRoot);
    });
    const shardLabel = shardCount > 1 ? `[shard ${shardIndex}/${shardCount}]` : "";
    console.log(`check-task-behavior${shardLabel}: OK (${ran} scenarios)`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main();

