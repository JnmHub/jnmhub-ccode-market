import { exists, failWith, readText } from "./common.mjs";

const findings = [];
const reportTemplate = readText("artifacts/tasks/_TEMPLATE/core/report.md");
for (const needle of [
  "## 任务摘要",
  "## 实现路径",
  "## 逆向思路",
  "## 任务难点",
  "## 坑点与经验",
  "## 验证证据",
  "## 专题发现",
  "## 未竟事项"
]) {
  if (!reportTemplate.includes(needle)) {
    findings.push(`report template is missing heading: ${needle}`);
  }
}

for (const file of [
  "artifacts/tasks/_TEMPLATE/core/run/verify-once.mjs"
]) {
  if (!exists(file)) {
    findings.push(`missing core deliverable scaffold: ${file}`);
  }
}

// report-only 改造：closeout.mjs / print-fixtures.mjs / fixtures.json / infeasible-analysis.md
// 与专题 notes 模板已退役；这些文件不得复活。
for (const retired of [
  "artifacts/tasks/_TEMPLATE/core/run/closeout.mjs",
  "artifacts/tasks/_TEMPLATE/core/run/fixtures.json",
  "artifacts/tasks/_TEMPLATE/core/run/infeasible-analysis.md",
  "artifacts/tasks/_TEMPLATE/core/run/investigation.md",
  "artifacts/tasks/_TEMPLATE/core/run/plan.md",
  "artifacts/tasks/_TEMPLATE/core/run/assumptions.md"
]) {
  if (exists(retired)) {
    findings.push(`retired scaffold resurrected: ${retired}`);
  }
}

failWith(findings, "check-deliverables");

