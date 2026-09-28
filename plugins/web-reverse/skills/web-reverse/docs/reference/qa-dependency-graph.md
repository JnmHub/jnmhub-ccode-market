<!-- publish: framework -->
# QA 检查依赖图

## 共享库（lib）

```
tools/qa/common.mjs              ← 核心共享工具（failWith, readText, readJson, repoRoot, walk, exists）
    ├── tools/qa/topic-registry.mjs
    │   └── re-export tools/topic-registry.mjs（readTopicRegistry / listTopicsByMaturity / topicHasMaturity）
    └── tools/qa/check-manifest.mjs
        └── getChecksForGroup(), checkManifest[], tier metadata
```

## 检查脚本依赖树

```
check-all.mjs
├── check-manifest.mjs (tier grouping)
└── [spawns all checks based on tier]

分组执行顺序 (cumulative):
  fast (14 checks)
  ├── check-utf8.mjs               → common.mjs
  ├── check-naming.mjs             → (standalone)
  ├── check-bridge-docs.mjs        → common.mjs
  ├── check-websearch-contract.mjs → common.mjs
  ├── check-prompt-coverage.mjs    → common.mjs, topic-registry.mjs
  ├── check-topic-manifest-sync.mjs → common.mjs, topic-manifests.mjs
  ├── check-doc-fact-sync.mjs      → common.mjs, tools/docs/fact-sync.mjs
  ├── check-operating-contracts.mjs → common.mjs
  ├── check-capability-coverage.mjs → common.mjs, topic-registry.mjs
  ├── check-maturity-consistency.mjs → common.mjs, topic-manifests.mjs
  ├── check-skill-contract.mjs     → common.mjs, tools/docs/fact-sync.mjs
  ├── check-algo-selfcheck.mjs     → common.mjs
  └── lint-cases.mjs               → common.mjs

  deep (fast + 1)
  └── check-synthetic-e2e.mjs      → common.mjs, topic-registry.mjs, tools/task/task-init.mjs [exclusive]
```

## 关键依赖路径

| 修改内容 | 影响范围 | 应重跑的检查 |
|----------|---------|-------------|
| `tools/topic-manifests.mjs` 变更 | 生成矩阵 + 3 检查脚本 | `npm run sync:topics` + `check:topic-manifests` |
| `topics/*/topic.json` 变更 | 生成矩阵 + maturity/capability 检查 | `npm run sync:topics` + `check:fast` |
| `tools/task/task-init.mjs` 变更 | synthetic-e2e 冒烟 | `check:synthetic-e2e` |
| SKILL.md 正文变更 | `check-skill-contract` | `check:skill-contract` |
| report 契约文档变更（output-contract 等） | operating/websearch/capability 检查 | `check:fast` |

## 执行建议

- **日常开发后**: `npm run check:fast`
- **合并前**: `npm run check:full`
- **发布前**: `npm run release:prep`（sync + fast + full）
- **完整验证**: `npm run check:deep`（含 synthetic-e2e）
- **单点验证**: 直接运行对应 check 脚本（如 `node tools/qa/check-synthetic-e2e.mjs --topic=signature`）
