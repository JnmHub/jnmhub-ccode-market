# Tool Reference

`web-reverse` 默认不捆绑新的 MCP server，实现层优先依赖现有工具。

任务生命周期只有一条 CLI：`task-init`（建任务目录 + report.md 骨架）。其余工具面是浏览器 MCP / web 搜索与仓库自带的逆向脚本。

## 仓库内置任务工具

- `node $TOOL_DIR/task-init.mjs <task-id>`——唯一开机命令（幂等；`--allow-skill-dir` 仅自测用）

校验与构建工具（开发仓库自用）：

- `npm run check`
- `npm run check:doc-facts`
- `npm run build:doc-facts`
- `npm run build:topics`

## 逆向辅助脚本（scripts/）

- `scripts/verify/verify-algo.py`——算法自检（控制变量逐字节比对）
- `scripts/verify/verify-offline.py`——服务端验收（Python 路线）
- `scripts/env/proxy-env.cjs`——补环境探测
- `scripts/deob/deob-ob.cjs`——OB 混淆还原
- `scripts/vm/jsvmp-instrument.cjs`——JSVMP 插桩
- `scripts/captcha/slide-gap.py` / `track-gen.py` / `geetest-w.py`——滑块/轨迹

## 浏览器与页面

- `chrome-devtools-mcp` / `js-reverse` / `stealth-browser` / 其它 CDP 能力
- 或等价的 DevTools / Playwright / Puppeteer 接管能力
- 整条任务只用同一个浏览器工具/实例（换实例 = 风控指纹变化）

## 外部搜索

- 使用环境内可用的 web 搜索能力
- 优先官方文档、GitHub、issue、标准、供应商文档
- 外部搜索只用于：provider / SDK / protocol 家族识别、entrypoint 纠偏、probe 成本下降
- 外部搜索不能替代运行时 capture 与最终验证

## 搜索与浏览器 harness 的位阶

- 如果浏览器运行时已经是可靠真源，优先把它变成可控 harness
- 只有当 harness 路线仍不足以解释 provider / family / 协议归类时，再让搜索介入纠偏

## 分阶段工具优先级

### Observe
- 浏览器侧优先做脚本 / 请求 / initiator / source triage
- 先定任务模式与交付梯度，再动手

### Capture / Patch
- 浏览器调试、hook、trace、network、console 是主工具面
- 先做高语义 capture，再考虑低层 hook
- 显式 env error 消失但验收仍失败时，先回到 Capture，不要盲目继续补环境

### Rebuild / Port
- 以最小可运行骨架为主，不要无限扩建
- 只有当前交付梯度明确要求离线运行时，才继续纯算法实现

### Close
- Close 不是"写完报告就结束"：先跑通最终验证，再按 `docs/reference/output-contract.md` 填 report.md
- report.md 里的复现命令必须真实可跑——验收人可能原样执行

### 复盘 / Pivot
- 优先复用已有 task artifact、样本
- 必要时进行全网搜索或 browser-controlled reuse
- 复盘结论有价值就写进 report.md「逆向思路」节
