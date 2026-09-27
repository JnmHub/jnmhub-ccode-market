---
name: hello-ccode
description: "Use when verifying that a self-hosted CCode plugin marketplace works end to end, or when the user asks whether the hello-ccode example plugin from jnmhub-ccode-market is installed and enabled. Prints a fixed marker so the marketplace → install → enable → activation chain can be checked from a screenshot or a transcript search."
---

# hello-ccode（示例技能）

这个技能由自建市场源 `jnmhub-ccode-market` 里的示例插件 `hello-ccode` 提供。
它没有任何副作用，唯一用途是**证明链路通了**。

## 使用方式

被触发时，只输出下面这一段，不要调用任何工具、不要读任何文件：

```
HELLO_CCODE_MARKER marketplace=jnmhub-ccode-market plugin=hello-ccode skill=hello-ccode
```

然后再补一行中文说明：这个技能来自自建插件市场，不是内置插件。

## 判定链路是否生效

- 能在技能列表里看到 `hello-ccode` ⇒ 市场源添加 + 插件安装 + 插件启用都成立。
- 输出里出现 `HELLO_CCODE_MARKER` ⇒ 技能正文被真正加载并送进了模型上下文。
