# 专项 Playbook 索引

以下路径前缀均为 `<SKILL_BASE>/`。当任务命中对应关键词时，应补读对应 playbook。

## 高频参考（按相关性补读）

| 关键词 | Playbook |
|---|---|
| `JNI / RegisterNatives / Java_* / bridge` | `references/jni-bridge-playbook.md` |
| `ELF / symbol / RVA / crypto constant / syscall` | `references/native-so-playbook.md` |
| `HMAC / AES / token / protobuf / TLS 明文 / 签名` | `references/crypto-protocol-playbook.md` |
| `DexClassLoader / 壳 / 动态 Dex / dump` | `references/dex-loader-playbook.md` |
| `OLLVM / FLA / BR / SUB / 控制流平坦化 / 虚假控制流 / 指令替换 / Arkari / BlackObfuscator` | `references/deobfuscation-playbook.md` |
| `保护绕过综合（Root + Frida + Integrity + Pinning 联合场景）` | 同时读 `references/anti-root-playbook.md`、`references/anti-frida-playbook.md`、`references/anti-emulator-debug-playbook.md`、`references/integrity-pinning-playbook.md` + `references/a6-a7-failure-pattern-cookbook.md` |
| `Frida Java` / `Frida Native / Interceptor / hexdump` | `references/frida-java-playbook.md` / `references/frida-native-playbook.md` |
| `Flutter / Hermes / Unity / libapp.so / libil2cpp.so / index.android.bundle` | `references/framework-runtime-playbook.md` |
| `算法自吐 / EVP / BoringSSL hook / BN_mod_exp / 国密 SM2` | `references/crypto-protocol-playbook.md` |
| `r0capture / SSL_read / SSL_write / libttboringssl / SSL 层明文` | `references/native-network-playbook.md` |
| `RPC 服务化 / frida-rpc` | `references/frida-rpc-service-notes.md` |
| `Frida 版本 / 兼容性 / 17.6.2 / 16 兼容 / API 迁移 / frida-server 版本不匹配` | `references/frida-version-policy.md` |

## 静态分析

| 关键词 | Playbook |
|---|---|
| `manifest / exported / provider / permission / asset / res` | `references/static-triage-playbook.md` |
| `retrofit / okhttp / volley / baseUrl / api` | `references/java-api-playbook.md` + `references/api-extraction-patterns.md` |
| `activity / fragment / viewmodel / repository / onClick / observer / 调用链` | `references/call-flow-playbook.md` + `references/call-flow-analysis.md` |
| `suspend / Continuation / Flow / StateFlow / invokeSuspend / Kotlin 协程` | `references/call-flow-playbook.md`（Kotlin async 链路追踪） |
| `@Composable / Composer / Compose / remember / mutableStateOf` | `references/call-flow-playbook.md`（Compose UI 树追踪） |
| `@Inject / @Module / @Provides / HILT / Dagger / MembersInjector` | `references/call-flow-playbook.md`（DI 间接层追踪） |
| `jadx / fernflower / vineflower / 引擎选择` | `references/engine-selection.md` + `references/jadx-usage.md` + `references/fernflower-usage.md` |

## 保护绕过

| 关键词 | Playbook |
|---|---|
| `Root 检测` | `references/anti-root-playbook.md` |
| `Frida 检测 / ptrace / maps / port scan` | `references/anti-frida-playbook.md` |
| `模拟器检测 / 调试检测 / tracer / debug flag / 设备指纹` | `references/anti-emulator-debug-playbook.md` |
| `Play Integrity / pinning / TrustManager` | `references/integrity-pinning-playbook.md` |
| | （注：SafetyNet Attestation 已于 2024Q2 起废弃，2025 全面停用；新目标只看 Play Integrity） |

## 网络 / 存储 / WebView

| 关键词 | Playbook |
|---|---|
| `WebView / addJavascriptInterface / evaluateJavascript / hybrid` | `references/webview-hybrid-playbook.md` |
| `SharedPreferences / SQLite / Room / MMKV / ContentProvider / Intent / Binder` | `references/storage-ipc-playbook.md` |
| `Cronet / BoringSSL / native TLS / QUIC / SSL pinning` | `references/native-network-playbook.md` |

## Runtime / 分包

| 关键词 | Playbook |
|---|---|
| `ART / OAT / VDEX / odex / inline / deopt / spawn / isolated process` | `references/art-runtime-playbook.md` |
| `split APK / APKS / AAB / dynamic feature / asset pack` | `references/split-delivery-playbook.md` |
| `smali patch / rebuild / resign / install verify` | `references/smali-patching-playbook.md` |

## 高对抗 / 专项

| 关键词 | Playbook |
|---|---|
| `A6 / A7 / 多进程 / 壳 + 动态加载 + Native pinning / hook miss` | `references/a6-a7-failure-pattern-cookbook.md` |
| `eBPF / HWBP / 硬件断点 / PTE hook / seccomp / SVC 监控 / 内核 DEX dump / edbg` | `references/kernel-assisted-re-playbook.md` |
| `VMP / VM interpreter / handler table / opcode mapping / 字节码还原` | `references/vmp-analysis-playbook.md` |
| `trace / trace-slice / taint / ltv-taint / GumTrace / QTrace / VMLifter / 指令级 trace / 执行 trace / 算法恢复 / 语义提升` | `references/trace-analysis-playbook.md` |
| `Unidbg / Unicorn / QBDI / angr / 模拟执行 / 环境补全` | `references/unidbg-simulation-playbook.md` |
| `设备指纹 / 风控参数 / RiskEngine / Play Integrity / Key Attestation / Android ID` | `references/device-fingerprint-playbook.md` |
| `Hook 原理 / 注入方式 / PLT Hook / GOT Hook / Inline Hook / ArtMethod / Zygisk / ptrace` | `references/hook-injection-playbook.md` |
| `Android crackme / CTF / flag` | `references/ctf-playbook.md` |
| `跨版本 / 特征码 / 字符串交叉引用 / ADRP` | `references/frida-native-playbook.md` |
| `固定随机 / callJNI_OnLoad / emulator 池 / 生产化` | `references/unidbg-simulation-playbook.md` |
| `LSPosed 插件 / Xposed 模块 / dexlib2` | `references/hook-injection-playbook.md` |
| `ClassLoader 计数 / TBI / 指针标签` | `references/anti-emulator-debug-playbook.md` |
| `2026-09 实战技术总档案（22 组条目）` | `references/technique-extract-2026-09.md` |
