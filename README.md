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
```

## 插件索引

| 插件 | 技能 | 说明 |
| --- | --- | --- |
| `hello-ccode` | `hello-ccode` | 最小示例：一条斜杠命令 + 一个技能，用于验证链路 |
| `android-reverse` | `android-reverse` | Android 逆向框架（APK/DEX/SO、Frida、JADX/JEB、脱壳、协议还原） |
| `reverse-engineering` | `reverse-engineering` | 通用逆向（网站/PE/ELF/APK/IPA/协议、Hook、签名与加密分析） |
| `asm-analysis` | `asm-analysis` | 汇编级逆向（GDB/LLDB/r2/Frida/angr/strace… 统一链路 + 上下文快照） |
| `ida-reverse` | `ida-reverse` | IDA Pro 分析辅助（反汇编、固件、样本、函数调用图） |
| `web-reverse` | `web-reverse` | Web 前端逆向（签名/协议/加密、混淆与反调试、WASM/JSVMP、扣代码补环境） |
| `win-reverse` | `win-reverse` | Windows 逆向框架（PE/.NET/驱动/壳/IPC，含专题、演练与阶段门禁） |
| `linker-fake-load-unwrapper` | 同名 | 假 PT_LOAD 包裹的 Android AArch64 ELF 还原 |
| `xigong-funk-hikari` | 同名 | Hikari-LLVM/OLLVM 去混淆与明文还原 |
| `yingan-tuoxiu` | 同名 | 影安/影婆加固 APK 脱壳与稳定重建 |
| `game-hacking` | 同名 | 游戏辅助全链路（内存/协议/Hook/驱动/自动化） |
| `elf-local-auth-patcher` | 同名 | 自有/授权环境下的 APK/ELF 本地授权等长 patch |

每个插件都是**单技能插件**（`skills/` 下只有一个目录）。要看 CCode 侧怎么发现技能（一插件多技能、
只扫一层、符号链接不跟随、同名去重），见各技能自身文档与 CCode 的 `skills/scan.ts`。

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

命名约束：**命令名、插件名、市场名都只允许小写字母数字加 `._-`**（命令名还允许 `:`）；命令 frontmatter
里出现上表以外的键只会告警，不会被拒绝。`channels` / `lspServers` / `outputStyles` / `settings` 四个
字段在这个运行时是「只诊断不生效」的。

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

## 来源与许可（**发布/转发前必读**）

本仓库除 `hello-ccode`（本仓库自建示例）外，`plugins/` 下的技能内容来自**外部作者的作品**，
原样收录以便分发与本地安装：

| 插件 | 来源标记 |
| --- | --- |
| `xigong-funk-hikari` | 技能自述显示名 `西宫-FUNK-Hikari` |
| `yingan-tuoxiu` | 目录名与内容出自「西宫影安」 |
| `elf-local-auth-patcher` | 技能自述作者「西宫公益频道@xigongPD」 |
| 其余（android/web/win/asm/ida/reverse-engineering、linker-fake-load-unwrapper、game-hacking） | 收录时未在包内发现 LICENSE / NOTICE / 作者声明 |

**这些技能目录里没有任何 LICENSE 或 NOTICE 文件**（收录时已逐个检查）。所以：

- 本仓库**不替它们声明许可证**：各插件的 `plugin.json` 故意不写 `license` 字段，
  避免替作者做一个他们没做的授权决定；
- 若要长期公开转发，请先向原作者确认再分发的许可；作者要求下架时，删对应 `plugins/<名>/` 目录
  并去掉 `marketplace.json` 里的条目即可（两处都在同一个提交里，回滚很干净）；
- 本仓库自身的脚手架（`marketplace.json`、`README.md`、`tools/gen-icons.mjs`、`hello-ccode`）
  按下面的 MIT 授权。

## License

MIT（仅指本仓库脚手架，见上节）
