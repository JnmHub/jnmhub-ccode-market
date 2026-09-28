# 自动化入口

遇到新任务时，先做以下动作：

1. 确认目标边界：URL、请求、动作、登录态、时间窗、禁止操作
2. 先查看 `docs/reference/capability-matrix.md`，确认命中的专题当前是 `guided`、`closed-loop` 还是 `synthetic-e2e`
3. 判断当前阶段是否为 `Observe`
4. 执行唯一开机命令：`node $TOOL_DIR/task-init.mjs <task-id>`（幂等：建任务目录 `artifacts/tasks/<task-id>/` + report.md 骨架）
   如果当前 workspace 只是外部空目录，也仍然直接初始化；不要要求该目录额外包含 `tools/task/`。此时 `task-init.mjs` 来自 skillRoot，task-local 落到该 workspace 的 `artifacts/tasks/<task-id>/`
5. 开始页面观察与取证；产物随手写进任务目录

如果命中的只是 `guided` 专题，不要在开局就默认它已经具备完整 synthetic 场景或发布级闭环。

新任务不要直接跳到：

- 本地补环境
- 全量断点
- 纯算法提纯
- Python 迁移

## 续跑判定

`artifacts/tasks/*/report.md` 仍为骨架（含「骨架生成于」标记）= 存在未完成任务：对同一 task-id 再跑一次 `task-init` 锚定后继续。report.md 已填充 = 任务已收尾；确需新任务时换新 task-id 再 boot。
