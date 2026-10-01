---
description: 工作台自检（check 的别名）：验证 Skill / MCP / 提示词 / 工具链是否部署完整
argument-hint: [可选：只检查某一项]
---

[环境体检任务] 检查本插件在当前环境下的部署完整性，并把结果分类汇报。

$ARGUMENTS

检查项与判定口径同 `/check`：技能可见性、MCP 启动、内置工具链解压状态、Python 依赖。

自检脚本在上游仓库里是 `setup/verify.ps1` / `setup/verify.sh`，已随包收录在插件目录的 `setup/` 下；它们按上游目录布局编写，若与 CCode 缓存目录不一致，以实际探测结果为准，不要伪造通过。
