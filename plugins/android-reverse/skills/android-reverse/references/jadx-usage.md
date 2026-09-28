# jadx 使用参考

## 基本用法

```bash
# 反编译 APK 到目录
jadx -d output-dir/ target.apk

# 反编译 DEX
jadx -d output-dir/ classes.dex

# 反编译 JAR/AAR
jadx -d output-dir/ library.jar
```

## 关键选项

| 选项 | 说明 |
|---|---|
| `-d <dir>` | 输出目录 |
| `--deobf` | 启用反混淆（重命名 a/b/c 为有意义的名称） |
| `--show-bad-code` | 反编译错误时仍输出代码（不完美但比没有好） |
| `--no-res` | 跳过资源文件解码 |
| `--export-gradle` | 导出为 Gradle 项目结构 |
| `--threads-count N` | 并行线程数 |
| `--log-level DEBUG` | 详细日志用于排查问题 |
| `--comments-code` | 在输出中注入注释 |
| `-e` / `--export-gradle` | 保存为可导入 Android Studio 的项目 |

## 文件类型处理

| 输入 | jadx 支持 | 说明 |
|---|---|---|
| `.apk` | 原生 | 直接处理 |
| `.dex` | 原生 | 单独 DEX 文件 |
| `.jar` | 原生 | Java 归档 |
| `.aar` | 原生 | Android 库 |
| `.xapk` | 需预处理 | 先解压再逐个处理内部 APK |
| `.aab` | 需预处理 | 使用 bundletool 转换 |

## 混淆处理策略

### 策略 1: --deobf 自动重命名

```bash
jadx --deobf --show-bad-code -d output/ target.apk
```

jadx 会自动：
- 重命名 `a.b.c` 为 `ClassName_xxx`
- 恢复部分方法名
- 生成 `jobf` 映射文件

### 策略 2: ProGuard mapping 文件

若能获取 `mapping.txt`（如从 APK 内部或开发团队获取）：

```bash
# jadx 本身不直接使用 mapping，但可通过 ReTrace 工具辅助
# 或在 jadx-gui 中手动对照
```

### 策略 3: jadx-gui 交互式分析

```bash
jadx-gui target.apk
```

GUI 功能：
- 搜索类名、方法名、字符串
- 交叉引用 (Xref) 查看
- 反混淆重命名
- 保存为 Gradle 项目

## 常见工作流

### 快速分诊

```bash
jadx --show-bad-code --threads-count 8 -d output/ target.apk
# 然后检查 AndroidManifest.xml 和主包结构
```

### 深度分析

```bash
jadx --deobf --show-bad-code --export-gradle -d output/ target.apk
# 生成可导入 Android Studio 的项目
```

### 仅代码不资源（加速）

```bash
jadx --no-res --show-bad-code -d output/ target.apk
```

## 局限性

- 对高度混淆的代码可能输出不完整
- Lambda 表达式和 Kotlin 协程有时还原不准确
- 不支持动态加载的 DEX（需要先 dump）
- 对加壳 APK 无效（需要先脱壳）
