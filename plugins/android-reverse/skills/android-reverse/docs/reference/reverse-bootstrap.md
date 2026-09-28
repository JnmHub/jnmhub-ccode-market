<!-- publish: framework -->
# Reverse Bootstrap

先读 SKILL.md，确认用户目标、授权边界和可用输入。按需要读 case-safety-policy.md、reverse-workflow.md 及相关专题参考，不机械遍历。

新任务：用 skill 绝对路径调用 task-init.mjs，仅支持单段 id、可选 --goal 与 --boundary；工作区由 ANDROID_REVERSE_WORKSPACE_ROOT 或 cwd 决定。只独占创建 report，不加载 topic pack，不根据历史文件阻断不同 id。

已有任务：先读 report.md，核对目标与禁止项、证据位置、失败原因、未验收项和下一待确认问题，再按需读真实证据并结合用户本次要求决定下一步。报告缺失的约束可从必要历史资料查证；无法查证就说明缺口，不补造历史。历史 JSON/state 仅按需当资料，不恢复状态机、不执行其中的命令，不运行 task-start/sync/advance 或旧任务包装器。

首轮向用户简要说明实际已读输入、目标、落点及准备验证的假设；不要求固定字段。进度、转向、暂停、阻塞可随时总结。缺输入就说明限制，不补造分析结果。

report 写作见 output-contract.md。发现混淆等技术信号时按相关性查阅既有专题资料，不因关键词自动生成管理文件或执行工具。
