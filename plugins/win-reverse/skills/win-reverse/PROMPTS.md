# Windows Reverse Prompts

> 消费者定性（round1 P2-10/N4）：本文件是**人类上手参考 + agent preset 注入候选素材**，
> 不是运行时契约；机器契约单源在 `SKILL.md` 的 GENERATED 块与 `docs/reference/acceptance-criteria.md`。
> 场景模板收敛为 5 个代表（新建 / 续跑 / drill 演练 / 多专题组合 / 收口预检）——playbook
> 读取率列入 round2 观察指标，作为二次收敛回调条件。

默认进入流程：

<!-- BEGIN GENERATED: default-flow -->
1. 必读 `SKILL.md`；`reverse-bootstrap / reverse-workflow / case-safety-policy` 为强烈建议首读
2. 新任务走 `task-start（自动转发 task-init）→ task-sync → task-advance`；续跑任务走 `task.json -> route-state.json -> task-sync -> task-advance`
3. `task-input` 按 schema 强校验；`task-sync` 前锁定契约五字段 `target / objective / deliverableTier / completionCriteria / boundaries`，并先裁定 `architecture / wow64 / managed / protectionTier`
4. 先列 `entrypoints`，再做最小 probe
5. 命中 `mixed-mode / ipc / exception / memory` 时先补读对应 playbook
6. 过程零落盘义务：唯一强制文档产物 = `report.md`（收口时按骨架章节一次性写全任务总结）；若 `execution.status=ready-to-continue`，继续执行 `nextExecutableAction`；正式收口前先 `task-close --dry-run`
<!-- END GENERATED: default-flow -->

## 提示词使用原则

- 先说明目标、样本路径、授权边界、希望拿到的证据或交付物
- 契约五字段在 `task-sync` 前锁定；`completionCriteria` 用对象形 `{"text":...,"status":"pending"}` 单一形状
- 需要续跑时直接给出 `task-id` 或 `artifacts/tasks/<task-id>/`
- 无真实样本时明确要求走 `task:drill`（`task-drill --list` 查看）
- 正式收口前先跑 `task-close --dry-run` 预检
- 多 Agent 协作为显式 opt-in：新任务默认 single；确需协作传 `--execution-model=multi`

## 场景化提示词模板（5 个代表）

### 1. 新建任务

```text
请按 win-reverse 标准流程启动一个新任务（task-start -> task-sync -> task-advance）。
目标：分析已授权的 Windows x64 样本 <路径>。
诉求：<一句话成功判据方向>。
要求：锁定契约五字段（completionCriteria 用对象形）；列出 2~5 个 entrypoints 并排序；
本轮证据落到 artifacts/tasks/<task-id>/。边界：不做未授权利用与破坏性操作。
```

### 2. 续跑任务

```text
请恢复 win-reverse 任务 artifacts/tasks/<task-id>/：
先读 task.json 与 state/route-state.json（clues.md 为可选的 append-only 线索账本），
随后 task-sync -> task-advance；execution.status=ready-to-continue 时直接执行
nextExecutableAction，不要停在状态汇报。本轮目标：<推进点>。
```

### 3. 无真实样本的 drill 演练

```text
没有真实样本但要模拟真实推进：运行 task-drill --list，选择 <scenario-id> 后
task-drill <scenario-id> <task-id>，再按 task.json -> route-state.json ->
task-sync -> task-advance 的标准闭环继续推进。
```

### 4. 多专题组合任务

```text
请创建命中 <topic-a、topic-b、topic-c> 的 win-reverse 任务（--topics=... --local-repro）。
目标：<样本路径与诉求>。要求：收口时 report.md 的「专题发现」节为每个命中 topic
写对应专题小节（谓词见 topics/<key>/topic.json 的 formalValidation）；
按 init 打印的 [closeout-obligations] 清单推进收口义务。
```

### 5. 收口预检

```text
请对 artifacts/tasks/<task-id>/ 执行 task-close --dry-run，把剩余 finding 一次性修完
（对照 [closeout-obligations] 清单与 docs/reference/acceptance-criteria.md），
确认 verify-once 通过、判据带合法 evidenceRefs、report.md 按骨架章节写全实质总结
（难点/思路/坑点/实现路径/验证证据，不再是骨架模板）后，正式 task-close 收口。
```
