# 验收条件总表（acceptance-criteria）

close 前必读。本表汇总 verify-once 与 closeout gate 的全部机器校验规则，每条附源码锚点；词汇表段落由生成管线注入，勿手改。

## 1. verify-once 检查类清单（`runFormalValidation`）

锚点：`tools/task/validation.mjs` `runFormalValidation`（task-close 在 closeout gate 前自动重跑并持久化 `validation.status`）。

1. 必备文件存在：`task.json` / `report.md`（report-only 改造：`run/fixtures.json` 验收登记机制随过程门禁整体退役，判据验收由 completionCriteria hit + evidenceRefs 承担）。
2. 任务契约：`objective` / `deliverableTier` / `completionCriteria` 非空（`validateTaskContract`）。`deliverableTier` 须为五枚举之一：`evidence / hook-script / patch / protocol-doc / pure-algorithm`（单源常量 `DELIVERABLE_TIERS`）；非法值直接 error，**不享受任何豁免**（含 run-local 占位豁免与 topic 豁免桶）。`taskPacks.excludedTopics` 非空且 `selectedTopics` 为空（**全摘**）→ error：「excludedTopics 摘除了全部已分流 topic；如确为误分流请删除 excludedTopics 条目，或用 webShellTriage.verdict 通道声明非 Web 套壳」。诚实声明：累进式逐 topic 摘除路径（selectedTopics 非空）仅经 closeout warnings `[manual-override]` 留痕可见，**约束未完全闭合**，不阻断。
3. `report.md` 实质内容达标（`validateReportSubstance`，report-only 改造收口门禁）：仍是模板骨架 → error；去空白实质内容 < 600 字符 → error；achieved 收口缺「任务摘要 / 实现路径 / 验证证据」任一节 → error；`closeoutMode=partial/infeasible` 缺「未竟事项」节或该节 < 200 字符 → error。**原过程文档门禁（`run/investigation.md` 调用链 / `run/plan.md` 引用 / `run/assumptions.md` 无 OPEN / report 当前阶段·下一步·自动续跑决策节 / 专题 notes 文件）已全部退役**，语义并入 report.md 章节校验。
4. `task.phase` 合法且不是模板任务（`taskId=replace-me` 或 `_TEMPLATE` 不得通过）。
5. 声明本地复现交付时，report 的「本地复现交付」节条目齐备（`validateLocalReproductionDelivery`）。
6. 交付物评估通过（`evaluateDeliverables`）。
7. 壳/脱壳证据充分（`validatePackerUnpackEvidence`）。
8. 路线一致性（`evaluateRouteConsistency`）。
9. 阶段产物满足当前 phase 要求（`validatePhaseArtifacts`；其中 `run/run-local.mjs` 实现物仅 `deliverableTier ∈ {hook-script, patch, pure-algorithm}` 时强制，`evidence / protocol-doc` 类规划/分析交付豁免）。
10. 交付分层与 `deliverableTier` 一致（`validateDeliverableTierConsistency`）。
11. 需要备份时 `run/backup-manifest.md` 合格（`validateBackupManifest`，见第 8 节）。
12. 已确立 topic 的 formalValidation 义务满足（`evaluateTopicFormalValidation`，按 topic.json 的 presentPath/义务清单；report-only 改造：`requiredArtifacts` / `touchedAny` 文件门禁退役，专题验收改为 report.md 专题小节谓词 `reportSection`（正则匹配标题）+ `minChars`（该节正文最小长度），见各 `topics/<key>/topic.json`）。

## 2. closeout gate 7 类（`evaluateCloseoutGate`，closeoutMode=achieved 默认路径）

锚点：`tools/task/validation.mjs` `evaluateCloseoutGate`。

> 义务清单指引（round1 P0-2）：开工与每次 sync 时，`task-init` / `task-sync` 会输出 `[closeout-obligations]` 义务清单（必做 + 条件项），与本章门禁同源取数；把它当作事前待办看待，可把 dry-run 的剩余 finding 压到接近零。

1. `validation.status=passed`（verify-once 必须先过）。
2. `successCriteria` 至少一条命中（见第 3、4 节）。
3. `completionCriteria` 全部命中。
4. 每条命中的 `completionCriteria` 必须携带合法 `evidenceRefs`（见第 4 节）。
5. env 任务（`envConformance.present`）必须记录 `firstDivergence`。
6. vm 任务（`vm.present`）`opcodeCoverage` 不得为 `0%`，除非 `vm.triageResult=blackbox`（blackbox 路线建议记录 `vm.blackboxApi`）。
7. **多 Agent 协作签字（仅 multi 任务，`resolveExecutionModel`）**：close 前须有 `verdict: PASS` 的 completion-claim 审计经 `task-dispatch --collect` 入账，且当前相位有 dispatch 通道任务包 + PASS 审计增量、通道/时序判据全绿（错误前缀 `collaboration[code]`，协议见 `docs/reference/multi-agent-orchestration.md`）；single/legacy 任务本条整体跳过。`task-advance` 侧另有同款相位推进门禁（不要求 completion-claim）。

自损防护（文档规则，零代码）：手改 `task.json` 后必跑 JSON.parse 自检——`node -e "JSON.parse(require('fs').readFileSync('<taskDir>/task.json','utf8'))"`。整文件手写 JSON 的重复键/吞行自损（B 会话 L559-584 形态）靠本规则固化，不设新工具。

`task-close --dry-run` 的 validation 状态改道 `run/validation-last.json`（`status/lastVerifiedAt/notes` 与 `task.json` validation 字段同构），不写 `task.json`；closeout gate 在 `task.json` 非 passed 时回读该文件。

## 3. successCriteria hit 要求

`successCriteria` 与 `completionCriteria` 共用同一套命中词汇表（`criteriaItemHit`），closeout 要求 successCriteria 至少一条命中。确未达成目标时不要伪造命中，改走 `closeoutMode=partial / infeasible`（见第 6 节）。门禁只验形状，内容须为真实证据。

## 4. 命中词汇表与 evidenceRefs 形态（单源注入）

<!-- BEGIN GENERATED: criteria-vocabulary -->
本段由 `tools/task/validation.mjs` 的导出常量单源生成（sync-doc-facts 注入，勿手改）。

命中词汇表（`completionCriteria` 与 `successCriteria` 通用，`criteriaItemHit`）：
- 对象形态：`hit: true`，或 `status` 取值之一：`hit / met / passed / done / satisfied`
- 字符串形态：以 `[x]` 开头

`evidenceRefs` 合法形态（三选一，逐条核查，`criterionEvidenceRefValid`）：
- task-local 相对路径，指向已存在且非空的证据文件（与模板逐字一致的占位文件不算证据）
- `用户确认:<原文>`（等价 `user-confirmation:<原文>`）
- `call_xxx` 引用形式，须同时提供 `evidenceExcerpt`（或 `excerpt` / `evidenceContent`）

`deliverableTier` 五枚举（`DELIVERABLE_TIERS`，非法值直接 error、不享受任何豁免）：
- `evidence`
- `hook-script`
- `patch`
- `protocol-doc`
- `pure-algorithm`
<!-- END GENERATED: criteria-vocabulary -->

`evidenceRefs` 读取键（`collectCriterionEvidenceRefs`）：`evidenceRefs[]` / `evidence[]` / `evidenceRef` / `evidence`（字符串）。

## 5. 复盘与「未竟事项」节

route-plan.md 中以 `#### RETRO-NNN` 四级标题书写的复盘节仍会被解析进 `route-state.json` 的 `retrospectives`（锚点：`tools/task/route-state.mjs` `collectHeadingSections`），作为可选续跑骨架语义保留；**report-only 改造后 closeout gate 不再要求 retrospective**。`closeoutMode=partial / infeasible` 的复盘语义由 `report.md` 的「未竟事项」节承接（见第 6 节）。

## 6. closeoutMode 三态

锚点：`tools/task/validation.mjs` `evaluateCloseoutGate` / `evaluateInfeasibleGate`。

- `achieved`（默认）：走第 2 节 6 类全量门禁。
- `partial`：目标部分达成，走 infeasible gate 豁免 achieved 门禁。
- `infeasible`：目标不可行，走 infeasible gate。

infeasible gate 要求（report-only 改造，原 `run/infeasible-analysis.md` 门禁退役）：`report.md` 存在「未竟事项」节且该节正文 ≥200 字符（含根因与已排除路线）；若 `packerUnpack.vmp.toolRoutes` 非空，至少一半路线评估为非 `not-evaluated / candidate` 状态，且「未竟事项」节点名至少一条已登记路线名。

## 7. pure-* 本地复现约定

锚点：`tools/task/validation.mjs` `collectPureFiles` / `validateLocalReproductionDelivery`。

任务根目录或 `run/` 下命名形如 `pure[_-]*.js / .mjs / .cjs / .py` 的文件被识别为本地算法实现（如 `run/pure-license-check.js`），供「本地复现交付」节与 `deliverableTier=pure-algorithm` 交付核查引用。

## 8. backup-manifest 格式

锚点：`tools/task/validation.mjs` `validateBackupManifest`。

`phase ≥ Patch` 或 `deliverableTier=patch` 时，`run/backup-manifest.md` 必须存在且包含至少一条 64 位十六进制 SHA256 哈希条目（每个备份文件一行：原始路径 + `.clean.bak` 路径 + sha256）。备份可放 `run/` 之外：manifest 第二列登记备份绝对路径即纳入核对（发现源 = `run/` 扫描 ∪ manifest 登记，advance 与 close 两侧同源）。哈希断路器见 `tools/task/task-advance.mjs`：备份文件与清单哈希不一致时推进被阻断。

closeout fail-closed（V3-6）：上述备份需求命中且 `run/` 存在 `.clean.bak` 时，close 逐条核对 manifest——**解析不出原始路径（格式错误）升级为 error**（advance 宽容期仅 WARNING，且 advance 会预告本升级）；路径解析成功但原始文件已合法清理（不存在）维持 WARNING，不误挂。close 侧另对同一映射做 WARNING 级哈希比对（不一致且未见 `run/hash_mismatch_authorized.flag` 时告警，不升 error，维持裁 8 分层；物理阻断仍只在 advance 侧）。

诚实注记：manifest 的 sha256 列仅留痕用途，门禁不做内容比对；断路器实际比对的是**原始文件当前哈希 vs `.clean.bak`**（`readBackupManifestMap` 解析出的映射逐条 sha256 核对）。该机制防事故（脏现场/盲改），不防蓄意覆盖 `.clean.bak` 本身。

义务清单指引（round2 G-09 收口）：`task-init` / `task-sync` 输出的 `[closeout-obligations]` 清单在 `phase ≥ Patch` 或 `tier=patch` 时列出本节 backup-manifest 条目（产物含 SHA256 条目后自动消失）——把它当事前待办看待，可在 advance 触发断路器之前消除该类阻断。

## 9. 诚实注记（机制边界登记）

以下残余为机制边界外的已知面，不阻断、不修，仅登记：

- (a) RT-1b 重扫候选来自 agent 可写 `targetContext`，无候选即不重扫，sync/close 两侧同。
- (b) RT-2a/2b + C1 残余：删日志/伪造 baseline 行对末行比对天然免疫；first-sight baseline 信任首次观测值，close 前篡改天然隐身，close 侧以 first-sight WARNING（`[manual-override] contract baseline first observed at close`）把「静默」降级为「必有 WARNING」（Q3'-B 锁为已知残余）。
- (c) MCP 权限形式须用服务器名前缀（`mcp__cheatengine`），尾双下划线形式不匹配任何工具（G2，环境层）。
- (d) 判据 4 只验形式（存在+三列），时效（降级后 5min 内落盘）与计数准确性列复测人工核对项。
- (e) W6 存量未排序 baseline 首遇归一比对的一次性单行 changed 留痕（方向可见无害）。
- (f) verify-once 模板脚本独立直跑路径无 drift 留痕（勘察 §1 风险 2 硬性登记）。
- (g) drift 跟踪面仅 `deliverableTier` / `excludedTopics` 两字段，`completionCriteria` / `successCriteria` / `deliverableRequirements` 等其余契约字段直 close 篡改无留痕（勘察 §6.3 硬性登记）。
- (h) 伪造 no-hit 结果文件且**不声明 verdict** 时，豁免不产生任何 WARNING 级留痕（仅 write-diff 遥测），sync/close 两侧同；close/sync 的有界重扫只对 verdict 声明者或「无有效结果文件」者发起（`:173` 早返），即重扫只堵 verdict 声明者（N1）。
- (i) 零前态任务（`webShellTriage` 从未物化）在 close 侧重扫只固化证据文件、义务不激活（apply 首行守卫 + `freezeNewTopics`）——close 咽喉对此打 `[manual-override]` WARNING（N6），但「close 侧首命中义务即刻生效」仅对已有 `webShellTriage` 前态的任务成立。
- (j) W5 已收窄（round1 P0-4）：框架自产分流行统一携带机器标记 `[auto-route]`，topic 推断语料过滤**仅认含该标记的行**；agent 自然语言复述「自动分流」（无标记）不再使同行真实证据陪葬（量化案例中的 winhttp/schannel 证据行不再被误杀）。
- (k) `task.json` 的 `routeState.progressPath` 字段保留为 **legacy**（round1 P0-3a）：progress.md 视图、渲染写盘、存在性检查、out-of-sync 比对与相位-轨道门禁已全部删除；字段仅在模板与 `ensureTaskRuntimeShape` 默认值中保留，兼容既有任务与 QA 夹具，不再被任何门禁消费。

## 10. `packerUnpack.vmp.mode` 事实语义（round2 登记）

锚点：`tools/task/validation.mjs` `validatePackerUnpackEvidence`。

- **无封闭枚举**：`vmp.mode` 不设合法值门禁；禁止自造语义值充当枚举使用。
- **机器消费值仅两个**：`virtualized` / `mixed`（validation.mjs 内仅这两处分支消费 mode）；其余任何取值一律按**非虚拟化**处理，且必须以 `vmp.versionEvidence` 附证据说明取值依据。
- **`marker-only` 属胁迫期历史产物，勿模仿**：旧门禁在语料命中时以 error 胁迫任务填写 VMP 字段，曾产出该类自造值；回归夹具见 `tools/qa/fixtures/vmp-coerced-dirty-task.json`（污染数据资产化）。
- **残余风险显式声明**：本机制防疏忽与防胁迫，不防蓄意对抗。任务语料净提及 VMP（主特征词命中，或独立暗示词净命中 ≥2）时，sync/init 义务清单出现分诊探测行、dry-run/close 出现 `VMP_CORPUS_WARN_MESSAGE` 分诊 WARN 点名——两者均为提醒级，永不胁迫 `present:true`。
- 词表正式设计延后至轮3（UPX/VMP 特征用例集校准批）；否定语境词表的后续扩充同样走本文件登记。

## 11. 否定过滤方向感知校准登记（round3 H-09 / R3'-08）

锚点：`tools/task/validation.mjs` `matchHitsWithoutNegation`（方向分治判定块）。

- **通则定位**：汉语否定方向二分是**语言层通则**，非样本定制——前置否定（否定词位于命中词之前）紧邻杀伤半径收窄至 ≤4 字符并排除副词性用法（`不(?![仅但过])` lookahead）；后置谓语否定保留 ±40 宽前向窗；多字否定词维持 ±40 双向窗不变。
- **词表扩充登记程序**：单字否定词集合现为 `无 / 不 / 非`；任何增删（含把 `未` 提升为单字否定词）必须先在本文件登记再改码，禁止无登记调参。
- **残余边界如实登记**：「样本不含虚拟化，但存在独立 VM entry 结构」型单 hint 句在 hints≥2 门槛下不触发 mention（VM entry 被 ≤4 紧邻窗抑制、仅余 1 个净 hint），属 **D1 抗噪设计边界**，不作缺陷追修；十句矩阵中该句以 expectMention=false 固化此边界。
- **外推边界注记**：英文语料由 `not / no / without` 多字否定词覆盖，±40 双向窗语义未变，本轮校准不影响英文行为。
- **回归矩阵**：`tools/qa/check-task-behavior.mjs` `scenarioVmpNegationContextFiltering` 十句（原五句 + M-P03 两句实证 + 副词性反例 + 前置否定远距离反例两句）；deny 反向闸零改动。

## 12. round3 登记维护批（round3 H-12 / R3'-14）

1. **预算律可调参数登记**：动态通道试错预算律的 K=12 与触发 B 的「第 2 次」为可调参数（规则文本见 `references/fallbacks.md`「动态通道试错预算律」节）；**任何调整必须附新一轮实证的双锚点数值**（首个目标数据出现序位 + 其后零目标数据沉没段），禁止无锚点调参。
2. **N-E 登记（契约旗标脱钩设计问题，交轮4裁决）**：`deliverableTier=pure-algorithm` × `localReproductionRequested=false` 时是否应由 init 自动耦合 replay 交付义务——属契约语义变更需设计评审。附轮3前证据：flag=false 时 pure-* 相位门在 sync 预览中盲区达 100%（连 informational 行都未出现）；本轮已以相位普适 conditional 行（H-04）闭合预览面，旗标耦合语义仍待裁。
3. **N-F 登记（人因依赖度观察列定义）**：复测逐条记录用户实质介入次数/类型，分类＝口供确认 / 点击操作 / 纠错指令 / 质询澄清四类；不入硬指标门槛（单样本不足立法），作 §5 记分卡观察列。
4. **环境事实登记两条（均不在本仓修）**：
   - idalib 断连正面恢复案例：health 探活 → reopen 恢复会话，`.i64` 热启动场景 2 次调用内恢复工作（正面基线，供断连处置参考）；
   - frida Memory 读 API 族缺失事实指针：本部署 execute_in_session 通道 `Memory.*` 读 API 可能整体缺失（成因代理裁剪 vs 运行时版本差异待环境侧确认）；探活方法与行为特征见 `references/frida.md`「部署差异登记」节。
5. **链式命令行为诱因说明**：`task-advance --to=X && task-close --dry-run` 同命令链执行使新武装义务错过 advance 与 dry-run 之间的 sync 预览点——一半行为一半结构；结构侧已由 advance 相位跃迁快照行（H-05）兜底，行为侧残留风险以「链式命令诱因计数」列入复测观察列。

## 13. 止损计数语义与分级预算登记

锚点：`references/anti-shortcut-system.md`「尝试计数语义」「路线预算分级」「转向动作四级阶梯」三节；`references/fallbacks.md` 预算律「方法层对齐」行；各专题 reference「止损衔接」节（`vmp-unpack-playbook.md` / `game-reverse.md` / `malware-analysis.md` / `dotnet.md` / `app-protocol.md`）。

1. **可调参数登记**：
   - L1 变参重试上限 = 3（沿承既有硬止损，未调整，无双锚点义务变化）；
   - L2 探针预算 = 复用预算律 K=12（共享 §12.1 双锚点：首个目标数据第 19 次调用 + 其后 15 次沉没段），不设独立常数；
   - L3 检查点单元为**结构单元计数**（VMP：handler×10 / trace 段×10；游戏：指针链×20 / GObjects/GNames 段×10；恶意软件：隐蔽机制假设×5；.NET：混淆层×1；协议：协议层×1），非时长/次数止损阈值——首轮不设实证锚点义务；若后续改为数值阈值，须按 §12.1 双锚点程序补证。
2. **approachHistory 机器层缺席登记**：历史文本曾要求把转向历史写入 `route-state.json.approachHistory`，但 `tools/task/route-state.mjs` 无该字段实现——写入会在下次 sync 重写时被丢弃。report-only 改造后过渡口径进一步简化：转向记录汇入收口 `report.md` 的「实现路径 / 坑点与经验」节（route-plan.md RETRO 复盘块保留为可选续跑骨架）。机器落地列为后续候选：entrypoint 计数字段（routeClass / iterBudget / iterUsed / progressMarks）、`approachHistory` normalize。
3. **定性声明**：本节规则为 advisory 自律级，与预算律同级，无会话内强制机制；审计可见性依托收口 `report.md` 的「坑点与经验」节与可选 `state/clues.md` 账本，不伪装机器兜底。
