---
description: 工作台自检：验证 Skill / MCP / 提示词 / 工具链在该环境是否部署完整
argument-hint: [可选：只检查某一项]
---

[环境体检任务] 检查本插件在当前环境下的部署完整性，并把结果分类汇报。

$ARGUMENTS

检查项：
1. **技能**：`softseep` / `apkseep` / `client-license-validation-bypass` / `seep-ida-reverse` / `seep-safe-*` 是否在技能列表里可见；
2. **MCP**：`seep`（python 启动 `Tool/mcp/seep_mcp_server.py`）与 `js-reverse` 是否启动成功；
3. **工具链**：`Tool/mcp/Tool/safe/` 下的 jadx / radare2 / apktool / ida-pro-mcp / js-reverse-mcp / playwright-mcp 是否已解压可用；
4. **Python 依赖**：`seep_mcp_server.py` 所需的 `mcp` 包是否可导入。

本插件的自检脚本在上游仓库里是 `setup/verify.ps1`（Windows）/ `setup/verify.sh`（Linux/macOS），已随包收录在插件目录的 `setup/` 下；它们按上游的目录布局编写，若与 CCode 的缓存目录不一致，请以实际探测结果为准，不要伪造通过。

逐项给出「检查命令 + 真实输出 + 结论」，失败的项说明缺什么、怎么补。
