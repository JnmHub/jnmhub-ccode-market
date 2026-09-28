import fs from "node:fs";
import {
  ensureTaskScaffold,
  ensureTaskWorkspaceBridges,
  ensureTaskArmed,
  ENTRYPOINT_REQUIRED_PHASES,
  relFromRepo,
  resolveTaskDir,
  ensureTaskRuntimeShape,
  syncTaskTopicCoverage,
  listCandidateOnlyTopicKeys,
  taskFile,
  writeTaskJson
} from "./common.mjs";
import {
  applyRouteStateToTask,
  buildRouteStateFromMarkdown,
  normalizeRouteStateDocument,
  readRouteStateDocument,
  resolveExecutionState,
  syncMarkdownViews,
  writeRouteStateDocument
} from "./route-state.mjs";
import {
  applyWebShellTechResultToTask,
  autoDetectWebShellTechFromTaskContext
} from "./web-shell-triage-state.mjs";
import { collectCloseoutObligations, collectPreGateWarnings, CLOSEOUT_OBLIGATIONS_FOOTER } from "./validation.mjs";
import { resolveExecutionModel, summarizeCollaboration } from "./lib/collaboration.mjs";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hasMeaningfulRouteState(routeState, task) {
  const requiresEntrypoints = ENTRYPOINT_REQUIRED_PHASES.includes(task?.phase);
  return Boolean(
    routeState &&
    routeState.syncStatus !== "backfilled-from-markdown-lossy" &&
    Array.isArray(routeState.tracks) &&
    routeState.tracks.some((track) => String(track?.title || "").trim()) &&
    (!requiresEntrypoints || (Array.isArray(routeState.entrypoints) && routeState.entrypoints.length > 0))
  );
}

// R2-G07（round2）：stale-edit 并发防护的比对基元。内容对比（而非 mtime）：task.json 体量小、
// 判定确定、不受 writeTaskJson noop 抑制伪写入影响。键序无关的稳定序列化 + 时钟豁免子键，
// 与 common.mjs WRITE_DIFF_VOLATILE_KEYS 同口径。
function stableStringifyValue(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyValue).join(",")}]`;
  }
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringifyValue(value[key])}`)
    .join(",")}}`;
}

const SYNC_DIFF_VOLATILE_SUBKEYS = new Set(["routeState.lastAdvancedAt"]);

function topLevelChangedFields(previous, next) {
  const keys = Array.from(new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])).sort();
  const changed = [];
  for (const key of keys) {
    const before = previous?.[key];
    const after = next?.[key];
    if (stableStringifyValue(before) === stableStringifyValue(after)) {
      continue;
    }
    const bothPlainObjects =
      before !== null && after !== null &&
      typeof before === "object" && !Array.isArray(before) &&
      typeof after === "object" && !Array.isArray(after);
    if (bothPlainObjects) {
      const subKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      const realSubChanges = Array.from(subKeys).some(
        (subKey) =>
          !SYNC_DIFF_VOLATILE_SUBKEYS.has(`${key}.${subKey}`) &&
          stableStringifyValue(before[subKey]) !== stableStringifyValue(after[subKey])
      );
      if (realSubChanges) {
        changed.push(key);
      }
    } else {
      changed.push(key);
    }
  }
  return changed;
}

function main() {
  const taskRef = process.argv[2];
  if (!taskRef) {
    console.error("usage: node tools/task/task-sync.mjs <task-id>");
    process.exit(1);
  }

  const taskDir = resolveTaskDir(taskRef);
  // R2-G07（round2）：入口快照（工单 t₀ 口径）——仅作方向提示行的比对参照：
  // 「sync 实际改写了什么」以进程启动时的磁盘为原点衡量，含对 agent 手改的吸收。
  const taskJsonPath = taskFile(taskDir, "task.json");
  const readTaskJsonText = () => {
    try {
      return fs.existsSync(taskJsonPath) ? fs.readFileSync(taskJsonPath, "utf8") : "";
    } catch {
      return "";
    }
  };
  const entrySnapshotText = readTaskJsonText();
  let entrySnapshotObject = null;
  try {
    entrySnapshotObject = entrySnapshotText ? JSON.parse(entrySnapshotText) : null;
  } catch {
    entrySnapshotObject = null;
  }

  const task = ensureTaskRuntimeShape(ensureTaskArmed(taskDir));
  autoDetectWebShellTechFromTaskContext(taskDir, task);
  syncTaskTopicCoverage(taskDir, task);
  ensureTaskScaffold(taskDir, task);
  ensureTaskWorkspaceBridges(taskDir, task);

  // R2-G07：丢更新守卫基线取在自愈型 setup（arming/web-shell/topic 覆盖/scaffold/
  // bridges——它们可能合法持久化 task.json）之后；此后到最终写盘之间的窗口才是真正的
  // 「外部修改会被覆写」风险窗。与方向提示的入口快照是两条不同基线，勿合并。
  const guardBaselineText = readTaskJsonText();

  let routeState = readRouteStateDocument(taskDir, task);
  let syncStatus = cleanText(routeState?.syncStatus) || "restored-from-route-state";
  if (!hasMeaningfulRouteState(routeState, task)) {
    routeState = buildRouteStateFromMarkdown(taskDir, task);
    syncStatus = cleanText(routeState?.syncStatus) || "backfilled-from-markdown";
  }

  routeState = normalizeRouteStateDocument(
    {
      ...routeState,
      taskId: task.taskId,
      phase: task.phase,
      syncStatus
    },
    task
  );
  applyWebShellTechResultToTask(taskDir, task, routeState);
  routeState.execution = resolveExecutionState(task, routeState);
  routeState = writeRouteStateDocument(taskDir, task, routeState);
  routeState = syncMarkdownViews(taskDir, task, routeState);
  applyRouteStateToTask(task, routeState);
  // R2-G07：写前再读磁盘原文与守卫基线比对——不一致即 sync 运行期间被外部修改
  //（WARN-only：不合并不阻断，仅告警留痕）。
  const externallyModifiedDuringSync = readTaskJsonText() !== guardBaselineText;
  writeTaskJson(taskDir, task);
  if (externallyModifiedDuringSync) {
    console.warn("[contract] task.json 于 sync 运行期间被外部修改——本次 sync 以读取时快照覆写，请核对手改是否丢失（diff 见上方 [write] 打点行）");
  }

  // routeHit 降级为 candidate-only 后的提示行（V2-1）：只提示显式纳入路径，不自动纳入
  const candidateOnlyTopics = listCandidateOnlyTopicKeys(taskDir, task);
  if (candidateOnlyTopics.length > 0) {
    console.log(`[topics] candidate-only signals: ${candidateOnlyTopics.join(", ")}（未自动纳入；确需请 --topic= / taskPacks.explicitTopics）`);
  }

  console.log(`task-sync: synced ${relFromRepo(taskDir)}`);
  console.log(`task-sync: activeTracks=${routeState.activeTracks.join(",") || "(none)"}`);
  console.log(`task-sync: syncStatus=${routeState.syncStatus}`);
  console.log(`task-sync: executionStatus=${routeState.execution.status}`);
  console.log(`task-sync: nextEntrypoint=${routeState.execution.nextEntrypointId || "(none)"}`);
  console.log(`task-sync: nextAction=${routeState.execution.nextExecutableAction || "(none)"}`);

  // O7：近门禁预警（只警告不阻断，exit code 不变；判定逻辑单源在 validation.mjs）。
  // 走 stderr（console.warn），不污染 stdout 的 sync 摘要。
  for (const warning of collectPreGateWarnings(taskDir, task)) {
    console.warn(`WARN [pre-gate] ${warning}`);
  }

  // 协作摘要行（win 改造 §2.3，只读）：multi 任务在每次 sync 输出包/审计/最近 verdict
  // 计数，协作状态可见性不再依赖翻账本文件。single/legacy 任务静默。
  if (resolveExecutionModel(task) === "multi") {
    const summary = summarizeCollaboration(taskDir, task);
    console.log(
      `task-sync: collaboration packages=${summary.packageCount} audits=${summary.auditCount} lastVerdict=${summary.lastVerdict || "(none)"} ledger=${summary.ledgerExists ? `chain:${summary.chainValid ? "ok" : "BROKEN"}` : "absent"}`
    );
  }

  // P0-2（round1 F-05）：sync 尾部打印收口义务清单摘要行（stdout，与 activeTracks /
  // pre-gate WARN 同通道；不设 --json 面——§1.3-2 裁定）。
  // R2-G04（round2 P0-②）谓词化三分法：未满足(n/总数) 为真判定计——n 随产物落盘严格
  // 递减至 0（M10-a 机械锁）；全绿分支打「全部已满足 (0)」。report 必备节等提示项
  // 降入信息面不计入。尾注常量与 task-init 共享（QA 硬锁 "task-close --dry-run" 字样）。
  const obligations = collectCloseoutObligations(taskDir, task);
  const unsatisfied = [...obligations.confirmed, ...obligations.conditional];
  if (unsatisfied.length === 0 && obligations.total > 0) {
    console.log(`[closeout-obligations] 全部已满足 (0/${obligations.total})`);
  } else {
    console.log(`[closeout-obligations] 未满足(${unsatisfied.length}/${obligations.total})`);
    for (const item of obligations.confirmed.slice(0, 6)) {
      console.log(`[closeout-obligations] 必做: ${item}`);
    }
    if (obligations.conditional.length > 0) {
      console.log(`[closeout-obligations] 条件项（触发时强制）: ${obligations.conditional.join("；")}`);
    }
  }
  if ((obligations.informational || []).length > 0) {
    console.log(`[closeout-obligations] 信息项（提示类，不计入计数）: ${obligations.informational.join("；")}`);
  }
  console.log(`[closeout-obligations] ${CLOSEOUT_OBLIGATIONS_FOOTER}`);

  // R2-G07：agent 方向提示行（stdout 尾部）——实际改写 task.json 时以入口快照为原点
  // 列出变更的 top-level 字段集合，提醒后续编辑前先重读（消除静默丢编辑的感知盲区）。
  // noop sync（零写入）不打印；检测到运行期外部修改时由上方 WARN 承担信号，本行静默。
  if (entrySnapshotObject && !externallyModifiedDuringSync) {
    const finalSerializable = { ...task };
    delete finalSerializable.__taskDir;
    const changedFields = topLevelChangedFields(entrySnapshotObject, finalSerializable);
    if (changedFields.length > 0) {
      console.log(`[contract] 本次 sync 更新了 task.json（${changedFields.join(", ")}），后续编辑前请重读`);
    }
  }

  // report-only 改造：原「[phase] plan/investigation 已存在而 phase=Observe」提示行随
  // 过程文档门禁整体退役——这两个文件不再是任何门禁的对象，提示失去意义。
}

main();
