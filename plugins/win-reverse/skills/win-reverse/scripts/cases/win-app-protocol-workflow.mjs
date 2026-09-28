export default {
  caseId: "win-app-protocol-workflow",
  status: "abstract-case",
  category: "app-protocol",
  tags: [
    "app-protocol",
    "signature",
    "protobuf"
  ],
  focus: [
    "签名字段定位",
    "协议结构恢复",
    "加密边界确认"
  ],
  deliverables: [
    "report.md",
    "task.json",
    "run/app-reverse-notes.md",
    "run/sign-algorithm.md",
    "run/protocol-schema.md"
  ],
  checkpoints: [
    "已定位 sign/token 字段来源",
    "已还原请求字段顺序与序列化方式",
    "已形成本地复现或协议文档"
  ],
  stages: [
    "Observe",
    "Capture",
    "Rebuild",
    "Patch",
    "PureExtraction",
    "Port",
    "Close"
  ],
  caveats: [
    "协议/签名还原必须以样本内调用链或抓包证据为准，不用纯猜字段顺序替代验证"
  ]
};
