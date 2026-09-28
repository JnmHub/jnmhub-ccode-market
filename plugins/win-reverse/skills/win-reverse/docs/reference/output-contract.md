<!-- publish: framework -->
# Output Contract

> **分层说明（report-only 改造后）**：本契约分两级——
> - **【门禁强制】**：由 `tools/task/validation.mjs` 真实校验，不满足则 `task-close` 失败。只交付这一级即可通过 closeout。
> - **【推荐】**：提升报告与归档的复用价值，但**无任何机器校验**。按任务需要与用户需求裁量交付，不为凑齐章节过度生产。
> 标记依据是验证器实际行为而非文档措辞；调整 validation.mjs 后应同步修订本文件标记。

- `report.md` 文件名保持不变，但正文和阶段结论必须使用中文 **【推荐：report-only 改造后无中文叙事机器校验，纪律见 SKILL.md「输出要求」】**
- report.md 章节契约 **【门禁强制】**（report-only 改造：原「当前阶段 / 下一步 / 自动续跑决策 / 产物路径」自动生成节已退役）：
  - 全篇实质内容 ≥600 字符（去空白），不得仍是模板骨架（逐字一致判占位）；
  - achieved 收口必备三节：`## 任务摘要` / `## 实现路径` / `## 验证证据`；
  - `closeoutMode=partial / infeasible` 必备 `## 未竟事项` 节且正文 ≥200 字符（根因 + 已排除路线）；
  - 合法章节单源：`artifacts/tasks/_TEMPLATE/core/report.md`（任务摘要 / 实现路径 / 逆向思路 / 任务难点 / 坑点与经验 / 验证证据 / 专题发现 / 未竟事项）。
- 默认最少交付 **【门禁强制】**：`artifacts/tasks/<task-id>/report.md`、`task.json`（契约 + 判据闭合）、`run/verify-once.mjs`（预生成线束，禁覆写）以及 completionCriteria 证据链所指的真实证据文件。
- **【推荐】**：目标边界、防护等级、架构边界、路线取舍复盘（是否影响路线、影响了哪条路线）、`UNKNOWNS`、task artifact 路径、附录：历史线索与外部参考（线索正文可进 `state/clues.md` append-only 可选账本）。

以下各专题块（report-only 改造：专题验收 = report.md 专题发现 节内的专题小节（即 `report.md` 的「专题发现」节），机器谓词 = `reportSection`（正则匹配标题）+ `minChars`（该节正文最小长度），单源见各 `topics/<key>/topic.json` 的 `formalValidation`；**原 `run/*-notes.md` / `run/*-report.md` 等专题过程文件义务已全部退役**；**文字性结论要求为【推荐】**，验证器只查小节存在性与长度，不检查正文语义——归档复用依赖内容质量，请写实质分析）。结构化字段门禁（task.json 的 `<topic>.*` present/status/keyFindings 等）与个别机器产物门禁（标注处）保留。

如果包含 static-triage，还必须补充：

- `report.md`「专题发现」节内含静态分诊小节（标题命中 `静态分诊|static triage|导入表`，正文 ≥120 字符）**【门禁强制】**
- PE 头、节区、入口点、导入与资源结论

如果包含 packer / unpack，还必须补充：

- `report.md`「专题发现」节内含脱壳小节（标题命中 `脱壳|Unpack|OEP`，正文 ≥120 字符）**【门禁强制】**
- OEP、dump、IAT 状态
- 若命中 VMP / VMProtect / `.vmp` / dispatcher / thunk，还必须补充 VMP runtime 依赖、OEP 证据、dump 清单、工具路线矩阵与崩溃诊断 **【本行及下列产物均为门禁强制，且 validatePackerUnpackEvidence 会额外校验证据链内容，非仅文件存在】**
- `run/dump-manifest.json`（机器 manifest 门禁保留）
- `run/crash-diagnostics.md`（仅崩溃时，门禁保留）
- `task.json` 的 `packerUnpack.vmp.toolRoutes` 必须记录 anti-debug、static-unpack、dynamic-import-fix、legacy fallback、localized-devirt / blackbox 等路线的选择或放弃原因 **【门禁强制：要求路线分类 + 证据引用】**
- 若 VMP 模式为 `virtualized/mixed`、进入 `localized-devirt` 或选择黑盒边界，还必须在「专题发现」脱壳小节写清 devirt 边界与证据，并补齐 `packerUnpack.vmp.devirtualization` 的 trace、specialRegisters、handlerSegmentation、flags/branch 或 fallbackBoundary 证据

如果包含 anti-analysis，还必须补充：

- `report.md`「专题发现」节内含反分析小节（标题命中 `反调试|anti-debug|反分析`，正文 ≥120 字符；另有 ≥80 字符的实现/绕过细节谓词）**【门禁强制】**
- 反调试 / 反虚拟机 / 完整性 等检测面、检测面与触发时机
- 动态拦截脚本可参照骨架 `references/templates/anti-analysis-hook.js`

如果包含 `.NET / CLR`，还必须补充：

- `report.md`「专题发现」节内含 .NET 小节（标题命中 `.NET|dotnet`，正文 ≥120 字符）**【门禁强制】**
- 混淆器或运行时类型

如果包含 Driver，还必须补充：

- `report.md`「专题发现」节内含驱动小节（标题命中 `驱动|Driver|IOCTL`，正文 ≥120 字符）**【门禁强制】**
- `DriverEntry / dispatch / IOCTL` 结论

如果包含 Network / TLS，还必须补充：

- `report.md`「专题发现」节内含 TLS/网络小节（标题命中 `TLS|网络`，正文 ≥120 字符；另有 ≥80 字符的 hook/协议细节谓词）**【门禁强制】**
- 网络栈、TLS 边界、截获点
- 若要求本地协议验收，经 `run/run-local.mjs --mode=replay` 交付重放通道
- 动态拦截脚本可参照骨架 `references/templates/tls-hook-template.js`

如果包含 App Protocol / Signature，还必须补充：

- `report.md`「专题发现」节内含协议小节（标题命中 `协议|sign|签名|protobuf`，正文 ≥120 字符；另有 ≥80 字符的 sign/加密细节谓词）**【门禁强制】**
- 签名算法、协议结构、加密边界与本地复现状态

如果包含 Frida Hook，还必须补充：

- `report.md`「专题发现」节内含 Frida 小节（标题命中 `Frida|hook`，正文 ≥120 字符）**【门禁强制】**
- Frida 附加模式、Hook 目标与事件格式；脚本可参照骨架 `references/templates/frida-hook-template.js`

如果包含 UI Runtime，还必须补充：

- `report.md`「专题发现」节内含 UI 小节（标题命中 `UI|消息流|消息`，正文 ≥120 字符）**【门禁强制】**
- WndProc / DialogProc / 消息流结论

如果包含 `web-shell-triage`，还必须补充：

- `report.md`「专题发现」节内含套壳分诊小节（标题命中 `套壳|WebView|Electron|web shell`，正文 ≥120 字符）**【门禁强制】**
- `web-shell-triage` 结论：wrapper/runtime、前端框架、bundler、bridge 结论
- `run/web-shell-tech.json`（机器产物：由 `tools/task/detect-web-shell-tech.mjs` 生成，门禁保留）

如果包含 Loader / Injection，还必须补充：

- `report.md`「专题发现」节内含注入小节（标题命中 `Loader|注入|manual map`，正文 ≥120 字符；另有 ≥80 字符的技术细节谓词）**【门禁强制】**
- 宿主进程、注入技术、入口切换与远端映像结论
- 明确 `CreateRemoteThread / NtCreateThreadEx / APC / manual map / hollowing` 中命中的真实路径
- 动态拦截脚本可参照骨架 `references/templates/loader-hook-template.js`

如果包含 Config / Recovery，还必须补充：

- `report.md`「专题发现」节内含配置恢复小节（标题命中 `配置|资源恢复|config`，正文 ≥120 字符）**【门禁强制】**
- 配置载体、解码链、字段语义与验证结论

如果包含 Mixed-Mode / Interop，还必须补充：

- `report.md`「专题发现」节内含混合桥接小节（标题命中 `混合|interop|托管|CLR`，正文 ≥120 字符；另有 ≥80 字符的桥接细节谓词）**【门禁强制】**
- `C++/CLI / P/Invoke / COM interop / CLR hosting` 中命中的桥接路径
- 托管/非托管边界、桥接方向与证据锚点；脚本可参照骨架 `references/templates/interop-hook-template.js`

如果包含 IPC / Persistence，还必须补充：

- `report.md`「专题发现」节内含 IPC/持久化小节（标题命中 `IPC|持久化|ALPC|NamedPipe|COM`，正文 ≥120 字符）**【门禁强制】**
- `ServiceMain / schtasks / WMI / NamedPipe / RPC / ALPC / COM` 中命中的控制面链路
- 启动条件、权限要求与真正使用点

如果包含 Exception / Runtime，还必须补充：

- `report.md`「专题发现」节内含异常/启动链小节（标题命中 `异常|启动链|exception`，正文 ≥120 字符）**【门禁强制】**
- `TLS callback / SEH / VEH / CRT startup / CFG / CET` 结论
- 启动链、异常链与安全断点/Hook 点位

如果包含 Memory / Forensics，还必须补充：

- `report.md`「专题发现」节内含内存取证小节（标题命中 `内存|取证|dump|VAD|Minidump`，正文 ≥120 字符）**【门禁强制】**
- `VAD / minidump / module remap / manual-map residue` 结论
- dump 粒度、重建目标与验证方式

如果包含 Protection Bypass，还必须补充：

- `report.md`「专题发现」节内含保护绕过小节（标题命中 `保护|绕过|patch|bypass|许可|license`，正文 ≥120 字符；另有 ≥80 字符的绕过实现细节谓词）**【门禁强制】**
- 反篡改 / 文件保护 检测面枚举（每个检测点的分类与触发时机）
- 绕过方案与稳定性验证结果；脚本可参照骨架 `references/templates/protection-bypass-hook.js` / `references/templates/protection-bypass-patch.py`
