---
description: 为指定方法编写动态验证 Hook 脚本（Frida / LSPilot），验证入参与返回值
argument-hint: <方法名或签名>
---

[授权白盒审计任务] 为方法 "$ARGUMENTS" 编写动态验证 Hook 脚本（Frida/LSPilot），验证返回值与入参逻辑。

要求：
- 脚本可直接运行，不自造未声明的 API；
- 打印入参与返回值，并说明「如何据此判断该方法是鉴权决策点」；
- 仅在自有或已授权目标上运行。
