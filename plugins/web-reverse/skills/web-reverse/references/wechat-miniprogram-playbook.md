<!-- publish: framework -->
# WeChat Mini Program Reverse Playbook（微信小程序逆向深挖）

微信小程序 = 「受控 JS 运行时 + 平台包格式 + 平台 API 面」的前端逆向目标。本 playbook 是 `miniapp` 专题的微信侧深挖：样本获取 → 解密解包 → 包结构解读 → 运行时/动态调试 → 抓包 → **签名实战模式库** → 登录边界 → 复现验收。跨平台矩阵与总纲分流见 `miniapp-playbook.md`。

**证据基线**：标注【实测】的条目来自 16 个真实小程序逆向任务的全流程产物；标注【社区】的来自 2024–2026 公开资料（时效见 §11）。任务代号对照：

| 代号 | 目标 | 关键贡献 |
|---|---|---|
| 停宜慧（×7） | 停车缴费小程序 | §6.2/§6.3 双签名体系、密钥自举、伴随头拆层 |
| gkdg（×3） | 工控电工题库 | §6.6 会员墙遮罩、沙箱三态、无鉴权边界 diff |
| dkduanju | 杜仲短剧 | §6.5 mmtls 盲区与缓存式脱机 |
| hqc / fengniao（×2） | 企业查询（惠企查/风鸟） | §6.1 头上下文门控 |
| 蜜雪 | 蜜雪冰城 | §6.4 怪癖摘要 |
| 天蚕 / 油价 | 小说 / 油价查询 | §3.4 微擎零鉴权梯队 |

**边界**：小程序 JS/包格式/接口层归本 skill；微信客户端本体、APK/native so、mmtls 协议本体归 `android-reverse` / `win-reverse`。

---

## 1. 样本获取（Observe：先拿到 wxapkg）

### 1.1 PC 端微信（首选，最稳）【实测 ×16】

先在 PC 微信里打开目标小程序（产生缓存），再按 appid 定位：

| 微信版本 | 缓存根 | 说明 |
|---|---|---|
| 4.x（xwechat/radium） | `%APPDATA%\Tencent\xwechat\radium\users\<用户hash>\applet\packages\<appid>\<版本号>\` | 主包 `__APP__.wxapkg`，分包为同目录其他 `.wxapkg` 文件；更早的 RadiumWMPF 旧布局无 `users\<hash>` 与版本号层（`...\applet\packages\<appid>\`），找不到就按 appid 全盘搜 |
| 3.x（WeChat Files） | `文档\WeChat Files\Applet\<appid>\` 或 `%APPDATA%\Tencent\WeChat\XPlugin\...` | 老布局，同样按 appid 归档 |

- `<用户hash>` 是用户目录 hash id；不确定就搜：PowerShell `Get-ChildItem "$env:APPDATA\Tencent\xwechat" -Recurse -Directory -Filter "<appid>"` 或全盘 `dir /s /b *<appid>*`
- 版本号子目录可能多个，取最新 mtime；`local\<appid>\` 下有用户数据（storage 残留，偶尔有 token 级线索）
- PC 端包**带 V1MMWX 加密层**（见 §2）；`wx…` 形态的 appid 即目录名，同时是解密密钥派生源
- **appid 发现渠道**：wx-mp `mp_list_apps` 枚举本机缓存（按最近使用排序锁定目标）【实测】；分享链接/小程序卡片解析、应用市场详情页等【社区】
- **原样保留纪律**【实测】：加密原包复制进 `run/` 并记 SHA-256，一切解密/解包在副本上进行，回滚说明 = 删 run/ 即可

### 1.2 Android 端

- 路径：`/data/data/com.tencent.mm/MicroMsg/<用户hash>/appbrand/pkg/` 下的 `*.wxapkg`
- **Android 端 wxapkg 不带 V1MMWX 加密层**（直接是标准 wxapkg），root / `adb backup` / 应用分身目录均可提取【社区】
- 优先级建议：PC 加密包 + 自己解密（可复现、可入 report）≥ Android 明文包（省一步但拿样本门槛高）

### 1.3 分包与插件

- 主包 `__APP__.wxapkg` 只含首屏代码；业务页面常在分包（`app.json` 的 `subPackages` 字段列出所有分包 root 与 pages）
- 插件（`plugins/`）：独立包，引入方通过 `requirePlugin` 使用；**官方能力插件**（如短剧插件）的播放/支付走微信原生通道（mmtls），JS 层不可见——命中时走 §6.5 降级交付
- **先解主包 → 读 app-config.json 的 subPackages 清单 → 再定位/解密对应分包**（同一 appid 派生密钥，主/分/插件包通用），不要开局全量抓

---

## 2. 解密与解包（V1MMWX → 标准 wxapkg → 工程目录）

### 2.1 V1MMWX 加密层（PC 端）——算法（已逐字节标定）【实测】

PC 端包首 6 字节为 `V1MMWX` 即命中。算法（与 KillWxapkg 输出**逐字节一致**的复现已验证；wx-mp-mcp 的 decrypt/repack/batch-unpack 三处实现均同）：

- `key = PBKDF2-HMAC-SHA1(password=appid, salt="saltiest", iter=1000, dklen=32)`
- `iv = b"the iv: 16 bytes"`（固定 ASCII）
- `[6, 1030)` 共 1024 字节：AES-256-CBC 解密（`setAutoPadding(false)`），**明文取前 1023 字节**（第 1024 字节是 PKCS#7 pad）
- `[1030, EOF)`：逐字节 XOR，**单字节密钥 = appid 倒数第二个字符的 charCode**（`appid.charCodeAt(appid.length - 2)`）
- 输出 = 标准 wxapkg（首字节 `0xBE`）

> ⚠️ 勘误：旧版社区资料与本文件早期版本写作「appid **最后**一个字符」——实测逐字节比对证伪，正确是**倒数第二**个字符（例：`wx66…09` 的 key 是 `'0'`=0x30 不是 `'9'`=0x39）。2026 无公开的 v2/代际更替证据；微信 4.x 的变化在**缓存路径**而非算法【社区+实测】。

Node 复现（可直接进 `run/`，与工具输出逐字节互证）：

```js
const crypto = require("crypto"), fs = require("fs");
function decryptV1MMWX(buf, appid) {
  if (buf.subarray(0, 6).toString() !== "V1MMWX") return buf; // 安卓明文包：原样
  const key = crypto.pbkdf2Sync(appid, "saltiest", 1000, 32, "sha1");
  const d = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from("the iv: 16 bytes"));
  d.setAutoPadding(false);
  const head = Buffer.concat([d.update(buf.subarray(6, 1030)), d.final()]).subarray(0, 1023);
  const xk = appid.charCodeAt(appid.length - 2);
  const tail = Buffer.from(buf.subarray(1030));
  for (let i = 0; i < tail.length; i++) tail[i] ^= xk;
  return Buffer.concat([head, tail]);
}
```

### 2.2 标准 wxapkg 容器格式

解密后/安卓原生包的结构（自实现 unpacker 或读懂工具输出都要用）：

```
0x00  1B   magic 0xBE
0x01  4B   version/info1（常见 0x00000000）
0x05  4B   indexInfoLength（索引区长度）
0x09  4B   bodyInfoLength（文件区长度）
0x0D  4B   lastMatch（0x00000000 结尾标记）
0x11  4B   fileCount
之后 fileCount 条索引：4B nameLen + name(utf8) + 4B offset + 4B size
索引区结束 = 文件体起点，offset 均为绝对偏移
```

### 2.3 工具矩阵（按用途选，不要全装）

| 工具 | 定位 | 何时用 |
|---|---|---|
| wx-mp MCP（本环境 `mcp__wx-mp__*`）【实测】 | **在线实时第一入口**：`mp_list_apps` 列缓存 → `mp_decrypt`/`mp_analyze` 解密+解包+crypto 扫描+端点抽取 → `mp_sandbox_run` 离线跑 bundle → `mp_capture_*` mitmproxy 封装 | agent 环境下默认首选，零外部依赖 |
| [KillWxapkg](https://github.com/Ackites/KillWxapkg) | 解密+解包+**还原工程目录**一站式 CLI：`killwxapkg -id <appid> -restore -pretty -sensitive -save`【实测】 | 样本已在手、要可读工程；注意同名 fork/镜像众多，认准上游 |
| unveilr | 跨平台解包（微信/支付宝/QQ/百度/头条系）【社区 2025 活跃；同名 fork 多，认准上游】 | 非微信平台、KillWxapkg 还原质量不够时 |
| wxappUnpacker | 老牌解包+`.wxss/.wxml/.wxs` 还原（原仓已删，fork 众多） | 兼容旧包格式；对新编译产物适配滞后 |
| wxapkg repack（wx-mp 包内脚本 `wxapkg-repack.mjs`，非 MCP 工具） | V1MMWX **再加密** + 0xBE 重打包（对称逆操作） | 改包回灌场景（授权测试） |
| pc_wxapkg_decrypt 系列 | 仅解密 V1MMWX 层 | 只要容器、不还原源码时（最小依赖） |
| takeWxapkg【社区】 | 解包后敏感信息（密钥/接口/appid）提取 | 安全评估批量扫描 |
| mitmproxy | PC 端小程序走系统代理 | 网络取证（见 §5） |

**验收口径**：解密正确性 = 自写复现与工具输出**逐字节一致**（对照 SHA-256）；还原正确性 = 还原工程能被微信开发者工具「导入项目」打开（最强判据）或 `app-config.json` 可解析。

---

## 3. 包结构解读（还原产物 → 攻击面地图）

解包后（未还原工程形态）典型文件：

| 文件 | 内容 | 逆向价值 |
|---|---|---|
| `app-service.js` | **全部逻辑层 JS 合并**（app.js + 所有 page js + utils），常为 webpack `define()` 单行压缩 bundle（实测 1.7–4MB 单行） | 最高：API 端点、签名逻辑全在这 |
| `app-config.json` | app.json 编译产物 | 页面清单、分包清单、tabBar、window 配置 |
| `page-frame.html` / `*.wxss` | 渲染层编译产物 | 低（除非要还原 UI 逻辑） |
| `*.wxml` → 编译为 js 函数 | 模板编译产物 | 中（还原视图层逻辑/隐藏功能入口） |
| 分包/插件 `*.wxapkg` | 独立解包（子包有自己的 app-service.js） | 按 `subPackages` 清单逐个处理 |

### 3.1 先 grep 后读（端点与加密面两张清单）

- 端点面：`wx\.request|url:|https?://|request\(`；小包（<200 JS）全局 grep `https?://` 一次命中全部网络面【实测】
- 加密面：`sign|token|encrypt|md5|sha256|aes|rsa|CryptoJS|jsrsasign`
- **入口锚点**：签名函数入口=请求封装函数（`globalRequest(`/`cbRequest`/`zwRequest`/`o(endpoint,...)` 形态）；签名 header 名（`sign`/`OP-Authorization`/`X-Sign`）grep 命中即定位【实测】
- `__wxAppCode__` 持有页面注册表；`App({...})`/`Page({...})` 是官方包装，入口在回调（`onLoad`/`onShow`/`onLaunch` 常含初始化加密参数/密钥拉取）

### 3.2 单行压缩 bundle 的阅读术【实测】

数 MB 单行的 `app-service.js` 会让 read 工具截断、让肉眼迷路，标准应对：

1. **模块切片**：以 `define("<模块路径>"` 为起始 marker、`\t});` 为行收尾，用 20 行 node 脚本把目标模块切成独立文件（实测产物 `extract-modules.cjs`）——比全文格式化更精准
2. **大段截读**：目标行号已知时，按固定宽度把该行切成 chunk 文件（`@@OFF <n>` 分段标注），逐段读
3. **grep 行号锚点**：单行文件里 grep 命中即行号，配合切片定点精读
4. **不要**对 4MB 单行文件直接格式化全文——噪音淹没目标

### 3.3 uni-app / 框架产物特征【实测】

- **自动报告的"API 列表"不可信**：wx-mp `mp_analyze` 抽取的 apis 在 uni-app 产物里常是**页面路由**而非后端端点；正确姿势是 regex 直挖 bundle 里的请求封装调用（如 `globalRequest("path","METHOD")`，一次可提取 200+ 真实端点）
- **配置常量位置**：`globalData`（app.js）里的硬编码 id/密钥候选；环境表 `config`（`[dev,test,uat,prod,...][i]` 下标选环境）；版本头常量集中在 `app-config` / `device-adaptation` 类模块（包内模块路径，非本仓文件）
- **容器形状陷阱**：远端下发的 `config` 字段可能是「JSON 字符串内的 `[{key,value}]` 数组」而非对象——先对照 JS 消费代码（`find` 逻辑）再写解析【实测踩坑】
- **形似会话态的参数先查硬编码**：如 `globalData.id = 2` 常量直接旁路，避免误引入 wx.login 依赖【实测】
- **方法误判**：静态扫描长单行易把 POST 接口误判 GET（服务端回 `1009 method not supported` 类错误码）；以源码 `method:` 字段为准【实测】

### 3.4 后端框架指纹

源码里出现 `index.php?c=api&a=` / `w7.cc` 特征 = 微擎（**通常零鉴权零频控，最易复现梯队**【实测】）；`/api/v\d/` + 业务码 = 常规前后端分离；ThinkPHP 路径特征——命中已知框架先搜该框架接口文档（搜索纠偏规则）。

---

## 4. 运行时架构与动态调试（Rebuild：动态取 key / 运行时真值）

### 4.1 双线程模型（决定你能 hook 什么）

```
┌─ 渲染层（每页面一个 WebView/Skyline）─┐   ┌─ 逻辑层 AppService（单一 JS 引擎实例）─┐
│  wxml→dom 树   wxss→样式               │   │  app-service.js                        │
│  WAWebview.js（渲染基础库）             │◄──┼─►WAService.js（逻辑基础库）             │
│  无业务逻辑（除 wasm/worker 场景）      │序列化│  wx.request / wx.login / storage 全在这 │
└────────────────────────────────────────┘通信└────────────────────────────────────────┘
                    两层之间经 Native 桥（WeixinJSBridge）转发
```

- **签名/加密 100% 在逻辑层**（AppService）——hook 面锁定它；AppService 的识别式：上下文中 `wx` 对象存在、`getApp()` 有效、routes 非空【实测】
- **wx.request 走原生网络进程**：这解释了 CDP Network 域的薛定谔表现（§4.4/§5.2）与 mitmproxy 的可靠
- worker / wasm 场景：计算可能外移到 worker 线程，入口仍从 app-service.js 追

### 4.2 通道总览与实测可靠性【实测 ×16】

| 通道 | 用途 | 实测结论 |
|---|---|---|
| 微信开发者工具（导入 KillWxapkg `-restore` 还原工程） | 可视化断点/console/Network | 便宜但**不是线上真实包**（配置/风控不同）；appid 用测试号、关「校验合法域名」 |
| WMPF devtools 桥（WMPFDebugger / zhong 强开 F12） | 调试**线上真实包** | 有效但需 frida 注入 WMPF 宿主（实测版本 25297），桥 `ws:9421`（调试）+`ws:62000`（CDP 代理）；微信重启即失效需重注 |
| miniapp-cdp MCP（`mcp__miniapp-cdp__*`） | 上述能力的 MCP 封装 | **三种实测失效形态**（见 §4.3），先探测再投入 |
| 裸 CDP 扁平会话（直连 62000） | miniapp-cdp 失效时的降级 | 实测可抓真实包（§4.4 完整序列） |
| wx-mp 沙箱（`mp_sandbox_run`） | 离线跑真实 bundle 的导出函数 | 签名验证最短路径（§4.5） |
| 真机 vConsole | console/network 只读 | 不能断点；部分发布版禁用 |

**纪律**：动态通道**按需启用而非默认启用**——16 个任务中占比最高的成功路线是纯静态 + 服务端验收闭环【实测】。

### 4.3 miniapp-cdp 的三种实测失效形态【实测】

1. **`list_targets` 空 / 无 target 可附着**：目标小程序未处于 WMPF 调试运行态（最常见）；或 MCP 依赖标准 CDP 的 **HTTP `/json` 发现面**，而 WMPFDebugger 的 62000 是纯 WS 代理、无发现面 → `list_targets`/`evaluate` 恒失败（`Runtime not connected`）
2. **执行上下文漂移**：小程序开关/页面切换导致 context 重建，`wx undefined ↔ 有效` 来回跳
3. **wx.request 不过 JS Network 域**：网络在原生进程，部分附着形态下 Network 域零事件

对策：枚举/连通性探测 ≤2 轮无结果 → **立即降级裸 CDP**（§4.4）；Network 域确认无事件 → 转 mitmproxy（§5.1）。不要在 MCP 封装上反复重试。

### 4.4 裸 CDP 扁平会话降级（实测抓真实包成功）【实测】

miniapp-cdp 失效后，用薄 WS CDP 客户端（可复用 WMPFDebugger 自带 `node_modules/ws`）直连 `ws://127.0.0.1:62000`：

```
1. Target.setDiscoverTargets / Target.getTargets        # 枚举（MCP 就是死在这步）
2. Target.attachToTarget {targetId, flatten: true}      # 扁平会话，拿到 sessionId
3. 后续命令带 sessionId 发送
4. Runtime.enable → 收集 executionContextCreated         # 注意：不对后附着客户端重放历史 ctx，
   #    收不到就暴力探测 contextId 1..20，用识别式（wx 存在 && getApp 有效）找 AppService
5. Network.enable {maxPostDataSize: 65536}               # 在该会话上开抓包
6. 触发流量：wx.reLaunch 到目标页面（触发 onShow 内 wx.request）或合成事件调页面实例方法
   （navigateTo 直跳插件页可能被权限拒绝，改调实例方法如 onTapXxx({dataset:{...}})）
7. Network.requestWillBeSent / responseReceived / loadingFinished 落 JSONL
8. 噪音过滤：微信框架事件占大头，按目标域/host 过滤
```

实测成果形态：一次捕获 12 条真实请求（含完整 header），把 40009 报错根因从「body 序列化」改判为「伴随头缺失」——**真实流量是静态争议的最高裁决**【实测】。

### 4.5 wx-mp 沙箱（离线跑真实 bundle）【实测】

`mp_sandbox_run` 把 `app-service.js` 在 Node vm 沙箱里跑起来（自动补 `wx` 环境桩），三大已验证用法：

1. **钉死签名向量**：固定 nonce/timestamp，沙箱内调真实签名函数，输出与离线复现逐字节比对（自检闸门）
2. **调真实 bundle 导出函数**：如获取登录流实际构造的加密载荷
3. **客户端布尔三态证明**（行为面）：离线复刻 `checkVip` 类门禁函数的 真实载荷放行 / 对抗载荷拦截 / patch 恒真 三种形态 + wxml 显隐判式复刻，**全程不打服务端**——这是"会员墙是客户端遮罩"断言的行为面一半【实测：gkdg】；另一半由「无鉴权边界 diff」（零身份头 HTTP 对照，§6.6）独立证明

配套：`mp_sandbox_modules` 列模块、`mp_sandbox_export` 导出最小子集为独立 .mjs、`mp_sign_crack` 对抓包样本穷举 算法×参数子集×密钥 组合（工具能力，本批会话未走通验证）。注意私钥/密钥能拿到（服务端下发）时沙箱闭环才有意义。实测坑【gkdg】：`requireMod` 返回命名空间（真实导出在 `.tools` 而非 `.default`）；沙箱 wx 面缺 `showModal` 等需先补桩；留档 = 传给沙箱的确切代码 + 原始输出 log（整理后摘要不可当复现依据）。

### 4.6 hook 面（语义优先级照用）

- `wx.request` / `wx.uploadFile`：入参即最终请求体——**sign 生成完成后、发出前**的最后一站，取证首选
- `wx.setStorageSync` / `wx.getStorageSync`：token/session 类缓存读写（`app-uuid` 等指纹持久化也在这）
- `wx.login`：code 获取（session_key 换取在服务端，本地拿不到）
- 手写注入模板（WMPF/开发者工具 console）：`const _r = wx.request; wx.request = function(o){ console.log('[wx.request]', o.url, o.data, o.header); return _r.apply(this, arguments); }`

---

## 5. 抓包与网络取证（Capture：请求级证据）

### 5.1 mitmproxy 系统代理（PC 端实测唯一可靠的 wx.request 取证通道）【实测】

PC 微信小程序流量走系统代理，标准 setup：

1. mitmproxy 启动（`mitmdump -p 8080 -s addon.py`；wx-mp 用户直接 `mp_capture_start` 产 JSONL）
2. CA 证书装入 **LocalMachine Root**（不只 CurrentUser）
3. Windows 用户级代理指向 `127.0.0.1:8080`——**先备份原值**（注册表 ProxyEnable/ProxyServer）
4. addon 按目标域过滤，全量请求头+body 落 JSONL（wx.request 的 header 是验签/补头分析的金矿）
5. **收尾清理清单**（写进 report）：代理还原、CA 卸载、mitmdump 停止【实测纪律】

适用场景：静态存疑（门控/软风控差异比对）、需要真实 header 全家福、复现请求与服务端反馈的差异定位（裸探针报错 → 抓真实流量逐字节对比 → 差异常在请求头【实测：hqc】）。

### 5.2 CDP Network 域（条件性可用）【实测】

同一机制两次相反结果：dkduanju/06 裸 CDP 扁平会话抓到真实包；hqc 的 CDP 桥 Network 域零事件。**已知影响因子**：附着形态（flatten 会话 vs 桥封装）、小程序运行态、网络事件是否在原生进程侧发出。结论：**先花最小成本验证 Network 域有没有事件，再决定投入**；无事件立刻转 mitmproxy，不恋战。

### 5.3 SSL pinning / 证书校验

16 个任务**零遭遇**【实测】——PC 端小程序不校验代理证书是普遍现状；真机端可能校验证书链或无视系统代理（社区：需进程内 hook SSL 类工具或 root + 强制信任）。遇到再上对抗，不要默认假设有 pinning。

### 5.4 平台原生通道盲区（mmtls）【实测】

微信官方插件（`plugin-private://<appid>/...`）的 CGI（如短剧插件的 `postcgiforward_directgetplayurl`）经 `/__wx__/` 走微信自有 **mmtls** 通道：**CDP 不可见、mitmproxy 不可见、不可重放**。netstat 采样只能看到 Weixin.exe 的 80 端口长/短连接。对策 = **抓不到过程就抓产物**：触发后用 CDP Network/页面状态抓最终产物（如媒体直链），走缓存式脱机交付（§6.5）。

### 5.5 合法域名校验

`wx.request` 只允许 request 合法域名（后台配置）；开发者工具/开发版可关校验——还原工程调试时记得关，否则误判"接口不通"。

---

## 6. 签名与加密实战模式库（Extract/Verify 的核心）【全章实测】

### 6.0 先定性，再投入（防过度工程）

1. crypto 扫描定性只作**初判**：`LIKELY UNSIGNED` / `ENCRYPTED`——两个方向都不可作终判：**ENCRYPTED ≠ 有业务签名**（实测多数 ENCRYPTED 来自打包进去的 crypto-js/SDK 自用加解密）；**无显式 sign 函数名 ≠ 无签名**（实测反例：ENCRYPTED 且零 sign 命名的目标，实有 SHA256+RSA 双层真签名，即 §6.2/§6.3 的目标）
2. **唯一定性 = 沿请求封装调用链读到 header 构造点**（§3.1 入口锚点），人工确认签名是否真实挂载
3. **负面测试探针**（§6.7）证伪验签强度
4. 规律【实测】：搜索/查询类只读 API **多数无签名**（5 个同类任务仅 1 个有真签名）；真正的防线更常是请求头上下文（miniapp 总纲 §3）

### 6.1 模式 0 · 无签名 + 请求头上下文门控

形态：接口本身无 sign 字段；服务端校验「请求是否来自该小程序上下文」——`Referer: https://servicewechat.com/<appid>/<版本>/page-frame.html` + `app-env`/`app-device`/`app-version`/`app-uuid=RANDOM-<hex>`/`xweb_xhr=1` + UA 含 `XWEB/<build>`。缺失 → 游客门控（如 `data.state="limit:tourist"` 配额限制）；补齐即通行，**无需登录 token**【实测：hqc 触发门控后补头通行；fengniao 同族头，验收时裸静态头亦放行】。

复现要点：
- 指纹头多为**弱校验**（`app-version: lasted` 与真实 `3.9.5` 均被接受），不必追求与真机一致
- `app-uuid` 是配额计数载体但不是判定键（配额按 IP/账号），换 uuid 不破门控
- 微擎后端（`index.php?c=api&a=`）连门控都没有，裸 urllib 直调 200【实测：oilprice】

### 6.2 模式 A · 拼接摘要 + 密钥自举下发（单签名层）【实测：停宜慧 tcapi】

完整规格（可直接对照复现）：

- `sign = SHA256(queryStr + bodyStr + T + appSecret).hex`（CryptoJS.SHA256 + enc.Hex，64 位小写 hex，**纯 hashlib 可复现**）
- `queryStr`：URL query ∪ GET data，按 key 字典序 `k=v&` 连接；**不 URL-encode**；bool→`"true"/"false"`（JS 模板字符串语义）；**路径本身不参与签名**
- `bodyStr`：仅 POST/有 body 时 = `JSON.stringify(body)` 紧凑串，否则空串
- `T`：`{appId,nonce,timestamp}` 三键按 key 升序 `k=v&` 连接
- `nonce` = 10 位 `[A-Za-z0-9]`（Math.random）；`timestamp` = `Date.now()` 毫秒串
- carrier：header `appId/timestamp/nonce/sign` 四元组

**密钥自举下发**（鸡生蛋的服务端解法，纯静态必漏）：
- `appSecret` **不在包内硬编码**，由免签名配置接口（如 `GET /app-api/system/app/open/get`）的 config 项下发；源码对该 URL **特判免签名**
- **一值多用**：同一 secret 同时是签名盐 + AES-128-CBC 数据密钥（payload=base64(IV[16]‖密文)，IV 内嵌前缀）——拿到一个值解开两层
- 流程：先免签拉 secret → 再签名调用 → 密钥轮换时用 config diff 核对

### 6.3 模式 B · 双层签名体系（token 内嵌签名 + header 签名）【实测：停宜慧 oapi/tcapi】

同一小程序存在两套独立签名：

- **L1（token 型）**：`Authorization: OP-Authorization: OPENPLATFORM-TOKEN app_key="..",nonce="..",timestamp="..",sign=".."`；`sign = base64(RSA-SHA512-PKCS1v15( [appKey,ts,nonce,body].join("\n")+"\n" ))`（jsrsasign `SHA512withRSA`，私钥 PKCS#8 由配置接口下发——**私钥下发使复现合法化**）
- **L2（header 型）**：同模式 A 的 SHA256 四元组
- **两层 nonce/timestamp 不同源**（各自生成）——复算对不上先查是不是拿错了层的值

**伴随头缺失陷阱**【实测】：验签错误码（如阿里系 `40009 isv.invalid-signature`）**不代表签名算错**——实测根因是伴随头缺失（`X-Device-Location: base64(lng.toFixed(5)+","+lat.toFixed(5))`、`tenantIds` 等）。**错误码拆层纪律**：40009 先查伴随头完整性；1000 类先查参数形状；5000 类可能是缺头导致的误导性 SQL 报错，不要当成验签失败去改算法。参数面差异：实测存在未携带 L2 header sign 也获 8888 的坐标组合（与 40009 案例表面矛盾）——复用时以「双层+伴随头全量」为稳妥默认。

### 6.4 模式 C · 怪癖摘要（非标准摘要构造）【实测：蜜雪冰城】

`enhanceMD5` = 标准 MD5 hex **追加 4 个扩展尾**：把 16 字节摘要按大端读成 4 个**有符号 int32**，各取 `abs()` 后以十进制字符串顺接。盐/appId 硬编码包内。教训：**非标准摘要要逐位复刻怪癖**（字节序、符号位、十进制化），服务端真实接受（code=0 + 真实业务数据）是唯一验收【实测】。

### 6.5 模式 D · 平台原生通道 / 服务端密钥（不可复现面）→ 缓存式脱机【实测：杜仲短剧】

- 播放/支付类能力沉淀在微信官方插件 + mmtls 私有通道：CDP/MITM 不可见，**协议复现不可能**
- 产物 = 腾讯 VOD 签名直链（`.../f0.mp4?t=<hex>&us=<us>&sign=<32hex>`）：sign 是**服务端密钥**摘要、绑定完整路径与时效，客户端无法构造；CDN 对无参 403、错签/过期一律 **404（掩蔽式拒绝）**；换 `.m3u8` 全拒（sign 绑路径）——**不要浪费时间找 m3u8**
- 直链本体无需 Referer/Cookie（腾讯 COS），TTL 实测 ≥50min
- **交付形态 = 缓存式脱机**：桥接触发 prefetch（真实客户端内合成事件起播）→ 产物落 `playurls.json`（带过期时间）→ 离线查询器；结论精度如实标注 provisional（不冒充协议复现）

### 6.6 模式 E · 会员墙与游客 token【实测：工控题库 gkdg】

- **会员墙 = 客户端布尔遮罩**：`checkVip` 之类函数返回 false 仅隐藏 UI，服务端**全量明文下发**——接口本身无鉴权，匿名直读列表/详情
- **游客 token 铸造**：需登录闸的接口实测接受 `POST api/login/withoutMobile {openid: 任意串, provider: "visitor"}` 即发 token（openid 服务端不校验真实性；时效未长跑验证，脚本按可重铸设计）
- **静态资源无凭证**：PDF 直链 200/206 直下
- **行为面证明**：wx-mp 沙箱离线三态（checkVip 真实/对抗/patch 载荷 + wxml 判式复刻，§4.5）+ 无鉴权边界 diff（零身份头直调对照，证明匿名可读）+ 批量导出器 + 哈希交叉比对，把"遮罩"断言钉成证据链

### 6.7 负面测试探针（验签强度的证伪手段）【实测】

对目标接口发 7 变体对照：正签基线 / 篡改 sign 前 8 位 / 全随机 64hex / 空 sign / 删 sign 头 / 删 timestamp / 删 nonce。全部放行 → 该接口**不强校验签名**（如实记录"验签弱"结论，但客户端仍按原算法忠实生成保持协议保真）。这一步能推翻静态阶段的误判（实测：open 接口「错签→1000」断言被证伪，1000 实为参数校验层）。

### 6.8 密钥管理纪律【实测】

- **实读不信转抄**：密钥/私钥从 runtime globalData 或配置接口实读——转抄截断一个字符（实测：base64 少一位 'A'）会导致 43/43 复算全不匹配，烧一整轮才定位到转抄层
- **PEM normalize**：包内单行拼接的 PEM 私钥带空格/断行异常，进 jsrsasign/ crypto 前需 `normalizePem` 重排
- **密钥轮换**：secret 为服务端可轮换值，交付脚本运行时自举拉取，不硬编码

### 6.9 平台自带密码学三件套（先弄懂，别误判为业务加密）

- `wx.login` → `code` → **服务端** `code2Session` 换 `openid/session_key`（session_key 从不下发客户端——本地逆向拿不到）
- 旧版 `getUserInfo`/`getPhoneNumber` 的 `encryptedData/iv`：AES-CBC，key=`session_key`；新版改 `code` 直传

### 6.10 接入双闸门

- **算法自检**：签名函数钉死随机源（nonce/timestamp 固定）后与沙箱/运行时输出逐字节比对（`verify-algo.py` 语义）
- **服务端验收**：复现请求被真实服务端稳定接受（业务成功码 + 真实数据）；wx-mp 用户可 `mp_sign_crack`（样本×密钥×算法穷举）产出候选，再人工过双闸门
- **验收编排**：`verify-once` 双层模式——先跑业务验收脚本（产出 VERIFIED/VERIFY-OK），再对照 `fixtures.json` 基线复核；fixtures 重写后必须重跑验收，防止基线与最新证据脱节【实测】

---

## 7. 登录态边界（协议级，不要硬顶）【实测 ×4】

- `wx.login` 的 **code 必须在真实微信环境产生**（绑定真实会话），纯 Python/Node 无法自产——这是协议级边界，不是技术卡点
- 需登录态接口的交付形态：**用户供给 token/uid**（脚本留入参口），或引导真实客户端内取 storage token
- 匿名 token 类（`POST user_login` 即发 sessionId、visitor 铸造）不在此限——实测大量"登录墙"实为游客可破（§6.6）
- token 失效码家族（如 4001/4002/401）= 重登信号，复现脚本应识别并提示

---

## 8. 防护与对抗

| 防护 | 真实强度 | 对策 |
|---|---|---|
| 「代码保护」上传（压缩+文件名混淆） | 低-中：结构完整 | 还原工程照样可读；AST 还原接 `ast-deobfuscation.md` |
| JSVMP 化关键函数（头部小程序签名，如 wsgsig dd05 级）【社区】 | 高 | `vmp-playbook.md` 系列原样适用（宿主换沙箱）；六路径纯算还原是公开标杆 |
| 核心逻辑服务端化 | 高（本地无线索） | 接口行为逆向 + 抓包；接受降级交付形态 |
| 平台原生通道（插件 mmtls）【实测】 | 不可见 | §5.4/§6.5：抓产物 + 缓存式脱机 |
| 动态下发代码片段 | 中 | 抓包捕获下发载荷；`local/` 缓存找残留 |
| 证书校验/SSL pinning | 低（PC 实测零遭遇） | 遇到再对抗（进程内 hook SSL / root 信任）；勿默认假设 |
| 风控字段（设备指纹/行为） | 中 | 与 Web 同构：`fingerprint`/`behavior-telemetry` 专题 |
| 调试器检测/账号风控 | 中 | 零侵入工具优先（解包/沙箱/代理）；注入类仅授权环境+小号 |

---

## 9. 逆向工作流（五阶段映射）【实测骨架】

```
Observe   定位样本（§1）：mp_list_apps/路径检索 → appid → 缓存 → 主包(+分包清单) → 原样复制+SHA-256
Capture   解密解包（§2）→ 静态地图（§3：端点清单/加密面清单/封装函数）→ 需要时 mitmproxy 真实流量（§5）
Rebuild   三岔决策（composite-triage-playbook）：
          a. 纯静态还原（无签名/弱门控形态，实测最快梯队）→ 直接 Python/Node 复现
          b. 沙箱跑真实 bundle 签名函数（mp_sandbox_run，密钥可自举时）
          c. 运行时取证取真值（裸 CDP / 开发者工具，§4）
Extract   最小闭包：签名函数 + 依赖模块 + wx 环境桩（storage/systemInfo/request）
Verify    双闸门（§6.10）→ 服务端业务成功码 + 真实数据 → report.md 六节
          （实现路径写清 appid/包哈希/解密参数/工具版本；回滚说明 = 删 run/ 原包未动）
```

**停损特化**：同一端点静态找不到调用链 2 轮 → 转动态；miniapp-cdp 枚举/连通 2 轮无果 → 降裸 CDP；CDP Network 无事件 → 转 mitmproxy；动态全堵 → 回静态 + 服务端对照实验兜底。

**复现侧通用坑**【实测】：
- Windows GBK 控制台打 UTF-8 花屏 → `sys.stdout.reconfigure(encoding="utf-8")` / `PYTHONIOENCODING=utf-8`（显示层问题，勿误判数据错）
- 交付三件套：`pure-*.py/js`（可独立运行）+ `run/fixtures.json`（真实响应基线，"运行即留证"）+ 验收脚本/日志
- 契约前置：任务契约里写死「禁止冒充完成的替代态」（解包完成≠完成、端点找到≠完成、脚本写完未实跑≠完成）

---

## 10. 速查表

- appid 形态：`wx` + 16 hex；同时是 V1MMWX 密钥派生源（PBKDF2 password + XOR key 取字符）
- PC 4.x 缓存：`%APPDATA%\Tencent\xwechat\radium\users\<hash>\applet\...\packages\<appid>\<ver>\__APP__.wxapkg`
- V1MMWX：PBKDF2-SHA1(appid,"saltiest",1000,32) + AES-256-CBC(iv `the iv: 16 bytes`, [6,1030)→取前 1023) + XOR(**appid 倒数第二字符**, [1030,EOF))
- 标准 wxapkg：magic `0xBE` + 4×4B 头 + fileCount + 索引(nameLen+name+offset+size)
- 业务代码全在 `app-service.js`；页面/分包清单在 `app-config.json`；单行 bundle 用 `define("<mod>"` 切片
- 成功码以后端为准（实测见过 20000 / 8888 / 0 等），从源码 success 分支读判定式
- 微擎后端指纹：`index.php?c=api&a=<action>`（常零鉴权）；身份头：`Referer: https://servicewechat.com/<appid>/<ver>/page-frame.html`
- 验签报错先拆层：伴随头 > 参数形状 > 签名算法；误导性 5000 报错常见
- 开发者工具导入还原工程：关「校验合法域名」；appid 填测试号
- 登录边界：wx.login code 不可离线自产；游客铸造接口先试 `withoutMobile`/`visitor` 形态

## 11. 参考（时效已标注；社区链接未逐一复核，认准上游）

- 工具：[KillWxapkg](https://github.com/Ackites/KillWxapkg)【活跃，上游已核】｜unveilr（跨平台）【活跃；fork 多认准上游】｜wxappUnpacker【维护停滞，原仓已删 fork 众多】｜[ttpkUnpacker（抖音 TPKG）](https://github.com/geek-bigniu/ttpkUnpacker)｜[takeWxapkg（敏感信息提取）](https://github.com/Huahuainit/takeWxapkg)｜[wx-mp-mcp（本环境 wx-mp）](https://github.com/WhiteNightShadow/wx-mp-mcp)【上游已核】｜[miniapp-cdp-mcp](https://github.com/zhizhuodemao/miniapp-cdp-mcp)
- V1MMWX：社区流传资料（pc_wxapkg_decrypt 系列等）对 XOR 取字符的描述与实测不符——**以 §2.1 标定为准**（勘误过程见该节）
- 调试桥：[zhong-wechat-wmpf-debugger](https://github.com/netz888/zhong-wechat-wmpf-debugger)【2025 有效】｜[WMPFDebugger 二开](https://github.com/waydone/first)｜[sunnymcptool（真机抓包）](https://github.com/a121400/sunnymcptool/releases)
- 架构：[Skyline 渲染引擎（官方）](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html)｜[小程序底层架构设计](https://cloud.tencent.com/developer/article/2498582)
- 案例：[金融小程序数据加密及签名逆向](https://cloud.tencent.com/developer/article/2476115)｜[小程序 sign 逆向两种思路](https://mdr.skyeye.qianxin.com/forum/share/3815)｜[某次微信小程序逆向](https://cloud.tencent.com/developer/article/2417336)｜[Android 端 wxapkg 提取](https://www.52pojie.cn/thread-1902958-1-1.html)｜[抖音小程序解包（吾爱）](https://www.52pojie.cn/forum.php?mod=viewthread&tid=2038738)

> 修订纪律：本文件的实测结论（尤其实测标定参数）优先级高于一切二手资料；发现冲突按「实跑验证 → 修正本文 → 记录勘误」执行（§2.1 的 XOR 勘误即范例）。
