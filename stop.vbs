' AI 办公室关闭脚本 —— 停掉 pythonw.exe 进程(只停本项目 venv 的)
Option Explicit
Dim sh, fso, BASE
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
BASE = fso.GetParentFolderName(WScript.ScriptFullName)

' 用 wmic 查 pythonw.exe 的命令行是否包含 ai-office\server_app.py
Dim cmd, out
cmd = "wmic process where ""name='pythonw.exe' and CommandLine like '%%ai-office%%server_app.py%%'"" get ProcessId /value"
out = sh.Exec("cmd /c " & cmd).StdOut.ReadAll()

If InStr(out, "ProcessId=") > 0 Then
  sh.Run "taskkill /F /FI ""PID eq " & Trim(Replace(out, "ProcessId=", "")) & """", 0, True
  WScript.Echo "AI 办公室已停止"
Else
  WScript.Echo "AI 办公室未在运行"
End If
