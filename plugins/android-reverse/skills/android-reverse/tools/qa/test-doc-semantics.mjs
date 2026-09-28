import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Targeted editorial regressions, not a model behavior benchmark or task gate.
const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

for (const [file, pattern, label] of [
  ['references/trace-analysis-playbook.md', /deobfuscation-before-hook/, 'retired technical prerequisite'],
  ['references/topic-playbook-index.md', /SKILL\.md 内联/, 'obsolete inline navigation label'],
  ['docs/reference/glossary.md', /权威执行状态文档|通过读取 task\.json 恢复|锁定在 task\.json/, 'historical state described as current authority'],
  ['docs/reference/android-reverse-bootstrap.md', /再按其中顺序/, 'fixed reading order in bridge'],
  ['docs/reference/pure-extraction.md', /删除临时 hook、旁路日志/, 'ambiguous evidence deletion'],
  ['docs/reference/pure-extraction.md', /满足以下全部条件|至少 2 个不同输入|连续 3 次无偏差/, 'fixed-count entry gate'],
  ['PROMPTS.md', /先读：\r?\n\s*1\./, 'fixed first-read list in prompt template']
]) {
  test(`editorial regression: retired wording present: ${label}`, () => {
    assert.equal(pattern.test(read(file)), false, `${file}: ${label}`);
  });
}

test('anti-root does not require the removed SKILL section', () => {
  assert.equal(/SKILL\.md\s*保护绕过专项要求/.test(read('references/anti-root-playbook.md')), false,
    'anti-root still requires a SKILL section removed by report-only migration');
});
