<!-- publish: framework -->
# Closeout Checklist

一页核心预判；详细规则、词汇表与源码锚点见 [acceptance-criteria.md](acceptance-criteria.md)（close 前必读）。

1. `task.json`、`report.md` 存在且可读取。
2. verify-once 已通过（`validation.status=passed`）。
3. `successCriteria` 至少一条命中（hit 词汇表见总表第 4 节）。
4. `completionCriteria` 全部命中。
5. 每条命中的 `completionCriteria` 带合法 `evidenceRefs`（三形态见总表第 4 节）。
6. `report.md` 实质内容达标（非模板、≥600 字符），achieved 收口含「任务摘要 / 实现路径 / 验证证据」三节。
7. 命中 topic 时 `report.md`「专题发现」节含对应专题小节（关键词 + 最小长度谓词，见各 topic.json formalValidation）。
8. `phase ≥ Patch` 或 `deliverableTier=patch` 时 `run/backup-manifest.md` 含 SHA256 条目。
9. `closeoutMode=partial / infeasible` 时 `report.md` 含「未竟事项」节（≥200 字符，根因 + 已排除路线，见总表第 6 节）。

先跑 `task-close --dry-run` 预检，把剩余 finding 一次修完再正式收口。
