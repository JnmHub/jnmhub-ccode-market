# Native SO Playbook

目标：围绕目标逻辑深挖 SO，而不是泛扫所有函数。

## 工具选择

| 场景 | 工具 | 原因 |
|---|---|---|
| 通用 SO 分析 | IDA Pro | 业界标准，ARM/ARM64 反汇编和反编译质量最高 |
| 无 IDA 许可证 | Ghidra | 免费，ARM/ARM64 支持完善，反编译质量接近 IDA |
| 快速字符串/符号扫描 | `strings` + `nm` / `readelf` | 不需要打开重量级工具即可确认导出符号和字符串 |
| 加密常量定位 | `strings` + grep + IDA/Ghidra xref | 从常量锚点反推调用链 |

Ghidra 与 IDA 的关键差异：
- Ghidra 无许可证限制，可通过 Ghidra Headless Analyzer 命令行反编译 SO，或用 Ghidra Bridge 在 Python 中远程调用
- IDA 可通过 MCP 工具（`ida-pro-mcp`）由 Claude 直接执行反编译、搜索符号、读取 xref 等操作
- 两者均支持脚本（IDA Python / Ghidra Python），可用于批量常量搜索和函数识别

## 优先观察

- 导出符号
- `JNI_OnLoad`
- 字符串与常量表
- 加密常量、S-box、域名、路径
- `open / read / ptrace / syscall / strstr`

## SO 混淆识别

当 SO 出现以下特征时，进入控制流混淆场景，直接反编译结果不可信：

- 大量 `switch-case` 或 `if-else` 嵌套形成分发器（控制流平坦化，OLLVM/Hikari 风格）
- `Cmp` 指令操作数为不透明谓词（如 `x * x >= 0`）
- 基本块之间大量不相关跳转，无局部变量传递
- `cmov` / 条件传送被滥用

应对策略：
1. 先不深挖语义，优先恢复桥接映射（`RegisterNatives` → 函数指针 → 模块基址）
2. 用 Frida 在运行时直接抓函数入参和返回值，绕过静态混淆
3. 识别加密常量和字符串引用作为锚点，从锚点反推业务函数
4. IDA 脚本辅助去平坦化仅在有明确收益时使用，不作为默认步骤

## ELF 深入

### 程序头表（PHT）是加载真相

- PHT（Program Header Table）决定 SO 在内存中的布局
- SHT（Section Header Table）是可选的，strip 后可能被删除
- 分析 SO 加载行为时优先看 PHT 中的 `PT_LOAD`、`PT_DYNAMIC`、`PT_GNU_RELRO`

### GOT[0..2] 固定锚点

- `GOT[0]`：`.dynamic` 段的地址
- `GOT[1]`：linker 的 `struct link_map` 地址
- `GOT[2]`：linker 的 `_dl_runtime_resolve` 函数地址
- 这三个条目在分析 GOT/PLT 机制时是关键参考

### PT_GNU_RELRO

- 标记哪些内存区域在加载完成后设为只读
- GOT 的只读部分在 RELRO 完成后不可写——影响 GOT hook 的可行性
- Full RELRO：整个 GOT 在加载时解析并设为只读，此时 PLT Hook 失效

## Android Linker 加载流程

`find_libraries` 的 7 步加载过程：

1. **读取 ELF 头**：验证魔数、架构、字节序
2. **映射 PT_LOAD 段**：按 PHT 将文件内容映射到内存
3. **处理 PT_DYNAMIC**：解析动态段，获取依赖库列表、重定位表等
4. **加载依赖库**：递归加载所有 NEEDED 库
5. **重定位**：处理 `R_ARM_RELATIVE`、`R_ARM_GLOB_DAT` 等重定位类型
6. **GOT/PLT 初始化**：填充 GOT 表中的函数地址
7. **调用构造函数**：按顺序调用 `.init_array` 中的函数

Hook 时机：
- `.init_array` 函数在 SO 加载完成后立即执行——适合作为早期 hook 点
- 如果目标在 `.init_array` 中做反检测，需要在 `JNI_OnLoad` 之前处理

## GOT/PLT 机制

### 调用流程
1. 代码调用外部函数 → 跳转到 PLT 条目
2. PLT 条目跳转到 GOT 中存储的地址
3. 首次调用：GOT 指向 PLT 的下一条指令（延迟绑定），触发 linker 解析
4. 后续调用：GOT 已更新为真实函数地址

### Hook 影响
- **PLT Hook（GOT 修改）**：修改 GOT 表中的地址，所有通过 PLT 的调用都被拦截
- **Full RELRO 保护**：GOT 在加载时全部解析并设为只读，PLT Hook 失效
- **Inline Hook**：直接修改函数入口指令，不依赖 GOT/PLT，绕过 RELRO

## SO 自保护机制

- **GNU Hash**：符号哈希加速查找，也增加了手动分析难度
- **自定义段**：在 ELF 中添加自定义 section 存储加密数据或校验信息
- **CRC/Hash 校验**：运行时计算 SO 内存镜像的 Hash，与存储值比较
- **反调试**：`.init_array` 中的函数在 `JNI_OnLoad` 之前执行，可以做早期检测

## DEX 文件格式

### 关键结构
- **LEB128**：可变长度编码，广泛用于 DEX 中的大小和偏移字段
- **class_data_item**：类的方法和字段列表，使用 LEB128 编码
- **checksum**：Adler32 校验和，位于文件头 0x08 位置
- **signature**：SHA-1 哈希，位于文件头 0x0C 位置

### 修改 DEX 后重算校验
1. 修改 DEX 内容
2. 重新计算 SHA-1（从 0x20 到文件末尾），写入 0x0C
3. 重新计算 Adler32（从 0x00 到文件末尾），写入 0x08
4. 不重算校验会导致安装失败或运行时校验失败

## ARM64 逆向模式

### 调用约定
- 参数：x0-x7（前 8 个参数）
- 返回值：x0（浮点用 s0/d0/q0）
- 栈帧：x29(FP)/x30(LR)，SP 16 字节对齐
- 被调用者保存：x19-x28, x29(FP), x30(LR)

### 系统调用接口
- 触发：`svc #0` 指令
- 系统调用号：x8 寄存器
- 参数：x0-x5
- 返回值：x0

### Arkari 间接跳转
- Arkari 使用查表替换直接跳转目标
- 跳转表地址通常在 `.rodata` 或自定义段中
- 需要先定位跳转表才能恢复控制流

## APK 签名验证机制

### 三层验证
1. **Java 层**：`PackageManager.getPackageInfo()` 获取签名信息，`Signature` 类比对
2. **Native 层**：SO 中直接读取 ZIP 条目，计算 Hash 与签名比较
3. **Binder 层**：通过 `PackageManagerService` 获取签名，防止客户端伪造

### 绕过要点
- Java 层：Hook `getPackageInfo` 返回指定签名
- Native 层：需要找到验证函数并 patch
- Binder 层：通常需要同时处理 Java 和 Native

## RegisterNatives 替代发现

当 `RegisterNatives` 被混淆或动态生成时，通过 ArtMethod 直接读取 native 入口。

注意：以下偏移仅在 Android 8-10 (ARM64) 上验证过，Android 11+ ArtMethod layout 有变化，需要根据具体版本调整：

```javascript
// 在 Frida attach 后（RegisterNatives 已执行）
// 方法 1：通过 Frida 内部 API（需要特定 Frida 版本支持）
Java.perform(function() {
  var clazz = Java.use("com.target.ClassName");
  // 使用 Java.cast 获取方法的 ArtMethod 地址
  // 注意：直接读取 ArtMethod 偏移依赖 Android 版本
  // Android 8-10 ARM64: entry_point_from_jni_ 偏移 0x18
  // Android 11+ 偏移可能不同，需要从 AOSP 源码确认
});

// 方法 2：通过 Module.findExportByName 确认（更可靠）
// 在 RegisterNatives 执行后，直接搜索 SO 中被注册的地址
Interceptor.attach(Process.findModuleByName("libtarget.so").findExportByName("JNI_OnLoad"), {
  onLeave: function() {
    // RegisterNatives 已完成，此时 hook 目标 native 方法
    // 通过 Java.use + Interceptor.attach 目标方法获取执行地址
  }
});
```

## 常见偏差

- 在未完成 JNI 桥接映射前就深入分析单个 SO 函数——应先建立 Java→Native 最小链路
- 只看导出符号不看 stripped 函数——大量业务逻辑在非导出函数中，需要通过 RVA 定位
- 混淆场景下试图逐函数阅读伪代码——应改用运行时 hook 直接抓输入输出
- 忽略 SO 中的字符串常量——加密算法名、URL、错误信息是高价值锚点

## 结论约束

- 单靠伪代码不得直接下运行时结论
- 高风险结论需要 Frida 或双工具交叉验证

## 按目标总结与保留资产

- report 按相关性说明函数地址、调用方、推测与验证边界；`run/native-notes.md` 为可选组织例。
- 记录目标相关的已知调用链、常量及实际交叉验证证据；缺失链路或未运行的验证照实说明，不以固定条数或额外文件作为回复前提。
- 原始技术资产按需保留；上述结论约束仍适用，部分发现不冒充完整验证。


## 实战补充：SO Dump 四窗口与验证闭环（2026-09）

> 来源：`references/technique-extract-2026-09.md` 第 19 节；实测样本：加固 SO 内存取证（磁盘密文/section 伪装类）。

### dump 时机四窗口

1. 无加固：任意时刻。
2. **有加固：`JNI_OnLoad` 返回（onLeave）**——dlopen 返回立刻 dump 太早（解密未完成）、进入时太晚，返回那一刻是 .text 最稳定明文窗口：hook `android_dlopen_ext`/`dlopen` onLeave 记录路径 → 按 Module 找 JNI_OnLoad → 在其 onLeave dump。
3. 边执行边解密：写入断点抓解密例程——`Memory.protect(.text, '---')` + `Process.setExceptionHandler`，异常处理里按 .text 地址范围过滤（不过滤会淹没在 ART write-barrier/JIT 良性缺页），打印的 PC 即解密入口。
4. Anti-Dump 自毁：监控 mprotect 赶在擦除前（判 `(prot & 1) === 0` 丢读权限；勿用 `(prot & 4) === 0`——在 [rw-] 上误报率高）。

### 不变式与验证

- dump 前 `Memory.protect(base, size, 'rwx')` 强制可读（加固常把 .text 改 `--x`，直接读 SIGSEGV）。
- ELF 修复用 SoFixer（`-s 源 -o 输出 -m 基地址 -d`）；兜底清零 e_shoff/e_shnum/e_shstrndx 让 IDA 走 Program Header 路径。
- **IDA 七步验证**：Manual load、Loading address 填 0、至少 LOAD/.text/.dynamic 三段、Strings 正常（全乱码=二次解密未完成，回窗口 2 重抓）、Exports 有 JNI_OnLoad、**F5 伪代码含可读字符串引用**（而非 `*(char*)0xXXX`）、xref 可跳。最强验证：拿 dump 推导的偏移回运行中 App 用 frida-trace 触发对拍。
- 运行时解密 SO（磁盘密文 / `.note.gnu.proc` 类 section 伪装）：先让进程活过校验再 dump 完整内存镜像，offset=vaddr 直接喂 IDA/r2；或 root + ptrace + `process_vm_readv` 体外 dump。Android 10+ 禁 `findModuleByAddress(dlopen 返回值)`（句柄加密混淆，必须按名字找）。
