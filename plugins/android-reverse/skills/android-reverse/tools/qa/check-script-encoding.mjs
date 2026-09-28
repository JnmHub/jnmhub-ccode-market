// check-script-encoding.mjs — Windows 执行面静态约束（规则事实源：references/windows-command-safety.md）
// 1) scripts/**/*.ps1 必须带 UTF-8 BOM（PS 5.1 将无 BOM 脚本按 ANSI/GBK 解析，中文必乱码）；
//    含非 ASCII 时必须存在 [Console]::OutputEncoding 归一行（管道输出编码 GBK -> UTF-8）。
// 2) scripts/**/*.sh 必须无 BOM 且 LF（CRLF 在 Git Bash 下报 $'\r': command not found）。
// 3) 根目录/commands/docs/references 的 Markdown 代码块：禁止 powershell/pwsh -Command 内联；
//    powershell/pwsh 调用必须带 -File。散文中的反例（表格外）不在拦截范围。
import fs from "node:fs";
import path from "node:path";
import { failWith, repoRoot } from "./common.mjs";

const findings = [];
const ps1Files = [];
const shFiles = [];

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

// 1. PowerShell scripts: BOM + encoding normalization
ps1Files.push(...walk(path.join(repoRoot, "scripts"), ".ps1"));
for (const abs of ps1Files) {
  const relPath = path.relative(repoRoot, abs).replaceAll("\\", "/");
  const bytes = fs.readFileSync(abs);
  if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    findings.push(`${relPath}: missing UTF-8 BOM (Windows PowerShell 5.1 parses BOM-less scripts as ANSI/GBK)`);
  }
  const text = bytes.toString("utf8");
  if (/[^\x00-\x7F]/.test(text) && !text.includes("[Console]::OutputEncoding")) {
    findings.push(`${relPath}: non-ASCII content without [Console]::OutputEncoding normalization`);
  }
}

// 2. Bash scripts: no BOM, LF only
shFiles.push(...walk(path.join(repoRoot, "scripts"), ".sh"));
for (const abs of shFiles) {
  const relPath = path.relative(repoRoot, abs).replaceAll("\\", "/");
  const bytes = fs.readFileSync(abs);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    findings.push(`${relPath}: must not start with a UTF-8 BOM`);
  }
  if (bytes.includes(0x0d)) {
    findings.push(`${relPath}: CRLF line endings found (Git Bash fails with $'\\r': command not found)`);
  }
}

// 3. Markdown fenced blocks: no inline -Command; PowerShell invocations must use -File
const mdRoots = ["commands", "docs", "references"].map((d) => path.join(repoRoot, d));
const mdFiles = [
  ...walk(path.join(repoRoot), ".md").filter((f) => path.dirname(f) === repoRoot),
  ...mdRoots.flatMap((root) => walk(root, ".md"))
];
const inlineRe = /\b(?:powershell|pwsh)(?:\.exe)?\s+(?:-{1,2}[A-Za-z][\w-]*\s+)*-{1,2}(?:command|c)\b/i;
const invokeRe = /(?:^|[#>&|(]\s*|\band\b |\bor\b )(?:powershell|pwsh)(?:\.exe)?\s+-/i;
for (const abs of mdFiles) {
  const relPath = path.relative(repoRoot, abs).replaceAll("\\", "/");
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    if (inlineRe.test(line)) {
      findings.push(`${relPath}: inline PowerShell execution forbidden, use -File (see references/windows-command-safety.md): ${line.trim()}`);
    } else if (invokeRe.test(line) && !/-File\b/i.test(line)) {
      findings.push(`${relPath}: powershell/pwsh invocation without -File: ${line.trim()}`);
    }
  }
}

console.log(`checked: ${ps1Files.length} ps1, ${shFiles.length} sh, ${mdFiles.length} markdown`);
failWith(findings, "check-script-encoding");
