import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ensureTaskRuntimeShape,
  ensureTaskArmed,
  ensureTaskFileFromTemplate,
  normalizePhaseName,
  phaseOrder,
  readBackupManifestMap,
  readBackupManifestEntries,
  relFromRepo,
  resolveTaskDir,
  writeTaskJson,
  verifyObjectiveHash,
  recordObjectiveMutation
} from "./common.mjs";
import {
  applyRouteStateToTask,
  normalizeRouteStateDocument,
  readRouteStateDocument,
  resolveExecutionState,
  syncMarkdownViews,
  writeRouteStateDocument
} from "./route-state.mjs";
import { evaluateCollaboration, resolveExecutionModel } from "./lib/collaboration.mjs";
import { appendLedgerEvent, latestLedgerEvent, readLedger } from "./lib/ledger.mjs";
// R3'-05（round3 H-05，C4 裁决）：静态 import 照抄 task-sync.mjs 先例（task-init L31 /
// task-sync L28 同款；validation.mjs 不反向依赖 advance，无导入环）。
import { collectCloseoutObligations } from "./validation.mjs";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const taskRef = args.find((item) => !item.startsWith("--"));
  if (!taskRef) {
    console.error("usage: node tools/task/task-advance.mjs <task-id|task-path> [--to=<phase>] [--pause-category=none|user|risk|internal] [--pause-reason=\"...\"] [--json]");
    process.exit(1);
  }

  const pauseCategory = args.find((item) => item.startsWith("--pause-category="))?.split("=")[1] || "";
  const pauseReason = args.find((item) => item.startsWith("--pause-reason="))?.split("=").slice(1).join("=") || "";
  const toArg = args.find((item) => item.startsWith("--to="));
  const toPhase = toArg === undefined ? null : toArg.split("=").slice(1).join("=");
  const json = args.includes("--json");

  return {
    taskRef,
    pauseCategory,
    pauseReason,
    toPhase,
    json
  };
}

function runComplianceCheck(taskDir) {
  const crashFlagPath = path.join(taskDir, "run/crash_state.flag");
  const diagnosticsPath = path.join(taskDir, "run/crash-diagnostics.md");
  const legacyDiagnosticsPath = path.join(taskDir, "run/crash_diagnostics.md");

  // 1. 物理检查：如果目标处于崩溃闪退状态
  if (fs.existsSync(crashFlagPath)) {
    const readableDiagnosticsPath = fs.existsSync(diagnosticsPath) ? diagnosticsPath : legacyDiagnosticsPath;
    if (!fs.existsSync(readableDiagnosticsPath)) {
      console.error("\x1b[31m[RULE VIOLATION] 物理阻断：检测到目标处于崩溃闪退状态，但您未提供硬件诊断日志（run/crash-diagnostics.md）。\n请挂载调试器（如 Windbg/x64dbg）或抓取操作系统事件查看器日志，填入诊断文件后再尝试推进任务！\x1b[0m");
      process.exit(1);
    }

    const content = fs.readFileSync(readableDiagnosticsPath, "utf8");
    if (content.length < 200) {
      console.error("\x1b[31m[RULE VIOLATION] 物理阻断：检测到您的 run/crash-diagnostics.md 诊断日志体积过小（少于 200 字符）。\n请不要进行简单的文字敷衍与自我合理化辩解，必须填入第一手的寄存器状态或操作系统报错日志！\x1b[0m");
      process.exit(1);
    }

    // 正则特征审计：必须含有寄存器、地址、调试工具或 Exception 字眼，防止文字敷衍
    const regex = /(eip|rip|exception|0x[0-9a-fA-F]+|windbg|eventvwr|x64dbg|addr|crash|dump)/i;
    if (!regex.test(content)) {
      console.error("\x1b[31m[RULE VIOLATION] 物理阻断：检测到您的 run/crash-diagnostics.md 诊断报告中未包含任何硬件调试器、崩溃堆栈或寄存器相关的客观特征数据（如 EIP/RIP、十六进制地址 0x...、exception、windbg、eventvwr等）。\n请老老实实获取并填入底层调试证据，拒绝空洞的非合规自我合理化文字！\x1b[0m");
      process.exit(1);
    }
  }

  // 2. 动态哈希一致性交叉核对
  const runDir = path.join(taskDir, "run");
  if (fs.existsSync(runDir)) {
    const files = fs.readdirSync(runDir);
    const backupFiles = files.filter((f) => f.endsWith(".clean.bak"));

    // V2-7 断路器默认生效：首次发现 .clean.bak 而 manifest 缺失时按需落地模板；
    // manifest 里解析不到有效原始路径的备份不再静默跳过，逐条 WARNING 指明期望格式。
    if (backupFiles.length > 0 && !fs.existsSync(path.join(runDir, "backup-manifest.md"))) {
      ensureTaskFileFromTemplate(taskDir, "run/backup-manifest.md");
    }
    const manifestMap = readBackupManifestMap(runDir);

    // R1-S1 发现源 = run/ 扫描 ∪ manifest 登记：备份可放 run/ 之外，
    // manifest 第二列登记备份绝对路径即纳入断路器（此前 run/ 之外的备份整体静默跳过）。
    const discovered = new Map();
    for (const backupName of backupFiles) {
      discovered.set(backupName, path.join(runDir, backupName));
    }
    for (const entry of readBackupManifestEntries(runDir)) {
      if (!discovered.has(entry.backupName) && fs.existsSync(entry.backupPath)) {
        discovered.set(entry.backupName, entry.backupPath);
      }
    }

    for (const [backupName, backupPath] of discovered) {
      const originalPath = manifestMap.get(backupName);

      if (!originalPath || !fs.existsSync(originalPath)) {
        // 去教程化（win 改造 §2.4.3）：不再披露期望行格式——格式定义见模板文件本身。
        console.warn(
          `[backup-manifest] WARNING: 备份 ${backupName} 未在 run/backup-manifest.md 解析到有效原始路径，哈希断路器对其不生效。` +
          `修复通道：参照 run/backup-manifest.md 的既有登记行补齐该备份的原始路径与哈希` +
          `（宽容期仅 WARNING 可推进；若属格式错误，close 阶段将升级为 error 物理阻断）`
        );
        continue;
      }

      const currentHash = sha256File(originalPath);
      const backupHash = sha256File(backupPath);

      if (currentHash !== backupHash) {
        const authFlagPath = path.join(runDir, "hash_mismatch_authorized.flag");
        if (!fs.existsSync(authFlagPath)) {
          console.error(`\x1b[31m[RULE VIOLATION] 物理阻断：检测到原始文件 [${path.basename(originalPath)}] 的当前 SHA256 哈希值与干净备份不一致！\n这说明您的工作环境现场处于受损、盲改或未完全恢复的脏状态。\n为了防止对分析现场的二次污染，系统已锁死推进。请重新执行物理还原，或在确认修改合理时创建 run/hash_mismatch_authorized.flag 进行哈希豁免！\x1b[0m`);
          process.exit(1);
        }
      }
    }
  }
}

function main() {
  const { taskRef, pauseCategory, pauseReason, toPhase, json } = parseArgs(process.argv);
  const taskDir = resolveTaskDir(taskRef);

  // 物理守门人立体拦截门禁
  runComplianceCheck(taskDir);

  const task = ensureTaskRuntimeShape(ensureTaskArmed(taskDir));
  const __objCheck = verifyObjectiveHash(task);
  if (!__objCheck.ok) {
    recordObjectiveMutation(taskDir, __objCheck);
    console.error(`[contract-lock] objective was mutated after task-init (hash mismatch). ` +
      `The change has been recorded to run/contract-change-log.md. ` +
      `Restore the original objective, or stop and obtain explicit user authorization before continuing.`);
    process.exit(1);
  }

  // report-only 改造：原「C: T3+ 外部研究物理阻断」（state/external-research.md 实体文件
  // 存在 + ≥200 字符 + query/sources/findings 三节）随过程文档门禁整体退役——
  // 外部调研结论汇入收口 report.md（坑点与经验/专题发现节），不再要求中途建档。
  // env-capability.json 不再作门禁数据源；T4+ 的调研提醒降为 task-close advisory
  // （validation.mjs collectValidationWarnings 同源）。

  let routeState = readRouteStateDocument(taskDir, task);

  if (!routeState) {
    console.error("task-advance: route-state.json is missing or unreadable; run task-sync first");
    process.exit(1);
  }

  routeState = normalizeRouteStateDocument(routeState, task);

  // O1：显式阶段推进 --to=<phase>。词表与归一化 import 自 common.mjs 单源，禁止复制。
  // 只前进不回退（无 --allow-regress、无例外通道）；报错全部走 stderr。
  let phaseUnchangedHint = "";
  let phaseTransitioned = false;
  let ledgerFromPhase = normalizePhaseName(task.phase) || "Observe";
  if (toPhase !== null) {
    if (!toPhase.trim()) {
      console.error(`task-advance: --to 值为空；合法值: ${phaseOrder.join("|")}；用法: --to=<phase>`);
      process.exit(1);
    }
    const targetPhase = normalizePhaseName(toPhase);
    if (!phaseOrder.includes(targetPhase)) {
      console.error(`task-advance: 非法 phase "${toPhase}"；合法值: ${phaseOrder.join("|")}`);
      process.exit(1);
    }
    const currentPhase = normalizePhaseName(task.phase) || "Observe";
    ledgerFromPhase = currentPhase;
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const targetIndex = phaseOrder.indexOf(targetPhase);
    if (targetIndex < currentIndex) {
      console.error(`task-advance: 不允许回退（${currentPhase} → ${targetPhase}）；本工具只支持显式前进，无回退通道`);
      process.exit(1);
    }
    if (targetIndex === currentIndex) {
      phaseUnchangedHint = `phase 未变（仍为 ${currentPhase}）；阶段切换请用 task-advance --to=<phase>，合法值：${phaseOrder.join(" / ")}`;
    } else {
      // 多 Agent 协作门禁（win 改造 §2.2，仅 multi）：推进前要求本相位协作证据增量——
      // 经 dispatch 通道产生的任务包 + verdict: PASS 的 phase-gate 审计入账 +
      // 通道/时序三判据。single/legacy 模式整体跳过（advisory 只会是噪音：无账本是其
      // 设计态；协作可见性由 multi 任务的 task-sync 摘要行承担）。
      if (resolveExecutionModel(task) === "multi") {
        const collaboration = evaluateCollaboration(taskDir, task, {});
        if (collaboration.violations.length > 0) {
          const lines = collaboration.violations.map((violation) => `- [${violation.code}] ${violation.message}`);
          console.error(
            `\x1b[31m[GATE] 协作签字缺失，禁止推进（${currentPhase} → ${targetPhase}）：\n${lines.join("\n")}\n` +
            "修复通道：task-dispatch --kind=worker 派发本相位工作 → 完工后 --kind=audit --audit-kind=phase-gate → Auditor 裸行 verdict → --collect=audit-NNN 入账。\x1b[0m"
          );
          process.exit(1);
        }
      }
      task.phase = targetPhase;
      routeState.phase = targetPhase;
      phaseTransitioned = true;
    }
  }

  if (pauseCategory) {
    routeState.execution = normalizeRouteStateDocument(
      {
        execution: {
          ...routeState.execution,
          pauseCategory,
          pauseReason
        }
      },
      task
    ).execution;
  }

  routeState.execution = resolveExecutionState(task, routeState);
  routeState = writeRouteStateDocument(taskDir, task, routeState);
  syncMarkdownViews(taskDir, task, routeState);
  applyRouteStateToTask(task, routeState);
  writeTaskJson(taskDir, task);

  // 账本相位事件：协作时序判据的相位锚点。仅对已有账本的任务写入
  // （multi 任务 init 时已落 task-created；single 任务若从未 dispatch 则无账本，不新建）。
  if (readLedger(task.taskId).exists) {
    const ledgerPhaseNow = normalizePhaseName(task.phase);
    const lastAdvance = latestLedgerEvent(task.taskId, (entry) => entry.kind === "phase-advance");
    if (!lastAdvance || String(lastAdvance.payload?.to || "") !== ledgerPhaseNow) {
      appendLedgerEvent(task.taskId, "phase-advance", {
        from: ledgerFromPhase,
        to: ledgerPhaseNow
      });
    }
  }

  const payload = {
    task: relFromRepo(taskDir),
    phase: routeState.phase,
    syncStatus: routeState.syncStatus,
    execution: routeState.execution
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`task-advance: ${payload.task}`);
  if (phaseUnchangedHint) {
    console.log(phaseUnchangedHint);
  }
  console.log(`phase=${payload.phase}`);
  console.log(`syncStatus=${payload.syncStatus}`);
  console.log(`execution.status=${payload.execution.status}`);
  console.log(`execution.autoAdvanceEligible=${payload.execution.autoAdvanceEligible}`);
  console.log(`execution.nextEntrypointId=${payload.execution.nextEntrypointId || "(none)"}`);
  console.log(`execution.nextExecutableAction=${payload.execution.nextExecutableAction || "(none)"}`);
  console.log(`execution.pauseCategory=${payload.execution.pauseCategory}`);
  console.log(`execution.pauseReason=${payload.execution.pauseReason || "(none)"}`);

  // R3'-05（round3 H-05）：相位跃迁后义务快照——advance 与 dry-run 常被链式执行，新武装的
  // 收口义务会错过一切 sync 预览点；跃迁成功时刻按 sync 同口径（collectCloseoutObligations
  // 的 confirmed+conditional 分子）补一行快照。单一通道原则：仅跃迁时输出，非跃迁 advance
  // 与 --json 分支均静默；不设 --snapshot 子命令（徒增通道，终审已否决）。
  if (phaseTransitioned) {
    const obligations = collectCloseoutObligations(taskDir, task);
    const unsatisfiedCount = obligations.confirmed.length + obligations.conditional.length;
    console.log(`[closeout-obligations] 相位跃迁后义务快照：未满足(${unsatisfiedCount})`);
  }
}

main();
