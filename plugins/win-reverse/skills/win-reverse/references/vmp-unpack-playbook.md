## VMP 脱壳修复专项 Playbook

适用触发：样本、日志、报告或会话中出现 `VMP`、`VMProtect`、`.vmp`、VM entry、dispatcher、handler、thunk、`.&Di`、IAT 模拟、虚拟化函数或去虚拟化线索时，必须在 `references/packers.md` 之后补读本文件。若进入 `localized-devirt`、`virtualized/mixed`、handler 序列或 `cmp/jne` 语义还原场景，继续补读 `references/vmp-devirt-playbook.md`。

### 核心判定

VMP 不是普通压缩壳。若目标仍依赖 VMP runtime、thunk、dispatcher、handler 表或虚拟化代码，单纯找到 OEP、dump PE、自动 Fix IAT 不等于可运行脱壳。

结论必须先回答三件事：

- 原始代码是否已经完整回到 native 执行流。
- IAT 调用是否仍穿过 VMP 模拟层或长跳转 thunk。
- 崩溃点是否落在缺失 runtime、未初始化全局状态、VM bytecode 或被虚拟化函数内。

### 必走证据门

1. 静态 VMP 分诊
   - 记录区段、EP、壳入口、VM entry、dispatcher / handler / thunk 证据。
   - 归类为 `pack-only`、`mutation-only`、`virtualized`、`mixed` 或 `unknown`。
   - 更新 `packerUnpack.vmp.mode/versionEvidence/runtimeDependency`（结构化字段门禁保留）；分诊叙事收口时写入 `report.md` 的「专题发现」节（脱壳/VMP 小节）。

2. OEP 证明
   - OEP 不能只靠签名猜测。必须给出动态断点、单步 trace、VM exit、ESP 定律、API 暂停点或内存执行断点证据。
   - 更新 `packerUnpack.vmp.oep`；OEP 证据叙事收口时写入 `report.md` 专题小节。

3. Dump 与重建清单
   - 记录 dump 时机、dump 文件、节表/对齐/重定位/TLS/delay import/IAT 修复状态。
   - 填写 `run/dump-manifest.json`（机器 manifest 门禁保留）；IAT 重建叙事收口时写入 `report.md` 专题小节。

4. Runtime 依赖分类
   - 如果 `.text` 中仍有 VMP thunk、长跳转、dispatcher 调用或 `.vmp` 代码依赖，必须标为 `runtimeDependency.status=active`。
   - `active` 时，不能把 clean dump 当成最终修复版；只能选择保留 runtime 的 dump、补运行时初始化、局部去虚拟化或黑盒复用边界。
   - 选择局部去虚拟化时，必须更新 `packerUnpack.vmp.devirtualization`；devirt 边界与证据收口时写入 `report.md` 专题小节。

5. 崩溃诊断
   - dump 后若出现异常、闪退、`0xC0000005`、Fault offset、EIP/RIP 落到非映像区或 VM 区，必须先填写 `run/crash-diagnostics.md`。
   - 崩溃记录至少包含：运行命令/环境、异常码、Fault VA/RVA、栈或模块边界、推断原因、下一步验证。

### 路由选择

- `clean-oep-dump`：仅在 OEP 后 native 流完整、无 active runtime 依赖、IAT 可解析时使用。
- `runtime-retained-dump`：保留 `.vmp` / runtime 节和初始化链，目标是可运行修复版。
- `iat-emulation-fix`：IAT 调用穿过 VMP 模拟层时，逐项跟踪真实 API 并回写或保留 thunk。
- `localized-devirt`：关键函数被虚拟化且运行目标需要 native 语义时，先局部还原关键路径。
- `blackbox-boundary`：去虚拟化成本过高时，明确输入、输出、副作用和可复用边界。

### 工具路线矩阵

VMP 任务不能押注单个仓库或单个年代的工具。先在 `packerUnpack.vmp.toolRoutes` 记录路线选型（结构化字段门禁保留），状态使用 `selected`、`rejected`、`failed`、`not-available`、`not-applicable` 或 `candidate`，并写明证据或放弃原因；选型叙事收口时写入 `report.md` 专题小节。

| 路线 | 候选工具 | 适用条件 | 放弃信号 |
|------|----------|----------|----------|
| `anti-debug-to-oep` | ScyllaHide、TitanHide | 需要把样本跑到 OEP、VM exit 或 API 暂停点 | 反调试未触发、工具不可用、驱动/插件环境不允许 |
| `static-unpack-first-pass` | VMPStatic | 需要先恢复解压 PE、资源或字符串，作为静态第一遍 | 目标版本/模式不匹配；注意它不自动修 IAT、不能保证 OEP、也不是去虚拟化器 |
| `dynamic-import-fix` | VMP-Imports-Deobfuscator；备选 vmp3-import-fix、vmpfix、VMPImportFixer | 进程已到 OEP 附近，IAT 调用穿过 VMP stub/thunk，需要解析真实 API | 架构不符、stub 模式不匹配、目标进程状态不足、导入调用不在可跟踪范围 |
| `legacy-dump-import-fix` | VMPDump / vmpdump | 仅作为历史备选：x64、VMP 3.x、已到 OEP、import stub 形态匹配 | 新版本 VMP stub 变形、线性扫描漏点、不是去虚拟化需求 |
| `localized-devirt` | Dna、NoVmp、vmpattack、JonathanSalwan VMProtect-devirtualization、VTIL/Triton 路线；x64dbg/WinDbg trace + Triton taint + handler/p-code 简化脚本 | 关键路径被虚拟化且必须恢复 native 语义；优先局部函数、分支簇或算法片段 | 目标不是纯函数/小闭包、路径覆盖不足、缺 trace / VM state / flags 验证、工具链成本超过任务目标 |
| `managed-vmp` | VMUnprotect | .NET/CLR 程序被 VMProtect 虚拟化方法保护 | Native PE、混合模式主逻辑不在托管方法内 |

推荐顺序：

1. 先用 `anti-debug-to-oep` 解决能否稳定到 OEP 或 VM exit。
2. 再用 `static-unpack-first-pass` 判断能否恢复可读 PE 基线，但不要把它当最终修复版。
3. IAT/thunk 问题优先评估 `dynamic-import-fix`；`legacy-dump-import-fix` 只作为旧 VMP 兼容备选。
4. 若 `runtimeDependency.status=active` 或模式是 `virtualized/mixed`，必须补充 `localized-devirt` 或 `blackbox-boundary` 决策。

### 转向阶梯与检查点单元（止损衔接）

本专题路线属 L3 深水路线（分级见 `references/anti-shortcut-system.md`「路线预算分级」）：不按失败次数判死路线，按工作量单元检查点推进。

- 检查点单元：每分析 **10 个 handler** 或 **10 段 trace** 为一个检查点；判据 = 自上一检查点以来新增 clues/evidence 数，检查点零新增才允许升级转向。
- 每条路线失败先缩范围再弃线：`anti-debug-to-oep` 失败先缩到单个反调试触发点；`dynamic-import-fix` 失败先缩到单条 thunk；`localized-devirt` 失败先缩到单 handler 簇或单条 cmp/jcc 语义。
- 缩范围后仍无进展的，按四级转向阶梯换工具/换路线（阶梯见 `references/anti-shortcut-system.md`）；弃线必须落 `toolRoutes` 状态与放弃证据，不得静默丢弃。

### 技术限制表述

只有在反调试绕过、OEP 证明、dump 重建、runtime 依赖分类、IAT 证据、崩溃诊断、去虚拟化可行性都记录后，才能声明技术限制。

未完成 `anti-debug-to-oep`、`static-unpack-first-pass`、`dynamic-import-fix`、`localized-devirt/blackbox-boundary` 的路线矩阵前，结论应写成“当前可用路线未穷尽”或“工具条件不足”。即使路线耗尽，也只能说明当前样本、当前版本和当前工具条件下的限制，不能写成“VMP 不可能脱壳”。
