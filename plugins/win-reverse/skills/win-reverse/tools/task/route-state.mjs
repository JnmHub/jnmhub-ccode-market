import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  DELIVERABLE_TIERS,
  collectCriterionEvidenceRefs,
  criteriaItemHit,
  ensureDir,
  listTopicPackTemplateCandidates,
  normalizeNewlines,
  nowIso,
  phaseOrder,
  safeReadText,
  taskFile,
  templateTaskCoreDir,
  templateTaskDir
} from "./common.mjs";
import {
  buildWebShellSuggestedAction
} from "./web-shell-triage-state.mjs";

export const routeStateSchemaVersion = 2;

const defaultTrackStatus = "PENDING";
const validStatuses = new Set(["PENDING", "IN_PROGRESS", "BLOCKED", "DONE"]);
const defaultEntrypointStatus = "CANDIDATE";
const validEntrypointStatuses = new Set([
  "CANDIDATE",
  "PROBING",
  "EXPANDED",
  "PARKED",
  "EXHAUSTED",
  "SKIPPED",
  "SUCCESS"
]);
const defaultExecutionStatus = "not-evaluated";
const validExecutionStatuses = new Set([
  "not-evaluated",
  "needs-contract-lock",
  "ready-to-continue",
  "ready-to-close",
  "needs-route-rebuild",
  "needs-retrospective",
  "blocked-on-user",
  "blocked-on-risk",
  "completed"
]);
const defaultPauseCategory = "none";
const validPauseCategories = new Set(["none", "user", "risk", "internal"]);
// F-O4：切入点耗尽集合单源常量（R1 O4 引入 SKIPPED 后 validation.mjs 侧未同步，构成
// 双源漂移真 bug）。validation.mjs evaluateRouteConsistency 导入本常量，禁止第二份副本。
export const ENTRYPOINT_EXHAUSTED_STATUSES = ["PARKED", "EXHAUSTED", "SKIPPED"];
const maxEntrypointsInWorkingSet = 5;
const maxRetrospectivesInWorkingSet = 5;
const validVmTriageResults = new Set([
  "not-applicable",
  "not-started",
  "blackbox",
  "deep-analysis"
]);

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

function normalizeTrackStatus(value) {
  const text = cleanText(value).toUpperCase();
  const map = new Map([
    ["ACTIVE", "IN_PROGRESS"],
    ["IN-PROGRESS", "IN_PROGRESS"],
    ["IN_PROGRESS", "IN_PROGRESS"],
    ["BLOCKED", "BLOCKED"],
    ["DONE", "DONE"],
    ["COMPLETED", "DONE"],
    ["SUCCESS", "DONE"],
    ["PENDING", "PENDING"],
    ["TODO", "PENDING"]
  ]);
  return map.get(text) || (validStatuses.has(text) ? text : defaultTrackStatus);
}

function normalizeEntrypointStatus(value) {
  const text = cleanText(value).toUpperCase();
  const map = new Map([
    ["ACTIVE", "PROBING"],
    ["PROBING", "PROBING"],
    ["EXPANDED", "EXPANDED"],
    ["PARKED", "PARKED"],
    ["EXHAUSTED", "EXHAUSTED"],
    ["SKIP", "SKIPPED"],
    ["SKIPPED", "SKIPPED"],
    ["N/A", "SKIPPED"],
    ["NA", "SKIPPED"],
    ["NOT-APPLICABLE", "SKIPPED"],
    ["DONE", "SUCCESS"],
    ["COMPLETED", "SUCCESS"],
    ["SUCCESS", "SUCCESS"],
    ["CANDIDATE", "CANDIDATE"],
    ["TODO", "CANDIDATE"]
  ]);
  const mapped = map.get(text);
  if (mapped) {
    return mapped;
  }
  if (validEntrypointStatuses.has(text)) {
    return text;
  }
  // O4：未知值回落 CANDIDATE 前显式告警（stderr，不污染 stdout），文案含完整合法词表；
  // 空值视为"未设置"静默回落，不告警。
  if (text) {
    console.warn(
      `[route-state] WARNING: 未知 entrypoint status "${cleanText(value)}" 已回落为 ${defaultEntrypointStatus}；` +
      `合法值: ${[...validEntrypointStatuses].join("/")}（别名列: ACTIVE/DONE/COMPLETED/TODO/SKIP/N/A/NA/NOT-APPLICABLE）`
    );
  }
  return defaultEntrypointStatus;
}

function normalizeExecutionStatusValue(value) {
  const text = cleanText(value);
  const lowered = text.toLowerCase();
  const map = new Map([
    ["done", "completed"],
    ["complete", "completed"],
    ["completed", "completed"],
    ["ready", "ready-to-continue"],
    ["active", "ready-to-continue"],
    ["continue", "ready-to-continue"],
    ["paused-user", "blocked-on-user"],
    ["paused-risk", "blocked-on-risk"]
  ]);
  return map.get(lowered) || (validExecutionStatuses.has(text) ? text : defaultExecutionStatus);
}

function uniq(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toTrackId(title, fallback = "track") {
  const normalized = cleanText(title)
    .toLowerCase()
    .replace(/[`*#]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function parseLabeledValue(block, labels) {
  for (const label of labels) {
    const match = new RegExp(`^-\\s*${label}:[^\\S\\r\\n]*(.*)$`, "gim").exec(String(block || ""));
    if (match) {
      return cleanText(match[1]);
    }
  }
  return "";
}

function parseCheckpoints(value) {
  const text = cleanText(value);
  if (!text || text === "-" || text === "—" || text === "未记录" || text === "none") {
    return [];
  }
  return uniq(
    text
      .split(/[;,，；]/)
      .map((item) => cleanText(item))
      .filter(Boolean)
  );
}

function normalizeTrack(track, index) {
  const title = cleanText(track?.title || track?.name || track?.track || track?.id || `线路 ${index + 1}`);
  return {
    id: cleanText(track?.id) || toTrackId(title, `track-${index + 1}`),
    title,
    target: cleanText(track?.target),
    inputs: cleanText(track?.inputs),
    output: cleanText(track?.output),
    priority: cleanText(track?.priority),
    checkpoints: ensureArray(track?.checkpoints).map((item) => cleanText(item)).filter(Boolean),
    status: normalizeTrackStatus(track?.status),
    nextStep: cleanText(track?.nextStep),
    updatedAt: cleanText(track?.updatedAt)
  };
}

function normalizeEntrypoint(entrypoint, index) {
  const title = cleanText(
    entrypoint?.title || entrypoint?.name || entrypoint?.hypothesis || entrypoint?.id || `切入点 ${index + 1}`
  );
  return {
    id: cleanText(entrypoint?.id) || `EP-${String(index + 1).padStart(3, "0")}`,
    title,
    hypothesis: cleanText(entrypoint?.hypothesis),
    boundTopics: uniq(ensureArray(entrypoint?.boundTopics).map((item) => cleanText(item))),
    targetTrack: cleanText(entrypoint?.targetTrack),
    rationale: cleanText(entrypoint?.rationale),
    cost: cleanText(entrypoint?.cost),
    expectedGain: cleanText(entrypoint?.expectedGain),
    probe: cleanText(entrypoint?.probe),
    successCriteria: cleanText(entrypoint?.successCriteria),
    failureCriteria: cleanText(entrypoint?.failureCriteria),
    status: normalizeEntrypointStatus(entrypoint?.status),
    resultSummary: cleanText(entrypoint?.resultSummary),
    evidenceRefs: uniq(ensureArray(entrypoint?.evidenceRefs).map((item) => cleanText(item))),
    nextOnSuccess: cleanText(entrypoint?.nextOnSuccess),
    nextOnFailure: cleanText(entrypoint?.nextOnFailure),
    updatedAt: cleanText(entrypoint?.updatedAt)
  };
}

function normalizeRetrospective(retrospective, index) {
  return {
    id: cleanText(retrospective?.id) || `RETRO-${String(index + 1).padStart(3, "0")}`,
    triggeredByEntrypoints: uniq(
      ensureArray(retrospective?.triggeredByEntrypoints).map((item) => cleanText(item))
    ),
    summary: cleanText(retrospective?.summary),
    failedBecause: cleanText(retrospective?.failedBecause),
    newEntrypoints: uniq(ensureArray(retrospective?.newEntrypoints).map((item) => cleanText(item))),
    decision: cleanText(retrospective?.decision),
    nextFocus: cleanText(retrospective?.nextFocus),
    createdAt: cleanText(retrospective?.createdAt)
  };
}

function normalizeClue(clue, index) {
  return {
    id: cleanText(clue?.id) || `CLUE-${String(index + 1).padStart(3, "0")}`,
    sourceTrack: cleanText(clue?.sourceTrack),
    sourceEntrypoint: cleanText(clue?.sourceEntrypoint),
    discoveredAt: cleanText(clue?.discoveredAt),
    content: cleanText(clue?.content),
    verification: cleanText(clue?.verification),
    impact: cleanText(clue?.impact),
    action: cleanText(clue?.action),
    confidence: cleanText(clue?.confidence)
  };
}

function normalizeExecutionState(execution, task = {}) {
  return {
    status: normalizeExecutionStatusValue(execution?.status),
    autoAdvanceEligible: execution?.autoAdvanceEligible === true,
    pauseCategory: validPauseCategories.has(cleanText(execution?.pauseCategory))
      ? cleanText(execution?.pauseCategory)
      : defaultPauseCategory,
    pauseReason: cleanText(execution?.pauseReason),
    nextEntrypointId: cleanText(execution?.nextEntrypointId),
    nextPhase: cleanText(execution?.nextPhase) || cleanText(task.phase) || "Observe",
    nextExecutableAction: cleanText(execution?.nextExecutableAction),
    summary: cleanText(execution?.summary),
    updatedAt: cleanText(execution?.updatedAt)
  };
}

function dynamicRiskReason(task, nextAction) {
  const action = cleanText(nextAction);
  if (!action) {
    return "";
  }

  const riskRules = [
    {
      pattern: /运行未知样本|运行样本|启动目标|启动样本|启动程序|CreateProcess|ShellExecute|\brun\s+(?:the\s+)?sample\b|\blaunch\s+(?:the\s+)?target\b/i,
      reason: "下一动作包含运行未知样本或启动目标程序"
    },
    {
      pattern: /Frida\s+attach|attach\s+到|注入|远程线程|CreateRemoteThread|NtCreateThreadEx|WriteProcessMemory|QueueUserAPC|\bAPC\b|manual\s*map|reflective/i,
      reason: "下一动作包含进程附加、注入或远程线程"
    },
    {
      pattern: /加载.*驱动|启动.*驱动|NtLoadDriver|sc\s+start|load\s+(?:unsigned\s+)?driver/i,
      reason: "下一动作包含驱动加载或启动"
    },
    {
      pattern: /修改.*注册表|注册表.*写入|reg\s+add|Set-ItemProperty|sc\s+create|schtasks\s+\/create|修改.*服务|创建.*计划任务/i,
      reason: "下一动作包含真实主机注册表、服务或计划任务修改"
    },
    {
      pattern: /真实网络|对外联机|外网|发起连接|联网请求|connect\s+to\s+(?!127\.0\.0\.1|localhost)|curl\s+https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/i,
      reason: "下一动作包含真实网络连接"
    }
  ];

  const matched = riskRules.find((rule) => rule.pattern.test(action));
  if (!matched) {
    return "";
  }

  if (task.boundaries?.activeTriggerAllowed === true || task.debugSession?.isolatedHost === true) {
    return "";
  }
  return matched.reason;
}

function normalizeVmTriage(vmTriage, task = {}) {
  const taskVm = task.vm || {};
  const rawResult = cleanText(vmTriage?.triageResult || taskVm.triageResult);
  const triageResult = validVmTriageResults.has(rawResult)
    ? rawResult
    : taskVm.present === true
      ? "not-started"
      : "not-applicable";

  return {
    triageResult,
    blackboxApi: cleanText(vmTriage?.blackboxApi || taskVm.blackboxApi),
    rationale: cleanText(vmTriage?.rationale || taskVm.triageReason),
    notes: uniq(
      ensureArray(vmTriage?.notes ?? taskVm.triageNotes)
        .map((item) => cleanText(item))
        .filter(Boolean)
    ),
    updatedAt: cleanText(vmTriage?.updatedAt)
  };
}

// 契约五字段单源定义（V2-2）：机器判定（listMissingContractFields）、pauseReason 形状行、
// 文档（SKILL.md / reverse-bootstrap.md）与 check-doc-facts 断言全部从这里读取，禁止第二份副本。
export const CONTRACT_FIELD_HINTS = {
  target: {
    // P1-5（round1 F-06）：每个字段只展示一种 canonical shape 示例；判定器
    // （listMissingContractFields）仍兼容其余等价形态，但提示面不再罗列多种写法。
    shape: `"targetContext": { "inputTarget": "<目标名或路径>" }`,
    note: "逆向目标标识"
  },
  objective: {
    shape: `"objective": "<一句话目标，含成功判据方向>"`,
    note: "任务目标"
  },
  deliverableTier: {
    // F-O7：五枚举文案由 common.mjs 的 DELIVERABLE_TIERS 单源常量生成，禁止内联第二份词表。
    shape: `"deliverableTier": "${DELIVERABLE_TIERS.join(" | ")}"（五选一枚举）`,
    note: "交付层级，决定 Rebuild 阶段产物义务"
  },
  completionCriteria: {
    shape: `"completionCriteria": [{ "text": "<判据>", "status": "pending" }]（非空数组）`,
    note: "完成判据列表"
  },
  boundaries: {
    shape: `"boundaries": { "input": { "inScope": ["..."], "outOfScope": ["..."] } }（inScope / outOfScope / forbiddenActions 任一非空，或 contractLocked 显式声明；计划触发主动动作时另需 activeTriggerAllowed: true）`,
    note: "边界与禁区"
  }
};

function listMissingContractFields(task = {}) {
  const missing = [];
  const hasTarget = Boolean(
    cleanText(task.targetContext?.inputTarget) ||
    cleanText(task.targetContext?.targetBinaryPath) ||
    cleanText(task.target?.value) ||
    cleanText(task.target?.path) ||
    cleanText(task.target?.binaryPath)
  );
  const boundaries = task.boundaries || {};
  const boundaryInput = boundaries.input || {};
  const hasBoundary = Boolean(
    cleanText(boundaries.contractLocked) ||
    ensureArray(boundaryInput.inScope).some(cleanText) ||
    ensureArray(boundaryInput.outOfScope).some(cleanText) ||
    ensureArray(boundaries.inScope).some(cleanText) ||
    ensureArray(boundaries.outOfScope).some(cleanText) ||
    ensureArray(boundaries.forbiddenActions).some(cleanText)
  );

  // 判定器与 CONTRACT_FIELD_HINTS 同键序遍历，保证字段集单源一致
  const detectors = {
    target: !hasTarget,
    objective: !cleanText(task.objective),
    deliverableTier: !cleanText(task.deliverableTier),
    completionCriteria: !Array.isArray(task.completionCriteria) || task.completionCriteria.length === 0,
    boundaries: !hasBoundary
  };
  for (const name of Object.keys(CONTRACT_FIELD_HINTS)) {
    if (detectors[name]) {
      missing.push(name);
    }
  }
  return missing;
}

function defaultTracks() {
  return [
    normalizeTrack(
      {
        title: "A",
        target: "原生入口 / PE 头 / 节区 / 导入 / 资源分诊",
        inputs: "目标 EXE/DLL/SYS、基础文件信息、导入面、资源面",
        output: "先判断是否继续进入 static-triage / dotnet / driver / packer-unpack",
        priority: "high",
        checkpoints: ["PE 头", "入口点", "导入面", "资源面"],
        nextStep: "A1 静态入口与导入面分诊"
      },
      0
    ),
    normalizeTrack(
      {
        title: "B",
        target: "保护 / 装载 / 异常 / 运行时控制链分诊",
        inputs: "壳迹象、异常链、线程/模块加载、反分析信号",
        output: "先判断是否继续进入 anti-analysis / loader-injection / exception-runtime / memory-forensics",
        priority: "high",
        checkpoints: ["壳迹象", "异常门", "装载链", "运行时保护"],
        nextStep: "B1 保护与运行时路径探针"
      },
      1
    ),
    normalizeTrack(
      {
        title: "C",
        target: "Web 套壳 / WebView / 前端技术路线指纹",
        inputs: "安装目录、资源目录、JS/HTML 包、PE 依赖、运行时字符串",
        output: "快速确定 wrapper/runtime、前端框架、bundler，并给出后续入口线索",
        priority: "high",
        checkpoints: ["wrapper/runtime", "前端框架", "bundler", "入口资源"],
        nextStep: "C1 安装目录与二进制技术指纹扫描"
      },
      2
    )
  ];
}

// P0-3b（round1 F-03）：默认 clues 为空集——不再注入 CLUE-001 八字段空脚手架
// （空占位仪式是"验收反复回补模板"的来源之一，M4 判据要求 grep 八字段空模式零命中）。
function defaultClues() {
  return [];
}

function defaultExecutionState(task = {}) {
  return normalizeExecutionState(
    {
      status: "ready-to-continue",
      autoAdvanceEligible: true,
      pauseCategory: "none",
      pauseReason: "",
      nextEntrypointId: "EP-001",
      nextPhase: cleanText(task.phase) || "Observe",
      nextExecutableAction:
        "执行 EP-001 的最小 probe：做一次最小观测，确认当前主阻塞更像 PE 分诊、壳、反分析、.NET、驱动或网络链路问题。",
      summary: "恢复或初始化完成后不能停在状态汇报；当前应直接执行 EP-001 的最小 probe。"
    },
    task
  );
}

function defaultEntrypoints() {
  return [
    normalizeEntrypoint(
      {
        id: "EP-001",
        title: "先做最小成本分诊",
        hypothesis: "先用一个最便宜的观察性探针判断当前主阻塞更像 PE 分诊、壳、反分析、.NET、驱动、网络链路，还是 Web 套壳 / WebView 技术路线问题。",
        boundTopics: [],
        targetTrack: "A",
        rationale: "复合场景先做中性分诊，避免一开始就把某个 topic 误当成唯一主线。",
        cost: "low",
        expectedGain: "high",
        probe: "做一次最小观测：PE/导入分诊、字符串/导入表交叉引用分析、内存保护变化观察、安装目录 Web 套壳技术指纹扫描 四选一，先确认下一刀切在哪条链路。",
        successCriteria: "能明确缩窄主阻塞点，或激活下一条更高价值的切入点。",
        failureCriteria: "没有带来新的可执行分歧，且不能支持下一步判断。",
        status: "CANDIDATE",
        nextOnSuccess: "扩展该切入点并绑定更具体的 topic。",
        nextOnFailure: "切到下一个候选切入点。",
        updatedAt: ""
      },
      0
    ),
    normalizeEntrypoint(
      {
        id: "EP-002",
        title: "判定是否为 Web 套壳 / WebView 应用",
        hypothesis: "若安装目录携带大量 JS/HTML/asar/pak/前端资源，目标可能是 Electron / CEF / WebView2 / Tauri / Wails / NW.js 等套壳应用，先判定技术路线可显著缩短后续定位路径。",
        boundTopics: ["web-shell-triage"],
        targetTrack: "C",
        rationale: "很多 Windows EXE 本质是 Web 应用套壳；先做 wrapper/runtime 指纹识别，比直接深挖 IDA 更快收敛到主资源、桥接层和 API 入口。",
        cost: "low",
        expectedGain: "high",
        probe: "扫描安装目录、资源目录、PE 依赖和二进制字符串：优先识别 Electron / CEF / WebView2 / Tauri / Wails / NW.js / Qt WebEngine / Neutralino / Flutter Web 资产，并记录前端框架与 bundler 线索。",
        successCriteria: "至少得到一个高置信 wrapper/runtime 候选，或定位到 package.json / app.asar / index.html / preload.js / WebView2Loader.dll / libcef.dll 等关键入口。",
        failureCriteria: "目录与二进制都未提供可信 Web 套壳证据，且不能缩窄到任何 wrapper/runtime 候选。",
        status: "CANDIDATE",
        nextOnSuccess: "转入对应入口：asar/package.json/HTML/bridge API/网络 client/配置文件。",
        nextOnFailure: "回到原生 PE/导入面和运行时装载链继续分诊。",
        updatedAt: ""
      },
      1
    )
  ];
}

function defaultRetrospectives() {
  return [];
}

// P0-3a（round1 F-02）：progress.md 视图全链删除——原 mergeTracks(routeTracks,
// progressRows) 与 parseProgress() 一并摘除，tracks 回填仅由 route-plan 解析支撑，
// defaultTracks() 兜底不变（终审 §1.3-10：无需重接数据流）。

function entrypointRecoveredMeaningfully(entrypoint) {
  return Boolean(
    cleanText(entrypoint?.hypothesis) ||
    cleanText(entrypoint?.rationale) ||
    cleanText(entrypoint?.probe) ||
    cleanText(entrypoint?.successCriteria) ||
    cleanText(entrypoint?.failureCriteria) ||
    cleanText(entrypoint?.resultSummary)
  );
}

function collectHeadingSections(text, headingPattern) {
  const source = String(text || "");
  const matches = Array.from(source.matchAll(headingPattern));
  return matches.map((match, index) => {
    const headingEnd = match.index + match[0].length;
    let bodyStart = headingEnd;
    if (source.slice(bodyStart, bodyStart + 2) === "\r\n") {
      bodyStart += 2;
    } else if (source[bodyStart] === "\n") {
      bodyStart += 1;
    }
    const nextStart = index + 1 < matches.length ? matches[index + 1].index : source.length;
    return {
      match,
      body: source.slice(bodyStart, nextStart).trimEnd()
    };
  });
}

export function parseRoutePlan(routePlanText) {
  return Array.from(String(routePlanText || "").matchAll(/^###\s+(.+)$/gm)).map((match) => match[1].trim());
}

export function parseRoutePlanMarkdown(routePlanText) {
  const sections = collectHeadingSections(routePlanText, /^###\s+(.+)$/gm);
  return sections.map(({ match, body }, index) =>
    normalizeTrack(
      {
        id: toTrackId(match[1], `track-${index + 1}`),
        title: cleanText(match[1]),
        target: parseLabeledValue(body, ["目标", "Target"]),
        inputs: parseLabeledValue(body, ["输入依赖", "Inputs"]),
        output: parseLabeledValue(body, ["输出格式", "Output"]),
        priority: parseLabeledValue(body, ["优先级", "Priority"]),
        checkpoints: parseCheckpoints(parseLabeledValue(body, ["检查点", "Checkpoints"]))
      },
      index
    )
  );
}

export function parseCluesMarkdown(cluesText) {
  const sections = collectHeadingSections(cluesText, /^##\s+(CLUE-\d+)$/gm);
  return sections.map(({ match, body }, index) =>
    normalizeClue(
      {
        id: cleanText(match[1]),
        sourceTrack: parseLabeledValue(body, ["来源线路", "Source Track"]),
        sourceEntrypoint: parseLabeledValue(body, ["来源切入点", "Source Entrypoint"]),
        discoveredAt: parseLabeledValue(body, ["发现时间", "Discovered At"]),
        content: parseLabeledValue(body, ["线索内容", "Content"]),
        verification: parseLabeledValue(body, ["验证方式", "Verification"]),
        impact: parseLabeledValue(body, ["影响范围", "Impact"]),
        action: parseLabeledValue(body, ["行动建议", "Action"]),
        confidence: parseLabeledValue(body, ["置信度", "Confidence"])
      },
      index
    )
  );
}

export function parseEntrypointsMarkdown(routePlanText) {
  const sections = collectHeadingSections(routePlanText, /^####\s+(EP-\d+)\s+(.+)$/gm);
  return sections.map(({ match, body }, index) =>
    normalizeEntrypoint(
      {
        id: cleanText(match[1]),
        title: cleanText(match[2]),
        hypothesis: parseLabeledValue(body, ["假设", "Hypothesis"]),
        boundTopics: parseCheckpoints(parseLabeledValue(body, ["关联专题", "Bound Topics"])),
        targetTrack: parseLabeledValue(body, ["对应线路", "Target Track"]),
        rationale: parseLabeledValue(body, ["选择理由", "Rationale"]),
        cost: parseLabeledValue(body, ["启动成本", "Cost"]),
        expectedGain: parseLabeledValue(body, ["预期收益", "Expected Gain"]),
        probe: parseLabeledValue(body, ["最小探针", "Probe"]),
        successCriteria: parseLabeledValue(body, ["成功判据", "Success Criteria"]),
        failureCriteria: parseLabeledValue(body, ["失败判据", "Failure Criteria"]),
        status: parseLabeledValue(body, ["当前状态", "Status"]),
        resultSummary: parseLabeledValue(body, ["当前结论", "Result Summary"]),
        nextOnSuccess: parseLabeledValue(body, ["成功后", "Next On Success"]),
        nextOnFailure: parseLabeledValue(body, ["失败后", "Next On Failure"]),
        updatedAt: parseLabeledValue(body, ["更新时间", "Updated At"])
      },
      index
    )
  );
}

export function parseRetrospectivesMarkdown(routePlanText) {
  const sections = collectHeadingSections(routePlanText, /^####\s+(RETRO-\d+)$/gm);
  return sections.map(({ match, body }, index) =>
    normalizeRetrospective(
      {
        id: cleanText(match[1]),
        triggeredByEntrypoints: parseCheckpoints(
          parseLabeledValue(body, ["触发切入点", "Triggered By Entrypoints"])
        ),
        summary: parseLabeledValue(body, ["复盘结论", "Summary"]),
        failedBecause: parseLabeledValue(body, ["失败原因", "Failed Because"]),
        newEntrypoints: parseCheckpoints(parseLabeledValue(body, ["新生切入点", "New Entrypoints"])),
        decision: parseLabeledValue(body, ["路线决策", "Decision"]),
        nextFocus: parseLabeledValue(body, ["下一焦点", "Next Focus"]),
        createdAt: parseLabeledValue(body, ["创建时间", "Created At"])
      },
      index
    )
  );
}

export function defaultRouteStateDocument(task = {}) {
  return {
    schemaVersion: routeStateSchemaVersion,
    updatedAt: nowIso(),
    taskId: cleanText(task.taskId),
    phase: cleanText(task.phase),
    syncStatus: cleanText(task.routeState?.syncStatus) || "not-started",
    activeTracks: uniq(ensureArray(task.routeState?.activeTracks).map((item) => cleanText(item))),
    activeEntrypoints: uniq(ensureArray(task.routeState?.activeEntrypoints).map((item) => cleanText(item))),
    vmTriage: normalizeVmTriage(task.routeState?.vmTriage, task),
    execution: defaultExecutionState(task),
    tracks: defaultTracks(),
    entrypoints: defaultEntrypoints(),
    retrospectives: defaultRetrospectives(),
    clues: defaultClues()
  };
}

export function normalizeRouteStateDocument(doc, task = {}) {
  const base = defaultRouteStateDocument(task);
  const tracks = (ensureArray(doc?.tracks).length > 0 ? ensureArray(doc?.tracks) : base.tracks).map((track, index) =>
    normalizeTrack(track, index)
  );
  const entrypoints = (ensureArray(doc?.entrypoints).length > 0 ? ensureArray(doc?.entrypoints) : base.entrypoints)
    .map((entrypoint, index) => normalizeEntrypoint(entrypoint, index))
    .slice(0, maxEntrypointsInWorkingSet);
  const retrospectives = (
    ensureArray(doc?.retrospectives).length > 0 ? ensureArray(doc?.retrospectives) : base.retrospectives
  )
    .map((retrospective, index) => normalizeRetrospective(retrospective, index))
    .slice(-maxRetrospectivesInWorkingSet);
  const clues = (ensureArray(doc?.clues).length > 0 ? ensureArray(doc?.clues) : base.clues).map((clue, index) =>
    normalizeClue(clue, index)
  );

  const inFlightTracks = tracks
    .filter((track) => track.status === "IN_PROGRESS" || track.status === "BLOCKED")
    .map((track) => track.title);
  const pendingTracks = tracks.filter((track) => track.status === "PENDING").map((track) => track.title);
  const explicitActiveTracks = Array.isArray(doc?.activeTracks)
    ? ensureArray(doc?.activeTracks).map((item) => cleanText(item))
    : null;
  const activeTracks = uniq(
    (explicitActiveTracks ?? ensureArray(task.routeState?.activeTracks).map((item) => cleanText(item)))
      .concat(inFlightTracks.length > 0 ? inFlightTracks : pendingTracks.slice(0, 1))
  );

  const explicitActiveEntrypoints = Array.isArray(doc?.activeEntrypoints)
    ? ensureArray(doc?.activeEntrypoints).map((item) => cleanText(item))
    : null;
  const activeEntrypoints = uniq(
    (explicitActiveEntrypoints ?? ensureArray(task.routeState?.activeEntrypoints).map((item) => cleanText(item)))
      .concat(
        entrypoints
          .filter((entrypoint) => entrypoint.status === "PROBING" || entrypoint.status === "EXPANDED")
          .map((entrypoint) => entrypoint.id)
      )
      .concat(
        entrypoints
          .filter((entrypoint) => entrypoint.status === "CANDIDATE")
          .slice(0, 1)
          .map((entrypoint) => entrypoint.id)
      )
  ).slice(0, 2);
  const execution = normalizeExecutionState(doc?.execution ?? base.execution, task);
  const vmTriage = normalizeVmTriage(doc?.vmTriage ?? base.vmTriage, task);

  return {
    schemaVersion: Number(doc?.schemaVersion) || routeStateSchemaVersion,
    updatedAt: cleanText(doc?.updatedAt) || nowIso(),
    taskId: cleanText(doc?.taskId) || cleanText(task.taskId),
    phase: cleanText(doc?.phase) || cleanText(task.phase),
    syncStatus: cleanText(doc?.syncStatus) || cleanText(task.routeState?.syncStatus) || "not-started",
    activeTracks,
    activeEntrypoints,
    vmTriage,
    execution,
    tracks,
    entrypoints,
    retrospectives,
    clues
  };
}

export function buildRouteStateFromMarkdown(taskDir, task = {}) {
  const routePlanText = safeReadText(taskFile(taskDir, task.routeState?.planPath || "state/route-plan.md"));
  const cluesText = safeReadText(taskFile(taskDir, task.routeState?.cluesPath || "state/clues.md"));

  // P0-3a（round1 F-02）：progress.md 已删除，tracks 回填仅吃 route-plan 解析结果。
  const mergedTracks = parseRoutePlanMarkdown(routePlanText);
  const clues = parseCluesMarkdown(cluesText);
  const entrypoints = parseEntrypointsMarkdown(routePlanText);
  const retrospectives = parseRetrospectivesMarkdown(routePlanText);

  const routePlanHasEntrypointMarkers = /EP-\d+/i.test(routePlanText) || /切入点|Entrypoint Loop/i.test(routePlanText);
  const routePlanHasRetroMarkers = /RETRO-\d+/i.test(routePlanText) || /复盘|Retrospectives/i.test(routePlanText);
  const missingEntrypoints = routePlanHasEntrypointMarkers && entrypoints.length === 0;
  const shallowEntrypoints =
    entrypoints.length > 0 && entrypoints.every((entrypoint) => !entrypointRecoveredMeaningfully(entrypoint));
  const missingRetrospectives = routePlanHasRetroMarkers && retrospectives.length === 0;

  return normalizeRouteStateDocument(
    {
      tracks: mergedTracks.length > 0 ? mergedTracks : defaultTracks(),
      clues: clues.length > 0 ? clues : defaultClues(),
      entrypoints: entrypoints.length > 0 ? entrypoints : defaultEntrypoints(),
      retrospectives: retrospectives.length > 0 ? retrospectives : defaultRetrospectives(),
      activeTracks: [],
      activeEntrypoints: [],
      syncStatus:
        missingEntrypoints || shallowEntrypoints || missingRetrospectives
          ? "backfilled-from-markdown-lossy"
          : "backfilled-from-markdown"
    },
    task
  );
}

export function readRouteStateDocument(taskDir, task = {}) {
  const relPath = task.routeState?.statePath || "state/route-state.json";
  const filePath = taskFile(taskDir, relPath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return normalizeRouteStateDocument(JSON.parse(fs.readFileSync(filePath, "utf8")), task);
}

function findEntrypointById(routeState, entrypointId) {
  return (routeState.entrypoints || []).find((entrypoint) => cleanText(entrypoint.id) === cleanText(entrypointId)) || null;
}

function firstEntrypointWithStatuses(routeState, statuses) {
  return (routeState.entrypoints || []).find((entrypoint) => statuses.includes(cleanText(entrypoint.status))) || null;
}

export function resolveExecutionState(task, routeState) {
  const current = normalizeExecutionState(routeState?.execution, task);
  const nextPhase = cleanText(task.phase) || cleanText(routeState?.phase) || "Observe";
  const stamp = (execution) => normalizeExecutionState({ ...execution, updatedAt: nowIso() }, task);
  const allEntrypoints = ensureArray(routeState?.entrypoints);
  // O11：EP-002（boundTopics 含 web-shell-triage 的默认切入点）生命周期修复——
  // 探测已得出结论（scanned-no-hit，或 verdict=not-web-shell 且生效）时置 EXHAUSTED，
  // 写回 entrypoints 走正常 normalize+落盘路径，不再在非 Web 任务中确定性挂到 close。
  // 仅翻转 CANDIDATE：PROBING/EXPANDED 表示已在工作，SUCCESS 等历史状态不可覆盖。
  // verdict 仅在生效时采用（present!==true；meaningful hit 会驳回 verdict 且 present 保持 true）。
  const webShellTriageStatus = cleanText(task.webShellTriage?.status || "").toLowerCase();
  const webShellVerdictEffective =
    cleanText(task.webShellTriage?.verdict || "") === "not-web-shell" && task.webShellTriage?.present !== true;
  if (webShellTriageStatus === "scanned-no-hit" || webShellVerdictEffective) {
    for (const entrypoint of allEntrypoints) {
      if (
        ensureArray(entrypoint?.boundTopics).includes("web-shell-triage") &&
        cleanText(entrypoint?.status) === "CANDIDATE"
      ) {
        entrypoint.status = "EXHAUSTED";
      }
    }
  }
  const latestRetrospective = ensureArray(routeState?.retrospectives).slice(-1)[0] || null;
  const webShellAction = buildWebShellSuggestedAction(task);
  const webShellTopicSelected = uniqStrings(task.taskPacks?.selectedTopics || []).includes("web-shell-triage");
  const webShellPresent = task.webShellTriage?.present === true;
  const webShellPriorityEntrypoint = (routeState?.entrypoints || []).find(
    (entrypoint) =>
      cleanText(entrypoint?.id).toUpperCase() === "EP-002" &&
      ["PROBING", "EXPANDED", "CANDIDATE"].includes(cleanText(entrypoint?.status))
  );
  const activeCandidates = ensureArray(routeState?.activeEntrypoints)
    .map((entrypointId) => findEntrypointById(routeState, entrypointId))
    .filter(Boolean)
    .filter((entrypoint) => ["PROBING", "EXPANDED", "CANDIDATE"].includes(cleanText(entrypoint.status)));
  const nextEntrypoint =
    ((webShellTopicSelected || (webShellPresent && !cleanText(task.webShellTriage?.status || "").match(/^scanned-no-hit$/i)))
      ? webShellPriorityEntrypoint
      : null) ||
    activeCandidates[0] ||
    firstEntrypointWithStatuses(routeState, ["PROBING", "EXPANDED"]) ||
    firstEntrypointWithStatuses(routeState, ["CANDIDATE"]);
  const allEntrypointsExhausted =
    allEntrypoints.length > 0 &&
    allEntrypoints.every((entrypoint) => ENTRYPOINT_EXHAUSTED_STATUSES.includes(cleanText(entrypoint.status)));

  if (routeState?.syncStatus === "backfilled-from-markdown-lossy") {
    return stamp(
      {
        status: "needs-route-rebuild",
        autoAdvanceEligible: false,
        pauseCategory: "internal",
        pauseReason: "route-state 由 Markdown 有损回填，当前切入点集合不可信。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction: "先人工重建 entrypoints / retrospectives，再继续推进当前活跃阶段。",
        summary: "当前不能停在状态汇报，但也不能盲目续跑；应先修复 route-state 的结构化切入点集合。"
      },
    );
  }

  if (current.pauseCategory === "user") {
    return stamp(
      {
        ...current,
        status: "blocked-on-user",
        autoAdvanceEligible: false,
        pauseCategory: "user",
        pauseReason: current.pauseReason || "需要用户协作后才能继续。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction: "等待用户完成登录、补样本或其他协作动作后，再回到当前活跃阶段。",
        summary: "当前允许暂停，因为继续执行需要用户协作。"
      },
    );
  }

  if (current.pauseCategory === "risk") {
    return stamp(
      {
        ...current,
        status: "blocked-on-risk",
        autoAdvanceEligible: false,
        pauseCategory: "risk",
        pauseReason: current.pauseReason || "继续执行前需要风险确认。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction: "等待风险确认；确认后立刻恢复到当前活跃阶段执行。",
        summary: "当前允许暂停，因为继续执行前需要风险确认。"
      },
    );
  }

  const missingContractFields = listMissingContractFields(task);
  if (missingContractFields.length > 0) {
    // pauseReason 逐字段附形状行（单源：CONTRACT_FIELD_HINTS），尾部固定镜像字段提示
    const shapeLines = missingContractFields
      .map((name) => `- ${name}: ${CONTRACT_FIELD_HINTS[name]?.shape || "(形状未定义)"}`)
      .join("\n");
    return stamp(
      {
        status: "needs-contract-lock",
        autoAdvanceEligible: false,
        pauseCategory: "internal",
        pauseReason:
          `任务契约字段未锁定: ${missingContractFields.join(", ")}\n逐字段形状：\n${shapeLines}\n` +
          "task.json 的 routeState 镜像字段由 sync 再生，契约字段请编辑 task.json 非镜像区或用 --task-input。" +
          "禁止经 bash/PowerShell 内联 node -e 写含 Windows 路径的 JSON（转义损毁实测高发）；用 Edit 工具直改 task.json 或 task-init --task-input 注入。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction:
          "先按 pauseReason 的逐字段形状补齐 task.json 契约五字段（形状定义单源见 tools/task/route-state.mjs 的 CONTRACT_FIELD_HINTS），再重新执行 task-sync -> task-advance。",
        summary: "当前不能执行逆向 probe；任务契约未锁定会让后续证据和验收目标失去锚点。"
      },
    );
  }

  // R3-O2：完成态短路 ready-to-close。判据已全标记命中时，sync 不应再输出启动期分诊
  // 指引，而应指向收口预检。位置裁决（F-2）：在 needs-contract-lock 分支之后、空
  // entrypoints 分支之前——completionCriteria 全命中不蕴含契约五字段已锁定
  // （listMissingContractFields 独立判定），契约未锁时 close 指引同样倒挂；
  // pauseCategory=user/risk、backfilled 均在更上游分支先返回，构成天然负向锁。
  // 相对次序：ready-to-close 优先于 needs-retrospective（判据全标记命中时收口指引
  // 压过复盘催促——工作已完成语义）。
  // 三重门槛缺一不可（承重墙，非增强项）：
  //   1. completionCriteria 非空且逐条 criteriaItemHit 为真——agent 自申报，
  //      最终以 task-close --dry-run 机器校验为准（文案已如实声明）；
  //   2. 逐条 hit 判据 collectCriterionEvidenceRefs 非空——形态级收集、无 fs；
  //      省略本门，"Rebuild 期字符串形态 [x] 判据无 evidenceRefs"场景会出现
  //      stdout 指引 close 而 stderr 同刻 WARN 缺合法 evidenceRefs 的文案矛盾
  //      （check-task-behavior.mjs 既有场景锁，dry-run 必挂）；
  //   3. phase >= Rebuild——省略本门，Capture 相位全 done 夹具断言
  //      ready-to-continue 的既有 QA 立即转红。
  const completionCriteria = ensureArray(task.completionCriteria);
  const allCriteriaMarkedHit =
    completionCriteria.length > 0 && completionCriteria.every((item) => criteriaItemHit(item));
  const hitCriteriaAllHaveEvidenceRefs =
    allCriteriaMarkedHit &&
    completionCriteria.every((item) => collectCriterionEvidenceRefs(item).length > 0);
  const phaseAtLeastRebuild = phaseOrder.indexOf(nextPhase) >= phaseOrder.indexOf("Rebuild");
  if (allCriteriaMarkedHit && hitCriteriaAllHaveEvidenceRefs && phaseAtLeastRebuild) {
    return stamp(
      {
        status: "ready-to-close",
        autoAdvanceEligible: false,
        pauseCategory: "none",
        pauseReason: "",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction:
          "判据已标记命中（agent 自申报，以 dry-run 机器校验为准）：执行 task-close --dry-run 预检，全过后 task-close",
        summary: "判据已全标记命中，当前应走 task-close --dry-run 收口预检，而不是继续启动期分诊。"
      },
    );
  }

  if (allEntrypoints.length === 0) {
    return stamp(
      {
        status: "needs-route-rebuild",
        autoAdvanceEligible: false,
        pauseCategory: "internal",
        pauseReason: "route-state 缺少可恢复的 entrypoints。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction: "先重建 2 到 5 个候选 entrypoints，再激活 1 到 2 个继续推进。",
        summary: "当前不能直接续跑，因为没有可执行的切入点 working set。"
      },
    );
  }

  if (allEntrypointsExhausted && !latestRetrospective) {
    return stamp(
      {
        status: "needs-retrospective",
        autoAdvanceEligible: false,
        pauseCategory: "internal",
        pauseReason: "现有 entrypoints 已全部 PARKED / EXHAUSTED，但缺少 retrospective。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction: "先补一次 retrospective，基于失败证据生成新的 entrypoints，再继续执行。",
        summary: "当前不能停在“本轮失败”；应先复盘，再生成新切入点。"
      },
    );
  }

  if (!nextEntrypoint) {
    const retroNextFocus = cleanText(latestRetrospective?.nextFocus);
    return stamp(
      {
        status: "needs-route-rebuild",
        autoAdvanceEligible: false,
        pauseCategory: "internal",
        pauseReason: "当前 working set 没有可执行的 active / candidate entrypoint。",
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction:
          retroNextFocus
            ? `根据最近一次 retrospective 的 nextFocus 重建切入点：${retroNextFocus}`
            : "重建 active entrypoints working set，并明确下一条最小 probe。",
        summary: "当前不能仅做状态汇报；应先恢复可执行的切入点。"
      },
    );
  }

  const nextExecutableAction =
    (cleanText(nextEntrypoint?.id).toUpperCase() === "EP-002" && cleanText(webShellAction)) ||
    (cleanText(task.webShellTriage?.status || "") && cleanText(webShellAction)) ||
    cleanText(nextEntrypoint.probe) ||
    cleanText(nextEntrypoint.nextOnSuccess) ||
    cleanText(nextEntrypoint.nextOnFailure) ||
    `围绕 ${nextEntrypoint.id} ${nextEntrypoint.title} 明确并执行最小 probe。`;
  const riskReason = dynamicRiskReason(task, nextExecutableAction);
  if (riskReason) {
    return stamp(
      {
        status: "blocked-on-risk",
        autoAdvanceEligible: false,
        pauseCategory: "risk",
        pauseReason: riskReason,
        nextEntrypointId: "",
        nextPhase,
        nextExecutableAction: "等待风险确认；确认后再恢复到当前活跃阶段执行。",
        summary: "下一动作命中动态风险门禁，不能在自动推进模式下直接执行。"
      }
    );
  }

  return stamp(
    {
      status: "ready-to-continue",
      autoAdvanceEligible: true,
      pauseCategory: "none",
      pauseReason: "",
      nextEntrypointId: nextEntrypoint.id,
      nextPhase,
      nextExecutableAction,
      summary: `当前应直接执行 ${nextEntrypoint.id} 的下一动作，不要停在状态汇报。`
    }
  );
}

export function writeRouteStateDocument(taskDir, task, routeState) {
  const relPath = task.routeState?.statePath || "state/route-state.json";
  const filePath = taskFile(taskDir, relPath);
  ensureDir(taskFile(taskDir, "state"));
  const persisted = normalizeRouteStateDocument({ ...routeState, updatedAt: nowIso() }, task);
  fs.writeFileSync(filePath, JSON.stringify(persisted, null, 2) + "\n");
  return persisted;
}

export function applyRouteStateToTask(task, routeState) {
  task.routeState.activeTracks = routeState.activeTracks.slice();
  task.routeState.activeEntrypoints = routeState.activeEntrypoints.slice();
  task.routeState.syncStatus = routeState.syncStatus;
  task.routeState.executionStatus = routeState.execution.status;
  task.routeState.nextEntrypointId = routeState.execution.nextEntrypointId;
  task.routeState.nextExecutableAction = routeState.execution.nextExecutableAction;
  task.routeState.pauseCategory = routeState.execution.pauseCategory;
  task.routeState.pauseReason = routeState.execution.pauseReason;
  task.routeState.lastAdvancedAt = routeState.execution.updatedAt;
  task.routeState.vmTriage = {
    ...routeState.vmTriage,
    notes: (routeState.vmTriage?.notes || []).slice()
  };
  if (task.vm || routeState.vmTriage?.triageResult !== "not-applicable") {
    task.vm ||= {};
    task.vm.present ||= routeState.vmTriage?.triageResult !== "not-applicable";
    task.vm.triageResult = routeState.vmTriage?.triageResult || "not-started";
    task.vm.blackboxApi = routeState.vmTriage?.blackboxApi || "";
    task.vm.triageReason = routeState.vmTriage?.rationale || "";
    task.vm.triageNotes = (routeState.vmTriage?.notes || []).slice();
  }
  return task;
}

export function renderRoutePlanMarkdown(routeState, task = {}) {
  const lines = [
    "<!-- generated: route-plan; source=state/route-state.json; do-not-edit-directly -->",
    "<!-- view-do-not-edit: 请勿手改本文件；修改请走 state/route-state.json 对应字段 -->",
    `<!-- view-render-sha256: ${VIEW_RENDER_HASH_PLACEHOLDER} -->`,
    "",
    "# Route Plan",
    "",
    `Generated At: ${routeState.updatedAt || nowIso()}`,
    `Task Summary: ${routeState.taskId || task.taskId || ""}`,
    "Final Deliverable: report.md + run/*",
    "",
    "## Current Status",
    "",
    `- Active Tracks: ${routeState.activeTracks.join(", ") || "(none)"}`,
    `- Active Entrypoints: ${routeState.activeEntrypoints.join(", ") || "(none)"}`,
    `- VM Triage: ${routeState.vmTriage?.triageResult || "not-applicable"}`,
    `- Execution Status: ${routeState.execution.status || defaultExecutionStatus}`,
    `- Auto Advance Eligible: ${routeState.execution.autoAdvanceEligible ? "yes" : "no"}`,
    `- Next Executable Action: ${routeState.execution.nextExecutableAction || "(none)"}`,
    `- Pause Category: ${routeState.execution.pauseCategory || defaultPauseCategory}`,
    `- Pause Reason: ${routeState.execution.pauseReason || "(none)"}`,
    `- Sync Status: ${routeState.syncStatus || "not-started"}`,
    "",
    "## Track Definitions",
    ""
  ];

  for (const track of routeState.tracks) {
    lines.push(`### ${track.title}`);
    lines.push("");
    lines.push(`- Target: ${track.target || ""}`);
    lines.push(`- Inputs: ${track.inputs || ""}`);
    lines.push(`- Output: ${track.output || ""}`);
    lines.push(`- Priority: ${track.priority || ""}`);
    lines.push(`- Checkpoints: ${track.checkpoints.join(", ") || ""}`);
    lines.push("");
  }

  lines.push("## Entrypoint Loop");
  lines.push("");
  lines.push("- Principle: topics provide capabilities; entrypoints decide what to probe first.");
  lines.push("- Parallel Limit: keep at most 1 to 2 active entrypoints.");
  lines.push("- Pivot Rule: if a probe is ineffective, park or exhaust it, then switch or retrospective.");
  lines.push("");

  for (const entrypoint of routeState.entrypoints) {
    lines.push(`#### ${entrypoint.id} ${entrypoint.title}`);
    lines.push("");
    lines.push(`- Hypothesis: ${entrypoint.hypothesis || ""}`);
    lines.push(`- Bound Topics: ${entrypoint.boundTopics.join(", ") || ""}`);
    lines.push(`- Target Track: ${entrypoint.targetTrack || ""}`);
    lines.push(`- Rationale: ${entrypoint.rationale || ""}`);
    lines.push(`- Cost: ${entrypoint.cost || ""}`);
    lines.push(`- Expected Gain: ${entrypoint.expectedGain || ""}`);
    lines.push(`- Probe: ${entrypoint.probe || ""}`);
    lines.push(`- Success Criteria: ${entrypoint.successCriteria || ""}`);
    lines.push(`- Failure Criteria: ${entrypoint.failureCriteria || ""}`);
    lines.push(`- Status: ${entrypoint.status || defaultEntrypointStatus}`);
    lines.push(`- Result Summary: ${entrypoint.resultSummary || ""}`);
    lines.push(`- Next On Success: ${entrypoint.nextOnSuccess || ""}`);
    lines.push(`- Next On Failure: ${entrypoint.nextOnFailure || ""}`);
    lines.push(`- Updated At: ${entrypoint.updatedAt || ""}`);
    lines.push("");
  }

  if (routeState.retrospectives.length > 0) {
    lines.push("## Retrospectives");
    lines.push("");
    for (const retrospective of routeState.retrospectives) {
      lines.push(`#### ${retrospective.id}`);
      lines.push("");
      lines.push(`- Triggered By Entrypoints: ${retrospective.triggeredByEntrypoints.join(", ") || ""}`);
      lines.push(`- Summary: ${retrospective.summary || ""}`);
      lines.push(`- Failed Because: ${retrospective.failedBecause || ""}`);
      lines.push(`- New Entrypoints: ${retrospective.newEntrypoints.join(", ") || ""}`);
      lines.push(`- Decision: ${retrospective.decision || ""}`);
      lines.push(`- Next Focus: ${retrospective.nextFocus || ""}`);
      lines.push(`- Created At: ${retrospective.createdAt || ""}`);
      lines.push("");
    }
  }

  lines.push("## Coordination Rules");
  lines.push("");
  lines.push("- Record high-value clues in state/route-state.json (clues.md is a rendered view; hand edits are merged back or snapshotted by the view guard).");
  lines.push("- Use route-state.json as the machine source of truth; markdown is a rendered view.");
  lines.push("- Composite tasks should rank candidate entrypoints by cost and expected gain before expanding topics.");
  lines.push("- task-sync / task-advance 之后若 execution.status=ready-to-continue，必须继续执行 nextExecutableAction，而不是停在状态汇报。");
  lines.push("- 只有 execution.pauseCategory=user/risk 时才允许等待用户；其余状态要么继续推进，要么先修复 route-state working set。");
  lines.push("");
  return finalizeRenderedView(lines);
}

// P0-3a（round1 F-02）：renderProgressMarkdown 已删除——progress.md 不再是渲染视图。

// P0-3b（round1 F-03）：初始骨架 = append-only 使用说明（与 _TEMPLATE/core/state/clues.md
// 同文）。仅在文件不存在时由 syncMarkdownViews 写一次；此后文件归 agent 所有，永不覆写。
export function renderCluesMarkdown() {
  return [
    "# Clues（append-only 线索账本）",
    "",
    "- 本文件是 agent 可直写的 append-only 账本：框架只写一次本骨架，此后永不覆写。",
    "- 自由格式追加，建议一行一条线索并附证据锚点（文件路径、地址、命令输出位置）。",
    "- 形如 `## CLUE-NNN` 的结构化段（含 `- Content:` 标签行）会被 `task-sync` 识别为 novel 线索并吸收进 `state/route-state.json`；吸收后原文仍保留在本文件。",
    "- 只记录高价值线索；每条线索应可验证；低置信噪音不属于这里。",
    ""
  ].join("\n");
}

// report-only 改造：syncReportMarkdown（web-shell「Runtime 专用后续动作模板摘要」节注入）
// 已退役——report.md 完全归 agent 所有，框架不做任何节注入；否则 taskFileMatchesTemplate
// 的逐字占位判定会被框架自写内容破坏。
function syncReportMarkdown() {}

// 视图守卫分工（P0-3b 后，round2 G-09 注释对齐现状）：syncMarkdownViews 是 task-sync /
// closeout-state / task-close 共同的视图覆写咽喉点。clues.md 已转 append-only 账本——
// absorbHandWrittenClues 每次 sync 把 novel clue 单向合回 route-state.json（零丢失），
// 文件本身只在缺失时写一次初始骨架、永不覆写，也不再走 orphaned-view-content.md 快照；
// route-plan 由 guardHandEditedViews 守卫：渲染是全文重排、增量提取不可靠，有手改即快照。
// progress 视图已删除（P0-3a，round1 F-02），不再进入守卫与写盘序列。
// 比对前剥离易变行（Generated At / Last Updated），否则每次 sync 都恒误报。
// view-do-not-edit 标记行（O8 新增渲染行）同步剥离：旧视图无此行，不剥则升级后一次性恒误报。
// view-render-sha256 哈希行（F-O3 新增渲染行）必须登记在此：哈希在"剥离 volatile 行后"计算，
// 漏登记会导致自我哈希永不匹配、每次 sync 恒误报。
const volatileViewLinePatterns = [
  /^Generated At:.*$/m,
  /^Last Updated:.*$/m,
  /^<!-- view-do-not-edit:.*-->$/m,
  /^<!-- view-render-sha256:.*-->$/m
];

function stripVolatileViewLines(text) {
  let result = String(text || "");
  for (const pattern of volatileViewLinePatterns) {
    result = result.replace(pattern, "");
  }
  return result;
}

function viewContentMatches(onDisk, rendered) {
  return stripVolatileViewLines(normalizeNewlines(onDisk)) === stripVolatileViewLines(normalizeNewlines(rendered));
}

// F-O3 渲染哈希自证（两遍渲染）：三视图渲染器先以占位行渲染，剥离 volatile 行
// （占位行视为哈希行，已被 volatileViewLinePatterns 剥离）后算 sha256，再回填
// <!-- view-render-sha256: <hash> -->。哈希是剥离集确定后的内容寻址确定性值，
// 同输入重渲染逐字稳定，evaluateRouteConsistency 的逐字比对不受影响。
// 边界声明（R2 L-1 / R3-O7）：内嵌哈希防误报不防对抗——对可读写任务目录并可自行
// 重算 sha256 回填的 Agent，对抗性重哈希不在防护承诺内。
const VIEW_RENDER_HASH_PLACEHOLDER = "__VIEW_RENDER_SHA256_PLACEHOLDER__";

function finalizeRenderedView(lines) {
  const withPlaceholder = lines.join("\n");
  const hash = crypto
    .createHash("sha256")
    .update(stripVolatileViewLines(normalizeNewlines(withPlaceholder)))
    .digest("hex");
  return withPlaceholder.replaceAll(VIEW_RENDER_HASH_PLACEHOLDER, hash);
}

// F-O3 框架自产识别通道：onDisk 内嵌哈希与"剥离 volatile 行后重算值"一致 ⇒
// 它是框架上次写入（仅状态过期），直接覆写不快照不告警；无哈希行（升级前旧视图）
// 或哈希不一致（手改）回落既有快照路径——手改检出零削弱，本层是纯新增识别通道。
function viewIsFrameworkWritten(onDisk) {
  const embedded = String(onDisk || "").match(/^<!-- view-render-sha256:\s*([0-9a-f]{64})\s*-->$/m)?.[1];
  if (!embedded) {
    return false;
  }
  const recomputed = crypto
    .createHash("sha256")
    .update(stripVolatileViewLines(normalizeNewlines(onDisk)))
    .digest("hex");
  return recomputed === embedded;
}

// O8：快照告警附被判定内容首行摘要（≤80 字符）。优先取 onDisk 中不存在于渲染结果的
// 首个非空行（即触发判定的手改内容本身）；找不到时退化为首个非空行。
function firstLineSummary(onDisk, rendered, maxLength = 80) {
  const renderedLines = new Set(
    stripVolatileViewLines(normalizeNewlines(rendered)).split("\n").map((line) => line.trim())
  );
  const diskLines = stripVolatileViewLines(normalizeNewlines(onDisk)).split("\n").map((line) => line.trim());
  const foreign = diskLines.find((line) => line && !renderedLines.has(line));
  const candidate = foreign || diskLines.find((line) => line) || "(empty)";
  return candidate.length > maxLength ? `${candidate.slice(0, maxLength)}…` : candidate;
}

function viewMatchesTemplate(taskDir, relPath, onDisk) {
  const templateCandidates = [
    taskFile(templateTaskCoreDir, relPath),
    taskFile(templateTaskDir, relPath)
  ];
  const templatePath = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    return false;
  }
  return normalizeNewlines(fs.readFileSync(templatePath, "utf8")) === normalizeNewlines(onDisk);
}

function appendOrphanViewSnapshot(taskDir, relPath, content) {
  const hash = crypto.createHash("sha256").update(normalizeNewlines(content)).digest("hex").slice(0, 16);
  const orphanPath = taskFile(taskDir, "run/orphaned-view-content.md");
  const existing = fs.existsSync(orphanPath) ? fs.readFileSync(orphanPath, "utf8") : "";
  if (existing.includes(`snapshot-sha256: ${hash}`)) {
    return false;
  }
  const block = [
    existing.trimEnd() ? `${existing.trimEnd()}\n\n` : "# Orphaned View Content\n\n手改进生成视图的内容快照（由视图手改守卫写入，按内容哈希去重）。\n",
    `<!-- snapshot-sha256: ${hash} -->`,
    `## ${relPath} @ ${nowIso()}`,
    "",
    "```markdown",
    String(content).trimEnd(),
    "```",
    ""
  ].join("\n");
  ensureDir(path.dirname(orphanPath));
  fs.writeFileSync(orphanPath, block);
  return true;
}

function nextClueId(routeState) {
  const maxId = routeState.clues.reduce((max, clue) => {
    const match = /^CLUE-(\d+)$/.exec(String(clue?.id || ""));
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `CLUE-${String(maxId + 1).padStart(3, "0")}`;
}

// P0-3b（round1 F-03）clues append-only 单向吸收通道：每次 sync 运行——解析磁盘
// clues.md 中的结构化 `## CLUE-NNN` 段，把 route-state 中缺失的 novel clue 合回
// route-state.json（novel-clue 检测与合回逻辑自原 guardHandEditedCluesView 原样保留）。
// 原「覆写 + 快照到 orphaned-view-content.md」路径整体摘除：clues.md 永不覆写后，
// 自由文本天然不丢，无需快照兜底。
function absorbHandWrittenClues(taskDir, task, routeState) {
  const relPath = task.routeState.cluesPath;
  const absPath = taskFile(taskDir, relPath);
  if (!fs.existsSync(absPath)) {
    return { routeState, warnings: [] };
  }
  const onDisk = fs.readFileSync(absPath, "utf8");
  if (viewMatchesTemplate(taskDir, relPath, onDisk)) {
    return { routeState, warnings: [] };
  }

  const warnings = [];
  const diskClues = parseCluesMarkdown(onDisk);
  const knownById = new Map(routeState.clues.map((clue) => [clue.id, clue]));
  const novel = diskClues.filter((clue) => clue.content && !knownById.has(clue.id));

  let nextRouteState = routeState;
  for (const clue of novel) {
    const merged = { ...clue, id: nextClueId(nextRouteState) };
    nextRouteState.clues.push(merged);
    knownById.set(merged.id, merged);
  }
  if (novel.length > 0) {
    warnings.push(`merged ${novel.length} hand-written clue(s) from ${relPath} back into route-state.json`);
    // 合并导致 route-state.json 重新落盘（updatedAt 前进）。必须把持久化后的文档
    // 继续传给后续渲染，否则视图里的 Generated At 与 route-state.json 差一秒，
    // evaluateRouteConsistency 的精确比对会恒报 out-of-sync。
    nextRouteState = writeRouteStateDocument(taskDir, task, nextRouteState);
  }
  return { routeState: nextRouteState, warnings };
}

// 视图手改守卫（P0-3b 后仅剩 route-plan）：syncMarkdownViews 是 task-sync /
// closeout-state / task-close 共同的视图覆写咽喉点。clues.md 已转 append-only
// 账本（走 absorbHandWrittenClues 单向吸收，不再覆写/快照）；route-plan 渲染是
// 全文重排、增量提取不可靠，有手改即快照。比对前剥离易变行，否则每次 sync 恒误报。
function guardHandEditedViews(taskDir, task, routeState) {
  const warnings = [];
  let nextRouteState = routeState;
  const absPath = taskFile(taskDir, task.routeState.planPath);
  if (!fs.existsSync(absPath)) {
    return { routeState: nextRouteState, warnings };
  }
  const onDisk = fs.readFileSync(absPath, "utf8");
  if (viewMatchesTemplate(taskDir, task.routeState.planPath, onDisk)) {
    return { routeState: nextRouteState, warnings };
  }
  // F-O3：viewMatchesTemplate 之后加一层框架自产识别——onDisk 内嵌哈希自证为
  // 框架上次写入（仅状态过期）时直接覆写，不快照不告警；无哈希行/哈希不一致
  // （含一切手改）继续走既有快照路径，手改检出零削弱。
  if (viewIsFrameworkWritten(onDisk)) {
    return { routeState: nextRouteState, warnings };
  }
  const rendered = renderRoutePlanMarkdown(nextRouteState, task);
  if (viewContentMatches(onDisk, rendered)) {
    return { routeState: nextRouteState, warnings };
  }
  if (appendOrphanViewSnapshot(taskDir, task.routeState.planPath, onDisk)) {
    warnings.push(`hand-written content in ${task.routeState.planPath} snapshotted to run/orphaned-view-content.md before overwrite; first-line: ${firstLineSummary(onDisk, rendered)}`);
  }
  return { routeState: nextRouteState, warnings };
}

export function syncMarkdownViews(taskDir, task, routeState, options = {}) {
  let nextRouteState = routeState;
  if (options.skipHandEditGuard !== true) {
    const guarded = guardHandEditedViews(taskDir, task, routeState);
    for (const warning of guarded.warnings) {
      console.warn(`[view-guard] ${warning}`);
    }
    nextRouteState = guarded.routeState;
    // P0-3b：novel clue 单向吸收通道在守卫后运行（文件存在即吸收，永不覆写）。
    const absorbed = absorbHandWrittenClues(taskDir, task, nextRouteState);
    for (const warning of absorbed.warnings) {
      console.warn(`[view-guard] ${warning}`);
    }
    nextRouteState = absorbed.routeState;
  }
  fs.writeFileSync(taskFile(taskDir, task.routeState.planPath), renderRoutePlanMarkdown(nextRouteState, task));
  // P0-3b：clues.md 只在不存在时写一次初始骨架，此后永不覆写。
  const cluesAbsPath = taskFile(taskDir, task.routeState.cluesPath);
  if (!fs.existsSync(cluesAbsPath)) {
    fs.writeFileSync(cluesAbsPath, renderCluesMarkdown(nextRouteState));
  }
  syncReportMarkdown(taskDir, task, nextRouteState);
  return nextRouteState;
}

export function artifactTouchedAgainstTemplate(taskDir, relPath) {
  const currentPath = taskFile(taskDir, relPath);
  if (!fs.existsSync(currentPath)) {
    return false;
  }
  if (taskDir === templateTaskDir) {
    return true;
  }
  // 与 ensureTaskFileFromTemplate 同序：core 骨架文件只在 _TEMPLATE/core/ 下，
  // 专题产物模板在 _TEMPLATE/run/ 下。只查后者会让 core 产物（run-local.mjs、
  // verify-once.mjs 等）的占位检查永远返回"touched"，占位闸门形同虚设。
  // P1-6（round1 F-07，§1.3-11）：平铺层删除后追加第三候选 = topic-pack 路径回退
  // （listTopicPackTemplateCandidates），保住"逐字抄模板仍判占位"的门禁强度；
  // 找不到任何比对源时维持返回 true（视作已改写）的既有语义。
  const templateCandidates = [
    taskFile(templateTaskCoreDir, relPath),
    taskFile(templateTaskDir, relPath),
    ...listTopicPackTemplateCandidates(relPath)
  ];
  const templatePath = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    return true;
  }
  return normalizeNewlines(fs.readFileSync(currentPath, "utf8")) !==
    normalizeNewlines(fs.readFileSync(templatePath, "utf8"));
}
