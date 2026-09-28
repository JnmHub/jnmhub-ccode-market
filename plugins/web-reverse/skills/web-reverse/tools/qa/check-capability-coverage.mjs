import { exists, failWith, readText } from "./common.mjs";
import { readTopicRegistry, topicHasMaturity } from "./topic-registry.mjs";

const findings = [];
const registry = readTopicRegistry();
const outputContract = readText("docs/reference/output-contract.md");
// report-only 契约：closeout 断言对 output-contract 的必填交付节生效。
const generalCloseoutNeedles = [
  "交付物与复现",
  "复现命令"
];

for (const topic of registry) {
  const missing = [];

  const checks = [
    ["protocol", exists(topic.protocol)],
    ["owner", Boolean(String(topic.owner || "").trim())],
    ["risk-level", Boolean(String(topic.riskLevel || "").trim())],
    ["required-checks", Array.isArray(topic.requiredChecks) && topic.requiredChecks.length > 0],
    ["required-signals", Array.isArray(topic.requiredSignals) && topic.requiredSignals.length > 0],
    ["case", (topic.caseFiles || []).every((file) => exists(file))],
    [
      "qa",
      (topic.qaFiles || []).every(
        ({ path, needles }) => exists(path) && (needles || []).every((needle) => readText(path).includes(needle))
      )
    ],
    ["closeout-evidence", generalCloseoutNeedles.every((needle) => outputContract.includes(needle))]
  ];

  if (topicHasMaturity(topic, "synthetic-e2e")) {
    checks.push([
      "validation-path",
      Boolean(topic.synthetic?.id) &&
        exists("tools/qa/check-synthetic-e2e.mjs")
    ]);
  }

  for (const [name, passed] of checks) {
    if (!passed) {
      missing.push(name);
    }
  }

  const coverageScore = Math.round(((checks.length - missing.length) / checks.length) * 100);
  console.log(`[${topic.key}] capability-coverage=${coverageScore}/100`);
  if (missing.length > 0) {
    console.log(` missing: ${missing.join(", ")}`);
    findings.push(`${topic.key} capability closure is incomplete: ${missing.join(", ")}`);
  }
}

failWith(findings, "check-capability-coverage");