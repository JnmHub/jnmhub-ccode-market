## VMP 局部去虚拟化 Playbook

适用触发：`references/vmp-unpack-playbook.md` 判定 `packerUnpack.vmp.mode=virtualized/mixed`、`runtimeDependency.status=active`，或任务中出现 handler 序列、`cmp/jne` 语义还原、`vpc/vsp/vkey/vbase`、VR / VSP、VM bytecode、p-code、Triton / VTIL / Dna / NoVmp 等线索时，必须补读本文件。

### 目标边界

VMP 去虚拟化默认按“局部关键路径”处理，不把全程序自动还原作为默认承诺。目标是把一个入口、一个分支簇或一个算法片段从 VM trace 还原成可验证语义，并明确当前等级：

- `trace-only`：只有可复现 trace，尚未完成 handler 分割。
- `handler-map`：已分割 handler，并能解释 handler 输入输出。
- `semantic-fragment`：已恢复局部语义，但分支或 flags 仍未完全验证。
- `branch-verified`：已恢复 `cmp/jcc`、flags、目标分支和边界样例。
- `native-rebuild-candidate`：语义足以重写或 patch 回 native 代码。
- `blackbox-boundary`：去虚拟化成本超过目标，仅保留输入、输出、副作用和调用边界。

### 执行路线

1. Trace 捕获
   - 用 x64dbg / WinDbg / Frida Stalker / 自定义 trace 捕获一个最小入口的成功与失败路径。
   - 保存 trace 文件路径、触发输入、断点位置、线程、模块基址、VMP 区段范围。
   - 若 trace 无法覆盖目标分支，结论只能停在 `trace-only` 或 `blackbox-boundary`。

2. Handler 分割
   - 以 VM bytecode 读取、滚动 key 更新、间接跳转 / `push; ret` 调度、handler 返回调度器为切分边界。
   - 给每段 handler 记录入口 VA、退出 VA、读取的 bytecode 偏移、写入的 VM context 偏移。
   - 对融合 handler，先按 taint 传播拆出“地址计算、取数、语义运算、写回、调度”五类动作。

3. VM 状态寄存器识别
   - 明确 `vpc`、`vsp`、`vkey`、`vbase` 的物理寄存器或 context 偏移。
   - 记录寄存器轮转、运行中替换、临时保存恢复的证据，不能假设整段 trace 寄存器恒定。
   - 识别 `VRLIMIT` / virtual register 区间，建立 `VR0..VRn` 到 context 偏移的映射。

4. 污点与简化
   - 保留 tainted VM bytecode、VM context、virtual register、flags、分支目标相关指令。
   - 丢弃无关垃圾指令前，必须说明其输入不影响 VM 状态或 native 可观察输出。
   - 特殊指令如 `CPUID`、`RDTSC/RDTSCP`、`RDRAND/RDSEED`、异常触发指令应单独记录，不直接当垃圾删除。

5. 语义恢复
   - 将 handler / p-code 序列还原为中间语义，例如 `VR3 = VR1 + imm`、`ZF/SF/CF/OF = cmp(VR2, imm)`。
   - 遇到 `cmp/jne`、`test/jcc`、条件 move 或异常分支时，必须恢复 flags 来源和两个分支目标。
   - 对内存读写记录基址、偏移、宽度、符号性和别名风险。

6. 验证闭环
   - 至少用两组输入或一组成功/失败路径对比 VM trace 与还原语义。
   - `branch-verified` 需要同时给出 flags 结果、跳转方向、目标块和边界输入。
   - 若准备 patch / 重写 native，先记录原入口、替换范围、调用约定、保存寄存器、异常和 TLS / runtime 依赖。

### 产物要求

- 更新 `packerUnpack.vmp.devirtualization`（结构化字段门禁保留）；devirt 的 trace 边界、分割依据与验证结论收口时写入 `report.md` 的「专题发现」节（脱壳/VMP 小节）。
- `traceFiles` 至少记录原始 trace、过滤后 trace 或脚本输出中的一种。
- `specialRegisters` 必须有 `vpc/vsp/vkey/vbase` 的值或“无法确认”的证据说明。
- `handlerSegmentation` 必须说明分割状态、handler 数量和分割依据。
- `semanticsRecovered`、`flagsRecovered`、`branchTargets`、`validationEvidence` 只写已验证结论，不写愿望。

### 反捷径规则

- 只有 OEP、dump 或自动 Fix IAT，不等于完成去虚拟化。
- 只有调用现成 devirtualizer 工具名，没有 trace、VM 状态和验证证据，不等于完成去虚拟化。
- `blackbox-boundary` 不是失败托词；必须记录 caller / callee、输入、输出、副作用、异常、时序和复用方式。
- 对新版本 VMP，旧工具可作为候选或对照，不作为默认有效结论；必须用当前样本证据证明可用性。
