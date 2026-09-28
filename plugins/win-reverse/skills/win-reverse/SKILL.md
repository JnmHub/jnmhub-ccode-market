---
name: win-reverse
description: Windows 平台专业高级逆向工程技能框架。适用于 PE/EXE/DLL/SYS/.NET/CLR/C++-CLI/WOW64/VMP/Themida/Enigma/x64dbg/IDA/WinDbg/Frida/dnSpy/ILSpy/COM/RPC/ALPC/NamedPipe/Service/WMI/Minidump/VAD 场景，覆盖 PE 分诊、壳与 OEP/IAT、抗分析、.NET/CLR、驱动、Frida 运行时、TLS/网络、Loader/注入/manual map、配置与资源恢复、UI 消息流、异常/启动链、混合托管桥接、IPC/持久化控制面、内存取证与 Windows CTF，以及游戏逆向(UE4/UE5/Unity/IL2CPP/Cocos2d-x/GNames/GObjects/SDK Dump/反作弊)、恶意软件分析(勒索/远控/木马/rootkit/挖矿/窃取器)、应用与协议逆向(sign/签名算法/protobuf/SSL Pinning/Electron/Delphi/MFC)等扩展领域，以及模拟真实 Windows 高级逆向工程师场景的多专题 drill / 自主演练 / 自我迭代升级任务。用户一旦提到 DLL 注入、CreateRemoteThread、APC、Reflective DLL、Manual Map、Process Hollowing、服务/计划任务/WMI、COM/RPC/ALPC/NamedPipe、SEH/VEH/TLS callback、C++/CLI/P/Invoke/CLR hosting、资源 blob、注册表配置、许可证字段恢复，或提到游戏引擎逆向、UE4/UE5/Unity/Cocos、GNames/GObjects、SDK Dump、反作弊/EAC/BattlEye、勒索软件加密分析、远控木马、恶意软件、rootkit、协议签名、sign 算法还原、protobuf、易语言、Electron/Delphi/MFC 框架逆向，或要求"模拟真实逆向场景""自主迭代演练"等典型 Windows 逆向场景，也必须触发本技能。不要用于普通 Windows 开发、未授权漏洞利用或其它非 Windows 场景逆向。
---
# Windows Reverse Framework

本技能是 Windows 逆向任务的执行控制面，不是传统知识库。它负责触发、初始化 task-local、强制阶段门禁、路由专题参考和保护验证完整性；细节规则按需下沉到 `references/`。

## 能力边界与成熟度

当前仓库按专题成熟度对外承诺边界：

<!-- BEGIN GENERATED: topic-maturity-summary -->
- `synthetic-e2e` (`17`): `anti-analysis`, `app-protocol`, `config-recovery`, `dotnet`, `driver`, `exception-runtime`, `frida-hooking`, `ipc-persistence`, `loader-injection`, `memory-forensics`, `mixed-mode-interop`, `packer-unpack`, `protection-bypass`, `static-triage`, `tls-network`, `ui-runtime`, `web-shell-triage`
- `guided` (`0`): none published yet
- `closed-loop` (`0`): none published yet
- `reference-only` (`3`): `ctf`, `game-reverse`, `malware-analysis`
<!-- END GENERATED: topic-maturity-summary -->

成熟度只描述本仓库内的执行契约、验证口径与专题产物保证，不等同于“所有真实目标或高对抗样本都已完成实战回归”。

## 任务产物与脚本入口

任务产物始终创建在当前用户项目目录，禁止写入 skill 全局目录。例外：`task-close` 的归档快照（复制到 skill 安装目录的 `artifacts/tasks/<task-id>`）属框架机制例外。归档根按 resolveInstalledSkillRoot 解析（`~/.codex/skills` 优先），可能与执行端 SKILL_BASE 不同，以 close 输出的 [archive] 路径为准。本文所有 `run/xxx`、`state/xxx` 路径都相对于：

```text
<PROJECT_DIR>/artifacts/tasks/<task-id>/
```

常用入口：

```bash
node "<SKILL_BASE>/tools/task/task-start.mjs" <task-id>
node "<SKILL_BASE>/tools/task/task-init.mjs" <task-id> [--topic=... --topics=...]
node "<SKILL_BASE>/tools/task/task-sync.mjs" <task-id>
node "<SKILL_BASE>/tools/task/task-advance.mjs" <task-id>
node "<SKILL_BASE>/tools/task/task-close.mjs" <task-id>
```

每次写入产物前确认路径以 `artifacts/tasks/<task-id>/` 为根；不要把任务产物写到 cwd 下的 `run/`。

`task-init` / `task-start` 常用 flag：`--force-new-task`（workspace 已有 history data files 时显式允许再建第二个 task-local）；`--api-call-example`（声明需要协议/API 调用示例交付，同时置位 `apiCallExampleRequired` 与 `localReproductionRequested`，触发 `run/run-local.mjs --mode=replay` 交付通道）。脚本调用约定：task-* 脚本输出的关键结果行在末尾，勿对输出加 `| tail` 截断；task-advance 支持 `--json`，task-sync 无此开关（关键结果行在 stdout 末尾）。

## 参考文档（按需查阅）

首读约定：必读最小集为 `SKILL.md`。规格权威 = init/sync 输出的 `[closeout-obligations]` 收口义务清单 + `docs/reference/acceptance-criteria.md` 总表（机器校验规则与词汇表单源）；判据命中形态、evidenceRefs 合法形态与 tier 五枚举的关键词表已内嵌于下文 GENERATED criteria-vocabulary 块与 pre-gate WARN fix 文案；bootstrap 四篇为强烈建议而非强制首读。schema/契约形状问题以 task-sync 的 pauseReason 与义务清单为准；`task-close --dry-run` 仅作收口终检，不承担规格解释职责。需要细节时按主题查：`docs/reference/reverse-bootstrap.md` / `reverse-workflow.md` / `case-safety-policy.md`（纯提取任务另见 `pure-extraction.md`）；反捷径与阶段门禁细则见 `references/anti-shortcut-system.md` / `phase-gated-workflow.md`；多 Agent 协作协议（multi 模式，显式 opt-in）见 `docs/reference/multi-agent-orchestration.md` 与 `agents/orchestrator.md` / `reverse-worker.md` / `auditor.md`；专题路线见本文件"专项参考"。

快速分诊：单一问题、一轮静态可答、不涉及动态执行时可直接回复。命中 Electron/CEF、壳/脱壳、协议/签名、多阶段验证、补丁或 hook 时，必须先运行 `task-start` 建立 task-local，再开始任何分析；未建 task-local 前禁止调用 IDA/radare2/x64dbg 等分析工具。此约束适用于所有 AI Agent 运行环境。

> 局限声明（诚实边界）：以上文本约束对"不读取约束"的运行环境无效，此时所有 task 门禁随之失效，只能靠 Agent 自律。`task-probe` 会在 `task-sync` / `task-advance` 咽喉点按需自动执行（`run/env-capability.json` 缺失时自动补跑），通常无需手动运行；`task-init` 后若要立即定级（尚未经过 sync/advance 咽喉点）可手动运行 `node "<SKILL_BASE>/tools/task/task-probe.mjs" <task-id>` 生成 `run/env-capability.json`；其定级基于 objective 关键词的启发式规则（可能误报），最终定级以 Agent 对样本的实际判断为准。

## 标准开局

### 新任务

<!-- BEGIN GENERATED: bootstrap-new-task-brief -->
- 无历史文件：`task-start（自动转发 task-init）→ task-sync → task-advance`
- 可直接附带 `--topic=`、`--topics=`、`--local-repro`、`--protocol-replay`、`--task-input=...`
- `task-input` 现已按 schema 强校验
- 若 `execution.status=ready-to-continue`，继续执行 `nextExecutableAction`
<!-- END GENERATED: bootstrap-new-task-brief -->

### 续跑任务

<!-- BEGIN GENERATED: bootstrap-resume-task-brief -->
- 先读 `task.json` 与 `state/route-state.json`，再补读 `route-plan / clues`（读到契约字段与分诊证据矛盾时，以分诊证据为准修正字段并留痕 contract-change-log）
- 续跑统一走 `task-sync -> task-advance`
- 恢复完成后直接继续活跃阶段，不以“状态汇报”收尾
- 只有 `pauseCategory=user/risk`、缺样本或 closeout 完成时才停下
<!-- END GENERATED: bootstrap-resume-task-brief -->

### 无真实样本演练

<!-- BEGIN GENERATED: bootstrap-drill-task-brief -->
- 没有真实样本但要模拟真实推进：先 `node "<SKILL_BASE>/tools/task/task-drill.mjs" --list`
- 再执行 `node "<SKILL_BASE>/tools/task/task-drill.mjs" <scenario-id> <task-id>`
- drill 生成后按普通 task-local 一样续跑
<!-- END GENERATED: bootstrap-drill-task-brief -->

## 多 Agent 协作（multi 模式 · 显式 opt-in）

- 开工：`task-start / task-init --execution-model=multi`（**新任务默认 single**——消除"宣称 multi、实际全单 Agent"的配置错配；multi 协议完整保留为显式 opt-in 能力，启用前 init 会打印能力自检清单：宿主 subagent 派发通道、IDB 独占文件锁、每相位约 +5 步簿记开销。历史任务无该字段按 single 处理，零迁移）。
- 角色：Orchestrator（编排、派单、推进与收口）、Worker（只执行派单包内工作并回写 Worker Report）、Auditor（只审计，落裸行 `verdict: PASS` 或 `verdict: VIOLATION`）。完整协议与禁止项见 `agents/orchestrator.md`、`agents/reverse-worker.md`、`agents/auditor.md` 与 `docs/reference/multi-agent-orchestration.md`。
- 节奏：`task-dispatch <task-id> --kind=worker --focus=<本轮焦点>` 派工 → Worker 完工回写包内 `## Worker Report` → `task-dispatch --kind=audit --audit-kind=phase-gate` 派审 → Auditor 补 `## Auditor Findings` 与裸行 verdict → `task-dispatch --collect=audit-NNN` 入账 → 之后 `task-advance` 才放行；`task-close` 另需一份 `--audit-kind=completion-claim` 的 PASS 审计入账。
- 证据链：包/审计文件必须携带 `<!-- dispatch: <hash> -->` 通道标记，判定事件落在 append-only 影子账本（`~/.win-reverse/ledger/<task-id>.jsonl`，可用 `WIN_REVERSE_LEDGER_ROOT` 改道）；手写 `state/packages/` 伪证会被 `package-not-dispatched` 拦截，先干活后补签字会被 `work-before-dispatch` 拦截。
- single/legacy 任务：协作门禁整体跳过，不建账本；`task-sync` 的协作摘要行只对 multi 任务出现。N7 口径：切换前已有账本的 single 任务——账本继续记录相位历史，不参与任何门禁。

## 不可弱化的硬约束

- `task.json` 首轮必须锁定机器校验的契约五字段：`target / objective / deliverableTier / completionCriteria / boundaries`（逐字段形状以 task-sync 的 pauseReason 为准，单源定义见 `tools/task/route-state.mjs` 的 `CONTRACT_FIELD_HINTS`；**completionCriteria 仅接受对象形 `{"text":...,"status":"pending"}` 单一形状**——deliverables 不再合成伪判据，缺席时记入 deliveryRequirements 备注并由义务清单提示补齐）；`disallowedFallbacks / userRejectedApproaches` 推荐记录，无机器校验。
- 过程零落盘义务：不要求 `run/investigation.md` / `run/plan.md` / `run/assumptions.md` 或任何专题 notes 过程文档，也没有相位出口文档门禁——调查、规划、假设等过程认知汇入收口时的 `report.md`（见下条「完成时报告义务」）。`state/route-state.json` / `state/route-plan.md` / `state/clues.md` 是可选的续跑骨架（断电续跑时有用），写不写不影响收口判定。
- 完成时报告义务（唯一强制文档）：收口前 `report.md` 必须按模板章节一次性写全——任务摘要 / 实现路径 / 逆向思路 / 任务难点 / 坑点与经验 / 验证证据 / 专题发现 / 未竟事项。机器校验：全篇实质内容达标（非模板复述），「任务摘要 / 实现路径 / 验证证据」三节必备，命中 topic 时「专题发现」内须有对应专题小节（关键词 + 最小长度谓词，见各 `topics/<key>/topic.json` 的 `formalValidation`）；`closeoutMode=partial/infeasible` 时「未竟事项」节必填（根因 + 已排除路线）。防伪硬门禁不变：`completionCriteria` 的 `evidenceRefs` 必须指向任务目录内真实存在、非模板占位的文件。
- 修改前备份：目标文件修改必须写 `.clean.bak` 和 `run/backup-manifest.md`；manifest 必须登记每个备份的原始绝对路径与 SHA256，备份可放 `run/` 之外（第二列登记备份绝对路径即纳入哈希断路器，断路器以 manifest 为准）。
- 必须验证：没有截图、命令输出、调试输出或用户确认，不得声明完成。patch/hook/GUI 交付确认类行为验证优先复制 `tools/verify/gui-drive.ps1.template` 改造（合成事件优先，连续 2 次触发失败即切真实键鼠路径，参数 `-SyntheticRetryLimit`）；禁止在无前台断言下盲发键击。验证结论与证据锚点写进 `report.md` 的「验证证据」节。
- 用户否决的方案族写入 `task.json.userRejectedApproaches`，后续不得复活。
- 阶段切换走 `task-advance --to=<phase>`（合法值见上文 GENERATED phase-vocabulary 块，只前进不回退）；`task-sync` 是可选的状态吸收/续跑辅助，想刷新 route-plan/clues 视图或看收口义务清单时跑，不跑不阻断任何门禁。诚实声明：sync 与否无会话内强制，靠自律；close 的契约/证据/报告门禁是机器兜底（multi 模式的协作签字见下条）。
- 多 Agent 硬门禁（仅 multi 任务）：`task-advance` 要求本相位已有经 `task-dispatch` 通道产生的任务包与 `verdict: PASS` 的 phase-gate 审计入账（增量锚定，见上文「多 Agent 协作」）；`task-close` 另需 `completion-claim` 审计 PASS 入账。证据只认通道产物 + 账本哈希链，绕门禁的手写文件与口头声明不成立。
- 正式 `task-close` 前先跑 `task-close --dry-run` 预检：跑全部门禁但不归档、不清理；把剩余 finding 一次修完再正式收口，避免逐条试错重跑。dry-run 会写盘（不改契约字段与 validation 正式状态）：重写 state/route-state.json 与 route-plan.md/clues.md 视图，追加 run/closeout-attempts.jsonl（失败时）与 run/contract-change-log.md 留痕行；触发 web-shell 重扫的任务可能持久化 run/web-shell-tech.json 并经 resync 改写 task.json 的 webShellTriage.* 字段（零前态任务 close 侧重扫只固化证据并打 `[manual-override]` WARNING，详见 `references/web-shell-triage.md`）。`run/validation-last.json` 是 dry-run 改道产物，其 status 不代表 task.json 正式 validation 状态——判正式状态以 task.json.validation 为准。手改 `task.json` 后必跑 JSON.parse 自检（`node -e "JSON.parse(require('fs').readFileSync('<taskDir>/task.json','utf8'))"`），重复键/吞行自损不等门禁发现。
- 重工具调用判级纪律（IDA/idalib/radare2/cheatengine 等 MCP 重型调用，按「时序+错误层」三分；拿不准一律按有毒处理——降级代价秒级，盲目重试实测达 18.7min，成本不对称）：
  1. 长静默后传输层断（超 2× 预期耗时后断连/超时/进程被杀）→ 判该调用有毒：禁止原参数重发，只允许一次缩范围探活，再败按降级阶梯换接口家族；
  2. 快速配置类报错（permission denied / 秒级连接失败）→ 判通道不可用：换通道，不重试；降级事实（原通道/降级通道/原因）收口时记入 `report.md` 的「坑点与经验」节；
  3. 带业务错误信息的返回 → 读信息行事，不适用前两条；同一动态通道另受『动态通道试错预算律』约束（触发即降级，细则见 `references/fallbacks.md`）。
  换通道成功后允许一次只读探活回原通道，不计重发（r2 家族只读白名单：`list_*`/`hexdump`/`disassemble`/`xrefs`；idalib 无纯只读动词，不享受豁免）；探活成功不代表权限恢复，恢复以首个工作调用为准；MCP 进程重启的秒级瞬断允许一次只读重发。
  降级阶梯（写死）：`decompile_function` → `disassemble_function` → 裸 `disassemble` 分段 → `hexdump`/`read_memory` 取证 → 兜底级：Bash 调 r2 CLI + OS 级超时（`timeout 60 r2 -qc 'pdc @ 0x...' bin`）。无状态接口优先；`analyze` 非必要不重跑，分析产物随手落盘 `run/`；长输出落盘后摘要读取。经验耗时见 `references/fallbacks.md`。
  CE/cheatengine 通道失效时走等价降级阶梯：`ping` 探活重连 → CE GUI 手动步骤交接用户 → PowerShell 只读内存模板 `tools/verify/ps-read-memory.ps1` → 末级声明降级纯静态（动态交付类任务不得跳末级），细则见 `references/fallbacks.md`。
- 止损计数分级纪律：同参重发恒为 0；变参重试连续 3 次无果只 PARK 当前探针，不判死方法族；T3–T4 结构化防护路线探针预算对齐通道层 K=12；T5–T6 / 虚拟化 / 反作弊 / rootkit / 强混淆等 L3 深水路线按工作量单元检查点止损（如 VMP：handler×10 / trace 段×10），不按失败次数判死路线；转向按「缩范围 → 换工具/通道 → 换路线 → 升级协作」四级阶梯升级，转向的取舍与教训收口时写进 `report.md` 的「实现路径 / 坑点与经验」节。细则见 `references/anti-shortcut-system.md`，参数登记 `docs/reference/acceptance-criteria.md` §13。

详细阶段规则见 `references/phase-gated-workflow.md`。

## 反捷径系统摘要

不要把以下信号当成证据：脚本无报错、hook 已注入、文件已修改、进程已启动、代码逻辑上应该可行、ASAR 解包成功。

有效证据只能来自：

- 可读截图、命令输出、日志、调试器输出，并能匹配 `completionCriteria`。
- 用户明确确认。
- 反编译或调试结果中明确可见的逻辑路径，附地址、行号或调用栈锚点。

Hook/注入/拦截是实现手段，不是调查手段。无法说清目标验证链时，必须先补齐调查再动手实现。

失败、崩溃、连续试错、跳过分析、搜索门禁、进展声明格式、retrospective 和历史失败案例，见 `references/anti-shortcut-system.md`。

### Web-shell 误报的纠正姿势（仅当探针误判时）

`task-probe` / `task-sync` 会自动扫描目标旁目录做 web-shell 技术分诊并挂载下游 topic。当分诊与目标实际技术路线不符（典型：目标非 web 套壳，但目标旁目录含 web 框架关键词被误扫），**不要只把 `webShellTriage.present` 翻成 false**——下次 sync 的启发式重扫会覆盖该字段。正确姿势是在 task.json 的 `webShellTriage` 下声明：

- `verdict: "not-web-shell"`
- `verdictRationale: "<非空，说明为何不是 web-shell，引用 PE/导入面/runtime 证据>"`

二者必须同时满足才生效。若探针现场重扫发现强证据（真实 fileRules/binaryStringRules 命中），verdict 会被打 WARNING 拒绝——这是 V3-2 双堵设计，防止用 verdict 逃避真实 web-shell 目标的下游义务。

## 崩溃与哈希断路器

出现静默闪退、无日志退出、还原备份后仍崩溃时：

1. 停止修改目标。
2. 写 `run/crash-diagnostics.md`，不少于 200 字符，必须包含 `EIP/RIP`、`ExceptionCode`、`0x...` 地址、调试器输出、事件日志或 dump/stack 特征。
3. 用 `task-advance` 触发合规检查，通过后再继续。

`.clean.bak` 与原始文件 SHA256 不一致时，`task-advance` 会阻断推进。确属受控修改时，必须显式写 `run/hash_mismatch_authorized.flag`。

## 工具链前置判断

先做两项前置检查：

1. warm-start 优先：检查目标旁是否已有分析产物（`.i64`/`.idb`/`.r2db`、历史 task 目录），有则优先 adopt 续分析（idalib `idb_open` 秒级 warm start）；用户在提示中点名的工具链优先于默认分诊链；凡会向目标旁落盘副产物的分析链路（idalib `idb_open` 等）默认先复制样本到 lab 工作区再分析（细则见 `references/static-analysis.md`）。
2. 扫描空结果 ≠ 目标无该信息：字符串/搜索类调用返回空、Sandbox 受限、或结果数量级与文件体积严重不符（如数 MB 二进制仅千余条字符串）时，禁止第 3 次同参数重发，必须先做 1 次 OS 级字节扫描（PowerShell `[IO.File]::ReadAllBytes`+`IndexOf` 或 `findstr /m`）交叉验证，再下"加密/加壳"结论。

打开 IDA 前先判断主逻辑层：

1. Electron/CEF/WebView2：JS/V8/资源层优先，补读 `references/web-shell-triage.md` 和 `references/electron-playbook.md`。
2. .NET/CLR：dnSpy/ILSpy 优先。
3. 驱动/内核：先补读 `references/driver.md`，确认权限、签名、调试边界。
4. 纯 native：再用 IDA/Ghidra/x64dbg/WinDbg。

VMP/VMProtect、`.vmp`、VM entry、dispatcher、handler、thunk、虚拟化函数或 IAT 模拟层命中时，补读 `references/packers.md` 与 `references/vmp-unpack-playbook.md`；进入局部去虚拟化时继续读 `references/vmp-devirt-playbook.md`。

## 输出要求

所有正文输出与 `report.md` 必须中文，路径、代码块、技术标识符除外。

大输出纪律（compaction 防线）：超过 ~8KB 的 MCP/命令输出（analyze_batch、decompile、survey_binary、注册表/字符串 dump）一律落盘 `run/` 后摘要读取，不整段进上下文；idalib 调用用 `include_addresses=false`、控制 `max_*` 参数、`survey_binary` 用 minimal detail。截图只能走一体化脚本：`pwsh "<SKILL_BASE>/tools/verify/capture-screen.ps1" -ProcessName <进程名> -OutPath <落盘路径>`，脚本在截取时即缩放至 ≤1280 宽再落盘；禁止直接 Read 未经缩放的原始截图——一张 2560 宽全屏图注入上下文约 60 万字符（≈本文件全文 42 倍），是长上下文最大单点来源。先窗口枚举确认目标 UI 可见、被遮挡作废、一次只进一张的规则不变。

行动纪律：工具调用之间最多一句话，只说明下一步动作，不复述规则与已得结论。
探索性、可逆、低代价的操作（窄范围已知值扫描、读内存、试参数、探活），在第一个可行方案上直接执行，用返回结果代替事前论证——事前比较对称方案不产生新信息；只有不可逆或高代价操作（写目标文件、patch、hook 注入、请用户配合）才需要事前完整论证。
轮次收尾只能是行动或明确的阻塞声明，不以状态汇报收尾。

初始化完成后的首条工作回复：

```text
阶段: [当前 task.phase，合法值见下文 phase-vocabulary]
deliverableTier: [从 task.json 读取的完整定义]
产物落点: artifacts/tasks/<task-id>/
成功判定: [要拿到什么证据]
收口义务: [report.md 待写章节与专题小节提示]
```

### task.phase 合法词表

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
- `port` → `Port`
- `close` → `Port`
- `completed` → `Port`

非法值声明：`RouteSync` / `Init` / `Sync` / `Advance` / `Close` / `Verify` / `Plan` / `Implement` 不是合法 `task.phase` 值——`Init`/`Sync`/`Advance`/`Close` 是叙事步骤（工具命令），`Verify`/`Plan`/`Implement` 是活动名；验证活动发生在 `Patch` / `Port` 阶段内部，不单独占相位。

叙事 A-D 门控与机器 phase 的对应（report-only 改造：过程文档出口义务已退役，阶段语义为推进方向，验收集中在收口 report.md；与 `docs/reference/reverse-workflow.md` 映射表同源收敛）：
- `RouteSync` / `Observe` / `Capture` ↔ 阶段 A（调查）：调查充分性靠自律（至少 1 条带锚点调用链），收口汇入 report.md「实现路径 / 逆向思路」节
- `Rebuild` ↔ 阶段 B（规划）→ 阶段 C（实现）：实现类 tier 另需 `run/run-local.mjs`（机器门禁保留）
- `Patch` / `PureExtraction` / `Port` ↔ 阶段 C（实现）：修改前备份 + backup-manifest（机器门禁保留），假设收口前全部有结论并写入 report.md「坑点与经验」节
- `Close`（叙事步骤，非 phase）↔ 阶段 D（验证）：证据覆盖全部 completionCriteria，逐条判定写进 report.md「验证证据」节
<!-- END GENERATED: phase-vocabulary -->

### 判据命中 / evidenceRefs / deliverableTier 词表

<!-- BEGIN GENERATED: criteria-vocabulary -->
本段由 `tools/task/validation.mjs` 的导出常量单源生成（sync-doc-facts 注入，勿手改）。

命中词汇表（`completionCriteria` 与 `successCriteria` 通用，`criteriaItemHit`）：
- 对象形态：`hit: true`，或 `status` 取值之一：`hit / met / passed / done / satisfied`
- 字符串形态：以 `[x]` 开头

`evidenceRefs` 合法形态（三选一，逐条核查，`criterionEvidenceRefValid`）：
- task-local 相对路径，指向已存在且非空的证据文件（与模板逐字一致的占位文件不算证据）
- `用户确认:<原文>`（等价 `user-confirmation:<原文>`）
- `call_xxx` 引用形式，须同时提供 `evidenceExcerpt`（或 `excerpt` / `evidenceContent`）

`deliverableTier` 五枚举（`DELIVERABLE_TIERS`，非法值直接 error、不享受任何豁免）：
- `evidence`
- `hook-script`
- `patch`
- `protocol-doc`
- `pure-algorithm`
<!-- END GENERATED: criteria-vocabulary -->

tier 豁免清单（机器规则，非价值判断）：`evidence` 与 `protocol-doc` tier 免 `run/run-local.mjs` 占位要求；`backup-manifest` 仅 `phase>=Patch` 或 `tier=patch` 触发——其余 closeout 门禁（successCriteria≥1 hit、completionCriteria 全 hit 且带 evidenceRefs、route-state 一致性）对全部 tier 一视同仁。tier 在 task-init 首轮锁定后，机器只校验形态（五枚举内、deliverableTier 改动会留 contract-change-log 痕迹但不阻止改判）——tier 的语义正确性靠自律，不得为走简化路径而误判 tier。

必须交付（均位于 `artifacts/tasks/<task-id>/`）：`report.md` / `task.json` / `run/verify-once.mjs`（task-init 预生成的框架验证线束，禁止覆写；任务自定义验证另建脚本并在 report.md 引用）以及判据证据链所指的真实文件（report-only 改造：`run/investigation.md` / `run/plan.md` / `run/assumptions.md` / `run/fixtures.json` 与专题 notes 义务已退役）。专题追加义务 = report.md「专题发现」节对应小节，以 `topics/<topic>/topic.json`、`docs/reference/output-contract.md`、`docs/reference/capability-matrix.md` 为准。

## 何时必须触发

逆向 PE/EXE/DLL/SYS/.NET/Mixed-Mode、处理壳/反调试/抗分析、处理 Electron/CEF/WebView2、处理驱动/IOCTL/Frida、处理 TLS/网络/SSL Pinning、处理 Loader/注入、处理 IPC/持久化、处理配置/许可证恢复、处理 Windows CTF、处理游戏逆向、处理恶意软件分析、处理协议/签名还原、延续既有任务。

不属于本技能：普通 Windows 开发、未授权漏洞利用、Android 逆向、非 Windows 场景逆向。

## 专项参考

需要时按专题补读 `references/`（文件名均指该目录下）：静态分诊 `static-triage-playbook.md`；Web 套壳 `web-shell-triage.md` + `electron-playbook.md`；壳/脱壳 `packers.md`，VMP 另见 `vmp-unpack-playbook.md` / 局部去虚拟化 `vmp-devirt-playbook.md`；反分析 `anti-obf.md` + `protection-bypass.md`；.NET `dotnet.md`；注入 `loader-injection.md`；TLS/网络 `tls-network-playbook.md`；驱动 `driver.md`；静态分析优先 `static-analysis.md`；Frida `frida.md`；混合模式 `mixed-mode-interop-playbook.md`；IPC/持久化 `ipc-persistence-playbook.md`；异常/运行时 `exception-runtime-playbook.md`；内存取证 `memory-forensics-playbook.md`；CTF `ctf.md`；游戏逆向 `game-reverse.md`；恶意软件 `malware-analysis.md`；协议/签名 `app-protocol.md`；配置/许可证恢复 `config-recovery.md`；UI 消息流 `ui.md`；drill 演练 `drill-playbook.md`；MCP 任务模板 `mcp-task-template.md`；task-input 模板 `task-input-template.md`；环境搭建 `setup-guide.md`；工具链职责与优先链 `tool-chains.md`。

防护定级 T0-T6、架构/WOW64/Mixed-Mode/IPC/Exception/Memory 专项要求，按对应 reference 与 topic manifest 执行。
