' AI 办公室关闭脚本 —— 停掉 pythonw.exe 进程(只停本项目 venv 的)
Option Explicit
Dim sh, fso, BASE, wmi, procs, p
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
BASE = fso.GetParentFolderName(WScript.ScriptFullName)

' 用 WMI 直接查 pythonw.exe 进程，检查命令行是否包含 ai-office\server_app.py
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='pythonw.exe' OR Name='python.exe'")

Dim found, pid
found = False
For Each p In procs
  If InStr(1, Replace(p.CommandLine, "\\", "\"), BASE & "\server_app.py", 1) > 0 Then
    pid = p.ProcessId
    found = True
    Exit For
  End If
Next

If found Then
  sh.Run "taskkill /T /F /PID " & pid, 0, True
  WScript.Echo "AI 办公室已停止"
Else
  WScript.Echo "AI 办公室未在运行"
End If
