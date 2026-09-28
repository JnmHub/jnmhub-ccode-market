import fs from "node:fs";
import path from "node:path";
import { taskFile, taskFileMatchesTemplate } from "../common.mjs";
import { latestLedgerEvent, readLedger } from "./ledger.mjs";

// 协作判据库：task-advance / task-close 共用的「文件 × 账本」交叉验证。
// 设计约束（docs/reference/multi-agent-orchestration.md）：
//   - 只读判据，不写任何文件；
//   - 逐行状态机解析（禁 multiline 正则，web 坑点 2）；
//   - 审计与 close 级校验解耦（本模块不调用 validation.mjs 的 closeout 门禁）。

export const EXECUTION_MODELS = ["multi", "single"];

export function resolveExecutionModel(task) {
  const explicit = String(task?.executionModel?.concurrency || "").trim().toLowerCase();
  if (EXECUTION_MODELS.includes(explicit)) {
    return explicit;
  }
  // 历史任务（无 executionModel 字段）按 single 处理：协作判据 advisory 化，
  // 避免改造前创建的任务目录被新门禁死锁。
  return "single";
}

const DISPATCH_MARKER_PATTERN = /^\s*<!--\s*dispatch:\s*([0-9a-f]{16})\s*-->\s*$/;
const VERDICT_LINE_PATTERN = /^verdict:\s*(PASS|VIOLATION)\s*$/;

// run/ 下的框架自有文件：不计入 work-before-dispatch 的产物扫描
// （它们由框架线束/守卫/探针产生，不是 agent 分析产物）。
const FRAMEWORK_OWNED_RUN_FILES = new Set([
  "verify-once.mjs",
  "env-capability.json",
  "orphaned-view-content.md",
  "backup-manifest.md",
  "crash_state.flag",
  "closeout-attempts.jsonl",
  "validation-last.json",
  "contract-change-log.md"
]);

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

// 逐行扫描提取 dispatch 标记（禁 multiline 正则）。
export function parseDispatchMarker(text) {
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = DISPATCH_MARKER_PATTERN.exec(line);
    if (match) {
      return match[1];
    }
  }
  return "";
}

// 逐行扫描提取裸行 verdict（行首无前缀；`- verdict:` 等列表项不算，防 web 坑点 1/2）。
export function parseVerdict(text) {
  let verdict = "";
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = VERDICT_LINE_PATTERN.exec(line);
    if (match) {
      verdict = match[1];
    }
  }
  return verdict;
}

function hasSection(text, headingPattern) {
  const lines = String(text || "").split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) {
    return false;
  }
  const bodyLines = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) {
      break;
    }
    bodyLines.push(line);
  }
  const body = bodyLines.join("\n");
  // 段体扣掉占位注释与「（待填写）」占位行后仍有实质内容才算已填写
  return body.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*（?待填写）?\s*$/gm, "").trim().length > 0;
}

export function scanTaskPackages(taskDir) {
  const dirRel = "state/packages";
  const dirAbs = taskFile(taskDir, dirRel);
  return listMarkdownFiles(dirAbs)
    .filter((name) => /^package-\d+\.md$/.test(name))
    .map((name) => {
      const relPath = `${dirRel}/${name}`;
      const fullPath = taskFile(taskDir, relPath);
      const text = fs.readFileSync(fullPath, "utf8");
      return {
        id: name.replace(/\.md$/, ""),
        relPath,
        dispatchHash: parseDispatchMarker(text),
        hasWorkerReport: hasSection(text, /^##\s*Worker Report\s*$/),
        mtime: fs.statSync(fullPath).mtime.toISOString()
      };
    });
}

export function scanTaskAudits(taskDir) {
  const dirRel = "state/audits";
  const dirAbs = taskFile(taskDir, dirRel);
  return listMarkdownFiles(dirAbs)
    .filter((name) => /^audit-\d+\.md$/.test(name))
    .map((name) => {
      const relPath = `${dirRel}/${name}`;
      const fullPath = taskFile(taskDir, relPath);
      const text = fs.readFileSync(fullPath, "utf8");
      const kindMatch = /^audit-kind:\s*(\S+)\s*$/m.exec(text);
      return {
        id: name.replace(/\.md$/, ""),
        relPath,
        dispatchHash: parseDispatchMarker(text),
        auditKind: kindMatch ? kindMatch[1] : "",
        verdict: parseVerdict(text),
        hasFindings: hasSection(text, /^##\s*Auditor Findings\s*$/),
        mtime: fs.statSync(fullPath).mtime.toISOString()
      };
    });
}

// run/ 真实产物清单：排除框架自有文件、.clean.bak 备份、模板占位。
export function listRealRunArtifacts(taskDir) {
  const runDir = taskFile(taskDir, "run");
  if (!fs.existsSync(runDir)) {
    return [];
  }
  return fs
    .readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !FRAMEWORK_OWNED_RUN_FILES.has(name))
    .filter((name) => !name.endsWith(".clean.bak"))
    .map((name) => `run/${name}`)
    .filter((relPath) => !taskFileMatchesTemplate(taskDir, relPath))
    .map((relPath) => ({
      relPath,
      mtime: fs.statSync(taskFile(taskDir, relPath)).mtime.toISOString()
    }))
    .sort((a, b) => a.mtime.localeCompare(b.mtime));
}

export function phaseEnteredAt(taskId, phase) {
  const event = latestLedgerEvent(
    taskId,
    (entry) => entry.kind === "phase-advance" && entry.payload?.to === phase
  );
  if (event) {
    return event.ts;
  }
  const created = latestLedgerEvent(taskId, (entry) => entry.kind === "task-created");
  return created?.ts || "";
}

// 核心门禁评估。返回 { violations, notes }；调用方按模式决定硬拦还是 WARNING。
// options.targetPhase：task-advance 传入目标相位；task-close 传 null 表示完成宣称判据。
export function evaluateCollaboration(taskDir, task, options = {}) {
  const violations = [];
  const notes = [];
  const taskId = String(task.taskId || path.basename(taskDir));
  const ledger = readLedger(taskId);

  if (!ledger.exists) {
    violations.push({
      code: "ledger-missing",
      message: "multi 模式任务没有影子账本（任务未经 task-init/dispatch 通道建立协作记录）"
    });
    return { violations, notes, ledger };
  }
  if (!ledger.chainValid) {
    violations.push({
      code: "ledger-chain-broken",
      message: `影子账本哈希链断裂（${ledger.breaks.length} 处失配），协作记录不可信`
    });
  }

  const packages = scanTaskPackages(taskDir);
  const audits = scanTaskAudits(taskDir);
  const ledgerHashes = new Set(ledger.events.map((entry) => String(entry.hash || "").slice(0, 16)));
  const dispatchWorkerEvents = ledger.events.filter((entry) => entry.kind === "dispatch-worker");
  const firstDispatchTs = dispatchWorkerEvents.length > 0 ? dispatchWorkerEvents[0].ts : "";

  // 判据 1：通道——任务包/审计文件必须经 dispatch 落盘（头部哈希在账本中）
  for (const pkg of packages) {
    if (!pkg.dispatchHash || !ledgerHashes.has(pkg.dispatchHash)) {
      violations.push({
        code: "package-not-dispatched",
        message: `${pkg.relPath} 未经 task-dispatch 通道产生（头部 dispatch 标记缺失或不在账本中）`
      });
    }
  }
  for (const audit of audits) {
    if (!audit.dispatchHash || !ledgerHashes.has(audit.dispatchHash)) {
      violations.push({
        code: "audit-not-dispatched",
        message: `${audit.relPath} 未经 task-dispatch 通道产生（头部 dispatch 标记缺失或不在账本中）`
      });
    }
  }

  // 判据 2：时序——run/ 真实产物不得早于首个 dispatch-worker 事件
  const realArtifacts = listRealRunArtifacts(taskDir);
  const earlyArtifacts = firstDispatchTs
    ? realArtifacts.filter((artifact) => artifact.mtime < firstDispatchTs)
    : realArtifacts;
  if (earlyArtifacts.length > 0) {
    violations.push({
      code: "work-before-dispatch",
      message:
        `run/ 存在早于首个 Worker 派发的产物（${earlyArtifacts[0].relPath} 等 ${earlyArtifacts.length} 个）——` +
        "先干活后补签字不构成本相位协作证据"
    });
  }

  const phase = String(task.phase || "").trim();
  const enteredAt = phaseEnteredAt(taskId, phase);

  // 判据 3：本相位任务包增量（dispatch-worker 事件在本相位锚点之后）
  const phasePackages = dispatchWorkerEvents.filter((entry) => !enteredAt || entry.ts >= enteredAt);
  if (phasePackages.length === 0) {
    violations.push({
      code: "no-package-this-phase",
      message: `本相位（${phase}）没有经 dispatch 通道产生的任务包`
    });
  }

  // 判据 4：本相位 PASS 审计增量（audit-verdict 账本事件，按审计类型过滤）
  const verdictEvents = ledger.events.filter((entry) => entry.kind === "audit-verdict");
  const phaseGatePasses = verdictEvents.filter(
    (entry) =>
      entry.payload?.verdict === "PASS" &&
      entry.payload?.auditKind === "phase-gate" &&
      (!enteredAt || entry.ts >= enteredAt)
  );
  if (phaseGatePasses.length === 0) {
    violations.push({
      code: "no-passing-audit-this-phase",
      message: `本相位（${phase}）没有 verdict: PASS 的 phase-gate 审计入账（task-dispatch --collect）`
    });
  }

  // 完成宣称附加判据：completion-claim 审计 PASS
  if (options.completionClaim === true) {
    const claimPasses = verdictEvents.filter(
      (entry) =>
        entry.payload?.verdict === "PASS" &&
        entry.payload?.auditKind === "completion-claim" &&
        (!enteredAt || entry.ts >= enteredAt)
    );
    if (claimPasses.length === 0) {
      violations.push({
        code: "no-completion-claim-audit",
        message: "close 前没有 verdict: PASS 的 completion-claim 审计入账"
      });
    }
  }

  // 审计文件形态检查（只针对已入账的 verdict 对应的文件，提示级）
  for (const audit of audits) {
    if (audit.verdict && !audit.hasFindings) {
      notes.push(`${audit.relPath} 有 verdict 但缺 Auditor Findings 段`);
    }
  }

  return { violations, notes, ledger, packages, audits };
}

// close 报告对账段：账本相位事件序列 vs 当前 phase，差异留 ⚠ 指纹（不硬拦）。
export function reconcileLedgerWithPhase(taskDir, task) {
  const taskId = String(task.taskId || path.basename(taskDir));
  const ledger = readLedger(taskId);
  const lines = [];
  if (!ledger.exists) {
    lines.push("- (single/legacy 模式：无影子账本，协作判据未启用)");
    return lines;
  }
  const phaseEvents = ledger.events.filter((entry) => entry.kind === "phase-advance");
  const chainNote = ledger.chainValid ? "哈希链完整" : `⚠ 哈希链断裂 ${ledger.breaks.length} 处`;
  lines.push(`- 账本事件 ${ledger.events.length} 条（${chainNote}）；相位推进 ${phaseEvents.length} 次`);
  const ledgerPhaseTrail = phaseEvents.map((entry) => `${entry.payload?.from}->${entry.payload?.to}`);
  if (ledgerPhaseTrail.length > 0) {
    lines.push(`- 账本相位轨迹：${ledgerPhaseTrail.join("，")}`);
  }
  const currentPhase = String(task.phase || "").trim();
  const lastLedgerPhase = phaseEvents.length > 0 ? String(phaseEvents[phaseEvents.length - 1].payload?.to || "") : "";
  if (phaseEvents.length === 0 && currentPhase && currentPhase !== "Observe") {
    lines.push(`⚠ 账本无任何相位推进事件，但当前 phase=${currentPhase}（可能存在绕过 task-advance 的手改）`);
  } else if (lastLedgerPhase && currentPhase && lastLedgerPhase !== currentPhase) {
    lines.push(`⚠ 账本末次相位=${lastLedgerPhase} 与当前 phase=${currentPhase} 不一致（可能存在手改 phase）`);
  }
  return lines;
}

// task-sync 协作摘要行（只读）：multi 任务的协作状态一眼可见，不用翻账本文件。
export function summarizeCollaboration(taskDir, task) {
  const taskId = String(task.taskId || path.basename(taskDir));
  const ledger = readLedger(taskId);
  const packages = scanTaskPackages(taskDir);
  const audits = scanTaskAudits(taskDir);
  const lastVerdict = latestLedgerEvent(taskId, (entry) => entry.kind === "audit-verdict");
  return {
    packageCount: packages.length,
    auditCount: audits.length,
    lastVerdict: lastVerdict ? `${lastVerdict.payload?.verdict || "?"}(${lastVerdict.payload?.auditKind || "?"})` : "",
    ledgerExists: ledger.exists,
    chainValid: ledger.chainValid
  };
}
