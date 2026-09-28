# 多 Agent 编排参考（multi-agent orchestration）

> 配套协议：`agents/orchestrator.md` / `agents/reverse-worker.md` / `agents/auditor.md`。
> 本文件描述机制层：文件契约、账本格式、门禁判据、模式降级。判据的权威实现是
> `tools/task/lib/collaboration.mjs` 与 `tools/task/lib/ledger.mjs`，本文不复制判据细节，
> 只描述语义；冲突时以代码为准。

## 架构

```
Orchestrator（主 Agent）— 契约与验收
  ├─ task-dispatch --kind=worker  → state/packages/package-NNN.md → Worker subagent
  ├─ task-dispatch --kind=audit   → state/audits/audit-NNN.md     → Auditor subagent
  ├─ task-dispatch --collect=audit-NNN  → verdict 入账本
  └─ task-advance / task-close    ← 门禁读取「文件 × 账本」交叉证据
```

## 文件契约

- 任务包：`state/packages/package-NNN.md`（NNN 从 001 递增，task-dispatch 分配）。
  头部含 `<!-- dispatch: <ledger-event-hash> -->`，证明它由 dispatch 通道产生。
  `## Worker Report` 段由 Worker 追加填写。
- 审计请求：`state/audits/audit-NNN.md`。`audit-kind: phase-gate | completion-claim`。
  `## Auditor Findings` 段与裸行 `verdict: PASS|VIOLATION` 由 Auditor 追加。
- 账本：`<ledger-root>/<task-id>.jsonl`（ledger-root 默认 `~/.win-reverse/ledger`，
  可用 `WIN_REVERSE_LEDGER_ROOT` 覆盖）。append-only 哈希链：
  每行 `{seq, ts, kind, payload, prevHash, hash}`，`hash = sha256(prevHash + 内容)`。
  事件写入后不可回拨——改历史事件会让后续全部 hash 失配。

账本事件 kind：
`dispatch-worker` / `dispatch-audit` / `audit-verdict` / `phase-advance` / `close-attempt`。

## 门禁判据（multi 模式）

### 相位推进（task-advance --to）

1. 本相位内新增 ≥1 个**经 dispatch 通道产生**的任务包；
2. 本相位内新增 ≥1 条 `audit-verdict` 且 verdict=PASS 的账本事件（phase-gate 类）；
3. 时序三判据：
   - `work-before-dispatch`：run/ 非模板、非框架产物的 mtime 早于首个 dispatch-worker 事件；
   - `package-not-dispatched`：任务包头部哈希不在账本中；
   - `audit-not-dispatched`：审计文件头部哈希不在账本中。

「本相位内」的锚点：最近一次 `phase-advance` 账本事件（无则任务创建时间）。

### 完成宣称（task-close）

上述全部 + 存在 completion-claim 类 `audit-verdict: PASS`。

### 对账（报告指纹，不硬拦）

close 时把账本相位事件序列与 route-state/task.json 的 phase 对账，
不一致项以 `⚠` 列入 report.md 对账段——机制目标是抬高伪造成本 + 留可审计形态，
不是绝对防伪（无密钥，主上下文理论上可全链伪造；见方案文档 §六）。

## 模式降级

- `executionModel.concurrency`：`single`（**新任务默认**，round1 P0-1）/ `multi`（显式 opt-in：`task-init/task-start --execution-model=multi`，init 会打印能力自检清单——宿主 subagent 通道、IDB 独占文件锁、每相位约 +5 步簿记开销；清单为启用前置确认，机器不阻断）。
- 历史任务（无该字段）与 single 任务：协作门禁**整体跳过**（advance/close 不评估、不建账本、无 WARNING 噪音——账本不存在是 single 的设计态而非异常态）；`task-sync` 的协作摘要行仅 multi 任务出现。
- single 模式不豁免硬门禁（契约锁、哈希断路器、crash 门禁、close 咽喉）。
- 逃生通道：`task-init/task-start --execution-model=single` 或环境变量 `WIN_REVERSE_EXECUTION_MODEL=single`（flag 优先于环境变量）。
- N7 口径：切换前已有账本的 single 任务——账本继续记录相位历史（append-only 不回拨），但**不参与任何门禁**。

## drill 双轨

drill 演练任务（`task-drill` 产生）无真实样本：审计判据按演练语义核对
（产物存在性/非模板/报告完整），不要求真实样本测量值。
Worker 不得为 drill 任务伪造「实测值」。

## 审计节奏

只在两个窄门审计：相位切换前（phase-gate）与完成宣称前（completion-claim）。
VIOLATION 后修复必重审；连续 2 次 PASS 恢复正常节奏。
