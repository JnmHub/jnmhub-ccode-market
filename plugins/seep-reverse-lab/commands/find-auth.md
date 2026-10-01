---
description: 检索本地授权/会员/订阅/License 相关的判断函数、符号与分支位点
argument-hint: <目标>
---

[授权白盒审计任务] 在目标 "$ARGUMENTS" 中检索本地授权、VIP、Subscription、License 相关的判断函数、符号与分支位点。

做法：先按关键字（license / auth / vip / subscription / expire / trial / activate / 卡密 / 授权）在字符串表、导入表与符号表中定位，再回溯交叉引用，输出「位点清单 + 每个位点的判定逻辑摘要」。

不要止步于列出字符串 —— 必须给出引用它的代码位置。
