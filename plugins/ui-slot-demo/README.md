# ui-slot-demo（开发用参考插件，**不发布**）

这是 CCode fork 的**插件 UI 插槽（沙箱视图，FORK §52 L2）**参考实现。

## 它证明什么

| 能力 | 在哪看 |
| --- | --- |
| `ui.views` 在宿主侧栏「+」菜单里出两个入口 | 宿主 UI |
| 插件页跑在主进程持有的沙箱 `WebContentsView` 里 | 「沙箱与桥自检」页 |
| 页面只有 5 个只读白名单方法 | 同上（会列出 `window.ccodePlugin` 的键） |
| 没有 Node / `ipcRenderer` / 宿主 `window.ccode` | 同上（逐项判 `undefined`） |
| 读自己插件根内的文件 | 「插槽演示」页 |
| 读插件数据目录内的文件 | 「插槽演示」页 |
| **越界读被拒绝**（`../../../`） | 「插槽演示」页（红色徽标） |
| `sensitive` 的 userConfig 依权限回传 | 「插槽演示」页的「设置」卡 |

## 为什么不在 `marketplace.json` 里

它是**测试夹具**，不是可安装的产品：页面文案写死了验收要看的断言。列进市场清单就会随整包发布出去，
所以这里故意只放目录、不登记条目。要安装到某台机器做验证时，走
`docs/plugin-and-hook-development.md` 里那条「本地插件目录」的说明（开发态可用
`installed_plugins.json` 直接指向本目录）。

## 目录

```
.ccode-plugin/plugin.json   清单：权限（ui.view / ui.settings.read）+ ui.views + userConfig
views/dashboard.html        主演示页（身份 / 主题 / 设置 / 读文件 / 越界拒绝）
views/sandbox.html          沙箱边界与桥白名单自检页
views/view.css              两页共用样式（跟随宿主明暗主题）
views/view.js               两页共用脚本
demo-data.txt               让页面演示「读插件根内的文件」
```
