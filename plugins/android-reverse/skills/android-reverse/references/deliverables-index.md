# 交付物索引

## 唯一必需管理总结

- `artifacts/tasks/<task-id>/report.md`

真实代码、样本、日志、图表、构建结果及用户指定产物按需生成并保留。不创建空占位以凑齐清单，不默认创建或运行 verify-once 包装器。

## 可参考的语义文件名（非必需列表）

| 专题 | 追加文件 |
|---|---|
| Java API / 调用链 | `run/api-map.md`、`run/call-chain.md` |
| Frida Java | `run/frida-java-template.js` |
| Frida Native | `run/frida-native-template.js` |
| WebView / Hybrid | `run/webview-bridge-notes.md` |
| Storage / IPC | `run/storage-ipc-notes.md` |
| Split Delivery | `run/split-delivery-notes.md` |
| Framework Runtime | `run/framework-runtime-notes.md` |
| Native Network | `run/network-stack-notes.md` |
| ART Runtime | `run/art-runtime-notes.md` |
| JNI Bridge | `run/register-natives-trace.js` |
| Native SO | `run/native-notes.md` |
| 保护绕过 - Root | `run/anti-root-bypass.js` |
| 保护绕过 - Frida | `run/anti-frida-bypass.js` |
| 保护绕过 - Integrity | `run/integrity-bypass.js` |
| 保护绕过 - Emulator | `run/anti-emulator-bypass.js` |
| 证书锁定 | `run/cert-pinning-bypass.js` |
| Smali Patch | `run/smali-patch-notes.md` |
| 协议还原 | `run/protocol-notes.md` |
| CTF | `run/solver-template.py` |
| Deobfuscation | `run/deobfuscation-notes.md` |
| VMP Analysis | `run/vmp-analysis-notes.md` |
| Unidbg Simulation | `run/unidbg-simulation-notes.md` |
| Device Fingerprint | `run/device-fingerprint-notes.md` |
| Hook Injection | `run/hook-injection-notes.md` |

以上名称不构成默认工件要求；无需 pending/N/A 占位。是否完成依据用户要求和实际证据，文件存在不代表成功；未完成也可随时总结。
