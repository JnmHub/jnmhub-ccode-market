import { failWith, readText } from "./common.mjs";

const findings = [];

function requireIncludes(relPath, needles) {
  const text = readText(relPath);
  for (const needle of needles) {
    if (!text.includes(needle)) {
      findings.push(`${relPath} is missing required text: ${needle}`);
    }
  }
}

requireIncludes("docs/reference/output-contract.md", [
  "历史线索与外部参考",
  "是否影响路线",
  "影响了哪条路线"
]);

requireIncludes("scripts/cases/README.md", [
  "`route-state.json` 是恢复真源，Markdown 只用于补充查看",
  "case 只负责提供抽象 workflow，不替代 task-local 当前状态"
]);

requireIncludes("tools/qa/check-task-behavior.mjs", [
  "scenarioCompletionCriteriaRequiresEvidenceRefs",
  "scenarioRiskActionAutoPause",
  "scenarioDrillListBypassesWorkspaceGuard"
]);

failWith(findings, "check-operating-contracts");

