import fs from 'node:fs';
import path from 'node:path';
import { failWith, repoRoot } from './common.mjs';
import { readTopicRegistry } from '../topic-registry.mjs';

const findings = [];
for (const topic of readTopicRegistry()) {
  for (const [kind, files] of [['protocol', topic.protocol ? [topic.protocol] : []], ['case', topic.caseFiles || []], ['reference', topic.references || []]]) {
    for (const file of files) {
      const target = path.resolve(repoRoot, file);
      if (!target.startsWith(repoRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        findings.push(`${topic.key} ${kind} is missing or outside repository: ${file}`);
      }
    }
  }
}
failWith(findings, 'check-topic-manifests');
