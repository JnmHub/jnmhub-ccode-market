# Technique Extract: 2026-09 Real-World Case Studies

从 Frida 系列实战（含网易云易盾、招商银行、QQ 音乐、酷狗、七猫、字节系、美团系等案例）、Unidbg 全系列与加固横评（20 App 八厂商，OPPO Android 12 真机）中提炼的方法论与关键信号，供各 playbook 引用。按专题分类。文中成功率与覆盖率为对应实测样本内观察，不代表通用承诺；涉及 Frida/Android 版本的行为以条目内标注为准（截至 2026-09）。

---

## 1. 算法自吐工作模式（Java 层全量监控）

**来源**: 陌生 App 加密链路定位（QQ 音乐等实测）

### 信号模式

- 不知道 App 用了哪些加密、什么时机、密钥从哪来；
- 业务类重度混淆，静态搜代码效率低。

### 分析方法论

1. **Hook 标准咽喉要道**：业务代码可任意混淆，但 `Cipher / MessageDigest / Mac / Signature`（JCE 四大类）是系统依赖不可混淆。全量挂监控后操作 App，加密自动吐出。
2. **实例关联**：Cipher 的 getInstance/init/doFinal 三步回调天然无关联、多线程交错。用 `this.hashCode()` 做 Map key 串联；doFinal 出报告后立即 delete（防累积并压碰撞）。
3. **防双打印**：故意不 hook `doFinal(byte[])` / `digest(byte[])` 便捷重载（内部等价 update + 无参版，都挂会一次调用打两次）。
4. **参数采集成套**：算法（transformation）、密钥（`Java.cast(key, SecretKeySpec).getEncoded()`，null 即 AndroidKeyStore 硬件密钥）、IV（区分 Iv/GCMParameterSpec，GCM 还要 hook `updateAAD`）、明文、密文、调用栈。
5. **完全无输出四类定位**：AndroidKeyStore 硬件密钥 / Native 层直接加密 / Conscrypt EngineSpi 旁路（补 hook `ConscryptEngine.wrap/unwrap`）/ 自定义 JCE Provider（`Security.getProviders()` 观察）。Java + Native 双脚本同挂是确认层次最快的姿势。
6. 工程要点：事件用 buf 累积后一次 console.log 原子吐出（防多线程字段级交错）；令牌桶限速整事件丢弃；日志形态识别优先于逐条阅读（如 IV==key、输入首 `1f 8b`=GZIP 魔数）。

### 适用场景

- `crypto-protocol` 专题首选起手式；"Objection 验证调用，自吐脚本还原方案"。

---

## 2. Native 层加密自吐（OpenSSL / BoringSSL）

**来源**: Java 层无输出 + 抓包有密文的实测案例（腾讯系多副本 libcrypto 等）

### 分析方法论

1. **两套 API 都挂**（不知 App 走哪条）：EVP 高级（`EVP_EncryptInit_ex/Update/Final_ex`，新代码/Conscrypt/Flutter）与低级（`AES_set_encrypt_key / AES_cbc_encrypt / RSA_public_encrypt / MD5_Update`，老代码/定制 BoringSSL 大型 App）。
2. **算法名反查**：`EVP_CIPHER_CTX_cipher` → `EVP_CIPHER_nid` → `OBJ_nid2sn`，日志直接得 `aes-256-cbc`（OpenSSL/BoringSSL 命名差异用 fallback 链兼容）。
3. **ctx 指针索引**：Update 累积、Final 一次性吐出（`EVP_CIPHER_CTX*` / `MD5_CTX*` 作 key）。
4. **一次性函数内联怪象**：`HMAC()` / `MD5()` / `EVP_Digest()` 被编译期内联，只挂 Update/Final 会出现"0 段 Update"——需按一次性导出单独 hook。
5. 工程清单：`safeAttach` 对**所有同名 SO 副本**装钩（大型 App 一进程多份 libcrypto，findModuleByName 只返第一个）；过滤 TLS 1.2 PRF / TLS 1.3 HKDF 噪声；`android_dlopen_ext` 兜底延迟加载（spawn 下 setImmediate 早于 SO 加载全 null）。
6. 零代码验证：`frida-trace -i 'AES_*' -i 'EVP_*'` 先确认路径再上脚本。

---

## 3. RSA 与混合加密提取

**来源**: 酷狗 libj.so 等实测

### 分析方法论

1. **`BN_mod_exp_mont` 是 RSA 提取王牌**：所有 RSA 运算（公钥加密/验签/私钥/签名）的底层模幂 helper，实测命中率远高于 `RSA_public_encrypt`。args[2]=指数 e、args[3]=模数 n；BoringSSL BIGNUM 首字段为 `{d, top}`，读 d 指针后小端转大端 hex。**指数 hex 短于 16 字符判为公钥**（65537=0x10001）；得 n+e 即 `RSA.construct((n, e))`，无需 PEM。直接 getByteArray 会 dump 出结构体头——必须先 `getPointer(0)`。
2. **AES 低级 API 配对**：`AES_cbc_encrypt` 第 4 参是展开后的 key schedule（176/240 字节，反推不出原始 key），必须同时 hook `AES_set_encrypt_key`。
3. **RSA+AES 混合加密三信号**（三中其二确诊）：同一业务栈 RSA 与 AES 接连出现（RSA 输出=密钥位数/8 佐证）；RSA 明文恰为 16/32/48 字节（AES key / key+IV）；RSA 明文 = 下一次 AES init 的密钥（最硬证据）。
4. **还原目标定位**：扮演客户端重新加密——不需要服务端私钥，AES key 可自造；拼接格式（[C1][C2]、[C1][IV][C2]、JSON base64、长度前缀）是最易错环节，只能与抓包密文字节级比对。

---

## 4. 国密算法还原要点

**来源**: 银行类 App 实测（SM4-CBC+Base64 落在 Java 层的案例与 BC 底层案例）

### 分析方法论

1. **JCE 路径前提**：`Cipher.getInstance("SM4/...")` / `MessageDigest.getInstance("SM3")` 需要 App 启动时 `Security.addProvider(new BouncyCastleProvider())`（≥1.58 含 SM）；未注册抛 NoSuchAlgorithmException，只能走 BC 底层：`SM4Engine.processBlock`、`SM3Digest.update/doFinal`（**先调原方法再读 out 数组**）、`SM2Engine.processBlock`、`SM2Signer.generateSignature/verifySignature`。
2. **SM2 密文布局先确认**：BC 默认 `C1‖C2‖C3`（老国标）vs GB/T 32918-2016 `C1‖C3‖C2`——jadx 查构造是否传 `Mode.C1C3C2`。特征：输出比输入长 97 字节（C1 65B 曲线点 + C3 32B SM3）；顺序错 = "长度对但解不开"。
3. 静态识别：jadx 搜 SM2/SM3/SM4/bouncycastle/GMssl；lib 下 `libgmssl.so`；assets 下 `.sm2`；SM4 S-Box 首字节 `d6 90 e9 fe`。
4. URL_SAFE Base64（flags=8）输出 `-_` 去 `=`；Python 复现需 `urlsafe_b64decode(s + '=' * (-len(s) % 4))` 补 padding。

---

## 5. 密钥溯源与 Python 复现排错

**来源**: 加密还原系列实测

### 密钥溯源四分类（决定复用策略）

| 分类 | 识别特征 | 处理 |
|---|---|---|
| 硬编码 | ASCII 可读、构造栈在工具类/`<clinit>` | 直接复用 |
| 服务端下发 | 构造栈在 Response 解析 | 配合抓包 |
| PBKDF2 派生 | hook `SecretKeyFactory.generateSecret`，从 PBEKeySpec 取密码/盐/迭代/长度 | 记录四参数 |
| 设备特征派生 | 栈含 deviceId/IMEI | 还原派生算法；HKDF=同栈连续多次 HMAC，土法 KDF=同栈 MessageDigest 连续触发且输入有规律 |

### Python 复现对不上时固定序排查（前三类占多数）

1. transformation 错配（长度对但字节全不同）；2. Key/IV 抄写错（hex 混入空格/0x）；3. 外层 Base64/Hex 漏算（长度差 4/3 或 2 倍）；4. 明文编码 GBK（中文块开始错）；5. GCM AAD 漏抓（Java 输出 ct+tag 拼一段，pycryptodome 分开返回，比对前先拼）。

**判据**：Python 输出与 Frida doFinal 输出逐字节一致是唯一硬证据；用 3-5 组不同输入防巧合通过。body 序列化必须与客户端字节一致（`separators=(',',':')` 紧凑格式）。

---

## 6. Protobuf / gRPC 还原深化

**来源**: gRPC/Protobuf 协议逆向实测

### 分析方法论

1. **Wire Format 根基**：`Tag = (field_number << 3) | wire_type`；wire_type 只有 0/1/2/5 合法；首字节 `&0x07` 不在 {0,1,2,5} 必不是 Protobuf。proto2/proto3/Editions 在 wire 层一致。
2. **gRPC 帧头**：body 前 5 字节（1 压缩标志 + 4 大端长度）解码前必须剥掉；压缩标志 01 先 gunzip。
3. **拦截点选型**：Stub 层（知道类名）→ `io.grpc.stub.ClientCalls`（**通用首选**，覆盖四种调用模式且拿方法名）→ 序列化层（`toByteArray`/`parseFrom`/`CodedOutputStream.writeXxx`）→ OkHttp/Cronet → SSL_read/write 兜底。Token/签名在 `io.grpc.Metadata.put`。
4. **.proto 省力路径**：APK 残留 .proto/.desc → grpcurl 探 Reflection（先试没坏处）→ Descriptor 提取（lite/nano 没有：搜 `FileDescriptor` 有=完整版）→ PBTK → **writeTo 反推（最精确且抗混淆）**：`writeSInt32(fieldNumber, v)` 一行一字段、方法名直接映射类型、循环=repeated、`xxxCase_`=oneof、MapField=map（等价 repeated MapEntry{key=1,value=2}）；混淆后 writeXxx 方法名与 FIELD_NUMBER 常量值不变。
5. **盲猜规则**（无源码多样本）：0/1→bool、递增→ID、小范围→enum、13 位→毫秒时间戳、LEN 可解码→嵌套、不可解码→bytes。
6. Native 层：hook `MessageLite::SerializeWithCachedSizesToArray`（mangled `_ZNK6google8protobuf11MessageLite32serializeWithCachedSizesToArrayEPh`）+ `ByteSizeLong()` 拿长度，绕开 std::string 三套内存布局差异。

---

## 7. SSL 层明文抓包（r0capture 模式）

**来源**: r0capture 源码精读与强 Pinning/mTLS 实测

### 分析方法论

1. 原理：`SSL_write` 之上是明文、之下是加密——**SSL_write 在 onEnter 读 buf（onLeave 时可能被改），SSL_read 在 onLeave 读 buf（retval 是实际字节数，进入时缓冲为空）**。
2. 多 TLS 库枚举：`ApiResolver("module")` + `*libssl*` 通配；多匹配优先 `com.android.conscrypt` 命名空间。
3. 五元组还原：`SSL_get_fd(ssl)` → fd → Socket 地址；会话标识用 `SSL_get_session` + `SSL_SESSION_get_id`（fd 会被复用）。Java 层 Conscrypt 流类只抓栈不抓数据。
4. pcap 伪造：LINKTYPE_IPV4(228) 跳以太网层；seq/ack 按会话双方向累计字节模拟；TCP flags 固定 0x5018；Wireshark 校验和标红属正常伪包特征。
5. 客户端证书 dump：hook `KeyStore$PrivateKeyEntry.getPrivateKey/getCertificateChain` 组装 PKCS12。
6. **不适用**：WebView/Flutter/HTTP2/HTTP3/QUIC/多进程（Flutter 另 hook libflutter.so，符号 strip 需先定位）。
7. OkHttp 明文直读：hook `RealCall.execute` 用 `peekBody(512*1024)`，不要 `body().string()`（消耗流致 App 异常）。

---

## 8. 字节系 libttboringssl 与 LSPosed 插件化抓包

**来源**: 抖音 Cronet 抓包 LSPosed 插件（39.1.0-39.3.0 实测）

### libttboringssl 三差异

- 导出符号精简（`findExportByName` 常 null）；额外 Pin 逻辑；**延迟加载**——必须 hook `android_dlopen_ext`/`dlopen`，onLeave 检测路径再装 hook。全失效时 IDA 搜 `"CERTIFICATE_VERIFY_FAILED"` 做 X-Ref 拿偏移 `mod.base.add(offset)` 直挂。

### LSPosed 插件 hook 点三原则

1. **选语义稳定的库层 setter 而非业务层入口**：放弃 Cronet `CertVerify`（C++ wrapper 带 paciasp，Android 15+ arm64 与 PAC/TBI 相关，inline hook 破坏认证上下文延迟崩溃；且校验还填充证书链/OCSP/SCT，截断致状态不完整），改 hook BoringSSL `SSL_CTX_set_custom_verify`（函数体短、无 paciasp、语义稳定）。
2. **不跳过原始校验流程**：注册期 per-CTX 保存原 callback（`unordered_map<void*, VerifyCb>`，多 TLS 使用者防互相覆盖）；先调原 callback 让状态喂完整，再在返回值边界最小改动——0=ok、1=invalid 可覆盖、**2=retry 必须原样透传**（提前放行推进握手但内部未就绪，后触发断言）。
3. 补第二层 `SSL_get_verify_result` 恒返 0：握手按真实流程走，最终结果在读取点改。orig==nullptr（hook 晚于 CTX 创建/偏移漂移）应打诊断而非静默放行。

### 反混淆通用（美团系一插件通吃多 App）

- dexlib2 静态扫 DEX 模式匹配：目标字符串常量 + 寄存器数据流（`invoke-virtual` optString → `move-result-object` → `iput-object` 寄存器对号）定位配置字段；再找读该字段、引用相关常量与数字、调 String.equals 的无参 int 方法；**hook 代码特征（数据流+常量）而非标识符**。定位后 `Class.forName(name, false, cl)`（不初始化防触发静态逻辑）+ getDeclaredMethod 反射拿 Method。

---

## 9. Hook 框架检测硬信号：ClassLoader 计数

**来源**: 看雪思路在 Android 16（Pixel 6 Pro）落地与真机验证

### 原理

`ClassLinker::class_loaders_` std::list 是 GC 可达性的一部分：LSPosed 模块 ClassLoader（InMemoryDexClassLoader，dex 不落地）要存活必须挂链，要隐藏必须从一切可观测面消失——结构性不可兼得。实测：干净简单 App 计数 2-3，LSPosed 注入后 12-15；同环境下 Class.forName 找 XposedBridge、堆栈回溯、反射 findAndHookMethod、maps 文本扫描全部被绕过，唯计数命中。

### 实现要点（检测方视角，逆向者用于理解暴露面）

- 无符号纯指针运算：`GetJavaVM` → JavaVM+0x8 探 Runtime → 扫成员找 ClassLinker → 找表头遍历计数；三特征防误命中（vtable 落 libart 区间、双向闭环、节点数合理）。
- **Android 16 两大坑**：TBI+堆指针标签污染一切整数比较（比较前 `p & 0x00FFFFFFFFFFFFFF` 规范化）；mincore 对 app 进程返回失败（换解析 `/proc/self/maps` 自建区间表，syscall 直读，段上限 8192）。
- 阈值两点定（干净/注入各测 3 次取余量）；定位失败返回 -1 fail-safe 绝不误报。多 ClassLoader 宿主（微信/手淘级）baseline 会与注入态重叠，须按宿主重测。

---

## 10. Frida 痕迹两层模型与魔改升级路径

**来源**: 网易云易盾、招商银行、魔改 Frida 对抗实测

### 痕迹两层模型

- **注入层**（memfd/ptrace/线程名/模块名/端口）与**运行时插桩层**（蹦床/ART 入口篡改/gum 引擎内存）。实测存在只认第二层的检测——裸 agent 能活、一装 Java hook 就死。识别对手认哪层，可选最小侵入方式（如只 hook 非安全库的 Native 函数）。
- 端口是独立致死点：实测字符串全 patch 仍占 27042 照样死；改端口 `-l 0.0.0.0:非标` + `-H` 连接。

### 魔改四项目对比（截至 2026-09）

| 项目 | 特点 | 适用 |
|---|---|---|
| Florida | strongR 超集 + 线程池前缀/memfd 名/anti-anti 脚本；CI 跟版 | 默认首选；短板：端口不动、rodata 明文 |
| rusda | XOR 运行时解码（编译期密文栈上短暂展开）+ rodata 字节倒序 | 专治动态内存扫描派（Nesec/libpoison/腾讯 TP 类） |
| strongR | 8 处经典 patch（rpc magic/DBus/agent 名/线程名等长替换） | 基线 |
| fridare | Go 工具 GUI，等长替换 | 深度要求不高时 |

升级判据：hook `System.exit` + `_exit/exit/abort/kill` 抓栈——栈顶"模块+偏移"→直接 IDA 字节 patch 不必魔改；栈顶"匿名地址+JNI trampoline"→动态解密在匿名段，升魔改。**每升一级前先真机复现崩溃确定死因**；够用就停；硬件 attestation/VMP/纯 native 动态解密场景切 Unidbg/Unicorn 比硬碰硬划算。

### 三路线优先级

环境伪装（hook 检测 API 改输入，App 真实判定 clean）> UI 兜底（挡弹窗，内部仍判 risk、服务端风控照收）> 粗暴 patch（检测函数返 0，服务器可从上报感知）。绕过必须同步拦上报通道并用抓包验证（Toast 消失≠绕过）。

---

## 11. Root 检测完备入口清单

**来源**: 酷狗、招商银行 RootBeer/DEC 等实测

### 四维入口矩阵（易漏点标注）

- 文件：`File.exists/canExecute/canRead` **三件套全挂**（漏 canExecute 会漏 `exists()&&canExecute()` 组合）；路径用 endsWith/indexOf 通配（`System.getenv("PATH")` 命中 `/system_ext/bin/su` 类 Magisk systemless 位置，固定清单挡不住）。
- Shell：`Runtime.exec` 全重载，**数组形式查任一元素**（RootBeer `exec(new String[]{"which","su"})` 只查 cmds[0] 会漏）；替换成 `exec("echo")` 而非返 null（防 NPE）。
- 属性：`SystemProperties.get` 双 overload + `Build.TAGS/TYPE`；verified boot 三件套 `ro.boot.verifiedbootstate/flash.locked/veritymode` 金融 SDK 常查。
- 包名：`getPackageInfo`×2（含 API 33 PackageInfoFlags 重载）+ `getInstalledPackages`×2 + `getInstalledApplications`×2 共 6 入口。
- Native：`access/faccessat`、`stat/lstat/stat64/fstatat`、`open/openat`、**`fopen`**（RootBeer native 用 fopen，朴素只挂 stat 系会漏）；`*at` 系 path 在 args[1]。

### 三个高阶陷阱

1. **ART AOT inline**：small-private-static 检测方法 hook 装上没报错但零事件——给持有它的方法挂 no-op hook 触发 deopt 复活。
2. **svc 0 直调 syscall** 绕过整个 libc hook：r2 搜 `svc #0` 命中数十处且围绕 root 路径字符串即判；破法 Stalker 指令级。
3. **输出口四步法**（SDK 混淆不可读时）：定位边界类（包名前缀）→ 找返回 boolean/int 的输出方法 → Find Usage 确认期望值 → 一行 hook 返回安全值。Root 侧隐藏（DenyList/Shamiko）先配齐再处理残留，顺序反了会写一堆无效脚本。

---

## 12. 签名校验五档光谱

**来源**: QQ 音乐（3 档）、小红书（4 档）、网易云（5 档）实测

| 档 | 形态 | 要点 |
|---|---|---|
| 1 | Java 直调 getPackageInfo | `Signature.$new(ORIG)` 替换 signatures 数组 + 反射改 `signingInfo→mSigningDetails→mSignages`；**Android 9+ 主流走 GET_SIGNING_CERTIFICATES，不覆盖 signingInfo 会"装了不生效"** |
| 2 | 反射+常量加密 | 最终仍 dispatch 到系统方法，同上 |
| 3 | native JNI 校验 + 服务端 gate | spawn 拦启动期 `toByteArray`（App 读一次就缓存，attach 一次都不 fire）；判据是业务数据能否渲染，非 `code:0` |
| 4 | Java+Native 双链路交叉 | 按链路逐条拆（bytehook 全 signal + pread 直读 signing block 类） |
| 5 | 加固壳分层触发 | 双链路互不通信各自杀，只打一条另一条独立触发 |

两条比档位更实用的分界线：**是否主动自杀**（不自杀可反复调；自杀型反馈周期恶化到从头再来）；**签名读取物理层**（下沉 native 的 Java hook 原理上拦不到）。CheckJNI 陷阱：不能全局 hook `Signature.toByteArray` 返原版——Java 层返原版而 native 经 CheckJNI 读到重签，两次不一致直接 abort。**最稳绕法是不碰它（不重签）**：ZygiskFrida 注原版，签名仍是原版。cert 提取：`META-INF/*.RSA` → `openssl pkcs7 -inform DER -print_certs` → DER → base64（Java byte 需 `>127?b-256`）。

---

## 13. 企业壳分层击杀与配盾

**来源**: 20 App 八厂商横评（OPPO Android 12，官方 frida 17.6.2 vs 魔改 nl9；通过率 11/20 vs 20/20，样本内数据）

### 信号 → 杀手层归因

| 信号 | 归因 | 对策 |
|---|---|---|
| attach 直接失败 | ptrace 通道被占（self-ptrace 矩阵+EXITKILL） | seccomp **TSYNC** 封 kill/tgkill/tkill 及 exit_group 的 sig∈{6,9,15}；TSYNC 不带则 filter 只绑安装线程 |
| 桥加载瞬间死 | .init_array 构造器杀手 | 延迟注入（delay-4s）避开启动自检冻结窗 |
| +30s 左右死 | 热函数 GOT/代码页篡改检测 | surgeon 贴片：RETAA（0xD65F0BFF，PAC 帧必须带认证 ret），20ms 轮询重贴，页非零门控防误写 |
| 会话结束 0.3-5s 死 | 收尾杀手（rt_tgsigqueueinfo 伪装 JNIEnv FatalError） | 信号过滤 + detach 后 `am force-stop`（AMS 外杀不受 exit_group 封锁影响） |
| 重 Java hook 崩 | 时序型检测（SIGALRM 看门狗，开销敏感） | 轻量探针 + 延迟 ≥30s 装 hook |
| 方法级虚拟化 | dexvmp 多方法共享不可拦入口 | 放弃 hook 该类，**hook 面下沉框架层**（okhttp/javax.crypto 照常生效）；`deoptimizeEverything` 触发反篡改秒杀，禁用 |

### 工程纪律

- **谱系选主唯一可靠判据：PPID==zygote64 且 NAME==包名**（严禁 pidof 首列——壳子进程 stub、`:tools` 孪生、ppid=1 看门狗都伪装）。
- 注入线程挑 Binder/hwuiTask/pool- 工作线程，避开主线程（≥1.5s 冻结判死线）；attach 前轮询 `/proc/<pid>/attr/current` 等 SELinux 特化。
- 脱壳补充：被动 hook（DefineClass）+ 主动 enumerate（`DexFile.mCookie`）必须同时；dump 产物按**内容签名去重**（OAT 合并区重复 dump 会虚增产量）；dex 写 `/data/data/<pkg>/cache` 避开分区存储限制。

---

## 14. Unidbg 确定性固定

**来源**: Unidbg 系列实测

### 分析方法论

固定随机发生在**补环境之前**（否则永远无法验证正确性）。四类随机源四个位置：

| 层 | 固定位置 | 要点 |
|---|---|---|
| JNI | AbstractJni | `callXxxMethod` 与 **`callXxxMethodV` 两个都拦**（漏 V 版占"仍不确定"多数）；`SecureRandom.nextBytes` 整体填充缓冲；与 /dev/urandom IOResolver 双保险 |
| 库函数 | HookZz/xHook | time 返回 `HookStatus.LR(emulator, 固定值)` |
| syscall | SyscallHandler | clock_gettime 分 clk_id：REALTIME 固定、**MONOTONIC 必须递增**（否则触发超时检测）、BOOTTIME 固定；getrandom 填常量 |
| 文件 | IOResolver | 固定 /dev/urandom、/proc/uptime |

- **srand/rand 决策树**：`srand(time(NULL))`→只拦 srand 不拦 rand（保持 PRNG 状态机一致）；`srand(常量)`→都不拦；只 rand 不 srand→不拦；arc4random→必须拦（内部走 /dev/urandom）。
- 固定值避开 0（XOR 吸收元/乘法归零），用 1700000000/42/0x42424242 类"非零非魔数"。
- **vDSO 陷阱**：ARM64 上 gettimeofday/clock_gettime 走 vDSO 不触发 SVC，SyscallHandler 进不去，必须 libc 层再拦（两层都做是防御性补全）。
- 环境指纹冻结且**物理自洽**（充电中→电流正→counter 单调增；乱填本身是指纹）。
- 排查未知随机源：verbose grep "time|random|date" → SyscallHandler 日志 grep NR → IOResolver 打 OPEN → diff 两次 trace（最准）。Frida 与 Unidbg 必须固定同样的项，否则对比无意义。

---

## 15. Unidbg 初始化问题四步定位

**来源**: Unidbg 系列实测（抖音 libmetasec 等）

症状：环境补全、调用无报错，但返回 null 或与真机不一致——Java 层本该执行的 init 链在 Unidbg 不会自动执行（Unidbg 模拟"被加载进 ART 进程后的 SO 视角"，不模拟 ART 自己）。

### 四步定位

1. Frida 直接 Call 目标函数拿**标准答案**（Frida 都调不通先修 Frida）；
2. Frida hook `android_dlopen_ext` + `JNI_OnLoad`，OnLoad 返回后**立即裸调**目标函数——一致则无初始化依赖，不一致确认存在；
3. Frida 枚举 SO 所有导出函数逐个调用后再试调（多数是 1-2 个关键 init，少数是有序链）；
4. IDA 静态确认 init 依赖，Unidbg 补好环境后按序 `callJniMethod` 回放。

要点：`callJNI_OnLoad` **永远要显式调**；`vm.loadLibrary(so, bool)` 第二参数只控制 .init_array/DT_INIT；`newObject(null)` 只造类壳不走构造器/静态块（其中调的 native 要手动补进 init 列表）；init 三分类（安全门卫型返 null / 缓存预热型 NoSuchMethodError / 数据准备型结果"对而不对"）从症状反推。隐蔽变体：初始化在"DEX 加载时本该摆好的类表"（需多层嵌套 resolveClass 预解析继承链）。

---

## 16. Unidbg Trace 与 Console Debugger

**来源**: Unidbg 系列实测

### Trace 三层次与四招

- 层次：函数级看大局 → 指令级缩范围（`traceCode` 输出含模块内偏移直接对 IDA、nzcv 判分支 taken）→ 内存级追数据流（traceRead/traceWrite）。成本判据：只有"输入只改 1 byte、函数体 ≤10 万指令、能限到百字节范围"三条成立才值得全量指令级（否则先函数级圈范围）。Trace 仅 Unicorn/Unicorn2 支持；Dynarmic 快但零可观察性——分析期 Unicorn2、量产期 Dynarmic，切换必须基准对比。
- 四招：① IDA CFG 染色实际执行路径（OLLVM 救命招；两次输入两种颜色分常量/数据依赖路径）；② grep 指纹常量（大小端两套写法；movz/movk 半字拆分搜相邻指令；`6a09e667` 为 SHA-256/512 共享 IV[0]，用 64-bit `bb67ae8584caa73b` 定性 SHA-512）；③ diff 两次最小差异输入的 trace（地址同寄存器异=数据依赖、地址异=分支、单侧有=循环次数差异）；④ 分支 taken 统计（1:1 是循环边界、999:1 异常路径可忽略）。

### Console Debugger 速查

- `c`/`s`/`n`、`b0x1234`（**地址紧贴命令无空格**）、`blr`（lr 处断点秒回调用者）、`m0xaddr [size]`、`mx0/mfp/msp`（看寄存器指向的内存）、`wx0 0`（写寄存器）、`d`（反汇编）、`bt`、`p mov x0,#0`（PC 处 patch）、`vbs`。
- **断点回调返回值反直觉：false=真的断下，true=跳过继续**。
- **在"数据已经被解好"的地方下断点**（如 GetStringUTFChars 返回处）；回调里 `vm.getObject(handle)` 直接拿 Java 对象；改返回值必须在 **ret 指令处**改。
- 断点选择四线索：JNI 导出入口、Trace 常量命中反推、IDA xref + 函数大小过滤（50-300 行候选；2 参=对称变换、3 参=key+IV+明文）、bt 迭代精化——6~10 个有理由的断点足够。

---

## 17. Unidbg 算法还原五步与生产化

**来源**: 酷狗 RSA、抖音 TTEncrypt 等实测

### 五步工作流

```
Step 0 长度先验（16B=MD5/AES 单块、20B=SHA-1、32B=SHA-256/SM3、128/256/512B=RSA、
       65B 带 0x04 头=ECC、尾部 12-16B=GCM tag、变长入定长出=hash）——砍掉多数候选
Step 1 先 Trace 不先 F5（IDA 间接跳转可能漏路径，Trace 是真实走过的路）
Step 2 搜指纹常量（含"搜中间值反推"——对魔改特别有效，输出本身就是探针）
Step 3 关键地址三法（常量锚定 / IDA Graph 回边找循环出入口 / Trace 二分）+ 三类 Hook（入口/循环出口/返回）
Step 4 与标准实现逐轮 diff（前几轮对上第 5 轮全错=轮数改变，最常见魔改）
Step 5 Python 重写 + Unidbg 基准验证（≥100 随机输入；确定性系统做基准而非真机）
```

密钥追溯五姿势：硬编码 .rodata / 拼接+hash 派生（hook memcpy 过滤目标写入；字符串顺序与编码是最大坑）/ 标准 KDF / 白盒密码（dump 查表当黑盒）/ JNI 回 Java 或服务器下发（**先确认 key 是否每次启动相同**，决定走派生还原还是协议还原）。同 SDK 多接口先扫算法复用（还原 1 个=解决 N 个）。

### 生产化要点

- **AndroidEmulator 不是线程安全的**：每个并发请求独立实例；对象池（GenericObjectPool）是标准方案；池大小 `min(CPU×2, 内存GB/单实例内存)`；preparePool 预热。
- 异常时 invalidateObject 后**必须把异常引用置 null**，否则 finally 二次 returnObject 把已销毁实例放回池（实测半坏实例累积泄漏 native 内存）。
- `future.cancel(true)` **打不断 native 执行**，立刻 close 有概率 SIGSEGV 整个 JVM；可靠兜底 `registerEmuCountHook(N)` 超限自动 `emu_stop()` 从 native 内部退出。
- JNI 侧 malloc/mmap 的模拟内存**不受 Xmx/MaxDirectMemorySize/NMT 约束**（容器 limit 留 25-30% headroom；pmap/smaps 查泄漏）；镜像别用 Alpine（musl 加载不了 glibc 链接的 libunicorn）。
- 命脉监控：池借出/归还差（实例泄漏）与进程 RSS 持续增长（native 泄漏）。

---

## 18. 跨版本函数定位七级兜底

**来源**: 未导出函数定位实测（Pixel 6 Pro / Android 13，libc.so 上与符号表 ground truth 0 字节误差验证）

### 七级排序（抗变化能力递减）

```
导出符号(高) > 局部符号表 > 字符串交叉引用 > 调用点交叉引用 > 特征码 > 相对锚点 > 硬编码偏移(低)
```

- 局部符号表：`Module.enumerateSymbols()` 查 .symtab（`isGlobal:false` 即未导出），零成本永远先试（strip 后失效）。
- 字符串 xref 三步：扫字符串地址 → 解 `ADRP+ADD`（直接寻址）或 `ADRP+LDR`（GOT 槽）→ PAC/BTI-aware 回溯序言（识别 BTI c/PACIASP/PACIBSP 编码，找到 STP X29,X30 后循环上溯吃掉连续 BTI/PAC）。
- 调用点 xref：动态版最稳——hook 导入函数读 `this.returnAddress` 按模块地址范围过滤回溯；纯算法函数无字符串时用"唯一调用 AES_set_encrypt_key 的那个函数"这类唯一性锚。
- 特征码规则：凡带相对偏移/绝对地址的指令（BL/B/ADRP/LDR literal）**整条 4 字节通配**，STP/MOV/ADD #imm 保留；只扫 `enumerateRanges("r-x")`。
- 工程化：`resolveFunction(moduleName, clues)` 按 symbol→string→callsImport→pattern→anchor→offset 逐级兜底并报告命中方式。一次性分析用偏移最快，长期脚本从第一天给线索。

---

## 19. SO Dump 四窗口与验证闭环

**来源**: 加固 SO 内存取证实测（libnesec 磁盘密文等）

### dump 时机四窗口

1. 无加固：任意时刻；2. **有加固：JNI_OnLoad 返回（onLeave）**——dlopen 返回立刻 dump 太早、进入时太晚，返回那一刻是 .text 最稳定明文窗口；3. 边执行边解密：写入断点抓解密例程（`Memory.protect(.text,'---')` + `setExceptionHandler` 按 .text 范围过滤异常，PC 即解密入口）；4. Anti-Dump 自毁：监控 mprotect 赶在擦除前（判 `(prot & 1) === 0` 丢读权限，勿用 `(prot & 4) === 0`——在 [rw-] 上误报率高）。

### 不变式与验证

- dump 前 `Memory.protect(base, size, 'rwx')` 强制可读（加固常把 .text 改 `--x`）。
- ELF 修复用 SoFixer（`-s 源 -o 输出 -m 基地址 -d`）；兜底清零 e_shoff/e_shnum/e_shstrndx 走 Program Header 路径。
- **IDA 七步验证**：Manual load、Loading address 填 0、至少 LOAD/.text/.dynamic 三段、Strings 正常（全乱码=二次解密未完成，回 JNI_OnLoad onLeave 重抓）、Exports 有 JNI_OnLoad、**F5 伪代码含可读字符串引用**、xref 可跳。最强验证：拿 dump 推导偏移回运行中 App frida-trace 触发对拍。
- 运行时解密 SO（磁盘密文/section 伪装）：先让进程活过校验再 dump 完整镜像，offset=vaddr 直接喂 IDA/r2；Android 10+ 禁 findModuleByAddress(dlopen 返回值)（句柄加密混淆，按名字找）。

---

## 20. Stalker 三红线与六落点

**来源**: Stalker 指令级追踪实测

### 三条安全红线

1. **exclusive 序列（ldxr/stxr 原子操作）间插桩会清 exclusive monitor 导致死循环**——transform 里必须检查 `iterator.memoryAccess === 'open'`；
2. unfollow 前 `flush`；之后**等 50ms 再 garbageCollect**（立即释放→SIGSEGV 竞态）；
3. 必排 libc/linker64/libart/frida-agent（激进策略只留目标 SO）；不跟踪主线程（ANR）。

### 六应用落点

compile 事件导 drcov 给 Lighthouse 覆盖率着色；call+ret 还原调用链（含 BLR 间接调用真实目标）；hook ALU 指令（eor/ror/lsl）记寄存器推 XOR 密钥；hook 条件跳转看 NZCV（识别 `cmp #0x69a2`=frida 端口并 putCallout 改寄存器）；CModule 把 transform 下沉 C 层提速；Python 端批量分析（JS 攒 batch=1000 再 send）。性能挡位：稳态 1.5-2x / compile 3-5x / call+ret 10-15x / transform 30-50x / **exec 全开 80-100x（最后手段）**。

---

## 21. JNIEnv vtable 槽位兜底与解绑重注册

**来源**: JNI 函数追踪实测（QQ 音乐 spawn 30 秒截 7 次 RegisterNatives / 94 方法验证）

- JNIEnv 是 230+ 函数指针的 vtable，布局由 JNI 规范强制、索引跨版本不变——**符号 strip 也能按槽位定位**。关键索引：RegisterNatives=**215**、UnregisterNatives=**216**、FindClass=6、GetMethodID=33。vtable 兜底：`Java.vm.getEnv().handle.readPointer().add(215 * Process.pointerSize).readPointer()`。
- 定位 RegisterNatives 双路径：libart 符号表（名含 RegisterNatives 且**剔除 CheckJNI 包装版**）→ vtable 兜底。`JNINativeMethod[]` 三指针连排（name/signature/fnPtr），步长 `3*pointerSize`，`findModuleByAddress(fnPtr)` 得"SO+偏移"直接 IDA 跳。
- **hook 触发一次后 Java 调 native 无反应 = App 用 UnregisterNatives(216) 解绑重注册的反检测套路**——把 216 一并 hook。
- 反向追踪按代价递增：FindClass 摸地图（可全程开）→ GetMethodID 拿菜单（过滤类名）→ 只对感兴趣 methodID 开 Call*Method（必须 backtrace 过滤）。

---

## 22. 对抗归因方法论与对拍验证文化

**来源**: 网易云/招行/QQ 音乐/加固横评等案例的元方法沉淀

### 归因五法

1. **先画战场**：大厂防护是多库并联（叠罗汉），最大坑是把多个独立机制误当一个；多套 SDK 互不通信——只打一条另一条独立触发。
2. **单变量实验**：一次只改一个变量；"能证伪自己的假设比能提出假设更重要"（经典被证伪：自校验假设、运行期凶手假设、活动量假设、maps-scan 假设）。
3. **能力排除法**（对手不可观测时）：对手 inline svc 绕 libc / store 损坏内存无 syscall，靠"谁有该能力"倒排嫌疑人；退出诊断表映射层：`Process terminated` 但 pidof 在→agent 被损坏；干净 terminated 且 libc hook 零命中→inline-svc exit；SIGSEGV in 构造函数→自爆；SIGSEGV PC=memfd agent→内存被损坏。
4. **减法诊断**：patch 越多越难定位——从全套往外拆，**拆掉哪个反而活得更久哪个就是破坏源**（如 setExceptionHandler 全局屏蔽毁掉 ART 隐式 null check）；STAGE 编号二分定位。
5. **对照基线**：流传结论补同机同原版对照实验就可能翻车；设备可能处于壳持久化标记的退化态（pm clear 清不掉，reboot 恢复）；**测试协议参数本身是被测变量**（注入延迟落进自检冻结窗会造成假检出）；环境残留（helper 孤儿进程、staged 文件）是头号假检出源。

### 对拍验证文化

- 逐字节一致是唯一硬证据；"没报错""看起来像 JSON"从来不是通过标准。
- 静态定位的入口必须动态验证调用真的发生（实测案例：静态搜到的 PostData 是幌子，真实路径是 makeRequestParam）。
- 验收以 UI/业务为准（mCurrentFocus + 截图）；服务端 `code:0` 只是格式合法，业务数据能否渲染才是判据。

---

## 引用索引

| 技术 | 适用 playbook | 引用方式 |
|------|-------------|---------|
| 算法自吐工作模式 | crypto-protocol | 新增实战补充节 |
| Native 加密自吐 | crypto-protocol | 新增实战补充节 |
| RSA 与混合加密提取 | crypto-protocol | 新增实战补充节 |
| 国密还原要点 | crypto-protocol | 新增实战补充节 |
| 密钥溯源与复现排错 | crypto-protocol | 新增实战补充节 |
| Protobuf/gRPC 深化 | crypto-protocol | 新增实战补充节 |
| SSL 层明文抓包 | native-network | 新增实战补充节 |
| libttboringssl 与 LSPosed 插件化 | native-network、hook-injection | 新增实战补充节（后者为完整版） |
| ClassLoader 计数 | anti-emulator-debug | 新增实战补充节 |
| Frida 痕迹两层模型与魔改 | anti-frida | 新增实战补充节 |
| Root 入口完备清单 | anti-root | 新增实战补充节 |
| 签名校验五档光谱 | integrity-pinning | 新增实战补充节 |
| 企业壳分层击杀与配盾 | unpack-tool-matrix、anti-frida、dex-loader | 新增实战补充节 |
| Unidbg 确定性固定 | unidbg-simulation | 新增实战补充节 |
| Unidbg 初始化四步定位 | unidbg-simulation | 新增实战补充节 |
| Unidbg Trace/Debugger | unidbg-simulation | 新增实战补充节 |
| Unidbg 算法还原与生产化 | unidbg-simulation | 新增实战补充节 |
| 跨版本定位七级兜底 | frida-native | 新增实战补充节 |
| SO dump 四窗口验证 | native-so | 新增实战补充节 |
| Stalker 三红线 | trace-analysis | 新增实战补充节 |
| JNIEnv vtable 槽位 | jni-bridge | 新增实战补充节 |
| 对抗归因与对拍文化 | a6-a7-failure-pattern-cookbook、frida-java | 新增 FP 模式与排错补充 |
