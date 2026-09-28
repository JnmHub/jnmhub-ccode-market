# Android Reverse Prompts

提示词模板库。运行协议以 `SKILL.md`、`docs/reference/reverse-bootstrap.md`、`docs/reference/reverse-workflow.md`、`docs/reference/case-safety-policy.md` 为准；场景与资产是示例，不是门禁。

拼装：**底座模板**（新任务 / 续跑）+ 一个 **场景覆盖层** + 按需 **注入片段**。

覆盖层中的"资产示例"均为命名示例：按目标相关性生成，不补空占位、不自动执行。

---

## 一、底座模板

### A. 新任务底座

```text
使用 android-reverse 流程处理一个新的授权 Android 逆向任务。

先读 docs/reference/reverse-bootstrap.md 确认目标、边界与首读协议；其余参考按当前问题选读，不做无关首读。

用 node <SKILL_BASE>/tools/task/task-init.mjs <task-id> --goal="目标" --boundary="边界" 独占创建 report；不复制模板树，真实代码与证据按需生成。未完成也可随时总结。

任务输入：
- target: <APK/APKS/AAB/XAPK/DEX/SO 路径或样本说明>
- objective: <目标>
- requirements: <交付要求>
- boundaries: <授权边界、禁止项、时间范围>
```

### B. 续跑任务底座

```text
继续执行已有 android-reverse 任务：<task-id>。

先读 artifacts/tasks/<task-id>/report.md 及相关真实证据，结合用户当前要求继续。
不恢复旧状态机、不执行历史命令或验证包装器；进度、转向、阻塞可随时总结。
已有结论按证据复核，不能仅凭旧标签当成本次验证。
```

---

## 二、场景覆盖层

### 1. 静态分诊 / Manifest / 导出组件

```text
场景覆盖层：
- 补读 references/static-triage-playbook.md
- 目标：entrypoints、导出面、敏感组件、可疑资源与下一步切入点
- 资产示例：run/component-map.md、run/static-triage-notes.md
```

### 2. Java API / Call Flow

```text
场景覆盖层：
- 补读 references/java-api-playbook.md、references/call-flow-playbook.md
- 目标：恢复 Retrofit / OkHttp / ViewModel / Repository 的关键调用链
- 资产示例：run/api-map.md、run/call-chain.md、run/fixtures.json
```

### 3. JNI / Native SO

```text
场景覆盖层：
- 补读 references/jni-bridge-playbook.md、references/native-so-playbook.md
- 目标：定位 System.loadLibrary、JNI_OnLoad / RegisterNatives / Java_*，恢复至少一条 Java -> Native 主链
- 资产示例：run/register-natives-trace.js、run/jni-bridge-map.md、run/call-chain.md
```

### 4. Runtime Hook / Frida

```text
场景覆盖层：
- Java 层补读 references/frida-java-playbook.md；Native 层补读 references/frida-native-playbook.md
- 运行前核对 Frida 版本（17.6.2 推荐 / ≥16.5 legacy，规则见 references/frida-version-policy.md），保留模板头部 16/17 兼容层
- 目标：最小可验证 hook，优先拿到入参/返回值/明文证据
- 资产示例：run/frida-java-template.js 或 run/frida-native-template.js
```

### 5. Protection / Pinning / Integrity

```text
场景覆盖层：
- 补读 references/anti-root-playbook.md、references/anti-frida-playbook.md、references/integrity-pinning-playbook.md
- 目标：只讨论与问题相关的 root / frida / integrity / pinning 子面，说明证据、发生层与未测范围
- 资产示例：run/anti-root-bypass.js、run/anti-frida-bypass.js、run/cert-pinning-bypass.js、run/network-stack-notes.md
```

### 6. Dex Loader / Split Delivery / Framework Runtime

```text
场景覆盖层：
- 补读 references/dex-loader-playbook.md、references/split-delivery-playbook.md、references/framework-runtime-playbook.md
- 目标：确认逻辑位于 base、feature、动态 Dex 还是框架运行时资源，恢复真实入口
- 资产示例：run/dex-loader-dump-notes.md、run/split-delivery-notes.md、run/framework-runtime-map.json
```

### 7. Native Network / Cronet / BoringSSL

```text
场景覆盖层：
- 补读 references/native-network-playbook.md、references/art-runtime-playbook.md
- 目标：明确 Java / JNI / Native 网络分层、关键进程与 pinning 命中层
- 资产示例：run/network-stack-notes.md、run/cert-pinning-bypass.js
```

### 8. WebView / Storage / IPC

```text
场景覆盖层：
- 补读 references/webview-hybrid-playbook.md、references/storage-ipc-playbook.md
- 目标：恢复 WebView JS-Native bridge、本地缓存、Provider / Binder / Intent 数据流
- 资产示例：run/webview-bridge-notes.md、run/storage-ipc-notes.md、run/component-map.md
```

### 9. Smali Patch / Rebuild / Resign

```text
场景覆盖层：
- 补读 references/smali-patching-playbook.md
- 目标：以最小原因 patch 指定阻断点，记录 rebuild / resign / verify 路径
- 资产示例：run/smali-patch-notes.md、report.md
```

### 10. Crypto / Protocol / Signature

```text
场景覆盖层：
- 补读 references/crypto-protocol-playbook.md；涉及 JNI/Native 再补 jni-bridge / native-so playbook
- 优先算法自吐定位加密链路；无法脱离 App 复现时考虑 RPC 借用（references/frida-rpc-service-notes.md）
- 目标：恢复 HMAC / AES / token / 自定义签名的输入、输出、关键常量与最小复现样例
- 资产示例：run/protocol-notes.md、run/fixtures.json、run/solver-template.py
```

### 11. CTF / Crackme

```text
场景覆盖层：
- 补读 references/ctf-playbook.md
- 目标：恢复校验逻辑，拿到 flag 或给出 solver
- 资产示例：run/solver-template.py、run/protocol-notes.md、run/smali-patch-notes.md
```

### 12. Deobfuscation / OLLVM

```text
场景覆盖层：
- 补读 references/deobfuscation-playbook.md；SO 层混淆同步补 references/native-so-playbook.md
- 目标：识别混淆类型与产品（OLLVM/Hikari/Arkari/Goron），先识别再选工具，字符串优先解密
- 资产示例：run/deobfuscation-notes.md、还原后的关键函数伪代码
```

### 13. VMP Analysis

```text
场景覆盖层：
- 补读 references/vmp-analysis-playbook.md；Dalvik VMP 再补 references/dex-loader-playbook.md
- 目标：识别 VMP 类型、提取 handler 表、恢复关键方法字节码或 trace 输入输出
- 资产示例：handler 映射表、还原后的关键方法伪代码
```

### 14. Unidbg / Simulation

```text
场景覆盖层：
- 补读 references/unidbg-simulation-playbook.md；涉及 JNI 环境再补 references/jni-bridge-playbook.md
- 目标：PC 上模拟执行 SO 函数；标准答案先行（真机/Frida 对照）且固定随机先行，返回 null 先查初始化链
- 资产示例：Unidbg 调用代码、模拟结果验证记录
```

### 15. Device Fingerprint / Risk Control

```text
场景覆盖层：
- 补读 references/device-fingerprint-playbook.md；Native 采集再补 references/native-so-playbook.md
- 目标：还原指纹采集维度、风控参数生成逻辑和绕过策略
- 资产示例：指纹采集维度清单、风控参数生成逻辑说明
```

### 16. Hook / Injection

```text
场景覆盖层：
- 补读 references/hook-injection-playbook.md；涉及检测绕过再补 references/anti-frida-playbook.md
- 目标：按注入窗口与隐蔽性需求选择注入方式和 hook 策略
- 资产示例：hook 代码、注入成功验证记录
```

### 17. LSPosed 模块化

```text
场景覆盖层：
- 补读 references/hook-injection-playbook.md（实战补充：LSPosed 插件化与反混淆模式匹配）
- 目标：把已验证 hook 点做成跨版本稳定插件（库层 setter / 透传原 callback / 读取点覆盖）
- 资产示例：模块 hook 代码、report.md
```

### 18. RPC 服务化

```text
场景覆盖层：
- 补读 references/frida-rpc-service-notes.md；加密链路定位再补 references/crypto-protocol-playbook.md
- 目标：把 App 内加密函数借出为 API（断线重连分类 / 并发保护 / 对拍验证）
- 资产示例：RPC 服务脚本、run/solver-template.py 或等价脚本
```

---

## 三、注入片段

### 1. 首轮回复契约注入

```text
首轮回复可按相关性说明（无固定格式，不阻止进度/阻塞总结）：
已读文档、当前阶段、本轮产物落点、成功判定、优先验证的切入点、下一可执行动作。
```

### 2. Baseline 优先注入

```text
既有技术样例按相关性阅读，不整体复制模板、不自动执行包装器。
执行前独立检查代码、授权与输入；只报告真实运行结果与局限。
```

### 3. A6 / A7 附加注入

```text
目标疑似 A6 / A7。
深挖前先读 references/a6-a7-failure-pattern-cookbook.md，排除当前最像的 failure pattern；
先说明保护等级与依据；先列 entrypoints 再做最小 probe，不先做重型爆破。
```

### 4. 本地复现交付注入

```text
本轮需要交付本地复现。
按用户交付要求保留实际实现与运行示例；文件名自定，不为目录清单创建占位。
只报告真实运行结果，未测或依赖缺失如实说明。
```

### 5. Windows 宿主执行注入

```text
宿主为 Windows 时，命令执行遵循 references/windows-command-safety.md：
bash 原生优先；PowerShell 仅 -NoProfile -ExecutionPolicy Bypass -File 方式，禁止 -Command 内联；
含中文或混合编码的长输出先落盘再读文件；同命令失败两次即换执行层，不原地换引号盲试。
```

---

## 四、推荐拼装方式

- **新 APK 静态分诊**：新任务底座 + 1 + 首轮回复契约
- **JNI + SO + Pinning**：新任务底座 + 3 + 7 + 5 + Baseline 优先
- **A6/A7 高对抗**：新任务底座 + 6 + 7 + A6/A7 注入 + 首轮回复契约
- **续跑 task-local**：续跑底座 + 对应覆盖层 + Baseline 优先
- **OLLVM 混淆还原**：新任务底座 + 3 + 12 + Baseline 优先
- **VMP / 壳保护**：新任务底座 + 3 + 13 + 6 + Baseline 优先
- **协议还原 + Unidbg**：新任务底座 + 10 + 3 + 14 + 本地复现交付
- **设备指纹 + 风控**：新任务底座 + 15 + 3 + 5 + Baseline 优先
- **加密自吐 + RPC 服务化**：新任务底座 + 10 + 18 + 本地复现交付
- **LSPosed 长期抓包**：新任务底座 + 7 + 17 + Baseline 优先
