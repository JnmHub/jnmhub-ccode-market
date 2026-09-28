import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDocFactSyncFindings, NEW_TASK_CHAIN_TEXT } from "../docs/fact-sync.mjs";
import { CONTRACT_FIELD_HINTS } from "../task/route-state.mjs";
import { DELIVERABLE_TIERS } from "../task/validation.mjs";
import { failWith, repoRoot } from "./common.mjs";

function readDoc(relPath) {
  return fs.readFileSync(path.join(repoRoot, ...relPath.split("/")), "utf8");
}

// V2-2 契约五字段单源断言：字段集从 route-state.mjs 的 CONTRACT_FIELD_HINTS 读取，
// 文档必须含全部五字段，且不得把 disallowedFallbacks 列为必须锁定（已降级为推荐记录）。
function collectContractFieldFindings() {
  const findings = [];
  const fieldNames = Object.keys(CONTRACT_FIELD_HINTS);
  for (const relPath of ["SKILL.md", "docs/reference/reverse-bootstrap.md"]) {
    const text = readDoc(relPath);
    for (const name of fieldNames) {
      if (!text.includes(name)) {
        findings.push(`${relPath} 缺少契约字段 ${name}（单源：CONTRACT_FIELD_HINTS）`);
      }
    }
    for (const line of text.split("\n")) {
      if (line.includes("disallowedFallbacks") && !line.includes("无机器校验")) {
        findings.push(`${relPath} 仍将 disallowedFallbacks 描述为锁定字段且未注明无机器校验: ${line.trim()}`);
      }
    }
  }
  return findings;
}

// V2-3 验收总表锚点断言：acceptance-criteria.md 必须含固定机制锚点词表。
// V3-3/V3-4/V3-6 增补：tier 五枚举 / 全摘 error / 累进路径未闭合声明 / manifest 诚实注记。
function collectAcceptanceDocFindings() {
  const findings = [];
  const relPath = "docs/reference/acceptance-criteria.md";
  const text = readDoc(relPath);
  for (const anchor of [
    "successCriteria",
    "RETRO-",
    "closeoutMode",
    "evidenceRefs",
    "pure-",
    "backup-manifest",
    "hook-script",
    "不享受任何豁免",
    "excludedTopics 摘除了全部已分流 topic",
    "约束未完全闭合",
    "sha256 列仅留痕用途",
    "JSON.parse 自检",
    "run/validation-last.json"
  ]) {
    if (!text.includes(anchor)) {
      findings.push(`${relPath} 缺少机制锚点 ${anchor}`);
    }
  }
  return findings;
}

// V2-6 命令形式断言：`npm run task:` 出现处必须同行注明「仓库根目录」限制；
// 未加引号的 `node <SKILL_BASE>` 形态零命中（SKILL_BASE 含空格必炸，C14）。
function listDocFiles() {
  const rootDocs = ["SKILL.md", "README.md", "PROMPTS.md"].filter((relPath) =>
    fs.existsSync(path.join(repoRoot, relPath))
  );
  const docsRoot = path.join(repoRoot, "docs");
  const walk = (dirPath, baseDir = dirPath) => {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const results = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...walk(fullPath, baseDir));
      } else if (entry.name.endsWith(".md")) {
        results.push(path.relative(baseDir, fullPath).replaceAll("\\", "/"));
      }
    }
    return results;
  };
  return [...rootDocs, ...walk(docsRoot, repoRoot)];
}

function collectCommandFormFindings() {
  const findings = [];
  for (const relPath of listDocFiles()) {
    const text = readDoc(relPath);
    for (const line of text.split("\n")) {
      if (line.includes("npm run task:") && !line.includes("仓库根目录")) {
        findings.push(`${relPath} 的 npm run task: 形式未同行注明仓库根目录限制: ${line.trim()}`);
      }
      if (/node <SKILL_BASE>/.test(line)) {
        findings.push(`${relPath} 存在未加引号的 node <SKILL_BASE> 命令形态: ${line.trim()}`);
      }
    }
  }
  return findings;
}

// V3-1 重工具调用判级纪律锚点断言：只锚 SKILL.md（always-loaded 面），
// 三分法判级关键词与降级阶梯接口名（含兜底级 r2 CLI）必须全部在场。
// fallbacks.md 不锚（投放面结论：注定不被读，锚了也只是文字存在）。
function collectHeavyToolJudgmentFindings() {
  const findings = [];
  const relPath = "SKILL.md";
  const text = readDoc(relPath);
  for (const anchor of [
    "重工具调用判级纪律",
    "长静默",
    "有毒",
    "permission denied",
    "禁止原参数重发",
    "降级阶梯",
    "decompile_function",
    "disassemble_function",
    "hexdump",
    "r2 -qc",
    "report.md",
    "完成时报告义务",
    "只读探活",
    "2×"
  ]) {
    if (!text.includes(anchor)) {
      findings.push(`${relPath} 缺少重工具判级锚点 ${anchor}`);
    }
  }
  return findings;
}

// O2 报错自描述断言：validation.mjs 每条 errors.push(<字符串字面量>) 的文案必须含
// `fix:` 或 `合法`（合法值清单 / 形态示例 / fix: 动作三选一，约定见 validation.mjs 头部注释）。
// 提取方式：定位 "errors.push(" 后做括号配对扫描（容忍字符串内的括号与转义），
// 只检查首参数为字符串/模板字面量的调用；展开式推送（errors.push(...expr)）不在文案面内。
function extractErrorsPushStatements(source) {
  const statements = [];
  let cursor = 0;
  for (;;) {
    const start = source.indexOf("errors.push(", cursor);
    if (start === -1) {
      break;
    }
    let depth = 0;
    let quote = "";
    let escaped = false;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = "";
        }
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end === -1) {
      break;
    }
    statements.push(source.slice(start, end + 1));
    cursor = end + 1;
  }
  return statements;
}

function collectValidationErrorSelfDescriptionFindings() {
  const findings = [];
  const relPath = "tools/task/validation.mjs";
  const source = readDoc(relPath);
  for (const statement of extractErrorsPushStatements(source)) {
    const firstArg = statement.slice("errors.push(".length).trimStart();
    if (!firstArg.startsWith('"') && !firstArg.startsWith("'") && !firstArg.startsWith("`")) {
      continue;
    }
    if (!statement.includes("fix:") && !statement.includes("合法")) {
      findings.push(`${relPath} 存在缺少 fix:/合法值 说明的 errors.push: ${statement.slice(0, 120)}...`);
    }
  }
  return findings;
}

// O6(a) 开局链条一致性：SKILL.md / PROMPTS.md / reverse-bootstrap.md 三处必须逐字包含
// fact-sync.mjs 单源常量 NEW_TASK_CHAIN_TEXT（task-start（自动转发 task-init）→ ...）。
function collectBootstrapChainFindings() {
  const findings = [];
  for (const relPath of ["SKILL.md", "PROMPTS.md", "docs/reference/reverse-bootstrap.md"]) {
    if (!readDoc(relPath).includes(NEW_TASK_CHAIN_TEXT)) {
      findings.push(`${relPath} 开局链条与单源常量不一致（缺 ${NEW_TASK_CHAIN_TEXT}）`);
    }
  }
  return findings;
}

// O6(b) README 禁手写计数叙事：专题数量一律以 GENERATED topic-maturity-summary 块为准。
function collectReadmeHandCountFindings() {
  const findings = [];
  const text = readDoc("README.md");
  for (const line of text.split("\n")) {
    if (/保留\s*\d+\s*个|新增\s*\d+\s*个已提升/.test(line)) {
      findings.push(`README.md 仍存在手写专题计数叙事: ${line.trim()}`);
    }
  }
  return findings;
}

// O6(c) SKILL.md 索引覆盖：references/ 目录全量 md 必须在 SKILL.md 内可被检索到
// （专项参考列表或正文锚点均可），防止专题文档对 always-loaded 面隐身。
function collectReferenceIndexFindings() {
  const findings = [];
  const referencesDir = path.join(repoRoot, "references");
  const skillText = readDoc("SKILL.md");
  for (const name of fs.readdirSync(referencesDir)) {
    if (!name.endsWith(".md")) {
      continue;
    }
    if (!skillText.includes(name)) {
      findings.push(`SKILL.md 未索引 references/${name}`);
    }
  }
  return findings;
}

// R3-O8：tier 词表双源漂移侦测（C-4 生成式单源化重构前的本轮保守兜底，纯 QA 面、
// 零运行时行为变化）。tier 词表唯一单源是 common.mjs DELIVERABLE_TIERS（经
// validation.mjs re-export 取词表，禁止第二份副本）：
// ① task-input schema 的 deliverableTier enum 数组与 DELIVERABLE_TIERS 逐元素相等；
// ② references/phase-gated-workflow.md 的散文词表行含 join(" / ") 全文。
// 完整单源化（schema 枚举由常量生成）留候选 C-4——下一个触碰 task-input schema 或
// validation 词表面的轮次必须顺手完成。
function collectTierVocabularyDriftFindings() {
  const findings = [];
  const schema = JSON.parse(readDoc("references/schemas/win-reverse-task-input.schema.json"));
  const schemaEnum = schema?.properties?.requirements?.anyOf?.[1]?.properties?.deliverableTier?.enum;
  if (!Array.isArray(schemaEnum)) {
    findings.push("references/schemas/win-reverse-task-input.schema.json 未找到 deliverableTier enum 数组（结构漂移）");
  } else if (JSON.stringify(schemaEnum) !== JSON.stringify(DELIVERABLE_TIERS)) {
    findings.push(
      `references/schemas/win-reverse-task-input.schema.json 的 deliverableTier enum 与 DELIVERABLE_TIERS 漂移: ` +
      `schema=${JSON.stringify(schemaEnum)} vs 单源=${JSON.stringify(DELIVERABLE_TIERS)}`
    );
  }
  const tierVocabularyLine = DELIVERABLE_TIERS.join(" / ");
  if (!readDoc("references/phase-gated-workflow.md").includes(tierVocabularyLine)) {
    findings.push(`references/phase-gated-workflow.md 缺少 tier 词表行内容: ${tierVocabularyLine}`);
  }
  return findings;
}

const findings = [
  ...collectDocFactSyncFindings(),
  ...collectContractFieldFindings(),
  ...collectAcceptanceDocFindings(),
  ...collectHeavyToolJudgmentFindings(),
  ...collectCommandFormFindings(),
  ...collectValidationErrorSelfDescriptionFindings(),
  ...collectBootstrapChainFindings(),
  ...collectReadmeHandCountFindings(),
  ...collectReferenceIndexFindings(),
  ...collectTierVocabularyDriftFindings()
];
failWith(findings, "check-doc-facts");
