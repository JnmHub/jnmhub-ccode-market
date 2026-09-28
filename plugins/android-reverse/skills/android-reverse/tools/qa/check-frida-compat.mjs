// check-frida-compat.mjs — Frida 16/17 兼容性静态检查
// 1) artifacts 模板 JS 禁止 Frida 17.0 已移除 API（兼容层标记区域内白名单）
// 2) Frida 模板必须含版本守卫标记（占位桩除外）
// 3) node --check 语法校验，防止机械编辑引入语法错误
// 说明：.md 不在本检查范围 —— frida-version-policy.md 自身含迁移对照表与兼容层源码。
// 版本规则唯一事实源：references/frida-version-policy.md
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templateRoots = [
  path.join(baseDir, "artifacts", "tasks", "_TEMPLATE", "run"),
  path.join(baseDir, "artifacts", "tasks", "_TEMPLATE", "topic-packs")
];

// 占位桩 / 非 Frida 运行时脚本，不要求守卫
const STUBS = new Set([
  "api-call-example.js",      // 一行占位
  "local-repro-example.js",   // Node 侧本地复现脚本
  "anti-emulator-bypass.js"   // 一行占位
]);

const REMOVED_API = [
  /Module\.findExportByName\s*\(/,
  /Module\.getExportByName\s*\(/,
  /Module\.findBaseAddress\s*\(/,
  /Module\.getBaseAddress\s*\(/,
  /Module\.findSymbolByName\s*\(/,
  /Module\.getSymbolByName\s*\(/,
  /Module\.ensureInitialized\s*\(/,
  /Module\.enumerateSymbolsSync\s*\(/,
  /Memory\.read[A-Z][A-Za-z]*\s*\(/,
  /Memory\.write[A-Z][A-Za-z]*\s*\(/
];

function collectJsFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(p));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// 摘掉兼容层/守卫标记区域：legacy 分支按设计引用 16.x 旧 API
function stripCompatRegions(text) {
  return text
    .replace(/\/\/ === Frida 16\/17 兼容层[\s\S]*?\/\/ === 兼容层结束 ===/g, "")
    .replace(/\/\/ === Frida 版本守卫[\s\S]*?\/\/ === 守卫结束 ===/g, "");
}

const files = templateRoots.flatMap(collectJsFiles);
let failed = false;

for (const file of files) {
  const rel = path.relative(baseDir, file).split(path.sep).join("/");
  const text = fs.readFileSync(file, "utf8");

  // 语法校验
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (syntax.status !== 0) {
    console.error(`[frida-compat] SYNTAX FAIL ${rel}`);
    console.error((syntax.stderr || "").trim());
    failed = true;
  }

  // 已移除 API（兼容层区域外）
  const lintable = stripCompatRegions(text);
  const lines = lintable.split("\n");
  REMOVED_API.forEach((pattern) => {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        console.error(`[frida-compat] REMOVED-API ${rel}:${index + 1} ${line.trim().slice(0, 100)}`);
        failed = true;
      }
    });
  });

  // 版本守卫存在性（占位桩豁免）
  const base = path.basename(file);
  if (!STUBS.has(base) && !text.includes("Frida 16/17 兼容层") && !text.includes("Frida 版本守卫")) {
    console.error(`[frida-compat] MISSING-GUARD ${rel}`);
    failed = true;
  }
}

if (files.length === 0) {
  console.error("[frida-compat] no template JS files found — layout broken?");
  failed = true;
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`check-frida-compat: OK (${files.length} files)`);
}
