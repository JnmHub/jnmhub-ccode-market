<!-- publish: framework -->
# Reverse Bootstrap

新会话首读约定：必读最小集为 `SKILL.md`；`docs/reference/acceptance-criteria.md` 为按需查阅的机器校验规则总表（关键词表已内嵌于 SKILL.md 的 GENERATED criteria-vocabulary 块与 pre-gate WARN fix 文案）；以下 bootstrap 四篇为强烈建议：

1. `docs/reference/reverse-bootstrap.md`
2. `docs/reference/case-safety-policy.md`
3. `docs/reference/reverse-workflow.md`
4. 如已进入纯提取，再读 `docs/reference/pure-extraction.md`

## 新任务 / 首次建 task-local

- task-local 必须建在当前用户 workspace 下；若当前 cwd 位于 skill 安装目录/仓库目录，先设置 `WIN_REVERSE_WORKSPACE_ROOT`
- 未显式允许时，不要把运行中任务直接写到 `~/.codex/skills/win-reverse/artifacts/tasks`

<!-- BEGIN GENERATED: bootstrap-new-task -->
1. 阅读 `SKILL.md`
2. 阅读 `docs/reference/reverse-bootstrap.md`
3. 开局链条统一为 `task-start（自动转发 task-init）→ task-sync → task-advance`；若当前 workspace 没有 history data files，执行 `node "<SKILL_BASE>/tools/task/task-start.mjs" <task-id>`
4. 如果已知 topic 或交付约束，可一并传 `--topic=`、`--topics=`、`--local-repro`、`--protocol-replay`、`--task-input=...`
5. `task-start` 在无历史文件时转发到 `task-init`；若 workspace 已有 history data files，则默认阻止新建第二个 task-local，除非显式传 `--force-new-task`
6. 在进入 `task-sync` 前锁定机器校验的契约五字段：`target / objective / deliverableTier / completionCriteria / boundaries`（逐字段形状以 task-sync 输出的 pauseReason 为准，单源定义见 `tools/task/route-state.mjs` 的 `CONTRACT_FIELD_HINTS`；`disallowedFallbacks / userRejectedApproaches` 推荐记录但无机器校验），并尽量同时确定 `runtime.architecture / runtime.wow64 / runtime.managed / protectionTier`
7. 执行 `node "<SKILL_BASE>/tools/task/task-sync.mjs" <task-id>`
8. 执行 `node "<SKILL_BASE>/tools/task/task-advance.mjs" <task-id>`
9. 若 `execution.status=ready-to-continue`，直接执行 `nextExecutableAction`，不要停在状态汇报
<!-- END GENERATED: bootstrap-new-task -->

## 继续已有任务

<!-- BEGIN GENERATED: bootstrap-resume-task -->
1. 先读 `task.json` 与 `state/route-state.json`
2. 再把 `state/route-plan.md`、`state/clues.md` 作为派生视图补充查看
3. 执行 `node "<SKILL_BASE>/tools/task/task-sync.mjs" <task-id>`
4. 执行 `node "<SKILL_BASE>/tools/task/task-advance.mjs" <task-id>`
5. 若 `execution.status=ready-to-continue`，必须继续执行 `nextExecutableAction`，不要停在“已恢复”
6. 只有 `pauseCategory=user/risk`、缺样本或 closeout 已完成时，才允许暂停等待用户
<!-- END GENERATED: bootstrap-resume-task -->

## 无真实样本的演练入口

<!-- BEGIN GENERATED: bootstrap-drill-task -->
1. 运行 `node "<SKILL_BASE>/tools/task/task-drill.mjs" --list`
2. 选择 drill 后执行 `node "<SKILL_BASE>/tools/task/task-drill.mjs" <scenario-id> <task-id>`
3. 再按 `task.json -> route-state.json -> task-sync -> task-advance` 的标准闭环继续推进
<!-- END GENERATED: bootstrap-drill-task -->
