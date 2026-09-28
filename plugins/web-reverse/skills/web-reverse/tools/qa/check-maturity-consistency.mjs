import { failWith } from "./common.mjs";
import { listTopicKeys, readTopicManifest } from "../topic-manifests.mjs";

const findings = [];

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

for (const key of listTopicKeys()) {
  const topic = readTopicManifest(key);
  const maturity = String(topic.maturity || "").trim();
  const prefix = `topics/${key}/topic.json`;

  if (maturity === "synthetic-e2e") {
    if (!topic.synthetic || typeof topic.synthetic !== "object") {
      findings.push(`${prefix} marked synthetic-e2e but missing synthetic section`);
    }
    if (!hasNonEmptyArray(topic.synthetic?.artifactSeeds)) {
      findings.push(`${prefix} marked synthetic-e2e but synthetic.artifactSeeds is empty`);
    }
    if (!(topic.requiredChecks || []).includes("check:synthetic-e2e")) {
      findings.push(`${prefix} marked synthetic-e2e but missing check:synthetic-e2e in requiredChecks`);
    }
    continue;
  }

  if (maturity === "closed-loop") {
    if (!hasNonEmptyArray(topic.caseFiles)) {
      findings.push(`${prefix} marked closed-loop but missing caseFiles`);
    }
    if ((topic.requiredChecks || []).includes("check:synthetic-e2e")) {
      findings.push(`${prefix} marked closed-loop but still depends on check:synthetic-e2e`);
    }
    continue;
  }

  if (maturity === "guided") {
    if (!hasNonEmptyArray(topic.caseFiles)) {
      findings.push(`${prefix} marked guided but already satisfies closed-loop prerequisites (caseFiles); promote it`);
    }
    continue;
  }

  findings.push(`${prefix} has unknown maturity "${maturity}"`);
}

failWith(findings, "check-maturity-consistency");
