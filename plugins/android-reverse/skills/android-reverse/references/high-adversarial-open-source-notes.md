# 高对抗组合经验参考开源来源说明

本文件用于记录高对抗组合经验参考的外部开源参考来源。
这些来源只用于校准策略和补充证据视角，不直接替代 task-local 证据。

## 组合卡对应关系

### `exp-android-shell-jni-multiprocess-pinning-chain-first`

- `hluwa/frida-dexdump`
  - 强调内存中 dex dump、`spawn` 模式和延时等待，对动态 Dex/壳场景有直接参考价值。
- `hanbinglengyue/FART`
  - 强调从 app 实际运行过程中主动触发 dump，适合“壳 + 动态加载”场景的时机判断。
- `chame1eon/jnitrace`
  - 强调 `RegisterNatives`、`JNI_OnLoad`、预加载 Frida 脚本和 `spawn/attach` 选择，适合 JNI 桥接恢复。
- `lico-n/ZygiskFrida`
  - 强调 stealth 注入、控制注入时机和 child gating，适合多进程目标进程锁定。

### `exp-android-split-gadget-ca-merge-first`

- `NickstaDB/patch-apk`
  - 明确给出 split APK 合并、资源修正、禁用 splitting、注入 gadget、启用 user CA 的完整链路。
- `sensepost/objection`
  - 提供 `patchapk` 的基本 patch 流程和 target class 调整思路，适合 split/重打包补环境。

### `exp-android-anti-frida-stealth-injection-first`

- `AsenOsen/frida-stealth`
  - 强调默认端口、socket、线程名、符号名和 SELinux 上下文等特征隐藏。
- `lico-n/ZygiskFrida`
  - 强调避免 `ptrace`、保持 APK 完整性/签名通过、控制注入时机和 child gating。
- `sensepost/objection`
  - 适合在需要 gadget 注入但仍要保持最小 patch 因果时作为替代注入路径参考。

### `exp-android-native-pinning-plaintext-cert-first`

- `CreditTone/hooker`
  - 集成了 `r0capture`、BoringSSL unpinning、内存漫游、JNI trace 等能力，适合 Native TLS/多进程排查。
- `gojue/ecapture`
  - 提供“无需 CA 也能抓 TLS 明文”的思路，适合把“unpin”与“plaintext capture”拆线处理。
- `chame1eon/jnitrace`
  - 适合在 Native TLS 与 Java/JNI 桥接同时存在时补桥接和调用边界。

### `exp-android-framework-native-network-process-first`

- `CreditTone/hooker`
  - 同时覆盖 Native TLS、明文抓取和 JNI trace，适合框架容器下的 Native 网络链路取证。
- `gojue/ecapture`
  - 适合把“是否能抓到明文”与“是否已经完成 unpin”拆开验证，避免把二者混成一个结论。
- `lico-n/ZygiskFrida`
  - 适合多进程和早期注入场景下控制真实目标进程与注入时机。

## 使用建议

- 不把任何开源工具当成结论本身，只把它们当作“最小 probe / 最小证据获取器”。
- 多进程、壳和动态 Dex 场景下，优先保证进程和时机判断正确，再上通用脚本。
- 对 Native pinning、mTLS、应用层二次加密，始终把“绕过”“抓明文”“还原协议”拆开记录。
