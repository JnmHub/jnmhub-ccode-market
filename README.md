# jnmhub-ccode-market

JnmHub 自建的 CCode 插件市场源。这是一个**普通的 Git 仓库**，CCode 通过读取仓库根目录的
`marketplace.json` 就能把它当成一个插件市场。

## 仓库结构

```
marketplace.json                     # 市场清单（市场身份 + 插件条目）
plugins/
  hello-ccode/                       # 一个插件 = 一个目录
    .ccode-plugin/plugin.json        # 插件清单（组件声明）
    commands/hello.md                # 斜杠命令
    skills/hello-ccode/SKILL.md      # 技能
```

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

## 怎么加进 CCode

设置 → 插件市场 → 添加插件市场，任一形式：

| 输入 | 解析成的源 |
| --- | --- |
| `JnmHub/jnmhub-ccode-market` | github（等价于 clone `https://github.com/JnmHub/jnmhub-ccode-market.git`） |
| `https://github.com/JnmHub/jnmhub-ccode-market.git` | git |
| `D:\code\ccode-marketplace` | directory（本地目录，开发时最好用） |
| `D:\code\ccode-marketplace\marketplace.json` | file（只读清单，不含插件本体） |

CLI 同样可用：`ccode plugins marketplace add <source>`。

## 怎么加新插件

1. `mkdir plugins/<新插件名>`，写 `.ccode-plugin/plugin.json`
2. 放 `commands/` `skills/` `agents/`
3. 在 `marketplace.json` 的 `plugins[]` 里加一条，`source` 指向该目录
4. `git add -A && git commit -m "feat: add <插件名>" && git push`
5. 应用里对市场点「更新」（或重新添加该源）即可拿到新条目

## 本地开发

改完插件后不必推远端：应用里把源指向**本地目录**（`D:\code\ccode-marketplace`）并点更新即可。
发布前用同一份内容做一次 git 提交，保证「推上去的」和「本地验证过的」是同一棵树。

## License

MIT
