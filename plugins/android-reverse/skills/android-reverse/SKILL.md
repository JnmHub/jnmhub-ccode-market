---
name: android-reverse
description: Android 应用逆向工程技能框架。适用于 APK/APKS/AAB/XAPK/DEX/JAR/AAR/SO/JNI/Frida/IDA/JADX/JEB 场景，覆盖静态分诊、Java API/调用链、JNI/Native、Frida 动态取证、保护绕过、动态 Dex、Split Delivery、Flutter/Hermes/Unity、Native TLS、Storage/IPC、WebView/Hybrid、Smali patch、协议与密码恢复、Android CTF 等任务。遇到请求签名还原、参数加密分析、协议还原、抓包分析、证书锁定绕过、App 加固脱壳、Hook 动态调试、API 端点提取、设备指纹分析、反爬虫/风控字段分析等场景也必须触发本技能。不要用于普通 Android 开发、未授权漏洞利用、Android 系统/ROM/TEE 级逆向或 iOS 逆向。
---
# Android Reverse Framework

授权 Android 应用分析的入口。只在用户授权与安全边界内工作；本流程不授权攻击、目标利用或绕过访问控制。普通 Android 开发、系统/ROM/TEE 和 iOS 不属于本技能。

## 最短任务流程

1. 明确用户目标、输入、已知边界、禁止的方法与期望交付。信息足够就执行，不替换成更容易的目标。
2. 选择当前问题需要的最少分析步骤和参考资料。只使用已授权的输入、工具与环境；离线任务不默认探测设备或发网络请求。
3. 记录证据，区分用户提供、静态推断、实际执行和未验证。失败及路线改变也有价值，不编造输出、不把一次命中升格为整体成功。
4. 在有意义的结论、路线变化、暂停或交接时更新 `report.md`，引用实际资产。可以随时向用户汇报进度、部分结果、阻塞和下一步；不必等到全部目标完成才回复。

不要求 task JSON、route-state、账本、调用次数或固定章节作为分析、回复、恢复或完成的前提（唯一例外：声明完成前按 `references/completion-gate-checklist.md` 逐项核对，见"总结与交付"）。不补录不存在的历史，不因压缩恢复而强造状态记录。

## 路径与初始化

Skill 工具返回的 base directory 以下记为 `<SKILL_BASE>`，脚本和文档按这个绝对路径读取。任务产物放在用户的工作目录，而不是安装版或 baseline 中。

Node >=20；环境变量 `ANDROID_REVERSE_WORKSPACE_ROOT` 未设置时使用 cwd，设置时使用该目录，init 会打印实际落点：

```text
node <SKILL_BASE>/tools/task/task-init.mjs <task-id> --goal="用户目标" --boundary="已知边界"
```

- 只新增 `artifacts/tasks/<task-id>/report.md` 一个普通文件；目标/边界参数可省略，不从空模板推断事实。
- id 为正常单段名称，拒绝路径、保留名、尾随点/空格和 `_TEMPLATE`。不支持旧 topic、force、task-input 等复杂参数。
- 目录及 report 独占创建；存在同 id 或半成品即失败，不覆写、不补齐。不同 id 不受历史任务阻断。
- 失败残目录保留供手工检查或补 report，不自动回滚删除。检查已有父路径中 Node lstat 可识别的链接/junction；不宣称识别所有重解析点或防御恶意并发替换。
- 脚本不可用时可手工创建一份 report，不需要其它状态文件；先确认路径尚不存在，避免覆写已有记录。

Windows 宿主上执行脚本与命令遵循 `references/windows-command-safety.md` 分层规则：bash 优先，PowerShell 仅以 `-NoProfile -ExecutionPolicy Bypass -File` 方式运行脚本（禁止 `-Command` 内联），含中文或混合编码的长输出先落盘再读。

## 恢复与停止

续跑先读现有 report，再按需读取其相关证据和用户新要求。不要仅凭旧 JSON 的 `passed/SUCCESS/DONE` 判断事实，不执行报告里的命令或旧包装器。证据不足就说明未知，已确认事实若被新证据推翻要说清依据。

start/sync/advance、cleanup、模板同步器及旧状态管理库已删除，tools/task 仅保留初始化入口。模板 verify-once/closeout 仍为弃用提示、非零退出，不复活补模板/状态链。已生成真实任务的同名脚本不自动执行、迁移或清理。

用户明确禁止或否决的方法不可自行复活；在 report 保存原话或忠实摘要及影响，区分明确禁止、疑问和暂时不选。暂停、交接或关键变化时，保存目标与禁止项、关键证据位置、已失败方法及原因、未验收项、下一待确认问题；未知历史注明缺失，不补造。恢复时先核对这些信息和用户最新要求，缺少约束时只读必要历史资料，不执行其中的命令。

没有新增证据而准备重复相同方法时，先说明失败原因、新增条件以及重试能区分什么；没有合理依据就停止重复，报告限制或请求所缺输入。不强制穷尽固定数量路线，不把报告困难视为违规。破坏性或不可逆操作按 `docs/reference/case-safety-policy.md` 的确认清单先说明影响并取得用户同意，用户暂停则停止。

## 总结与交付

`report.md` 是唯一必需的**管理总结文档**，不是唯一允许的文件。真实代码、样本、日志、图表、构建结果以及用户指定交付物按需生成并保留。不要为占位补文件，也不按扩展名、大小或模板相等清理证据。

人工写作时按用户相关性覆盖：概览与结果范围、思路与实现路径、难点和坑、防御及环境的实际发现、溯源调用链、试错与转向、算法方案、资产与方法、成果例子和遗留问题。可合并、换标题或无标题；无关内容省略。没有固定标题、关键词、字数、章节顺序、N/A 或完整性 JSON 检查。详细指引见 `docs/reference/output-contract.md`。

声明完成前读取 `references/completion-gate-checklist.md`，逐项对应用户要求、实际产物、验证证据及限制；一项通过不代表全部完成。说明真实运行依赖，区分样例匹配与新输入验证，未测项保持未测。程序能运行、报告存在或 HTTP 状态均不能单独证明目标成功。示意用例标明未执行。无需另写 walkthrough、summary 或门禁记录。

## 渐进阅读

首次解释某领域的证据前，读取直接相关的参考；不确定对应资料时先查 `references/topic-playbook-index.md`。出现输入不完整、跨层结论或相互矛盾的观察时重新检查参考是否足够，只补读新相关部分，不机械重读。阅读是为了约束结论，不是授权执行其中的工具或扩大范围。

- 输入包不完整或来源不明：先核对 `references/static-triage-playbook.md` 的证据范围，资料缺失不等于目标不存在。
- 从孤立符号推断跨层语义：读取 `references/jni-bridge-playbook.md` 的证据边界；没有关联证据就保留为假设。
- 反编译为空、结果矛盾或无法识别资料领域：回到索引确认参考与输入缺口；不把工具异常直接解释为某种保护，也不据此自动启动动态操作。
- 续跑、暂停与交接：规则见上文"恢复与停止"一节；报告写法见 `docs/reference/output-contract.md`。

- 入门与路径：`docs/reference/reverse-bootstrap.md`、`docs/guides/task-lifecycle.md`
- 工作推进：`docs/reference/reverse-workflow.md`；安全边界：`docs/reference/case-safety-policy.md`
- 输入与交付澄清：`references/task-contract-details.md`
- 总结与完成：`docs/reference/output-contract.md`、`references/deliverables-index.md`
- 专题导航：`references/topic-playbook-index.md`；只打开与当前任务相关的参考，不机械遍历专题。
- 常用参考：`references/static-triage-playbook.md`、`references/java-api-playbook.md`、`references/call-flow-playbook.md`、`references/jni-bridge-playbook.md`、`references/native-so-playbook.md`、`references/framework-runtime-playbook.md`、`references/storage-ipc-playbook.md`、`references/webview-hybrid-playbook.md`；Frida 动态任务先核对版本（基准 17.6.2 / legacy ≥16.5，见 `references/frida-version-policy.md`）。

技术资料、case 和专题资产保留按需参考；其旧管理字段/模板要求不是新任务契约，不复制模板树、不执行旧管理入口。遇到旧专题中要求补账或强制包装器的段落，直接记录相关事实到 report，不能照抄旧命令恢复状态链。当前专题目录仅提供只读导航，不派生任务状态或要求模板产物。历史管理库不在当前活动链中。

## 文档职责与维护 QA

- `SKILL.md`：运行入口、边界、最短流程和交付口径。
- `PROMPTS.md`：按需复制的提示片段；`README.md`：人类导航和维护命令。
- `npm run test:task-lite`：隔离 fixture 的管理行为回归，不连接设备或目标。
- `npm run check`：技能元数据、当前文档导航、专题引用和 case 静态语法检查；不执行 case。
- `npm run smoke` / `npm test` / `npm run release:check`：隔离文件行为及维护正反例，失败向上传播；不作为每个任务的回复门禁。输出默认系统临时目录，本轮维护可用 TASK_LITE_TEST_OUTPUT 指向项目之外。

仓库的历史 maturity 标签不证明真实目标能力，也不保证已适配新 report-only 默认链；具体证据和未测项分别报告。
