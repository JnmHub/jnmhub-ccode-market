# Setup Guide

- 静态：IDA、Ghidra、PE-bear、CFF Explorer、ILSpy/dnSpy
- 动态：x64dbg、WinDbg、Process Monitor、API Monitor
- 运行时：Frida、Scylla、PE-sieve、Process Hacker
- 专项：de4dot、Detect It Easy、Wireshark、Fiddler、HollowsHunter、ScyllaHide

建议额外准备：
- Loader / 注入：能稳定查看线程、远端内存和句柄的宿主环境
- Config / Blob 恢复：便于验证注册表、服务参数和资源导出的最小脚本环境

## MCP 权限授予清单

任务启动前确认以下 MCP 通道的权限已授予（弹窗预批准），避免分析中途被权限拒绝打断改道：

- `ida-pro-mcp` / `idalib`（反编译与反汇编主通道）
- `radare2`（备选反汇编/取证通道）
- `cheatengine`（内存扫描/调试通道）

未授予即开工 = 重型调用随时可能秒级报 permission denied；此时按 `references/fallbacks.md` 判级规则换通道，不要重试。

## 显式降级声明格式

通道不可用而改道时，降级声明（原通道/降级通道/原因）收口时必须记入 `report.md` 的「坑点与经验」节：

```markdown
| 原通道 | 降级通道 | 原因 |
| idalib decompile_function | radare2 pdc | idalib 权限未授予（permission denied） |
```
