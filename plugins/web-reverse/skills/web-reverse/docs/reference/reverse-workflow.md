<!-- publish: framework -->
# Reverse Workflow（执行循环方法论）

## 阶段总览

1. `Observe`
2. `Capture`
3. `Rebuild`
4. `Patch`
5. `PureExtraction`
6. `Port`
7. `Close`

开机只做一件事：`node $TOOL_DIR/task-init.mjs <task-id>`（幂等建目录 + report.md 骨架）。过程零强制记录——下文所有"写回/落盘"均指把**工作产物**（脚本/样本/trace）放进任务目录，不是过程记录义务；唯一文档义务在 Close。

> **主循环 ↔ workflow 阶段映射**：SKILL.md 执行循环的 `Rebuild/Verify` 在本 workflow 细分为 `Rebuild → Patch → PureExtraction → Port`；`Extract` 是 Rebuild→Patch 之间**仅 D/E 扣代码路线**走的条件子阶段；`Close` = 最终验证 + 填写 report.md（契约见 `docs/reference/output-contract.md`）。

## 总控制规则

- 每一轮都以**是否更接近最终验收**为判断标准
- 不要把"本轮总结"当作暂停点；也不要用"我会继续 / 下一步继续"代替动作
- 任何"已落盘 / 已打通 / 已成功"的表述，都必须先经过文件存在性或验证结果自检

## 每轮最小自检包

每轮结束前，至少能回答：
- 本轮相对上一轮，是否更接近验收边界
- 当前主假说及其保留/降级状态
- 当前最贵的未知项
- 活跃 entrypoints 与下一步最便宜的动作
- 如果下一轮仍不收敛，准备停掉哪条路线
- 当前处于 foundation / probe / deep-dive 哪一层

## 进入 Observe 前先完成的分类动作

- 选定 `taskMode` 与交付梯度（A~E，见 SKILL.md）
- 选定主专题 + 0~2 辅助专题
- 定义当前活跃 entrypoint、最小 probe 与成功判据

分类明显不稳时，允许先做一次低成本 triage、本地知识检索或全网搜索纠偏，但不要在分类未定时直接扩建大量脚本。

## Entrypoint Loop

默认循环：`Hypothesis -> Probe -> Evaluate -> Pivot -> Retry`

最小纪律：
1. 先列 2~5 个候选 entrypoints
2. 同时只保留 1~2 个活跃 entrypoints
3. 单轮先做最便宜 probe（Foundation 阶段例外：优先信息增益最高的入口）
4. 有效就扩展；无效就 `PARKED / EXHAUSTED`
5. 全部失效后先复盘（见「复盘触发」），再生成新 entrypoints

## Topic / Reference Budget

- 默认 `1` 个主专题 + `0~2` 个辅助专题
- 参考文档按当前主模式按需加载，不要一次性读完整个 `references/`
- 如果主专题不再直接服务活跃 entrypoint，先重选专题再决定是否继续当前脚本族
- 选专题时优先回答：**哪个专题最直接缩短到当前活跃 entrypoint 的验收证据**

## 全网搜索升级

满足以下任一条件时，立即用环境内可用的 web 搜索能力进行全网搜索：
- 同一路线在 probe 阶段连续 2 轮没有逼近验收
- 命中 provider / SDK / protocol 家族高信号
- 出现 `baseline_ok_generated_rejected`、`silent reject`、`200 + 空体`
- 需要借助公开资料纠正 entrypoint / provider / protocol 判断

搜索后立即：记下命中的 provider/family、修正 entrypoint 排序、形成新 probe，然后回到 entrypoint loop。不得搜索后维持原假说却不说明理由。关键结论（query + URL + 影响）最终收进 report.md「经验沉淀」节。

## 复盘（retrospective）触发

满足以下任一条件时，先停下来复盘再继续：
- 同一 entrypoint 或同一主假说在 probe 阶段连续 2 轮没有新增验收证据
- 同一 entrypoint 在 foundation 阶段连续 4 轮（VM/WASM：8 轮）仍无法升级到 probe
- 活跃 entrypoints 全部 `PARKED / EXHAUSTED`
- 同一假说衍生出多份脚本 / 样本，但没有拉近交付
- 当前任务模式 / 交付梯度明显选错

复盘最少要想清楚：已废弃假说与保留证据、新 entrypoint 排序、下一轮最便宜 probe、是否切到全网搜索或浏览器可控复用。复盘结论有价值就写进 report.md「逆向思路」节。

## 停损规则：区分阶段

停损参数以 `docs/reference/stop-loss-parameters.md` 为单一致源。速查摘要：

| 阶段 | 停损轮次 | 有效推进的定义 | 例外 |
|------|---------|--------------|------|
| **Foundation（通用）** | 连续 2 轮无新增基础 mapping / infrastructure / carrier 追踪 → pivot | 新增 hook 面、carrier 追踪、entrypoint mapping | 连续 4 轮仍无法进入 probe → 强制复盘换路线 |
| **Foundation（VM/WASM）** | 连续 2 轮无新增基础 mapping → pivot | 同上 + WASM export/memory/table 枚举 + VM dispatcher 定位 | 连续 8 轮仍无法进入 probe → 强制复盘换路线 |
| **Probe** | 连续 2 轮无新增验收证据 → pivot（第 0 轮观察轮不计入） | 新请求验收证据、新本地复现能力、靠近纯算法边界的证据、直接服务交付的新脚本/样本 | — |
| **Deep-Dive** | 连续 2 轮无新增高价值证据 → 回退上一可验收层 | 新语义边界、新 import/export/thunk mapping、新 direct-call、新 clear-boundary/request-use | — |

以下默认不算有效推进（无论哪个阶段）：
- 更细的 slot / selector / patch family 解释
- 更多同层低价值 hook
- 只是在 Browser / Node 差异上继续细化，但没有逼近交付

### Foundation 硬性完成标准

以下 3 项**全部满足**再从 Foundation 升级到 Probe：
1. **Hook 触发验证**：至少 1 条 hook 在真实页面中触发，输出包含目标字段/参数
2. **Carrier 链路追踪**：已从触发点追到至少 1 个下游关键调用点，且有入参→中间跳转→下游参数的传递证据（仅一跳且中间未知不算）
3. **Entrypoint 覆盖**：已对 ≥2 个候选 entrypoints 完成初步评估

VM/WASM 额外要求：WASM export/import/memory 已枚举、VM dispatcher/handler table 已定位。

### Probe 冷却期

Foundation → Probe 升级后的第一轮为"Probe 第 0 轮"（观察轮），不计入 Probe 的 2 轮停损。

### 降级缓冲与阶段回退

降级后在新梯度至少执行 3 轮才能再次降级。允许从高阶段主动回退到低阶段（保留已建立的 infrastructure），回退不等于放弃。

### 高价值证据与微路线

典型 `microRoute` 包括：`dispatcher naming`、`handler clustering`、`wasm export -> thunk -> table mapping`、`init side-effect recovery`、`string decoder chain`、`control-flow flattening recovery`、`offset / slot / sample statistics`。

以下任一项通常可视为高价值证据：
- 新的语义边界 / import / export / thunk / table / internal mapping
- 新的 direct-call 命中 / first divergence / side-effect 闭环
- 新的可复现输入输出对 / 最小可运行骨架
- 新的可直接服务最终验收的 clear boundary / request-use / business action 证据

以下内容默认不算高价值证据：
- 更多 offset / slot / case label 命名、更多相似样本
- 更整齐的去混淆结果但没有连到业务边界
- 更多 wasm 函数列表但没有 mapping / direct-call
- 更多 handler 数量但没有聚类、调用关系或语义提升

### 语义优先级

默认按离验收边界的距离选择切入点：
1. `request-use`
2. `sign-call / decrypt-call`
3. `payload / clear boundary`
4. `dispatch / action`
5. `reader`
6. `writer`
7. `bridge / carrier`
8. 低层 DOM / storage / script surface

同层 surface 间切换不算真正 pivot。同一家族低层 hook 默认最大 2 轮。

## 各阶段要求

### Observe
- 识别目标与症状、提取 feature bundle、建立候选 entrypoints、明确最小 probe 与成功判据
- Observe 的目标不是"多看一点"，而是尽快形成正确工作面
- 如果当前证据只来自局部切片（如前 256 字节、单个 offset diff），所有规律都只能视为 `provisional`；完成完整边界确认前，不得把局部规律升级为全局算法结论

### Capture
- 优先高语义 hook 面；优先采样直接服务验收的输入、输出、中间值
- 对 stateful signer / decryptor 优先恢复 `carrier -> writer -> state -> reader -> request-use`
- 默认捕获完整输入输出；若 Hook 自动截断（如只记录前 256 字节），基于截断样本不得建立"算法只改了 N 字节"的全局假说
- 至少保留 3 对可交叉验证样本
- 对视频 / 音频 / 分片流，尽量保留 `manifest -> segment -> PES/NAL/frame` 三层映射

### Rebuild
- 把浏览器证据导出成最小本地骨架
- 只重建当前验收真正需要的最小链路；目标是复现最小调用链、关键输入输出、以及第一处有效分歧
- 不要为了"更完整"而无限扩 rebuild 范围；主模式仍是浏览器可控复用时，不要提前升级成纯算法深拆

### Extract（仅 D/E 模式走「扣代码」路线时）
- 触发条件：目标函数夹在打包/混淆 bundle 里，需把它**连同传递依赖从 bundle 抽出在 Node 单跑**
- 先在 `references/composite-triage-playbook.md`「Rebuild 路线三岔决策」确认该不该扣（依赖闭包 ≤ N、不深绑 DOM/网络/会话态 才扣）
- 手法：webcrack unbundle 打底 → webpack 运行时劫持 dump `__webpack_modules__` → 递归抽依赖闭包 → 搭最小 require shim，详见 `references/closure-extraction-playbook.md`
- 产出契约：最小闭包文件 + 依赖清单（入口签名 / 闭包模块 id / 仍需补的外部符号清单）
- 纪律：没产出闭包 + 契约就进 Patch/Verify = 把"扣了一半"当 Rebuild 完成，必然返工

### Patch（补环境）
- 只按 `first divergence` 修补，不由"看到什么就补什么"驱动
- 显式 env error 消失但验收仍失败时，停止泛补环境，回到 Capture
- 先判断是"真实缺失"还是"错误 present"；未经浏览器证据确认的未知全局，不要默认补成 stub

### PureExtraction
- 在 local rebuild 稳定后、且浏览器复用 / 本地骨架已不足以满足交付时才进入
- 目标是锁定纯算法边界；浏览器 harness 已稳定逼近验收且用户只需要请求成功时，不要强行进入

### Port
- 把已提纯边界迁移到 Python / Node / 其他宿主
- 成功标准不是"理解了内部原理"，而是：可运行、可复现、可验证

### Close
- 先跑通最终验证（可运行示例 + 服务端实测），再按 `docs/reference/output-contract.md` 填写 report.md 六节
- 未跑通就如实写未跑通与卡点；不要把"报告已写完"误当 Close 完成

## VM / WASM / DRM 特别规则

默认优先级：
1. 浏览器黑盒复用
2. 明文边界 / clear boundary / appendBuffer / request-use
3. 浏览器内可控复用（Puppeteer/Playwright 精细化操控）
4. Node 复用原始 worker / wasm
5. 纯算法提取
6. 最后才是 dispatcher / slot / bytecode 深拆

前 1~3 已足以完成验收时，不要继续深拆。

VM / WASM 任务的 foundation 阶段（WASM export/memory/table 枚举、VM dispatcher 定位、carrier 识别、动态 import/Blob URL 追踪）通常需要 **6~8 轮**，按 foundation 停损规则管理。不要低估 VM/WASM 的 foundation 轮次：把 6~8 轮当成"正常"而非"异常"。

深入拆解只在以下场景使用：该层已直接控制 `sign / decrypt / request-use / clear-boundary`，且黑盒复用、浏览器可控复用或最小本地骨架仍不足以满足交付。深拆前给自己定 `maxRounds / exitCondition / expectedHighValueEvidence`，无产出就按约定回退上一可验收层。

更多阶段细则：
- 媒体解密继续坚持"内容层验证高于容器层验证"
- 环境值继续按 `env-read / env-transform / env-consume` 追踪
- opaque 解密链优先先做层次诊断、mapping、direct-call 与全网搜索纠偏，再决定是否进入统计采样或纯算法提取
