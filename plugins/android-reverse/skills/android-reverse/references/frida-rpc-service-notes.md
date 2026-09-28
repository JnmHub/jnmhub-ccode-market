# Frida RPC 服务化 Notes

> 来源：`references/technique-extract-2026-09.md`（RPC 工程化条目）；实测样本：7×24 签名服务形态。
> 定位：把 App 内的加密/签名函数借出来当 API 用——不还原算法时的标准替代路径。按需阅读，不是任务门禁。

## 适用场景（四类）

- 批量签名/加密需求（性能优先）；
- Native 层算法无法在合理时间内还原；
- 密钥由服务器动态下发（静态提取无意义）；
- 算法依赖设备指纹/环境状态。

设计哲学：**"RPC 脚本越短，App 升级后失效的概率越低——只要类名和方法签名不变，算法内部怎么改都不用管"**；把 Frida 脚本退化成加密黑盒，业务逻辑全部放 Python/服务端。

## 基础三层架构

- JS 端 `rpc.exports = { sign(payload) {...} }`；Python 端 `script.exports_sync.sign(...)`；HTTP 层（Flask + waitress）包成 API。
- 序列化限制：RPC 走 JSON——只能传字符串/数字/布尔/数组/普通对象；Java 对象先 `.toString()` 或提取字段。
- **RPC 回调里用 Java API 必须包 `Java.perform`**（调用时刻任意，须确保线程已 attach ART）；异步 RPC 返回 Promise（exports_sync 自动等 resolve），`registerClass` 代理接口接回调，`setTimeout + reject` 做超时。
- 二进制两方案：hex 字符串（简单、体积翻倍）/ **双通道**（rpc 返回 requestId + `send(msg, ArrayBuffer)` 送字节，Python 端 threading.Event 按 requestId 拼合）。
- 三种 exports：`exports_sync`（主力）/ `exports_async` / 无后缀（已弃用会打警告）。

## 服务化三档递进

1. 基础 Flask（demo 验证）；
2. 并发方案：**frida_lock 锁保护** 或 `queue.Queue` + 专职 worker 串行（waitress 多线程扛 HTTP，Frida 会话单线程消费）；
3. FridaRPCManager（7×24）：Redis brpop 取任务 + 三次重试夹 reconnect + 30s 健康检查心跳 + SIGINT/SIGTERM 优雅退出 + 日志双通道（FileHandler/StreamHandler）。

## 断线 reason 分类（重连策略的依据）

| reason | 含义 | 动作 |
|---|---|---|
| `application-requested` | 本地主动 detach | **绝不重连** |
| `process-terminated` / `process-replaced` | 目标进程没了 | 重 spawn |
| `server-terminated` | frida-server 挂了 | 等 server 恢复 |
| `connection-terminated` | USB/连接断了 | 先 `frida.get_usb_device(timeout=30)` 等设备回来再连 |

指数退避 2s → 60s 封顶，重试上限后告警停止。

## 并发三防（实测事故沉淀）

- **重连的 init_frida 必须放锁外**——重连期间持锁会把全部业务请求排队打满 HTTP 线程池；
- 重连循环前把重试计数清零——否则上次用光预算会让此后所有断开静默跳过重连；
- 健康检查不进锁、原子读 api 引用（探针 hang 不能拖垮业务）；队列超时要清理 rpc_results（late worker 返回导致 dict 永久增长）。

## 冒烟与验证

- 冒烟测试必须**真调一次 RPC 且显式检查错误标记**（遇错返回字符串而非 raise 的实现，只看"有返回值"会静默失败）。
- `frida -l script.js -q` 会立即退出 detach——用 Python 保活循环。
- `flask run --debug` 的 reloader 会加载脚本两次搞挂 session。
- 零依赖验证法：attach 系统进程 hook `MessageDigest`/`Base64`/`Cipher`，与本地 md5sum/base64/pycryptodome **对拍**——判据是"和本地算出来一致"而非"没报错"。

## 与其他路线的取舍

- 算法可还原且需要高吞吐 → Unidbg 生产化（见 `references/unidbg-simulation-playbook.md` 实战补充：算法还原五步与生产化要点）。
- 需要长期稳定的设备端 hook（非服务化）→ LSPosed 插件化（见 `references/hook-injection-playbook.md` 实战补充）。
- RPC 适合"快速能用、接受单设备吞吐上限"的中间形态。
