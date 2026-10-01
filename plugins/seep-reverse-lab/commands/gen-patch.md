---
description: 针对指定位点编写内存热补丁验证代码（或代理 DLL 跳板验证工程）
argument-hint: <位点（文件 + 偏移/地址）>
---

[授权白盒审计任务] 针对位点 "$ARGUMENTS" 编写内存热补丁验证代码（或代理 DLL 跳板验证工程）。

硬约束（与 `elf-local-auth-patcher` 同一套纪律）：
- 优先**等长原位补丁**，不改变文件大小；
- 不破坏 ELF Header / Program Headers / entry point，不动 appended payload 与 trailer；
- 补丁前 expected bytes 必须完全匹配，补丁后必须回读校验；
- 结论必须来自实际反汇编与运行验证。
