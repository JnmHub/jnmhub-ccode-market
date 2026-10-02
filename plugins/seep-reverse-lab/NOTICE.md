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

3. **`.mcp.json` 里 `seep` server 的 `command` 由写死的 `python` 改为 `${CCODE_PYTHON}`**。
   上游写死 `python`，这个名字**只在 Windows 上普遍成立**；macOS / Linux 上通常是 `python3`，
   `python` 往往根本不存在 ⇒ 同一个包在 mac 上启动 MCP 会直接 `spawn ENOENT`。
   改成 `${CCODE_PYTHON}` 后由客户端按平台给值（win32 → `python`，其它 → `python3`；
   用户在设置页「运行环境」手动指定了路径则以那个为准），于是**一份配置两端都对**。
   这是本市场面向所有插件的通用约定，见根 `README.md` 的「跨平台」一节。

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
  `Tool/skill/safe-skills`。**两个都必须写**，因为客户端有两套扫描：UI 侧（桌面 services，
  `walkSkillMarkdownPaths`）是**递归**的，agent 侧（`adapters/src/skills/scan.ts` 的
  `scanSkillFilesUnderRootSync`）是**单层**的（根本身 + 直接子目录）。
  单层那套只有声明了子根才能看到 `safe-skills` 下的 5 个（它们的 `SKILL.md` 在下一层）；
  **删掉子根声明会让 agent 侧从 9 掉到 4**。上游另有更深层的 `SKILL.md`
  （在 `Tool/mcp/**`、`Tool/upstream/**` 内），**故意未注册**为技能，避免引入无关的第三方技能名。
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

---

# 追加：在 CCode 里怎么用（2026-10 补）

上游那份 `Tool/prompts/extensions/security-audit-interceptor.ts` 是给 **Pi** 写的进程内扩展
（`import { ExtensionAPI } from "@earendil-works/pi-coding-agent"`），CCode 不加载也不执行它。
所以本插件在 CCode 里**不要**指望它那四件事（lab-mode 开关 / 快捷口令 / 词表替换 / Gemini
`BLOCK_NONE`）生效。原文件**保持原样未改**，Pi 用户照旧可用。

能力按下面的方式映射到 CCode 原生机制，互不重复、不冲突：

| 上游扩展里的能力 | 在 CCode 里的归属 | 说明 |
| --- | --- | --- |
| 词表替换（`SENSITIVE_WORD_MAP` 31 条） | **CCode 内置**「设置 → Agent 能力 → 输入替换」的内置预设「Seep 逆向工作台」 | 本插件**不再重复实现**，避免与内置功能冲突 |
| lab-mode 开关（`~/.pi/agent/lab-mode.flag`） | **CCode 内置**输入替换的总开关（按 profile 隔离） | 不需要 flag 文件；切 profile 即换一份配置 |
| 快捷口令（`poc` / `hook` / `keygen` …） | **本插件的斜杠命令**（`commands/`） | 见下表 |
| Gemini `safetySettings: BLOCK_NONE` | 尚未移植 | 它是 Google 专有字段，只在客户端真走 Gemini 时才有意义，需先确认 provider |

## 本插件提供的斜杠命令

命名约束：CCode 的命令名只允许 `a-z0-9._-`（可含 `:`），因此上游那几个中文口令
（`找验证` / `体检` / `检查`）**无法作为命令名**，未收录；对应的 `find-auth` / `check` /
`doctor` 已覆盖同样语义。

| 命令 | 对应上游口令 | 用途 |
| --- | --- | --- |
| `/poc <目标>` | `poc` | 客户端本地鉴权逻辑脆弱性验证（CWE-602） |
| `/test <目标>` | `test` | 客户端鉴权逻辑安全走查 |
| `/find-auth <目标>` | `find-auth` | 检索授权/会员/订阅/License 判断位点 |
| `/hook <方法>` | `hook` | 编写 Frida / LSPilot 动态验证脚本 |
| `/gen-patch <位点>` | `gen-patch` | 编写等长热补丁验证代码 |
| `/report` | `report` | 汇总生成白盒安全评估报告 |
| `/triage <样本>` | `triage` | 样本全量体检与基础画像 |
| `/kb <主题>` | `kb` | 检索随包知识库，先查方法论 |
| `/full <样本>` | `full` | 全链路自动化分析 |
| `/keygen <目标>` | `keygen` | 算号可行性评估与路线决策 |
| `/check` | `check` / `体检` / `检查` | 工作台自检 |
| `/doctor` | `doctor` | 自检（`/check` 别名） |

## 组合顺序（与内置功能的关系）

CCode 侧的执行先后是固定的，插件无法插队：

```
用户输入
  → 【内置】输入替换（按 profile 的词表；总开关关闭时整段跳过）
  → 【内置】插件斜杠命令解析（`/poc` 这类）
  → 【插件】hooks（若声明，见下）
  = 送进模型的文本
```

两点由此推出：

1. **内置替换对斜杠命令整条跳过**（命令名必须保持可解析）。所以 `/poc 破解某软件` 里的参数
   **不会**被词表替换 —— 这是有意的保守取舍，代价只是「命令参数不替换」。
2. 斜杠命令的展开结果**会**参与后续流程，命令正文因此可以直接承担合规表述（本插件的命令正文
   已自带 `[授权白盒审计任务]` 前缀）。

## 插件还可以用 hook 改写用户输入

CCode 的 `UserPromptSubmit` hook 支持 `updatedPrompt` 字段（在 hook 的
`hookSpecificOutput` 里返回），它成为**送模型的那一份**，而界面与输入历史仍显示用户原文。
路径：插件目录下 `hooks/hooks.json`，或 `plugin.json` 的 `hooks` 字段。

本插件**目前没有**声明任何 hook：它需要的改写已经由 CCode 内置的输入替换覆盖，再声明一个
只会和内置能力重复。这里写出来是为了说明可用性，以及「需要时不必改宿主」。

---

# 追加：安装后的实测结果与必须补的前置条件

用 CCode 自带 CLI 走了一遍真实安装（隔离数据根，非模拟）：

```
ccode plugins marketplace add D:\code\jnmhub-ccode-market   → Added marketplace jnmhub-ccode-market (16 plugins)
ccode plugins install seep-reverse-lab@jnmhub-ccode-market  → Installed (1.1.0) [enabled]
ccode plugins list                                          → skills: 9, mcp: plugin:seep-reverse-lab:seep, plugin:seep-reverse-lab:js-reverse
ccode commands                                              → Custom commands (12)：/check /doctor /find-auth /full /gen-patch
                                                              /hook /kb /keygen /poc /report /test /triage
```

即：**9 个技能、12 条斜杠命令、2 个 MCP server** 都被正确识别，版本 1.1.0 从市场条目正确读出。
`ccode plugins validate` 对本包与整个市场均通过。

## ⚠️ `seep` MCP 在装好 Python 依赖前会启动失败

`seep` server 是 Python 进程（`Tool/mcp/seep_mcp_server.py`）。它只依赖标准库 + **`mcp` 包**，
而该包不在 Python 标准库里。**本机实测：Python 3.12.10 在，`mcp` 包未安装** ⇒ 首次启用插件时
CCode 会报这个 MCP 启动失败（技能与命令不受影响，仍可用）。

补齐：

```bash
pip install mcp            # 或：python -m pip install mcp
```

另外 `js-reverse` server 走 `npx -y js-reverse-mcp`，需要 Node 与网络。

## 内置工具链需要先解压

`Tool/mcp/Tool/safe/` 下的 jadx / radare2 / apktool / ida-pro-mcp / js-reverse-mcp / playwright-mcp
以 `.zip` / `.jar` 形式随包分发，未解压。用到相应能力前，先在插件目录里跑上游安装脚本：

- Windows：`setup/install.ps1`
- Linux / macOS：`setup/install.sh`

## 客户端侧两个缺陷会让技能页「只显示一半」（已修；留档 + 绕开办法）

在 CCode 二开版上实测到：技能页曾只列出本插件的 **5** 个技能，且其中 `apk-reverse` /
`ida-reverse` / `radare2` 显示成**目录名**（而不是 frontmatter 里的 `seep-safe-*`），
全程**不产生任何诊断**。原因是客户端，不在本插件：

1. 同时声明父根与子根时，客户端把**父根**当成「被更深根完全覆盖的祖先目录」丢掉 ⇒
   父根下 4 个（`softseep` / `apkseep` / `seep-ida-reverse` /
   `client-license-validation-bypass`）全部消失；
2. frontmatter 解析不剥 UTF-8 BOM ⇒ 带 BOM 的 3 个技能名退化成目录名。

二开版已修（覆盖判定改为「只丢可证明被祖先递归遍历覆盖的子根」，并补上 BOM 剥离）。

**上游 `zai-org/ZCode` 未修。但不要靠改 `skills` 声明去绕**：实测（同一份 fixture）
只声明父根 `["Tool/skill"]` 时，修复前的 UI 侧确实能拿到全部技能，可 agent 侧是**单层**扫描，
会从 9 掉到 4 —— 拿一个面的正确去换另一个面的错误，不划算。正确做法是修客户端那两处。

命令行侧本来就看不到这两个 bug：`ccode plugins list` 一直报 `skills: 9`
（单层扫描 × 两个根：`Tool/skill` 出 4 个、`Tool/skill/safe-skills` 出 5 个）。
