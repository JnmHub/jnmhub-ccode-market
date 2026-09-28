import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { failWith } from "./common.mjs";
import { listTopicsByMaturity } from "./topic-registry.mjs";

// report-only 契约的 synthetic 冒烟测试：
//   1. task-init 在临时 workspace 建任务目录（仅 report.md 骨架，无其它模板）
//   2. 按专题 seed 写入 synthetic 产物到任务目录（产物落位）
//   3. 把 report.md 填充为含必填六节的完整报告
//   4. 断言：六节齐全、无骨架标记、产物存在、boot 幂等（续跑不覆盖）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const findings = [];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "web-reverse-synthetic-"));
const workspaceRoot = path.join(tempRoot, "workspace");
fs.mkdirSync(workspaceRoot, { recursive: true });
const tasksRoot = path.join(workspaceRoot, "artifacts", "tasks");
const topicFilter = new Set(
  process.argv
    .filter((item) => item.startsWith("--topic="))
    .flatMap((item) => item.split("=")[1].split(","))
    .map((item) => String(item || "").trim())
    .filter(Boolean)
);

const REQUIRED_SECTIONS = [
  "## 任务目标与结果",
  "## 实现路径",
  "## 逆向思路",
  "## 难点与坑点",
  "## 经验沉淀",
  "## 交付物与复现"
];

function runBoot(taskId) {
  return spawnSync(process.execPath, [path.join(repoRoot, "tools", "task", "task-init.mjs"), taskId], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: process.env
  });
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeSyntheticArtifacts(taskDir, topic) {
  for (const artifact of topic.synthetic?.artifactSeeds || []) {
    if (!artifact?.path) {
      continue;
    }
    const fullPath = path.join(taskDir, ...String(artifact.path).split("/"));
    ensureParent(fullPath);
    if (Object.prototype.hasOwnProperty.call(artifact, "json")) {
      fs.writeFileSync(fullPath, JSON.stringify(artifact.json, null, 2) + "\n");
    } else {
      fs.writeFileSync(fullPath, String(artifact.text || ""));
    }
  }
}

function buildSyntheticReport(topic, artifactFiles) {
  return [
    `# 逆向报告：${topic.key}-synthetic`,
    "",
    "## 任务目标与结果",
    "",
    `- 目标：验证 ${topic.key} synthetic 路线的产物落位与报告契约。`,
    "- 验收状态：synthetic 冒烟通过（本报告即产物）。",
    "",
    "## 实现路径",
    "",
    `- task-init 建任务目录 → 按 ${topic.routeTrack} seed 写入产物 → 填充本报告。`,
    `- 关键产物：${artifactFiles.join(", ") || "(none)"}`,
    "",
    "## 逆向思路",
    "",
    "- synthetic 场景：先排除噪音支线，再收敛到主路径（模拟真实取舍）。",
    "",
    "## 难点与坑点",
    "",
    "- synthetic 场景无真实保护；用噪音支线模拟低收益干扰。",
    "",
    "## 经验沉淀",
    "",
    "- report-only 契约下，收尾只需：可运行示例 + 本报告六节。",
    "",
    "## 交付物与复现",
    "",
    `- 文件清单：${artifactFiles.join(", ") || "(none)"}`,
    "- 复现命令：node tools/qa/check-synthetic-e2e.mjs",
    ""
  ].join("\n");
}

try {
  for (const topic of listTopicsByMaturity("synthetic-e2e").filter((item) => topicFilter.size === 0 || topicFilter.has(item.key))) {
    const taskId = `__synthetic-${topic.key}-${Date.now()}`;
    const taskDir = path.join(tasksRoot, taskId);

    try {
      // 1. boot 新建：应生成任务目录 + report.md 骨架，且不生成其它文件
      const boot = runBoot(taskId);
      if (boot.status !== 0) {
        findings.push(`${topic.key} task-init failed: ${(boot.stderr || boot.stdout || "").trim()}`);
        continue;
      }
      if (!fs.existsSync(path.join(taskDir, "report.md"))) {
        findings.push(`${topic.key} boot did not create report.md skeleton`);
        continue;
      }
      const createdFiles = fs.readdirSync(taskDir);
      if (!createdFiles.every((name) => name === "report.md")) {
        findings.push(`${topic.key} boot created unexpected template files: ${createdFiles.filter((n) => n !== "report.md").join(", ")}`);
        continue;
      }

      // 2. 产物落位：专题 seed 写进任务目录
      writeSyntheticArtifacts(taskDir, topic);
      const artifactFiles = (topic.synthetic?.artifactSeeds || [])
        .map((artifact) => String(artifact?.path || ""))
        .filter(Boolean)
        .filter((rel) => fs.existsSync(path.join(taskDir, ...rel.split("/"))));

      // 3. 填充 report 六节（模拟执行者收尾）
      fs.writeFileSync(path.join(taskDir, "report.md"), buildSyntheticReport(topic, artifactFiles));

      // 4. 断言：六节齐全、无骨架标记
      const reportText = fs.readFileSync(path.join(taskDir, "report.md"), "utf8");
      for (const section of REQUIRED_SECTIONS) {
        if (!reportText.includes(section)) {
          findings.push(`${topic.key} report.md is missing section: ${section}`);
        }
      }
      if (reportText.includes("骨架生成于")) {
        findings.push(`${topic.key} report.md still contains skeleton marker`);
      }

      // 5. boot 幂等：续跑不动任何文件
      const before = fs.statSync(path.join(taskDir, "report.md")).mtimeMs;
      const reBoot = runBoot(taskId);
      if (reBoot.status !== 0) {
        findings.push(`${topic.key} re-boot failed: ${(reBoot.stderr || reBoot.stdout || "").trim()}`);
      }
      const after = fs.statSync(path.join(taskDir, "report.md")).mtimeMs;
      if (before !== after) {
        findings.push(`${topic.key} re-boot overwrote report.md (must be idempotent)`);
      }

      console.log(`[synthetic:${topic.key}] OK`);
    } finally {
      fs.rmSync(taskDir, { recursive: true, force: true });
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

failWith(findings, "check-synthetic-e2e");
