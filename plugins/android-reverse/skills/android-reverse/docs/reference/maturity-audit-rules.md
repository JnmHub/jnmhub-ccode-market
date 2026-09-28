<!-- retired-reference -->
> 退役历史规则：以下命令已移除，不再执行评分、晋升或强制产物检查；保留仅供理解旧资料，不代表当前任务契约。

# Maturity Audit Rules

`android-reverse` 的 maturity 不是文档口号，而是可执行审计结论。

这些 maturity 规则审计的是“仓库级交付保证”，不是“所有真实样本都已完成高对抗回归”。
尤其是 `synthetic-e2e`，表示该 topic 已具备 synthetic task 骨架、验证口径与专题产物约束，不等同于对现实目标的全量实战覆盖承诺。

唯一正式实现：

- `tools/qa/check-maturity-evidence.mjs`

执行方式：

- `npm run check:maturity-evidence`
- `npm run check`

判定原则：

- 允许“保守声明”，即 topic 的声明成熟度低于其当前证据上限
- 不允许“超前声明”，即 topic 的声明成熟度高于其当前证据上限
- 审计脚本会为每个 topic 计算 `declared` 与 `supported`；只有 `declared <= supported` 才通过

## Guided

`guided` 的最低证据要求：

- 已进入 registry-backed topic 体系
- 存在 `protocol`
- 存在 `taskModelFile`
- 至少一个 `caseFiles`
- 至少一个 `templateArtifacts`
- 存在 `taskSemantics.presentPath`
- 存在 `formalValidation.presentPath`
- 存在 `requiredChecks`

## Closed-Loop

`closed-loop` 必须先满足 `guided`，再额外满足：

- `caseFiles` 必须是专题独占，不能被多个 topic 共享
- `formalValidation.requiredArtifacts >= 1`
- `formalValidation.requirementsAll/requirementsAny` 至少一项非空
- `taskSemantics.minArtifacts >= 1`

这里的“专题独占 case”用于防止 topic 级闭环声明建立在共享 triage case 之上。

## Synthetic-E2E

`synthetic-e2e` 必须先满足 `closed-loop`，再额外满足：

- `taskSemantics.versionPath` 非空
- `formalValidation.requiredArtifacts >= 2`
- `taskSemantics.minArtifacts >= 2`
- `taskPackFiles >= 2`

这组规则的目标不是证明 topic 已经“完美”，而是要求它至少具备独立的 synthetic 任务骨架、验证口径和专题产物约束。

## 维护约束

- 如果要提升某个 topic 的 maturity，必须先让 `check-maturity-evidence` 通过
- 如果只补了文档或矩阵说明，但没有补齐证据层，审计必须失败
- 如果 topic 继续共享 case 或 synthetic 产物不足，不能上调 maturity
