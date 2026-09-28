# Cases

case 是抽象技术 workflow 参考，不放真实样本，也不代表真实目标验证。

续跑先阅读现有 report 与相关证据，结合用户当前目标；旧 task/route 状态、case 字段和 deliverables 列表不是当前任务契约，不要求补齐、不自动执行。

按相关性参考候选入口、观察、失败信号和判断依据。实际代码和资产由任务需要决定，不被 formalValidation 或固定文件数量约束。

维护 lint 按 topics/*/topic.json 声明的 caseFiles（及抽象模板）做 Node 静态语法检查和疑似凭据启发式诊断，不 import 或执行 case。普通参考 URL 可以保留；诊断不等同于完整秘密扫描。
