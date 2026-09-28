## .NET 混淆逆向

### de4dot 参考

```bash
de4dot.exe target.exe                                        # auto-detect
de4dot.exe -f confuserex target.exe -o clean.exe             # force obfuscator
de4dot.exe -f dotfuscator target.exe -o clean.exe
de4dot.exe -f obfuscar target.exe -o clean.exe
de4dot.exe -f smartassembly target.exe -o clean.exe
de4dot.exe -f eazfuscator target.exe -o clean.exe            # limited support; see manual steps
de4dot.exe --keep-names ntf target.exe                       # preserve tokens
de4dot.exe --strtyp delegate --strtok 0x06001234 target.exe  # strings only
de4dot.exe -r ./dir -ru                                      # batch
```

### ConfuserEx

| 层 | 识别 | 绕过 |
|---|---|---|
| Anti-tamper | 校验线程；补丁后 BadImageFormat | NOP 掉 anti-tamper 初始化；Frida CLR（Pattern 17） |
| Anti-dump | MonoJitInfo 页面清理 | MegaDumper / dnSpy 在触发前 "Save Module" |
| 字符串加密 | 内联解密委托调用 | de4dot；失败时 -> 在 dnSpy 里 hook 委托 |
| Proxy calls | 通过生成委托间接调用 | de4dot 清掉大部分；残留 -> 跟踪 delegate.Method.Target |
| 控制流 | switch + dispatcher CFG | de4dot 部分清理；残留 -> IDA microcode 折叠 |
| 常量加密 | 常量 -> 解密调用 | dnSpy 运行时求值；Frida CLR hook |
| 资源加密 | AES 加密资源 | Hook ResourceManager.GetObject |

**Anti-tamper NOP 补丁：**
```javascript
"use strict";
// !name2ee target.exe ConfuserEx.AntiTamper::Verify ->!dumpmd ->NativeCode
const antiTamperAddr = ptr("0x7FFC_AABBCCDD");
Memory.protect(antiTamperAddr, 16, "rwx");
antiTamperAddr.writeByteArray([0xB8,0x01,0x00,0x00,0x00,0xC3]);  // mov eax,1 / ret
```

### EazFuscator

```
1. de4dot -f eazfuscator ->partial cleanup (string decrypt limited)
2. String decryption: EazFuscator uses method-level string decrypt with index table
   ->dnSpy: find decrypt method (returns string, takes int/long arg)
   ->Frida CLR (Pattern 17): hook decrypt method ->log (index, plaintext) pairs ->build map
3. Control flow: switch-based dispatcher ->de4dot partial; residual ->dnSpy "Decompile" mode
4. Resource encryption: hook ResourceManager in dnSpy ->extract decrypted resources
5. Anti-tamper: strong name validation bypass ->copy IL to clean assembly; re-sign with sn.exe
```

### SmartAssembly

```
1. de4dot -f smartassembly ->handles most obfuscation
2. Residual: encrypted resources (embedded in resource section as byte arrays)
   ->Hook resource load callback in Frida CLR; capture decrypted bytes
3. Control flow pruning: SmartAssembly injects unreachable branches ->ILSpy linearizes
4. Error reporting module (phones home): locate SmartAssembly.ExceptionReporting
   ->NOP out or redirect endpoint; document network endpoint as IOC
5. Sealed class protection: ILSpy/dnSpy can reconstruct; no special bypass needed
```

### Dotfuscator
```
1. de4dot auto-detect (usually sufficient)
2. If fails: locate string decrypt (int index ->string); Frida CLR ->dump (index, plaintext) pairs
3. Control flow: ILSpy/dnSpy linearizes "goto" spaghetti
4. Proxy delegates: dnSpy "Analyze ->Used By" on each proxy type
```

### Obfuscar
```
1. de4dot -f obfuscar ->readable names
2. String key: static field initializer at module load ->hook in dnSpy
3. Reflection invocation: hook Type.GetMethod + MethodBase.Invoke
4. No CFG obfuscation ->ILSpy clean post-de4dot
```

---

## 止损衔接：检查点单元（L2/L3）

.NET 混淆剥离属 L2（常规混淆）至 L3（虚拟化/强混淆）路线（分级见 `references/anti-shortcut-system.md`「路线预算分级」）。

- 检查点单元：每剥除 **1 个混淆层**（字符串加密 / 控制流 / 代理委托 / 资源加密，各算一层）为一个检查点；判据 = 自上一检查点以来新增 clues/evidence 数，检查点零新增才允许按四级转向阶梯升级。
- 单个混淆层内部允许至多 K=12 次变参探针（对齐通道层预算律）；工具家族内连续 3 次变参失败只 PARK 当前工具，不判死「.NET 还原」整条路线。

---

