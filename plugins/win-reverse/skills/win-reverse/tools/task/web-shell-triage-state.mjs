import {
  exists,
  readJsonFile,
  safeReadText,
  taskFile,
  taskFileMatchesTemplate,
  writeJsonFile,
  writeTextFile
} from "./common.mjs";
import { detect as detectWebShellTech } from "./detect-web-shell-tech.mjs";
import {
  buildRuntimeSpecificNextSteps,
  describeWebShellRouting,
  inferDownstreamTopicsFromWebShellResult,
  topWebShellKeys
} from "./web-shell-routing.mjs";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value))
        .filter(Boolean)
    )
  );
}

function topScoredLabel(values = []) {
  const first = Array.isArray(values) ? values[0] : null;
  if (!first) {
    return "";
  }
  if (typeof first === "string") {
    return first;
  }
  return cleanText(first.key);
}

function toScoredKeys(values = []) {
  return uniqStrings(values).map((key, index, items) => ({
    key,
    score: Math.max(1, items.length - index)
  }));
}

function synthesizeResultFromTask(task) {
  const triage = task?.webShellTriage || {};
  const looksLikeWebShell =
    triage.present === true &&
    cleanText(triage.status) !== "scanned-no-hit";

  return {
    scannedRoot:
      cleanText(task?.targetContext?.targetBinaryPath) ||
      cleanText(task?.targetContext?.inputTarget) ||
      "",
    summary: {
      looksLikeWebShell,
      confidence: looksLikeWebShell ? "derived-from-task-state" : "not-applicable",
      probableRuntimes: toScoredKeys(triage.probableRuntimes || []),
      probableFrontend: toScoredKeys(triage.probableFrontend || []),
      probablePackagers: toScoredKeys(triage.probablePackagers || [])
    },
    entryHints: uniqStrings(triage.entryHints || []),
    recommendedNextSteps: uniqStrings([
      cleanText(triage.downstreamSummary)
    ])
  };
}

export function readWebShellTechResult(taskDir) {
  const relPath = "run/web-shell-tech.json";
  const fullPath = taskFile(taskDir, relPath);
  if (!exists(fullPath) || taskFileMatchesTemplate(taskDir, relPath)) {
    return null;
  }

  try {
    return readJsonFile(fullPath);
  } catch {
    return null;
  }
}

export function webShellTechLooksMeaningful(result) {
  if (!result || typeof result !== "object") {
    return false;
  }
  return Boolean(
    result.summary?.looksLikeWebShell === true ||
    (result.summary?.probableRuntimes || []).length > 0 ||
    (result.summary?.probableFrontend || []).length > 0 ||
    (result.summary?.probablePackagers || []).length > 0 ||
    (result.entryHints || []).length > 0
  );
}

// 人工否决（V2-1）：verdict="not-web-shell" + 非空 verdictRationale。
// 生效条件只有一条：当前无 meaningful 实锤（结果文件缺失或探针非 meaningful）。
// meaningful=true 时 verdict 完全无效（真命中不可豁免），由 apply 打 WARNING。
export function webShellVerdictDeclaresNotWebShell(task) {
  const triage = task?.webShellTriage || {};
  return (
    cleanText(triage.verdict).toLowerCase() === "not-web-shell" &&
    Boolean(cleanText(triage.verdictRationale))
  );
}

function webShellVerdictEffective(task, result) {
  return webShellVerdictDeclaresNotWebShell(task) && !webShellTechLooksMeaningful(result);
}

function pickBestResult(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const score = (result) => {
    const runtime = (result?.summary?.probableRuntimes || []).reduce((sum, item) => sum + Number(item?.score || 0), 0);
    const frontend = (result?.summary?.probableFrontend || []).reduce((sum, item) => sum + Number(item?.score || 0), 0);
    const packager = (result?.summary?.probablePackagers || []).reduce((sum, item) => sum + Number(item?.score || 0), 0);
    return runtime + frontend + packager + (result?.summary?.looksLikeWebShell ? 100 : 0);
  };

  return [...results].sort((left, right) => score(right) - score(left))[0] || null;
}

function taskHasWebShellTopic(task) {
  return (
    (task.taskPacks?.selectedTopics || []).includes("web-shell-triage") ||
    (task.taskPacks?.explicitTopics || []).includes("web-shell-triage") ||
    task.webShellTriage?.present === true
  );
}

function collectAutoDetectionCandidates(task) {
  const candidates = [];
  const pushIfPresent = (value) => {
    const text = cleanText(value);
    if (!text) {
      return;
    }
    if (!exists(text)) {
      return;
    }
    candidates.push(text);
  };

  pushIfPresent(task.targetContext?.targetBinaryPath);
  pushIfPresent(task.targetContext?.inputTarget);

  for (const value of task.targetContext?.samplePaths || []) {
    pushIfPresent(value);
  }

  return uniqStrings(candidates);
}

export function autoDetectWebShellTechFromTaskContext(taskDir, task, options = {}) {
  const existing = readWebShellTechResult(taskDir);
  const verdictDeclared = webShellVerdictDeclaresNotWebShell(task);

  // V3-2 双堵：声明 verdict 即无条件现场重扫，无视 existing——删结果文件与伪造非模板
  // no-hit 结果文件两矢量攻击成本对称（各一次 Write），只有现场重扫无 meaningful 命中
  // 才允许 verdict 短路。有界参数不变（candidates<=3、maxFiles 6000、maxReadBytes 256KB），
  // verdict 任务每次 sync 付一次有界扫描（性能如实登记）。
  // 施工注释：调用点 task-sync.mjs:50 与 task-close.mjs（close 咽喉，resync 前）；
  // 结果文件缺失/扫描无命中时不持久化（下方 shouldPersist 语义不变）。
  if (!verdictDeclared && existing && !taskFileMatchesTemplate(taskDir, "run/web-shell-tech.json")) {
    return {
      result: existing,
      source: "existing"
    };
  }

  const candidates = collectAutoDetectionCandidates(task);
  if (candidates.length === 0) {
    // 无本地候选路径时无法现场重扫：verdict 短路维持现状语义（基于 existing 判定）
    if (webShellVerdictEffective(task, existing)) {
      return {
        result: null,
        source: "verdict-not-web-shell"
      };
    }
    return {
      result: null,
      source: "no-local-target-path"
    };
  }

  const results = [];
  for (const candidate of candidates.slice(0, 3)) {
    try {
      results.push(
        detectWebShellTech(candidate, {
          maxDepth: options.maxDepth || 4,
          maxFiles: options.maxFiles || 6000,
          maxReadBytes: options.maxReadBytes || 256 * 1024
        })
      );
    } catch {
      // ignore scan failures and continue probing other candidates
    }
  }

  const best = pickBestResult(results);

  // verdict 声明：现场重扫无 meaningful 命中 → 短路返回（不固化任何结果）；
  // 有 meaningful 命中 → 不短路，走正常持久化/apply——apply 对「meaningful + verdict」
  // 打「真命中不可豁免」WARNING 并拒绝豁免。
  if (verdictDeclared && !webShellTechLooksMeaningful(best)) {
    return {
      result: null,
      source: "verdict-not-web-shell"
    };
  }

  if (!best) {
    return {
      result: null,
      source: "scan-failed"
    };
  }

  const shouldPersist = webShellTechLooksMeaningful(best) || taskHasWebShellTopic(task);
  if (!shouldPersist) {
    return {
      result: best,
      source: "auto-scan-no-hit"
    };
  }

  writeJsonFile(taskFile(taskDir, "run/web-shell-tech.json"), best);
  return {
    result: best,
    source: "auto-scan"
  };
}

function renderWebShellNotes(result) {
  const runtime = topWebShellKeys(result.summary?.probableRuntimes).join(", ");
  const frontend = topWebShellKeys(result.summary?.probableFrontend).join(", ");
  const packager = topWebShellKeys(result.summary?.probablePackagers).join(", ");
  const entryHints = uniqStrings(result.entryHints || []).slice(0, 8).join(", ");
  const routing = describeWebShellRouting(result);
  const nextStep = cleanText(routing.nextAction || (result.recommendedNextSteps || [])[0]);
  const downstreamTopics = routing.downstreamTopics.join(", ");

  return [
    "# Web Shell / WebView Notes",
    "",
    `- 安装目录 / 样本根目录：${cleanText(result.scannedRoot)}`,
    `- wrapper/runtime 候选：${runtime || ""}`,
    `- 前端框架候选：${frontend || ""}`,
    `- bundler / 打包方式候选：${packager || ""}`,
    `- 关键入口资源：${entryHints || ""}`,
    `- bridge / preload / host API 线索：${entryHints || ""}`,
    "- 与 native 宿主的交界点：待结合 preload / invoke / host object / 资源装载链继续确认",
    `- 自动分流 topic：${downstreamTopics || ""} [auto-route]`,
    `- 下一步更应转入的线路：${nextStep || ""}`,
    ""
  ].join("\n");
}

function ensureWebShellNotes(taskDir, result) {
  const relPath = "run/web-shell-notes.md";
  const fullPath = taskFile(taskDir, relPath);
  const shouldWrite =
    !exists(fullPath) ||
    taskFileMatchesTemplate(taskDir, relPath) ||
    cleanText(safeReadText(fullPath)) === "";

  if (!shouldWrite) {
    return;
  }

  writeTextFile(fullPath, renderWebShellNotes(result));
}

function ensureWebShellNextSteps(taskDir, result) {
  const relPath = "run/web-shell-next-steps.md";
  const fullPath = taskFile(taskDir, relPath);
  const shouldWrite =
    !exists(fullPath) ||
    taskFileMatchesTemplate(taskDir, relPath) ||
    cleanText(safeReadText(fullPath)) === "";

  if (!shouldWrite) {
    return;
  }

  writeTextFile(fullPath, buildRuntimeSpecificNextSteps(result));
}

function buildKeyFindings(result) {
  const findings = [];
  const runtime = topScoredLabel(result.summary?.probableRuntimes);
  const frontend = topScoredLabel(result.summary?.probableFrontend);
  const packager = topScoredLabel(result.summary?.probablePackagers);
  const entryHint = cleanText((result.entryHints || [])[0]);
  const downstreamTopics = inferDownstreamTopicsFromWebShellResult(result).filter((topic) => topic !== "web-shell-triage");

  if (runtime) {
    findings.push(`wrapper/runtime 候选：${runtime}`);
  }
  if (frontend) {
    findings.push(`前端框架候选：${frontend}`);
  }
  if (packager) {
    findings.push(`bundler 候选：${packager}`);
  }
  if (entryHint) {
    findings.push(`关键入口线索：${entryHint}`);
  }
  if (downstreamTopics.length > 0) {
    findings.push(`自动分流 topic：${downstreamTopics.join(", ")} [auto-route]`);
  }
  if (result.summary?.looksLikeWebShell === false && findings.length === 0) {
    findings.push("目录与二进制尚未发现高置信 Web 套壳证据");
  }

  return uniqStrings(findings);
}

function ensureTrackC(routeState, result) {
  const track = (routeState.tracks || []).find((item) => cleanText(item?.title) === "C");
  if (!track) {
    return;
  }
  const nextStep = cleanText((result?.recommendedNextSteps || [])[0]);
  if (webShellTechLooksMeaningful(result)) {
    track.status = "IN_PROGRESS";
    track.checkpoints = uniqStrings([
      ...(track.checkpoints || []),
      "wrapper/runtime",
      "入口资源"
    ]);
    if (nextStep) {
      track.nextStep = nextStep;
    }
    return;
  }

  track.status = track.status === "DONE" ? "DONE" : "PENDING";
  if (nextStep) {
    track.nextStep = nextStep;
  }
}

function ensureEntrypoint2(routeState, result) {
  const entrypoint = (routeState.entrypoints || []).find((item) => cleanText(item?.id).toUpperCase() === "EP-002");
  if (!entrypoint) {
    return;
  }

  entrypoint.boundTopics = uniqStrings([...(entrypoint.boundTopics || []), "web-shell-triage"]);
  entrypoint.evidenceRefs = uniqStrings([...(entrypoint.evidenceRefs || []), "run/web-shell-tech.json", "run/web-shell-notes.md"]);

  if (webShellTechLooksMeaningful(result)) {
    entrypoint.status = "SUCCESS";
    entrypoint.resultSummary = buildKeyFindings(result).join("；");
    const nextStep = cleanText(describeWebShellRouting(result).nextAction || (result?.recommendedNextSteps || [])[0]);
    if (nextStep) {
      entrypoint.nextOnSuccess = nextStep;
    }
    routeState.activeEntrypoints = uniqStrings(["EP-002", ...(routeState.activeEntrypoints || [])]).slice(0, 2);
    routeState.activeTracks = uniqStrings(["C", ...(routeState.activeTracks || [])]).slice(0, 2);
    return;
  }

  if (result) {
    entrypoint.status = "EXHAUSTED";
    entrypoint.resultSummary = "目录与二进制未发现可信 Web 套壳证据，应回到原生 PE/导入面与运行时装载链。";
  }
}

export function buildWebShellSuggestedAction(task) {
  const topicSelected = (task.taskPacks?.selectedTopics || []).includes("web-shell-triage");
  const topicPresent = task.webShellTriage?.present === true;
  if (!topicSelected && !topicPresent) {
    return "";
  }

  const status = cleanText(task.webShellTriage?.status || "not-started");
  const probableRuntime = cleanText((task.webShellTriage?.probableRuntimes || [])[0]);
  const probableFrontend = cleanText((task.webShellTriage?.probableFrontend || [])[0]);
  const probablePackager = cleanText((task.webShellTriage?.probablePackagers || [])[0]);
  const entryHint = cleanText((task.webShellTriage?.entryHints || [])[0]);
  const downstreamTopics = uniqStrings(task.webShellTriage?.downstreamTopics || []);
  const targetPath =
    cleanText(task.targetContext?.targetBinaryPath) ||
    cleanText(task.targetContext?.inputTarget) ||
    "<install-dir-or-binary>";

  if (!status || status === "not-started") {
    return `先执行 Web 套壳技术指纹扫描：node tools/task/detect-web-shell-tech.mjs ${targetPath} --output artifacts/tasks/${task.taskId}/run/web-shell-tech.json，然后把 wrapper/runtime、frontend、bundler、entry hints 回填到 run/web-shell-notes.md。`;
  }

  if (status === "fingerprinted" || status === "triaged") {
    const labels = uniqStrings([probableRuntime, probableFrontend, probablePackager]).join(" / ");
    const focus = cleanText(task.webShellTriage?.downstreamSummary) ||
      (entryHint
        ? `优先检查 ${entryHint}`
        : "优先检查主资源入口、bridge API 与网络/配置客户端");
    return `已完成 Web 套壳定性${labels ? `（${labels}）` : ""}，自动分流到 ${downstreamTopics.join(", ") || "后续子主线"}：${focus} [auto-route]`;
  }

  if (status === "scanned-no-hit") {
    return "Web 套壳探针未命中可信证据，回到原生 PE/导入面、运行时装载链和网络/配置主线继续推进。";
  }

  return "";
}

// report-only 改造：buildWebShellRuntimeTemplateReportBody（report.md 的
//「Runtime 专用后续动作模板摘要」节正文生成）随 syncReportMarkdown 退役而删除——
// report.md 完全归 agent 所有；web-shell 结论的机器通道是 run/web-shell-tech.json，
// 叙事通道是收口 report.md「专题发现」节（套壳分诊小节）。

// 棘轮拆除（V2-1）：no-hit / verdict 生效时清空义务字段，让下一次 resync 真正还原误报状态，
// 而不是把旧一次误报的 keyFindings/downstreamTopics 永远留在 task.json 里。
function clearWebShellObligationFields(task) {
  task.webShellTriage.keyFindings = [];
  task.webShellTriage.probableRuntimes = [];
  task.webShellTriage.probableFrontend = [];
  task.webShellTriage.probablePackagers = [];
  task.webShellTriage.entryHints = [];
  task.webShellTriage.downstreamTopics = [];
  task.webShellTriage.downstreamSummary = "";
  task.webShellTriage.artifacts = [];
}

export function applyWebShellTechResultToTask(taskDir, task, routeState = null) {
  const result = readWebShellTechResult(taskDir);
  if (!task.webShellTriage) {
    return {
      task,
      routeState,
      result: null
    };
  }

  const meaningful = webShellTechLooksMeaningful(result);

  // 人工否决通道：meaningful=true 时 verdict 完全无效且打 WARNING；否则强制 present=false
  if (webShellVerdictDeclaresNotWebShell(task)) {
    if (meaningful) {
      const runtimeLabel = topScoredLabel(result.summary?.probableRuntimes) || "unknown";
      const confidence = cleanText(result.summary?.confidence || "unknown");
      console.error(
        `[web-shell] WARNING verdict 被拒绝：探针存在 meaningful 命中（runtime=${runtimeLabel}, confidence=${confidence}），` +
        "真命中不可豁免，verdict=not-web-shell 不生效，web-shell-triage 义务照常。"
      );
    } else {
      task.webShellTriage.present = false;
      task.webShellTriage.status = "overridden-not-web-shell";
      clearWebShellObligationFields(task);
      task.webShellTriage.notes = uniqStrings([
        ...(task.webShellTriage.notes || []),
        `verdict=not-web-shell: ${cleanText(task.webShellTriage.verdictRationale).slice(0, 120)}`
      ]);
      return {
        task,
        routeState,
        result: null,
        overridden: true
      };
    }
  }

  if (!result) {
    return {
      task,
      routeState,
      result: null
    };
  }

  if (!meaningful) {
    // 误报/空探针结果不再固化为 present=true（棘轮拆除）：present=false，义务字段保持空
    task.webShellTriage.present = false;
    task.webShellTriage.status = "scanned-no-hit";
    clearWebShellObligationFields(task);
    task.webShellTriage.notes = uniqStrings([
      ...(task.webShellTriage.notes || []),
      `confidence=${cleanText(result.summary?.confidence || "unknown")}`,
      `scannedRoot=${cleanText(result.scannedRoot)}`
    ]);

    if (routeState) {
      ensureTrackC(routeState, result);
      ensureEntrypoint2(routeState, result);
    }

    return {
      task,
      routeState,
      result
    };
  }

  task.webShellTriage.present = true;
  task.webShellTriage.status = "fingerprinted";
  task.webShellTriage.keyFindings = buildKeyFindings(result);
  const routing = describeWebShellRouting(result);
  task.webShellTriage.notes = uniqStrings([
    ...(task.webShellTriage.notes || []),
    `confidence=${cleanText(result.summary?.confidence || "unknown")}`,
    `scannedRoot=${cleanText(result.scannedRoot)}`
  ]);
  task.webShellTriage.probableRuntimes = topWebShellKeys(result.summary?.probableRuntimes);
  task.webShellTriage.probableFrontend = topWebShellKeys(result.summary?.probableFrontend);
  task.webShellTriage.probablePackagers = topWebShellKeys(result.summary?.probablePackagers);
  task.webShellTriage.entryHints = uniqStrings(result.entryHints || []).slice(0, 24);
  task.webShellTriage.downstreamTopics = uniqStrings(routing.downstreamTopics || []);
  task.webShellTriage.downstreamSummary = cleanText(routing.nextAction);
  task.webShellTriage.artifacts = uniqStrings([
    ...(task.webShellTriage.artifacts || []),
    "run/web-shell-notes.md",
    "run/web-shell-tech.json"
    ,
    "run/web-shell-next-steps.md"
  ]);

  task.targetContext ||= {};
  task.targetContext.targetKeywords = uniqStrings([
    ...(task.targetContext.targetKeywords || []),
    ...task.webShellTriage.probableRuntimes,
    ...task.webShellTriage.probableFrontend,
    ...task.webShellTriage.probablePackagers,
    ...task.webShellTriage.downstreamTopics
  ]);

  ensureWebShellNotes(taskDir, result);
  ensureWebShellNextSteps(taskDir, result);

  if (routeState) {
    ensureTrackC(routeState, result);
    ensureEntrypoint2(routeState, result);
  }

  return {
    task,
    routeState,
    result
  };
}
