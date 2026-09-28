# Integrity And Pinning Playbook

这是 `protection-bypass` 路线中处理 `integrity / pinning` 的主手册。
`root` 与 `frida` 子面仍分别参考：

- `references/anti-root-playbook.md`
- `references/anti-frida-playbook.md`

## 先做子面裁定

只对用户目标涉及且已有证据的子面说明观察、影响与未测范围；不强制填写状态枚举或补全所有子面。相关性可从以下范围判断：

- `root`
- `frida`
- `integrity`
- `pinning`

涉及 `integrity` 与 `pinning` 时，按相关性说明（未知项直说未知）：

- 是本地校验、远端校验，还是两者组合
- 触发时机在启动期、登录后、敏感功能点击后还是发包前
- 返回值需要伪造真值、缓存值、空值还是旁路整个调用链

## 常见命中点

### Integrity

- Play Integrity API
- SafetyNet
- `Signature.verify`
- `PackageManager.getPackageInfo`
- `getSigningInfo`
- 包签名、自校验、DEX / SO hash 校验
- 设备状态、安装来源、调试状态、模拟器状态的组合判定

### Pinning

- `TrustManager`
- `HostnameVerifier`
- `CertificatePinner`
- `network_security_config`
- WebView 自定义证书校验
- Cronet / BoringSSL / Native pinning

## 作业顺序

1. 先定触发窗口
   记录是在 `Application / ContentProvider` 启动早期、首页初始化、登录态恢复、功能点击还是网络请求前触发。
2. 先分本地失败还是远端拒绝
   如果本地已经崩溃、toast、闪退或功能按钮灰化，优先看本地校验。
   如果本地通过但服务端返回 `device risk / integrity failed / cert rejected`，优先看令牌或网络栈。
3. 先找聚合判定点
   不要一上来散点 hook。
   优先找“最终布尔结论”“错误码分发”“是否继续发包”的汇合点。
4. 再拆到子校验
   只有聚合点信息不足时，才继续下钻到签名比对、证书链校验、令牌组装或 Native verify callback。

## Integrity 专项 SOP

### 1. 识别校验类型

- 本地签名 / 包信息校验
- 本地设备状态校验
- 调 Google / 厂商服务拿 attestation token
- 本地取 token，服务端判 token

### 2. 先抓边界，再决定伪造点

至少明确：

- token / verdict 在哪里生成
- verdict 在哪里第一次被消费
- 失败后阻断的是 UI、业务流程还是网络请求

### 3. 常用切入点

- Java 层：
  `PackageManager`、`SigningInfo`、`MessageDigest`、`Signature.verify`
- GMS / 三方 SDK 封装层：
  token provider、task callback、result parser
- Native 层：
  自校验 hash、签名摘要、环境特征聚合函数

### 4. 判定伪造策略

- `返回真值`：
  适合最终布尔或枚举结论点稳定的场景
- `返回缓存值`：
  适合 app 对字段结构和签名格式校验较严的场景
- `旁路上游调用链`：
  适合 token 请求容易触发二次风控或耗时明显的场景

### 5. 常见分歧

- 本地 hook 通过但服务端仍拒绝：
  检查是否还有第二条网络上报链或 Native token 组装链
- 替换布尔值后 app 继续崩：
  说明后续还校验对象字段、时间窗或 token 完整性
- 只在冷启动命中：
  需要更早注入，优先 `spawn` 或前置类加载点

## Pinning 专项 SOP

### 1. 先分层

必须明确 pinning 在：

- Java 层
- `JNI` 过渡层
- 纯 Native TLS 层

### 2. Java 层优先检查

- `CertificatePinner`
- `TrustManager` / `HostnameVerifier`
- 自定义证书摘要、公钥 hash、SPKI 比对
- WebView 客户端回调

### 3. Java 未命中时立即转 Native 栈

重点检查：

- Cronet builder 与 callback
- `SSL_CTX_set_custom_verify`
- `SSL_set_custom_verify`
- `X509_verify_cert`
- pinset 载入点、公钥摘要表、证书 DER 常量

### 4. 绕过策略选择

- Java hook：
  适合 OkHttp / Retrofit / 普通 WebView
- Native hook：
  适合 Cronet / BoringSSL / 自定义 TLS
- 静态 patch：
  适合回调稳定、运行时注入窗口极窄或多进程早期校验

## 常见错误

- 只看到 `TrustManager` 未命中，就下“没有 pinning”结论
- 只 patch 单个异常分支，就宣称完整绕过
- 不区分本地 verdict 与服务端 verdict
- 不记录失败样本，导致后续无法判断是否还有第二层校验

## 按目标总结与保留资产

- 仅在实际产生且需要时保留相关脚本；`run/integrity-bypass.js`、`run/cert-pinning-bypass.js` 是命名例，不要求同时创建。
- report 按相关性说明触发点、已观察层面、实际处理与残留问题；未执行或受阻可直接汇报，不为交付而新增操作。


## 实战补充：签名校验五档光谱（2026-09）

> 来源：`references/technique-extract-2026-09.md` 第 12 节；实测样本：QQ 音乐（3 档）、小红书（4 档）、网易云（5 档）。

| 档 | 形态 | 要点 |
|---|---|---|
| 1 | Java 直调 `getPackageInfo` | `Signature.$new(ORIG)` 替换 signatures 数组 + 反射改 `signingInfo → mSigningDetails → mSignatures`；**Android 9+ 主流走 GET_SIGNING_CERTIFICATES，不覆盖 signingInfo 会"装了不生效"**；`SigningInfo.getApkContentsSigners/getSigningCertificateHistory` 兜底 |
| 2 | 反射 + 常量加密 | 最终仍 dispatch 到系统方法，同档 1 打法 |
| 3 | native JNI 校验 + 服务端 gate | spawn 拦启动期 `toByteArray`（App 读一次就缓存，attach 一次都不触发）；判据是业务数据能否渲染，服务端 `code:0` 只是上报格式合法 |
| 4 | Java+Native 双链路交叉 | 按链路逐条拆（如 bytehook 全 signal + `pread` 直读 signing block） |
| 5 | 加固壳分层触发 | 双链路互不通信各自杀——只打一条另一条独立触发；按层拆解见 `references/unpack-tool-matrix.md` 实战补充 |

两条比档位更实用的分界线：**是否主动自杀**（不自杀可反复调试；自杀型反馈周期恶化到每次从头再来）；**签名读取的物理层**（下沉 native 的 Java hook 原理上拦不到）。

- CheckJNI 陷阱：不能全局 hook `Signature.toByteArray` 返原版——Java 层返原版而 native 经 CheckJNI 读到重签，两次不一致直接 abort。
- **最稳绕法是不碰它（不重签）**：ZygiskFrida 在 Zygote fork 极早期注入原版 App，签名仍是原版——校验失去意义。
- cert 提取：`META-INF/*.RSA` → `openssl pkcs7 -inform DER -print_certs` → `openssl x509 -outform DER` → base64 嵌脚本（Java byte 需 `>127 ? b-256` 转有符号）。
