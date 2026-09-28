import { exists, failWith } from "./common.mjs";

const findings = [];
for (const file of [
  "SKILL.md",
  "README.md",
  "package.json",
  "agents/openai.yaml",
  "agents/orchestrator.md",
  "agents/reverse-worker.md",
  "agents/auditor.md",
  "docs/reference/reverse-bootstrap.md",
  "docs/reference/reverse-workflow.md",
  "docs/reference/multi-agent-orchestration.md",
  "docs/reference/output-contract.md",
  "references/task-input-template.md",
  "references/schemas/win-reverse-task-input.schema.json",
  "references/mcp-task-template.md",
  "artifacts/tasks/_TEMPLATE/core/task.json",
  "tools/task/task-input-schema.mjs",
  "tools/task/task-init.mjs",
  "tools/task/task-sync.mjs",
  "tools/task/task-advance.mjs",
  "tools/task/task-close.mjs",
  "tools/task/task-dispatch.mjs",
  "tools/task/lib/ledger.mjs",
  "tools/task/lib/collaboration.mjs",
  "tools/topic-manifests.mjs",
  "tools/topic-registry.mjs",
  "tools/verify/enum-windows.ps1",
  "tools/qa/check-doc-facts.mjs",
  "tools/qa/check-task-behavior.mjs"
]) {
  if (!exists(file)) {
    findings.push(`missing framework file: ${file}`);
  }
}

failWith(findings, "check-framework-layout");

