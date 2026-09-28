import path from "node:path";
import { exists, failWith, readJson } from "./common.mjs";
import { readTopicRegistry } from "../topic-registry.mjs";

const findings = [];
for (const topic of readTopicRegistry()) {
  const referenceOnly = topic.maturity === "reference-only";
  if (!exists(topic.protocol)) {
    findings.push(`${topic.key} protocol is missing: ${topic.protocol}`);
  }
  if (referenceOnly) {
    if (!Array.isArray(topic.signals) || topic.signals.length === 0) {
      findings.push(`${topic.key} reference-only topic must declare signals`);
    }
    continue;
  }
  if (!exists(topic.taskModelFile)) {
    findings.push(`${topic.key} taskModelFile is missing: ${topic.taskModelFile}`);
  }
  for (const file of topic.caseFiles || []) {
    if (!exists(file)) {
      findings.push(`${topic.key} case file is missing: ${file}`);
    }
  }
  for (const file of topic.templateArtifacts || []) {
    if (!exists(file)) {
      findings.push(`${topic.key} template artifact is missing: ${file}`);
    }
  }
  const extension = readJson(topic.taskModelFile);
  const rootKey = Object.keys(extension)[0];
  if (!rootKey || extension[rootKey]?.present !== true) {
    findings.push(`${topic.key} extension must default present=true`);
  }
}

failWith(findings, "check-topic-manifests");
