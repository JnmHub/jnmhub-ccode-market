import { exists, failWith, readText } from "./common.mjs";
import { collectDocFactSyncFindings } from "../docs/fact-sync.mjs";

const findings = [];
const raw = readText("SKILL.md");
const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

function parseSimpleFrontmatter(block) {
  const values = new Map();
  for (const line of String(block || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`cannot parse frontmatter line: ${trimmed}`);
    }
    values.set(match[1], match[2]);
  }
  return values;
}

if (!frontmatterMatch) {
  findings.push("SKILL.md is missing YAML frontmatter");
} else {
  let values = new Map();
  try {
    values = parseSimpleFrontmatter(frontmatterMatch[1]);
  } catch (error) {
    findings.push(`failed to parse SKILL.md frontmatter: ${error.message}`);
  }

  const allowedKeys = new Set(["name", "description"]);
  for (const key of values.keys()) {
    if (!allowedKeys.has(key)) {
      findings.push(`SKILL.md frontmatter may only contain name/description, found: ${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (!values.has(key)) {
      findings.push(`SKILL.md frontmatter is missing: ${key}`);
    }
  }

  const skillName = String(values.get("name") || "");
  const description = String(values.get("description") || "");
  if (skillName && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) {
    findings.push(`SKILL.md name must be kebab-case, got: ${skillName}`);
  }
  if (description.length > 260) {
    findings.push(`SKILL.md description is too long: ${description.length}`);
  }
  for (const needle of ["普通前端开发", "漏洞利用", "Android 逆向"]) {
    if (description && !description.includes(needle)) {
      findings.push(`SKILL.md description is missing boundary text: ${needle}`);
    }
  }
}

for (const marker of [
  "<!-- BEGIN GENERATED: topic-maturity-summary -->",
  "<!-- END GENERATED: topic-maturity-summary -->"
]) {
  if (!raw.includes(marker)) {
    findings.push(`SKILL.md is missing generated maturity marker: ${marker}`);
  }
}

for (const finding of collectDocFactSyncFindings()) {
  if (finding.startsWith("SKILL.md ")) {
    findings.push(`SKILL.md generated maturity summary is out of date: ${finding}`);
  }
}

// ── report-only 契约轻量断言 ──
// 两条红线 + 收尾契约必须存在；已退役机制工具不得再出现在 SKILL.md 正文。
if (!/task-init\.mjs/.test(raw)) {
  findings.push("SKILL.md must reference the single boot command task-init.mjs (red line 1)");
}
if (!raw.includes("## 两条红线")) {
  findings.push("SKILL.md is missing the two red lines section (## 两条红线)");
}
if (!raw.includes("## 收尾契约")) {
  findings.push("SKILL.md is missing the closing contract section (## 收尾契约)");
}
for (const section of ["任务目标与结果", "实现路径", "逆向思路", "难点与坑点", "经验沉淀", "交付物与复现"]) {
  if (!raw.includes(section)) {
    findings.push(`SKILL.md closing contract is missing required section: ${section}`);
  }
}
for (const retired of [
  "task-note",
  "task-snapshot",
  "task-advance",
  "task-dispatch",
  "task-close",
  "task-sync",
  "task-boot",
  "assert-can-reply",
  "route-state",
  "clues.md",
  "narrative.md",
  "三角色",
  "claimLevel 升级"
]) {
  if (raw.includes(retired)) {
    findings.push(`SKILL.md still references retired machinery: ${retired}`);
  }
}

if (exists("tools/build") || exists("dist/publishable-skill")) {
  findings.push("user delivery repo must not keep tools/build or dist/publishable-skill");
}

failWith(findings, "check-skill-contract");
