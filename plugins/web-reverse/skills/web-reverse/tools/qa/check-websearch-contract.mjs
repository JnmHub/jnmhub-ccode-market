import { failWith, exists, readText } from "./common.mjs";

const findings = [];

for (const file of [
  "references/websearch-escalation-playbook.md",
  "references/web-search-tool.md",
  "docs/reference/search-decision-policy.md"
]) {
  if (!exists(file)) {
    findings.push(`missing websearch/evidence reference: ${file}`);
  }
}

const prompts = readText("PROMPTS.md");
if (!/外部搜索纠偏/.test(prompts)) {
  findings.push("PROMPTS.md missing 外部搜索纠偏 section");
}

// report-only 契约：搜索结论进 report.md「经验沉淀」节，不再要求过程落盘文件。
const outputContract = readText("docs/reference/output-contract.md");
if (!/经验沉淀/.test(outputContract) || !/query \+ URL/.test(outputContract)) {
  findings.push("output-contract missing search-conclusion guidance (经验沉淀 + query + URL)");
}

const searchTool = readText("references/web-search-tool.md");
if (!/report\.md/.test(searchTool)) {
  findings.push("web-search-tool.md must route search conclusions into report.md");
}

failWith(findings, "check-websearch-contract");
