import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
// 分层门禁（效率改造）：
// - npm run check（默认/快层）：纯静态检查，秒级完成，日常迭代用；
// - npm run check:full（--full）：追加 check-task-behavior 行为套件（经
//   run-task-behavior.mjs 分片并发驱动），交付/大改前用。
// task-behavior 从快层剔除的原因：113 个场景 × 数百次子进程 spawn，串行墙钟
// 数十分钟级，是全量 check 的唯一时间黑洞。
const FULL_MODE = process.argv.includes("--full");
const checks = [
  "check-skill-contract.mjs",
  "check-doc-facts.mjs",
  "check-framework-layout.mjs",
  "check-topic-manifests.mjs",
  "check-capability-coverage.mjs",
  "check-operating-contracts.mjs",
  "check-deliverables.mjs",
  "check-drill-scenarios.mjs",
  "check-task-behavior.mjs",
  "lint-cases.mjs"
];
const runnable = checks.filter(
  (check) => FULL_MODE || check !== "check-task-behavior.mjs"
);

// 元检查：目录内的 check-*.mjs 必须全部注册进 checks，防止新增检查器被遗忘（check-template 化石教训）
const unregistered = fs
  .readdirSync(baseDir)
  .filter((name) => /^check-.*\.mjs$/.test(name) && name !== "check-all.mjs")
  .filter((name) => !checks.includes(name));
if (unregistered.length > 0) {
  console.error(`check-all: 未注册的检查器: ${unregistered.join(", ")}（请加入 checks 列表或删除）`);
  process.exit(1);
}

let failed = false;
for (const check of runnable) {
  // task-behavior 走分片并发包装器，而不是直接 spawn 场景文件本体。
  const entry = check === "check-task-behavior.mjs" ? "run-task-behavior.mjs" : check;
  const result = spawnSync(process.execPath, [path.join(baseDir, entry)], {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`check-all: OK (${FULL_MODE ? "full" : "fast"} tier, ${runnable.length} checks)`);
}

