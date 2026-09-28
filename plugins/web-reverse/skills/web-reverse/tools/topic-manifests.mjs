import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const topicManifestRoot = path.join(repoRoot, "topics");
export const generatedTopicRouteMatrixPath = path.join(
  repoRoot,
  "docs",
  "reference",
  "topic-route-matrix.json"
);
export const generatedCapabilityMatrixPath = path.join(
  repoRoot,
  "docs",
  "reference",
  "capability-matrix.md"
);

const maturityOrder = ["synthetic-e2e", "closed-loop", "guided", "reference-only"];
const maturityLabels = {
  "synthetic-e2e": "结构化任务模型、formal validation、专题 QA 与 synthetic 回归全部已具备。",
  "closed-loop": "结构化任务模型、formal validation 与专题 QA 已具备，但 synthetic 回归尚未发布。",
  guided: "已有 registry-backed 路由与专题指导，但闭环执行契约仍未达到 closed-loop。",
  "reference-only": "已有参考资料，但尚无 registry-backed 的执行契约。"
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function uniqStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeTopic(topic) {
  return {
    ...topic,
    requiredSignals: uniqStrings([...(topic?.requiredSignals || []), ...(topic?.signals || [])])
  };
}

export function listTopicKeys() {
  if (!fs.existsSync(topicManifestRoot)) {
    return [];
  }

  return fs
    .readdirSync(topicManifestRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function readTopicManifest(key) {
  return readJson(path.join(topicManifestRoot, key, "topic.json"));
}

export function readTopicRegistryFromSource() {
  return listTopicKeys().map((key) => normalizeTopic(readTopicManifest(key)));
}

function compareTopics(left, right) {
  const maturityDelta = maturityOrder.indexOf(String(left?.maturity || "")) - maturityOrder.indexOf(String(right?.maturity || ""));
  if (maturityDelta !== 0) {
    return maturityDelta;
  }
  return String(left?.key || "").localeCompare(String(right?.key || ""));
}

function sortTopics(topics) {
  return [...topics].sort(compareTopics);
}

function countTopicsByMaturity(topics) {
  const counts = Object.fromEntries(maturityOrder.map((level) => [level, 0]));
  for (const topic of topics) {
    const level = String(topic?.maturity || "").trim();
    if (!Object.hasOwn(counts, level)) {
      counts[level] = 0;
    }
    counts[level] += 1;
  }
  return counts;
}

function formatNames(topics) {
  return topics.length === 0 ? "none" : topics.map((topic) => `\`${topic.key}\``).join(", ");
}

function formatList(values = []) {
  return values.length === 0 ? "none" : values.map((value) => `\`${value}\``).join(", ");
}

function formatPathList(values = []) {
  return values.length === 0 ? "none" : values.map((value) => `\`${path.basename(value)}\``).join(", ");
}

function renderTopicTable(topics) {
  const lines = [
    "| Topic | Maturity | Owner | Risk | Route | Required Checks |",
    "|---|---|---|---|---|---|"
  ];

  for (const topic of sortTopics(topics)) {
    lines.push(
      `| \`${topic.key}\` | \`${topic.maturity}\` | \`${topic.owner}\` | \`${topic.riskLevel}\` | \`${topic.routeTrack}\` | ${formatList(topic.requiredChecks || [])} |`
    );
  }

  return lines.join("\n");
}

export function renderTopicRouteMatrix(topics = readTopicRegistryFromSource(), generatedAt = new Date().toISOString()) {
  return `${JSON.stringify(
    {
      schemaVersion: 2,
      generatedAt,
      source: "topics/*/topic.json",
      topics: sortTopics(topics)
    },
    null,
    2
  )}\n`;
}

export function renderCapabilityMatrix(topics = readTopicRegistryFromSource()) {
  const counts = countTopicsByMaturity(topics);
  const lines = [
    "<!-- publish: framework -->",
    "# Capability Matrix",
    "",
    "The canonical topic source now lives under `topics/<topic>/topic.json`.",
    "`docs/reference/topic-route-matrix.json` is a generated registry view for QA, publish, and review.",
    "Maturity semantics and promotion rules are documented in `docs/reference/maturity-model.md`.",
    "",
    "## Maturity Summary",
    "",
    ...maturityOrder.map((level) => `- \`${level}\`: \`${counts[level] || 0}\` 个专题；${maturityLabels[level]}`),
    "",
    "## Topic Table",
    "",
    renderTopicTable(topics),
    "",
    "## Topic Detail",
    ""
  ];

  for (const topic of sortTopics(topics)) {
    lines.push(`### \`${topic.key}\``);
    lines.push("");
    lines.push(`- 名称: ${topic.label}`);
    lines.push(`- 成熟度: \`${topic.maturity}\``);
    lines.push(`- 维护方: \`${topic.owner}\``);
    lines.push(`- 风险等级: \`${topic.riskLevel}\``);
    lines.push(`- 路线轨道: \`${topic.routeTrack}\``);
    lines.push(`- 协议文档: \`${topic.protocol}\``);
    lines.push(`- 必需 signals: ${formatList(topic.requiredSignals || [])}`);
    lines.push(`- 必需检查: ${formatList(topic.requiredChecks || [])}`);
    lines.push(`- caseFiles: ${formatPathList(topic.caseFiles || [])}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeGeneratedTopicDocs() {
  const topics = readTopicRegistryFromSource();
  const generatedAt = new Date().toISOString();
  writeText(generatedTopicRouteMatrixPath, renderTopicRouteMatrix(topics, generatedAt));
  writeText(generatedCapabilityMatrixPath, renderCapabilityMatrix(topics));
}
