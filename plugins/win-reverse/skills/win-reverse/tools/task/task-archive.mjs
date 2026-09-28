import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  copyDirRecursive,
  ensureDir,
  ensureTaskRuntimeShape,
  readTaskJson,
  relFromRepo,
  resolveInstalledSkillRoot,
  resolveTaskDir,
  skillRoot,
  writeTaskJson
} from "./common.mjs";

// P1-9（round1 F-08）归档排除清单：哈希可追溯原物（backup-manifest 已登记 SHA256）
// 的重产物不进归档快照。run/tools/** 为任务现场工具落点，*.zip/*.exe/*.dll/*.bak/*.i64
// 为二进制重物。排除为快照层裁剪，不影响任务现场与哈希断路器
// （readBackupManifestMap 读任务现场 runDir，与归档无关）。
const ARCHIVE_EXCLUDED_EXTENSIONS = [".zip", ".exe", ".dll", ".bak", ".i64"];

function isArchiveExcludedRelPath(relPath) {
  const normalized = String(relPath || "").replace(/\\/g, "/").toLowerCase();
  if (normalized === "run/tools" || normalized.startsWith("run/tools/")) {
    return true;
  }
  return ARCHIVE_EXCLUDED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function archiveTaskSnapshot(taskDir, options = {}) {
  const resolvedTaskDir = path.resolve(taskDir);
  // freezeNewTopics：归档是快照语义，读取时不允许重新推断 topic——否则 closeout 的
  // M1 冻结会在最后一步被绕过，把任务从未实际覆盖的 topic 与扩展模板占位字段
  // 写回 workspace 与归档副本（实测：DriverEntry 信号夹具真实 close 后被注入 driver）。
  const readOptions = { freezeNewTopics: true };
  const task = ensureTaskRuntimeShape(readTaskJson(resolvedTaskDir, readOptions));
  const taskSkillRoot = path.resolve(options.taskSkillRoot || task.roots?.skillRoot || skillRoot);
  const installedSkillRoot = path.resolve(options.installedSkillRoot || resolveInstalledSkillRoot(taskSkillRoot));
  const archiveRoot = path.join(installedSkillRoot, "artifacts", "tasks");
  const archiveTaskDir = path.join(archiveRoot, task.taskId);

  ensureDir(archiveRoot);
  // KNOWN-ISSUE（round2 终裁登记，暂缓修）：先 rm 旧归档再 copy 非原子——copy 中途失败
  // （磁盘满/只读）则旧归档已毁。修复需写临时目录+rename 原子化，见 _reviews/round2/04-final-plan.md 第 4 节。
  fs.rmSync(archiveTaskDir, { recursive: true, force: true });
  let excludedCount = 0;
  copyDirRecursive(resolvedTaskDir, archiveTaskDir, {
    excludeTest: (relPath) => {
      const excluded = isArchiveExcludedRelPath(relPath);
      if (excluded) {
        excludedCount += 1;
      }
      return excluded;
    }
  });

  const archivedTask = ensureTaskRuntimeShape(readTaskJson(archiveTaskDir, readOptions));
  archivedTask.archiveStatus = "archived";
  archivedTask.archiveTargetTaskDir = archiveTaskDir;
  archivedTask.archiveCompletedAt = new Date().toISOString();
  writeTaskJson(archiveTaskDir, archivedTask);

  task.archiveStatus = "archived";
  task.archiveTargetTaskDir = archiveTaskDir;
  task.archiveCompletedAt = archivedTask.archiveCompletedAt;
  writeTaskJson(resolvedTaskDir, task);

  return {
    installedSkillRoot,
    archiveRoot,
    archiveTaskDir,
    excludedCount
  };
}

function main() {
  const taskRef = process.argv[2];
  const installedSkillRootArg = process.argv[3];
  if (!taskRef) {
    console.error("usage: node tools/task/task-archive.mjs <task-id|task-path> [installed-skill-root]");
    process.exit(1);
  }

  const taskDir = resolveTaskDir(taskRef);
  const result = archiveTaskSnapshot(taskDir, {
    installedSkillRoot: installedSkillRootArg || undefined
  });
  console.log(`archived ${relFromRepo(taskDir, taskDir)} -> ${result.archiveTaskDir}`);
  console.log(`archive excluded ${result.excludedCount} file(s): run/tools/** and *.zip/*.exe/*.dll/*.bak/*.i64`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
