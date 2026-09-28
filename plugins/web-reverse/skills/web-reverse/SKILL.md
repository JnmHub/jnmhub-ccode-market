---
name: web-reverse
description: Web 前端逆向：还原签名/协议/加解密、请求参数与 cookie 加密、反爬虫/风控字段；处理混淆/反调试/反篡改与反混淆还原；分析 Worker/WASM/JSVMP 运行链；小程序（wxapkg 解包、AppService 逻辑层、接口签名复现；兼及支付宝/抖音）；扣代码/最小闭包提取、补环境（Node/Python 复现）、浏览器内复用或纯算法迁移；指纹检测、DevTools hook、source map 还原；或继续已有 Web 逆向任务。不用于普通前端开发、漏洞利用、Android 逆向。
---
# Web Reverse

这是一个**方法论知识库 + 极简任务契约**：本文件锁定验收目标、给出逆向方法论、把任务路由到正确的 reference / workflow。细则一律按需读 `references/` 与 `docs/reference/`（见末尾路由表）。

要优先消灭两种失效模式：

- **目标漂移**：用户要 A，执行中偷偷降成 B，还把 B 说成完成。
- **虚假完成**：没过最终验证就说"已完成 / 已交付"。局部样本、单点成功、容器可读、浏览器偶发成功都不算验收。

过程**零强制记录**——不要求任何阶段性落盘、汇报或状态维护；唯一的文档义务在收尾（见「收尾契约」）。

## 何时使用

还原签名/认证参数/挑战链/风控字段；分析混淆 JS、动态代码、source map、反调试、反篡改；分析 Worker/iframe/多上下文、JSVMP/自定义 VM/WASM/媒体解密；小程序（微信 wxapkg 解密解包、AppService 逻辑层分析、接口与签名复现；支付宝/抖音等按同一主链平移）；基于浏览器证据做 Node/Python 复现、纯算法迁移、浏览器内可控复用；或继续已有任务（`artifacts/tasks/` 下的任务目录）。

不适用：普通前端开发、密码学教学、漏洞利用 / 渗透或其它非 Web 前端逆向。微信客户端本体 / APK / native 层逆向归 android-reverse / win-reverse（小程序 JS 与接口层归本 skill）。

## 北极星：以验收为唯一目标

目标不是持续汇报新发现，而是**尽快逼近用户验收目标**。每个动作前先自问：① 用户最终交付是什么；② 这个动作是否直接缩短到该交付；③ 当前路线是否还值得再走一轮。研究型收敛 ≠ 交付型推进。

## 两条红线（其余都是指引，唯这两条不可退让）

1. **产物集中**：任何分析 / 浏览器操作 / 写文件前，先在**当前项目目录**执行 `node $TOOL_DIR/task-init.mjs <task-id>`——唯一开机命令，幂等（目录已存在则只锚定不动文件），只创建任务目录 `artifacts/tasks/<task-id>/` 和唯一骨架文件 `report.md`。本任务产生的**每个**文件（脚本/样本/中间数据）都落在这个任务目录里，cwd 根只允许项目元文件；成品脚本建议以 `pure-` 前缀命名便于识别。`$TOOL_DIR` = 本 skill 包内 `tools/task/` 的绝对路径；Windows 路径用正斜杠。
2. **完成必须可验证 + 收尾必写 report.md**："已完成 / 已成功 / 已交付"只能在**最终示例代码真实跑通**（可独立运行、服务端实测成功——挑战链 / 验证码类任务的验收 = 端到端服务端返回成功，不是"格式被接受 / 字段齐全"）之后说。**任务完成（或明确终止）时**，把逆向过程全面总结写进 `artifacts/tasks/<task-id>/report.md`（必填小节见骨架内注释；契约细则 `docs/reference/output-contract.md`）。交付物 = 可运行示例 + report.md，不是口头宣称。

## 任务模式与交付梯度

先选 1 个主模式，每轮**只保留 1 个主模式 + 最多 1 个备用模式**，不要为"更完整"提前升级：

- **A 请求验收**：请求成功、字段被接受、挑战链闭环。
- **B 内容/明文边界恢复**：clear boundary、内容层验证、可验证明文。
- **C 浏览器内可控复用**：把浏览器当 harness（Playwright/Puppeteer/DevTools）完成验收。
- **D 本地复现 / Port**：交付 Node / Python 最小可运行骨架。
- **E 纯算法提取**：仅当 A~D 都不足时才升级。

若当前梯度连续 2 轮无法推进，主动降级而非硬顶。用户明确要"纯 Python/Node、不依赖浏览器"时，浏览器 harness 只能算中间证据。详见 `docs/reference/deliverable-ladder.md`。

## 专题路由与按需加载

先做**早路由**：从 feature bundle 选 **1 个主专题 + 0~2 个辅助专题**，不要先读一堆细则再决定。`references/`、`docs/reference/`、`topics/*/topic.json` 一律**按需加载**，默认只读与当前主模式直接相关的 playbook。命中组合保护 / 跨上下文 / 混合运行时才扩到 3 个以上专题。判定见 `docs/reference/topic-selection-policy.md`、`docs/reference/capability-matrix.md`。

## 执行循环（方法论，无记录义务）

`Observe → Capture → Rebuild → Extract → Verify` 逐轮推进，每轮产出服务于最终交付的实物（脚本/样本/结论）：

- **Observe**：识别目标、feature bundle、候选 entrypoints、初始 family/boundary。
- **Capture**：采集服务验收边界的输入/输出/中间值/状态链。
- **Rebuild**：把证据转成最小可运行骨架（Node/Python/浏览器 harness）。
- **Extract**：扣代码路线产出最小闭包 + 依赖清单 + 入出口契约（导出函数签名）。判定/阈值/handoff 见 `references/closure-extraction-playbook.md` §0 与 `references/composite-triage-playbook.md`「Rebuild 路线三岔决策」。
- **Verify**：围绕**最终交付**直接验证，不是局部成功。

## Entrypoint / Hook 纪律

1. 先列 2~5 个候选 entrypoints，按成本 / 信息增益 / 复用价值排序；**同时只保留 1~2 个活跃 entrypoints**。
2. 每个 entrypoint 激活时定义 `minimalProbe / successCriteria / failureCriteria / maxRounds`。
3. Foundation 阶段优先**信息增益最高**的入口；Probe 阶段优先**最便宜**的 probe。
4. 有效就扩展，无效就 `PARKED/EXHAUSTED`；活跃路线全失效先做一轮复盘再生成新入口。

Hook 语义优先级（高 → 低）：`request-use` → `sign/decrypt-call` → `payload/clear boundary` → `dispatch` → `reader` → `writer` → `bridge/carrier` → 低层 DOM/storage/append/script surface。优先命中**高语义 hook 面**；在 `cookie setter → cookieStore → script.src → appendChild` 这类低层 surface 间切换**不算真正 pivot**。同一家族 hook 连续 2 轮（重混淆档 4 轮）没拿到新可执行证据就换语义层或换 entrypoint。

**工具无关落地**：把语义层落到你手上浏览器工具（chrome-devtools / js-reverse / stealth-browser / 其它 CDP）的具体能力，先做工具探测、再查能力映射表 `references/browser-mcp-capability-map.md`。**纪律：sign-call 取证用「钩函数抓入参/返回」能力，不要用反复盲注 `evaluate_script` 代替**；断点暂停期间禁止并发 evaluate_script（互斥挂死）。**浏览器工具锁定**：整条任务只用同一个浏览器工具/实例——换实例 = 风控指纹变化，会丢会话或拿到假挑战污染整条逆向；确需更换先向用户说明。

**假设先行（自查纪律）**：Hook/打印是为了**理解算法**，不是"撞答案"。每次 Hook 前心里先写下假设（"我预期看到 X，它能区分 A/B 两种可能"）；同一疑点 standard 任务 3 次、JSVMP·WASM·混合链 6 次仍未推进认知，就回退重判保护类型/换语义层/换疑点，而非继续刷 dump——把成百上千次 Hook 当进度 = 失败。JSVMP 这类"长积累、突发收益"的任务，结构化产出（handler 表、trace、dispatcher map）落成文件即算推进，积累期不算停摆。唯一成功判据是验收闸门跑通（见「算法自检与服务端验收」）。

## 速查：加密类型快速判断 / 定位参数 6 手段

**A · 加密类型快速判断**（拿到生成函数代码后）：

| 特征 | 类型 | 进哪条路线 / reference |
|------|------|------------------------|
| `CryptoJS`/`AES`/`DES`/`pkcs1` | 标准加密库 | Hook 库函数拿 key/iv/明文 → 纯算复现（`userland-crypto-playbook.md` / `subtlecrypto-playbook.md`） |
| 超长 base64/hex + `while(true)+switch` | JSVMP/VMP | `vmp-playbook.md` + `scripts/vm/jsvmp-instrument.cjs` |
| `_0x` 变量 + 大数组 + 自执行函数 / 多个 `push/shift` | OB 混淆 | `scripts/deob/deob-ob.cjs` → 失败转 `string-array-deobfuscation-playbook.md` |
| `atob`+`%s`+`.wasm` | WASM | `wasm-jsvmp-bridge-playbook.md` / `wasm-binary-analysis-playbook.md` |
| 包文件 `V1MMWX` 头 / `app-service.js` / `wx.request`（`my.request`/`tt.request` 同族） | 小程序（miniapp） | `miniapp-playbook.md`（总纲+平台矩阵）→ `wechat-miniprogram-playbook.md`（微信深挖） |
| `eval(`/`new Function(` 动态执行 | 动态执行混淆 | Hook eval/Function（`dynamic-code-playbook.md`） |
| `n(moduleId)` 模块加载 | webpack 打包 | 扣代码（`closure-extraction-playbook.md` / `bundle-loader-playbook.md`） |
| 出现 `gettype`/`w` 参数/滑块图 | 验证码 | `captcha-slider-playbook.md` |

**B · 定位参数的 6 个手段**（已知参数名）：

1. 抓包建图谱，确认密文参数名、字符集/长度（hex? base64? 定长?）
2. XHR/Fetch 断点；或 Hook `XMLHttpRequest.prototype.open`/`fetch`/`setRequestHeader`
3. `get_request_initiator`（MCP）或调用栈面板拿生成调用链
4. 全局搜参数名/`encrypt`/`sign`/`CryptoJS`/特征常量
5. 断在 `send` 逐帧上溯到赋值行（混淆先 AST 还原再断点）
6. 用日志断点（`console.log(arg)`）代替普通断点，避免影响执行流 + 规避计时型反调试

## 算法自检与服务端验收（双闸门）

D/E 模式（本地复现 / 纯算法提取）的验证拆成两道**独立**闸门，把"算法错"与"补环境错"解耦：

1. **算法自检**（先）：`python scripts/verify/verify-algo.py --impl run/pure-xxx.py --fixtures run/fixtures.json`——钉死随机源后纯算输出与浏览器输出**逐字节相等**，验算法对不对。
2. **服务端验收**（后）：`run/verify-once.mjs` 或 `python scripts/verify/verify-offline.py`——脱机纯算生成参数被服务器**稳定接受**，对随机天然免疫。

两者共用实现契约 `generate(ctx, pinned=None)`（`pinned=None` 随机照常＝验收；`pinned` 给定替换随机源＝自检）。**勿用朴素字节比对当验收**——签名含随机/时间戳，只有控制变量下才该逐字节相等。细则 `references/algorithm-selfcheck-playbook.md`。

## 搜索纠偏（强建议，无门禁）

外部搜索是**路线纠偏器**，不是证据替代品：

1. **已知 provider 首轮即搜**：用户提示词、页面证据或分诊任一确认目标是已知商业保护或验证码 provider，在本地深挖**之前**先做一轮结构化搜索（GitHub→全网两级，query 用 provider 名 + host + 关键字段）。这类 provider 有大量公开逆向资料，零搜索硬啃在本技能历史任务中造成过最大量级的重复劳动；本地拆解只用于补缺口。
2. **停滞即搜**：出现 provider 名 / wasm 导出名 / 错误码等高信号，或连续两轮未逼近验收、本地经验未命中时，立即用你环境内可用的 web 搜索能力发起一轮结构化搜索。query 直接用观察到的具体值，不知道确切名就用 host 域名。

搜索到的关键结论（query + URL + 对决策的影响）收进 report.md「经验沉淀」节。细则 `references/web-search-tool.md`、`docs/reference/search-decision-policy.md`。

## 停损（量化自检）

每轮结束自问一遍，不满足就 pivot，不要硬顶：

| 阶段 | 停损条件 | 动作 |
|---|---|---|
| Foundation | 连续 **2** 轮（重混淆档 **3** 轮）无新增 hook/carrier/entrypoint mapping | 必须 pivot |
| Foundation | **4** 轮（VM/WASM standard 档 **8** 轮 / 重混淆档 **16** 轮）进不了 Probe | 必须复盘换路线 |
| Deep-Dive | 连续 **2** 轮（重混淆档 **3** 轮）无产出 | 回退上一可验收层 |

**不算有效推进**（所有阶段统一）：更细的 slot/selector 解释、更多同层低价值 hook、只在 Browser/Node 差异上细化但不逼近交付。分档参数表见 `docs/reference/stop-loss-parameters.md`。

## VM / WASM / DRM

优先级：浏览器黑盒复用 → 明文/解密后边界/appendBuffer/request-use → 浏览器内可控复用 → Node 侧复用原始 worker/wasm/bundle → 纯算法提取 → 最后才 dispatcher/bytecode 深拆。前 1~4 任一足以验收就别深拆；深拆前自问"前四层是否真的都不足以验收"，深拆连续无产出就回退上一可验收层，不要在原微路线硬顶。VM 专题里程碑判据见 `references/vmp-playbook.md`。专题入口：`references/vmp-playbook.md`（JSVMP 总入口）→ `references/wasm-jsvmp-bridge-playbook.md`（WASM 桥接）→ `references/media-drm-playbook.md`（媒体解密）；`references/vm-wasm.md` 是 boundary 速查；**WASM 二进制深拆**走 `references/wasm-binary-analysis-playbook.md`（§1.1c 有 MCP 能力映射）。

## 回复纪律

不要把"我会继续 / 下一步继续"当作输出，也不要"如果你同意继续"式假暂停。只有四种情况才停下回复：① 需要用户协作（登录/验证码/硬件/样本）；② 高风险副作用需确认；③ 已完成可验证交付（含 report.md 已写）；④ 必须声明目标偏差或路线级 pivot（声明后继续执行）。

## 收尾契约（唯一的文档义务）

任务完成（或明确终止）时，把逆向过程**全面总结**写进 `artifacts/tasks/<task-id>/report.md`，直接编辑骨架填充——**内容必须来自真实做过的事**，未跑通就如实写未跑通与卡点，禁止空洞占位。必填六节（骨架内注释即写作指引）：

1. **任务目标与结果**：一句话目标 + 最终验收状态（跑通的命令 + 实测输出摘要）。
2. **实现路径**：从输入样本到交付物的关键步骤顺序（定位→取证→还原→复现→验证），写清关键文件/断点/函数名。
3. **逆向思路**：候选路线与选择依据、关键转折点、为什么放弃其它路线。
4. **难点与坑点**：卡壳处、错误尝试、环境坑、反调试/混淆/风控对抗细节；失败也如实写。
5. **经验沉淀**：可复用的方法/命令/判据/参数含义，下个同类任务可直接抄的结论。
6. **交付物与复现**：文件清单（相对路径 + 用途）+ 复现命令 + 依赖。

收尾时删除骨架注释与提示行。所有报告用中文，代码/字段名保留原样。契约细则 `docs/reference/output-contract.md`。

## 路由表（按需读）

- 启动 / 开局动作：`docs/reference/reverse-bootstrap.md`、`references/automation-entry.md`
- 执行循环方法论：`docs/reference/reverse-workflow.md`
- 搜索：`references/web-search-tool.md`、`references/websearch-escalation-playbook.md`、`docs/reference/search-decision-policy.md`
- 专题选择 / 能力矩阵：`docs/reference/topic-selection-policy.md`、`docs/reference/capability-matrix.md`
- 交付梯度 / 输出契约（report.md）：`docs/reference/deliverable-ladder.md`、`docs/reference/output-contract.md`
- **浏览器 MCP 能力映射（工具无关执行层，任何浏览器 MCP 用户必读）**：`references/browser-mcp-capability-map.md`
- **小程序 / miniapp 专题**（wxapkg/TPKG 包、AppService 逻辑层、`wx.request` 签名复现）：`references/miniapp-playbook.md`（总纲与平台矩阵）→ `references/wechat-miniprogram-playbook.md`（微信深挖：V1MMWX 标定、运行时通道、签名实战模式库）
- **扣代码 / 反混淆 / 最小闭包提取**（从 bundle 抽出目标函数到 Node 单跑）：`references/closure-extraction-playbook.md`（入口）、`references/deobf.md`、`references/string-array-deobfuscation-playbook.md`、`references/control-flow-flattening-playbook.md`、`references/dead-code-elimination-playbook.md`、`references/bundle-loader-playbook.md`、`references/local-rebuild.md`
- **补环境**（Node 侧复现跑通；canonical 在 docs/reference）：`docs/reference/env-patching.md`（canonical）、`references/env-conformance-playbook.md`、`references/env-drift-decision-tree.md`、`references/env-as-algorithm-input-playbook.md`、`references/node-env-rebuild.md`；补环境探测脚本 `scripts/env/proxy-env.cjs`
- **算法自检与服务端验收（双闸门）**：`references/algorithm-selfcheck-playbook.md`；脚本 `scripts/verify/verify-algo.py`（控制变量逐字节）、`scripts/verify/verify-offline.py`（服务端验收 Python 路线）
- **验证码 / 滑块 / 点选 / 旋转**（challenge-orchestration 的 visual challenge 分支）：`references/captcha-slider-playbook.md`；脚本 `scripts/captcha/slide-gap.py` / `track-gen.py` / `geetest-w.py`
- **Rebuild 路线三岔决策**（扣代码本地复现 vs 补环境跑原始 bundle vs 浏览器可控复用 的唯一决策源）：`references/composite-triage-playbook.md`「Rebuild 路线三岔决策」小节
- 浏览器可控复用 / 补环境：`references/browser-controlled-reuse-playbook.md`、`references/env-drift-decision-tree.md`
- VM/WASM/DRM 专题（**先读哪个**）：先 `references/vmp-playbook.md`（JSVMP 总入口）→ 命中 WASM 桥接再 `references/wasm-jsvmp-bridge-playbook.md` → 媒体解密走 `references/media-drm-playbook.md`；`references/vm-wasm.md` 是 **VM/WASM boundary 速查**；深拆回 vmp-playbook / `references/wasm-runtime-playbook.md` / `references/wasm-binary-analysis-playbook.md`
- 反篡改 / 完整性自校验（self-defending bundle、toString 完整性校验、`__webpack_require__` 改写检测）：`references/anti-tamper-playbook.md`（含绕过手法）、`references/anti-debug-snippets.md`
- **降级与重放方法论**（工具不可用、路线全失效时的通用降级 / 请求重放）：`references/fallbacks.md`、`references/replay.md`、`references/hooks.md`
- **知识层总索引**（按需查全部 playbook 归类）：`references/README.md`
- 发布流程：`docs/guides/release-workflow.md`

## 专题成熟度摘要

<!-- BEGIN GENERATED: topic-maturity-summary -->
- `synthetic-e2e` (`22`): `anti-debug`, `behavior-telemetry`, `binary-codec`, `challenge-orchestration`, `compression-stream`, `dynamic-code`, `env`, `fingerprint`, `framework-runtime`, `graphql-rpc`, `instrumentation-hooking`, `jsvmp`, `media-drm`, `miniapp`, `module-federation`, `protocol`, `signature`, `streaming-runtime`, `subtlecrypto`, `userland-crypto`, `wasm`, `worker`
- `guided` (`0`): none published yet
- `closed-loop` (`13`): `anti-tamper`, `ast-deobfuscation`, `beacon-reporting`, `bundle-loader`, `cross-context-coordination`, `frame`, `grpc-web`, `microfrontend-runtime`, `session`, `source-map`, `storage`, `webauthn-passkey`, `webrtc-datachannel`
- `reference-only` (`0`): none published yet
<!-- END GENERATED: topic-maturity-summary -->

记住：你不是来做漂亮的阶段汇报，也不是来做无止境的机理研究；你是来**完成用户要的逆向交付**。
