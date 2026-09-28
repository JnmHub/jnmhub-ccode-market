# 框架级窗口枚举取证助手（round3 U1，豁免通道首例；蓝本=R2 复测会话模型自写脚本，实战调用 ~7 次）
# 用法：pwsh tools/verify/enum-windows.ps1 [-TargetPid <pid>] [-ClassRegex <regex>]
# 输出列：0x<hwnd> pid=<pid> cls=<窗口类名> title=<标题> vis=<True|False>；已知限制：owner-drawn 窗口 GetWindowText 可能取空，此时改用 EnumChildWindows 或 UI Automation 兜底。
param([uint32]$TargetPid = 0, [string]$ClassRegex = "")
if (-not ('WEnum' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class WEnum {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static List<string> Scan(uint targetPid, string classRegex) {
    var r = new List<string>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      bool pidOk = targetPid == 0 || pid == targetPid;
      bool clsOk = string.IsNullOrEmpty(classRegex) || Regex.IsMatch(c.ToString(), classRegex);
      if (pidOk && clsOk) {
        var t = new StringBuilder(512); GetWindowText(h, t, 512);
        r.Add(string.Format("0x{0:X} pid={1} cls={2} title={3} vis={4}", h.ToInt64(), pid, c, t, IsWindowVisible(h)));
      }
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
'@
}
[WEnum]::Scan($TargetPid, $ClassRegex) | ForEach-Object { Write-Output $_ }
