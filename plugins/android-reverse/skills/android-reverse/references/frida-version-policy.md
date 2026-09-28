# Frida 版本策略与 16/17 兼容指南

定位：本技能所有 Frida 脚本与文档的**版本唯一事实源**。动态任务开始前先按本文核对版本；脚本异常且版本不在支持集时，先对齐版本再排查脚本本身。安装命令与部署步骤见 `setup-guide.md`，但版本规则以本文为准。

## 支持矩阵

| 状态 | 版本 | 说明 |
|---|---|---|
| 推荐基准 | **17.6.2** | 全部 playbook / run 模板按此版本验证；Zymbiote 可用 |
| legacy 兼容 | 16.5 - 16.8 | 模板经内置兼容层可运行；Zymbiote 不可用；rusda 16.2.1 等魔改基线脚本层兼容，但低于功能下限（守卫会警告） |
| 未验证 | 其他 17.x | API 同代（17.0 起一致），大概率可跑；建议对齐 17.6.2 |
| 不支持 | < 16.5 | 守卫警告；硬件断点等特性缺失 |

## 版本配对表

| 组件 | 17.6.2 基准 | 16.5 - 16.8 legacy |
|---|---|---|
| Python 绑定 | `pip install frida==17.6.2` | `pip install "frida>=16.5,<17"` |
| CLI（frida/frida-ps/frida-trace） | `pip install "frida-tools>=14,<15"` | `pip install "frida-tools>=12,<14"` |
| 设备端 | `frida-server-17.6.2-android-{arm64,arm,x86,x86_64}` | 同主版本的 16.x frida-server |
| Gadget（无 Root 嵌入） | `frida-gadget-17.6.2-android-*` | 与设备端 frida-server 主版本一致 |

**陷阱（先读再装）**：

- `pip install frida-tools` 单独安装会拉取**最新** frida core（不是 17.6.2）。必须 `frida==17.6.2` 与 `frida-tools` 范围约束同时给出。
- 客户端（Python `frida` 包）/ 设备端 `frida-server` / gadget 三者版本必须一致。`frida-ps -U` 报 version mismatch / unable to communicate 类错误时，先核对三处版本再查其他原因。
- 已知问题：17.6.2 frida-server 有在个别 Android 11（Unisoc/Realme）设备上启动崩溃的社区报告。遇到时回退 16.7.x legacy 或邻近 17.6.x 补丁版，并在 report 记录设备与回退决策。

## Preflight（每次动态任务开始前）

```bash
frida --version                                     # 期望 17.6.2（或 >=16.5 legacy）
adb shell /data/local/tmp/frida-server --version    # 必须与上一行一致
```

运行时核对：脚本内 `Frida.version` 反映的是**设备端 agent** 版本（即 frida-server 侧），与宿主 CLI 版本不一致本身就是故障信号。环境探测模板（`hook-snippets.md`）已内置该核对。

## Frida 17.0 移除 API 迁移对照

Frida 17.0.0（2025-05）移除了静态 Module 查找族与 Memory.read*/write* 族。16/17 交集写法如下，run 模板与文档示例一律使用右列：

| 17.0 已移除 | 16/17 通用写法 |
|---|---|
| `Module.findExportByName(mod, name)` | `var m = Process.findModuleByName(mod); m.findExportByName(name)` |
| `Module.findExportByName(null, name)` | 17：`Module.findGlobalExportByName(name)`；16：`Module.findExportByName(null, name)`（见下方兼容层 findExportBy） |
| `Module.getExportByName(...)` | 同上；get 语义（未找到抛错）用 `Process.getModuleByName(mod).getExportByName(name)` |
| `Module.findBaseAddress(name)` / `getBaseAddress(name)` | `Process.findModuleByName(name).base`（get 语义用 `Process.getModuleByName(name).base`） |
| `Memory.readCString(p)` 等 read 族 | NativePointer 实例法：`p.readCString()`、`p.readByteArray(n)`、`p.readPointer()`、`p.readU8()`、`p.readU16()`、`p.readUtf8String(n)` |
| `Memory.writeUtf8String(p, s)` 等 write 族 | `p.writeUtf8String(s)`、`p.writeByteArray(b)` |
| `Process.enumerateModules({onMatch,onComplete})` 回调式及 `*Sync` 变体 | 数组式 `Process.enumerateModules()`（实例法 `module.enumerateSymbols()` 同理保留数组式） |
| `Module.ensureInitialized()` | Module 实例法 |

`Process.findModuleByName` / `getModuleByName` / `findModuleByAddress` / `getModuleByAddress` 与 Module 实例方法（`findExportByName`、`enumerateExports`、`enumerateSymbols` 等）在 16.x 与 17.x 均可用，是交集写法的基础。

## 脚本兼容层（标准头）

所有 `run/*.js` Frida 模板内联兼容头，复制到任务目录后独立可用。使用 Native API 的模板带完整版：

```javascript
// === Frida 16/17 兼容层 — 版本策略见 references/frida-version-policy.md ===
// 支持集：17.6.2（推荐）/ 16.5-16.8（legacy）；其余版本告警但继续运行。
var FRIDA_VERSION_PARTS = Frida.version.split(".");
var FRIDA_MAJOR = parseInt(FRIDA_VERSION_PARTS[0], 10) || 0;
var FRIDA_MINOR = parseInt(FRIDA_VERSION_PARTS[1], 10) || 0;
(function checkFridaVersion() {
  if (Frida.version === "17.6.2") return;
  if (FRIDA_MAJOR === 16 && FRIDA_MINOR >= 5) return;
  if (FRIDA_MAJOR === 16) {
    console.warn("[compat] Frida " + Frida.version + " 低于 legacy 下限 16.5：硬件断点等特性不可用，行为未验证");
  } else {
    console.warn("[compat] Frida " + Frida.version + " 不在验证集 {16.5-16.8, 17.6.2}：按交集 API 运行，异常先查 frida-version-policy.md");
  }
})();
function findExportBy(moduleName, exportName) {
  if (moduleName === null || moduleName === undefined) {
    if (typeof Module.findGlobalExportByName === "function") {
      return Module.findGlobalExportByName(exportName); // Frida 17+
    }
    return Module.findExportByName(null, exportName); // Frida 16 legacy 分支
  }
  var mod = Process.findModuleByName(moduleName);
  return mod ? mod.findExportByName(exportName) : null;
}
// === 兼容层结束 ===
```

Java-only 模板（`frida-java-template*`、`class-loader-trace*`、`integrity-bypass*`、`anti-root-bypass` 基线版、`anti-emulator-bypass`、`cert-pinning-bypass` 基线版）只用稳定 Java API 与实例法，仅带守卫段（上例第 4-15 行）。

新写脚本规则：一律使用交集写法（上表右列）；跨模块查找统一走 `findExportBy`；禁止再引入 17.0 已移除 API。QA（`tools/qa/check-frida-compat.mjs`，`npm run check` 的一部分）静态拦截违规。

## CLI 差异（frida-tools）

| 行为 | frida-tools 12/13（配 16.x） | frida-tools 14（配 17.x） |
|---|---|---|
| spawn 后自动恢复 | 需显式 `--no-pause` | 默认自动恢复；`--no-pause` 已弃用（仅打警告）；需要暂停检查时用 `--pause` |
| 推荐写法 | `frida -U -f <pkg> -l s.js --no-pause` | `frida -U -f <pkg> -l s.js` |

文档中的示例命令按版本中立书写（不带 `--no-pause`），16.x 用户按本表自行补加。

## 功能-版本门槛

| 功能 | 最低版本 | 备注 |
|---|---|---|
| Zymbiote（ptrace-free Zygote 注入，spawn 阶段隐蔽） | 17.6 | 16.x 无此能力，回退传统 spawn + 魔改路线（见 `anti-frida-playbook.md`） |
| `Process.setExceptionHandler` 异常处理器模式 / 硬件断点思路 | 16.5 | `MemoryAccessMonitor` 早已移除，勿使用 |
| memfd 方式加载 agent（对应 memfd: 检测面） | 17+ | 检测侧知识，见 `anti-frida-playbook.md` L2 |
| `rpc.exports` 的 `exports_sync` / `exports_async` | frida-tools 12.3+ | 旧无后缀形式已弃用，见 `frida-rpc-service-notes.md` |

## 与其他文档的关系

- 安装命令与 frida-server 部署步骤：`setup-guide.md`（版本规则以本文为唯一事实源，不重复维护配对表）
- Zymbiote 技术分析：`anti-frida-playbook.md`、`hook-injection-playbook.md`（版本前提以本文为准）
- 魔改编译基线：`frida-native-playbook.md`（rusda 魔改基线 = 16.2.1；vanilla 构建 = 17.6.2）
- Gadget 注入的版本匹配陷阱：`unpack-tool-matrix.md` 第八节
