## Windows 自绘 UI 逆向

### 识别特征
```
- RegisterClassEx 使用自定义 WndProc（最终处理不是 DefWindowProc）
- WM_PAINT 手绘全部控件；没有标准 CreateWindowEx 子控件
- WM_NCPAINT/WM_NCCALCSIZE -> 自定义非客户区渲染
- WM_LBUTTONDOWN 通过手动命中测试而非标准按钮 HWND
- 重度使用 BitBlt/StretchBlt/AlphaBlend 做皮肤；资源位图作为按钮状态
```

### 消息分发流程
```
Step 1: IDA -> GetMessageW/PeekMessageW -> DispatchMessageW -> 主 WndProc

Step 2: 绘制 WndProc 的 switch/if 分支。关键消息：
  WM_PAINT (0x000F)       -> 绘制、皮肤渲染
  WM_LBUTTONDOWN (0x0201) -> 点击、手动 hit-test（关键）
  WM_KEYDOWN (0x0100)     -> 键盘快捷键
  WM_COMMAND (0x0111)     -> 菜单/加速键分发
  WM_USER+N (>=0x0400)    -> 内部消息协议（高价值）
  WM_APP+N  (>=0x8000)    -> 跨窗口消息

Step 3: x64dbg 在 WndProc 入口下条件断点：
  x86: [esp+8]==0x0400+N     -> 记录 [esp+0xC] wParam / [esp+0x10] lParam
  x64: rdx==0x0400+N         -> 记录 r8 wParam / r9 lParam

Step 4: 定位控件状态结构（enabled/hovered/pressed/bounds RECT）
  WM_MOUSEMOVE -> 状态更新 -> WM_PAINT 重绘

Step 5: 映射点击 -> handler：
  WM_LBUTTONDOWN -> hit_test(x,y) -> element_index -> dispatch_action(element_index)
    case 0: feature_A(); case 2: validate_license()  -> 关键目标
  在 dispatch_action 的 RVA 处 Hook（Pattern 2）

Step 6: SetWindowsHookEx(WH_CALLWNDPROC)? -> 找到 lpfn -> 全局 Hook（Pattern 2）
```

### UIElement 结构体（IDA 模板）
```c
struct UIElement {
    RECT    bounds;       // +0x00  hit-test rect
    int     state;        // +0x10  0=normal 1=hover 2=pressed 3=disabled
    int     id;           // +0x14  maps to WM_COMMAND/WM_USER dispatch
    HBITMAP hBmpNormal;   // +0x18
    HBITMAP hBmpHover;    // +0x20
    HBITMAP hBmpPressed;  // +0x28
    WCHAR   tooltip[128]; // +0x30
    LPVOID  onClick;      // +0xB0  handler function pointer
};
// IDA: xref hBmpNormal loads -> trace to global UIElement array
```

---

### 运行时窗口取证
- 桌面窗口枚举/取证：直接 `pwsh tools/verify/enum-windows.ps1 [-TargetPid N] [-ClassRegex re]`，勿从零手写 Add-Type EnumWindows（pwsh 进程边界三坑：Add-Type 类型不跨进程/内联 heredoc 格式化 ParserError/`$Pid` 只读保留字）。

---

### 菜单/前置导航助手（对话框尚未打开时）

老 MFC/VCL 族 UIA 支持差时的通用替代：Win32 菜单 API 枚举 + `WM_COMMAND` 直发。**禁止写死任何菜单标题**——命令 ID 与菜单位置一律以现场枚举为准。

```powershell
# STA 会话内执行；$h 为主窗句柄（enum-windows.ps1 取得）
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public static class MenuProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr hMenu);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetMenuString(IntPtr hMenu, uint uIDItem, StringBuilder lpString, int nMaxCount, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr hMenu, int nPos);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr hMenu, int nPos);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
$menu = [MenuProbe]::GetMenu($h)
for ($top = 0; $top -lt [MenuProbe]::GetMenuItemCount($menu); $top++) {
  $sb = New-Object System.Text.StringBuilder 256
  [MenuProbe]::GetMenuString($menu, $top, $sb, 256, 0x400) | Out-Null          # MF_BYPOSITION
  $sub = [MenuProbe]::GetSubMenu($menu, $top)
  for ($i = 0; $i -lt [MenuProbe]::GetMenuItemCount($sub); $i++) {
    $id = [MenuProbe]::GetMenuItemID($sub, $i)                                  # separator 为 0xFFFFFFFF
    if ($id -ne 0xFFFFFFFF) { "[menu:{0}] item={1} cmdId={2}" -f $sb.ToString(), $i, $id }
  }
}
# 直发命令（wParam 低 16 位 = 命令 ID；lParam = 0），等价用户点击该菜单项：
[MenuProbe]::PostMessage($h, 0x0111, [IntPtr]$cmdId, [IntPtr]::Zero)            # WM_COMMAND
```

### outcome-level 成功信号目录

配合 `gui-drive.ps1.template` 的 `-SuccessProbe` 参数使用：模板只负责执行探针脚本并逐行记录输出，「成功」的判定语义由下列四类通用信号承载，按目标择一或组合。

```text
[1] 授权/配置数据文件回写前后哈希变化 —— 探针脚本对目标数据文件算 SHA256，动作前后各一次比对
[2] 窗口标题变化 —— GetWindowText 轮询主窗标题，与动作前基线比对
[3] 全局标志翻转 —— 静态定位标志地址后用只读内存模板读值比对（tools/verify/ps-read-memory.ps1）
[4] registry 键值变化 —— 探针脚本对目标键路径做查询，动作前后比对

-SuccessProbe 使用说明：
  pwsh -STA -File run/gui-drive.ps1 ... -SuccessProbe run\success-probe.ps1
  模板在触发提交并排空结果弹窗后调用该脚本，stdout 逐行记入 STEP 日志（success-probe 步）；
  模板不解释输出语义——成败由操作者对照上述四类信号判读。
```

