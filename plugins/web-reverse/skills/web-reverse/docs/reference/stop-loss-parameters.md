<!-- publish: framework -->

所有停损参数的单一致源（自查参考值，无机械门禁——执行者是自己的审计员）。其他文件引用此文件中的数值，不得自行定义。

## 难度分档（所有阈值的前置语义）

复杂逆向（JSVMP/WASM/混合链）是**长积累、突发收益**的认知曲线——dispatcher 定位、bytecode 契约、环境查表在拿到语义前每轮只产出"更多统计"，与通用任务「每 1~2 轮应产出新认知」的阈值标定不匹配。解法是**分档**而非全局放宽：上限管的是 grind 不是难，重混淆档放大预算，宏观停损与「有效推进」判定照常工作，防止预算放大退化成无限 grind。

- 分档依据任务特征自查自定：`standard`（缺省）/ `vm` / `wasm` / `hybrid`。
- 早路由命中 `while(true)+switch`（JSVMP）、WASM 桥接、多保护叠加时，按重混淆档预算执行。

### 分档参数表

| 参数 | standard | vm / wasm / hybrid |
|------|---------|--------------------|
| 同疑点 probe 上限 | 3 | 6 |
| 同族 hook 无证据上限 | 2 轮 | 4 轮 |
| Foundation 连续无新增 pivot | 2 轮 | 3 轮 |
| Foundation 进不了 Probe → 强制复盘 | 4 轮 | 16 轮 |
| 深拆（Deep-Dive）默认 maxRounds | 5 | 12 |
| 深拆连续无产出退出 | 2 轮 | 3 轮 |
| 宏观停损（连续无推进） | 2 轮 | 3 轮 |

达同疑点上限的合法出路（按正当性排序）：
1. **真 pivot**：结构性换线（换语义层或换 entrypoint）。
2. **EXHAUSTED 声明**：该路线被证据结构性否定，明确搁置。
3. **换新疑点**：真正不同的疑点（措辞微调绕计数是自欺）。
4. **renewal（重混淆档免费 2 次）**：续行必须说明**本次失败以不同方式证伪**（例："前 2 次排除了 inline decode，本次证明 bytecode 在 dispatch 前才解密——排除的是另一假设"）。
5. 无理由续行 = grind 合谋，自己叫停。

## 搁置语义：PARKED-EXPENSIVE ≠ EXHAUSTED-DEAD

- `EXHAUSTED-DEAD`：该路线被证据**结构性否定**（关键判据被证伪、前置条件不存在）。
- `PARKED-EXPENSIVE`：该路线**可行但成本高**，当前性价比不足。
- **便宜路线失败 → 强制重审 parked 路线**：当 fallback 阶梯（黑盒复用 → 边界复用 → 浏览器可控 → Node 复用）中的路线因**结构性原因**失败（有具体失败证据，非"没试好"），重审全部 `PARKED-EXPENSIVE` 路线。这条堵住"贵路线被过早收敛 → 便宜路线全灭 → 项目无法推进"的死循环。

## 停损轮次（按阶段）

| 阶段 | 任务特征 | 停损轮次 |
|------|---------|---------|
| **Foundation（通用）** | hook 基础设施、carrier 追踪、entrypoint mapping | 连续 2 轮无新增基础 mapping/infrastructure → pivot；连续 4 轮无法进入 probe → 强制复盘 |
| **Foundation（VM/WASM）** | WASM export/import/memory 枚举、VM dispatcher/handler table 定位、动态 import/Blob URL 追踪 | standard 档 8 轮 / 重混淆档 16 轮无法进入 probe → 复盘；连续无新增 mapping 的 pivot 阈值分档（2 / 3 轮）。export 枚举、内存布局探索、dispatcher 定位消耗 6~8 轮是正常的 |
| **Probe** | 已有 hook/carrier/entrypoint，做具体假设验证 | 连续 2 轮无新增验收证据 → pivot 或复盘 |
| **Deep-Dive** | 深拆微路线（自定 permit：maxRounds / exitCondition） | standard 5 / 重混淆档 12 轮上限；连续 2~3 轮无产出退出，"产出"含结构化产物（vm-* handler 表、trace、dispatcher map）真实增长 |

## Foundation 硬性完成标准

以下 3 项**全部满足**再从 Foundation 升级到 Probe：

1. **Hook 触发验证**：至少 1 条 hook 已在真实页面中触发，输出包含目标字段或目标调用参数（非 mock、非空转、非 console.log 占位）
2. **Carrier 链路追踪**：已从触发点追踪到至少 1 个下游关键调用点，且记录了触发点输入、至少一个中间跳转、下游调用参数；仅"触发点→XHR 发送"一跳且中间完全未知不算
3. **Entrypoint 覆盖**：已对至少 2 个候选 entrypoints 完成初步评估（成本/信息增益/复用价值排序），当前活跃 entrypoint 不是"唯一猜测"

VM/WASM 任务额外要求：WASM export/import/memory 已枚举；VM dispatcher/handler table 已定位。

## Probe 冷却期

Foundation → Probe 升级后的**第一轮**为"Probe 第 0 轮"（观察轮），不计入 Probe 的 2 轮停损；发现 foundation 不完整允许降回补充。Foundation→Probe 循环最多 **2 次**，第 2 次从观察轮降回后必须切换 entrypoint 或复盘。

## 降级缓冲

降级后在新梯度至少执行 **3 轮**才能再次降级（适应期不触发停损 pivot，但仍需有效推进）；连续两次"提前降级"= 该触发复盘了。降级时想清楚：为什么当前梯度太高（具体证据）、哪些高成本路线被暂停（不是放弃）、降级后的最小交付目标。

## 阶段回退协议

允许从高阶段主动回退到低阶段，保留已建立的 infrastructure：

| 回退触发条件 | 回退路径 | 保留内容 |
|-------------|---------|---------|
| Foundation 不完整（hook 空转、carrier 链路断裂） | Probe → Foundation | 已建立的 hook 脚本、carrier 追踪日志、entrypoint 评估 |
| 关键未知项仍在会话态/生命周期/request-use，不是算法边界 | PureExtraction → 浏览器可控复用 | 已提纯的算法片段、边界映射 |
| 连续 2 轮 probe 无证据 + 交付梯度与验收目标不匹配 | 当前梯度 → 下一低梯度 | 所有已验证的 hook/carrier/entrypoint 链路 |
| 深拆路线成本超过对最终交付增益的 2 倍估算 | Deep-Dive → Probe | microRoute mapping、高价值证据记录 |

回退纪律：回退不是"放弃"，是"换一条更便宜的路"；回退后想清楚原因、保留内容、回退后的第一条 probe。entrypoint 选择错误导致的回退需要复盘重排序；仅 foundation 不完整的回退补充后继续。

## 深拆许可（Deep-Dive，自查五字段）

深拆（dispatcher/bytecode 等微路线）属于高成本路线，进入前自问并写进工作笔记：

| 字段 | 含义 |
|------|------|
| `subgoal` | 本次深拆要解决的具体子目标（不是泛泛"看懂 VM"） |
| `milestone` | 可观测里程碑（VM 档建议引用 `references/vmp-playbook.md` 的 M1/M2/M3） |
| `maxRounds` | 本微路线轮次上限（standard 5 / 重混淆档 12） |
| `exitCondition` | 退出条件（达成 / 超轮 / 连续无产出） |
| `expectedHighValueEvidence` | 预期的高价值证据形态 |

permit 结束（达成、超轮、或连续 2 轮无高价值证据）后，**回退到上一可验收层**——黑盒复用 / 浏览器内可控复用 / Node 侧复用，并复盘重选入口，**不要在原微路线硬顶**。

## 「有效推进」判定（区分新线索 vs 同一失败的新变体）

停损计数的关键是判定每轮是否**有效推进**——不是"有没有产出动作 / 新脚本 / 新数字"，而是"是否真的逼近验收"。以下统一归入**不算有效推进**：

- 更细的 slot/selector 解释、更多同层低价值 hook、只在 Browser/Node 差异上细化但不逼近交付
- **换图像识别算法/参数（或换识别库、调阈值、改预处理）但端到端通过率仍为 0**——同一识别/求解路线连续多轮产出"新脚本 + 新数字"却始终未通过服务端验收，属于**同一失败的新变体**，不是新线索。判据：成品脚本内容变了，但端到端结果仍为失败
- 同理，任何"换实现但验收边界未移动"的迭代（换签名实现、换补环境壳、换求解器但请求/校验仍失败）都按同一失败变体计

反之，"handler 映射表真实长大"这类结构化积累**算推进**——JSVMP 积累期不会被误判为零推进，这是分档放大敢放开的前提。

## 参数汇总

| 参数 | 值 | 适用范围 |
|------|----|---------|
| Foundation 通用 maxRounds | 4 | 通用任务 |
| Foundation VM/WASM maxRounds | 8（standard）/ 16（重混淆档） | VM/WASM/混淆任务 |
| Foundation 连续无新增 pivot 阈值 | 2 轮 / 3 轮（重混淆档） | 所有 Foundation |
| Probe stop-loss 阈值 | 2 轮 | 所有 Probe |
| Deep-Dive 默认 maxRounds | 5 / 12（重混淆档） | 所有 Deep-Dive |
| Deep-Dive 连续无产出退出 | 2 轮 / 3 轮（重混淆档） | 所有 Deep-Dive |
| 同疑点 probe 上限 | 3 / 6（重混淆档） | 所有阶段 |
| 同族 hook 无证据上限 | 2 轮 / 4 轮（重混淆档） | 所有阶段 |
| 宏观停损（连续无推进） | 2 轮 / 3 轮（重混淆档） | 所有阶段 |
| Probe 冷却期 | 1 轮 | Foundation→Probe 升级后 |
| 降级缓冲 | 3 轮 | 任何降级后 |
| Foundation→Probe 循环上限 | 2 次 | Foundation/Probe 边界 |
| Entrypoint 活跃上限 | 2 | 所有阶段 |
| 候选 entrypoints 最小数 | 2 | Observe/Foundation |
| 同类脚本/样本衍生上限 | 3 | 所有阶段 |

## 引用纪律

- SKILL.md、reverse-workflow.md、deliverable-ladder.md 中的停损数值**必须**与此文件一致
- 修改停损参数时，只改此文件；其他文件通过引用保持同步
- 速查表中的数值与此文件冲突时，以此文件为准
