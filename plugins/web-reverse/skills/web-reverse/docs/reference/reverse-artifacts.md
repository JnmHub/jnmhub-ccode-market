<!-- publish: framework -->
# Reverse Artifacts

产物分两层：

- **工作层**：任务目录下的脚本 / 样本 / trace / 中间数据（建议成品以 `pure-` 前缀命名；可自由组织子目录如 `run/`）
- **结论层**：`report.md`（任务目录下唯一必填文档，收尾时按 `docs/reference/output-contract.md` 填写）

原则：

- 工作层不承载总结，总结只进 report.md
- report.md 的「实现路径」与「交付物与复现」必须能回指工作层的真实文件
- 任务意外中止时，工作层已落盘的产物就是恢复上下文的最好材料——因此产物随手落任务目录（这是工作习惯，不是记录义务）
