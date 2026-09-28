# PowerShell 只读内存三件套模板（OpenProcess / VirtualQueryEx / ReadProcessMemory，只读不写）。
# 用途：CE MCP 通道失效（bridge 死）时的只读内存取证降级路径。禁止即兴重写 P/Invoke 签名——直接抄本模板。
# 用法：
#   pwsh tools/verify/ps-read-memory.ps1 -TargetPid <pid> -Regions                            # 枚举可读 committed 区域
#   pwsh tools/verify/ps-read-memory.ps1 -TargetPid <pid> -Address 0x1A2B3C000 -Size 256      # 读内存并十六进制输出
param(
  [Parameter(Mandatory = $true)][int]$TargetPid,
  [string]$Address = "",
  [int]$Size = 256,
  [switch]$Regions
)
if (-not ('MemRead' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class MemRead {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr VirtualQueryEx(IntPtr h, IntPtr addr, out MEMORY_BASIC_INFORMATION64 mbi, IntPtr len);
  [StructLayout(LayoutKind.Sequential)] public struct MEMORY_BASIC_INFORMATION64 {
    public ulong BaseAddress; public ulong AllocationBase; public uint AllocationProtect;
    public uint __align1; public ulong RegionSize; public uint State; public uint Protect; public uint Type; public uint __align2;
  }
}
'@
}
$PROCESS_QUERY_INFORMATION = 0x0400; $PROCESS_VM_READ = 0x0010
$MEM_COMMIT = 0x1000; $PAGE_NOACCESS = 0x01; $PAGE_GUARD = 0x100
$h = [MemRead]::OpenProcess($PROCESS_QUERY_INFORMATION -bor $PROCESS_VM_READ, $false, $TargetPid)
if ($h -eq [IntPtr]::Zero) { Write-Error "OpenProcess 失败（pid=$TargetPid, err=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())）——检查权限/架构/PPL"; exit 1 }
try {
  if ($Regions) {
    $addr = [uint64]0
    while ($addr -lt 0x7FFFFFF00000) {
      $mbi = New-Object MemRead+MEMORY_BASIC_INFORMATION64
      $r = [MemRead]::VirtualQueryEx($h, [IntPtr]::new([long]$addr), [ref]$mbi, [IntPtr]::new([System.Runtime.InteropServices.Marshal]::SizeOf($mbi)))
      if ($r -eq [IntPtr]::Zero) { break }
      if ($mbi.State -eq $MEM_COMMIT -and $mbi.Protect -ne $PAGE_NOACCESS -and ($mbi.Protect -band $PAGE_GUARD) -eq 0) {
        Write-Host ("0x{0:X12} size=0x{1:X} protect=0x{2:X} type=0x{3:X}" -f $mbi.BaseAddress, $mbi.RegionSize, $mbi.Protect, $mbi.Type)
      }
      if ($mbi.RegionSize -eq 0) { break }
      $addr = $mbi.BaseAddress + $mbi.RegionSize
    }
    exit 0
  }
  if (-not $Address) { Write-Error "缺少 -Address（或改用 -Regions）"; exit 1 }
  $base = [Convert]::ToInt64($Address, 16)
  $buf = New-Object byte[] $Size
  $read = [IntPtr]::Zero
  if (-not [MemRead]::ReadProcessMemory($h, [IntPtr]$base, $buf, [IntPtr]::new($Size), [ref]$read)) {
    Write-Error "ReadProcessMemory 失败（err=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())）"; exit 1
  }
  $n = $read.ToInt64()
  for ($i = 0; $i -lt $n; $i += 16) {
    $hex = ($buf[$i..([Math]::Min($i + 15, $n - 1))] | ForEach-Object { $_.ToString('X2') }) -join ' '
    Write-Host ("0x{0:X12}: {1}" -f ($base + $i), $hex)
  }
} finally { [void][MemRead]::CloseHandle($h) }
