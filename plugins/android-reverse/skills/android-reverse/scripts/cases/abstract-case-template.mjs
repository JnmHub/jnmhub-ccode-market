export default {
  caseId: "android-abstract-case-template",
  status: "abstract-case",
  category: "template",
  tags: [
    "template"
  ],
  focus: [
    "按阶段推进",
    "按证据收敛",
    "按契约交付"
  ],
  deliverables: [
    "report.md",
    "实际样本按需保留，run/fixtures.json 仅为可选组织例"
  ],
  checkpoints: [
    "按相关性说明当前进展与已有证据，不要求填阶段状态",
    "缺输入、未执行或受阻可直接汇报，不补造证据",
    "有依据时建议下一步；也可暂停请求帮助"
  ],
  entrypoints: [
    {
      id: "E1",
      hypothesis: "先从最低成本、最高信息增益的入口证明目标主链是否真实存在",
      firstProbe: "执行最小静态分诊或轻量运行时探针，确认组件、装载点或网络入口",
      expandWhen: "探针命中关键类、关键进程、关键符号或关键请求",
      parkWhen: "探针连续未命中且无法产出新的证据锚点"
    },
    {
      id: "E2",
      hypothesis: "若主入口噪音过大，切到边界入口先恢复 Java-Native、容器或网络分层",
      firstProbe: "改做桥接、运行时类型或网络分层识别",
      expandWhen: "边界恢复后能把证据回接到主业务链",
      parkWhen: "边界证据无法解释当前目标或缺少可继续扩展的线索"
    }
  ],
  probeSequence: [
    "按目标和已有证据选择相关入口，不规定入口或路线数量",
    "仅在授权和输入充分时考虑必要 probe，不默认扩大执行",
    "相关进展可在 report 说明，不要求每轮生成 route 决策或额外台账"
  ],
  evidenceAnchors: [
    "Manifest、组件、资源、字符串、xref、符号",
    "hook 输出、日志、抓包、内存或运行时证据"
  ],
  pivotSignals: [
    "当前入口连续未命中",
    "发现更低成本且信息增益更高的新入口",
    "现有证据无法支撑高置信结论"
  ],
  successSignals: [
    "已形成能回指原始证据的阶段结论",
    "有依据时给出下一步建议；缺输入或受阻也可直接总结"
  ],
  caveats: [
    "只保留抽象流程与验收口径"
  ],
  stages: [
    "Observe",
    "Capture",
    "Rebuild",
    "Patch",
    "PureExtraction",
    "Port",
    "Close"
  ]
};

