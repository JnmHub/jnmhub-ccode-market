#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// web-reverse 生命周期 hook 分发器（report-only 契约版）。两个事件：
//
//   session-start  检测未完成任务目录（report.md 仍为骨架）→ 提醒继续；无任务 → 提醒先 boot
//   guard          PreToolUse：拦截把任务产物写到 cwd 根目录的 Write/Edit/NotebookEdit
//
// 已删除（随过程落盘机制一并移除）：stop / evidence 自动快照。
// 在 .claude/settings.json 中按事件挂载本脚本（见同目录 README）。
// 设计为绝不崩溃：任何异常都 exit 0。唯有 guard 在「明确违反产物纪律」时返回 deny。

const hookDir = path.dirname(fileURLToPath(import.meta.url));
const toolDir = path.resolve(hookDir, "..", "tools", "task");
const cwd = process.cwd();

// 骨架标记：boot 生成的 report.md 首部注释。仍含该标记 = 任务未收尾。
const SKELETON_MARKER = "骨架生成于";

function listTaskDirs() {
  const tasksRoot = path.join(cwd, "artifacts", "tasks");
  if (!fs.existsSync(tasksRoot)) {
    return [];
  }
  const out = [];
  for (const entry of fs.readdirSync(tasksRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      continue;
    }
    const report = path.join(tasksRoot, entry.name, "report.md");
    if (fs.existsSync(report)) {
      out.push({ id: entry.name, report, mtimeMs: fs.statSync(report).mtimeMs });
    }
  }
  return out.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function isSkeleton(reportPath) {
  try {
    return fs.readFileSync(reportPath, "utf8").includes(SKELETON_MARKER);
  } catch {
    return true;
  }
}

function emitContext(message) {
  // SessionStart：stdout 会作为附加上下文注入模型。
  process.stdout.write(`${message}\n`);
}

// cwd 根目录唯一允许直接存在的文件（与 SKILL.md「产物集中」白名单一致）。
const ROOT_WHITELIST = new Set([".web-reverse-tool-dir", ".gitignore", "SKILL.md", "SKILL.md.bak"]);

// 即使没有 workspace 标记，这些文件名也强烈暗示是 web-reverse 产物——
// 用于打破「不初始化 → 无标记 → guard 放行 → 继续写根目录」的死锁。
const WEB_REVERSE_ARTIFACT_RE =
  /^(?:REPORT|report)\.md$|^(?:test_|dun163_|captcha_|search_|verify-|pure|core_|load_).*\.(?:py|js|mjs|json|jpg|png|har)$|^fixtures\.json$|^web-replay\.js$|^state.*\.json$|^__pycache__$/i;

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 检查当前 cwd 是否已经是 web-reverse workspace（有标记目录或已有产物）。
function detectWebReverseWorkspace() {
  const hasMarker =
    fs.existsSync(path.join(cwd, ".web-reverse-tool-dir")) ||
    fs.existsSync(path.join(cwd, "artifacts", "tasks"));
  if (hasMarker) {
    return { isWorkspace: true, hasMarker: true };
  }
  try {
    const files = fs.readdirSync(cwd);
    const hasArtifacts = files.some((f) => WEB_REVERSE_ARTIFACT_RE.test(f));
    return { isWorkspace: hasArtifacts, hasMarker: false };
  } catch {
    return { isWorkspace: false, hasMarker: false };
  }
}

// PreToolUse 守卫：阻止把任务产物写到 cwd 根目录。
function guardRootWrite() {
  const payload = readStdinJson();
  if (!payload || typeof payload !== "object") {
    return; // 解析不了就放行
  }

  const input = payload.tool_input || {};
  const target = input.file_path || input.notebook_path || input.path || "";
  if (!target || typeof target !== "string") {
    return;
  }

  const { isWorkspace, hasMarker } = detectWebReverseWorkspace();
  if (!isWorkspace) {
    return; // 不是 web-reverse 项目，放行
  }

  const abs = path.resolve(cwd, target);
  if (path.dirname(abs) !== path.resolve(cwd)) {
    return;
  }

  const base = path.basename(abs);
  if (ROOT_WHITELIST.has(base)) {
    return;
  }

  if (!hasMarker && !WEB_REVERSE_ARTIFACT_RE.test(base)) {
    return;
  }

  const tasks = listTaskDirs();
  const latest = tasks[0];
  const dest = latest ? `artifacts/tasks/${latest.id}/` : "artifacts/tasks/<task-id>/";
  const isReport = /^report\.md$/i.test(base) || /report/i.test(base) && base.toLowerCase().endsWith(".md");

  let hint;
  if (!hasMarker && !latest) {
    hint =
      `当前目录没有初始化 web-reverse 任务（无 .web-reverse-tool-dir / artifacts/tasks/）。` +
      `请先执行：node ${path.join(toolDir, "task-init.mjs")} <task-id>。`;
  } else if (isReport) {
    hint = `最终报告就是 ${dest}report.md（小写，收尾时直接编辑填充，勿在根目录另建 REPORT.md）。`;
  } else {
    hint = `脚本/样本/中间数据请写到 ${dest} 下。`;
  }

  const reason =
    `[web-reverse 产物纪律] 禁止把 '${base}' 写到工作目录根 (${cwd})。` +
    `cwd 根仅允许 .web-reverse-tool-dir / .gitignore。${hint}`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason
      }
    }) + "\n"
  );
}

function main() {
  const event = (process.argv[2] || "").toLowerCase();

  if (event === "guard") {
    guardRootWrite();
    return;
  }

  if (event === "session-start") {
    const tasks = listTaskDirs();
    const unfinished = tasks.filter((t) => isSkeleton(t.report));
    if (unfinished.length > 0) {
      const t = unfinished[0];
      emitContext(
        `[web-reverse] 检测到未完成任务 '${t.id}'（artifacts/tasks/${t.id}/report.md 仍为骨架）。` +
          `继续它：node ${path.join(toolDir, "task-init.mjs")} ${t.id}；` +
          `完成时把全面总结写进 report.md（必填小节见骨架内注释）。`
      );
    } else if (tasks.length === 0) {
      emitContext(
        `[web-reverse] 当前目录没有逆向任务。需要逆向时先执行唯一开机命令：` +
          `node ${path.join(toolDir, "task-init.mjs")} <task-id>（幂等：建目录 + report.md 骨架）。`
      );
    }
    return;
  }
}

try {
  main();
} catch {
  // hook 绝不阻断主流程
}
process.exit(0);
