export default {
  caseId: "android-device-fingerprint-workflow",
  status: "active",
  category: "device-fingerprint",
  tags: [
    "device fingerprint",
    "risk control",
    "play integrity",
    "key attestation",
    "safetynet",
    "device id",
    "risk engine",
    "warlock"
  ],
  focus: [
    "先识别指纹 SDK 类型和采集维度",
    "关注多源交叉验证机制",
    "风控参数生成逻辑完整链路还原"
  ],
  deliverables: [
    "report.md",
    "相关维度与参数逻辑可直接在 report 描述，run/device-fingerprint-notes.md 仅为可选组织例"
  ],
  checkpoints: [
    "按目标说明已识别的 SDK 类型和版本，未知则注明",
    "记录相关采集维度和已知读取路径，不要求枚举全部维度",
    "若涉及交叉验证或参数逻辑，区分已知证据与未还原部分",
    "Play Integrity / Key Attestation 仅在相关时说明已有证据，不强制确认"
  ],
  entrypoints: [
    {
      id: "E1",
      hypothesis: "从 Manifest 和依赖入手可快速定位指纹 SDK 和采集入口",
      firstProbe: "搜索 Manifest 权限声明和 SDK 依赖，定位初始化入口和采集方法",
      expandWhen: "SDK 类型和版本已识别，采集入口已定位",
      parkWhen: "未发现第三方 SDK，可能是自研风控方案"
    },
    {
      id: "E2",
      hypothesis: "从网络请求中的风控参数字段回溯到生成逻辑",
      firstProbe: "拦截 HTTP 请求，找到风控参数字段名，从请求拦截器回溯到参数生成方法",
      expandWhen: "找到了参数生成入口并可追踪到具体逻辑",
      parkWhen: "参数生成完全在 Native 层且高度混淆"
    }
  ],
  probeSequence: [
    "识别指纹 SDK 和采集入口",
    "分析采集维度（设备/网络/传感器/环境）",
    "分析多源交叉验证机制",
    "追踪风控参数生成完整链路",
    "分析 Play Integrity / Key Attestation（如适用）",
    "评估绕过策略"
  ],
  exitCriteria: [
    "说明目标相关的已知采集维度与缺口",
    "区分参数逻辑已还原部分、推断和未验证部分",
    "report 按相关性说明实际发现与未测范围，无固定文件或条数要求"
  ],
  evidenceAnchors: [
    "SDK 初始化入口和调用链截图",
    "多源读取路径对照表",
    "风控参数字段和生成算法伪代码"
  ],
  pivotSignals: [
    "Java 层无指纹采集逻辑 → 转 Native 层分析",
    "多源交叉验证机制复杂 → 考虑 Native 层统一拦截",
    "Play Integrity 硬件验证 → 评估是否可绕过"
  ],
  successSignals: [
    "目标相关的已知维度和路径可回指证据",
    "参数逻辑结论限定于实际还原与验证范围",
    "相关交叉验证机制区分证据、推断和未知"
  ],
  stages: [
    "Observe",
    "Capture",
    "Rebuild",
    "Close"
  ],
  caveats: [
    "高级 SDK 同时从 Native 层读取，Java hook 不够",
    "修改单一维度需同步修改所有读取路径",
    "风控参数通常是多维度数据的签名摘要，不是简单设备 ID"
  ]
}
