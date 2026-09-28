import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  ensureTaskRuntimeShape,
  readTaskJson,
  resolveTaskDir,
  taskFile,
  writeTaskJson
} from "./common.mjs";

function fileExists(p) { try { return fs.existsSync(p); } catch { return false; } }

function probeAntiDebugTools() {
  const candidates = [
    "E:\\Crack\\tools\\x64dbg\\release\\x32\\plugins\\ScyllaHide",
    "E:\\Crack\\tools\\x64dbg\\release\\x64\\plugins\\ScyllaHide",
    "C:\\x64dbg\\release\\x32\\plugins\\ScyllaHide",
    "C:\\x64dbg\\release\\x64\\plugins\\ScyllaHide"
  ];
  const found = candidates.filter(fileExists);
  return { scyllaHide: found.length > 0, paths: found };
}

function probeUnpackTools() {
  const tools = ["VMPDump", "NoVmp", "vmpattack", "Scylla", "ImportREC"];
  const found = [];
  for (const t of tools) {
    try { execSync(`where ${t}`, { stdio: "pipe" }); found.push(t); } catch {}
  }
  return { available: found };
}

// W10：降级阶梯兜底级前提（宿主机 r2 CLI）上线前可探测。
// heuristic 标注、不阻断——受限 shell 可能假阴性，agent 实测为准。
function probeR2Cli() {
  for (const name of ["r2", "radare2"]) {
    try { execSync(`where ${name}`, { stdio: "pipe" }); return "available"; } catch {}
  }
  return "missing";
}

function inferObjectiveTier(task) {
  // Feature-based objective tier inference (not AI self-report).
  // Conservative: when uncertain, upgrade tier (accept false-positive over false-negative).
  // P2-11 已知局限（round1 登记项）：单样本关键词规则存在过拟合——UPX 类标准壳曾被误报 T4；
  // 轮 2 需以 UPX/Themida 特征用例集（各 ≥1）校准「strong-packer 需 ≥2 独立特征」规则与 T 封顶。
  const corpus = [
    task?.objective || "",
    task?.target?.binaryPath || "",
    JSON.stringify(task?.targetContext || {})
  ].join("\n").toLowerCase();
  const strong = /vmp|vmprotect|themida|winlicense|enigma|\.vmp|virtuali[sz]ed|脱壳|unpack/.test(corpus);
  const medium = /packer|upx|aspack|armadillo|anti-?debug|反调试|壳/.test(corpus);
  if (strong) return { tier: "T4", basis: "strong-packer-signal" };
  if (medium) return { tier: "T3", basis: "packer-signal" };
  return { tier: "T1", basis: "no-strong-signal" };
}

function main() {
  const taskRef = process.argv[2];
  if (!taskRef) { console.error("usage: node tools/task/task-probe.mjs <task-id>"); process.exit(1); }
  const taskDir = resolveTaskDir(taskRef);
  const task = ensureTaskRuntimeShape(readTaskJson(taskDir));

  const capability = {
    generatedAt: new Date().toISOString(),
    antiDebug: probeAntiDebugTools(),
    unpackTools: probeUnpackTools(),
    objectiveTier: inferObjectiveTier(task),
    fallbackLadder: {
      r2Cli: probeR2Cli(),
      note: "heuristic: host PATH probe for the r2 CLI fallback rung; non-blocking, agent's own measurement wins on disagreement."
    },
    mcp: {
      note: "MCP health check must be performed by the Agent at runtime (tool availability is environment-specific). " +
            "On first MCP failure, output the fixed degradation line and switch to static-first route; do not retry the same call in a loop."
    }
  };

  const outPath = taskFile(taskDir, "run/env-capability.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(capability, null, 2));

  // Persist objective tier back to task.json if not explicitly set by user
  if (!task.protectionTier || task.protectionTier === "T0") {
    task.protectionTier = capability.objectiveTier.tier;
    writeTaskJson(taskDir, task);
  }

  console.log(`task-probe: wrote run/env-capability.json (objectiveTier=${capability.objectiveTier.tier} basis=${capability.objectiveTier.basis})`);
  if (capability.objectiveTier.tier >= "T3" && !capability.antiDebug.scyllaHide) {
    console.log("task-probe: WARNING - T3+ target but ScyllaHide not detected; prefer runtime-retained-dump or blackbox-boundary.");
  }
}

main();
