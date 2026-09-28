# 术语表

## 交付梯度

| 梯度 | 交付物 | 说明 |
|---|---|---|
| T1 | 证据交付 | 完整的类/方法/调用链证据 + 运行时日志 |
| T2 | Hook 脚本交付 | 可运行的 Frida hook 脚本 |
| T3 | Smali Patch 交付 | 修改后的 smali + 重打包/重签名/安装验证 |
| T4 | 协议文档交付 | 完整协议文档、算法流程、密钥/参数来源 |
| T5 | 纯算法迁移交付 | 不依赖 Android 运行环境的独立 Python/Node 实现 |

## 防护等级

| 等级 | 说明 |
|---|---|
| A0 | 无明显保护 |
| A1 | ProGuard / R8 混淆 |
| A2 | 字符串加密 / 反射隐藏 / 简单 native |
| A2+ | 商业混淆器（Allatori / DexGuard / DashO） |
| A3 | Root / Frida / Pinning / Integrity 单层保护 |
| A4 | 动态 Dex / 壳 / JNI 主逻辑 |
| A5 | 多 SO / 多 Dex / Java-Native 强耦合 |
| A6 | 壳 + 动态加载 + 多层保护 |
| A7 | 复杂混合保护，需静态与运行时联动拆解 |

## 主张精度

| 级别 | 说明 |
|---|---|
| provisional | 静态分析推断、单次 hook 命中、搜索线索 |
| route-ready | 有交叉验证，足以支撑下一轮 probe/pivot |
| acceptance-ready | 贴近目标边界的直接验证证据 |
| delivered | 通过最终验证并满足 deliverableTier |

## 专题成熟度（历史快照）

以下为旧体系 historicalMaturity 标签的历史定义，不是当前能力或执行契约的保证，与 README.md 的历史快照说明一致：

| 级别 | 说明 |
|---|---|
| synthetic-e2e | 有注册表支持的合成任务骨架、形式化验证和专题产物约束 |
| closed-loop | 有注册表支持的任务模型和形式化验证，无合成任务包保证 |
| guided | 有注册表支持的指导，低于 closed-loop 和 synthetic 保证 |
| reference-only | 仅有参考材料，无注册表支持的执行契约 |

## 任务阶段

| 阶段 | 说明 |
|---|---|
| Observe | 观察与分诊 |
| Capture | 证据捕获 |
| Rebuild | 逻辑重建 |
| Patch | 补丁/绕过 |
| PureExtraction | 纯提取（协议/算法独立实现） |
| Port | 移植与交付 |
| Close | 关闭与清理 |

## 关键概念

- **切入点 (Entrypoint)**：一条具体的分析路径，包含假设、探测策略和成功/失败判据
- **切入点循环**：Hypothesis → Probe → Evaluate → Pivot → Retry 的迭代过程
- **Retrospective**：根据真实失败与证据缺口回顾判断，不要求穷尽路线、固定次数或另建记录
- **任务契约**：用户实际目标、约束与交付要求；当前以 report 保存交接摘要，不要求固定 JSON 字段
- **Route-state**：旧管理链的历史状态资料，不是当前执行依据；不自动读写或运行其中的命令
- **否决落盘**：在 report 保存用户明确否决的原话或忠实摘要及影响，区分疑问与禁止
- **压缩恢复**：先读 report，核对目标、禁止项、证据、失败原因与未验收项；缺失信息按需只读历史资料查证，不补造
- **Pivot**：从一条分析路径切换到另一条实质性不同的路径
