param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies @('System.Drawing', 'System.Drawing.Common', 'System.Private.Windows.GdiPlus', 'System.Private.Windows.Core') @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class StarChatWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);

  public static string CaptureLargest(int processId, string outputPath) {
    IntPtr selected = IntPtr.Zero;
    RECT selectedRect = new RECT();
    long selectedArea = 0;
    EnumWindows(delegate(IntPtr hWnd, IntPtr extra) {
      uint owner; GetWindowThreadProcessId(hWnd, out owner);
      if (owner != (uint)processId) return true;
      RECT rect; if (!GetWindowRect(hWnd, out rect)) return true;
      long width = Math.Max(0, rect.Right - rect.Left);
      long height = Math.Max(0, rect.Bottom - rect.Top);
      long area = width * height;
      if (area > selectedArea) { selected = hWnd; selectedRect = rect; selectedArea = area; }
      return true;
    }, IntPtr.Zero);
    if (selected == IntPtr.Zero) throw new InvalidOperationException("No capturable window found for process " + processId);
    int bitmapWidth = Math.Max(1, selectedRect.Right - selectedRect.Left);
    int bitmapHeight = Math.Max(1, selectedRect.Bottom - selectedRect.Top);
    using (var bitmap = new Bitmap(bitmapWidth, bitmapHeight, PixelFormat.Format32bppArgb))
    using (var graphics = Graphics.FromImage(bitmap)) {
      IntPtr dc = graphics.GetHdc();
      bool ok = PrintWindow(selected, dc, 2);
      graphics.ReleaseHdc(dc);
      if (!ok) throw new InvalidOperationException("PrintWindow failed");
      bitmap.Save(outputPath, ImageFormat.Png);
    }
    return string.Format("{{\"left\":{0},\"top\":{1},\"width\":{2},\"height\":{3}}}", selectedRect.Left, selectedRect.Top, bitmapWidth, bitmapHeight);
  }
}
'@

$directory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $directory | Out-Null
[StarChatWindowCapture]::CaptureLargest($ProcessId, $OutputPath)
