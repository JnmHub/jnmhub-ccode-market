import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { containsSuspiciousSecrets, failWith, readText, repoRoot } from './common.mjs';
import { readTopicRegistry } from '../topic-registry.mjs';

const findings = [];
const files = new Set(['scripts/cases/abstract-case-template.mjs', ...readTopicRegistry().flatMap(topic => topic.caseFiles || [])]);
for (const file of files) {
  const target = path.resolve(repoRoot, file);
  console.log(`static case: ${file}`);
  if (!target.startsWith(repoRoot + path.sep)) { findings.push(`${file}: outside repository`); continue; }
  try {
    if (containsSuspiciousSecrets(readText(file))) findings.push(`${file}: suspicious credential literal (heuristic; inspect manually)`);
    const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
    if (result.error || result.status !== 0) findings.push(`${file}: syntax check failed: ${result.error?.message || result.stderr}`);
  } catch (error) { findings.push(`${file}: ${error.message}`); }
}
// Syntax and credential heuristics only: no import, execution, or semantic scoring of cases.
failWith(findings, 'lint-cases');
