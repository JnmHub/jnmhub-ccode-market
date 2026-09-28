# 一体化截图取证助手：截取目标进程主窗口（找不到可见窗口时退化为全屏），缩放至 <=MaxWidth 宽后以 JPEG 落盘。
# 用法：pwsh tools/verify/capture-screen.ps1 -ProcessName <进程名> -OutPath <落盘路径> [-MaxWidth 1280] [-JpegQuality 85]
# 设计目的：未缩放的 2560 宽全屏图经内置 Read 注入上下文约 60 万字符（≈SKILL.md 全文 42 倍），是长上下文最大单点来源；1280 宽 JPEG 约 13-23 万字符（随画面复杂度变化）。
# 纪律：禁止直接 Read 未经本脚本（或等效缩放）处理的原始截图；被遮挡窗口的截图作废不进上下文。
param(
  [string]$ProcessName = "",
  [string]$WindowTitle = "",
  [Parameter(Mandatory = $true)][string]$OutPath,
  [int]$MaxWidth = 1280,
  [int]$JpegQuality = 85
)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
if (-not ('WinRect' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinRect {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@
}
$hwnd = [IntPtr]::Zero
if ($ProcessName) {
  $p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { $hwnd = $p.MainWindowHandle }
}
if ($hwnd -eq [IntPtr]::Zero -and $WindowTitle) {
  $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { $hwnd = $p.MainWindowHandle }
}
$bx = 0; $by = 0; $bw = 0; $bh = 0
if ($hwnd -ne [IntPtr]::Zero -and [WinRect]::IsWindowVisible($hwnd) -and -not [WinRect]::IsIconic($hwnd)) {
  $r = New-Object WinRect+RECT
  [void][WinRect]::GetWindowRect($hwnd, [ref]$r)
  $bw = $r.Right - $r.Left; $bh = $r.Bottom - $r.Top; $bx = $r.Left; $by = $r.Top
}
if ($bw -lt 100 -or $bh -lt 100) {
  $s = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bx = $s.Left; $by = $s.Top; $bw = $s.Width; $bh = $s.Height
  Write-Host "[capture-screen] 未找到可见目标窗口，退化为全屏截取"
}
$bmp = New-Object System.Drawing.Bitmap $bw, $bh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bx, $by, 0, 0, $bmp.Size)
$out = $bmp
if ($bw -gt $MaxWidth) {
  $nh = [int]($bh * $MaxWidth / $bw)
  $out = New-Object System.Drawing.Bitmap $MaxWidth, $nh
  $g2 = [System.Drawing.Graphics]::FromImage($out)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($bmp, 0, 0, $MaxWidth, $nh)
  $g2.Dispose()
}
$ow = $out.Width; $oh = $out.Height
$dir = Split-Path -Parent $OutPath
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$JpegQuality)
$out.Save($OutPath, $enc, $ep)
$g.Dispose(); $bmp.Dispose(); if ($out -ne $bmp) { $out.Dispose() }
$len = (Get-Item $OutPath).Length
Write-Host ("[capture-screen] {0} {1}x{2} -> {3} bytes (base64 约 {4} 字符)" -f $OutPath, $ow, $oh, $len, [int]($len * 4 / 3))
