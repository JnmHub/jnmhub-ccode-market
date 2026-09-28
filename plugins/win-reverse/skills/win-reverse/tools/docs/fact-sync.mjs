import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTopicRegistryFromSource } from "../topic-manifests.mjs";
import { CRITERIA_HIT_FORMS, DELIVERABLE_TIERS, EVIDENCE_REF_FORMS } from "../task/validation.mjs";
import { phaseAliases, phaseOrder } from "../task/common.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const maturityOrder = ["synthetic-e2e", "guided", "closed-loop", "reference-only"];

const blockTargets = [
  {
    path: "SKILL.md",
    blockId: "topic-maturity-summary",
    render: renderSkillTopicMaturitySummary
  },
  {
    path: "README.md",
    blockId: "topic-maturity-summary",
    render: renderReadmeTopicMaturitySummary
  },
  {
    path: "SKILL.md",
    blockId: "bootstrap-new-task-brief",
    render: () => renderBootstrapNewTaskBrief()
  },
  {
    path: "SKILL.md",
    blockId: "bootstrap-resume-task-brief",
    render: () => renderBootstrapResumeTaskBrief()
  },
  {
    path: "SKILL.md",
    blockId: "bootstrap-drill-task-brief",
    render: () => renderBootstrapDrillBrief()
  },
  {
    path: "PROMPTS.md",
    blockId: "default-flow",
    render: () => renderPromptDefaultFlow()
  },
  {
    path: "docs/reference/reverse-bootstrap.md",
    blockId: "bootstrap-new-task",
    render: () => renderBootstrapNewTask()
  },
  {
    path: "docs/reference/reverse-bootstrap.md",
    blockId: "bootstrap-resume-task",
    render: () => renderBootstrapResumeTask()
  },
  {
    path: "docs/reference/reverse-bootstrap.md",
    blockId: "bootstrap-drill-task",
    render: () => renderBootstrapDrill()
  },
  {
    path: "docs/guides/minimal-usage-manual.md",
    blockId: "bootstrap-new-task",
    render: () => renderBootstrapNewTask()
  },
  {
    path: "docs/guides/minimal-usage-manual.md",
    blockId: "bootstrap-resume-task",
    render: () => renderBootstrapResumeTask()
  },
  {
    path: "docs/guides/minimal-usage-manual.md",
    blockId: "bootstrap-drill-task",
    render: () => renderBootstrapDrill()
  },
  {
    path: "docs/reference/acceptance-criteria.md",
    blockId: "criteria-vocabulary",
    render: () => renderCriteriaVocabulary()
  },
  {
    path: "SKILL.md",
    blockId: "criteria-vocabulary",
    render: () => renderCriteriaVocabulary()
  },
  {
    path: "SKILL.md",
    blockId: "phase-vocabulary",
    render: () => renderPhaseVocabulary()
  },
  {
    // P2-10（round1 F-11）：phase-vocabulary 随三合一改注入 minimal-usage-manual。
    path: "docs/guides/minimal-usage-manual.md",
    blockId: "phase-vocabulary",
    render: () => renderPhaseVocabulary()
  }
];

function sortTopics(topics) {
  return [...topics].sort((left, right) => String(left.key || "").localeCompare(String(right.key || "")));
}

function listTopicsByMaturity(topics, maturity) {
  return sortTopics(topics).filter((topic) => topic.maturity === maturity);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTopicNames(topics) {
  return topics.length === 0 ? "none published yet" : topics.map((topic) => `\`${topic.key}\``).join(", ");
}

function renderReadmeTopicMaturitySummary(topics) {
  return maturityOrder.map((maturity) => {
    const group = listTopicsByMaturity(topics, maturity);
    return `- \`${maturity}\` (\`${group.length}\`): ${formatTopicNames(group)}`;
  }).join("\n");
}

function renderSkillTopicMaturitySummary(topics) {
  return renderReadmeTopicMaturitySummary(topics);
}

// O6：开局链条口径单源。SKILL.md / PROMPTS.md / reverse-bootstrap.md 三处开局叙事
// 共享同一字面量，check-doc-facts 据此断言三处逐字一致，改口径只改这里。
export const NEW_TASK_CHAIN_TEXT = "task-start（自动转发 task-init）→ task-sync → task-advance";

function renderBootstrapNewTask() {
  return [
    "1. 阅读 `SKILL.md`",
    "2. 阅读 `docs/reference/reverse-bootstrap.md`",
    `3. 开局链条统一为 \`${NEW_TASK_CHAIN_TEXT}\`；若当前 workspace 没有 history data files，执行 \`node "<SKILL_BASE>/tools/task/task-start.mjs" <task-id>\``,
    "4. 如果已知 topic 或交付约束，可一并传 `--topic=`、`--topics=`、`--local-repro`、`--protocol-replay`、`--task-input=...`",
    "5. `task-start` 在无历史文件时转发到 `task-init`；若 workspace 已有 history data files，则默认阻止新建第二个 task-local，除非显式传 `--force-new-task`",
    "6. 在进入 `task-sync` 前锁定机器校验的契约五字段：`target / objective / deliverableTier / completionCriteria / boundaries`（逐字段形状以 task-sync 输出的 pauseReason 为准，单源定义见 `tools/task/route-state.mjs` 的 `CONTRACT_FIELD_HINTS`；`disallowedFallbacks / userRejectedApproaches` 推荐记录但无机器校验），并尽量同时确定 `runtime.architecture / runtime.wow64 / runtime.managed / protectionTier`",
    "7. 执行 `node \"<SKILL_BASE>/tools/task/task-sync.mjs\" <task-id>`",
    "8. 执行 `node \"<SKILL_BASE>/tools/task/task-advance.mjs\" <task-id>`",
    "9. 若 `execution.status=ready-to-continue`，直接执行 `nextExecutableAction`，不要停在状态汇报"
  ].join("\n");
}

function renderBootstrapResumeTask() {
  return [
    "1. 先读 `task.json` 与 `state/route-state.json`",
    "2. 再把 `state/route-plan.md`、`state/clues.md` 作为派生视图补充查看",
    "3. 执行 `node \"<SKILL_BASE>/tools/task/task-sync.mjs\" <task-id>`",
    "4. 执行 `node \"<SKILL_BASE>/tools/task/task-advance.mjs\" <task-id>`",
    "5. 若 `execution.status=ready-to-continue`，必须继续执行 `nextExecutableAction`，不要停在“已恢复”",
    "6. 只有 `pauseCategory=user/risk`、缺样本或 closeout 已完成时，才允许暂停等待用户"
  ].join("\n");
}

function renderBootstrapDrill() {
  return [
    "1. 运行 `node \"<SKILL_BASE>/tools/task/task-drill.mjs\" --list`",
    "2. 选择 drill 后执行 `node \"<SKILL_BASE>/tools/task/task-drill.mjs\" <scenario-id> <task-id>`",
    "3. 再按 `task.json -> route-state.json -> task-sync -> task-advance` 的标准闭环继续推进"
  ].join("\n");
}

function renderBootstrapNewTaskBrief() {
  return [
    `- 无历史文件：\`${NEW_TASK_CHAIN_TEXT}\``,
    "- 可直接附带 `--topic=`、`--topics=`、`--local-repro`、`--protocol-replay`、`--task-input=...`",
    "- `task-input` 现已按 schema 强校验",
    "- 若 `execution.status=ready-to-continue`，继续执行 `nextExecutableAction`"
  ].join("\n");
}

function renderBootstrapResumeTaskBrief() {
  return [
    // R2'-17（round2 G-09）：续跑读到契约字段与分诊证据矛盾时，以分诊证据为准修正字段并留痕。
    "- 先读 `task.json` 与 `state/route-state.json`，再补读 `route-plan / clues`（读到契约字段与分诊证据矛盾时，以分诊证据为准修正字段并留痕 contract-change-log）",
    "- 续跑统一走 `task-sync -> task-advance`",
    "- 恢复完成后直接继续活跃阶段，不以“状态汇报”收尾",
    "- 只有 `pauseCategory=user/risk`、缺样本或 closeout 完成时才停下"
  ].join("\n");
}

function renderBootstrapDrillBrief() {
  return [
    "- 没有真实样本但要模拟真实推进：先 `node \"<SKILL_BASE>/tools/task/task-drill.mjs\" --list`",
    "- 再执行 `node \"<SKILL_BASE>/tools/task/task-drill.mjs\" <scenario-id> <task-id>`",
    "- drill 生成后按普通 task-local 一样续跑"
  ].join("\n");
}

function renderPromptDefaultFlow() {
  return [
    "1. 必读 `SKILL.md`；`reverse-bootstrap / reverse-workflow / case-safety-policy` 为强烈建议首读",
    `2. 新任务走 \`${NEW_TASK_CHAIN_TEXT}\`；续跑任务走 \`task.json -> route-state.json -> task-sync -> task-advance\``,
    "3. `task-input` 按 schema 强校验；`task-sync` 前锁定契约五字段 `target / objective / deliverableTier / completionCriteria / boundaries`，并先裁定 `architecture / wow64 / managed / protectionTier`",
    "4. 先列 `entrypoints`，再做最小 probe",
    "5. 命中 `mixed-mode / ipc / exception / memory` 时先补读对应 playbook",
    "6. 过程零落盘义务：唯一强制文档产物 = `report.md`（收口时按骨架章节一次性写全任务总结）；若 `execution.status=ready-to-continue`，继续执行 `nextExecutableAction`；正式收口前先 `task-close --dry-run`"
  ].join("\n");
}

// O3：task.phase 词表由 common.mjs 的 phaseOrder + phaseAliases 双源常量生成，
// 注入 SKILL.md（always-loaded）与 docs/guides/task-lifecycle.md（编号列表旁）。
// 四要素：合法值 / 别名映射 / 非法值声明（含 Init/Sync/Advance/Close 四叙事步骤）/ A-D 门控对应。
function renderPhaseVocabulary() {
  return [
    "本段由 `tools/task/common.mjs` 的 `phaseOrder` 与 `phaseAliases` 单源生成（sync-doc-facts 注入，勿手改）。",
    "",
    "合法 `task.phase` 值（" + phaseOrder.length + " 个，机器门禁只认这些）：",
    ...phaseOrder.map((phase) => "- `" + phase + "`"),
    "",
    "别名映射（写入时会被 normalizePhaseName 静默归一化，未知值原样保留并视为非法）：",
    ...phaseAliases.map(([alias, phase]) => "- `" + alias + "` → `" + phase + "`"),
    "",
    "非法值声明：`RouteSync` / `Init` / `Sync` / `Advance` / `Close` / `Verify` / `Plan` / `Implement` 不是合法 `task.phase` 值——`Init`/`Sync`/`Advance`/`Close` 是叙事步骤（工具命令），`Verify`/`Plan`/`Implement` 是活动名；验证活动发生在 `Patch` / `Port` 阶段内部，不单独占相位。",
    "",
    "叙事 A-D 门控与机器 phase 的对应（report-only 改造：过程文档出口义务已退役，阶段语义为推进方向，验收集中在收口 report.md；与 `docs/reference/reverse-workflow.md` 映射表同源收敛）：",
    "- `RouteSync` / `Observe` / `Capture` ↔ 阶段 A（调查）：调查充分性靠自律（至少 1 条带锚点调用链），收口汇入 report.md「实现路径 / 逆向思路」节",
    "- `Rebuild` ↔ 阶段 B（规划）→ 阶段 C（实现）：实现类 tier 另需 `run/run-local.mjs`（机器门禁保留）",
    "- `Patch` / `PureExtraction` / `Port` ↔ 阶段 C（实现）：修改前备份 + backup-manifest（机器门禁保留），假设收口前全部有结论并写入 report.md「坑点与经验」节",
    "- `Close`（叙事步骤，非 phase）↔ 阶段 D（验证）：证据覆盖全部 completionCriteria，逐条判定写进 report.md「验证证据」节"
  ].join("\n");
}

// V2-3：验收词汇表由 validation.mjs 导出常量单源生成，注入 acceptance-criteria.md 与
// SKILL.md（F-O6 扩块：新增 DELIVERABLE_TIERS 五枚举渲染；tier 词表经 validation.mjs
// re-export 取自 common.mjs 单源定义，禁止第二份副本）。
function renderCriteriaVocabulary() {
  return [
    "本段由 `tools/task/validation.mjs` 的导出常量单源生成（sync-doc-facts 注入，勿手改）。",
    "",
    "命中词汇表（`completionCriteria` 与 `successCriteria` 通用，`criteriaItemHit`）：",
    ...CRITERIA_HIT_FORMS.map((form) => `- ${form}`),
    "",
    "`evidenceRefs` 合法形态（三选一，逐条核查，`criterionEvidenceRefValid`）：",
    ...EVIDENCE_REF_FORMS.map((form) => `- ${form}`),
    "",
    "`deliverableTier` 五枚举（`DELIVERABLE_TIERS`，非法值直接 error、不享受任何豁免）：",
    ...DELIVERABLE_TIERS.map((tier) => `- \`${tier}\``)
  ].join("\n");
}

function replaceGeneratedBlock(text, blockId, replacement) {
  const startMarker = `<!-- BEGIN GENERATED: ${blockId} -->`;
  const endMarker = `<!-- END GENERATED: ${blockId} -->`;
  const pattern = new RegExp(`${escapeRegex(startMarker)}[\\s\\S]*?${escapeRegex(endMarker)}`);
  if (!pattern.test(text)) {
    throw new Error(`missing generated block markers for ${blockId}`);
  }
  return text.replace(pattern, `${startMarker}\n${replacement.trimEnd()}\n${endMarker}`);
}

function renderExpectedFile(relPath, topics) {
  const fullPath = path.join(repoRoot, ...relPath.split("/"));
  let text = fs.readFileSync(fullPath, "utf8");
  for (const target of blockTargets.filter((item) => item.path === relPath)) {
    text = replaceGeneratedBlock(text, target.blockId, target.render(topics));
  }
  return text;
}

export function collectDocFactSyncFindings(topics = readTopicRegistryFromSource()) {
  const findings = [];
  const relPaths = Array.from(new Set(blockTargets.map((target) => target.path)));
  for (const relPath of relPaths) {
    const fullPath = path.join(repoRoot, ...relPath.split("/"));
    const actual = fs.readFileSync(fullPath, "utf8");
    const expected = renderExpectedFile(relPath, topics);
    if (actual !== expected) {
      findings.push(`${relPath} is out of date with topic manifests`);
    }
  }
  return findings;
}

export function syncDocFactFiles(topics = readTopicRegistryFromSource()) {
  const relPaths = Array.from(new Set(blockTargets.map((target) => target.path)));
  for (const relPath of relPaths) {
    const fullPath = path.join(repoRoot, ...relPath.split("/"));
    const next = renderExpectedFile(relPath, topics);
    if (fs.readFileSync(fullPath, "utf8") !== next) {
      fs.writeFileSync(fullPath, next, "utf8");
    }
  }
}
