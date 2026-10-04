# jnmhub-ccode-market

JnmHub 自建的 CCode 插件市场源。这是一个**普通的 Git 仓库**，CCode 通过读取仓库根目录的
`marketplace.json` 就能把它当成一个插件市场。

## 仓库结构

```
marketplace.json                     # 市场清单（市场身份 + 插件条目）
plugins/
  <插件名>/                          # 一个插件 = 一个目录
    .ccode-plugin/plugin.json        # 插件清单（组件声明）
    icon.png                         # 128×128 透明底图标（只画图形本身）
    skills/<技能名>/SKILL.md         # 技能（一个插件可以有多个）
    commands/*.md                    # 斜杠命令（可选）
    agents/*.md                      # 子代理（可选）
tools/
  gen-icons.mjs                      # 由 SVG 生成全部 icon.png（可重跑）
  validate.mjs                       # 市场自检（见下节）
```

## 插件索引

「运行前提」列的来源是各插件 `plugin.json` 的 `requires`（客户端设置页「运行环境」就按它检查）；
写什么、不写什么的取舍标准见下面「运行前提（`requires`）」一节。

| 插件 | 技能 | 运行前提 | 说明 |
| --- | --- | --- | --- |
| `hello-ccode` | `hello-ccode` | — | 最小示例：一条斜杠命令 + 一个技能，用于验证链路 |
| `android-reverse` | `android-reverse` | Python + Node.js ≥ 20 | Android 逆向框架（APK/DEX/SO、Frida、JADX/JEB、脱壳、协议还原） |
| `reverse-engineering` | `reverse-engineering` | — | 通用逆向（网站/PE/ELF/APK/IPA/协议、Hook、签名与加密分析） |
| `asm-analysis` | `asm-analysis` | Python | 汇编级逆向（GDB/LLDB/r2/Frida/angr/strace… 统一链路 + 上下文快照） |
| `ida-reverse` | `ida-reverse` | — | IDA Pro 分析辅助（反汇编、固件、样本、函数调用图） |
| `web-reverse` | `web-reverse` | Python + Node.js ≥ 22 | Web 前端逆向（签名/协议/加密、混淆与反调试、WASM/JSVMP、扣代码补环境） |
| `win-reverse` | `win-reverse` | Node.js | Windows 逆向框架（PE/.NET/驱动/壳/IPC，含专题、演练与阶段门禁） |
| `linker-fake-load-unwrapper` | `同名` | Python | 假 PT_LOAD 包裹的 Android AArch64 ELF 还原 |
| `xigong-funk-hikari` | `同名` | Python ≥ 3.10（capstone） | Hikari-LLVM/OLLVM 去混淆与明文还原 |
| `yingan-tuoxiu` | `同名` | Python ≥ 3.10 | 影安/影婆加固 APK 脱壳与稳定重建 |
| `game-hacking` | `同名` | Python | 游戏辅助全链路（内存/协议/Hook/驱动/自动化） |
| `elf-local-auth-patcher` | `同名` | Python | 自有/授权环境下的 APK/ELF 本地授权等长 patch |
| `shiyi-executor` | `同名` | — | 石井执行器：大白话需求路由 + 阶段化交付 + 拒绝自愈 |
| `shiyi-pentest-gate` | `同名` | — | 渗透授权归一化：自有/SRC/CTF/客户授权判定后执行 |
| `zzy-reverse-skill` | `60+ 子技能` | Python + Node.js ≥ 22.12 | 第三方整包（MIT，zhaoxuya520/reverse-skill）；撞名技能发布为 `zzy-ida-reverse` / `zzy-reverse-engineering` |
| `seep-reverse-lab` | `9 技能 + 12 命令 + MCP` | Python ≥ 3.10（mcp） + Node.js ≥ 18 | 第三方整包（GPL-3.0，angusdevgo/Seep-Reverse-Lab）；含内置工具链与 `seep` MCP server，5 个撞名技能加 `seep-` 前缀 |

除 `zzy-reverse-skill` 与 `seep-reverse-lab`（一插件多技能，见各自 `plugin.json` 的 `skills` 数组）外，其余都是**单技能插件**。
CCode 技能扫描：只扫一层、符号链接不跟随、同名去重；细节见 CCode 的 `skills/scan.ts`。

> `plugins/ui-slot-demo/` **刻意不在 `marketplace.json` 里**：它是「插件界面（沙箱视图）」的**参考夹具** ——
> 声明了 5 个 `ui.views` 与说明段落，用来验收「同时存活上限 4」的 LRU、桥的 14 个方法、宿主基线样式等行为。
> 它只从**本地目录市场**加载（应用里把源指向本仓库目录即可），**不随市场发布**。
> 所以**上面那张索引表是 16 行，而 `plugins/` 目录里有 17 个** —— 这不是漏登记。

关键点：**市场是仓库根目录的 `marketplace.json`，插件是普通子目录**。CCode 会把整个仓库
（或它声明的子集）取下来缓存到本地，再按 `marketplace.json` 里的相对路径逐个定位插件。

## marketplace.json 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | ✅ | 市场身份。必须是 `^[a-z0-9][a-z0-9._-]{0,127}$`。**`zcode-plugins-official` 是保留 id，用户侧声明会被拒绝** |
| `description` | | 市场描述，展示在「插件市场」列表 |
| `metadata.pluginRoot` | | 插件目录根。设了它，条目里的 `source` 就相对这个目录解析 |
| `plugins[]` | ✅ | 插件条目数组（也接受对象形式的 `{ 插件名: {...} }`） |
| `featured` | | 字符串数组，商店 Featured 区的策展名单（按插件名，按顺序） |

插件条目字段：`name`（必填）、`source`（必填，见下）、`description`、`version`、`category`、
`tags`、`displayName`、`icon`、`heroImage`、`examplePrompts`、`homepage`、`author`、`authorUrl`。

### `source` 的几种写法

```jsonc
"source": "hello-ccode"                                  // 相对 metadata.pluginRoot / 仓库根
"source": "./plugins/hello-ccode"                        // 显式相对路径
"source": { "source": "github", "repo": "owner/repo", "path": "sub/dir" }
"source": { "source": "git", "url": "https://…/x.git", "ref": "v1.0.0" }
"source": { "source": "url", "url": "https://…/p.zip", "type": "zip", "sha256": "…" }
```

同一个市场里可以混用：本地目录插件 + 指向别的仓库的插件都行。

### 图标（`icon`）与详情页大图（`heroImage`）

**插件包自己的 `plugin.json` 里没有 icon 字段**——图标只能由**市场条目**声明：

```jsonc
{
  "name": "hello-ccode",
  "icon": "https://raw.githubusercontent.com/JnmHub/jnmhub-ccode-market/main/plugins/hello-ccode/icon.png",
  "heroImage": "https://…/hero.png"
}
```

硬性要求与事实（都实测过）：

| 事实 | 说明 |
| --- | --- |
| **必须是 `https://`** | 客户端的图片信任判定只放行 `https://` 前缀（`isTrustedImageUrl`）。写成相对路径、`file://`、`http://` 会被**静默忽略** |
| 缺失或被忽略时 | 卡片/详情页回退成中性占位图标（一个灰色 `Blocks` 图标），**不会报错** |
| 走哪个 URL | 仓库是公开的，直接用 `raw.githubusercontent.com/<owner>/<repo>/<分支>/<路径>` 即可（实测 200 image/png） |
| 尺寸与格式 | 跟官方插件图标一致：**128×128 PNG，透明背景，只画图形本身**——外层容器（`bg-surface rounded-xl`）负责主题背景，明暗主题都不用换图 |
| 放哪 | 约定放 `plugins/<插件>/icon.png`，跟插件同目录 |
| 生效时机 | 改完要 **push**，然后在应用里对市场点「更新」（或顶栏刷新）重新拉 catalog，图标才会出现 |

> 想换成自己的 Logo：把 `plugins/<插件>/icon.png` 替换掉（保持 128×128、透明底、只画图形），push 即可；
> 文件名/路径变了就同步改 `marketplace.json` 里的 `icon`。

## 插件清单（`.ccode-plugin/plugin.json`）

```jsonc
{
  "name": "hello-ccode",       // 必填，^[a-z0-9][a-z0-9._-]{0,127}$
  "version": "0.1.0",
  "description": "…",
  "author": { "name": "JnmHub" },
  "license": "MIT",
  "commands": "commands",      // 目录名或路径数组；缺省时默认就找 commands/
  "skills": "skills"           // 缺省时默认就找 skills/
}
```

组件按目录约定收集（manifest 字段是可选的覆盖）：

| 类型 | 默认目录 | 约定 |
| --- | --- | --- |
| 命令 | `commands/` | 每个 `*.md` 一条命令，frontmatter `description` / `argument-hint` / `allowed-tools` / `model` / `skills` / `disable-noninteractive`，正文可用 `$ARGUMENTS` 接参数 |
| 技能 | `skills/` | 每个 `skills/<名>/SKILL.md`，frontmatter `name` / `description` |
| 子代理 | `agents/` | 每个 `*.md`，frontmatter `name` / `description` |
| hooks / MCP | — | 写在 `plugin.json` 的 `hooks` / `mcpServers` 字段里 |
| 插件界面 | `ui` | `views[]`（沙箱网页，入口是设置里的**「配置面板」**按钮）+ `detailSections[]`（纯文本段落）+ **声明式槽位** `toolCards[]` / `composerActions[]` / `blockRenderers[]`（宿主渲染，**不用写 JS**）+ `domains[]`（出网白名单）。**需要 `permissions`**（`ui.view` 等） |
| 插件工具 | `tools` | 每个工具一条命令（argv 形式、**不走 shell**、入参只走 stdin）；模型侧名字自动加 `plugin_` 前缀，撞名会被丢弃（不覆盖），执行**一律需用户批准** |
| 输出风格 | `outputStyles` 或 `output-styles/<id>.md` | 声明**只传 id**，正文来自 `output-styles/<id>.md`（frontmatter `name` / `description` / `keep-coding-instructions`）或内联 `prompt`；用户在会话里可切换 |
| 常驻服务 | `services` | 一个能对话的后台进程（argv 形式；按需起、全局同时 ≤2、空闲回收）；插件页经 `requestService` 调，**需要 `permissions: ["ui.service"]`** |
| 语言服务器 | `lspServers` | 与 `services` 同一套宿主，**差别只在 LSP 的 `Content-Length` 分帧**；每插件 ≤2 个；同样需要 `ui.service` |
| 预置供应商模板 | `providers` | 用户点一下就能在「设置 → 模型 → 添加供应商」里多出一个可选服务。**只能给模板**（`wireFormat` / `baseUrl` / 模型清单），**凭据仍由用户自己填** —— 插件永远接触不到 key |

命名约束：**命令名、插件名、市场名都只允许小写字母数字加 `._-`**（命令名还允许 `:`）；命令 frontmatter
里出现上表以外的键只会告警，不会被拒绝。清单里**只有 `channels` / `settings` 两个**字段是
「只诊断不生效」（运行时找不到它们的语义定义，写了会得到一条诊断，不会静默）。
其余字段在本运行时**都真的生效**：`requires`（运行前提）、`platforms`（组件级 + 整包级平台门控）、
`permissions` + `ui`、`tools`、`services`、`lspServers`、`outputStyles`、`providers`。
逐字段的规则、上限与示例见 CCode 仓库的 `docs/plugin-and-hook-development.md` §2 / §3.x。

## 跨平台（Windows / macOS / Linux）

同一个插件会装到不同系统上，所以**不要在命令里写死 `python` / `python3`**：`python` 这个名字只在
Windows 上普遍成立，macOS 上通常是 `python3`（本仓库的 `seep-reverse-lab` 原来就写死了 `python`，
在 mac 上会直接 `spawn ENOENT`）。

客户端会把下面这些**平台事实**注入到 `mcpServers` 的字段、以及 hook 的 `command` / `args` 里，
用 `${...}` 引用即可：

| 变量 | 值 |
| --- | --- |
| `${CCODE_PLATFORM}` | `win32` / `darwin` / `linux` |
| `${CCODE_PYTHON}` | 用户在设置页「运行环境」里手动指定的路径优先；否则 win32 → `python`，其它 → `python3` |
| `${CCODE_NODE}` | 同上，缺省 `node` |
| `${CCODE_PATH_SEPARATOR}` | win32 → `\`，其它 → `/` |

```jsonc
// .mcp.json —— 一份配置两端都对
{
  "mcpServers": {
    "seep": { "command": "${CCODE_PYTHON}", "args": ["${CCODE_PLUGIN_ROOT}/Tool/mcp/seep_mcp_server.py"] }
  }
}
```

已经有 `${CCODE_PLUGIN_ROOT}` / `${CCODE_PLUGIN_DATA}` / `${CCODE_PROJECT_DIR}` 等既有变量，用法相同。

### 组件级 `platforms`：某些东西只在一个系统上才有意义

对确实**只在单端有意义**的组件（例如依赖 `codesign` / `osascript` 的 MCP 服务器或 hook），
在**条目上**声明 `platforms`：

```jsonc
// .mcp.json
{ "mcpServers": {
    "codesign": { "command": "codesign-helper", "platforms": ["darwin"] },
    "always":   { "command": "always-here" }
} }

// hooks/hooks.json
{ "hooks": { "PostToolUse": [ { "hooks": [
    { "type": "command", "command": "osascript -e 'beep'", "platforms": ["darwin"] },
    { "type": "command", "command": "echo ok" }
] } ] } }
```

规则（**只跳过该条目，不会废掉整个插件**）：

| 写法 | 行为 |
| --- | --- |
| 不写 `platforms`，或写 `[]` | 所有平台都生效（`[]` 按「没有限制」理解） |
| `["win32"]` / `["windows"]` / `["darwin"]` / `["macos"]` / `["linux"]` | 只在这些平台生效（别名可用） |
| 写了但**认不出的名字**（如 `windows-11`） | **该条目被跳过**并出 warning 诊断 —— 写错不会静默放行 |
| 当前平台不在声明里 | 该条目被跳过，出 `plugin_platform_skipped` 诊断（warning，属预期状态） |

要点：

- **不要**用 `platforms` 去表达「这个平台上缺依赖」——那是 `requires`（运行环境页会检测并提示）；
  `platforms` 表达的是「在这个平台上它**本来就没有意义**」。
- 拿不准就**别写** `platforms`：不写是所有平台都生效，写了才会被跳过。
- 不要为两个系统各维护一份插件（或把同一份配置写成 `platforms: { win32: {...} }` 这种整块分支）——
  优先用 `${CCODE_PYTHON}` 这类变量让**同一个条目**两端都对。

## 运行前提（`requires`）

在 `.ccode-plugin/plugin.json` 里声明**这个插件跑起来需要什么运行时**。客户端设置页的
「运行环境」分区会按它检查本机环境：缺什么直接列出来（含缺哪个 python 包），并给出下载安装包、
写入 PATH 的入口。写清楚的前提是「用户不必先踩一次启动失败才知道要装东西」。

```jsonc
{
  "name": "my-plugin",
  "version": "1.0.0",
  "requires": {
    "python": { "minVersion": "3.10", "packages": ["mcp"] },
    "node":   { "minVersion": "18" }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| 顶层 key | **只认 `python` 与 `node`**。其它 key（`java`/`rust`/`go`…）会被客户端**静默忽略**，写了等于没写 |
| `minVersion` | 可选。`"3.10"` / `"18"` / `"22.12"` 都行（缺段按 0 比）。**不写 = 不卡版本** |
| `packages` | **只对 `python` 有效**（客户端只做 `python -c "import <包>"` 探测）。写在 `node` 上无效 |
| `{}` | 合法，表示「要这个工具，但不卡版本」。不要为了"看起来完整"而编一个版本号 |

**什么该写（这是本仓库的取舍标准，写在这里便于 review）**：

1. **插件自己带的、由客户端启动的入口**所需运行时 —— 不装就一定跑不起来，属硬门槛。
   例：`seep-reverse-lab` 的 `seep` MCP server 是 Python 脚本且 `import mcp`，所以
   `python >= 3.10` + `packages: ["mcp"]`，另外 `js-reverse` MCP 走 `npx` ⇒ `node >= 18`。
2. **插件文档里自己写下的运行时门槛** —— 作者已经声明过的准入标准。
   例：`xigong-funk-hikari` 写「Python 3.10+；静态改写需 capstone」；`android-reverse` 写「Node >= 20」；
   `web-reverse` 写扣代码首选工具 webcrack 要求 Node 22/24；`zzy-reverse-skill` 的 README 表格写 Node.js 22.12+。
3. **插件自带脚本（`.py` / `.mjs`）的解释器** —— 技能正文会让 Agent 去跑它们。
   例：`yingan-tuoxiu` / `linker-fake-load-unwrapper` / `elf-local-auth-patcher` / `game-hacking` 都自带 `.py` 工具。

**什么不该写**：技能里作为**可选手段**提到的第三方工具（jadx / radare2 / frida / sqlmap / x64dbg…）。
它们不是"装这个插件的前提"，写成 `requires` 会让页面对大多数用户长期显示「不满足」，反而误导。
只把**该插件自身入口的直接依赖**写进 `packages`（如 seep 的 `mcp`、xigong 的 `capstone`）；
其余外部工具请在**插件介绍**里说明。

> 注意：`requires` 在插件包里，**改它必须同时提版本号**（本仓库按版本号生成下载地址），
> 否则用户那边不会重新下载，改了也白改。
> `tools/validate.mjs` 会检查上面这些形状问题（未知工具名、`node` 上写 `packages`、类型不对），
> 发布前跑一遍即可。

## 插件介绍怎么写

`marketplace.json` 的 `description`（英）与 `description_i18n.zh-CN`（中）是用户唯一能看到的介绍，
按下面六段写，缺哪段都会被"看不明白"：

1. **定位**：一句话说清它是什么；
2. **覆盖范围**：具体到文件类型 / 技术栈 / 主题（不要只写"逆向工具"）；
3. **提供什么**：技能数、命令数、MCP server 数（数字要与实际一致）；
4. **怎么触发**：用户说什么话会命中它；
5. **前提**：`requires` 里的运行时 + 需要自备的外部工具；
6. **边界**：不做什么、仅限什么授权范围。

中英都要写，且**英中信息量要一致**（只写英文时中文用户看到的是空白）。

## 首次发布到 GitHub

本仓库已经是一个提交好的本地 Git 仓库（分支 `main`），发布就是把远端接上再推：

```bash
cd D:\code\jnmhub-ccode-market
gh repo create JnmHub/jnmhub-ccode-market --public --source . --remote origin --push
```

没有 `gh` 时用 git 原生写法：

```bash
git remote add origin git@github.com:JnmHub/jnmhub-ccode-market.git
git push -u origin main
```

推完之后应用里的源用 `JnmHub/jnmhub-ccode-market` 即可（等价于 clone
`https://github.com/JnmHub/jnmhub-ccode-market.git`）。若是**私有**仓库，本地 git 凭据要能免交互拿到
（本机已配 `gh` 的 credential helper，通常没问题）；公开仓库没有这个顾虑。

## 怎么加进 CCode

设置 → 插件市场 → 添加插件市场，任一形式：

| 输入 | 解析成的源 |
| --- | --- |
| `JnmHub/jnmhub-ccode-market` | github（等价于 clone `https://github.com/JnmHub/jnmhub-ccode-market.git`） |
| `https://github.com/JnmHub/jnmhub-ccode-market.git` | git |
| `D:\code\jnmhub-ccode-market` | directory（本地目录，开发时最好用） |
| `D:\code\jnmhub-ccode-market\marketplace.json` | file（只读清单，不含插件本体） |

CLI 同样可用：`ccode plugins marketplace add <source>`。

## 怎么加新插件

1. `mkdir plugins/<新插件名>`，写 `.ccode-plugin/plugin.json`
2. 放 `commands/` `skills/` `agents/`
3. 在 `marketplace.json` 的 `plugins[]` 里加一条，`source` 指向该目录
4. `git add -A && git commit -m "feat: add <插件名>" && git push`
5. 应用里对市场点「更新」（或重新添加该源）即可拿到新条目

## 本地开发

改完插件后不必推远端：应用里把源指向**本地目录**（`D:\code\jnmhub-ccode-market`）并点更新即可。
发布前用同一份内容做一次 git 提交，保证「推上去的」和「本地验证过的」是同一棵树。

## 提交前自检

```bash
node tools/validate.mjs
```

它把「CCode 会怎么看这个市场」在本地跑一遍，退出码非 0 表示有必须处理的问题：

| 检查 | 为什么必须查 |
| --- | --- |
| `marketplace.json` 可解析、条目命名合规、未使用保留 id | 名字不合规的条目会被直接拒绝 |
| 每个插件目录有 `.ccode-plugin/plugin.json`，且 `name` 与市场条目一致 | **没有 plugin.json 的目录根本不算插件**；名字不一致会出现"装了但显示不对" |
| 图标文件存在、`icon` 是 `https://` | CCode 只信任 `https`，相对路径 / `file://` / `http://` 会被**静默忽略**，只退化成占位图 |
| 按 CCode 的规则扫描技能（每个声明根只扫一层、同名去重），并**跨整个市场**查重名 | 技能同名时 CCode 只保留一个、另一个被静默丢弃 —— 这是最容易漏、后果最明显的一类问题 |
| 命令名合规（`^[a-z0-9][a-z0-9._:-]*$`）、frontmatter 有 `description` | 命令名只允许小写字母数字加 `._-`（另允许 `:`），中文名会被拒绝 |

**修改任何插件后、push 之前跑一次**。它抓的都是「市场本身不报错、但某个插件静默失效」的那类问题。

## 来源与许可（**发布/转发前必读**）

本仓库除 `hello-ccode`（本仓库自建示例）外，`plugins/` 下的技能内容来自**外部作者的作品**，
原样收录以便分发与本地安装：

| 插件 | 来源标记 |
| --- | --- |
| `xigong-funk-hikari` | 技能自述显示名 `西宫-FUNK-Hikari` |
| `yingan-tuoxiu` | 目录名与内容出自「西宫影安」 |
| `elf-local-auth-patcher` | 技能自述作者「西宫公益频道@xigongPD」 |
| `zzy-reverse-skill` | 上游 [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill)，**MIT**（`LICENSE` + `NOTICE.md` 已随包收录）。为避开本市场独立插件的技能名，仅改了两处 frontmatter：`zzy-ida-reverse`、`zzy-reverse-engineering` |
| `seep-reverse-lab` | 上游 [angusdevgo/Seep-Reverse-Lab](https://github.com/angusdevgo/Seep-Reverse-Lab)，**GPL-3.0**（`LICENSE` + `NOTICE.md` 已随包收录）。整包收录，含内置工具链（`Tool/mcp/Tool/safe/**`）与三个上游镜像（`Tool/upstream/**`）；5 处撞名技能仅改 frontmatter `name` |
| 其余（android/web/win/asm/ida/reverse-engineering、linker-fake-load-unwrapper、game-hacking、shiyi-executor、shiyi-pentest-gate） | 收录时未在包内发现 LICENSE / NOTICE / 作者声明 |

除 `hello-ccode`、`zzy-reverse-skill` 与 `seep-reverse-lab` 外，**这些技能目录里没有任何 LICENSE 或 NOTICE 文件**（收录时已逐个检查）。所以：

- 本仓库**不替无许可声明的插件声明许可证**：那些插件的 `plugin.json` 故意不写 `license` 字段，
  避免替作者做一个他们没做的授权决定；
- `zzy-reverse-skill` 例外：上游已是 MIT，包装层保留原文 LICENSE，并在 `NOTICE.md` 写清相对上游的改动；
- `seep-reverse-lab` 例外：上游为 **GPL-3.0**，整包按 GPL 分发，`LICENSE` 原文保留。注意包内 4 个技能文件
  自述 `license: MIT`，与仓库 GPL-3.0 不一致——本市场不裁决、不改写任何一方，整体按仓库 `LICENSE` 对待；
- 若要长期公开转发，请先向原作者确认再分发的许可；作者要求下架时，删对应 `plugins/<名>/` 目录
  并去掉 `marketplace.json` 里的条目即可（两处都在同一个提交里，回滚很干净）；
- 本仓库自身的脚手架（`marketplace.json`、`README.md`、`tools/gen-icons.mjs`、`hello-ccode`）
  按下面的 MIT 授权。

## License

MIT（仅指本仓库脚手架，见上节）
