# 脱壳工具决策矩阵与壳全景库

本文件是 SKILL 遇到 A4+ 壳时的脱壳策略唯一真源。所有涉及"脱壳"的决策必须先查本文件，
不得默认跳到 Frida hook。

## 一、壳全景识别库

### 壳识别总表

通过静态特征（SO文件名 + Application类名 + assets文件）快速匹配壳类型：

| 壳 | 关键 SO | Application 类 | 难度 |
|---|---|---|---|
| **360加固保** | `libjiagu.so` `libjiagu_64.so` `libjiagu_art.so` `libjgdtc*.so` | `com.stub.StubApp` | 3/5(免费) 4/5(企业) |
| **腾讯乐固** | `libshella*.so` `libtup.so` `libshell.so` | `com.tencent.StubShell.TxAppEntry` | 3/5(旧版) 4/5(VMP) |
| **腾讯御安全** | `libtosprotection.*.so` `libshell-super.*.so` | `MyWrapperProxyApplication` | 4/5 |
| **腾讯手游加固** | `libtprt.so` | — | 3/5 |
| **梆梆(免费)** | `libsecexe.so` `libsecmain.so` `libSecShell*.so` | `com.secshell.secData.ApplicationWrapper` | 2/5 |
| **梆梆(企业)** | `libDexHelper.so` `libDexHelper-x86.so` | 同上 | 4/5 |
| **爱加密(标准)** | `libexec.so` `libexecmain.so` | `s.h.e.l.l.S` | 2/5 |
| **爱加密(v3)** | `libexecv3.so` | 同上 | 3/5 |
| **爱加密(企业/v5)** | `libijmDataEncryption.so` | 同上 | 4/5 |
| **娜迦(标准)** | `libchaosvmp.so` `lib*dog.so` | — | 3/5 |
| **娜迦(企业)** | `libedog.so` | — | 4/5 |
| **娜迦(2022+)** | `libxloader.so` | — | 3/5 |
| **百度加固** | `libbaiduprotect*.so` | — | 2/5 |
| **阿里/聚安全** | `libsgmain.so` `libmobisec.so` `libzuma.so` `libdemolish.so` | — | 2/5 |
| **网易易盾** | `libnesec.so` | — | 4/5 |
| **几维安全** | `libkwscmm.so` `libkdp.so` `libKwProtectSDK.so` | `com.Kiwisec.KiwiSecApplication` | 3/5 |
| **顶象科技** | `libx3g.so` | `cn.securitystack.stee.AppStub` | 4/5 |
| **深盾Virbox** | `libvirbox32.so` `libvirbox64.so` | — | 4/5 |
| **通付盾** | `libegis.so` `libNSaferOnly.so` | — | 2/5 |
| **中国移动/魔固云** | `libcmvmp.so` `libmogosecurity.so` | `com.mogosec.AppMgr` | 3/5 |
| **蛮犀安全** | `libdSafeShell.so` `libmxacc.so` | — | 3/5 |
| **珊瑚灵御** | `libreincp.so` `libreincp_x86.so` | `com.coral.util.StubApplication` | 2/5 |
| **海云安** | `libitsec.so` | `c.b.c.b` | 2/5 |
| **CFCA** | `libbasec.so` `libsecenh*.so` | — | 2/5 |
| **启明星辰** | `libvenSec.so` `libvenustech.so` | — | 2/5 |
| **网秦** | `libnqshield.so` | — | 2/5 |
| **OPPO加固** | `OPPOProtect*.so` | — | 3/5 |
| **Google Pairipcore** | `libpairipcore.so` | — | 3/5 |
| **AppGuard(韩国)** | `libloader.so` | — | 3/5 |
| **G-Presto** | `libATG_*.so` | — | 3/5 |
| **LIAPP(韩国)** | (无SO) `assets/LIAPP.ini` | — | 3/5 |
| **DexGuard** | (无独立SO，构建时保护) | — | 3/5 |
| **Promon SHIELD** | (私有SO) | — | 4/5 |
| **Arxan/Verimatrix** | (私有SO) | — | 4/5 |
| **Appdome** | (私有SO) | — | 3/5 |
| **盛大(旧)** | `libapssec.so` | — | 1/5 |
| **瑞星(旧)** | `librsprotect.so` | — | 1/5 |
| **APKProtect** | `libAPKProtect.so` | — | 1/5 |
| **apktoolplus** | `libapktoolplus_jiagu.so` | `com.linchaolong.apktoolplus.jiagu.ProxyApplication` | 1/5 |

辅助识别工具：
- **APKiD**：开源壳识别工具，规则匹配
- **ApkCheckPack**：最全面的壳签名库（40+厂商，170+规则），`github.com/moyuwa/ApkCheckPack`

### 壳防护能力矩阵

| 壳 | DEX加密 | 方法抽取 | VMP | Anti-Frida | Anti-Debug | Anti-模拟器 | SO保护 |
|---|---|---|---|---|---|---|---|
| 360(企业) | Y | Y | Y | **L1-L6** | Y | Y | Y |
| 腾讯乐固(VMP) | Y | Y | Y | **L1-L5** | Y | Y | Y |
| 腾讯御安全 | Y | Y | Y | **L1-L6** | Y | Y | Y |
| 梆梆(企业) | Y | Y | Y | **L1-L5** | Y | Y | Y |
| 爱加密(企业) | Y | Y | Y | **L1-L6** | Y | Y | Y |
| 娜迦(企业) | Y | Y | Y | **L1-L5** | Y | Y | Y |
| 网易易盾 | Y | Y | Y | **L1-L6** | Y | Y | Y |
| 顶象科技 | Y | Y | Y | **L1-L5** | Y | Y | Y |
| 深盾Virbox | Y | Y | Y | **L1-L5** | Y | Y | Y |
| 几维安全 | Y | Y | Y(专业版) | **L1-L4** | Y | Y | Y |
| 中国移动 | Y | Y | Y | **L1-L4** | Y | Y | — |
| 360(免费) | Y | Y | N | L1-L3 | Y | Y | — |
| 梆梆(免费) | Y | Y | N | L1-L3 | Y | Y | — |
| 百度 | Y | Y | N | L1 | 基本 | 基本 | — |
| 阿里 | Y | Y | N | L1 | 基本 | 基本 | — |

> L1-L6 参考 anti-frida-playbook.md 的 7 层检测矩阵。**L4+ 的壳基本可以认为纯 Frida 脱壳不可行。**

## 二、脱壳工具库

### 工具按隐蔽性分级

> **执行须知**：下表中标记"模型可执行"的工具可以通过 adb/frida 等 MCP 工具直接操作。
> 标记"需用户安装"的工具是 APK 形式，模型只能生成命令，需要用户在设备上操作。
> 标记"需用户准备"的工具需要用户提前配置环境（刷机/安装框架）。

| 隐蔽性 | 工具 | 原理 | Root | Android | 适用于 | 执行方式 |
|---|---|---|---|---|---|---|
| **极高（内核级）** | **eBPFDexDumper-rs** | eBPF uprobe 从内核空间被动捕获 DEX，不注入任何 SO | Y | 13-17 ARM64 | 全部壳 | 需用户准备（需 eBPF 内核） |
| **极高（内核级）** | **eBPFDexDumper** | 同上（C 版本，2025.6 增加抽取壳支持） | Y | 10+ | 全部壳 | 需用户准备（需 eBPF 内核） |
| **高（ART ROM）** | **FART** | 修改 ART 源码主动调用所有方法并 dump CodeItem | Y(刷机) | 6-12(官方) | 第1-3代壳 | 需用户准备（需刷 FART ROM） |
| **高（FART+无ROM）** | **FART+Frida(CYRUS-STUDIO)** | 通过 Frida 注入 FART 逻辑，配置文件驱动定向 dump | Y | 5-13 | 第1-3代壳 | 模型可执行（Frida MCP） |
| **高（ART ROM）** | **Youpk** | 类似 FART 但模块化，被壳厂商关注较少 | Y(刷机) | ≤10 | 第1-3代壳 | 需用户准备（需刷机） |
| **中（免Root）** | **BlackDex** | 独立虚拟化进程加载目标 APK，dump DEX | N | 5-12 | 第1-2代壳 | **需用户安装 APK** |
| **中（免Root）** | **newBlackDex** | BlackDex 分支，增加 ArmPro 静态解密 | N | 5-13 | 第1-2代壳 | **需用户安装 APK** |

**BlackDex 交互模式**：BlackDex 无命令行触发接口。如果 BlackDex 已安装且是推荐工具：输出"请在 BlackDex 中选择 [目标应用名] → 点击脱壳"，然后执行 `adb shell ls /sdcard/BlackDex/` 或 BlackDex 提示的输出路径，等待用户操作后检查脱壳结果。
| **中（Root）** | **Udex2024** | Android 14 原生 DEX dump，独立应用 | Y | 14 | 第1-2代壳 | **需用户安装 APK** |
| **中（Xposed）** | **FunDex2** | LSPosed 模块 hook loadDex | Y(LSPosed) | 5-13 | 第1-2代壳 | 需用户准备（需 LSPosed） |
| **低（Frida依赖）** | **FRIDA-DEXDump** | Frida 内存扫描 DEX magic | Y | 全版本(受限于Frida) | 第1-2代壳，**仅L1-L2壳** | 模型可执行（`pip install frida-dexdump`；需与已装 frida 主版本一致，16/17 各有对应版，见 `frida-version-policy.md`） |
| **静态** | **Smali Patch** | 反编译→修改壳代码→注入 dump 逻辑→重打包 | N | 全版本 | 所有壳（需理解壳流程） | 模型可执行（apktool + 文件编辑） |
| **静态** | **BadUnboxing** | 自动分析 APK 生成定制脱壳器 | N | N/A | Java 层壳 | 模型可执行（桌面工具） |
| **静态** | **vdexExtractor** | 从设备拉取 .vdex 文件静态提取 DEX | Y | 8+ | AOT 编译的 DEX | 模型可执行（adb pull + 工具） |
| **运行时内存直读** | **dd + grep** | Root 权限直接读 `/proc/pid/mem`，不注入任何 SO | Y | 全版本 | **Frida 注入失败的 A4+ 壳** | 模型可执行（adb shell） |

### 特殊方案：爱加密 v4 离线解密

爱加密 v4 的加密管道为 `ijiami.dat → deflate → 外层 XOR → 缓存文件 → S-box → XOR → 索引表 → 9 个 DEX`。

关键特征：
- `assets/ijiami.dat`（高熵载荷）+ `assets/ijiami.ajm`（magic: `indl01`）
- `libexec.so` 含 `SecLLVM compiler` 字符串
- 外层 XOR 密钥由包名 MD5 推导，S-box key 只有 256 种
- 可利用 DEX 格式不变量恢复 XOR 密钥（详见 `technique-extract-2026-05.md` 第 3 节）
- DEX checksum 修复：SHA-1 必须在 Adler32 之前计算

### 工具活跃度

| 工具 | 最后更新 | 状态 |
|---|---|---|
| eBPFDexDumper-rs | 2025 活跃 | **推荐首选** |
| eBPFDexDumper | 2025.6 | 活跃，增加抽取壳 |
| FART+Frida(CYRUS-STUDIO) | 2025 活跃 | 活跃，推荐替代刷机 |
| FRIDA-DEXDump | 2025 维护 | 维护中 |
| Udex2024 | 2024 | 活跃（Android 14） |
| FunDex2 | 2024 | 活跃（LSPosed） |
| newBlackDex | 2024.8 | 低活跃 |
| BlackDex | 2022.1 已废弃 | **原版已废弃** |
| FDex2 | 已废弃 | 使用 FunDex2 替代 |

## 三、脱壳决策流程

> **前置条件**：执行决策树前必须先完成环境探测（见下方门禁 0），确认 eBPF/FART/LSPosed 可用性。

### 检测时序判定（脱壳工具选型前必执行）

壳的检测/退出逻辑在哪一层执行？这直接决定哪种工具能成功。
**注意**：下表中涉及 Frida 的工具推荐仅适用于 A1-A3 壳（Anti-Frida <= L2）。A4+ 壳请以决策树和门禁规则为准，纯 Frida 脱壳不可行。

| 检测时序 | 判定信号 | 可用工具 |
|---------|---------|---------|
| init_array | SO 导入 exit/_exit/kill 但无 Java 层 exit 调用；logcat 中 System.exit 出现在 Application 创建前 | BlackDex / Smali Patch SO（A1-A3 壳可尝试 Gadget 注入） |
| JNI_OnLoad | SO 有 JNI_OnLoad + exit 字符串；Java 层 attachBaseContext 后进程死亡 | BlackDex / Smali Patch（A1-A3 壳可尝试 Gadget 注入） |
| Java 层 | smali 中可见 System.exit / Process.kill；启动后几秒死 | BlackDex / Smali Patch（A1-A3 壳可尝试 Frida spawn） |

**判定方法**：
1. IDA 分析 SO → 检查 init_array 函数是否包含 exit/kill 相关导入
2. logcat 检查 → System.exit 出现在哪个时机
3. **允许一次 Frida spawn 诊断性尝试**（仅检查进程存活时间和崩溃时机，仅限 A1-A3 壳），拿到崩溃时机证据后立即转向；该诊断本身无需用户确认

如果判定为 init_array 检测，**直接跳过 Frida spawn/attach**——它在检测之后注入，不可能成功。

识别壳类型后，按以下决策树选择脱壳策略：

```
protectionTier >= A4（动态DEX/壳/JNI主逻辑）？
│
├── 是 → 运行环境？
│   │
│   ├── 真机(Root+Magisk)
│   │   ├── **先确认 App 进程存活**（A4+ 壳可能检测 Root/Magisk 杀进程）
│   │   ├── 有 eBPF 内核支持 → eBPFDexDumper-rs（首选）
│   │   ├── 有 FART ROM → FART（第3代抽取壳）
│   │   ├── 有 LSPosed → FART+Frida(CYRUS-STUDIO)（无需刷机）
│   │   └── 都没有 → BlackDex → FunDex2 → Smali Patch → 建议刷 FART ROM
│   │
│   ├── 真机(无Root)
│   │   ├── BlackDex / newBlackDex（首选）
│   │   └── Smali Patch
│   │
│   └── 模拟器
│       ├── 先检查 App 进程是否存活（`adb shell ps | grep <包名>`）
│       │   ├── 进程存活且稳定 → Root 直读 /proc/pid/mem dump（无需注入）
│       │   └── 进程不存在或秒退 → 壳已检测到模拟器杀进程，**不可直接 dump**
│       │       ├── Smali Patch 去模拟器检测 + 重打包（必做前置）
│       │       ├── 去检测后 BlackDex 脱壳
│       │       └── 去 detection 后 mem dump
│       └── 以上都失败 → 建议用户切换到真机（真机可使用 eBPF/FART 等内核级工具）
│
│   > 模拟器路径不含 Frida。原因：A4+ 壳 Anti-Frida >= L3，纯 Frida 脱壳（FRIDA-DEXDump/hook dump）在模拟器和真机上均不可行；
│   > FART+Frida(CYRUS-STUDIO) 以 Frida 为注入通道但核心是 ART 层主动调用，在真机+LSPosed 下有条件可用，模拟器上仍不可用。
│   > 模拟器额外增加 x86 架构不匹配导致 hook 不可靠、硬件指纹易被检测等问题。
│   > **关键前提**：A4+ 壳在模拟器上 App 通常启动后数秒被杀（init_array 反模拟器检测），
│   > 直接 mem dump 会因进程不存在而失败。必须先确认进程存活，否则先 Smali Patch 去检测。
│   > 真机相比模拟器的优势不是"Frida 可用"，而是可使用 eBPF/FART 等内核级工具。
│   > BlackDex 标记为"需用户安装 APK"，无法通过 adb 自动触发脱壳——失败时应请用户手动操作或直接进入 Smali Patch，不得跳到 Frida。
│
└── 否(A1-A3) → Frida 可行
    └── FRIDA-DEXDump / Frida hook dump（标准流程）
```

> **注意**：A4+ 分支中不包含 FRIDA-DEXDump。Anti-Frida >= L3 的壳下 Frida 脱壳成功率趋近于零，
> 不值得尝试。如果壳恰好是 L1-L2（如百度/阿里），可在 BlackDex 失败后作为补充尝试，
> 但必须标注 `[分析辅助]`。

### 关键决策门禁

**门禁 0：环境探测（执行决策树前必须先完成）**

决策树中的"有 eBPF 内核支持""有 FART ROM""有 LSPosed"等条件，模型无法自动判断。
必须通过以下方式确认：
- **设备环境信息**：按任务需要核对用户提供的环境和实际证据，在 report 说明来源与限制；不要求创建 route-state.json，也不把旧环境字段当成本次实测。
- **adb shell** 执行 `cat /proc/config.gz | gunzip | grep CONFIG_BPF` 或 `ls /data/fart` 或 `pm list packages | grep lsposed` 来检查
- 若 adb 不可用或检查失败，**停下来问用户**："你的环境是否安装了 LSPosed / FART ROM / 是否知道内核是否支持 eBPF？"
- 用户说"都没有"或"不确定"→ 按回退路径（BlackDex → Smali Patch）执行

**门禁 1：A4+ 时禁止纯 Frida 脱壳优先**

当壳类型匹配上表"防护能力矩阵"中 Anti-Frida >= L3 的壳时，
禁止将纯 Frida 脱壳（FRIDA-DEXDump / Frida hook dump）作为首选。必须先尝试上表中的高隐蔽性工具。
FART+Frida(CYRUS-STUDIO) 不受此限制——它以 Frida 为注入通道但核心逻辑是 ART 层主动调用，在真机+LSPosed 下可正常使用。

**门禁 2：模拟器环境降级**

模拟器环境下，所有运行时 hook 方案优先级自动降级。A4+ 壳下纯 Frida 脱壳在模拟器和真机上均不可行（Anti-Frida >= L3）；FART+Frida(CYRUS-STUDIO) 在真机+LSPosed 下有条件可用，模拟器上仍不可用。模拟器额外限制：无 eBPF/FART 内核级工具、x86 架构 hook 不可靠。
优先级变为：Smali Patch > 免Root工具(BlackDex) > Root直读内存(dd /proc/pid/mem) > 内核级工具(eBPF) > Xposed模块 > ~~纯Frida脱壳~~
**注意**：BlackDex 是 GUI 工具，模型无法通过 adb 触发脱壳操作。BlackDex "失败"（无法自动化）时，应请用户手动操作或直接进入 Smali Patch，不得将此视为"BlackDex 不可用"而跳到其他方案。

**决策提示：停止无新依据的重复尝试**

本段不以轮数决定完成、回复或自动切换工具。上文关于环境和工具适用性的限制仍有效，不因去掉计数而放宽。
已有失败证据且没有新假设或必要输入时，暂停并在 report 说明原因；可直接请求帮助。后续动作须符合用户目标和明确授权，不默认重试、升级工具或扩大执行范围。

## 四、模拟器环境专项策略

### 模拟器检测根因

壳在模拟器中检测强度远超真机，因为：
1. Native 层 init_array 中的检测早于 Java 层，早于 Frida 注入（**注意：纯 Frida 脱壳在 A4+ 真机上也因此不可行，并非模拟器特有**）
2. Build.HARDWARE=qemu/goldfish/ranchu 无法通过 Java hook 修复（Native 层直接读）
3. x86 模拟器运行 ARM 应用时架构不匹配，壳可直接检测 CPU 特性
4. 即使 Frida spawn 模式，壳的 init_array 在 JNI_OnLoad 前就执行了检测
5. **模拟器特有劣势**（真机无此问题）：无法使用 eBPF/FART 等内核级工具、x86 架构导致 Frida hook 不可靠、硬件指纹（CPU 特性/传感器）易被检测

**现代模拟器属性伪造**：MuMu/夜神/雷电/云手机等可伪造 `ro.hardware` 为真实硬件型号（如 `Redmi`），`ro.kernel.qemu` 也可为空。仅靠属性检查不够——必须结合 ADB 连接元数据（设备名含 `emulator`、地址为 `127.0.0.1`）和用户声明综合判定。属性检查能命中的已知厂商：夜神（`nox`）、雷电老版本（`chendu`）、BlueStacks（`bluestacks`）；MuMu/雷电新版本/MuVision 等需依赖步骤 1 的 ADB 元数据信号。

### 模拟器推荐策略

| 策略 | 操作 | 适用壳 | 前置条件 |
|---|---|---|---|
| **Smali Patch 去检测（首选）** | 反编译 APK → 定位壳检测代码 → patch 返回值 → 重打包签名安装 | 所有壳 | — |
| **进程存活检查** | `adb shell ps \| grep <包名>`，确认进程存活且稳定 >10 秒 | — | **所有环境所有方案的前置** |
| **Root 直读 /proc/pid/mem** | dd 直接读进程内存 dump DEX/SO，无需注入任何 SO | 所有壳 | 进程存活 + 已 Root |
| **BlackDex 虚拟化** | 安装 BlackDex → 选择目标 → 自动 dump | L1-L2 壳（去检测后可覆盖 L3+） | 进程存活 |
| **Smali Patch + 专用工具** | 先 patch 去检测，再用 BlackDex/DexDump 脱壳 | L3+ 壳 | — |
| **切换真机** | 以上都失败时，建议用户使用 Root 真机（优势：可使用 eBPF/FART 等内核级工具，非 Frida） | 最终兜底 | — |

### 模拟器 Root 直读内存脱壳

**前置条件**（必须按顺序检查，不得跳过）：
1. 模拟器有 Root（大多数模拟器默认 Root）
2. **App 进程存活且稳定**：`adb shell ps | grep <包名>` 返回 PID，且等待 10 秒后再次检查进程仍在
3. 若进程不存在或秒退：壳已检测到模拟器并杀进程，**此方案不可用**，必须先 Smali Patch 去模拟器检测

A4+ 壳下纯 Frida 脱壳在模拟器和真机上均不可行（FART+Frida 在真机+LSPosed 下有条件可用，模拟器上仍不可用），模拟器额外无法使用 eBPF/FART 等内核级工具，此方案是进程存活时的首选。

步骤：
1. 正常启动 App（`adb shell am start -n <包名>/<主 Activity>`）
2. **等待 5-10 秒后检查进程**：`adb shell ps | grep <包名>` → 若无结果或进程已死，**终止此 SOP**，转 Smali Patch 去检测
3. 若进程存活，再等待 5 秒确认进程稳定（不秒退），然后获取 PID
4. `adb shell su -c "cat /proc/<PID>/maps | grep dalvik-DEX"` 找到 `[anon:dalvik-DEX data]` 区段
5. `adb shell su -c "dd if=/proc/<PID>/mem bs=1 skip=<十进制起始地址> count=<大小> of=/sdcard/dump.dex"` 读取
6. `adb pull /sdcard/dump.dex` 拉取到本地
7. 验证：本地执行 `python -c "print(open('dump.dex','rb').read(4))"` 输出以 `dex` 开头即正确

**也可用于 SO dump**：`grep '\.so' /proc/<PID>/maps` 找到目标 SO 基地址，同样用 dd 读取。

**竞速 dump（进程存活但会延迟崩溃时）**：若 App 启动后存活 3-10 秒然后崩溃（壳延迟检测），可写脚本在启动后立即轮询 PID 并 dump。但这属于特殊情况——**多数 A4+ 壳在模拟器上进程根本活不了或存活极短，不应假设竞速 dump 可行**。

### Smali Patch 去检测 SOP

1. **apktool d target.apk** 反编译
2. **定位检测点**：
   - Java 层：搜索 `Build.HARDWARE` `ro.hardware` `qemu` `goldfish` `ranchu`
   - Application 子类：检查 `attachBaseContext` `onCreate`
   - ContentProvider：检查 `onCreate`
   - 壳入口类（如 `s.h.e.l.l.N`）：检查架构判断方法（如 `x()` 返回 ARM/ARM64）
3. **Patch 策略**：
   - 布尔判断 → `const/4 v0, 0x0`（return false）
   - 字符串比较 → patch `equals` 返回 false
   - 架构检测 → 修改返回值为 ARM64 对应值
   - `System.exit` / `Process.killProcess` → 替换为空操作
   - Native 层检测 → IDA 分析壳 SO，patch 检测函数入口为 `ret`
4. **重打包签名**：`apktool b` → 签名 → 安装 → 验证不闪退

## 五、壳特定脱壳要点

### 360加固
- **免费版**：BlackDex / FunDex2 通常可直接脱壳
- **企业版(VMP)**：需要 eBPFDexDumper / FART ROM / FART+Frida
- **第三代抽取型**：搜索 magic `BBbb.dgc` → 映射表每 0x18 字节一组 → code_off 按 uleb128 写回
- **脱壳 SO**：SM4-ECB 解密前 0x20000 字节 (key=硬编码⊕包名前16字节) + zstd 解压

### 爱加密
- **标准版**：BlackDex 通常可直接脱壳
- **企业版**：需要 eBPFDexDumper / FART / Smali Patch
- **模拟器闪退**：Native 层检测 Build.HARDWARE + /proc/cpuinfo，优先 Smali Patch
- **关键时机**：`s.h.e.l.l.N.al()` native 方法创建 ClassLoader 时 DEX 解密完成

### 梆梆
- **免费版**：FDex2 / BlackDex
- **企业版**：eBPFDexDumper / FART + 真机
- **init_array hook**：dump 时机在 `init_proc` 填充导入表前
- **hook libc**：企业版 hook read/write/mmap，Frida 不可行

### 腾讯乐固
- **标准版**：BlackDex / FDex2 / FunDex2
- **VMP版**：eBPFDexDumper / FART
- **脱壳时机**：`mprotect` 恢复 `r-x` 权限时 dump 真实 ELF

### 腾讯御安全
- **全部版本**：eBPFDexDumper（首选）/ FART + 真机
- **Frida 完全不可行**：多层 Anti-Frida + SO 保护

### 网易易盾
- **全部版本**：eBPFDexDumper / FART + 真机
- **VMP 保护**：多层指令转换，静态分析为主
- **Java2C**：部分方法被转为本机代码，脱壳后仍需 IDA 分析

### 娜迦
- **标准版(lib*dog.so)**：BlackDex / FunDex2
- **企业版(libedog.so)**：eBPFDexDumper / FART
- **新版(libxloader.so)**：检测较新，优先 eBPFDexDumper

### 阿里/聚安全
- **整体**：BlackDex / FRIDA-DEXDump 通常即可
- **class_data_item 分离**：可能需要 FART 主动调用来还原方法体

### 百度加固
- **整体**：BlackDex / FRIDA-DEXDump / FunDex2

### 国际壳(DexGuard/Promon/Arxan)
- **DexGuard**：反混淆为主（参见 deobfuscation-playbook.md），脱壳相对容易
- **Promon/Arxan**：eBPFDexDumper / FART + 真机，Frida 不可行

### 未知壳
1. 先尝试 BlackDex（免 Root，兼容性最好）
2. 失败 → eBPFDexDumper（内核级，最高隐蔽性）
3. 失败 → Smali Patch（完全静态操作）
4. 失败 → FART ROM / 建议用户换环境
5. 以上都失败且已确认壳 Anti-Frida <= L2 + 真机环境 → FRIDA-DEXDump（最后手段）

## 六、纯 Frida 脱壳可行性判定

> 本节中"Frida"均指纯 Frida 脱壳（FRIDA-DEXDump / Frida hook dump），不含 FART+Frida(CYRUS-STUDIO)。

在脱壳场景下，纯 Frida 脱壳只在以下条件同时满足时才作为首选：

1. 壳的 Anti-Frida <= L2（仅字符串/文件/端口检测，无内存模式/ArtMethod/SVC 检测）
2. 运行环境为真机（非模拟器）
3. 使用魔改版 Frida（消除 L1 字符串特征）

以下情况 **纯 Frida 脱壳不可行**，直接跳过：
- 壳类型在"防护能力矩阵"中标记 Anti-Frida >= L3（A4+ 壳在真机和模拟器上均不可行）
- 运行环境为模拟器（即使 L1-L2 壳，模拟器 x86 架构也导致 hook 不可靠）
- 已确认失败来自检测而非脚本 bug，且没有支持继续尝试的新依据：暂停并说明限制

## 七、升级路径

专用工具失败后按以下顺序升级。**注意**：A4+ 壳必须跳过 FRIDA-DEXDump。

```
A1-A3: BlackDex → FunDex2 → FRIDA-DEXDump → eBPFDexDumper → FART+Frida → Smali Patch
A4+:   eBPFDexDumper → FART+Frida(真机+LSPosed) → FunDex2 → Smali Patch → dd /proc/pid/mem → 建议切换真机
```

相关失败在 report 中说明工具名、实际现象和依据；不创建 approachHistory 管理台账。
重复操作没有新信息时停止并说明阻塞；是否继续取决于用户目标、授权、必要输入和新证据，不按固定次数自动重试或升级工具。

## 八、Gadget 注入关键陷阱

> **适用范围**：本方案本质依赖 Frida 运行时，受 Anti-Frida 等级约束。仅适用于 A1-A3 壳（Anti-Frida <= L2）。A4+ 壳下 Gadget 注入的 Frida 运行时同样会被检测，不可行。

适用场景：壳检测在 init_array 或 JNI_OnLoad，Frida spawn/attach 无法在其之前注入。通过将 frida-gadget.so 注入 APK，使其在壳 SO 加载前执行。

### 关键陷阱

1. **禁止 DEX 二进制 patch**：不要在 DEX 中插入或覆盖字节码——这会破坏所有内部偏移（try-catch 区域、debug info、字符串表）。必须用 apktool 的 smali 编译路径：`apktool d → 修改 smali → apktool b`
2. **资源编译失败**：apktool 报错时，先删除壳产生的无效资源声明（如 `res/values/raws.xml` 中的无效条目 + `public.xml` 中对应的引用），再用 `--use-aapt2` 重试
3. **版本匹配**：frida-gadget.so 版本必须与设备端 frida 版本一致（本技能基准 17.6.2，配对表见 `references/frida-version-policy.md`）
4. **AndroidManifest**：需要 `android:extractNativeLibs="true"`（否则 SO 不会解压到磁盘）
5. **注入位置**：在壳的 native 加载类（如 `N.<clinit>`）的 `System.load` 之前添加 `System.loadLibrary("frida-gadget")`

## 九、实战补充：企业壳分层击杀与配盾（2026-09）

> 来源：`references/technique-extract-2026-09.md` 第 13 节；实测样本：20 App 八厂商横评（OPPO Android 12；官方 frida 17.6.2 通过 11/20，魔改 20/20，样本内数据）。

### 信号 → 杀手层归因 → 对策

| 信号 | 归因 | 对策 |
|---|---|---|
| attach 直接失败 | ptrace 通道被占（self-ptrace 矩阵 + EXITKILL） | seccomp **TSYNC** 封 kill/tgkill/tkill 及 exit_group 的 sig∈{6,9,15}；TSYNC 不带则 filter 只绑安装线程 |
| 桥加载瞬间死 | `.init_array` 构造器杀手 | 延迟注入（delay 数秒）避开启动自检冻结窗 |
| +30s 左右死 | 热函数 GOT/代码页篡改检测 | surgeon 贴片：RETAA（0xD65F0BFF，PAC 帧必须带认证 ret），20ms 轮询重贴对抗再加密，页非零门控防误写 |
| 会话结束 0.3-5s 死 | 收尾杀手（rt_tgsigqueueinfo 伪装 JNIEnv FatalError） | 信号过滤 + detach 后 `am force-stop`（AMS 外杀不受 exit_group 封锁影响） |
| 重 Java hook 崩 | 时序型检测（SIGALRM 看门狗，开销敏感） | 轻量探针（只抓 key/IV 不做 hex）+ 延迟 ≥30s 装 hook |
| 方法级虚拟化 | dexvmp 多方法共享不可拦入口 | 放弃 hook 该类，**hook 面下沉框架层**（okhttp/javax.crypto 照常生效）；`deoptimizeEverything` 触发反篡改秒杀，禁用 |

### 工程纪律

- **谱系选主唯一可靠判据：PPID==zygote64 且 NAME==包名**。严禁 pidof 首列——壳子进程 stub、`:tools` 孪生、ppid=1 同名看门狗都伪装成主进程。
- 注入线程挑 Binder/hwuiTask/pool- 工作线程，避开主线程（长时间冻结触发 ANR 判死）；attach 前轮询 `/proc/<pid>/attr/current` 等 SELinux 特化完成。
- 脱壳补充：被动 hook（`ClassLinker::DefineClass`）+ 主动 enumerate（`DexFile.mCookie`）**必须同时**；dump 产物按**内容签名去重**（OAT 合并区重复 dump 会虚增产量）；dex 写 `/data/data/<pkg>/cache` 避开分区存储限制。
- 环境残留是头号假检出源：frida helper 孤儿进程、目标 lib 目录落盘的 staged agent、/data/local/tmp 二进制——测试前清场；**测试协议参数本身是被测变量**（注入延迟落进自检冻结窗会被误判为"被检测"）。
