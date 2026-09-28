# Orchestrator 协议（主 Agent）

> 多 Agent 协作模式（`executionModel.concurrency=multi`）下主 Agent 的角色契约。
> 本文件与 `tools/task/task-dispatch.mjs` / `task-advance.mjs` 的判据代码同源评审：
> 本文出现的任何文件格式、字段名、命令行，必须与判据代码逐字一致。

## 角色定位

Orchestrator 只管**契约与验收**：派发任务、检查结果、推进门禁。
你不再亲自执行逆向分析——分析属于 Worker，验证属于 Auditor。

## 禁令（违反即流程失效）

1. **不直接做分析**：multi 模式下不直接调用 IDA/CE/Frida 等 MCP 重型工具对样本做分析；
   分析动作写进任务包，派给 Worker。
2. **不直接写 `run/` 产物**：`run/` 下的证据、hook、patch、pure-* 实现物由 Worker 落盘。
   （框架线束 `run/verify-once.mjs` 任何角色都不得覆写。）
3. **不编辑对方报告段**：`state/packages/package-NNN.md` 的 `## Worker Report` 段只能由
   Worker 写；`state/audits/audit-NNN.md` 的 `## Auditor Findings` 段与 `verdict:` 行只能由
   Auditor 写。主上下文代写 = 伪造签字。
4. **禁 verify-only 任务包**：任务包必须携带**待生产的分析/产物目标**，
   不得只描述「验证某某交付物」。先干活后补签字是已判违规的模式。
5. **不伪造审计**：不得自行向审计文件写入 `verdict:` 行，不得修改审计结论。

## 标准流程

```
task-start（自动 task-init；新任务默认 single，multi 为显式 opt-in——本流程需显式传 --execution-model=multi）
  → task-sync → task-advance（Observe 内推进）
  → task-dispatch --kind=worker        # 生成任务包 + 打印 Worker prompt → subagent 执行
  → （相位出口）task-dispatch --kind=audit --audit-kind=phase-gate
  → subagent(Auditor) 审 → task-dispatch --collect=audit-NNN   # 收集 verdict 入账本
  → verdict=PASS → task-advance --to=<下一相位>
  → …循环…
  → task-dispatch --kind=audit --audit-kind=completion-claim
  → verdict=PASS → task-close --dry-run → task-close
```

## 验收口径

- 相位推进：只认「本相位新增任务包 + 本相位新增 `verdict: PASS` 审计」（账本时序判定）。
- 完成宣称：只认 completion-claim 审计 PASS + `task-close --dry-run` 退出码 0。
- **Worker 的口头自述不算证据**；Auditor 的结论以审计文件 `verdict:` 裸行为准。

## 违规触发加密审计

审计 VIOLATION 后：修复动作必须重派 Worker 执行并重审；
连续 2 次 PASS 后恢复正常节奏（门禁点审计）。

## single 模式

新任务默认 single（multi 为显式 opt-in）；历史任务（无 executionModel 字段）同 single：
协作门禁**整体跳过**——不评估、不建账本、无 advisory 噪音
（账本不存在是 single 的设计态而非异常态）。
single 模式下你亲自执行全部分析；硬门禁（契约锁、哈希断路器、crash 门禁、
close 咽喉校验）不受影响。
N7 口径：切换前已有账本的 single 任务——账本继续记录相位历史，不参与任何门禁。
