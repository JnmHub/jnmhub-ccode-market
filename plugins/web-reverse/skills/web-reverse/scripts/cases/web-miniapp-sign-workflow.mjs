export default {
  caseId: "web-miniapp-sign-workflow",
  status: "abstract-case",
  category: "miniapp",
  tags: ["miniapp", "signature", "wxapkg", "app-service", "header-sign", "bootstrap-key"],
  focus: [
    "签名定位：grep 签名 header 名或请求封装函数，沿调用链读到 header 构造点（签名常在封装层而非业务页）",
    "密钥自举模式识别：签名盐不在包内硬编码、由免签名配置接口下发（源码对配置 URL 特判免签名）；同一密钥可能兼作字段加密 key（一值多用）",
    "双层签名体系还原：token 内嵌签名层（如 RSA 私钥亦由服务端下发）与 header 签名层各自独立，两层 nonce/timestamp 不同源不可混用",
    "怪癖摘要逐位复刻：非标准摘要构造（字节序/符号位/十进制扩展尾等怪癖）必须逐字节标定",
    "验签强度负面测试：错签多变体对照探针（篡改/随机/置空/删头）证伪验签强度，错误码先拆层（伴随头 > 参数形状 > 算法）"
  ],
  deliverables: [
    "report.md",
    "run/pure-crypto.js（签名纯算法复现，固定随机源自检）",
    "run/signature-input-map.md（canonical 输入映射文档）",
    "run/probe-wrongsign.*（负面测试对照探针与结论）",
    "run/pure-<api>-client.*（带签名完整链路的独立客户端）",
    "run/fixtures.json（服务端真实验收响应）"
  ],
  checkpoints: [
    "已拿到密钥真实值（runtime 实读或配置接口自举），不信转抄——逐字符核对长度与字符集",
    "canonical 拼接顺序已逐段标定：query 排序与编码语义、body 序列化形态、签名因子排序、密钥拼尾位置",
    "PEM 形态私钥已 normalize（单行拼接/空格异常），签名库与包内实现一致",
    "伴随头清单已枚举（设备/租户/位置类 header），缺失报错的误导性已验证",
    "负面测试已执行并记录验签强度结论（强校验/弱校验/不校验）",
    "自检向量与服务端 live 验收双闸门均通过，密钥轮换场景脚本可运行时自举"
  ],
  caveats: [
    "ENCRYPTED 扫描结果不等于有业务签名，先确认 sign 挂载点再投入",
    "验签错误码不代表签名算错——伴随头缺失可触发相同错误码，先补头再怀疑算法",
    "转抄密钥截断一个字符会导致全量复算不匹配，优先实读 runtime/配置接口",
    "同一目标可能有多套签名体系（多网关/多封装函数），以 header 形态区分逐套还原",
    "成功码以源码 success 分支判定式为准，不同后端差异极大",
    "open/公开接口可能不强校验签名，但客户端仍应忠实生成保持协议保真"
  ]
};
