# NOTICE — seep-reverse-lab（第三方整包收录）

本目录是第三方仓库的**整包收录**，不是本市场原创内容。

| 项 | 值 |
| --- | --- |
| 上游 | https://github.com/angusdevgo/Seep-Reverse-Lab |
| 收录版本 | commit `a03d20fc4002dc5df8ef708511d9c51fa9279537`（2026-10-01）；用 `git clone --depth 1` 取得 |
| 上游许可证 | **GPL-3.0** — `LICENSE` 原文随包保留在本目录根 |
| 本目录规模 | 约 306 MB / 4626 文件 |

## 相对上游的改动（仅以下两类，其余逐字节保持一致）

1. **5 个技能的 frontmatter `name` 加 `seep-` / `seep-safe-` 前缀**。
   原因：CCode 按技能 `name` 全局去重，后到的同名技能会被静默忽略（`skill_duplicate_name`）。
   这几个名字与本市场已有技能冲突（`ida-reverse`、`reverse-engineering` 属独立插件；
   `apk-reverse`、`radare2` 属同市场的 `zzy-reverse-skill` 包）。**只改 frontmatter，目录名未动**，
   所以包内按路径写的引用（`ida-reverse/`、`radare2/` …）仍然有效。

   | 文件 | 原名 | 现名 |
   | --- | --- | --- |
   | `Tool/skill/ida-reverse/SKILL.md` | `ida-reverse` | `seep-ida-reverse` |
   | `Tool/skill/safe-skills/ida-reverse/SKILL.md` | `ida-reverse` | `seep-safe-ida-reverse` |
   | `Tool/skill/safe-skills/apk-reverse/SKILL.md` | `apk-reverse` | `seep-safe-apk-reverse` |
   | `Tool/skill/safe-skills/radare2/SKILL.md` | `radare2` | `seep-safe-radare2` |
   | `Tool/skill/safe-skills/reverse-engineering/SKILL.md` | `reverse-engineering` | `seep-safe-reverse-engineering` |

   未改名（上游名即不冲突）：`softseep`、`apkseep`、`client-license-validation-bypass`、
   `mcp-js-reverse-playbook`。

2. **`.mcp.json` 里 `seep` server 的脚本路径改为 `${CCODE_PLUGIN_ROOT}/Tool/mcp/seep_mcp_server.py`**。
   上游写的是相对路径 `Tool/mcp/seep_mcp_server.py`，而 CCode 会把市场缓存到自己的目录后再启动
   MCP，进程 CWD 不是包根，相对路径会失效。`${CCODE_PLUGIN_ROOT}` 是 CCode 的插件根模板变量，
   在 command/args/env 中会被替换为实际插件根。`js-reverse` 项未改（`npx -y js-reverse-mcp` 全局可解析）。

## 未改动、随包一并转发的第三方内容（需自行评估）

- `Tool/mcp/Tool/safe/**`（约 234 MB）：随包内置的工具链 —— jadx、radare2、apktool、
  ida-pro-mcp、js-reverse-mcp、playwright-mcp、hook-mcp。含单文件最大的
  `jadx/lib/jadx-1.5.6-all.jar`（74.6 MB）。
- `Tool/upstream/**`（约 64 MB）：上游对该仓库**自身**也已镜像的三个第三方项目
  （`apk-reverse`、`open-tgtylab`、`open-reverselab`）。即本包是对这些项目的**二次转发**，
  其各自许可证以上游目录内的文件为准。
- `Tool/cases/**`：示例案例；`Tool/prompts/**`：提示词扩展；`docs/`、`setup/`、`MANUAL`。

## 许可证歧义（需向上游确认）

上游仓库根 `LICENSE` 是 **GPL-3.0**，但包内 4 个技能文件在 frontmatter 里自行声明 `license: MIT`：

```
Tool/skill/softseep/SKILL.md                            license: MIT
Tool/skill/apkseep/SKILL.md                             license: MIT — see LICENSE at the repository root
Tool/skill/ida-reverse/SKILL.md                         license: MIT
Tool/skill/safe-skills/reverse-engineering/SKILL.md     license: MIT
```

两者不一致。本市场**不做裁决**：不替它改写任何许可证声明，也不改写上游 `LICENSE` 原文。
整体收录按仓库根 `LICENSE`（GPL-3.0）对待。

## CCode 集成方式

- `.ccode-plugin/plugin.json` 的 `skills` 声明了两个扫描根：`Tool/skill` 与
  `Tool/skill/safe-skills`（CCode 对每个根只扫一层，`safe-skills` 下的 5 个包需要单独声明）。
  上游另有更深层的 `SKILL.md`（在 `Tool/mcp/**`、`Tool/upstream/**` 内），**故意未注册**为技能，
  避免引入无关的第三方技能名。
- `.mcp.json` 由 CCode 从插件根自动读取，其 `command`/`args`/`env` 支持 `${CCODE_PLUGIN_ROOT}`。
- 部分技能文件带 UTF-8 BOM（`Tool/skill/safe-skills/{apk-reverse,ida-reverse,radare2}/SKILL.md`）。
  CCode 的 frontmatter 解析会剥离 BOM，可正常读取；此处保留原文未动。

## 运行前提

技能正文可直接加载使用；但 `seep` MCP server 与脚本类能力需要额外环境：

- Python 3.10+（`seep_mcp_server.py` 依赖 `mcp` 包）
- 内置工具链未解压状态下需先运行上游安装脚本：
  Windows `setup/install.ps1`，Linux/macOS `setup/install.sh`（解压 `Tool/mcp/Tool/safe/**.zip`、
  安装依赖、生成各客户端配置）

未满足前提时，CCode 会在 MCP 诊断里报该 server 启动失败，技能文本仍可用。
