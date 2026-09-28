# 需求输入参考

可在自然语言或 report 中说明以下信息；不强制 JSON 字段：

- `target`
- `objective`
- `requirements`
- `boundaries`

推荐补充字段：

- `targetType`
- `targetParts`
- `packageName`
- `apkVersion`
- `abi`
- `androidVersion`
- `deviceMode`
- `attachMode`
- `protectionHints`
- `frameworkHints`
- `networkHints`
- `processHints`
- `entryHints`
- `successCriteria`
- `timeBudget`
- `retryPolicy`
- `patchingAllowed`
- `dynamicAllowed`

## 历史结构化样例（仅供阅读，不由 init 加载）

- Schema: `references/schemas/android-reverse-task-input.schema.json`
- Example: `references/schemas/android-reverse-task-input.example.json`
- 场景样例:
  - `references/task-input-examples/login-jni-native-network.json`
  - `references/task-input-examples/split-dex-crypto.json`
  - `references/task-input-examples/webview-storage-smali.json`
  - `references/task-input-examples/ctf-crackme.json`

## 推荐写法

- `target`、`requirements`、`boundaries` 既支持简单字符串，也支持对象形式
- task-init 只支持 id、--goal 与 --boundary；旧 --task-input 选项明确失败，不映射字段或自动补专题包。
- 用户提供的结构化输入可作为需求资料阅读，不回填管理台账。

## 输入约束

- 允许脱敏值
- 禁止真实 token / key / 证书私钥入库
- 真实样本应留在 task-local 目录

