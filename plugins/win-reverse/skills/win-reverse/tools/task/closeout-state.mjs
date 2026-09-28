import {
  ensureTaskRuntimeShape,
  ENTRYPOINT_REQUIRED_PHASES,
  nowIso,
  readTaskJson,
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
import { applyWebShellTechResultToTask } from "./web-shell-triage-state.mjs";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// 与 task-sync.mjs 同款判定：route-state 缺内容（或只剩 lossy 回填）时从 markdown 视图回填，
// 顺序必须是"先回填、再重生成视图"，否则 route-state.json 损坏时会把唯一幸存的 markdown 证据覆盖掉。
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

// task-sync.mjs:54-75 的镜像字段清单（applyRouteStateToTask 覆写的字段），用于 close 时打印覆盖可见性。
const MIRROR_FIELD_NAMES = [
  "activeTracks",
  "activeEntrypoints",
  "syncStatus",
  "executionStatus",
  "nextEntrypointId",
  "nextExecutableAction",
  "pauseCategory",
  "pauseReason",
  "vmTriage"
];

function diffOverwrittenMirrorFields(before, after) {
  const overwritten = [];
  for (const name of MIRROR_FIELD_NAMES) {
    if (JSON.stringify(before?.[name] ?? null) !== JSON.stringify(after?.[name] ?? null)) {
      overwritten.push(name);
    }
  }
  return overwritten;
}

// close 入口 resync：与 task-sync 主序列同构（sync/advance/close 三入口行为对齐）。
// 返回被覆写的镜像字段名，供调用方打印；lastAdvancedAt 保留旧值（close 不是 advance）。
export function resyncTaskStateForClose(taskDir, task) {
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

  const previousMirror = { ...(task.routeState || {}) };
  const previousLastAdvancedAt = task.routeState?.lastAdvancedAt;
  applyRouteStateToTask(task, routeState);
  if (previousLastAdvancedAt) {
    task.routeState.lastAdvancedAt = previousLastAdvancedAt;
  }
  const overwrittenMirrorFields = diffOverwrittenMirrorFields(previousMirror, task.routeState);
  writeTaskJson(taskDir, task);

  return { routeState, overwrittenMirrorFields };
}

// 已退役——report.md 完全归 agent 所有，框架不做任何节注入（与 route-state.mjs 的
// syncReportMarkdown 退役同理）：否则 taskFileMatchesTemplate 会把 agent 手写报告
// 与骨架的混合体误判，且「框架代写小节」正是本框架要取消的设计。closeout 状态全部
// 走 state/* 机器通道；协作对账的硬拦由 evaluateCloseoutGate 的协作判据承担。
// 原 syncCloseoutReport 的 upsert 实现（splitMarkdownSections/upsertMarkdownSection）
// 与其 fs/reconcileLedgerWithPhase 依赖一并删除。
function syncCloseoutReport() {}

export function synchronizeCloseoutState(taskDir, taskInput, options = {}) {
  const completedAt = cleanText(options.completedAt) || nowIso();
  const summary = cleanText(options.summary) || "closeout 已完成，无需继续执行。";
  const task = ensureTaskRuntimeShape(taskInput ? structuredClone(taskInput) : readTaskJson(taskDir));
  const existingRouteState = readRouteStateDocument(taskDir, task);
  const routeState = normalizeRouteStateDocument(existingRouteState || {}, task);
  const previousActiveTracks = new Set((routeState.activeTracks || []).map((item) => cleanText(item)).filter(Boolean));
  const previousActiveEntrypoints = new Set(
    (routeState.activeEntrypoints || []).map((item) => cleanText(item)).filter(Boolean)
  );
  const nextEntrypointId = cleanText(routeState.execution?.nextEntrypointId);
  if (nextEntrypointId) {
    previousActiveEntrypoints.add(nextEntrypointId);
  }

  const completedTracks = new Set(previousActiveTracks);
  routeState.entrypoints = (routeState.entrypoints || []).map((entrypoint) => {
    const entrypointId = cleanText(entrypoint.id);
    if (!previousActiveEntrypoints.has(entrypointId)) {
      return entrypoint;
    }
    if (cleanText(entrypoint.targetTrack)) {
      completedTracks.add(cleanText(entrypoint.targetTrack));
    }
    return {
      ...entrypoint,
      status: "SUCCESS",
      resultSummary: cleanText(entrypoint.resultSummary) || summary,
      updatedAt: completedAt
    };
  });

  routeState.tracks = (routeState.tracks || []).map((track) => {
    const title = cleanText(track.title);
    if (!completedTracks.has(title)) {
      return track;
    }
    return {
      ...track,
      status: "DONE",
      nextStep: summary,
      updatedAt: completedAt
    };
  });

  routeState.syncStatus = "closeout-completed";
  routeState.activeTracks = [];
  routeState.activeEntrypoints = [];
  routeState.execution = {
    status: "completed",
    autoAdvanceEligible: false,
    pauseCategory: "none",
    pauseReason: "",
    nextEntrypointId: "",
    nextPhase: cleanText(task.phase) || cleanText(routeState.phase) || "Port",
    nextExecutableAction: "",
    summary,
    updatedAt: completedAt
  };
  routeState.updatedAt = completedAt;

  const persistedRouteState = writeRouteStateDocument(taskDir, task, routeState);
  // skipHandEditGuard：本函数仅由 task-close 在 resync + 形式验证之后调用——手改内容
  // 已在 resync 的守卫中合并/快照，验证也已确认视图与 pre-closeout 状态逐字一致。
  // 此处唯一的差异来自 completed 状态迁移本身（全部 DONE/SUCCESS），再跑守卫会把
  // 合法的状态迁移误报成"手改内容"并制造噪音快照。
  const syncedRouteState = syncMarkdownViews(taskDir, task, persistedRouteState, { skipHandEditGuard: true });
  applyRouteStateToTask(task, syncedRouteState);
  writeTaskJson(taskDir, task);
  syncCloseoutReport(taskDir, task, persistedRouteState, { summary });

  return {
    task,
    routeState: persistedRouteState
  };
}
