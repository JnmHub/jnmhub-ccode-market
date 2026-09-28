# A6 A7 Failure Pattern Cookbook

适用范围：`A6 / A7` 或同时出现 `壳 + 动态 Dex + 多进程 + JNI + pinning + Integrity + ART 时机问题` 的高对抗任务。

用法：不要把它当理论说明书，而是把它当“先排除哪类假阴性”的作战卡。
按当前目标和已有证据选择相关 pattern，不规定每轮条数。相关事实可直接写在 report，原始技术资产按需保留；未执行、未知或失败照实说明。
已有 baseline 或场景 preset 可按需阅读，不默认运行 `run/*.js` 或切换 `run/*-advanced.js`；工具执行仍须符合用户目标、授权与环境限制。

## FP-01 主进程看起来正常，但真实逻辑在子进程

- 表象：主进程 attach 后 UI 正常，hook 不命中，网络和 JNI 都像“没执行”。
- 错误结论：目标逻辑不存在，或 hook 点选错了。
- 常见真因：真实发包、解壳、注册 JNI、Cronet 初始化都在 `:push`、`:remote`、`isolatedProcess` 或守护进程。
- 最小 probe：先列 Manifest 进程声明、`ActivityThread.currentProcessName()`、`ps -A`、logcat 进程标签，再用 `spawn` 或多进程 attach 复核。
- Pivot 信号：主进程只看到壳/UI，子进程才出现 `loadLibrary`、`RegisterNatives`、`SSL_*`、`UrlRequest`。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/art-runtime-notes.md`、`run/network-stack-notes.md`、`timeline.jsonl`。

## FP-02 已 dump 到 Dex，但拿到的是壳层或过期副本

- 表象：dump 出来的 Dex 能反编译，但业务类、接口、签名逻辑仍缺失。
- 错误结论：业务逻辑在 SO，或样本已经没有该功能。
- 常见真因：先 dump 到的是 stub Dex、热更前版本、feature stub 或非真实 ClassLoader 命中的副本。
- 最小 probe：把 dump 时间点和 `DexClassLoader / InMemoryDexClassLoader / PathClassLoader` 命中点串成时间线。
- Pivot 信号：同一会话出现多个 loader、多个 dex path、匿名内存 Dex 或远端下载 Dex。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/class-loader-trace.js`、`run/dex-loader-dump-notes.md`、`memory-evidence.jsonl`。

## FP-03 看到了 native 方法声明，但 SO 语义始终接不上业务

- 表象：Java 里有 `native`，SO 里也有可疑函数，但无法高置信解释业务行为。
- 错误结论：某个单独 SO 函数就是最终签名/加密主逻辑。
- 常见真因：桥接是动态注册、wrapper table、延迟 `dlopen`，或真实函数指针落在晚加载模块。
- 最小 probe：先跑 `RegisterNatives`、`dlopen`、`JNI_OnLoad`，至少拿一条 `Java -> Native -> 输出` 最短链。
- Pivot 信号：函数地址落在匿名内存、二次 `dlopen`、类名与符号名对不上。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/register-natives-trace.js`、`run/jni-bridge-map.md`、`run/call-chain.md`。

## FP-04 Java pinning 没命中，于是误判为没有 pinning

- 表象：`TrustManager`、`CertificatePinner` 没命中，但抓包还是失败。
- 错误结论：网络没有 pinning，问题只在抓包工具或代理。
- 常见真因：请求走 Cronet、BoringSSL、自定义 verify callback、QUIC 或应用层二次加密。
- 最小 probe：先分 Java client、JNI facade、Native TLS 三层，再看 `SSL_CTX_set_custom_verify`、`SSL_write`、`CronetEngine.Builder`。
- Pivot 信号：只在 Native 层看到证书回调、明文点或 QUIC 请求。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/network-stack-notes.md`、`run/cert-pinning-bypass.js`、`network.jsonl`。

## FP-05 Java hook 不命中，被误判成逻辑未执行

- 表象：类和方法都找到了，hook 也挂上了，但点击功能或发包时没有任何日志。
- 错误结论：静态分析命中的逻辑是死代码。
- 常见真因：AOT/JIT、inline、quickening、冷启动早于注入、类在子进程加载，或命中的是 wrapper 非真实 sink。
- 最小 probe：先核对进程和时机，再评估是否需要 `spawn`、延迟 hook、deopt、转 Native/bridge 边界。
- Pivot 信号：同条业务链在 logcat、网络、JNI 证据里出现，但 Java hook 为空。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/art-runtime-notes.md`、`runtime-evidence.jsonl`、`logcat.jsonl`。

## FP-06 只盯着 base.apk，误判目标逻辑不存在

- 表象：`base.apk` 很薄，没看到业务资源、接口、关键类。
- 错误结论：样本被阉割，或逻辑已经迁走。
- 常见真因：逻辑在 dynamic feature、split ABI 变体、语言分包、asset pack 或首启下载模块。
- 最小 probe：先重组 APKS/AAB，列基础包、配置 split、feature module 和 asset pack，再看安装后的真实布局。
- Pivot 信号：功能入口引用 feature 类，或运行时才出现模块安装/下载行为。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/split-delivery-notes.md`、`run/split-layout.json`、`static-evidence.jsonl`。

## FP-07 容器代码很薄，于是错误沿用 Java-only 路线

- 表象：Java Activity / Service 代码很少，似乎没业务。
- 错误结论：应用没有本地复杂逻辑，直接看 Java API 就够了。
- 常见真因：Flutter/Hermes/Unity 容器下，真实逻辑在 `libapp.so`、`index.android.bundle`、`libil2cpp.so`、`global-metadata.dat` 或 OTA 资源。
- 最小 probe：先识别运行时类型，再判断逻辑落在 AOT、bundle、metadata 还是远端更新目录。
- Pivot 信号：Manifest 入口对接 `FlutterActivity`、`ReactActivity`、`UnityPlayerActivity`，或 assets/lib 中出现对应运行时锚点。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/framework-runtime-notes.md`、`run/framework-runtime-map.json`、`state/clues.md`。

## FP-08 unpin 成功，但协议依然复现失败

- 表象：证书校验已绕过，请求也发出去了，但仍抓不到可用明文或复现参数。
- 错误结论：还有一层 pinning 没绕过。
- 常见真因：应用层二次加密、protobuf framing、Native HMAC、会话密钥在另一条链路生成。
- 最小 probe：把“TLS 明文抓取成功”与“协议字段可解释”分成两项验收，再补 `Cipher / MessageDigest / native crypto sink`。
- Pivot 信号：`SSL_write / read` 命中但 payload 仍是密文、blob 或 protobuf。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/protocol-notes.md`、`run/crypto-fixtures.json`、`network.jsonl`。

## FP-09 本地 Integrity 绕过成功，但服务端仍拒绝

- 表象：本地不再闪退或弹错，业务继续走，但服务端仍返回 `risk`、`integrity failed`、`device rejected`。
- 错误结论：本地 bypass 无效。
- 常见真因：本地 verdict 只是第一层，远端还校验 attestation token、时间窗、设备绑定或二次上报链。
- 最小 probe：把本地 verdict、token 生成、token 消费、服务端拒绝点拆开记录，不混成“Integrity 失败”一句话。
- Pivot 信号：本地 UI 放行，网络层多出 attestation/token/verdict 请求或 header。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/integrity-bypass.js`、`run/protocol-notes.md`、`network.jsonl`。

## FP-10 静态 patch 命中一层防护，但引出新的完整性故障

- 表象：patch 后原本的 root/frida/pinning 不再触发，但应用改为闪退、签名异常、资源校验失败。
- 错误结论：patch 点选错，应该完全放弃静态 patch。
- 常见真因：改动破坏了 DEX/SO/hash/self-check 链，或影响 split/资源/签名一致性。
- 最小 probe：缩小 patch 面到最小原因，记录 patch 前后 hash、签名、安装路径和新的失败样本。
- Pivot 信号：旧防护消失，但新错误集中在 `PackageManager`、hash、resource、signature、install verify。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/smali-patch-notes.md`、`report.md`、`timeline.jsonl`。

## FP-11 测试协议参数本身是被测变量（2026-09 补充）

- 表象：换注入方式/延迟后"稳定检出"，结论看似加固又升级了。
- 错误结论：新绕过被检测。
- 常见真因：注入时机落在壳启动自检冻结窗（早期注入软挂/冻死），或验证协议的固定延迟改变了时序——被测的不是 App 而是测试方法。
- 最小 probe：固定注入产物不变，只扫描延迟参数（数秒级梯度）；对照组用已知干净样本走同一协议。
- Pivot 信号：同一目标在延迟梯度下结论翻转；干净样本也"检出"。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`report.md`、`timeline.jsonl`。

## FP-12 环境残留造成假检出（2026-09 补充）

- 表象：目标"检测到 Frida"，但剥掉所有 hook 仍报。
- 错误结论：存在更深的隐藏检测。
- 常见真因：frida helper 孤儿进程、目标 lib 目录落盘的 staged agent、/data/local/tmp 二进制、历史测试包（ppid=1）残留——环境面而非目标面。
- 最小 probe：清场后重测（孤儿进程、staged 文件、tmp 二进制逐一移除）；同一目标在干净环境复测一次。
- Pivot 信号：清场后"检测"消失；残留清单与检出时间相关。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`report.md`、`timeline.jsonl`。

## FP-13 设备退化态污染结论（2026-09 补充）

- 表象：某设备上"必死"的绕过方案，换机/重启后表现完全不同。
- 错误结论：方案本身无效（或反之，在某机上误判为有效）。
- 常见真因：壳把风控标记持久化到本地 DB/文件（pm clear 清不掉，reboot 才恢复），设备处于退化态。
- 最小 probe：reboot 后同机同原版重测一轮；跨机验证前先重启并核对 Android 版本。
- Pivot 信号：同机 reboot 前后结论翻转；本地出现壳的可疑持久化数据。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`report.md`。

## FP-14 多套防护并联被误判为单一机制（2026-09 补充）

- 表象：绕过一处检测后 App 仍死/仍弹，或时死时活。
- 错误结论：刚才的绕过无效，或存在"更深的一层"。
- 常见真因：多套 SDK 并联互不依赖互不通信（如三套安全 SDK、Java+Native 双链路）——拦住一个，另一个独立触发；"拦住一个会误以为另一个不存在"是最大归因错误。
- 最小 probe：先枚举全部安全库（so 清单/字符串特征）画战场；逐套隔离验证（一次只对付一套）。
- Pivot 信号：崩溃栈在不同安全库间轮换；击杀时间点与不同 SDK 的初始化时序吻合。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`report.md`、`run/native-notes.md`。

## FP-15 "没报错"被当成"已通过"（2026-09 补充）

- 表象：脚本跑完无异常、返回值有内容，于是判定还原/绕过成功。
- 错误结论：目标已达成。
- 常见真因：沉默失败——文件降级分支、语义偏差、return null 的关键方法、服务端静默风控都不报错；"看起来像正常 JSON"不是证据。
- 最小 probe：对拍——本地复现输出与真机/抓包逐字节比对；3-5 组不同输入防巧合；验收看 UI/业务数据能否渲染而非进程活着。
- Pivot 信号：本地全对但服务端拒；输出"长度对但解不开"。
- 可选资产组织例（仅保留实际需要的内容，不要求建这些文件或台账）：`run/fixtures.json`、`run/protocol-notes.md`、`report.md`。

## 快速使用规则

- 只选择与当前症状相关的 pattern；没有必要输入或授权时可暂停，不为遍历条目而执行。
- 每条 pattern 先拿“最小反证”而不是直接上大 patch。
- 任何 `hook 未命中 / 没抓到包 / 没看到类` 的结论，都先问自己它更像哪条 failure pattern。
- A6/A7 默认先查：进程、时机、loader、bridge、网络分层，再谈语义、算法和最终 patch。
