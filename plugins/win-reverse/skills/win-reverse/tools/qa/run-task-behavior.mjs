// check-task-behavior 并发驱动器：把 113 个场景按 --shard=i/n 切成 N 个独立
// node 子进程并行执行（场景间本来就各自独立 tempRoot、互不共享状态）。
// 分片数默认 6，可用环境变量 WIN_REVERSE_QA_SHARDS 覆盖（上限 = CPU 核数）。
// 任一分片失败：保留各分片摘要行，并完整转储失败分片输出（最后一行 [scenario]
// 即失事现场锚点），exit=1。
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(baseDir, "check-task-behavior.mjs");

const requested = Number(process.env.WIN_REVERSE_QA_SHARDS) || 6;
const shardCount = Math.max(1, Math.min(requested, os.cpus().length));

console.log(`check-task-behavior: launching ${shardCount} shards in parallel (WIN_REVERSE_QA_SHARDS=${requested})`);
const startedAt = Date.now();

const results = await Promise.all(
  Array.from({ length: shardCount }, (_, index) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [target, `--shard=${index}/${shardCount}`], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let out = "";
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.on("data", (chunk) => { out += chunk; });
      child.on("close", (code) => resolve({ index, code, out }));
      child.on("error", (error) => resolve({ index, code: 1, out: `${out}\nspawn error: ${error.message}` }));
    })
  )
);

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
for (const result of results) {
  const lines = result.out.trim().split("\n").filter(Boolean);
  const tail = lines[lines.length - 1] || "(no output)";
  console.log(`shard ${result.index}/${shardCount}: ${result.code === 0 ? "OK" : `FAILED (exit=${result.code})`} — ${tail}`);
}

const failed = results.filter((result) => result.code !== 0);
if (failed.length > 0) {
  for (const result of failed) {
    console.error(`\n===== shard ${result.index}/${shardCount} FAILED — full output =====\n${result.out}`);
  }
  process.exit(1);
}
console.log(`check-task-behavior: OK (all ${shardCount} shards, ${elapsed}s)`);
