export default {
  caseId: "web-miniapp-workflow",
  status: "abstract-case",
  category: "miniapp",
  tags: ["miniapp", "wxapkg", "miniprogram", "app-service", "wechat", "acquisition"],
  focus: [
    "样本定位：PC xwechat/radium 与旧版 WeChat Files 缓存路径按 appid 检索（mp_list_apps 或目录搜索），原样复制并记 SHA-256",
    "V1MMWX 解密复现（PBKDF2 派生 AES-256-CBC 解头区取前 1023 字节 + 尾区 XOR appid 倒数第二字符），与工具输出逐字节互证",
    "静态地图：不信自动报告的 API 列表（uni-app 产物里多为页面路由），grep 请求封装函数建端点清单 + crypto 信号建加密面清单",
    "定性先行：crypto 扫描 ENCRYPTED 不等于有业务签名（多为 SDK 自用信号），signFunctions=0 才是无签名强信号",
    "动态通道按需启用：miniapp-cdp 先探测（三种失效形态）→ 裸 CDP 扁平会话降级 → CDP Network 无事件转 mitmproxy 系统代理"
  ],
  deliverables: [
    "report.md",
    "run/decrypt-wxapkg.js（或等价解密复现）",
    "run/unpacked/（解包工程）",
    "run/pure-<api>-client.py（或 .py/.js/.mjs 独立客户端）",
    "run/fixtures.json（服务端真实响应基线）",
    "run/verify-once 日志或脚本（服务端验收证据）"
  ],
  checkpoints: [
    "已确认包来源（appid、版本目录、SHA-256）与加密形态（V1MMWX 或 0xBE 明文）",
    "解密输出已与至少一个工具（KillWxapkg/wx-mp）逐字节对照",
    "已从 app-config.json 枚举分包与插件并按需解包，未遗漏业务页面",
    "已沿请求封装函数回溯到 header 构造点，而不是只看单点源码",
    "已定性签名有无并据此选择路线（无签名目标先查请求头上下文门控）",
    "已分流判定：能力在自有 HTTP 后端（直连复现）还是平台原生插件/mmtls 通道（桥接抓产物+缓存式脱机）",
    "最终客户端已过服务端实测验收（业务成功码+真实数据非空，不是格式被接受）",
    "抓包任务已留清理清单（代理还原/CA 卸载/进程停止）"
  ],
  caveats: [
    "单行压缩 app-service.js（数 MB 一行）用 define 模块标记切片精读，不要全文格式化",
    "远端下发配置的容器形状先对照 JS 消费代码（可能是 JSON 字符串内的键值数组），不要假设是对象",
    "静态扫描长单行易误判 HTTP method，以源码 method 字段为准；服务端方法/参数错误码要与验签失败区分",
    "逻辑层无 DOM/BOM 且 wx.request 走原生网络进程：浏览器侧 hook 与 Network 域经验不直接适用",
    "wx.login 的 code 必须真实微信环境产生，纯脚本不可自产——登录态需求写进交付形态（用户供 token）",
    "形似会话态的参数先查 globalData 硬编码，避免误引入登录链依赖",
    "注入类工具（WMPF hook/强开 F12）有账号风控风险，仅限授权测试环境，优先零侵入通道"
  ]
};
