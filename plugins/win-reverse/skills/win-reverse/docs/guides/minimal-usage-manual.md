# 最小使用手册（minimal manual）﻿​‌​​​​‌‌​​‌‌​‌‌‌​‌​‌​‌‌​​‌​‌‌​​​​‌​​​‌​‌​‌​‌​​‌​​‌‌‌​‌‌‌​‌​‌‌​​‌​​‌‌‌​​​​‌​​‌​‌‌​‌‌‌​‌‌‌​‌‌‌​​‌‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌​‌​​‌​‌‌​‌​​​​‌​​​‌‌‌​‌‌‌​‌​​​‌‌​​​‌​​‌​​‌​‌‌​‌​​‌‌​​​‌‌‌​‌​‌​‌​​​​‌‌​‌​​​‌‌​​‌‌​‌‌‌‌​‌​‌‌​​‌​​‌‌​​​‌​‌​​​‌​​​‌​​​​‌‌​‌‌‌​​​‌​‌‌​‌​​‌​‌‌‌​‌‌​​‌​‌​​‌‌​‌‌‌​‌​​​‌‌​​‌‌​​​‌‌​​‌​​‌‌‌​​‌​​‌‌​​​‌‌​‌​​‌‌​‌​‌‌‌​‌‌​​‌​‌​​​​​‌​‌​​‌​​​‌‌​​‌​​‌‌​‌​​​​‌​‌​​‌‌​​‌‌‌​​‌​‌​‌‌​​​​‌​‌​​​‌​‌‌​​‌​‌​‌​​​‌​​​‌‌​​‌​​​‌​​‌‌​‌​​‌‌​‌​‌​‌‌​​‌‌‌​‌​‌‌​​‌​‌​​‌​‌‌​‌‌​‌​‌​​‌​​​​‌​​​‌‌​​​​​​‌‌​‌‌‌​‌‌​‌​‌‌​‌‌‌​‌‌​​‌​​​‌‌​​‌‌​​​‌​​‌​‌​‌‌‌​‌​​‌‌​‌​​‌‌​‌‌‌​‌​‌‌​​​​‌‌‌​‌‌‌​‌‌‌​‌​​​‌​​​‌‌‌​‌​​‌‌​​​‌‌​​​‌‌​‌‌​​‌‌‌​​‌‌‌​​‌​‌‌​‌‌​​​‌​‌​​‌​​‌‌‌​‌​​​‌‌‌​​‌‌​‌​‌​‌‌​​‌‌​​‌​​​‌‌​‌​‌​​‌​‌‌​​‌​‌​​‌​​​​‌​‌‌​​​​‌‌‌​‌‌‌​​‌‌‌‌​‌​​‌‌‌‌​‌‌‌​​‌​‌‌​​‌‌‌​​‌‌‌​‌‌​‌‌​​​‌​​​‌‌‌​​‌​‌​‌‌‌​​‌​‌​​​​‌​‌​‌‌‌‌‌‌​‌‎

> round1 P2-10 收敛：本文件由 getting-started / task-lifecycle / minimal-usage-manual 三合一，
> 是 docs/guides/ 唯一篇目；收敛上限 = boilerplate 层。规则单源在 SKILL.md 与
> docs/reference/acceptance-criteria.md，本手册只保留上手路径与日常检查。

## 1. 适用场景

PE/EXE/DLL/SYS/.NET/Mixed-Mode 样本逆向；壳/OEP/dump/IAT；抗分析；Frida 动态取证；
Loader/注入；服务与 IPC 控制面；内存取证；配置/许可证恢复；继续已有 task-local。
（完整触发面见 SKILL.md「何时必须触发」。）

## 2. 新任务

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

开工提示里的 `[closeout-obligations]` 清单是收口义务的事前版——按清单推进可把 dry-run 剩余 finding 压到接近零。

## 3. 继续已有任务﻿​‌​​​​‌‌​​‌‌​‌‌‌​‌​‌​‌‌​​‌​‌‌​​​​‌​​​‌​‌​‌​‌​​‌​​‌‌‌​‌‌‌​‌​‌‌​​‌​​‌‌‌​​​​‌​​‌​‌‌​‌‌‌​‌‌‌​‌‌‌​​‌‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌​‌​​‌​‌‌​‌​​​​‌​​​‌‌‌​‌‌‌​‌​​​‌‌​​​‌​​‌​​‌​‌‌​‌​​‌‌​​​‌‌‌​‌​‌​‌​​​​‌‌​‌​​​‌‌​​‌‌​‌‌‌‌​‌​‌‌​​‌​​‌‌​​​‌​‌​​​‌​​​‌​​​​‌‌​‌‌‌​​​‌​‌‌​‌​​‌​‌‌‌​‌‌​​‌​‌​​‌‌​‌‌‌​‌​​​‌‌​​‌‌​​​‌‌​​‌​​‌‌‌​​‌​​‌‌​​​‌‌​‌​​‌‌​‌​‌‌‌​‌‌​​‌​‌​​​​​‌​‌​​‌​​​‌‌​​‌​​‌‌​‌​​​​‌​‌​​‌‌​​‌‌‌​​‌​‌​‌‌​​​​‌​‌​​​‌​‌‌​​‌​‌​‌​​​‌​​​‌‌​​‌​​​‌​​‌‌​‌​​‌‌​‌​‌​‌‌​​‌‌‌​‌​‌‌​​‌​‌​​‌​‌‌​‌‌​‌​‌​​‌​​​​‌​​​‌‌​​​​​​‌‌​‌‌‌​‌‌​‌​‌‌​‌‌‌​‌‌​​‌​​​‌‌​​‌‌​​​‌​​‌​‌​‌‌‌​‌​​‌‌​‌​​‌‌​‌‌‌​‌​‌‌​​​​‌‌‌​‌‌‌​‌‌‌​‌​​​‌​​​‌‌‌​‌​​‌‌​​​‌‌​​​‌‌​‌‌​​‌‌‌​​‌‌‌​​‌​‌‌​‌‌​​​‌​‌​​‌​​‌‌‌​‌​​​‌‌‌​​‌‌​‌​‌​‌‌​​‌‌​​‌​​​‌‌​‌​‌​​‌​‌‌​​‌​‌​​‌​​​​‌​‌‌​​​​‌‌‌​‌‌‌​​‌‌‌‌​‌​​‌‌‌‌​‌‌‌​​‌​‌‌​​‌‌‌​​‌‌‌​‌‌​‌‌​​​‌​​​‌‌‌​​‌​‌​‌‌‌​​‌​‌​​​​‌​‌​‌‌‌‌‌‌​‌‎

<!-- BEGIN GENERATED: bootstrap-resume-task -->
1. 先读 `task.json` 与 `state/route-state.json`
2. 再把 `state/route-plan.md`、`state/clues.md` 作为派生视图补充查看
3. 执行 `node "<SKILL_BASE>/tools/task/task-sync.mjs" <task-id>`
4. 执行 `node "<SKILL_BASE>/tools/task/task-advance.mjs" <task-id>`
5. 若 `execution.status=ready-to-continue`，必须继续执行 `nextExecutableAction`，不要停在“已恢复”
6. 只有 `pauseCategory=user/risk`、缺样本或 closeout 已完成时，才允许暂停等待用户
<!-- END GENERATED: bootstrap-resume-task -->

`state/clues.md` 是 agent 可直写的 append-only 线索账本：自由追加一行一线索；
结构化 `## CLUE-NNN` 段会被 sync 单向吸收进 route-state.json。

## 4. 无真实样本的 drill

<!-- BEGIN GENERATED: bootstrap-drill-task -->
1. 运行 `node "<SKILL_BASE>/tools/task/task-drill.mjs" --list`
2. 选择 drill 后执行 `node "<SKILL_BASE>/tools/task/task-drill.mjs" <scenario-id> <task-id>`
3. 再按 `task.json -> route-state.json -> task-sync -> task-advance` 的标准闭环继续推进
<!-- END GENERATED: bootstrap-drill-task -->

## 5. 任务生命周期闭环

标准闭环（叙事步骤 ≠ 机器 phase）：`Init → Sync → Advance → Observe → Capture → Rebuild
→ Patch → PureExtraction → Port → Close`。要点：

- `Init/Sync/Advance/Close` 是工具命令叙事；机器合法 phase 仅 GENERATED 块中 6 个值
- Observe 并行新增 Web 套壳指纹线（安装目录大量 js/html/css/asar/pak 时）﻿​‌​​​​‌‌​​‌‌​‌‌‌​‌​‌​‌‌​​‌​‌‌​​​​‌​​​‌​‌​‌​‌​​‌​​‌‌‌​‌‌‌​‌​‌‌​​‌​​‌‌‌​​​​‌​​‌​‌‌​‌‌‌​‌‌‌​‌‌‌​​‌‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌​‌​​‌​‌‌​‌​​​​‌​​​‌‌‌​‌‌‌​‌​​​‌‌​​​‌​​‌​​‌​‌‌​‌​​‌‌​​​‌‌‌​‌​‌​‌​​​​‌‌​‌​​​‌‌​​‌‌​‌‌‌‌​‌​‌‌​​‌​​‌‌​​​‌​‌​​​‌​​​‌​​​​‌‌​‌‌‌​​​‌​‌‌​‌​​‌​‌‌‌​‌‌​​‌​‌​​‌‌​‌‌‌​‌​​​‌‌​​‌‌​​​‌‌​​‌​​‌‌‌​​‌​​‌‌​​​‌‌​‌​​‌‌​‌​‌‌‌​‌‌​​‌​‌​​​​​‌​‌​​‌​​​‌‌​​‌​​‌‌​‌​​​​‌​‌​​‌‌​​‌‌‌​​‌​‌​‌‌​​​​‌​‌​​​‌​‌‌​​‌​‌​‌​​​‌​​​‌‌​​‌​​​‌​​‌‌​‌​​‌‌​‌​‌​‌‌​​‌‌‌​‌​‌‌​​‌​‌​​‌​‌‌​‌‌​‌​‌​​‌​​​​‌​​​‌‌​​​​​​‌‌​‌‌‌​‌‌​‌​‌‌​‌‌‌​‌‌​​‌​​​‌‌​​‌‌​​​‌​​‌​‌​‌‌‌​‌​​‌‌​‌​​‌‌​‌‌‌​‌​‌‌​​​​‌‌‌​‌‌‌​‌‌‌​‌​​​‌​​​‌‌‌​‌​​‌‌​​​‌‌​​​‌‌​‌‌​​‌‌‌​​‌‌‌​​‌​‌‌​‌‌​​​‌​‌​​‌​​‌‌‌​‌​​​‌‌‌​​‌‌​‌​‌​‌‌​​‌‌​​‌​​​‌‌​‌​‌​​‌​‌‌​​‌​‌​​‌​​​​‌​‌‌​​​​‌‌‌​‌‌‌​​‌‌‌‌​‌​​‌‌‌‌​‌‌‌​​‌​‌‌​​‌‌‌​​‌‌‌​‌‌​‌‌​​​‌​​​‌‌‌​​‌​‌​‌‌‌​​‌​‌​​​​‌​‌​‌‌‌‌‌‌​‌‎
- 每阶段先落盘再推进；切入点无效先切换、全无效先复盘再生成
- Close：dry-run 预检一次修完 finding 后正式收口；closeout 自动修复 report 必填段并归档快照

<!-- BEGIN GENERATED: phase-vocabulary -->
本段由 `tools/task/common.mjs` 的 `phaseOrder` 与 `phaseAliases` 单源生成（sync-doc-facts 注入，勿手改）。

合法 `task.phase` 值（6 个，机器门禁只认这些）：
- `Observe`
- `Capture`
- `Rebuild`
- `Patch`
- `PureExtraction`
- `Port`

别名映射（写入时会被 normalizePhaseName 静默归一化，未知值原样保留并视为非法）：
- `init` → `Observe`
- `sync` → `Observe`
- `observe` → `Observe`
- `capture` → `Capture`
- `rebuild` → `Rebuild`
- `patch` → `Patch`
- `pureextraction` → `PureExtraction`
- `pure-extraction` → `PureExtraction`
- `port` → `Port`﻿​‌​​​​‌‌​​‌‌​‌‌‌​‌​‌​‌‌​​‌​‌‌​​​​‌​​​‌​‌​‌​‌​​‌​​‌‌‌​‌‌‌​‌​‌‌​​‌​​‌‌‌​​​​‌​​‌​‌‌​‌‌‌​‌‌‌​‌‌‌​​‌‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌​‌​​‌​‌‌​‌​​​​‌​​​‌‌‌​‌‌‌​‌​​​‌‌​​​‌​​‌​​‌​‌‌​‌​​‌‌​​​‌‌‌​‌​‌​‌​​​​‌‌​‌​​​‌‌​​‌‌​‌‌‌‌​‌​‌‌​​‌​​‌‌​​​‌​‌​​​‌​​​‌​​​​‌‌​‌‌‌​​​‌​‌‌​‌​​‌​‌‌‌​‌‌​​‌​‌​​‌‌​‌‌‌​‌​​​‌‌​​‌‌​​​‌‌​​‌​​‌‌‌​​‌​​‌‌​​​‌‌​‌​​‌‌​‌​‌‌‌​‌‌​​‌​‌​​​​​‌​‌​​‌​​​‌‌​​‌​​‌‌​‌​​​​‌​‌​​‌‌​​‌‌‌​​‌​‌​‌‌​​​​‌​‌​​​‌​‌‌​​‌​‌​‌​​​‌​​​‌‌​​‌​​​‌​​‌‌​‌​​‌‌​‌​‌​‌‌​​‌‌‌​‌​‌‌​​‌​‌​​‌​‌‌​‌‌​‌​‌​​‌​​​​‌​​​‌‌​​​​​​‌‌​‌‌‌​‌‌​‌​‌‌​‌‌‌​‌‌​​‌​​​‌‌​​‌‌​​​‌​​‌​‌​‌‌‌​‌​​‌‌​‌​​‌‌​‌‌‌​‌​‌‌​​​​‌‌‌​‌‌‌​‌‌‌​‌​​​‌​​​‌‌‌​‌​​‌‌​​​‌‌​​​‌‌​‌‌​​‌‌‌​​‌‌‌​​‌​‌‌​‌‌​​​‌​‌​​‌​​‌‌‌​‌​​​‌‌‌​​‌‌​‌​‌​‌‌​​‌‌​​‌​​​‌‌​‌​‌​​‌​‌‌​​‌​‌​​‌​​​​‌​‌‌​​​​‌‌‌​‌‌‌​​‌‌‌‌​‌​​‌‌‌‌​‌‌‌​​‌​‌‌​​‌‌‌​​‌‌‌​‌‌​‌‌​​​‌​​​‌‌‌​​‌​‌​‌‌‌​​‌​‌​​​​‌​‌​‌‌‌‌‌‌​‌‎
- `close` → `Port`
- `completed` → `Port`

非法值声明：`RouteSync` / `Init` / `Sync` / `Advance` / `Close` / `Verify` / `Plan` / `Implement` 不是合法 `task.phase` 值——`Init`/`Sync`/`Advance`/`Close` 是叙事步骤（工具命令），`Verify`/`Plan`/`Implement` 是活动名；验证活动发生在 `Patch` / `Port` 阶段内部，不单独占相位。

叙事 A-D 门控与机器 phase 的对应（report-only 改造：过程文档出口义务已退役，阶段语义为推进方向，验收集中在收口 report.md；与 `docs/reference/reverse-workflow.md` 映射表同源收敛）：
- `RouteSync` / `Observe` / `Capture` ↔ 阶段 A（调查）：调查充分性靠自律（至少 1 条带锚点调用链），收口汇入 report.md「实现路径 / 逆向思路」节
- `Rebuild` ↔ 阶段 B（规划）→ 阶段 C（实现）：实现类 tier 另需 `run/run-local.mjs`（机器门禁保留）
- `Patch` / `PureExtraction` / `Port` ↔ 阶段 C（实现）：修改前备份 + backup-manifest（机器门禁保留），假设收口前全部有结论并写入 report.md「坑点与经验」节
- `Close`（叙事步骤，非 phase）↔ 阶段 D（验证）：证据覆盖全部 completionCriteria，逐条判定写进 report.md「验证证据」节
<!-- END GENERATED: phase-vocabulary -->

补充约束：
- 运行中 task-local 必须放在当前用户 workspace；cwd 落在 skill 目录内时先改 `WIN_REVERSE_WORKSPACE_ROOT`
- 每次 `task-sync` 后看 `execution.status`；`ready-to-continue` 必须继续执行 `nextExecutableAction`
- `interactiveUnlockRequired` 只是环境门槛，不自动造成 `blocked-on-user`
- closeout 完成后任务同步到 `execution.status=completed`，不留 `ready-to-continue`

## 6. 每次工作至少要做什么

- 明确当前 phase 与产物落点 `artifacts/tasks/<task-id>/`
- 在 Observe 裁定 `architecture / wow64 / managed / kernelMode / protectionTier`
- 关键证据写入 artifact 与 VERIFICATION.txt，不只留在对话里
- 收口前更新 report.md；命中专题时补齐「专题发现」节的对应专题小节（谓词见 `topics/<key>/topic.json` formalValidation）
- 结束前核对：report 已更新、verify-once 可过、判据带合法 evidenceRefs、线索影响已记录

## 7. 最常用命令

```bash
node "<SKILL_BASE>/tools/task/task-start.mjs" <task-id>
node "<SKILL_BASE>/tools/task/task-start.mjs" <task-id> --topics=static-triage,packer-unpack --local-repro
node "<SKILL_BASE>/tools/task/task-drill.mjs" --list
node "<SKILL_BASE>/tools/task/task-sync.mjs" <task-id>
node "<SKILL_BASE>/tools/task/task-advance.mjs" <task-id> --json
node "<SKILL_BASE>/tools/task/task-close.mjs" <task-id> --dry-run   # 预检
node "<SKILL_BASE>/tools/task/task-close.mjs" <task-id>             # 正式收口
npm run check        # 快层静态检查（秒级）；npm run check:full 含行为套件（cwd 为 skill 仓库根目录时）
```
