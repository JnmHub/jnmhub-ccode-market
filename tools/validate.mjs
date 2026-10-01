#!/usr/bin/env node
/**
 * 市场仓自检：把「CCode 会怎么看这个市场」这件事在本地跑一遍。
 *
 * 为什么需要它：CCode 侧的问题大多是**静默**的 —— 重名的技能被丢掉只留一条诊断、
 * 相对路径的 icon 被忽略、没有 plugin.json 的目录根本不算插件。这些都不会让市场报错，
 * 只会让某个插件"看起来装了却没用"。等到正式用才发现，代价高得多。
 *
 * 检查项：
 *   1. marketplace.json 可解析，条目字段齐全、命名合规；
 *   2. 每个插件目录有 .ccode-plugin/plugin.json，且 name/version 与市场条目一致；
 *   3. 图标文件存在，且 icon 是 https:// URL（CCode 只信任 https，其它静默忽略）；
 *   4. 按 CCode 的规则扫描技能（每个声明根只扫一层、同名去重），
 *      **跨整个市场**检查技能名重复 —— 这是最容易漏、后果最明显的一类问题；
 *   5. 命令名合规（^[a-z0-9][a-z0-9._:-]*$）、frontmatter 有 description。
 *
 * 用法：node tools/validate.mjs
 * 退出码非 0 表示存在必须处理的问题。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PLUGIN_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const COMMAND_NAME_RE = /^[a-z0-9][a-z0-9._:-]*$/;
const RESERVED_MARKET_IDS = new Set(["zcode-plugins-official"]);
const EXCLUDED_DIR_NAMES = new Set([
  "node_modules", "dist", "build", "out", "target", "vendor", "coverage",
  ".cache", ".next", ".turbo", ".venv", "__pycache__",
]);

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

/** 读 frontmatter 的某个标量键；剥 BOM（CCode 的解析器会剥，这里必须一致）。 */
function readFrontmatter(file, key) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  text = text.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end <= 0) return null;
  for (const line of lines.slice(1, end)) {
    if (/^\s/.test(line)) continue;                 // 块标量内容
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    if (line.slice(0, sep).trim() !== key) continue;
    return line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** 复刻 CCode 的技能扫描：根自身 SKILL.md + 一层子目录，跳过隐藏与排除目录。 */
function scanSkillFiles(rootDir) {
  if (!existsSync(rootDir)) return [];
  const out = [];
  const own = join(rootDir, "SKILL.md");
  if (existsSync(own) && statSync(own).isFile()) out.push(own);
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const cand = join(rootDir, entry.name, "SKILL.md");
    if (existsSync(cand) && statSync(cand).isFile()) out.push(cand);
  }
  return out;
}

const catalogPath = join(repoRoot, "marketplace.json");
if (!existsSync(catalogPath)) {
  console.error("FATAL 找不到 marketplace.json");
  process.exit(1);
}
let catalog;
try {
  catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
} catch (error) {
  console.error("FATAL marketplace.json 无法解析:", error.message);
  process.exit(1);
}

// ── 1. 市场身份 ──
if (!PLUGIN_NAME_RE.test(catalog.name ?? "")) fail(`市场 name 不合规: ${catalog.name}`);
if (RESERVED_MARKET_IDS.has(catalog.name)) fail(`市场 name 用了保留 id: ${catalog.name}`);

const entries = Array.isArray(catalog.plugins)
  ? catalog.plugins
  : Object.entries(catalog.plugins ?? {}).map(([name, v]) => ({ name, ...v }));
if (entries.length === 0) fail("marketplace.json 里没有插件条目");

// ── 2. 逐条目 ──
const skillNameOwners = new Map();   // 技能名 -> [来源], 用于跨插件重名检测
const commandNameOwners = new Map();
const pluginRootRel = catalog.metadata?.pluginRoot ?? "";

for (const entry of entries) {
  const label = entry.name ?? "(缺少 name)";
  if (!PLUGIN_NAME_RE.test(label)) fail(`[${label}] 插件名不合规（只允许 a-z0-9._-）`);

  const source = typeof entry.source === "string" ? entry.source : null;
  if (!source) {
    fail(`[${label}] source 是对象或缺失 —— 本仓约定为子目录名，请确认是否有意为之`);
    continue;
  }
  const dir = join(repoRoot, pluginRootRel, source);
  if (!existsSync(dir)) {
    fail(`[${label}] source 指向的目录不存在: ${pluginRootRel}/${source}`);
    continue;
  }

  // plugin.json
  const manifestPath = join(dir, ".ccode-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    fail(`[${label}] 缺 .ccode-plugin/plugin.json —— CCode 不会把它认成已安装插件`);
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      fail(`[${label}] plugin.json 无法解析: ${error.message}`);
    }
    if (manifest) {
      if (manifest.name !== entry.name) fail(`[${label}] plugin.json 的 name=${manifest.name} 与市场条目不一致`);
      if (manifest.version !== entry.version) {
        note(`[${label}] 版本不一致：plugin.json=${manifest.version} 市场=${entry.version}`);
      }
      if (!manifest.license && entry.license) note(`[${label}] 市场声明了 license 但 plugin.json 没有`);
    }
  }

  // 图标
  const iconFile = join(dir, "icon.png");
  if (!existsSync(iconFile)) fail(`[${label}] 缺 icon.png`);
  if (typeof entry.icon !== "string") {
    note(`[${label}] 未声明 icon`);
  } else if (!entry.icon.startsWith("https://")) {
    fail(`[${label}] icon 不是 https:// —— CCode 只信任 https，其它会被静默忽略`);
  }

  // 技能
  const skillsField = manifestSafeSkills(dir);
  const roots = [skillsField ?? "skills"]
    .flat(2)
    .filter((x) => typeof x === "string");
  if (!roots.includes("skills") && existsSync(join(dir, "skills"))) roots.push("skills");
  const seenFiles = new Set();
  for (const rel of roots) {
    for (const file of scanSkillFiles(join(dir, rel))) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      const name = readFrontmatter(file, "name") ?? dirname(file).split(/[\/]/).pop();
      if (!skillNameOwners.has(name)) skillNameOwners.set(name, []);
      skillNameOwners.get(name).push(`${label}:${file.slice(repoRoot.length + 1)}`);
    }
  }

  // 命令
  const commandsDir = join(dir, "commands");
  if (existsSync(commandsDir)) {
    for (const f of readdirSync(commandsDir)) {
      if (!f.endsWith(".md")) continue;
      const name = f.slice(0, -3);
      const file = join(commandsDir, f);
      if (!COMMAND_NAME_RE.test(name)) fail(`[${label}] 命令名不合规: ${name}（只允许 a-z0-9._- 与 :）`);
      if (!readFrontmatter(file, "description")) fail(`[${label}] 命令 ${name} 的 frontmatter 缺 description`);
      if (!commandNameOwners.has(name)) commandNameOwners.set(name, []);
      commandNameOwners.get(name).push(`${label}/${f}`);
    }
  }
}

// ── 3. 跨插件重名（CCode 会静默丢掉后到的那个）──
for (const [name, owners] of skillNameOwners) {
  if (owners.length > 1) fail(`技能名重复，CCode 只会保留一个: ${name}\n      → ${owners.join("\n      → ")}`);
}
for (const [name, owners] of commandNameOwners) {
  if (owners.length > 1) fail(`命令名重复，会互相遮蔽: /${name}\n      → ${owners.join("\n      → ")}`);
}

// ── 汇总 ──
console.log(`检查插件条目 ${entries.length} 个；技能 ${skillNameOwners.size} 个、命令 ${commandNameOwners.size} 个`);
if (notes.length > 0) {
  console.log(`\n提醒（不阻断）${notes.length} 条：`);
  for (const n of notes) console.log("  · " + n);
}
if (problems.length === 0) {
  console.log("\nPASS  未发现问题");
  process.exit(0);
}
console.log(`\nFAIL  发现 ${problems.length} 处必须处理的问题：`);
for (const p of problems) console.log("  ✗ " + p);
process.exit(1);

function manifestSafeSkills(dir) {
  const p = join(dir, ".ccode-plugin", "plugin.json");
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, "utf8"));
    const f = m.skills;
    if (typeof f === "string") return [f];
    if (Array.isArray(f)) return [f.filter((x) => typeof x === "string")];
    return null;
  } catch {
    return null;
  }
}
function note(msg) {
  notes.push(msg);
}
