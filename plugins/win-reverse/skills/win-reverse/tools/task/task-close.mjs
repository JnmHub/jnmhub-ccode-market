import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  criteriaItemHit,
  detectContractFieldDrift,
  ensureTaskRuntimeShape,
  ensureTaskWorkspaceBridges,
  nowIso,
  readTaskJson,
  relFromRepo,
  resolveInstalledSkillRoot,
  resolveTaskDir,
  skillRoot,
  taskFile,
  templateTaskCoreDir,
  writeTaskJson,
  verifyObjectiveHash,
  recordObjectiveMutation
} from "./common.mjs";
import { resyncTaskStateForClose, synchronizeCloseoutState } from "./closeout-state.mjs";
import { archiveTaskSnapshot } from "./task-archive.mjs";
import { cleanupTaskArtifacts } from "./task-cleanup.mjs";
import { autoDetectWebShellTechFromTaskContext, readWebShellTechResult, webShellTechLooksMeaningful } from "./web-shell-triage-state.mjs";

function ensureReportExists(taskDir) {
  const reportPath = taskFile(taskDir, "report.md");
  if (fs.existsSync(reportPath)) {
    return;
  }

  const templatePath = taskFile(templateTaskCoreDir, "report.md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.copyFileSync(templatePath, reportPath);
}

// report-only 改造：autoFix 整体退役——不再代偿任何 report 章节（当前阶段/自动续跑决策/
// 下一步/产物路径/切入点循环/本地复现交付的原 refresh/preserve 策略表全部删除）。
// report.md 是唯一强制文档产物，收口时由执行者一次性写全；缺失时仅落盘骨架，
// 随后 validateReportSubstance 会以「report.md is still the scaffold template」FAIL——
// 骨架不代偿实质，这正是新设计要防的事后编造入口。
function autoFixCloseoutArtifacts(taskDir, task, routeState) {
  ensureReportExists(taskDir);
}

// report-only 改造：close 时刻不再反向补建 core 骨架（原 ensureTaskScaffoldForClose 的
// copyCoreTaskScaffold/ensureTopicPackArtifacts/ensureTaskDeliveryArtifacts 调用删除）——
// 骨架属开工动作（task-init/task-sync 已负责），close 补建只会在收尾时自造占位文件。

// 遥测：每次 closeout 验证失败把 finding 列表落盘，供后续复盘机械/实质失败分布。
function recordCloseoutAttempt(taskDir, stage, findings) {
  const attemptsPath = taskFile(taskDir, "run/closeout-attempts.jsonl");
  const entry = {
    at: nowIso(),
    stage,
    findings: (findings || []).slice(0, 20)
  };
  fs.mkdirSync(path.dirname(attemptsPath), { recursive: true });
  fs.appendFileSync(attemptsPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function printValidationWarnings(prefix, warnings) {
  for (const warning of warnings || []) {
    console.warn(`${prefix}: WARNING - ${warning}`);
  }
}

async function main() {
  const taskRef = process.argv.find((item, index) => index >= 2 && !item.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  if (!taskRef) {
    console.error("usage: node tools/task/task-close.mjs <task-id|task-path> [--dry-run]");
    process.exit(1);
  }

  const taskDir = resolveTaskDir(taskRef);
  // freezeNewTopics：closeout 全程冻结 topic 推断，避免闸门在收尾时自造 finding（M1 守卫）
  const readOptions = { freezeNewTopics: true };
  const task = ensureTaskRuntimeShape(readTaskJson(taskDir, readOptions));
  const __objCheck = verifyObjectiveHash(task);
  if (!__objCheck.ok) {
    recordObjectiveMutation(taskDir, __objCheck);
    console.error(`[contract-lock] objective was mutated after task-init (hash mismatch). ` +
      `The change has been recorded to run/contract-change-log.md. ` +
      `Restore the original objective, or stop and obtain explicit user authorization before continuing.`);
    process.exit(1);
  }

  ensureTaskWorkspaceBridges(taskDir, task);
  writeTaskJson(taskDir, task);

  // close 咽喉有界重扫（W2，与 task-sync.mjs:50→:71 调用序同构）：必须在 resync 之前——
  // resync 内 closeout-state.mjs:79 的 apply 消费结果文件，重扫先覆写伪造文件再被 apply；
  // 落点在 resync 之后无效（:79 已消费伪造文件并落盘 present=false，事后覆写救不回本轮 apply 判决）。
  autoDetectWebShellTechFromTaskContext(taskDir, task);

  // N6 处置：零前态任务（webShellTriage 从未物化）在 close 侧重扫只固化证据文件、
  // 义务因 apply 首行守卫 + freezeNewTopics 不激活——至少打 WARNING，不静默放行。
  if (!task.webShellTriage && webShellTechLooksMeaningful(readWebShellTechResult(taskDir))) {
    console.warn(`[manual-override] close 侧重扫已固化 web-shell 证据（run/web-shell-tech.json），` +
      `但任务无 webShellTriage 前态、topic 推断已冻结，义务未激活——放行不代表无 web 套壳嫌疑。`);
  }

  // close 入口 resync：与 task-sync/task-advance 行为对齐，先吸收镜像漂移与视图失同步，
  // 再让 validation 只看到实质问题；手改进视图的内容由 syncMarkdownViews 内部守卫合并/快照。
  const { routeState, overwrittenMirrorFields } = resyncTaskStateForClose(taskDir, task);
  if (overwrittenMirrorFields.length > 0) {
    console.log(`[resync] task.json mirror fields overwritten from route-state.json: ${overwrittenMirrorFields.join(", ")}`);
  }

  // close 咽喉 drift 检测（W1/C1）：闭合「最后 sync 之后→直 close」窗口的契约字段篡改。
  // 留痕行照常写（dry-run 同口径）；first-sight baseline 不可验证，打 WARNING 不静默。
  const drift = detectContractFieldDrift(taskDir, task);
  for (const field of drift.firstSighted) {
    console.warn(`[manual-override] contract baseline first observed at close: ${field}（首观测不可验证，close 前篡改天然隐身）`);
  }

  autoFixCloseoutArtifacts(taskDir, task, routeState);

  const taskSkillRoot = path.resolve(task.roots?.skillRoot || skillRoot);
  const installedSkillRoot = resolveInstalledSkillRoot(taskSkillRoot);

  const validationModule = await import(
    pathToFileURL(path.join(taskSkillRoot, "tools", "task", "validation.mjs")).href
  );
  const {
    evaluateCloseoutGate,
    persistValidation,
    runFormalValidation
  } = validationModule;

  const validationResult = runFormalValidation(taskDir, readOptions);
  // V3-5：dry-run 把 validation 状态改道 run/validation-last.json，不写 task.json
  persistValidation(taskDir, validationResult, { ...readOptions, dryRun });
  printValidationWarnings("verify-once", validationResult.warnings);
  if (!validationResult.ok) {
    recordCloseoutAttempt(taskDir, "verify-once", validationResult.errors || validationResult.findings);
    console.error("verify-once: FAILED");
    for (const finding of validationResult.errors || validationResult.findings || []) {
      console.error(`- ${finding}`);
    }
    // R3'-07（round3 H-06）：收口提示行——verify-once 未过时形状闸未运行，若判据状态已有
    // 可预见缺口（completionCriteria 存在 pending 或 successCriteria 零 hit；判定与
    // evaluateCloseoutGate 同源：common.mjs 单源 criteriaItemHit 谓词），stderr 提前告知。
    // 零 finding 语义变化、不做双闸并联（首轮一次报 4 条会击穿 M1≤2 指标语义）；
    // L398 recover 文本一字不动；closeout-attempts.jsonl 记录逻辑不动（仍只记本批）。
    const hintTask = readTaskJson(taskDir, readOptions);
    const hitSuccessCount = Array.isArray(hintTask.successCriteria)
      ? hintTask.successCriteria.filter(criteriaItemHit).length
      : 0;
    const pendingCompletion = (Array.isArray(hintTask.completionCriteria) ? hintTask.completionCriteria : [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !criteriaItemHit(item));
    if (hitSuccessCount === 0 || pendingCompletion.length > 0) {
      console.error(
        `[hint] verify-once 未过后 closeout 形状闸未运行；当前 completionCriteria pending=${pendingCompletion.length} 项、successCriteria ${hitSuccessCount === 0 ? "无 hit" : "已有命中"}——修复 verify-once 后 dry-run 将继续检查形状闸`
      );
    }
    process.exit(1);
  }
  console.log("verify-once: passed");

  const gate = evaluateCloseoutGate(taskDir, readOptions);
  printValidationWarnings("closeout", gate.warnings);
  if (!gate.ok) {
    recordCloseoutAttempt(taskDir, "closeout", gate.errors || gate.findings);
    console.error("closeout: FAILED");
    for (const finding of gate.errors || gate.findings || []) {
      console.error(`- ${finding}`);
    }
    // 去教程化（win 改造 §2.4.3）：保留缺口类别 + 合法修复顺序，删除「三种 evidenceRefs
    // 形态校验强度不同」的门禁强度对照——该对照等于把最弱形态的路标递给凑数者。
    console.error(
      `[recover] 以上是 closeout 字段级形态要求。合法修复顺序（逐条凑字段之前先走这个流程）：先跑一次 task-sync 让镜像与视图吸收你刚才的工作（手改视图或 route-state.json 会产生一致性 finding，sync 之后编辑才能让守卫合并你的意图）；然后把已有证据按 evidenceRefs 合法形态写入对应 completionCriteria 并标 hit（形态定义见 docs/reference/acceptance-criteria.md 的 criteria-vocabulary 生成块；不得把同一文件路径填进所有条目——形态门禁不校验「该文件是否真是这条 criterion 的证据」）；successCriteria 标 hit 必须对应真实证据，不得复述 completionCriteria。最后再跑一次 task-sync 吸收字段编辑，然后 task-close --dry-run 看剩余 finding。若同一 finding 连续 2 次 dry-run 未消除，说明是实质问题（证据未闭环）：不要继续凑字段，也不要尝试 task-advance 回退（phase 字段不可回退，task-advance 会硬拒，手改 task.json.phase 也不改变 routeState.execution 判定的阶段义务）——直接在当前阶段补做调查、落盘新证据文件，再用新证据走 evidenceRefs 合法形态；若当前方向确无证据可补，改 closeoutMode=partial/infeasible 并在 report.md「未竟事项」节写清根因与已排除路线。`
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("task-close --dry-run: all gates passed; closeout side effects (state sync/cleanup/archive) skipped");
    process.exit(0);
  }

  const updatedTask = ensureTaskRuntimeShape(readTaskJson(taskDir, readOptions));
  synchronizeCloseoutState(taskDir, updatedTask);

  const removed = cleanupTaskArtifacts(taskDir);
  for (const relPath of removed) {
    console.log(`[cleanup] removed ${relPath}`);
  }

  const archiveResult = archiveTaskSnapshot(taskDir, {
    taskSkillRoot,
    installedSkillRoot
  });
  console.log(`[archive] task snapshot archived -> ${archiveResult.archiveTaskDir}`);
  // R2-2：双安装机器上 resolveInstalledSkillRoot（.codex 优先）可能与执行端 SKILL_BASE 分裂，
  // 打在必被读且已被实证会进最终报告的输出面上；两根一致时静默（含回退 baseRoot 情形）。
  if (path.resolve(installedSkillRoot) !== path.resolve(taskSkillRoot)) {
    console.log(`[archive] 归档根与执行端 SKILL_BASE 不同（执行端=${taskSkillRoot}）；报告与引用归档产物时以上条 [archive] 路径为准。`);
  }

  console.log(`task-close: completed ${relFromRepo(taskDir)}`);
}

await main();
