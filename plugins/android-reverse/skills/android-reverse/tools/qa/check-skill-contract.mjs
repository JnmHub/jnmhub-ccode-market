import path from 'node:path';
import { exists, failWith, readText, repoRoot } from './common.mjs';

const findings = [];
const raw = readText('SKILL.md');
const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!front) findings.push('SKILL.md missing frontmatter');
else {
  if (!/^name:\s*android-reverse\s*$/m.test(front[1])) findings.push('SKILL.md incorrect skill identity');
  if (!/^description:\s*\S.+/m.test(front[1])) findings.push('SKILL.md missing description');
}
const agent = readText('agents/openai.yaml');
for (const key of ['display_name', 'short_description', 'default_prompt']) {
  if (!new RegExp(`^  ${key}:\\s*["']?\\S.+`, 'm').test(agent)) findings.push(`agents/openai.yaml missing ${key}`);
}
// Validate actual navigation, not task output paths, template placeholders, or historical prose.
const pending = ['SKILL.md', 'README.md', 'PROMPTS.md', 'docs/reference/reverse-bootstrap.md', 'docs/reference/reverse-workflow.md', 'docs/reference/output-contract.md'];
const seen = new Set();
while (pending.length) {
  const file = pending.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const text = readText(file);
  if (text.includes('<!-- retired-reference -->')) continue;
  const refs = [...text.matchAll(/`((?:docs|references|tools|scripts|topics|agents)\/[^`\n<>]+?\.(?:md|json|mjs|js|yaml|yml|py))`/g)].map(m => m[1]);
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const link = match[1].split('#')[0];
    if (!link || /^(?:[a-z]+:|\/)/i.test(link) || /[<>*{}]/.test(link)) continue;
    refs.push(path.relative(repoRoot, path.resolve(repoRoot, path.dirname(file), link)).replaceAll('\\', '/'));
  }
  for (const ref of refs) {
    if (/[<>*{}]/.test(ref)) continue;
    if (!exists(ref)) findings.push(`${file} references missing file: ${ref}`);
    else if (ref.endsWith('.md') && !ref.startsWith('artifacts/')) pending.push(ref);
  }
}
console.log(`navigation checked: ${seen.size} documents`);
failWith(findings, 'check-skill-contract');
