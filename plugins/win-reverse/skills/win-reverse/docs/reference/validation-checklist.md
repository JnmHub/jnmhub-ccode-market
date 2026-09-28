# Validation Checklist

一页核心预判；详细规则、词汇表与源码锚点见 [acceptance-criteria.md](acceptance-criteria.md)。

1. 当前阶段与 `route-state.json` 执行状态一致。
2. 活跃切入点与 `nextExecutableAction` 可相互印证。
3. 机器校验的契约五字段已锁定：`target / objective / deliverableTier / completionCriteria / boundaries`。
4. `report.md` 实质内容达标（非模板、≥600 字符）；achieved 收口含「任务摘要 / 实现路径 / 验证证据」三节（report-only 改造：过程文档义务已退役，不再检查 investigation/plan/assumptions 文件）。
5. 关键 evidence 已写入 task-local。
6. 已满足的 `completionCriteria` 都带可核查的 `evidenceRefs`。
7. 报告结论能回指函数、地址、模块、日志或 hook 样本。
8. 命中 topic 时 `report.md`「专题发现」节含对应专题小节（见各 topic.json formalValidation 谓词）。
9. 交付形态与 `deliverableTier` 一致（pure-* 命名、backup-manifest 约定见总表第 7、8 节）。
