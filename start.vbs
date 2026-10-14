' AI 办公室启动脚本 —— 隐藏窗口后台运行，绝不弹终端
' 启动: 双击此文件 或 wscript.exe start.vbs
Option Explicit
Dim sh, fso, BASE, PY, SCRIPT, LOG, URL, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
BASE = fso.GetParentFolderName(WScript.ScriptFullName)
PY = BASE & "\venv\Scripts\pythonw.exe"
SCRIPT = BASE & "\server_app.py"
LOG = BASE & "\server.log"
URL = "http://127.0.0.1:8889/api/healthz"

' 如果已在跑就不重复启动
If Ready(URL) Then
  WScript.Echo "AI 办公室已在运行"
  WScript.Quit 0
End If

' 隐藏窗口启动
sh.Run "cmd /c start """" /b """ & PY & """ """ & SCRIPT & """ >> """ & LOG & """ 2>&1", 0, False

' 等待后端就绪
For i = 1 To 30
  WScript.Sleep 1000
  If Ready(URL) Then
    WScript.Echo "AI 办公室已启动: http://127.0.0.1:8889/"
    WScript.Quit 0
  End If
Next
WScript.Echo "AI 办公室启动失败，请查看 " & LOG
WScript.Quit 1

Function Ready(url)
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", url, False
  http.Send
  If http.Status = 200 Then
    Ready = True
  Else
    Ready = False
  End If
  On Error GoTo 0
End Function
