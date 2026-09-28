import fs from "node:fs";
import path from "node:path";
import {
  assertSafeWorkspaceRoot,
  ensureDir,
  ensureTaskArmed,
  ensureTaskRuntimeShape,
  getTopicBySpecifier,
  nowIso,
  readTaskJson,
  relFromRepo,
  resolveTaskDir,
  skillRoot,
  taskFile,
  workspaceRoot
} from "./common.mjs";
import { appendLedgerEvent, readLedger, sha256File } from "./lib/ledger.mjs";
import { parseDispatchMarker, parseVerdict, resolveExecutionModel } from "./lib/collaboration.mjs";

// 派发器：多 Agent 协作的唯一落盘通道。
// 任务包/审计文件只经由本工具生成（头部携带账本事件哈希标记），
// task-advance/task-close 的协作判据据此区分「通道产物」与「事后伪造」。

function usage() {
  console.error(
    [
      "usage: node tools/task/task-dispatch.mjs <task-id> --kind=worker [--focus=<scope>] [--mcp=ida,ce,frida]",
      "       node tools/task/task-dispatch.mjs <task-id> --kind=audit --audit-kind=phase-gate|completion-claim",
      "       node tools/task/task-dispatch.mjs <task-id> --collect=audit-NNN",
      "       node tools/task/task-dispatch.mjs <task-id> --ledger"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = { kind: "", focus: "", mcp: [], auditKind: "", collect: "", ledger: false, taskRef: "" };
  for (const item of argv) {
    if (item.startsWith("--kind=")) {
      args.kind = item.slice("--kind=".length).trim();
    } else if (item.startsWith("--focus=")) {
      args.focus = item.slice("--focus=".length).trim();
    } else if (item.startsWith("--mcp=")) {
      args.mcp = item.slice("--mcp=".length).split(",").map((token) => token.trim()).filter(Boolean);
    } else if (item.startsWith("--audit-kind=")) {
      args.auditKind = item.slice("--audit-kind=".length).trim();
    } else if (item.startsWith("--collect=")) {
      args.collect = item.slice("--collect=".length).trim();
    } else if (item === "--ledger") {
      args.ledger = true;
    } else if (!item.startsWith("--") && !args.taskRef) {
      args.taskRef = item;
    } else {
      console.error(`task-dispatch: unknown argument: ${item}`);
      usage();
      process.exit(1);
    }
  }
  return args;
}

function nextSequenceId(taskDir, dirRel, prefix) {
  const dirAbs = taskFile(taskDir, dirRel);
  if (!fs.existsSync(dirAbs)) {
    return `${prefix}-001`;
  }
  const max = fs
    .readdirSync(dirAbs)
    .map((name) => new RegExp(`^${prefix}-(\\d+)\\.md$`).exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .reduce((acc, value) => Math.max(acc, value), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function loadTask(taskRef) {
  const taskDir = resolveTaskDir(taskRef);
  if (!fs.existsSync(taskFile(taskDir, "task.json"))) {
    console.error(`task-dispatch: task not found: ${taskRef}`);
    process.exit(1);
  }
  const task = ensureTaskRuntimeShape(ensureTaskArmed(taskDir));
  return { taskDir, task };
}

function topicRequiredArtifacts(task) {
  const lines = [];
  for (const topicKey of task.taskPacks?.selectedTopics || []) {
    const required = getTopicBySpecifier(topicKey)?.formalValidation?.requiredArtifacts || [];
    for (const rel of required) {
      lines.push(`- ${rel}（topic: ${topicKey}）`);
    }
  }
  return lines;
}

function defaultMcpLadder(task) {
  if (task.taskPacks?.selectedTopics?.includes("dotnet-clr")) {
    return ["ildasm/dnSpy 静态", "frida(clr)", "ce-debugger"];
  }
  if (task.runtime?.managed === true) {
    return ["ildasm/dnSpy 静态", "frida(clr)", "ce-debugger"];
  }
  return ["ida 静态", "ce-debugger/frida 动态", "unicorn/纯算法复现"];
}

function dispatchWorker(taskDir, task, args) {
  if (!args.focus) {
    console.error("task-dispatch: --kind=worker 需要 --focus=<本包工作范围>（verify-only 任务包禁止落盘）");
    process.exit(1);
  }
  const packageId = nextSequenceId(taskDir, "state/packages", "package");
  const relPath = `state/packages/${packageId}.md`;
  const event = appendLedgerEvent(task.taskId, "dispatch-worker", {
    packageId,
    relPath,
    focus: args.focus,
    phase: task.phase
  });
  const marker = String(event.hash).slice(0, 16);
  const mcpLadder = args.mcp.length > 0 ? args.mcp : defaultMcpLadder(task);
  const topics = (task.taskPacks?.selectedTopics || []).join(", ") || "(core-only)";
  const deliverableHints = topicRequiredArtifacts(task);

  const body = [
    `<!-- dispatch: ${marker} -->`,
    `# ${packageId} — Worker 任务包`,
    "",
    `dispatchedAt: ${nowIso()}`,
    `taskId: ${task.taskId}`,
    `phase: ${task.phase}`,
    `protectionTier: ${task.protectionTier || "unknown"}`,
    "",
    "## Scope",
    "",
    args.focus,
    "",
    "## Contract（只读，禁止修改）",
    "",
    `- objective: ${task.objective || "(见 task.json)"}`,
    `- deliverableTier: ${task.deliverableTier || "(未声明)"}`,
    `- topics: ${topics}`,
    `- boundaries.disallowedFallbacks: ${(task.disallowedFallbacks || []).join("；") || "(无)"}`,
    "",
    "## MCP 通道（降级阶梯：首选 → 次选 → 兜底）",
    "",
    ...mcpLadder.map((item, index) => `${index + 1}. ${item}`),
    "",
    "降级纪律：长静默/超时=通道有毒→换通道；配置类报错→换通道或交接；业务类报错→读错误信息继续。",
    "",
    "## Deliverables（本包须落盘的产物，真实内容，逐字抄模板=占位=未交付）",
    "",
    ...(deliverableHints.length > 0 ? deliverableHints : ["- （按 Scope 在 run/ 下落盘证据与 notes）"]),
    "",
    "## Worker Report",
    "",
    "<!-- Worker 收工前填写：产出文件清单 / 关键结论（含地址·偏移·证据锚点） / 实际用通道与降级原因 / 阻断 -->",
    "",
    "（待填写）",
    ""
  ].join("\n");

  ensureDir(path.dirname(taskFile(taskDir, relPath)));
  fs.writeFileSync(taskFile(taskDir, relPath), body, "utf8");

  console.log(`task-dispatch: ${relPath} created (ledger seq=${event.seq}, marker=${marker})`);
  console.log("");
  console.log("—— Worker subagent prompt（直接复制派发）——");
  console.log(
    [
      `你是 Reverse Worker。先读协议 ${path.join(skillRoot, "agents", "reverse-worker.md")}，`,
      `再读任务包 ${relPath}（任务目录 ${relFromRepo(taskDir, workspaceRoot)}）。`,
      "严格在 Scope 与 MCP 白名单内工作；产物落盘到 Deliverables 点名路径；",
      "收工前补全任务包 ## Worker Report 段。完成后返回一段简短摘要。"
    ].join("\n")
  );
}

function dispatchAudit(taskDir, task, args) {
  if (!["phase-gate", "completion-claim"].includes(args.auditKind)) {
    console.error("task-dispatch: --kind=audit 需要 --audit-kind=phase-gate|completion-claim");
    process.exit(1);
  }
  const auditId = nextSequenceId(taskDir, "state/audits", "audit");
  const relPath = `state/audits/${auditId}.md`;
  const event = appendLedgerEvent(task.taskId, "dispatch-audit", {
    auditId,
    relPath,
    auditKind: args.auditKind,
    phase: task.phase
  });
  const marker = String(event.hash).slice(0, 16);

  const body = [
    `<!-- dispatch: ${marker} -->`,
    `# ${auditId} — 审计请求`,
    "",
    `audit-kind: ${args.auditKind}`,
    `dispatchedAt: ${nowIso()}`,
    `taskId: ${task.taskId}`,
    `phase: ${task.phase}`,
    "",
    "## Audit Scope",
    "",
    args.auditKind === "phase-gate"
      ? "相位门禁审计：核对本相位任务包的通道标记、时序、产物与 Worker Report（清单见 agents/auditor.md）。"
      : "完成宣称审计：全量核对 + 账本相位轨迹一致性 + 抽验关键证据内容（清单见 agents/auditor.md）。",
    "",
    "禁止运行 close 级门禁作为判据；拿不准一律 VIOLATION 并写明缺口。",
    "",
    "## Auditor Findings",
    "",
    "<!-- Auditor 填写发现，然后在末尾追加裸行 verdict: PASS 或 verdict: VIOLATION -->",
    "",
    "（待填写）",
    ""
  ].join("\n");

  ensureDir(path.dirname(taskFile(taskDir, relPath)));
  fs.writeFileSync(taskFile(taskDir, relPath), body, "utf8");

  console.log(`task-dispatch: ${relPath} created (ledger seq=${event.seq}, marker=${marker})`);
  console.log("");
  console.log("—— Auditor subagent prompt（直接复制派发）——");
  console.log(
    [
      `你是 Auditor（只读）。先读协议 ${path.join(skillRoot, "agents", "auditor.md")}，`,
      `再读审计请求 ${relPath}（任务目录 ${relFromRepo(taskDir, workspaceRoot)}）。`,
      "按 ## Audit Scope 执行只读核对；不得修改被审对象。",
      "完成后在审计文件追加 ## Auditor Findings 段与裸行 verdict，",
      `并提示主上下文执行：node tools/task/task-dispatch.mjs ${task.taskId} --collect=${auditId}`
    ].join("\n")
  );
}

function collectAudit(taskDir, task, collectRef) {
  const auditId = collectRef.replace(/\.md$/, "");
  const relPath = `state/audits/${auditId}.md`;
  const fullPath = taskFile(taskDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`task-dispatch: audit file not found: ${relPath}`);
    process.exit(1);
  }
  const text = fs.readFileSync(fullPath, "utf8");
  const verdict = parseVerdict(text);
  if (!verdict) {
    console.error(`task-dispatch: ${relPath} 缺少裸行 verdict: PASS|VIOLATION（按行扫描，行首不得有 -/>/缩进前缀）`);
    process.exit(1);
  }
  const marker = parseDispatchMarker(text);
  const ledger = readLedger(task.taskId);
  const markerKnown = marker && ledger.events.some((entry) => String(entry.hash).startsWith(marker));
  if (!markerKnown) {
    console.error(`task-dispatch: ${relPath} 的 dispatch 标记不在账本中——该审计未经 dispatch 通道产生，拒绝入账`);
    process.exit(1);
  }
  const kindMatch = /^audit-kind:\s*(\S+)\s*$/m.exec(text);
  const event = appendLedgerEvent(task.taskId, "audit-verdict", {
    auditId,
    relPath,
    auditKind: kindMatch ? kindMatch[1] : "",
    phase: task.phase,
    verdict,
    fileHash: sha256File(fullPath)
  });
  console.log(`task-dispatch: collected ${auditId} verdict=${verdict} (ledger seq=${event.seq})`);
  if (verdict === "VIOLATION") {
    console.log("task-dispatch: 修复动作须重派 Worker 执行并重审；连续 2 次 PASS 后恢复正常节奏。");
  }
}

function printLedger(task) {
  const ledger = readLedger(task.taskId);
  if (!ledger.exists) {
    console.log(`task-dispatch: no ledger for ${task.taskId} (${ledger.path})`);
    return;
  }
  console.log(`ledger: ${ledger.path} chainValid=${ledger.chainValid} events=${ledger.events.length}`);
  for (const event of ledger.events) {
    console.log(`  #${event.seq} ${event.ts} ${event.kind} ${JSON.stringify(event.payload)}`);
  }
  if (!ledger.chainValid) {
    for (const line of ledger.breaks) {
      console.log(`  ⚠ ${line}`);
    }
  }
}

function main() {
  try {
    assertSafeWorkspaceRoot({ workspace: workspaceRoot, commandName: "task-dispatch" });
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskRef) {
    usage();
    process.exit(1);
  }
  const { taskDir, task } = loadTask(args.taskRef);
  const model = resolveExecutionModel(task);
  if (model !== "multi" && !args.ledger && !args.collect) {
    console.warn(`task-dispatch: executionModel=single（advisory）——账本仍会记录，但协作判据不硬拦`);
  }

  if (args.ledger) {
    printLedger(task);
    return;
  }
  if (args.collect) {
    collectAudit(taskDir, task, args.collect);
    return;
  }
  if (args.kind === "worker") {
    dispatchWorker(taskDir, task, args);
    return;
  }
  if (args.kind === "audit") {
    dispatchAudit(taskDir, task, args);
    return;
  }
  usage();
  process.exit(1);
}

main();
