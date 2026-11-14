Set WshShell = CreateObject("WScript.Shell")
' Run the batch file completely hidden (0 means hidden window)
WshShell.Run chr(34) & "start_bot.bat" & Chr(34), 0
Set WshShell = Nothing
