# Hook Snippets 与环境探测模板

本文件提供历史技术示例，按需阅读，不是必须执行的模板流程。任何真实操作仍需独立确认授权、环境与副作用。

## 首次 Frida 环境探测模板

以下模板仅供选择相关探测项时参考，不要求运行模板或写固定日志。环境事实可在 report 引用实际证据；进程和 PID 可能变化，不把历史记录当成本次有效状态。

```javascript
// frida-env-probe.js — 一次性环境探测，保存到 run/frida-env-probe.log
// 用法: frida -U -f <package> -l frida-env-probe.js  (spawn；16.x frida-tools 需加 --no-pause，见 frida-version-policy.md)
//    或: frida -U <pid> -l frida-env-probe.js                      (attach)

function probeEnv() {
    var result = {};

    // === Phase 1: 基础环境 ===
    result.fridaVersion = Frida.version;

    // 版本核对：支持集见 frida-version-policy.md（17.6.2 推荐 / 16.5-16.8 legacy）
    var vParts = Frida.version.split(".");
    var vMajor = parseInt(vParts[0], 10) || 0;
    var vMinor = parseInt(vParts[1], 10) || 0;
    result.fridaVersionStatus =
        Frida.version === "17.6.2" ? "recommended" :
        (vMajor === 16 && vMinor >= 5) ? "legacy-supported" :
        vMajor === 16 ? "below-floor(16.5)" : "unverified";

    result.platform = Process.platform;
    result.arch = Process.arch;
    result.pageSize = Process.pageSize;

    // SELinux 状态
    try {
        var selinux = File.readAllText("/sys/fs/selinux/enforce");
        result.selinuxEnforcing = selinux.trim() === "1";
    } catch (e) {
        result.selinuxEnforcing = "unknown (非 root)";
    }

    // === Phase 2: 模块枚举 ===
    result.processes = Process.enumerateModules().map(function(m) {
        return { name: m.name, base: m.base.toString(), size: m.size };
    });

    // 检查任务指定的关键 SO 是否加载（按需替换列表）
    var keySOs = ['libjiagu.so', 'libmtguard.so', 'libshell-super.2019.so',
                  'libapp.so', 'libil2cpp.so'];
    result.loadedModules = {};
    keySOs.forEach(function(name) {
        try { var m = Process.findModuleByName(name); result.loadedModules[name] = m ? { base: m.base.toString(), size: m.size } : null; }
        catch(e) { result.loadedModules[name] = 'error: ' + e; }
    });

    // 可疑匿名映射（Houdini/翻译层/内存 dump 场景）
    var namedCount = result.processes.filter(function(m) { return m.name !== ''; }).length;
    if (namedCount < result.processes.length * 0.5) {
        result.suspiciousAnon = result.processes.filter(function(m) {
            return m.name === '' && m.size > 0x10000;
        }).slice(0, 10);
    }

    // === Phase 3: Java 环境可用性 ===
    result.javaAvailable = Java.available;
    if (Java.available) {
        Java.perform(function() {
            // Android 版本（影响 hook 策略：ART 内联、deopt 需求等）
            var Build = Java.use('android.os.Build$VERSION');
            result.androidSdk = Build.SDK_INT.value;
            result.androidRelease = Build.RELEASE.value;

            // 当前 Application 类名
            try {
                var app = Java.use('android.app.ActivityThread').currentApplication();
                result.applicationClass = app.getClass().getName();
            } catch (e) {
                result.applicationClass = 'unavailable: ' + e;
            }

            // 目标类预检（替换为任务目标类）
            var targetClasses = [
                // "com.target.SignUtil",
                // "com.target.network.RequestBuilder",
            ];
            result.targetClassStatus = {};
            Java.enumerateClassLoaders({
                onMatch: function(loader) {
                    targetClasses.forEach(function(cls) {
                        if (result.targetClassStatus[cls]) return;
                        try {
                            loader.loadClass(cls);
                            result.targetClassStatus[cls] = 'loaded';
                        } catch (e) {
                            // 未在此 loader
                        }
                    });
                },
                onComplete: function() {
                    targetClasses.forEach(function(cls) {
                        if (!result.targetClassStatus[cls]) {
                            result.targetClassStatus[cls] = 'not-loaded';
                        }
                    });
                }
            });
        });
    }

    send(JSON.stringify(result, null, 2));
}
setImmediate(probeEnv);
```

**探测结果决策表**：

| 探测结果 | 建议操作 |
|----------|----------|
| fridaVersionStatus 不是 recommended / legacy-supported | 先按 `references/frida-version-policy.md` 对齐版本（17.6.2 或 16.5-16.8），再继续后续探测 |
| Java 可用 + 目标类已加载 | attach 模式，直接 hook |
| Java 可用 + 目标类未加载 | attach 模式，先触发目标类加载（导航到对应页面）|
| Java 不可用 | spawn 模式 (`-f`)，或目标为纯 native 进程 |
| SELinux enforcing | 需要 `adb shell setenforce 0` 或使用 Magisk |
| SO 未加载 | spawn 模式或使用 dlopen 监听（见下方片段）|
| Android SDK >= 28 | 注意 AOT 编译可能影响 hook 命中，必要时 `adb shell cmd package compile -m speed -f <pkg>` |

**环境探测完成后**，在后续脚本中直接使用探测到的 PID/模块信息，不再重复探测。若进程重启导致 PID 漂移，使用 `adb shell pidof <package>:<process>` 一行命令获取新 PID，不再手动 `ps | grep`。

### SO 加载时序监听

当探测发现目标 SO 未加载时，先注入以下监听脚本，再触发目标操作：

```javascript
var TARGET_SO = "libtarget.so";  // 替换

function hookWhenLoaded(callback) {
    var module = Process.findModuleByName(TARGET_SO);
    if (module) { callback(module.base); return; }
    Interceptor.attach(Module.findGlobalExportByName("android_dlopen_ext"), { // Frida 17+；16.x 见 frida-version-policy.md
        onEnter: function(args) { this.path = args[0].readUtf8String(); },
        onLeave: function() {
            if (this.path && this.path.indexOf(TARGET_SO) !== -1) {
                var loaded = Process.findModuleByName(TARGET_SO);
                if (loaded) callback(loaded.base);
            }
        }
    });
}

hookWhenLoaded(function(base) {
    console.log("[dlopen] " + TARGET_SO + " loaded at " + base);
    // 在此添加 hook 逻辑
});
```

### 多进程场景进程选择

```javascript
// 在终端执行：frida-ps -Ua | grep <package>
// 常见多进程：主进程 + :pushservice + :webview + : PRIV
// Hook 目标一般在主进程（无冒号前缀）
// 若需 hook 多进程，对每个进程分别注入或使用 frida -U -f <pkg>:<process>
```

默认不要从空白脚本起步，优先直接改 task-local baseline。所有 frida 相关 baseline 已内置 16/17 兼容层与版本守卫（策略见 `references/frida-version-policy.md`），从模板改起时保留头部兼容层，不要回退到 17.0 已移除的 API：

- `run/register-natives-trace.js`: `loadLibrary`、`dlopen`、`JNI_OnLoad`、`RegisterNatives`
- `run/register-natives-trace-advanced.js`: 增强版，补 `dlsym`、`RegisterNatives` 回溯、匿名函数指针与高噪声过滤
  常用 preset：`shell_dynamic_registration`、`shell_dynamic_registration_multiprocess`
- `run/class-loader-trace.js`: `DexClassLoader`、`InMemoryDexClassLoader`、`PathClassLoader`
- `run/class-loader-trace-advanced.js`: 增强版，补 `BaseDexClassLoader`、`dexElements`、`findClass/loadClass` 观察
- `run/anti-root-bypass.js`: root 包、二进制、属性、命令探测
- `run/anti-root-bypass-advanced.js`: 增强版，补 native 文件探测、`__system_property_get`、RootBeer 定向处理
- `run/anti-frida-bypass.js`: Frida 关键词、路径、libc 字符串比较与探测路径
- `run/anti-frida-bypass-advanced.js`: 增强版，补端口扫描阻断、更多 proc/path/native 探测面
  常用 preset：`cronet_multiprocess`、`stealth_spawn_child`
- `run/integrity-bypass.js`: 本地签名/安装源/调试态/常见 Integrity facade
- `run/integrity-bypass-advanced.js`: 增强版，补类加载观察、Play Integrity / SafetyNet builder 与 boolean 强制返回位点
  常用 preset：`rootbeer_play_integrity`、`legacy_safetynet`
- `run/cert-pinning-bypass.js`: `SSLContext`、Conscrypt、OkHttp、WebView
- `run/cert-pinning-bypass-advanced.js`: 增强版，补 HttpsURLConnection、Cronet builder 与可选 native verify patch
- `run/frida-java-template.js`: Java 方法与构造器 trace baseline
- `run/frida-java-template-advanced.js`: 增强版，补 byte array 预览、thread/stack 输出、class-load watch、boolean force
- `run/frida-native-template.js`: export/symbol trace baseline
- `run/frida-native-template-advanced.js`: 增强版，补 `dlopen` / `dlsym` 观察与更强 backtrace

若目标是 `A6 / A7`，先配合 `references/a6-a7-failure-pattern-cookbook.md` 选择最像当前症状的 pattern，再改对应 baseline。
若增强版已内置 preset，先切 `ACTIVE_PRESET`，再只改剩余目标特有字段。

## 常用切入点

- `RegisterNatives`: 记录类名、方法名、签名、函数地址、模块偏移
- `DexClassLoader`: 记录 dex path、loader 链、首次命中时机
- `Cipher / MessageDigest / Signature`: 把输入、输出、调用方拆开记录
- `OkHttp / CertificatePinner`: 记录 URL、host、headers、pinning 命中点
- `SSL_write / SSL_read`: 只截短预览，先确认是否已进入 TLS 明文边界

