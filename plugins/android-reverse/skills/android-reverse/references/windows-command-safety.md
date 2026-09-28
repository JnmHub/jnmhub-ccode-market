# Windows 宿主命令执行规范（乱码 / 引号 / 平台差异）

定位：本技能在 Windows 宿主上执行脚本、代码与命令的**唯一事实源**，目标是消除 PowerShell 乱码与多层引号错误造成的无效重试。宿主为 Linux/macOS 时本文不适用。版本与 API 规则见 `frida-version-policy.md`，安装命令见 `setup-guide.md`。

## 执行层决策树（按序降级，失败不原地换引号盲试）

1. **默认在 bash（Git Bash）直接执行**：grep/sed/awk/unzip/curl、adb、frida CLI、node/python 调用优先走 bash 原生命令，单层引号语义与文档示例一致。
2. **必须用 PowerShell 时优先 `pwsh`（PowerShell 7+，默认 UTF-8）**，无 pwsh 再回退 `powershell`（Windows PowerShell 5.1）。
3. PowerShell 一律走脚本文件，**禁止 `powershell -Command "<代码>"` / `powershell -c "<代码>"` 内联执行**——bash→PowerShell→目标程序三层引号解析必然踩坑（见下表）。逻辑超过一行就先写临时 `.ps1` 再执行：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-deps.ps1
# 无 pwsh 时：
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-deps.ps1
```

4. 同一命令失败一次后，先按本文"故障对照表"定位原因再重试；换引号风格再试一次不算定位。两次仍失败改走落盘文件或换执行层（bash↔PowerShell），不在原地继续消耗。

## 编码三铁律（乱码根因与预防）

Windows PowerShell 5.1 在 zh-CN 系统上：无 BOM 脚本按 GBK 解析、控制台输出编码为 GBK、`$OutputEncoding` 为 us-ascii——三层错位各自独立致乱码，加 BOM 只修第一层。

1. **长输出/含中文输出先落盘再读文件**，不直接捕获控制台。logcat、frida console、jadx/fernflower 日志、`java -version` 一律：

```bash
adb logcat -d > logcat.txt 2>&1      # 然后 Read logcat.txt（UTF-8）
jadx -d out/ app.apk > jadx-log.txt 2>&1
```

2. 自建 `.ps1` 必须同时做两件事（仓库 `scripts/*.ps1` 已内置，QA 强制）：**UTF-8 带 BOM 保存** + 头部编码归一：

```powershell
try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    $OutputEncoding = [System.Text.UTF8Encoding]::new()
} catch {}
```

3. 不用 PowerShell 管道向原生命令传中文（us-ascii 会变 `?`）；确需在旧控制台手工排查时临时 `chcp 65001`。

## 引号与参数规则

| 危险写法 | 原因 | 安全替代 |
|---|---|---|
| `powershell -Command "... '...' ..."`（从 bash 发起） | 三层解析；PS 双引号内 `$var`、`` ` `` 、`$(...)` 会被展开，Frida JS 片段必坏 | 写临时 `.ps1` 用 `-File` 执行；或整段逻辑改在 bash 内完成 |
| `frida -U -f <pkg> -e ""`（PS 5.1 下） | PS 5.1 **静默丢弃空字符串参数**，判据变形为无 `-e`（PS 7 正常） | 在 bash 执行；或改用空脚本文件 `frida -U -f <pkg> -l empty.js` |
| PS 双引号字符串包 JS/正则 | `$`、反引号被 PS 展开 | 单引号字符串；复杂内容落盘成 `.js` 文件后 `-l` 加载 |
| PS 中 `&`、`|`、`>`、`,` 出现在参数里 | PS 自身元字符 | 参数一律加引号，或改 bash |
| `adb shell "cmd1 && cmd2 &"` 多层嵌套 | 宿主 shell + adb + 设备 shell 三层 | 拆成多次单命令调用；复杂设备侧脚本先 push 再执行 |

已知差异速记：PS 5.1 丢空参、`""` 转义规则与 bash 相反、`$OutputEncoding` 默认 us-ascii；PS 7 空参保留、默认 UTF-8。两版本参数名均不区分大小写且接受 `-Name`/`--Name` 双横线写法。

## 平台差异映射（文档示例为 Linux 语义时）

| Linux 习惯写法 | Windows 等价 |
|---|---|
| `python3 xxx.py` | `python xxx.py`（无 python3 命令时） |
| `sudo <cmd>` | 去掉 sudo，直接执行（必要时以管理员身份启动终端） |
| `export X=Y` | bash 内 `X=Y` 前缀或 `export`（Git Bash 支持）；PowerShell 用 `$env:X = "Y"` |
| `unzip a.zip -d dir` | Git Bash 有 unzip 可直接用；PowerShell 用 `Expand-Archive` |
| `~/xxx` | Git Bash 可用；PowerShell 用 `$env:USERPROFILE` |
| `./frida-server` | 设备侧命令，与宿主无关，照原样经 `adb shell` 执行 |

仓库双轨脚本参数对照（`.sh` 与 `.ps1` 均接受下列写法；`decompile` 的 `-o` 为 PS 侧别名）：

| 脚本 | 调用示例 |
|---|---|
| 检查依赖 | `bash scripts/check-deps.sh` / `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-deps.ps1` |
| 反编译 | `bash scripts/decompile.sh app.apk -o out/ --deobf` / `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/decompile.ps1 app.apk -o out/ -Deobf` |
| 搜 API | `bash scripts/find-api-calls.sh src/ --all` / `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/find-api-calls.ps1 src/ -All` |
| 装依赖 | `bash scripts/install-dep.sh jadx` / `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-dep.ps1 jadx` |

## 故障对照表（看到症状直接定位，不重试）

| 症状 | 根因 | 修复 |
|---|---|---|
| PS 输出中文变 `璁惧囩` 类乱码 | 无 BOM 脚本被 PS 5.1 按 GBK 解析 | 脚本重存 UTF-8 带 BOM（QA 强制） |
| 脚本解析正确但捕获流仍是乱码 | PS 5.1 管道输出编码 GBK，捕获方按 UTF-8 解码 | 脚本头部加编码归一两行（见上） |
| PS 内跑工具，中文参数变 `?` | `$OutputEncoding` = us-ascii | 改 bash；或 PS 内先设 `$OutputEncoding` |
| `java -version` 输出乱码 | zh-CN 下 Java 输出 GBK 本地化文本 | 落盘后按 GBK 读，或只提取数字版本号 |
| `A parameter cannot be found that matches parameter name 'o'` | 用了 `.sh` 参数名且目标脚本无别名 | 用 `-Output`；`decompile.ps1` 已支持 `-o` 别名 |
| `frida: command not found` / `python3: command not found` | PATH 或命令名差异 | `frida --version` 核对；python3→python；必要时查 `setup-guide.md` |
| 运行 .ps1 直接被拒 | 执行策略 | 调用带 `-ExecutionPolicy Bypass -File` |
| `adb shell` 内 `grep` 报错 | 设备侧 toybox grep 与桌面差异 | 参数最小化；复杂过滤拉回宿主做（先落盘） |
| bash 解析 `java -version` 等原生工具输出报错（版本号带 `^M`） | Windows 原生工具输出 CRLF，`\r` 混入变量 | 管道中加 `tr -d '\r'` 再提取（`scripts/*.sh` 已内置） |

## 与其他文档的关系

- Frida 版本与 `-e`/`--no-pause` 等 CLI 差异：`frida-version-policy.md`、`frida-java-playbook.md`
- 依赖安装与三端核对：`setup-guide.md`
- 新增 `.ps1` 的 BOM/编码归一/LF 约束由 `tools/qa/check-script-encoding.mjs` 强制（`npm run check`）
