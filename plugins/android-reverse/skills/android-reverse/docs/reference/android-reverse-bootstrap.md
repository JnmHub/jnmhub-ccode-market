# Android Reverse Bootstrap

这是兼容桥接页，保留给旧引用与历史入口。
正式首读协议、续跑规则与首条正式工作回复契约以 `docs/reference/reverse-bootstrap.md` 为准。

## 使用方式

1. 立即改读 `docs/reference/reverse-bootstrap.md`
2. 按该页与当前问题的相关性选择 `docs/reference/case-safety-policy.md`、`docs/reference/reverse-workflow.md`，不规定固定顺序或全量首读
3. 如任务已进入纯提取，再补读 `docs/reference/pure-extraction.md`

## 兼容说明

- 本文件不再单独定义首轮响应字段，避免与 canonical bootstrap 漂移
- 若历史文档或旧提示词仍引用本页，应自动跳转到 `docs/reference/reverse-bootstrap.md`
- `scripts/cases/*` 只放抽象 case；真实产物仍写入 `artifacts/tasks/<task-id>/`

