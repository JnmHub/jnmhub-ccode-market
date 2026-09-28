// 报错自描述约定（O2，F-O10 口径补齐）：本文件每条首参数为字面量的 errors.push 的错误文案
// 必须含以下三者之一——合法值清单 / 形态示例 / `fix:` 修复动作；展开式推送
// （errors.push(...expr)）的文案面由被展开函数内部各自遵守。
// tools/qa/check-doc-facts.mjs 对此有静态断言（与 lint 面逐字一致），新增门禁报错时不得只写现象不写出路。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readTopicRegistry } from "../topic-registry.mjs";
import {
  CRITERIA_HIT_STATUS_WORDS,
  DELIVERABLE_TIERS,
  RUN_LOCAL_REQUIRED_TIERS,
  collectCriterionEvidenceRefs,
  criteriaItemHit,
  ensureTaskRuntimeShape,
  fileExistsInTask,
  getTopicBySpecifier,
  normalizeNewlines,
  nowIso,
  phaseOrder,
  readBackupManifestMap,
  readBackupManifestEntries,
  readBaselineContractChangeEntry,
  readLastContractChangeEntry,
  readTaskJson,
  relFromRepo,
  taskFile,
  taskFileMatchesTemplate,
  templateTaskDir,
  writeTaskJson
} from "./common.mjs";

// F-O7：DELIVERABLE_TIERS / RUN_LOCAL_REQUIRED_TIERS 定义已下沉 common.mjs（封死
// route-state → validation 反向导入的顶层 const 环引脚），此处 re-export 保持既有导入面
// （validateTaskContract 内部引用与 fact-sync.mjs 等外部导入方零破坏）。
// R3-O2：CRITERIA_HIT_STATUS_WORDS / criteriaItemHit / collectCriterionEvidenceRefs
// 同口径下沉 common.mjs（resolveExecutionState ready-to-close 分支消费），同法 re-export。
export { DELIVERABLE_TIERS, RUN_LOCAL_REQUIRED_TIERS };
export { CRITERIA_HIT_STATUS_WORDS, collectCriterionEvidenceRefs, criteriaItemHit };
import {
  applyRouteStateToTask,
  artifactTouchedAgainstTemplate,
  renderRoutePlanMarkdown,
  readRouteStateDocument
} from "./route-state.mjs";
import { evaluateCollaboration, resolveExecutionModel } from "./lib/collaboration.mjs";

// P0-3a（round1 F-02）：原 progressStatuses 常量随 progress.md 门禁删除（无其余消费方）。
// report-only 改造：过程形态词表（当前阶段/自动续跑决策/下一步/切入点循环/Runtime 摘要）
// 随过程门禁整体退役；report.md 只保留收口实质校验（见 validateReportSubstance）。
const reportLocalReproHeading = /##\s+(本地复现交付|Local Reproduction Deliverables)/i;
const reportLocalAlgoEntry = /-\s*(本地算法实现|local algorithm)\s*[：:]\s*\S+/i;
const reportLocalExampleEntry = /-\s*(调用示例|local repro example)\s*[：:]\s*\S+/i;
const reportApiExampleEntry = /-\s*(协议重放示例|API 调用示例|protocol replay example|api call example)\s*[：:]\s*\S+/i;
const reportRunCommandEntry = /-\s*(运行命令|run command)\s*[：:]\s*\S+/i;
const reportOutputSummaryEntry =
  /-\s*(输出\s*\/\s*响应摘要|输出摘要|响应摘要|打印展示|response summary|printed response)\s*[：:]\s*\S+/i;
// report-only 收口实质校验单源：唯一强制文档产物 = report.md。开工骨架由 task-init 落盘，
// 收口时一次性写全（任务难点/逆向思路/坑点/经验/实现路径）。门禁只验实质——非模板原文、
// 最小篇幅、必备章节；过程文档（investigation/plan/assumptions/专题 notes）门禁已整体退役。
export const REPORT_MIN_SUBSTANCE_CHARS = 600;
export const REPORT_UNFINISHED_MIN_CHARS = 200;
const REPORT_REQUIRED_SECTIONS_ACHIEVED = [
  { key: "任务摘要", pattern: /^##\s*任务摘要\s*[：:]?\s*$/im },
  { key: "实现路径", pattern: /^##\s*实现路径\s*[：:]?\s*$/im },
  { key: "验证证据", pattern: /^##\s*验证证据\s*[：:]?\s*$/im }
];
const REPORT_UNFINISHED_SECTION_PATTERN = /^##\s*未竟事项\s*[：:]?\s*$/im;
const maxEntrypointsInWorkingSet = 5;
const maxRetrospectivesInWorkingSet = 5;
const topicValidationRules = readTopicRegistry().filter(
  (topic) => topic.formalValidation?.presentPath
);

function normalizeTrackName(value) {
  const text = String(value || "")
    .replace(/[`*#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return "";
  return text.replace(/^(route|line|track|\u7ebf\u8def)\s+/i, "").trim();
}

function sameTrack(a, b) {
  const left = normalizeTrackName(a);
  const right = normalizeTrackName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTail = left.match(/([a-z0-9_-]+)$/)?.[1];
  const rightTail = right.match(/([a-z0-9_-]+)$/)?.[1];
  return Boolean(leftTail && rightTail && leftTail === rightTail);
}

function sameEntrypointId(a, b) {
  return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
}

function vmTriageResult(task, routeState = null) {
  return String(routeState?.vmTriage?.triageResult || task?.vm?.triageResult || "").trim();
}

function isVmBlackboxRoute(task, routeState = null) {
  return vmTriageResult(task, routeState) === "blackbox";
}

export function artifactExists(taskDir, relPath) {
  return fileExistsInTask(taskDir, relPath);
}

export function artifactTouched(taskDir, relPath) {
  return artifactTouchedAgainstTemplate(taskDir, relPath);
}

export function touchedAny(taskDir, relPaths) {
  return relPaths.some((relPath) => artifactTouched(taskDir, relPath));
}

function safeReadTaskText(taskDir, relPath) {
  const fullPath = taskFile(taskDir, relPath);
  if (!fs.existsSync(fullPath)) {
    return "";
  }
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch {
    return "";
  }
}

function getValueByPath(target, valuePath) {
  return String(valuePath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current == null ? undefined : current[key]), target);
}

function evaluateCondition(task, taskDir, condition) {
  if (!condition) return false;

  if (Array.isArray(condition.touchedAny)) {
    return touchedAny(taskDir, condition.touchedAny);
  }

  // report-only 改造：report 谓词直接读 report.md（专题小节替代专题 notes 文件门禁）。
  if (condition.reportSection || Array.isArray(condition.reportContainsAny)) {
    const reportText = safeReadTaskText(taskDir, "report.md");
    if (condition.reportSection) {
      return reportHasTopicSection(reportText, String(condition.reportSection), Number(condition.minChars) || 0);
    }
    const corpus = String(reportText || "").toLowerCase();
    return condition.reportContainsAny.some((keyword) =>
      corpus.includes(String(keyword || "").toLowerCase())
    );
  }

  const value = getValueByPath(task, condition.path);

  if (Object.prototype.hasOwnProperty.call(condition, "equals")) {
    return value === condition.equals;
  }

  if (Array.isArray(condition.disallow)) {
    return !condition.disallow.includes(value);
  }

  if (typeof condition.minLength === "number") {
    return (Array.isArray(value) || typeof value === "string") && value.length >= condition.minLength;
  }

  if (condition.truthy === true) {
    return Boolean(value);
  }

  return Boolean(value);
}

function formatValidationMessage(message, task) {
  return String(message || "").replaceAll("{phase}", task.phase);
}

// topic 级 finding 的修复指引。这类 finding（not-started / 占位 / 关键字段空）是 closeout
// 最高频的失败类，消息本身来自各 topic.json，只描述现象；在这里按条件形态统一补操作提示，
// 避免逐个 topic.json 维护提示文本造成漂移。
function topicRequirementFixHint(requirement) {
  if (Array.isArray(requirement?.touchedAny)) {
    return ` fix: 用实质分析内容改写 ${requirement.touchedAny.join(" / ")} 中的至少一个（当前仍是 _TEMPLATE 占位）`;
  }
  if (requirement?.reportSection) {
    return ` fix: 在 report.md 补一个匹配「${requirement.reportSection}」的专题小节并写入实质内容（report-only：不再要求专题 notes 文件）`;
  }
  if (Array.isArray(requirement?.reportContainsAny)) {
    return ` fix: 在 report.md 专题发现中覆盖以下任一主题词：${requirement.reportContainsAny.join(" / ")}`;
  }
  if (Array.isArray(requirement?.disallow) && requirement.path) {
    return ` fix: 推进 task.json 的 ${requirement.path}（不得停留在 ${requirement.disallow.join("/")}），记录真实进展`;
  }
  if (typeof requirement?.minLength === "number" && requirement.path) {
    return ` fix: 在 task.json 的 ${requirement.path} 中记录至少 ${requirement.minLength} 条实质结论`;
  }
  return "";
}

function topicGroupFixHint(group) {
  const touchedPaths = (group?.checks || []).flatMap((check) => check.touchedAny || []);
  if (touchedPaths.length > 0) {
    return ` fix: 以下产物任选其一改写为非占位的实质内容：${touchedPaths.join(" / ")}`;
  }
  const valuePaths = (group?.checks || []).map((check) => check.path).filter(Boolean);
  if (valuePaths.length > 0) {
    return ` fix: 在 task.json 的 ${valuePaths.join(" / ")} 中至少一项记录实质结论`;
  }
  return "";
}

function topicIsPresent(task, rule) {
  return getValueByPath(task, rule?.presentPath) === true;
}

// taskPacks.excludedTopics（V2-1）：人工摘除的 topic 不再触发 formalValidation / phaseGuards，
// 否则 presentPath 为真的被摘 topic 会走进"义务无法履行"的断头路。
function topicIsExcluded(task, topicKey) {
  const excluded = task?.taskPacks?.excludedTopics;
  if (!Array.isArray(excluded)) {
    return false;
  }
  return excluded.some((value) => String(value || "").trim() === topicKey);
}

// P1-6 注记（report-only 改造后更新）：iat-rebuild-notes 条件化物化通道随 notes 门禁
// 整体退役——IAT 未损场景的结论直接落在 report.md 脱壳小节，无需 env-capability 声明。

function evaluateTopicFormalValidation(topic, task, findings, options = {}) {
  const { templateMode = false } = options;
  if (topicIsExcluded(task, topic.key)) {
    return;
  }
  const rule = topic.formalValidation;
  if (!rule || !topicIsPresent(task, rule)) {
    return;
  }

  if (topic.key === "jsvmp" && isVmBlackboxRoute(task)) {
    return;
  }

  // report-only 改造：requiredArtifacts（专题 notes 文件存在性门禁）整体退役，
  // 专题覆盖改由 requirementsAll 中的 reportSection/reportContainsAny 谓词承载。
  for (const relPath of rule.requiredArtifacts || []) {
    if (!artifactExists(task.__taskDir, relPath)) {
      findings.push(
        `${rule.presentPath}=true but ${relPath} is missing` +
          ` fix: 创建 ${relPath} 并写入实质分析内容（legacy requiredArtifacts 配置；新写法用 requirementsAll 的 reportSection 谓词）`
      );
    }
  }

  if (templateMode) {
    return;
  }

  for (const requirement of rule.requirementsAll || []) {
    if (!evaluateCondition(task, task.__taskDir, requirement)) {
      findings.push(formatValidationMessage(requirement.message, task) + topicRequirementFixHint(requirement));
    }
  }

  for (const group of rule.requirementsAny || []) {
    const passed = (group.checks || []).some((condition) =>
      evaluateCondition(task, task.__taskDir, condition)
    );
    if (!passed) {
      findings.push(formatValidationMessage(group.message, task) + topicGroupFixHint(group));
    }
  }
}

function evaluateTopicPhaseGuards(task, findings) {
  const phaseIndex = phaseOrder.indexOf(task.phase);
  if (phaseIndex < 0) {
    return;
  }

  for (const topic of topicValidationRules) {
    if (topicIsExcluded(task, topic.key)) {
      continue;
    }
    const rule = topic.formalValidation;
    if (!topicIsPresent(task, rule)) {
      continue;
    }

    for (const guard of rule.phaseGuards || []) {
      const minPhaseIndex = phaseOrder.indexOf(guard.minPhase);
      if (minPhaseIndex < 0 || phaseIndex < minPhaseIndex) {
        continue;
      }

      for (const requirement of guard.requirementsAll || []) {
        if (!evaluateCondition(task, task.__taskDir, requirement)) {
          findings.push(formatValidationMessage(requirement.message, task));
        }
      }

      for (const group of guard.requirementsAny || []) {
        const passed = (group.checks || []).some((condition) =>
          evaluateCondition(task, task.__taskDir, condition)
        );
        if (!passed) {
          findings.push(formatValidationMessage(group.message, task));
        }
      }
    }
  }
}

// report-only 改造：report.md 实质校验（收口时一次执行，无任何过程写作义务）。
// 抽取某个 ## 章节的正文（到下一个同级或更高级标题为止）。
function extractReportSectionBody(reportText, headingPattern) {
  const source = String(reportText || "");
  const match = new RegExp(headingPattern.source, headingPattern.flags).exec(source);
  if (!match) {
    return "";
  }
  const bodyStart = match.index + match[0].length;
  const rest = source.slice(bodyStart);
  const nextHeading = /^#{1,2}\s+/im.exec(rest);
  return (nextHeading ? rest.slice(0, nextHeading.index) : rest).trim();
}

// 实质篇幅：剥离 markdown 注释、代码围栏标记与空白后的正文字符数。
function reportSubstanceLength(reportText) {
  return String(reportText || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```/g, "")
    .replace(/\s+/g, "").length;
}

// 收口实质校验：report.md 必须（1）非开工骨架原文；（2）实质篇幅达标；
// （3）achieved 模式含 任务摘要/实现路径/验证证据 三节，partial/infeasible 模式含
// 未竟事项 节且正文达标（替代已退役的 run/infeasible-analysis.md + RETRO 复盘）。
function validateReportSubstance(task, reportText, reportIsTemplate, errors) {
  const closeoutMode = String(task?.closeoutMode || "achieved").trim() || "achieved";
  if (reportIsTemplate) {
    errors.push(
      "report.md is still the scaffold template fix: 收口时按模板章节一次性写全任务总结——" +
      "任务难点 / 逆向思路 / 坑点与经验 / 实现路径 / 逐条判据的验证证据（真实锚点：地址、文件+行、截图、命令输出）"
    );
    return;
  }
  const substanceLength = reportSubstanceLength(reportText);
  if (substanceLength < REPORT_MIN_SUBSTANCE_CHARS) {
    errors.push(
      `report.md lacks substance (${substanceLength} chars < ${REPORT_MIN_SUBSTANCE_CHARS}) fix: ` +
      "补全任务摘要 / 实现路径 / 逆向思路 / 任务难点 / 坑点与经验 / 验证证据的真实内容，不接受两行敷衍"
    );
  }
  if (closeoutMode === "partial" || closeoutMode === "infeasible") {
    const body = extractReportSectionBody(reportText, REPORT_UNFINISHED_SECTION_PATTERN);
    if (!body) {
      errors.push(
        `closeoutMode=${closeoutMode} requires a "## 未竟事项" section in report.md fix: ` +
        "写清根因、已排除路线（逐条附失败证据）与建议下一步"
      );
    } else if (body.length < REPORT_UNFINISHED_MIN_CHARS) {
      errors.push(
        `report.md 未竟事项 section must be at least ${REPORT_UNFINISHED_MIN_CHARS} chars (currently ${body.length}) fix: ` +
        "补充根因分析与逐条排除的路线证据"
      );
    }
    return;
  }
  for (const section of REPORT_REQUIRED_SECTIONS_ACHIEVED) {
    if (!section.pattern.test(reportText)) {
      errors.push(
        `report.md is missing required section "## ${section.key}" fix: ` +
        `按 report.md 骨架补齐「${section.key}」节（合法章节单源见 artifacts/tasks/_TEMPLATE/core/report.md）`
      );
    }
  }
}

// report.md 专题小节谓词（report-only 改造，替代专题 notes 文件门禁）：
// reportSection 为正则源（不区分大小写），匹配任意级标题；minChars 约束该节正文长度。
function reportHasTopicSection(reportText, sectionPatternSource, minChars = 0) {
  const source = String(reportText || "");
  let headingRegex;
  try {
    headingRegex = new RegExp(`^#{2,4}\\s*.*(?:${sectionPatternSource})`, "im");
  } catch {
    return false;
  }
  const match = headingRegex.exec(source);
  if (!match) {
    return false;
  }
  if (!(minChars > 0)) {
    return true;
  }
  const rest = source.slice(match.index + match[0].length);
  const nextHeading = /^#{1,4}\s+/m.exec(rest);
  const body = (nextHeading ? rest.slice(0, nextHeading.index) : rest).replace(/\s+/g, "");
  return body.length >= minChars;
}

function taskRequiresLocalReproduction(task) {
  return (
    task.deliveryRequirements?.localReproductionRequested === true ||
    task.deliveryRequirements?.protocolReplayExampleRequired === true ||
    task.deliveryRequirements?.apiCallExampleRequired === true
  );
}

function taskRequiresApiCallExample(task) {
  return (
    task.deliveryRequirements?.protocolReplayExampleRequired === true ||
    task.deliveryRequirements?.apiCallExampleRequired === true
  );
}

function validateLocalReproductionDelivery(task, reportText, findings) {
  const pureFiles = collectPureFiles(task.__taskDir);

  if (!reportLocalReproHeading.test(reportText)) {
    findings.push("local reproduction tasks must contain a 本地复现交付 / Local Reproduction Deliverables section");
  }
  if (!reportLocalAlgoEntry.test(reportText)) {
    findings.push("local reproduction tasks must record a non-empty local algorithm implementation path");
  }
  if (!reportLocalExampleEntry.test(reportText)) {
    findings.push("local reproduction tasks must record a non-empty local invocation example path");
  }
  if (!reportRunCommandEntry.test(reportText)) {
    findings.push("local reproduction tasks must record a non-empty runnable command");
  }
  if (!reportOutputSummaryEntry.test(reportText)) {
    findings.push("local reproduction tasks must record a non-empty output or response summary");
  }
  if (pureFiles.length === 0) {
    findings.push("local reproduction tasks require at least one pure-* artifact in the task root or run/");
  }
  // P1-6（round1 F-07）：local-repro-example.js / protocol-replay-example.js 已并轨进
  // 参数化 run-local.mjs 骨架（--mode=algo / --mode=replay）——交付门禁统一要求
  // run/run-local.mjs 实现物（存在且非模板占位），不再要求两个已退役示例文件。
  if (!artifactExists(task.__taskDir, "run/run-local.mjs")) {
    findings.push("local reproduction tasks require run/run-local.mjs fix: 参照 _TEMPLATE/core/run/run-local.mjs 参数化骨架自建（--mode=algo / --mode=replay）");
  } else if (!artifactTouched(task.__taskDir, "run/run-local.mjs")) {
    findings.push("run/run-local.mjs is still the template placeholder");
  }

  if (taskRequiresApiCallExample(task)) {
    if (!reportApiExampleEntry.test(reportText)) {
      findings.push("protocol replay tasks must record a non-empty protocol replay example path");
    }
    // 协议重放走同一 run-local.mjs 的 --mode=replay 通道；文件存在性与占位判定由上一条统一把关。
  }
}

// P1-6（round1 F-07）：validateExecutableExample 随两个示例文件退役（run-local.mjs 的
// 可执行性由 agent 自跑 --mode 分支与 verify-once 侧验证承接，不再由 close 内联 spawn）。

function taskTextCorpus(task, reportText, relPaths) {
  const packer = task?.packerUnpack || {};
  const vmpSpecificArtifacts = new Set([
    "run/vmp-triage-notes.md",
    "run/vmp-devirt-notes.md",
    "run/oep-proof.md",
    "run/dump-manifest.json",
    "run/crash-diagnostics.md"
  ]);
  const chunks = [
    task.taskId,
    task.title,
    task.summary,
    task.goal,
    task.description,
    task.target?.path,
    ...(Array.isArray(task.signals) ? task.signals : []),
    ...(Array.isArray(task.taskPacks?.selectedTopics) ? task.taskPacks.selectedTopics : []),
    ...(Array.isArray(packer.keyFindings) ? packer.keyFindings : []),
    ...(Array.isArray(packer.blockers) ? packer.blockers : []),
    ...(Array.isArray(packer.notes) ? packer.notes : []),
    // report-only 改造注记：report.md 仍是脚手架模板时其占位文本不入语料——
    // 模板注释里的专题示例词（如「脱壳/VMP」）不是任务证据，否则会误触发
    // VMP 语料分诊 WARN（scenarioVmpNegationContextFiltering 回归锁）。
    taskFileMatchesTemplate(task.__taskDir, "report.md") ? "" : reportText,
    ...relPaths.map((relPath) =>
      vmpSpecificArtifacts.has(relPath) && !artifactTouched(task.__taskDir, relPath)
        ? ""
        : safeReadTaskText(task.__taskDir, relPath)
    )
  ];
  return chunks.filter(Boolean).join("\n");
}

// R2-G02（round2）：否定语境过滤。主正则与 hints 兜底共用同一过滤器：每个候选 match 取
// 前后各约 40 字符窗口（slice 边界安全），命中否定词表则该 match 不计；主正则任一净命中
// 即 mention=true；hints 净命中 ≥2 才 mention=true（D1 修复）。
// 词表注记（§1.2-A5 定稿 + 执行侧最小扩充）：在终审词表基础上补单字「不」——验收例句
// 「VMP 相关技术在本样本中不存在」的后置否定只有单字否定词能覆盖（偏差已登记执行报告）。
// 词表后续再扩充须走 docs/reference/acceptance-criteria.md 登记。
const VMP_NEGATION_PATTERN =
  /无|不|非|没有|不是|并非|未见|未发现|marker|标记|遗留|dead|skip|跳过|not\b|no\b|without/i;
// 多字否定词 = 否定词表去掉单字分支后的其余全体（与上方词表保持一致，增删须同步并走
// acceptance-criteria 登记程序）；±40 双向窗语义由它单独承载。
const VMP_MULTI_CHAR_NEGATION_PATTERN =
  /没有|不是|并非|未见|未发现|marker|标记|遗留|dead|skip|跳过|not\b|no\b|without/i;
const VMP_NEGATION_WINDOW_CHARS = 40;
// R3'-08（round3 H-09，C7 时机裁决）：否定方向分治——单字否定词「无/不/非」前置紧邻窗
// 收紧至 ≤4 字符，且「不」排除副词性用法（(?![仅但过]) lookahead）；后置谓语否定保留
// 现宽前向窗；多字否定词维持 ±40 双向窗不变。词表任何增删走
// docs/reference/acceptance-criteria.md 登记程序。
const VMP_PRE_NEGATION_WINDOW_CHARS = 4;
const VMP_SINGLE_CHAR_NEGATION_PREFIX = /[无非]|不(?![仅但过])/;

function matchHitsWithoutNegation(text, pattern) {
  const globalPattern = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
  const cleanHits = [];
  let match;
  while ((match = globalPattern.exec(text)) !== null) {
    const start = Math.max(0, match.index - VMP_NEGATION_WINDOW_CHARS);
    const end = Math.min(text.length, match.index + match[0].length + VMP_NEGATION_WINDOW_CHARS);
    const windowText = text.slice(start, end);
    const hitStartInWindow = match.index - start;
    // 方向分治判定：
    // ① 前置单字否定紧邻（≤4 字符）→ 抑制（含副词性豁免）；
    // ② 单字否定在窗内但非紧邻前置 → 仅当位于命中词之后（后置谓语否定，宽前向窗）才抑制；
    //    位于命中词之前但超出紧邻窗的前置否定不再吞没远距离命中（M-P03 误抑制面修正）；
    // ③ 多字否定词（VMP_NEGATION_PATTERN 其余分支）±40 双向窗不变。
    let negated;
    if (
      VMP_SINGLE_CHAR_NEGATION_PREFIX.test(
        windowText.slice(Math.max(0, hitStartInWindow - VMP_PRE_NEGATION_WINDOW_CHARS), hitStartInWindow)
      )
    ) {
      negated = true;
    } else {
      const suffixAfterHit = windowText.slice(hitStartInWindow + match[0].length);
      negated =
        VMP_SINGLE_CHAR_NEGATION_PREFIX.test(suffixAfterHit) ||
        VMP_MULTI_CHAR_NEGATION_PATTERN.test(windowText);
    }
    if (!negated) {
      cleanHits.push(match.index);
    }
    if (match.index === globalPattern.lastIndex) {
      globalPattern.lastIndex += 1;
    }
  }
  return cleanHits;
}

function taskMentionsVmp(corpus) {
  const text = String(corpus || "");
  if (matchHitsWithoutNegation(text, /\b(?:VMP|VMProtect|VMPDump|vmprofiler|vtil)\b|\.vmp\d*|\.&Di/i).length > 0) {
    return true;
  }

  const hints = [
    /\bVM\s*entry\b/i,
    /\bdispatcher\b/i,
    /\bhandler\s+table\b/i,
    /\bthunk\b/i,
    /\bp-?code\b/i,
    /\bbytecode\b/i,
    /\bdevirtual/i,
    /虚拟化|去虚拟化|模拟层/
  ];
  const netHintCount = hints.reduce(
    (count, pattern) => count + (matchHitsWithoutNegation(text, pattern).length > 0 ? 1 : 0),
    0
  );
  return netHintCount >= 2;
}

// 交互序记录（R2'-04 保持零改动）：mention=false 时短路发生在 deny 判定之前，
// 上方 WARN 的 !taskExplicitlyDeniesVmp 仅在白名单路径（deny 正则命中且无反向证据）生效；
// 本函数与其 L502 反向闸一字不动。

function taskExplicitlyDeniesVmp(corpus) {
  const text = String(corpus || "");
  const denial =
    /\b(?:no|without)\s+(?:VMP|VMProtect|dispatcher|handler)\s+evidence\b/i.test(text) ||
    /\bVMP\s+present\s*[:=]\s*false\b/i.test(text) ||
    /没有\s*(?:VMP|VMProtect|dispatcher|handler)\s*证据/i.test(text);
  if (!denial) {
    return false;
  }

  return !/\.vmp\d*|\.&Di|\bVM\s*entry\b|localized-devirt|局部去虚拟化|runtimeDependency\.status\s*[:=]\s*active|VMP\s+(?:mixed|virtualized|dispatcher|handler)/i.test(
    text
  );
}

function taskMentionsVmpRuntimeDependency(corpus) {
  return /\.&Di|dispatcher|handler\s+table|thunk|bytecode|p-?code|runtime\s+dependency|运行时依赖|模拟层|虚拟化/i.test(
    String(corpus || "")
  );
}

function taskMentionsVmpDevirt(corpus) {
  return /localized-devirt|局部去虚拟化|devirtual|去虚拟化|handler\s*(?:sequence|segmentation|分割|序列)|cmp\s*\/\s*jne|cmp\s*,?.*jne|vpc|vsp|vkey|vbase|VRLIMIT|virtual\s+register|p-?code|Triton|VTIL|Dna|NoVmp|vmpattack/i.test(
    String(corpus || "")
  );
}

function taskMentionsFlagsOrBranch(corpus) {
  return /cmp\s*\/\s*jne|cmp\s*,?.*jne|\bjcc\b|\bZF\b|\bCF\b|\bOF\b|\bSF\b|flags?|标志位|条件跳转|分支/i.test(
    String(corpus || "")
  );
}

function taskMentionsCrash(corpus) {
  return /0xC0000005|ExceptionCode|Fault(?:ing)?\s+(?:offset|address)|Access violation|EIP|RIP|崩溃|闪退|异常码/i.test(
    String(corpus || "")
  );
}

function requireTouchedArtifact(task, relPath, label, findings) {
  if (!artifactExists(task.__taskDir, relPath)) {
    findings.push(`${label} requires ${relPath}`);
    return false;
  }
  if (!artifactTouched(task.__taskDir, relPath)) {
    findings.push(`${relPath} is still the template placeholder`);
    return false;
  }
  return true;
}

function validateJsonArtifact(task, relPath, findings) {
  if (!artifactExists(task.__taskDir, relPath) || !artifactTouched(task.__taskDir, relPath)) {
    return;
  }
  try {
    JSON.parse(safeReadTaskText(task.__taskDir, relPath));
  } catch (error) {
    findings.push(`${relPath} is not valid JSON: ${error.message}`);
  }
}

function statusIsUnknown(value, extraUnknowns = []) {
  const status = String(value || "").trim().toLowerCase();
  return !status || ["unknown", ...extraUnknowns].includes(status);
}

function normalizeVmpRouteName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function vmpToolRoutes(task) {
  const routes = task?.packerUnpack?.vmp?.toolRoutes;
  return Array.isArray(routes) ? routes : [];
}

function vmpRouteHasEvidence(route) {
  return (
    String(route?.decision || "").trim().length > 0 ||
    (Array.isArray(route?.evidence) && route.evidence.some((item) => String(item || "").trim()))
  );
}

function vmpRouteIsClassified(route) {
  const routeName = normalizeVmpRouteName(route?.route);
  const status = String(route?.status || "").trim().toLowerCase();
  return (
    Boolean(routeName) &&
    (!statusIsUnknown(status, ["not-started", "not-evaluated"]) || vmpRouteHasEvidence(route))
  );
}

function hasClassifiedVmpRoute(routes, aliases, options = {}) {
  const { exact = false } = options;
  const normalizedAliases = aliases.map((alias) => normalizeVmpRouteName(alias));
  return routes.some((route) => {
    if (!vmpRouteIsClassified(route)) {
      return false;
    }
    const routeName = normalizeVmpRouteName(route?.route);
    return normalizedAliases.some((alias) => routeName === alias || (!exact && routeName.includes(alias)));
  });
}

function hasEngagedVmpRoute(routes, aliases, options = {}) {
  const { exact = false } = options;
  const normalizedAliases = aliases.map((alias) => normalizeVmpRouteName(alias));
  const ignoredStatuses = new Set([
    "",
    "unknown",
    "not-started",
    "not-evaluated",
    "rejected",
    "not-applicable",
    "not-available"
  ]);
  return routes.some((route) => {
    const routeName = normalizeVmpRouteName(route?.route);
    const routeMatches = normalizedAliases.some((alias) => routeName === alias || (!exact && routeName.includes(alias)));
    if (!routeMatches) {
      return false;
    }
    const status = String(route?.status || "").trim().toLowerCase();
    return !ignoredStatuses.has(status);
  });
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => String(item || "").trim());
}

function hasSpecialRegisterEvidence(specialRegisters) {
  if (!specialRegisters || typeof specialRegisters !== "object") {
    return false;
  }
  const namedRegisters = ["vpc", "vsp", "vkey", "vbase"];
  return (
    namedRegisters.some((key) => String(specialRegisters[key] || "").trim()) ||
    nonEmptyArray(specialRegisters.evidence)
  );
}

function hasVmpBlackboxBoundary(devirt, corpus) {
  return (
    String(devirt?.fallbackBoundary || "").trim().length > 0 ||
    /blackbox-boundary|黑盒边界|blackbox\s+boundary/i.test(String(corpus || ""))
  );
}

// R2-G01（round2 P0-①）：corpus 提及 VMP 但 vmp.present!==true 时的一级分诊提醒（WARN 级，
// 永不胁迫 present:true）。导出常量供 collectCloseoutObligations（G-05 探测行）复用同源文案面。
// report-only 改造：留结论通道由 run/vmp-triage-notes.md 改为 report.md 专题发现节。
export const VMP_CORPUS_WARN_MESSAGE =
  "VMP-related wording found in task corpus while packerUnpack.vmp.present is not true fix: " +
  "若确非 VMP 无需任何动作，本条仅为分诊提醒（可在 report.md 专题发现节留一行结论）；" +
  "若确为 VMP 请置 packerUnpack.vmp.present=true 并按义务补齐";

function validatePackerUnpackEvidence(task, reportText, findings, warnings = null) {
  if (task?.packerUnpack?.present !== true) {
    return;
  }
  const closeoutMode = String(task?.closeoutMode || "achieved").trim() || "achieved";
  const demote = closeoutMode === "infeasible" || closeoutMode === "partial";
  const sink = demote && Array.isArray(warnings) ? warnings : findings;
  const push = (msg) => sink.push(demote ? `[infeasible-relaxed] ${msg}` : msg);

  // report-only 改造：专题 notes 语料源（unpack-notes/iat-rebuild-notes/vmp-triage-notes/
  // vmp-devirt-notes/oep-proof）随模板删除退役；语料 = task.json + report.md + 崩溃诊断。
  const corpus = taskTextCorpus(task, reportText, [
    "run/crash-diagnostics.md"
  ]);
  // R2-G01（round2 §1.2-A1）：外层早退保持 packerUnpack.present !== true 不动（crash 检查
  // 仍由它保护）；武装开关唯一化——内层义务块只认 task.packerUnpack.vmp.present === true，
  // corpus 关键词命中不再触发 error 级联，只产生上面的分诊 WARN。
  const vmpPresent = task.packerUnpack?.vmp?.present === true;
  // D9：corpus WARN 无条件走 warnings 形参，不经 demote sink 选择——infeasible/partial
  // 收口模式下同样落 warnings，禁止画蛇添足塞进 [infeasible-relaxed] 前缀分支。
  if (!vmpPresent && Array.isArray(warnings) && taskMentionsVmp(corpus) && !taskExplicitlyDeniesVmp(corpus)) {
    warnings.push(VMP_CORPUS_WARN_MESSAGE);
  }

  if (vmpPresent) {
    // report-only 改造：vmp-triage-notes / oep-proof 文件义务 → report.md 专题小节谓词；
    // dump-manifest.json 保留（机器清单类产物，记录 dump 文件哈希，非写作模板）。
    if (!reportHasTopicSection(reportText, "VMP|VMProtect|脱壳|Unpack|OEP", 100)) {
      findings.push(
        "packerUnpack.vmp.present=true but report.md lacks a 脱壳/VMP topic section fix: " +
        "在 report.md 专题发现节补脱壳/VMP 小节（分诊结论、OEP 证据、路线取舍），写实质内容"
      );
    }
    requireTouchedArtifact(task, "run/dump-manifest.json", "VMP dump manifest", findings);
    validateJsonArtifact(task, "run/dump-manifest.json", findings);

    const mode = String(task.packerUnpack?.vmp?.mode || "unknown").trim().toLowerCase();
    if (!mode || mode === "unknown") {
      push("VMP evidence found but packerUnpack.vmp.mode is still unknown");
    }

    const runtimeStatus = String(task.packerUnpack?.vmp?.runtimeDependency?.status || "unknown")
      .trim()
      .toLowerCase();
    if (statusIsUnknown(runtimeStatus)) {
      const detail = taskMentionsVmpRuntimeDependency(corpus) ? " despite runtime dependency evidence" : "";
      push(`VMP evidence found${detail} but packerUnpack.vmp.runtimeDependency.status is still unknown`);
    }

    if (statusIsUnknown(task.packerUnpack?.vmp?.antiDebug?.status)) {
      push("VMP evidence found but packerUnpack.vmp.antiDebug.status is still unknown");
    }

    const status = String(task.packerUnpack?.status || "").trim().toLowerCase();
    const advancedPackerStatus = !["not-started", "triaged", "investigating"].includes(status);
    const toolRoutes = vmpToolRoutes(task);
    const classifiedToolRoutes = toolRoutes.filter((route) => vmpRouteIsClassified(route));
    if (toolRoutes.length === 0) {
      push(
        "VMP evidence found but packerUnpack.vmp.toolRoutes is empty; record anti-debug/static-unpack/import-fix/devirt route decisions"
      );
    } else if (classifiedToolRoutes.length < 2) {
      push("VMP evidence found but fewer than two packerUnpack.vmp.toolRoutes entries are classified");
    }

    if (advancedPackerStatus && toolRoutes.length > 0) {
      const requiredRoutes = [
        { label: "anti-debug-to-oep", aliases: ["anti-debug-to-oep"] },
        { label: "static-unpack-first-pass", aliases: ["static-unpack-first-pass", "static-unpack"] },
        { label: "dynamic-import-fix", aliases: ["dynamic-import-fix", "iat-emulation-fix"] }
      ];
      for (const { label, aliases } of requiredRoutes) {
        if (!hasClassifiedVmpRoute(toolRoutes, aliases, { exact: true })) {
          push(`advanced VMP unpack status requires classified ${label} tool route`);
        }
      }
    }

    if (
      (runtimeStatus === "active" || ["virtualized", "mixed"].includes(mode)) &&
      toolRoutes.length > 0 &&
      !hasClassifiedVmpRoute(toolRoutes, ["localized-devirt"], { exact: true }) &&
      !/blackbox-boundary|黑盒边界/i.test(corpus)
    ) {
      push("active/virtualized VMP requires a classified localized-devirt route or explicit blackbox-boundary");
    }

    const devirt = task.packerUnpack?.vmp?.devirtualization || {};
    const localizedDevirtEngaged = hasEngagedVmpRoute(toolRoutes, ["localized-devirt"], { exact: true });
    const devirtRequired =
      devirt.required === true ||
      ["virtualized", "mixed"].includes(mode) ||
      localizedDevirtEngaged ||
      taskMentionsVmpDevirt(corpus);
    const blackboxBoundary = hasVmpBlackboxBoundary(devirt, corpus);

    if (devirtRequired) {
      // report-only 改造：vmp-devirt-notes 文件义务 → report.md 去虚拟化小节谓词。
      if (!reportHasTopicSection(reportText, "去虚拟化|devirtual|devirt|handler", 80)) {
        findings.push(
          "VMP localized devirtualization requires a report.md 去虚拟化 topic section fix: " +
          "在 report.md 专题发现节补去虚拟化小节（vpc/vsp/vkey 证据、handler 切分、黑盒边界取舍）"
        );
      }

      const devirtStatus = String(devirt.status || "").trim().toLowerCase();
      if (!blackboxBoundary && statusIsUnknown(devirtStatus, ["not-started"])) {
        push("VMP localized devirtualization requires packerUnpack.vmp.devirtualization.status to be classified");
      }

      if (!blackboxBoundary && !nonEmptyArray(devirt.traceFiles)) {
        push("VMP localized devirtualization requires traceFiles or an explicit blackbox-boundary");
      }

      if (!blackboxBoundary && !hasSpecialRegisterEvidence(devirt.specialRegisters)) {
        push("VMP localized devirtualization requires specialRegisters evidence for vpc/vsp/vkey/vbase or an explicit blackbox-boundary");
      }

      const handlerSegmentation = devirt.handlerSegmentation || {};
      const handlerStatus = String(handlerSegmentation.status || "").trim().toLowerCase();
      const advancedDevirtStatus = !statusIsUnknown(devirtStatus, ["not-started", "trace-only"]);
      if (
        !blackboxBoundary &&
        advancedDevirtStatus &&
        statusIsUnknown(handlerStatus) &&
        !nonEmptyArray(handlerSegmentation.evidence)
      ) {
        push("VMP devirtualization beyond trace-only requires handlerSegmentation evidence");
      }

      if (
        !blackboxBoundary &&
        advancedDevirtStatus &&
        Number(handlerSegmentation.handlerCount || 0) <= 0 &&
        !nonEmptyArray(handlerSegmentation.evidence)
      ) {
        push("VMP devirtualization beyond trace-only requires handlerSegmentation.handlerCount or segmentation evidence");
      }

      if (
        !blackboxBoundary &&
        taskMentionsFlagsOrBranch(corpus) &&
        !nonEmptyArray(devirt.flagsRecovered) &&
        !nonEmptyArray(devirt.branchTargets)
      ) {
        push("VMP cmp/jcc devirtualization requires flagsRecovered or branchTargets evidence");
      }
    }

    if (advancedPackerStatus && statusIsUnknown(task.packerUnpack?.vmp?.oep?.status)) {
      push("advanced VMP unpack status requires packerUnpack.vmp.oep.status to be classified");
    }
    if (advancedPackerStatus && statusIsUnknown(task.packerUnpack?.vmp?.dump?.status, ["not-started"])) {
      push("advanced VMP unpack status requires packerUnpack.vmp.dump.status to be classified");
    }

    if (
      ["verified", "done", "complete", "success"].includes(status) &&
      runtimeStatus === "active" &&
      !/runtime-retained|保留\s*runtime|黑盒边界|blackbox|localized-devirt|局部去虚拟化/i.test(corpus)
    ) {
      push("packerUnpack is marked verified while active VMP runtime dependency lacks retained-runtime/devirt/blackbox evidence");
    }
  }

  if (taskMentionsCrash(corpus)) {
    requireTouchedArtifact(task, "run/crash-diagnostics.md", "crash evidence", findings);
  }
}

function collectPureFiles(taskDir) {
  const results = new Set();
  const taskEntries = fs.existsSync(taskDir) ? fs.readdirSync(taskDir) : [];
  const runDir = taskFile(taskDir, "run");
  const runEntries = fs.existsSync(runDir) ? fs.readdirSync(runDir) : [];

  for (const name of taskEntries) {
    if (/^pure[_-].+\.(?:[cm]?js|py)$/i.test(name)) {
      results.add(name);
    }
  }
  for (const name of runEntries) {
    if (/^pure[_-].+\.(?:[cm]?js|py)$/i.test(name)) {
      results.add(`run/${name}`);
    }
  }

  return Array.from(results).sort();
}

// 完成判据命中词汇与证据形态说明（单源常量；docs/reference/acceptance-criteria.md 的
// generated 段由 tools/docs/fact-sync.mjs 从此注入，文档内勿手改同名单元）。
// R3-O2 注记：CRITERIA_HIT_STATUS_WORDS 已随 criteriaItemHit 下沉 common.mjs（上方
// re-export 保导入面），本文件仅保留文案面 CRITERIA_HIT_FORMS / EVIDENCE_REF_FORMS。
export const CRITERIA_HIT_FORMS = [
  "对象形态：`hit: true`，或 `status` 取值之一：`hit / met / passed / done / satisfied`",
  "字符串形态：以 `[x]` 开头"
];
export const EVIDENCE_REF_FORMS = [
  "task-local 相对路径，指向已存在且非空的证据文件（与模板逐字一致的占位文件不算证据）",
  "`用户确认:<原文>`（等价 `user-confirmation:<原文>`）",
  "`call_xxx` 引用形式，须同时提供 `evidenceExcerpt`（或 `excerpt` / `evidenceContent`）"
];

function countHitCriteria(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(criteriaItemHit).length;
}

function collectUnhitCriteria(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !criteriaItemHit(item));
}

function countHitSuccessCriteria(items) {
  return countHitCriteria(items);
}

function criterionEvidenceRefValid(taskDir, item, ref) {
  if (/^(?:用户确认|user-confirmation)\s*[:：]\s*\S+/i.test(ref)) {
    return true;
  }
  if (/^call_[A-Za-z0-9_-]+$/.test(ref)) {
    return Boolean(String(item.evidenceExcerpt || item.excerpt || item.evidenceContent || "").trim());
  }

  const candidate = taskFile(taskDir, ref);
  // 模板占位排除（win 改造 §2.4.3）：evidenceRefs 指向一个与模板逐字一致的文件
  // （如未填写的 run/fixtures.json 占位）不算证据——与 artifactTouched 判定口径一致。
  return (
    fs.existsSync(candidate) &&
    fs.statSync(candidate).isFile() &&
    fs.readFileSync(candidate, "utf8").trim().length > 0 &&
    !taskFileMatchesTemplate(taskDir, ref)
  );
}

function collectHitCriteriaWithoutEvidence(taskDir, items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => criteriaItemHit(item))
    .filter(({ item }) => {
      const refs = collectCriterionEvidenceRefs(item);
      return refs.length === 0 || refs.every((ref) => !criterionEvidenceRefValid(taskDir, item, ref));
    });
}

// F-O7：tier 词表定义在 common.mjs（本文件头部 re-export），此处不再保留第二份副本。
// report-only 改造：validateCoreGateArtifacts（run/investigation.md / plan.md /
// assumptions.md 三件套）及其词表常量（CALL_CHAIN_PATTERN / PLAN_REFERENCES_INVESTIGATION_PATTERN）
// 已随过程文档门禁整体退役删除——过程认知汇入收口时的 report.md（validateReportSubstance）。

function validateTaskContract(task, errors) {
  if (!String(task.objective || "").trim()) {
    errors.push("task.json objective is empty fix: 把用户原始目标原文锁定进 task.json objective（task-init --task-input 注入或直改 task.json 后跑 task-sync）");
  }
  const tier = String(task.deliverableTier || "").trim();
  if (!tier) {
    errors.push(`task.json deliverableTier is empty; 合法值: ${DELIVERABLE_TIERS.join("/")} fix: 五枚举选一写入 task.json deliverableTier`);
  } else if (!DELIVERABLE_TIERS.includes(tier)) {
    errors.push(
      `task.json deliverableTier="${tier}" is not a valid tier; valid values: ${DELIVERABLE_TIERS.join("/")} ` +
      `fix: 改为五枚举之一（${DELIVERABLE_TIERS.join(" / ")}）；非法值不享受任何豁免（含 run-local 占位豁免与 topic 豁免桶）`
    );
  }
  if (!Array.isArray(task.completionCriteria) || task.completionCriteria.length === 0) {
    errors.push("task.json completionCriteria is empty fix: 至少登记一条可机器判定的完成证据目标（hit 形态见 docs/reference/acceptance-criteria.md 的 criteria-vocabulary GENERATED 块）");
  }

  // V3-4 全摘 error（RT-2 最小形态）：excludedTopics 非空且 selectedTopics 为空 =
  // 摘除了全部已分流 topic，物理阻断；单摘（selectedTopics 非空）维持 WARNING 放行。
  const excludedTopics = Array.isArray(task.taskPacks?.excludedTopics)
    ? task.taskPacks.excludedTopics.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const selectedTopics = Array.isArray(task.taskPacks?.selectedTopics)
    ? task.taskPacks.selectedTopics.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (excludedTopics.length > 0 && selectedTopics.length === 0) {
    errors.push(
      "excludedTopics 摘除了全部已分流 topic fix: 如确为误分流请删除 excludedTopics 条目，或用 webShellTriage.verdict 通道声明非 Web 套壳"
    );
  }
}

function validatePhaseArtifacts(task, findings) {
  const pureFiles = collectPureFiles(task.__taskDir);
  const phaseIndex = phaseOrder.indexOf(task.phase);

  // run-local 实现物强制条件与 RUN_LOCAL_REQUIRED_TIERS 单源常量一致（O7 导出后共用）。
  const tier = String(task.deliverableTier || "").trim();
  if (
    phaseIndex >= phaseOrder.indexOf("Rebuild") &&
    RUN_LOCAL_REQUIRED_TIERS.has(tier) &&
    !artifactTouched(task.__taskDir, "run/run-local.mjs")
  ) {
    findings.push(
      `phase=${task.phase} but run/run-local.mjs is still the template placeholder fix: deliverableTier=${tier} 为实现类交付，需落地 run-local.mjs 实现物；evidence/protocol-doc 类交付豁免此要求`
    );
  }

  evaluateTopicPhaseGuards(task, findings);

  if (phaseIndex >= phaseOrder.indexOf("PureExtraction") && pureFiles.length === 0) {
    findings.push(`phase=${task.phase} but run/ has no pure-* artifact fix: PureExtraction 及之后阶段需在 run/ 落地 pure-*.{mjs,js,py} 纯算法实现物`);
  }
}

// O7：task-sync 近门禁预警（只警告不阻断，exit code 不变）。规则的判定条件全部
// 精简后（win 改造 §2.4.4）：本函数只保留两条无门槛的词表错误预警（②非法 phase /
// ⑥非法 tier）。原规则 ①③④⑤⑦⑧（缺调用链 / criteria 未命中 / plan 未引用 /
// run-local 占位 / topic 摘要 / evidenceRefs 摘要）是「近门禁 WARN 镜像」——
// task-close --dry-run 的错误流已承担同一信息，sync 再镜像一遍只是噪音，已全删；
// 多 Agent 协作可见性由 task-sync 的协作摘要行承担。
export function collectPreGateWarnings(taskDir, task) {
  const warnings = [];

  // 规则 ②（无门槛）：task.phase 非法值任何时刻都是错误
  if (phaseOrder.indexOf(task.phase) === -1) {
    warnings.push(
      `task.phase=${JSON.stringify(task.phase)} 不在合法值 ${phaseOrder.join("/")} 内 ` +
      `fix: 把 task.json 的 phase 改为合法值之一（别名会被 normalizePhaseName 归一化），或 task-advance --to=<phase>`
    );
  }

  // 规则 ⑥（无门槛）：deliverableTier 非空且非法，任何时刻都是错误（与规则 ② 同型）。
  const preGateTier = String(task.deliverableTier || "").trim();
  if (preGateTier && !DELIVERABLE_TIERS.includes(preGateTier)) {
    warnings.push(
      `deliverableTier=${JSON.stringify(task.deliverableTier)} 不在合法值 ${DELIVERABLE_TIERS.join("/")} 内 ` +
      `fix: 改为五枚举之一（${DELIVERABLE_TIERS.join(" / ")}）；非法值不享受任何豁免`
    );
  }

  return warnings;
}

// F-O5：deliverableTier 值合法性单点判定（重分类条件复用，词表取 DELIVERABLE_TIERS 单源常量）。
function isLegalDeliverableTierValue(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && DELIVERABLE_TIERS.includes(text);
}

function collectValidationWarnings(task, reportText, routeState, warnings) {
  // 人工修正留痕单通道（V2-1）：verdict 生效与 excludedTopics 摘除都进 closeout warnings
  const webShellTriage = task.webShellTriage || {};
  if (
    String(webShellTriage.verdict || "").trim().toLowerCase() === "not-web-shell" &&
    String(webShellTriage.verdictRationale || "").trim() &&
    webShellTriage.present === false
  ) {
    warnings.push(
      `[manual-override] web-shell verdict=not-web-shell: ${String(webShellTriage.verdictRationale).trim().slice(0, 120)}`
    );
  }
  const excludedTopics = Array.isArray(task.taskPacks?.excludedTopics)
    ? task.taskPacks.excludedTopics.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (excludedTopics.length > 0) {
    warnings.push(`[manual-override] topics excluded: ${excludedTopics.join(", ")}`);
  }

  // V3-3 漂移留痕可见性（裁 1/裁 8）：contract-change-log 含 deliverableTier /
  // excludedTopics / objective 变更行（changed；baseline 不算变更）→ [manual-override]
  // warning。objective 行一并纳入，contract-change-log 通道获得首个真实读者。
  // F-O5 纠错重分类（硬前置：baseline 比对）：仅 deliverableTier 参与（excludedTopics /
  // objective 无词表，维持原判）。条件缺一不可——last.oldValue 非法（∉ DELIVERABLE_TIERS
  // 或空）且 baseline 行存在且 baseline 值非法/空 → [contract-fix]（留痕保留、WARNING
  // 级别保留一次，仅标签重分类）；其余一切情形维持 [manual-override]。
  // baseline 行不存在属首观测不可验证（删日志即可骗过分类），标签不得奖励不可追溯历史——
  // 删日志行为本身由 firstSighted WARNING 独立兜住。
  for (const field of ["deliverableTier", "excludedTopics", "objective"]) {
    const last = readLastContractChangeEntry(task.__taskDir, field);
    if (last?.kind === "changed") {
      if (field === "deliverableTier" && !isLegalDeliverableTierValue(last.oldValue)) {
        const baseline = readBaselineContractChangeEntry(task.__taskDir, field);
        if (baseline && !isLegalDeliverableTierValue(baseline.value)) {
          warnings.push(
            `[contract-fix] contract field corrected: ${field} (${JSON.stringify(last.oldValue)} -> ${JSON.stringify(last.value)})（baseline 亦为非法值，判定为按门禁报错纠错）`
          );
          continue;
        }
      }
      warnings.push(
        `[manual-override] contract field changed: ${field} (${JSON.stringify(last.oldValue)} -> ${JSON.stringify(last.value)})`
      );
    }
  }

  // report-only 改造：web-shell「Runtime 专用后续动作模板摘要」节随该节从 report.md
  // 骨架删除而退役（过程形态 advisory，无验收价值）。

  // P0-3b（round1 F-03）：clue↔entrypoint 交叉校验降级为 WARNING（原为
  // evaluateRouteConsistency 的 error 级 finding；append-only clues 下手写
  // sourceEntrypoint 指向缺失切入点属常见合法形态，保留诊断价值、不再阻断）。
  const entrypointIds = ((routeState && routeState.entrypoints) || []).map((entrypoint) => entrypoint.id);
  for (const clue of (routeState && routeState.clues) || []) {
    if (
      clue.sourceEntrypoint &&
      !entrypointIds.some((candidate) => sameEntrypointId(candidate, clue.sourceEntrypoint))
    ) {
      warnings.push(`clue ${clue.id} points to missing sourceEntrypoint ${clue.sourceEntrypoint}`);
    }
  }

  // report-only 改造：原 task-advance 的 T3+ 外部研究物理阻断（state/external-research.md
  // 实体文件门禁）退役为 advisory——T4+ 目标在收口时提醒外部调研结论应已汇入 report.md
  // （坑点与经验/专题发现节），不再要求中途建档，更不阻断。
  if (/^T[4-6]$/i.test(String(task.protectionTier || "").trim())) {
    const reportMentionsResearch =
      /外部调研|公开资料|工具链调研|已知限制|external research|prior art/i.test(String(reportText || ""));
    if (!reportMentionsResearch) {
      warnings.push(
        "[advisory] T4+ 高防护目标：外部调研（公开资料/工具链/已知限制）结论宜汇入 report.md 坑点与经验或专题发现节；若已调研而 report 未提及请补记"
      );
    }
  }

  // 已删（win 改造 §2.4.4）：非规范标题 advisory（当前阶段/自动续跑决策/下一步/Runtime 摘要）
  // 与 vm 黑盒「黑盒复用边界」note 提示——task-close 的 headingAliases 规范化已承担同一件事，
  // 这里的 WARNING 是纯噪音。
}

export function evaluateDeliverables(taskDir, options = {}) {
  const { templateMode = false } = options;
  const task = ensureTaskRuntimeShape(readTaskJson(taskDir, options));
  task.__taskDir = taskDir;
  const findings = [];

  for (const topic of topicValidationRules) {
    evaluateTopicFormalValidation(topic, task, findings, { templateMode });
  }

  return findings;
}

export function evaluateRouteConsistency(taskDir, options = {}) {
  const findings = [];
  const task = ensureTaskRuntimeShape(readTaskJson(taskDir, options));
  const taskExecutionMirror = {
    status: task.routeState.executionStatus,
    nextEntrypointId: task.routeState.nextEntrypointId,
    nextExecutableAction: task.routeState.nextExecutableAction,
    pauseCategory: task.routeState.pauseCategory,
    pauseReason: task.routeState.pauseReason
  };
  const taskVmMirror = {
    triageResult: String(task.vm?.triageResult || "").trim(),
    blackboxApi: String(task.vm?.blackboxApi || "").trim()
  };
  const routeStatePath = taskFile(taskDir, task.routeState.statePath);
  const routePlanPath = taskFile(taskDir, task.routeState.planPath);
  const cluesPath = taskFile(taskDir, task.routeState.cluesPath);

  // P0-3a（round1 F-02）：progress.md 视图已删除，存在性检查不再包含 progress。
  for (const [label, filePath] of [
    ["route-state", routeStatePath],
    ["route-plan", routePlanPath],
    ["clues", cluesPath]
  ]) {
    if (!fs.existsSync(filePath)) {
      findings.push(`${label} file is missing: ${relFromRepo(filePath)}`);
    }
  }

  if (findings.length > 0) {
    return findings;
  }

  const routeState = readRouteStateDocument(taskDir, task);
  if (!routeState) {
    findings.push(`route-state file is unreadable: ${relFromRepo(routeStatePath)}`);
    return findings;
  }
  applyRouteStateToTask(task, routeState);

  const routePlanText = fs.readFileSync(routePlanPath, "utf8");
  const expectedRoutePlan = renderRoutePlanMarkdown(routeState, task);
  const routeTracks = routeState.tracks.map((track) => track.title);
  const entrypointIds = (routeState.entrypoints || []).map((entrypoint) => entrypoint.id);
  // P0-3a：activeTracks 校验直接对 routeState.tracks 判（相位一致性本意保留，
  // 不再经过 progress.md markdown 镜像）。
  const activeTracks = routeState.activeTracks || [];
  const activeEntrypoints = routeState.activeEntrypoints || [];
  const execution = routeState.execution || {};

  for (const track of activeTracks) {
    if (!routeTracks.some((candidate) => sameTrack(candidate, track))) {
      findings.push(`route-state activeTracks entry ${track} is missing from route-state.tracks`);
    }
  }

  const inFlight = routeState.tracks
    .filter((track) => track.status === "IN_PROGRESS" || track.status === "BLOCKED")
    .map((track) => track.title);

  for (const track of inFlight) {
    if (!activeTracks.some((candidate) => sameTrack(candidate, track))) {
      findings.push(`route-state marks ${track} as IN_PROGRESS/BLOCKED but activeTracks does not include it`);
    }
  }

  for (const entrypointId of activeEntrypoints) {
    if (!entrypointIds.some((candidate) => sameEntrypointId(candidate, entrypointId))) {
      findings.push(`route-state activeEntrypoints entry ${entrypointId} is missing from route-state.entrypoints`);
    }
  }

  const activeEntrypointRecords = (routeState.entrypoints || []).filter(
    (entrypoint) => entrypoint.status === "PROBING" || entrypoint.status === "EXPANDED"
  );

  for (const entrypoint of activeEntrypointRecords) {
    if (!activeEntrypoints.some((candidate) => sameEntrypointId(candidate, entrypoint.id))) {
      findings.push(`route-state marks ${entrypoint.id} as PROBING/EXPANDED but activeEntrypoints does not include it`);
    }
  }

  if (activeEntrypoints.length > 2) {
    findings.push("route-state activeEntrypoints must not contain more than 2 active probes");
  }

  if (!String(execution.status || "").trim()) {
    findings.push("route-state.execution.status must be set");
  }

  if (taskExecutionMirror.status !== execution.status) {
    findings.push("task.json.routeState.executionStatus is out of sync with route-state.json");
  }

  if (taskExecutionMirror.nextEntrypointId !== execution.nextEntrypointId) {
    findings.push("task.json.routeState.nextEntrypointId is out of sync with route-state.json");
  }

  if (taskExecutionMirror.nextExecutableAction !== execution.nextExecutableAction) {
    findings.push("task.json.routeState.nextExecutableAction is out of sync with route-state.json");
  }

  if (taskExecutionMirror.pauseCategory !== execution.pauseCategory) {
    findings.push("task.json.routeState.pauseCategory is out of sync with route-state.json");
  }

  if (taskExecutionMirror.pauseReason !== execution.pauseReason) {
    findings.push("task.json.routeState.pauseReason is out of sync with route-state.json");
  }

  const routeVmTriageResult = String(routeState.vmTriage?.triageResult || "").trim();
  const routeVmBlackboxApi = String(routeState.vmTriage?.blackboxApi || "").trim();
  const shouldCheckVmMirror =
    Boolean(task.vm) ||
    routeVmTriageResult !== "not-applicable" ||
    Boolean(routeVmBlackboxApi);

  if (shouldCheckVmMirror && taskVmMirror.triageResult !== routeVmTriageResult) {
    findings.push("task.json vm.triageResult is out of sync with route-state.json.vmTriage.triageResult");
  }

  if (shouldCheckVmMirror && taskVmMirror.blackboxApi !== routeVmBlackboxApi) {
    findings.push("task.json vm.blackboxApi is out of sync with route-state.json.vmTriage.blackboxApi");
  }

  if (execution.autoAdvanceEligible === true && execution.status !== "ready-to-continue") {
    findings.push("route-state.execution.autoAdvanceEligible=true requires status=ready-to-continue");
  }

  if (execution.status === "ready-to-continue") {
    if (!String(execution.nextExecutableAction || "").trim()) {
      findings.push("route-state.execution.status=ready-to-continue but nextExecutableAction is empty");
    }
    if (!String(execution.nextEntrypointId || "").trim()) {
      findings.push("route-state.execution.status=ready-to-continue but nextEntrypointId is empty");
    }
    if (
      String(execution.nextEntrypointId || "").trim() &&
      !entrypointIds.some((candidate) => sameEntrypointId(candidate, execution.nextEntrypointId))
    ) {
      findings.push(`route-state.execution.nextEntrypointId ${execution.nextEntrypointId} is missing from route-state.entrypoints`);
    }
  }

  if (execution.status === "completed") {
    if (execution.autoAdvanceEligible === true) {
      findings.push("route-state.execution.status=completed must set autoAdvanceEligible=false");
    }
    if (String(execution.nextExecutableAction || "").trim()) {
      findings.push("route-state.execution.status=completed must not carry nextExecutableAction");
    }
    if (String(execution.nextEntrypointId || "").trim()) {
      findings.push("route-state.execution.status=completed must not carry nextEntrypointId");
    }
    if ((routeState.activeEntrypoints || []).length > 0) {
      findings.push("route-state.execution.status=completed must clear activeEntrypoints");
    }
  }

  if (execution.pauseCategory === "none" && String(execution.pauseReason || "").trim()) {
    findings.push("route-state.execution.pauseCategory=none should not carry a pauseReason");
  }

  if (execution.pauseCategory !== "none" && !String(execution.pauseReason || "").trim()) {
    findings.push("route-state.execution.pauseCategory!=none requires pauseReason");
  }

  if (execution.status === "blocked-on-user" && execution.pauseCategory !== "user") {
    findings.push("route-state.execution.status=blocked-on-user requires pauseCategory=user");
  }

  if (execution.status === "blocked-on-risk" && execution.pauseCategory !== "risk") {
    findings.push("route-state.execution.status=blocked-on-risk requires pauseCategory=risk");
  }

  if (routeState.syncStatus === "backfilled-from-markdown-lossy" && execution.status !== "needs-route-rebuild") {
    findings.push("lossy route-state must set execution.status=needs-route-rebuild");
  }

  if ((routeState.entrypoints || []).length > maxEntrypointsInWorkingSet) {
    findings.push(`route-state entrypoints must not contain more than ${maxEntrypointsInWorkingSet} working-set records; archive or prune exhausted entries`);
  }

  if ((routeState.retrospectives || []).length > maxRetrospectivesInWorkingSet) {
    findings.push(`route-state retrospectives must not contain more than ${maxRetrospectivesInWorkingSet} recent records`);
  }

  if (routeState.syncStatus === "backfilled-from-markdown-lossy") {
    findings.push("route-state was lossily backfilled from markdown; rebuild entrypoints/retrospectives before continuing");
  }

  // report-only 改造：删除两个 agent 义务类 finding——
  // 「phase≥Implement 但无 entrypoints」（ENTRYPOINT_REQUIRED_PHASES 组）与
  // 「切入点全耗尽但无 retrospective」。route-state 骨架保留为可选续跑辅助，
  // 不跑 sync/advance 不得被门禁惩罚；本节只保留机器视图一致性检查（防状态损坏）。

  // P0-3b（round1 F-03）：clue↔entrypoint 交叉校验自 error 降级为 WARNING——clues.md
  // 转 append-only 账本后，手写 clue 的 sourceEntrypoint 可能指向已归档/改号的切入点，
  // 属诊断价值而非阻断项；校验本体移入 collectValidationWarnings（warnings 通道）。
  for (const retrospective of routeState.retrospectives || []) {
    for (const entrypointId of retrospective.newEntrypoints || []) {
      if (!entrypointIds.some((candidate) => sameEntrypointId(candidate, entrypointId))) {
        findings.push(`${retrospective.id} points to missing newEntrypoint ${entrypointId}`);
      }
    }
  }

  if (normalizeNewlines(routePlanText) !== normalizeNewlines(expectedRoutePlan)) {
    findings.push("route-plan.md is out of sync with route-state.json fix: 视图由 route-state.json 渲染，不要手修该文件；把手写内容改写到 state/route-state.json 后运行 task-sync（task-close 会自动 resync，守卫会合并/快照手改内容）");
  }

  // P0-3b（round1 F-03）：clues.md out-of-sync finding 删除——append-only 账本永不覆写，
  // 与 route-state.json 不再存在"应同步"关系；novel 线索由 sync 单向吸收。

  // P0-3a（round1 F-02）：progress 渲染比对与相位-轨道门禁组三条（Observe 全 DONE /
  // Port 无 DONE / PureExtraction 无 DONE|IN_PROGRESS）随 progress.md 视图一并删除。

  return findings;
}

const pureAlgorithmForbiddenPatterns = [
  { pattern: /child_process/, label: "child_process (exec/spawn)" },
  { pattern: /regedit|registry|Winreg|REGISTRY/, label: "registry operation" },
  { pattern: /Program\s+Files/i, label: "target install path write" }
];

function validateDeliverableTierConsistency(task, errors) {
  const tier = String(task.deliverableTier || "").trim();
  if (tier !== "pure-algorithm") {
    return;
  }

  const pureFiles = collectPureFiles(task.__taskDir);
  for (const relPath of pureFiles) {
    const fullPath = taskFile(task.__taskDir, relPath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const content = fs.readFileSync(fullPath, "utf8");
    for (const { pattern, label } of pureAlgorithmForbiddenPatterns) {
      if (pattern.test(content)) {
        errors.push(`deliverableTier=pure-algorithm but ${relPath} contains forbidden pattern: ${label} fix: pure-algorithm 交付的 pure-* 文件禁止该模式（child_process / 注册表 / 安装目录写入三类）；将对应逻辑迁出 pure-* 文件，或改 deliverableTier`);
      }
    }
  }
}

// V3-6 closeout fail-closed：patch 需求命中且 run/ 存在 .clean.bak 时逐条核对 manifest。
// 仅「解析不出原始路径」（格式错误）升级 error；路径解析成功但原始文件已合法清理
// （existsSync=false）维持 WARNING——advance 侧 !originalPath || !existsSync 合并 WARNING 的
// 条件不得原样上移（裁 8），两侧严格分层。
function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateBackupManifest(task, errors, warnings = []) {
  const phaseIndex = phaseOrder.indexOf(task.phase);
  const tier = String(task.deliverableTier || "").trim();
  const needsBackup = phaseIndex >= phaseOrder.indexOf("Patch") || tier === "patch";
  if (!needsBackup) {
    return;
  }

  const manifestPath = taskFile(task.__taskDir, "run/backup-manifest.md");
  if (!fs.existsSync(manifestPath)) {
    errors.push("phase>=Patch or deliverableTier=patch but run/backup-manifest.md is missing fix: 建立 run/backup-manifest.md，逐条登记 | <原始文件绝对路径> | <备份名> | <sha256-hex> |（规则详见 docs/reference/acceptance-criteria.md 第 8 节）");
    return;
  }
  const content = fs.readFileSync(manifestPath, "utf8");
  if (!/[0-9a-fA-F]{64}/.test(content)) {
    errors.push("run/backup-manifest.md exists but contains no SHA256 hash entries fix: manifest 每行必须含 64 位十六进制 sha256 列，形态示例 | <原始文件绝对路径> | <备份名> | <sha256-hex> |");
  }

  const runDir = taskFile(task.__taskDir, "run");
  const manifestMap = readBackupManifestMap(runDir);

  // R1-S1 发现源 = run/ 扫描 ∪ manifest 登记（与 advance 侧同源）；
  // manifest 第二列登记备份绝对路径时，run/ 之外的备份同样纳入核对。
  const discovered = new Map();
  if (fs.existsSync(runDir)) {
    for (const name of fs.readdirSync(runDir).filter((item) => item.endsWith(".clean.bak"))) {
      discovered.set(name, path.join(runDir, name));
    }
  }
  for (const entry of readBackupManifestEntries(runDir)) {
    if (!discovered.has(entry.backupName) && fs.existsSync(entry.backupPath)) {
      discovered.set(entry.backupName, entry.backupPath);
    }
  }
  if (discovered.size === 0) {
    return;
  }

  const authFlagPath = taskFile(task.__taskDir, "run/hash_mismatch_authorized.flag");
  for (const [backupName, backupPath] of discovered) {
    const originalPath = manifestMap.get(backupName);
    if (!originalPath) {
      errors.push(
        `run/backup-manifest.md 中备份 ${backupName} 解析不出原始路径（格式错误），哈希断路器无法对其生效 ` +
        `fix: 修正行格式为 | <原始文件绝对路径> | ${backupName} | <sha256-hex> |` +
        `（规则详见 docs/reference/acceptance-criteria.md 第 8 节）`
      );
      continue;
    }
    if (!fs.existsSync(originalPath)) {
      warnings.push(
        `[backup-manifest] 备份 ${backupName} 的原始文件 ${originalPath} 已不存在（视为合法清理），哈希断路器对其不适用`
      );
      continue;
    }
    // R1-B2：close 侧补 WARNING 级哈希比对（维持裁 8 分层，不升 error；
    // 物理阻断仍只在 advance 侧）。此前 close 侧从不比对哈希，备份在 run/ 之外时全程静默。
    if (!fs.existsSync(authFlagPath) && sha256File(originalPath) !== sha256File(backupPath)) {
      warnings.push(
        `[backup-manifest] 备份 ${backupName} 与原始文件的 SHA256 不一致且未见 run/hash_mismatch_authorized.flag 豁免` +
        `（close 宽容级 WARNING；advance 侧将物理阻断，规则详见 docs/reference/acceptance-criteria.md 第 8 节）`
      );
    }
  }
}

export function runFormalValidation(taskDir, options = {}) {
  const errors = [];
  const warnings = [];
  const taskJsonPath = taskFile(taskDir, "task.json");
  const reportPath = taskFile(taskDir, "report.md");

  if (!fs.existsSync(taskJsonPath)) {
    errors.push(`missing task.json: ${relFromRepo(taskJsonPath)} fix: 先跑 task-start/task-init 初始化 task-local，再执行验证`);
    return { ok: false, errors, warnings, findings: errors };
  }
  // report-only 改造：fixtures.json 机制（验收用例登记）随过程门禁整体退役；
  // 判据验收改由 completionCriteria hit + evidenceRefs（真实证据文件）承担。
  if (!fs.existsSync(reportPath)) {
    errors.push(`missing report.md: ${relFromRepo(reportPath)} fix: task-close 会从 _TEMPLATE/core 落盘骨架；按骨架章节一次性写全任务总结（难点/思路/坑点/经验/实现路径/验证证据）`);
  }

  const task = ensureTaskRuntimeShape(readTaskJson(taskDir, options));
  task.__taskDir = taskDir;

  validateTaskContract(task, errors);

  if (!phaseOrder.includes(task.phase)) {
    errors.push(`invalid task.phase: ${task.phase}; 合法值: ${phaseOrder.join("|")} fix: task.phase 改为六枚举之一（阶段推进用 task-advance --to=<phase>）`);
  }

  if (task.taskId === "replace-me" || path.basename(taskDir) === "_TEMPLATE") {
    errors.push("verify-once cannot pass on the template task or an uninitialized taskId fix: 用真实 task-id 初始化任务（task-start <task-id>），不要在 _TEMPLATE 或未改 taskId 的任务上跑验证");
  }

  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
  if (fs.existsSync(reportPath)) {
    validateReportSubstance(task, reportText, taskFileMatchesTemplate(taskDir, "report.md"), errors);
  }
  if (taskRequiresLocalReproduction(task)) {
    validateLocalReproductionDelivery(task, reportText, errors);
  }

  errors.push(...evaluateDeliverables(taskDir, options));
  validatePackerUnpackEvidence(task, reportText, errors, warnings);
  errors.push(...evaluateRouteConsistency(taskDir, options));
  validatePhaseArtifacts(task, errors);
  const routeState = readRouteStateDocument(taskDir, task);
  collectValidationWarnings(task, reportText, routeState, warnings);
  validateDeliverableTierConsistency(task, errors);
  validateBackupManifest(task, errors, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    findings: errors
  };
}

// V3-5 dry-run 改道（裁 2）：dry-run 不写 task.json（消除内容变更型竞态——dry-run 与
// agent 手写编辑撞的正是 validation 字段变更区），状态改写 run/validation-last.json
// （status/lastVerifiedAt/notes 与 task.json validation 字段同构）；
// evaluateCloseoutGate 对 task.json 非 passed 的情形回读本文件。
export function persistValidation(taskDir, result, options = {}) {
  const status = result.ok ? "passed" : "failed";
  const lastVerifiedAt = nowIso();
  const notes = result.ok
    ? // R2-G01（round2 D8）：slice 上限 4→6，防 corpus 分诊 WARN 被截出 validation notes。
      ["formal one-shot validation passed", ...(result.warnings || []).slice(0, 6).map((item) => `warning: ${item}`)]
    : [
        ...(result.errors || result.findings || []).slice(0, 8),
        ...(result.warnings || []).slice(0, 6).map((item) => `warning: ${item}`)
      ];

  if (options.dryRun === true) {
    const lastPath = taskFile(taskDir, "run/validation-last.json");
    fs.mkdirSync(path.dirname(lastPath), { recursive: true });
    fs.writeFileSync(lastPath, `${JSON.stringify({ status, lastVerifiedAt, notes }, null, 2)}\n`, "utf8");
    return;
  }

  const task = ensureTaskRuntimeShape(readTaskJson(taskDir, options));
  task.validation.status = status;
  task.validation.lastVerifiedAt = lastVerifiedAt;
  task.validation.notes = notes;
  writeTaskJson(taskDir, task);
}

function readRouteStateForGate(taskDir, task) {
  // report-only 改造注记：infeasible RETRO 门禁已退役，本助手暂无消费方；
  // 保留为轻量只读工具函数（后续 route 类 closeout 判定可复用）。
  try {
    const relPath = task.routeState?.statePath || "state/route-state.json";
    const filePath = taskFile(taskDir, relPath);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// P0-2（round1 F-05）收口义务前置：与 runFormalValidation / evaluateCloseoutGate 同源取数，
// 在 init/sync 时刻给出"离 close 还差什么"的义务清单（事前清单，替代 dry-run 事后暴露）。
// R2-G04（round2 P0-②）谓词化三分法：修复"未满足(n)"恒常数缺陷——
//   - confirmed / conditional 只收**当前未满足**项（谓词判定通过即从清单消失）；
//   - total = 当前适用门数（分母，含已满足项），n = 未满足数（分子），sync 序列应单调降至 0；
//   - report 必备节、本地复现、multi 协作项降入 informational 信息面（信息提示，
//     不计入义务分母；report-only 后 task-close 不再 autoFix 任何 report 章节）；
//   - 清单仍是"非完备"指引：topic 可在 sync 时增量，最终以 closeout gate 判定为准。
export const CLOSEOUT_OBLIGATIONS_FOOTER =
  "清单非完备：topic 于 sync 时可能增量；最终以 task-close --dry-run 收口终检为准。";

export function collectCloseoutObligations(taskDir, taskInput) {
  const task = ensureTaskRuntimeShape(readTaskJson(taskDir));
  task.__taskDir = taskDir;
  const confirmed = [];
  const conditional = [];
  const informational = [];
  let gatedTotal = 0;
  // 适用即计数（进分母）；未满足才显示（进分子）。
  const gateConfirmed = (unsatisfied, text) => {
    gatedTotal += 1;
    if (unsatisfied) {
      confirmed.push(text);
    }
  };
  const gateConditional = (unsatisfied, text) => {
    gatedTotal += 1;
    if (unsatisfied) {
      conditional.push(text);
    }
  };

  // —— 契约五字段（validateTaskContract 同源口径）——
  gateConfirmed(!String(task.objective || "").trim(), "task.json.objective 为空：锁定用户原始目标原文");
  const tier = String(task.deliverableTier || "").trim();
  gateConfirmed(
    !DELIVERABLE_TIERS.includes(tier),
    `task.json.deliverableTier 未定（五枚举 ${DELIVERABLE_TIERS.join("/")}` + "，非法值不享受任何豁免）"
  );
  gateConfirmed(
    !Array.isArray(task.completionCriteria) || task.completionCriteria.length === 0,
    "completionCriteria 至少一条可机器判定的完成判据"
  );

  // —— 核心产物（runFormalValidation 同源；report-only：唯一强制文档产物）——
  gateConfirmed(
    !artifactExists(taskDir, "report.md") || taskFileMatchesTemplate(taskDir, "report.md"),
    "report.md 待写（收口时按骨架章节一次性写全任务总结：难点/思路/坑点/经验/实现路径/验证证据；缺失或仍是骨架都算未完成）"
  );

  // —— evidenceRefs 形态提示①：仅当存在命中判据时该门适用；命中而证据引用未通过
  // 合法形态校验（criterionEvidenceRefValid 与 closeout 门禁同源单源）时显示。
  // 零命中时空真：既不显示也不计入分母。——
  const hitCriteria = (Array.isArray(task.completionCriteria) ? task.completionCriteria : []).filter((item) =>
    criteriaItemHit(item)
  );
  if (hitCriteria.length > 0) {
    const missingEvidence = hitCriteria.filter((item) => {
      const refs = collectCriterionEvidenceRefs(item);
      return refs.length === 0 || refs.some((ref) => !criterionEvidenceRefValid(taskDir, item, ref));
    });
    gateConfirmed(
      missingEvidence.length > 0,
      "每条命中 completionCriteria 携带合法 evidenceRefs（task-local 路径 / 用户确认:<原文> / call_xxx+excerpt 三选一）"
    );
  }

  // —— report 必备节与协作项：informational 信息面（不计入 n/total）——
  informational.push("report.md 必备节：任务摘要 / 实现路径 / 验证证据（closeoutMode=partial/infeasible 另需「未竟事项」节写根因与已排除路线）");

  // —— topic 义务③（selectedTopics 的 formalValidation；report-only 后专题覆盖
  // 从 notes 文件转为 report.md 专题小节谓词，requirementsAll/requirementsAny 同源评估）——
  for (const topicKey of uniqStringsSorted(task.taskPacks?.selectedTopics || [])) {
    const topic = getTopicBySpecifier(topicKey);
    const rule = topic?.formalValidation;
    if (!rule || topicIsExcluded(task, topic.key)) {
      continue;
    }
    for (const requirement of rule.requirementsAll || []) {
      const passed = evaluateCondition(task, taskDir, requirement);
      gateConditional(!passed, `${topicKey}: ${requirement.message || "requirement"}（presentPath=${rule.presentPath} 时强制）`);
    }
    for (const group of rule.requirementsAny || []) {
      const passed = (group.checks || []).some((condition) => evaluateCondition(task, taskDir, condition));
      gateConditional(!passed, `${topicKey}: ${group.message}（多选一满足即可）`);
    }
  }

  // —— tier 门禁⑤（backup-manifest / run-local 与 validatePhaseArtifacts、第 8 节同源；
  // 加存在性判定：产物已合格即消失）——
  const phaseIndex = phaseOrder.indexOf(String(task.phase || ""));
  if (tier === "patch" || phaseIndex >= phaseOrder.indexOf("Patch")) {
    let manifestSatisfied = false;
    const manifestPath = taskFile(taskDir, "run/backup-manifest.md");
    try {
      manifestSatisfied =
        fs.existsSync(manifestPath) && /[0-9a-f]{64}/i.test(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      manifestSatisfied = false;
    }
    gateConditional(
      !manifestSatisfied,
      "backup-manifest: run/backup-manifest.md 需含 SHA256 条目（phase>=Patch 或 tier=patch；哈希断路器据此生效）"
    );
  }
  if (RUN_LOCAL_REQUIRED_TIERS.has(tier)) {
    gateConditional(
      !artifactExists(taskDir, "run/run-local.mjs") || !artifactTouched(taskDir, "run/run-local.mjs"),
      "run-local: run/run-local.mjs 需为参数化实现物（非模板占位；evidence/protocol-doc tier 豁免）"
    );
  }
  // —— R3'-04/C3（round3 H-04）：pure-* 相位普适 conditional 行——谓词逐字镜像
  // validatePhaseArtifacts 的 pure-* 门（相位普适，不跟 tier、不跟 localReproductionRequested）；
  // 落地 touched pure-* 实现物后从分子消失（分母保留）。L1729-1731 原 informational 行不动。——
  if (phaseIndex >= phaseOrder.indexOf("PureExtraction")) {
    gateConditional(
      collectPureFiles(taskDir).length === 0,
      "pure-*: PureExtraction 及之后阶段需在 run/ 落地 pure-*.{mjs,js,py} 纯算法实现物（phase>=PureExtraction，全 tier 适用）"
    );
  }
  // —— R3'-06/C5（round3 H-04）：判据状态两行——镜像 evaluateCloseoutGate 的
  // successCriteria / completionCriteria 状态闸；countHitSuccessCriteria /
  // collectUnhitCriteria 为同模块既有单源函数，零新增语义；判据逐条标 hit 后自然下降。——
  gateConditional(
    countHitSuccessCriteria(task.successCriteria) === 0,
    'successCriteria 状态：至少一条 successCriteria 需命中——hit 形态 { "text": "...", "status": "done" } 或 { "text": "...", "hit": true }（门禁只验形状，内容须为真实证据）'
  );
  const unhitCompletionPreview = collectUnhitCriteria(task.completionCriteria);
  gateConditional(
    unhitCompletionPreview.length > 0,
    `completionCriteria 状态：pending indexes=${unhitCompletionPreview
      .map(({ index }) => index)
      .join(",")}——逐条完成并标 hit；确属不可完成的条目改 closeoutMode=partial/infeasible 并满足对应 gate`
  );
  if (task.deliveryRequirements?.localReproductionRequested === true) {
    informational.push("本地复现交付：report 的「本地复现交付」节齐备 + 至少一个 run/pure-* 实现物 + evidenceRefs 指向真实证据");
  }

  // —— multi 协作追加义务（信息面：签字门禁由 closeout gate 机器兜底）——
  if (String(task.executionModel?.concurrency || "") === "multi") {
    informational.push("multi 任务：收口前需 completion-claim 审计 PASS 入账 + 本相位 dispatch 包与 PASS 审计增量");
  }

  // —— R2-G05：corpus 探测行（单一通道原则：sync/init 走义务行，dry-run/close 走 WARN）——
  const vmpCorpusProbe = collectVmpCorpusProbeLine(taskDir, task);
  if (vmpCorpusProbe) {
    gateConditional(true, vmpCorpusProbe);
  }

  return { confirmed, conditional, informational, total: gatedTotal };
}

// R2-G05（round2）：corpus 探测行——init/sync 时刻语料净提及 VMP 而 vmp.present!=="true"
// 时追加的分诊探测行（与 G-01 dry-run/close 时刻的 pre-gate WARN 同源不同文案：义务行面向
// 分诊义务、WARN 面向状态不一致；同一信号在不同生命周期各走单一通道，不开双通道竞争）。
// init 时语料尚未成形自然静默，首曝落在第一次 sync。
function collectVmpCorpusProbeLine(taskDir, task) {
  if (task?.packerUnpack?.present !== true || task?.packerUnpack?.vmp?.present === true) {
    return null;
  }
  const reportPath = taskFile(taskDir, "report.md");
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
  const corpus = taskTextCorpus(task, reportText, []);
  if (taskMentionsVmp(corpus) && !taskExplicitlyDeniesVmp(corpus)) {
    return "分诊提醒：任务语料提及 VMP 但 packerUnpack.vmp.present!==true——确非 VMP 可在 report.md 专题发现节留一行结论；确为 VMP 请置 present=true 并按义务补齐";
  }
  return null;
}

function uniqStringsSorted(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))).sort();
}


function collectVmpToolRoutes(task) {
  const routes = task.packerUnpack?.vmp?.toolRoutes;
  return Array.isArray(routes) ? routes : [];
}

function countEvaluatedRoutes(routes) {
  return routes.filter((route) => {
    const status = String(route?.status || "").trim();
    return status && status !== "not-evaluated" && status !== "candidate";
  }).length;
}

// report-only 改造：infeasible/partial 收口的「根因 + 已排除路线」义务由
// run/infeasible-analysis.md 文件 + route-state RETRO 复盘块合并迁移为
// report.md 的「未竟事项」节（正文篇幅校验在 validateReportSubstance；此处补
// toolRoutes 评价数与路线点名两个结构化判定）。
function evaluateInfeasibleGate(taskDir, task, errors, warnings) {
  const reportText = safeReadTaskText(taskDir, "report.md");
  const unfinishedBody = extractReportSectionBody(reportText, REPORT_UNFINISHED_SECTION_PATTERN);
  if (!unfinishedBody) {
    errors.push("infeasible/partial closeout requires a \"## 未竟事项\" section in report.md fix: 写清根因与已排除路线（至少 200 字符），逐条附失败证据");
    return;
  }
  if (unfinishedBody.length < REPORT_UNFINISHED_MIN_CHARS) {
    errors.push(`report.md 未竟事项 section must be at least ${REPORT_UNFINISHED_MIN_CHARS} chars with root cause and ruled-out routes fix: 补充根因分析与逐条排除的路线证据至 ${REPORT_UNFINISHED_MIN_CHARS} 字符以上`);
  }

  const routes = collectVmpToolRoutes(task);
  if (routes.length > 0) {
    const evaluated = countEvaluatedRoutes(routes);
    const required = Math.max(1, Math.ceil(routes.length / 2));
    if (evaluated < required) {
      errors.push(
        `infeasible closeout requires evaluating at least ${required} of ${routes.length} toolRoutes (currently ${evaluated}); ` +
        "fix: 把每条试过的 route status 置为合法值之一 selected/rejected/failed/not-available 并附证据"
      );
    }
    const mentioned = routes.some((route) => unfinishedBody.includes(String(route?.route || "")));
    if (!mentioned) {
      errors.push(`report.md 未竟事项 section must reference at least one toolRoutes route name fix: 在未竟事项中点名至少一条已登记 toolRoutes 的 route（当前共 ${routes.length} 条），说明其被排除或失败的依据`);
    }
  }
}

export function evaluateCloseoutGate(taskDir, options = {}) {
  const errors = [];
  const warnings = [];
  const task = ensureTaskRuntimeShape(readTaskJson(taskDir, options));
  const closeoutMode = String(task.closeoutMode || "achieved").trim() || "achieved";

  // V3-5 fallback：dry-run 改道后本次 verify 状态只落在 run/validation-last.json，
  // task.json 的 validation 字段是旧值；非 passed 时回读改道文件，避免 dry-run 误挂。
  let validationStatus = String(task.validation?.status || "").trim();
  if (validationStatus !== "passed") {
    try {
      const lastPath = taskFile(taskDir, "run/validation-last.json");
      if (fs.existsSync(lastPath)) {
        const last = JSON.parse(fs.readFileSync(lastPath, "utf8"));
        if (String(last?.status || "").trim() === "passed") {
          validationStatus = "passed";
        }
      }
    } catch {
      // 改道文件缺失/损坏时维持 task.json 判定
    }
  }

  if (validationStatus !== "passed") {
    errors.push("closeout requires validation.status=passed fix: 先消除 verify-once 的失败项；task-close 会在 closeout gate 前自动重跑形式验证并持久化结果");
  }

  if (closeoutMode === "infeasible" || closeoutMode === "partial") {
    evaluateInfeasibleGate(taskDir, task, errors, warnings);
    return { ok: errors.length === 0, errors, warnings, findings: errors };
  }

  if (countHitSuccessCriteria(task.successCriteria) === 0) {
    errors.push(
      "closeout requires at least one hit successCriteria entry fix: 至少一条 successCriteria 需命中——" +
      'hit 形态示例 { "text": "...", "status": "done" } 或 { "text": "...", "hit": true }（字符串形态 "[x] ..."）；' +
      "目标确未达成的改 closeoutMode=partial 并满足对应 gate（report.md 「未竟事项」节写根因与已排除路线）。" +
      "门禁只验形状，内容须为真实证据"
    );
  }

  const unhitCompletionCriteria = collectUnhitCriteria(task.completionCriteria);
  if (unhitCompletionCriteria.length > 0) {
    errors.push(
      `closeout requires every completionCriteria entry to be hit; pending indexes=${unhitCompletionCriteria
        .map(({ index }) => index)
        .join(",")} fix: 逐条完成并标记 hit；确属不可完成的条目应改 closeoutMode=partial/infeasible 并满足对应 gate（report.md 「未竟事项」节写根因与已排除路线）`
    );
  }

  const hitCriteriaWithoutEvidence = collectHitCriteriaWithoutEvidence(taskDir, task.completionCriteria);
  if (hitCriteriaWithoutEvidence.length > 0) {
    errors.push(
      `closeout requires every hit completionCriteria entry to carry valid evidenceRefs; missing indexes=${hitCriteriaWithoutEvidence
        .map(({ index }) => index)
        .join(",")} fix: 合法形态三选一——task-local 非空证据文件路径 / '用户确认:<原文>' / 'call_xxx' 并同时提供 evidenceExcerpt`
    );
  }

  if (task.envConformance?.present && task.firstDivergence?.status === "not-recorded") {
    errors.push("env task cannot close out without firstDivergence fix: 在 task.json 记录 firstDivergence（首个分歧点的位置与判定），status 不得停留 not-recorded");
  }

  if (task.vm?.present && !isVmBlackboxRoute(task) && String(task.vm.opcodeCoverage || "0%") === "0%") {
    errors.push("vm task cannot close out with opcodeCoverage=0% unless vm.triageResult=blackbox fix: 提升 vm.opcodeCoverage（记录已覆盖 opcode 比例），或按黑盒路线把 vm.triageResult 置为 blackbox 并记录 vm.blackboxApi");
  }

  if (task.vm?.present && isVmBlackboxRoute(task) && !String(task.vm.blackboxApi || "").trim()) {
    warnings.push("vm blackbox route should record vm.blackboxApi before closeout");
  }

  // 多 Agent 协作门禁（win 改造 §2.2/§2.3，multi 模式）：close 要求 completion-claim
  // 审计 PASS 入账 + 通道/时序/相位增量判据全绿。single/legacy 模式跳过本判据
  // （advisory 提示由 task-sync 承担；本门禁只读文件与账本，与 closeout 校验解耦）。
  if (resolveExecutionModel(task) === "multi") {
    const collaboration = evaluateCollaboration(taskDir, task, { completionClaim: true });
    for (const violation of collaboration.violations) {
      errors.push(
        `collaboration[${violation.code}]: ${violation.message} ` +
        "fix: 走 task-dispatch 通道补齐（--kind=worker 派工 / --kind=audit 派审 / --collect 入账），协议见 docs/reference/multi-agent-orchestration.md"
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    findings: errors
  };
}
