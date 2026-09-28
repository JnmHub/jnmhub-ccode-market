 # 分阶段工作流详细规则（Phase-Gated Workflow）

本文件承接 `SKILL.md` 中的任务契约、输出和交付规则。`SKILL.md` 保留入口摘要；实际多阶段逆向任务必须按本文件执行。

**report-only 模式（本次改造核心变化）**：过程零落盘义务。不再要求 `run/investigation.md` / `run/plan.md` / `run/assumptions.md` 或任何专题 notes 过程文档，也没有相位出口文档门禁。调查、规划、假设等过程认知汇入收口时的 `report.md`（见下文「完成时报告义务」）。`state/route-state.json` / `state/route-plan.md` / `state/clues.md` 是可选的续跑骨架（断电续跑时有用），写不写不影响收口判定。相位（`task.phase`，合法值见 SKILL.md GENERATED phase-vocabulary 块）仍是任务状态语义与 task-advance 推进方向，只是不再挂文档出口门禁。

所有 `run/xxx`、`state/xxx` 简写路径均相对于 `artifacts/tasks/<task-id>/`。

## 目录

- [调查（Investigate）](#调查investigate)
- [规划（Plan）](#规划plan)
- [实现（Implement）](#实现implement)
- [验证（Verify）](#验证verify)
- [完成时报告义务](#完成时报告义务)
- [任务契约锁定](#任务契约锁定)
- [工具链前置检查](#工具链前置检查)
- [连续推进策略](#连续推进策略)
- [输出格式](#输出格式)
- [语言与交付](#语言与交付)
- [VMP / 强壳脱壳硬闸](#vmp--强壳脱壳硬闸)
- [任务入口](#任务入口)

## 调查（Investigate）

允许：Read、Grep、Glob、IDA/r2 反编译/反汇编、字符串搜索、xref、只读调试、WebSearch、只读命令。

禁止：Write/Edit 任何代码文件，或任何修改目标行为的操作。

调查充分性标准（自律判据，不再是文件门禁）：

1. 至少 1 条完整调用链，覆盖用户目标直接相关路径。
2. 每一步有地址、函数、调用栈、xref、字符串或调试输出锚点。
3. 所有不确定点有明确的验证计划。

调查结论、调用链与不确定点收口时写进 `report.md` 的「实现路径 / 逆向思路」节。不满足时不进入实现。

## 规划（Plan）

允许：继续分析、形成实现计划。

禁止：写 patcher、hook、目标代码或会改变目标行为的脚本。

计划质量要求（自律判据）：

- 每一步能指回调查期的具体发现（函数/地址、算法/逻辑描述、与用户目标的关系）。
- 计划与实际实现收口时写进 `report.md` 的「实现路径」节（写真实路径，含走弯与修正）。

## 实现（Implement）

允许：所有工具，但受调查/规划结论约束。

实现约束：

- 修改目标文件前备份为 `run/<文件名>.clean.bak`。
- 在 `run/backup-manifest.md` 记录原始路径、备份路径、SHA256（哈希断路器以 manifest 为准，机器门禁）。
- 依赖未验证假设的实现，其假设与验证结论收口时写进 `report.md` 的「坑点与经验」节。

## 验证（Verify）

触发时机：

- 每次实现步骤完成后。
- 修改任何影响用户可见行为的代码后。
- 收口前。

验证序列：

1. 启动目标程序或运行修改后的代码。
2. 截图或采集输出。
3. 读取截图/输出内容。
4. 逐条读取 `task.json.completionCriteria`。
5. 在证据中匹配每条 criteria。
6. 任一条不可读或不满足，明确指出「第 N 条未满足」并回到实现或调查。

收口前（机器门禁）：

- 所有 `completionCriteria` 有证据。
- `task.json.completionCriteria[*]` 中每个已满足条目必须写 `evidenceRefs`，引用非空的 task-local 证据文件，或写带原文的 `用户确认:`，或写 `call_xxx` 并同时提供 `evidenceExcerpt`（防伪硬门禁：evidenceRefs 所指文件必须真实存在且非模板占位）。
- 验证结果必须可复现，禁止只写“已验证”“测试通过”；逐条判据的判定与锚点写进 `report.md` 的「验证证据」节。

## 完成时报告义务

收口前 `report.md` 按模板章节一次性写全（这是本模式唯一强制的文档）：

| 章节 | 内容 | 机器校验 |
|---|---|---|
| 任务摘要 | 目标/结论/样本信息/执行方式 | 必备 |
| 实现路径 | 从起点到结论的真实路径（工具、对象、结果） | 必备 |
| 逆向思路 | 为什么走这条路线、关键假设、岔路取舍 | 计入实质内容长度 |
| 任务难点 | 真正卡住过的地方及突破方式 | 计入实质内容长度 |
| 坑点与经验 | 报错/工具/环境坑与可复用教训 | 计入实质内容长度 |
| 验证证据 | 逐条对应 completionCriteria 的判定 + 锚点 | 必备 |
| 专题发现 | 命中 topic 的专题小节（关键词 + 最小长度谓词，见各 `topics/<key>/topic.json` formalValidation） | 命中 topic 时强制 |
| 未竟事项 | 根因 + 已排除路线（逐条附失败证据） | partial/infeasible 时必填 ≥200 字符 |

## 任务契约锁定

首轮必须锁定以下字段到 `task.json`，后续不得弱化：

- `objective`：用户原始目标，保留原话。
- `deliverableTier`：`evidence / hook-script / patch / protocol-doc / pure-algorithm`。
- `completionCriteria`：可验证完成条件，不含模糊词。
- `disallowedFallbacks`：用户否决的方案路线，只增不减。
- `userRejectedApproaches`：用户否决的方法族，不得复活。

`pure-algorithm` 禁止包含：

- `child_process.exec/spawn`
- 注册表操作
- 目标安装路径写入
- 二进制 patch

契约落盘时序：

1. 读取 `reverse-bootstrap.md`、`case-safety-policy.md`、`reverse-workflow.md`。
2. 收集 `target / objective / requirements / boundaries`。
3. 运行 `task-start.mjs`，仅 node 缺失或模块缺失时才手动回退。
4. 读取并验证 `task.json`。
5. 填充契约字段，进行 completionCriteria 反向约束自检。
6. 用户给产品名时，首次搜索前置。
7. 然后开始调查。

步骤 3-5 完成前，不得调用 IDA/radare2 等分析 MCP。

用户否决方案时，下一步必须写入 `task.json.userRejectedApproaches`，记录方法族。例如否决 “IPC handler interception”，后续所有 `ipcMain/ipcRenderer` hook 变体都要声明 `[约束检查]` 后放弃。

## 工具链前置检查

打开 IDA 前先确认目标主要逻辑层：

1. 扫描 Electron/CEF/WebView2/.NET/Native 特征。
2. Electron/CEF/WebView2：JS/V8/资源层优先，补读 `references/web-shell-triage.md` 和 `references/electron-playbook.md`。
3. .NET：dnSpy/ILSpy 优先。
4. 纯 native：再进入 IDA/Ghidra/x64dbg。

Electron 目标的完整工作流见 `references/electron-playbook.md`。VMP/VMProtect 目标见 `references/packers.md`、`references/vmp-unpack-playbook.md` 和 `references/vmp-devirt-playbook.md`。

## 连续推进策略

- 不停在状态汇报。
- `execution.status=ready-to-continue` 时，执行 `nextExecutableAction`。
- 切入点无效时换下一个；全部无效时复盘后生成新切入点（route-plan/clues 为可选续跑骨架，复盘内容收口时汇入 report.md）。
- 止损计数按 `references/anti-shortcut-system.md`「尝试计数语义／路线预算分级」执行：同参重发恒为 0；L2/L3 路线预算未耗尽时，探针无效只 PARK 探针，不判死路线。
- 策略转向在正文说明从 A 转向 B 及原因；收口时写进 `report.md` 的「实现路径 / 坑点与经验」节。
- 转向导致交付梯度降级时，等待用户确认。

## 输出格式

工具调用间最多 1 句话，只说明下一步动作。

初始化完成后的首条工作回复：

```text
阶段: [当前 task.phase]
deliverableTier: [从 task.json 读取]
产物落点: artifacts/tasks/<task-id>/
成功判定: [要拿到什么证据]
收口义务: [report.md 待写章节与专题小节提示]
```

行为纪律（输出标记体系与逐轮落盘义务已删除，round1 P1-7 + report-only 改造）：

- 根源不明却要写绕过代码：禁止，先补齐调查。
- 用户否决：写 task.json（disallowedFallbacks / userRejectedApproaches）。
- completionCriteria 无证据：明确指出第 N 条未满足，补证据后再推进。
- 止损触发：输出根因分析；收口走 partial/infeasible 时写 `report.md` 的「未竟事项」节。

## 语言与交付

所有正文输出与 `report.md` 必须中文，路径、代码块、技术标识符除外。

必须交付（机器门禁强制）：

- `artifacts/tasks/<task-id>/task.json`（契约，判据全部闭合）
- `artifacts/tasks/<task-id>/report.md`（收口报告，实质内容 + 必备章节）
- `artifacts/tasks/<task-id>/run/verify-once.mjs`（task-init 预生成的框架验证线束，禁止覆写；任务自定义验证另建脚本并在 report.md 引用）
- evidenceRefs 所指的全部证据文件（真实存在、非模板占位）

命中 topic 时的专题义务 = `report.md` 的「专题发现」节对应小节，以 `topics/<topic>/topic.json`、`docs/reference/output-contract.md`、`docs/reference/capability-matrix.md` 为准。

## VMP / 强壳脱壳硬闸

命中 VMP、VMProtect、`.vmp`、VM entry、dispatcher、handler、thunk、IAT 模拟层、虚拟化函数或去虚拟化线索时：

1. 规划实现前补读 `references/packers.md` 与 `references/vmp-unpack-playbook.md`。
2. 进入 `virtualized/mixed`、`localized-devirt`、handler 序列或 `cmp/jcc` 语义还原时，补读 `references/vmp-devirt-playbook.md`。
3. 维护 `packerUnpack.vmp.*` 结构化字段与 `run/dump-manifest.json`（机器 manifest 门禁保留）；脱壳/OEP/IAT/去虚拟化的分析内容收口时写进 `report.md` 的「专题发现」节（脱壳/VMP 小节，机器谓词校验）。
4. 若出现异常/闪退/`0xC0000005`/Fault offset，先写 `run/crash-diagnostics.md`（崩溃诊断门禁保留）。

若仍有 active runtime dependency、VMP thunk、dispatcher 或虚拟化关键路径，不能把 clean dump + 自动 Fix IAT 当成最终可运行修复版。

声明技术限制前，必须说明 ScyllaHide/TitanHide、x64dbg/WinDbg trace、VMPDump/vmprofiler/vtil/Triton 等路线的可用性或失败证据（`packerUnpack.vmp.toolRoutes` 评估记录保留；叙事进 report.md）。

## 任务入口

### 标准 task-local 开局

1. 无历史文件：`task-start -> task-init -> task-sync -> task-advance`。
2. 可附带 `--topic=`、`--topics=`、`--local-repro`、`--protocol-replay`、`--task-input=...`。
3. `task-input` 按 schema 强校验。
4. 若 `execution.status=ready-to-continue`，继续执行 `nextExecutableAction`。

### 续跑入口

1. 先读 `task.json` 与 `state/route-state.json`。
2. 再读 `state/route-plan.md`、`state/clues.md`。
3. 执行 `task-sync -> task-advance`。
4. 恢复完成后直接继续活跃阶段。

### 无真实样本演练入口

1. 运行 `npm run task:drill -- --list`。
2. 执行 `npm run task:drill -- <scenario-id> <task-id>`。
3. drill 生成后按普通 task-local 续跑。
