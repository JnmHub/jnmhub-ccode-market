import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertSafeWorkspaceRoot,
  ensureTaskRuntimeShape,
  readTaskJson,
  relFromRepo,
  resolveTaskDir,
  validateNewTaskId,
  workspaceRoot,
  writeJsonFile,
  writeTaskJson
} from "./common.mjs";
import {
  buildTaskInputFromDrill,
  buildTaskStartArgs,
  decorateTaskWithDrill,
  formatDrillSummary,
  getDrillById,
  listDrills,
  validateDrillManifest
} from "./drill-lib.mjs";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const taskStartScript = path.join(baseDir, "task-start.mjs");
const taskSyncScript = path.join(baseDir, "task-sync.mjs");
const taskAdvanceScript = path.join(baseDir, "task-advance.mjs");

function usage() {
  console.log("usage:");
  console.log("  node tools/task/task-drill.mjs --list");
  console.log("  node tools/task/task-drill.mjs <scenario-id> <task-id> [--force-new-task] [--dry-run]");
}

function runNodeScript(scriptPath, args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit"
  });
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--list")) {
    return {
      mode: "list"
    };
  }

  const positional = args.filter((value) => !value.startsWith("--"));
  if (positional.length < 2) {
    usage();
    process.exit(1);
  }

  return {
    mode: "run",
    drillId: positional[0],
    taskId: positional[1],
    forceNewTask: args.includes("--force-new-task"),
    dryRun: args.includes("--dry-run")
  };
}

function printDrills() {
  const drills = listDrills();
  if (drills.length === 0) {
    console.log("no drills published");
    return;
  }
  for (const drill of drills) {
    console.log(`- ${formatDrillSummary(drill)}`);
  }
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.mode === "list") {
    printDrills();
    return;
  }

  try {
    assertSafeWorkspaceRoot({
      workspace: workspaceRoot,
      commandName: "task-drill"
    });
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(1);
  }

  const drill = getDrillById(parsed.drillId);
  if (!drill) {
    console.error(`task-drill: unknown scenario '${parsed.drillId}'`);
    printDrills();
    process.exit(1);
  }
  const taskIdError = validateNewTaskId(parsed.taskId);
  if (taskIdError) {
    console.error(`task-drill: invalid task id '${parsed.taskId}': ${taskIdError}`);
    process.exit(1);
  }
  const errors = validateDrillManifest(drill);
  if (errors.length > 0) {
    console.error(`task-drill: invalid drill '${drill.id}'`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "win-reverse-drill-"));
  try {
    const taskInputPath = path.join(tempDir, `${parsed.taskId}.task-input.json`);
    writeJsonFile(taskInputPath, buildTaskInputFromDrill(drill));
    const taskStartArgs = [
      ...buildTaskStartArgs(drill, parsed.taskId, { forceNewTask: parsed.forceNewTask }),
      `--task-input=${taskInputPath}`
    ];

    console.log(`[task-drill] scenario=${drill.id}`);
    console.log(`[task-drill] taskId=${parsed.taskId}`);
    console.log(`[task-drill] topics=${drill.topics.join(",")}`);

    if (parsed.dryRun) {
      console.log(`[task-drill] dry-run command=node ${path.relative(workspaceRoot, taskStartScript)} ${taskStartArgs.join(" ")}`);
      return;
    }

    const startResult = runNodeScript(taskStartScript, taskStartArgs);
    if (startResult.status !== 0) {
      process.exit(startResult.status ?? 1);
    }

    const taskDir = resolveTaskDir(parsed.taskId);
    const task = readTaskJson(taskDir);
    ensureTaskRuntimeShape(task);
    const nextTask = decorateTaskWithDrill(task, drill);
    writeTaskJson(taskDir, nextTask);

    // drill 模拟的是"已在推进中"的场景：外部研究笔记作为演练夹具播种（真实任务仍须
    // agent 自己调研）。report-only 改造后该文件不承担任何 advance 内容门禁，
    // 仅作为场景背景材料存在。
    const researchPath = path.join(taskDir, "state", "external-research.md");
    if (!fs.existsSync(researchPath)) {
      fs.mkdirSync(path.dirname(researchPath), { recursive: true });
      fs.writeFileSync(
        researchPath,
        [
          "# 外部研究（drill 种子）",
          "",
          `- 场景: ${drill.id}`,
          `- 专题: ${drill.topics.join(", ")}`,
          "",
          "## 检索 / query",
          "- 演练种子：模拟针对该类防护的公开资料、工具链与已知限制的检索已完成。",
          "## 来源 / sources",
          "- 演练种子：公开技术博客、厂商文档与社区论坛的工具发布页（夹具内容，非真实链接）。",
          "## 结论 / findings",
          "- 演练种子：公开工具链仅覆盖已知模式，剩余路径需手工分析并按黑盒边界推进，相关风险记入 assumptions。",
          "",
          "本文件由 task-drill 作为演练夹具播种，代表该模拟场景中公开资料调研已完成；",
          "真实任务中本文件必须由 Agent 实际调研后撰写，不得照搬本种子内容。"
        ].join("\n"),
        "utf8"
      );
    }

    const syncResult = runNodeScript(taskSyncScript, [parsed.taskId]);
    if (syncResult.status !== 0) {
      process.exit(syncResult.status ?? 1);
    }
    const advanceResult = runNodeScript(taskAdvanceScript, [parsed.taskId]);
    if (advanceResult.status !== 0) {
      process.exit(advanceResult.status ?? 1);
    }

    console.log(`[task-drill] seeded ${relFromRepo(taskDir, workspaceRoot)}`);
    console.log("[task-drill] next: read task.json.taskDrill + route-state.json and continue from active phase");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
