$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$name = 'ebongiu Localhost'
$nodePath = (Get-Command node.exe).Source
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$runner = Join-Path $PSScriptRoot 'run-local.vbs'
$arguments = '//B //Nologo "' + $runner + '" "' + $nodePath + '"'
$action = New-ScheduledTaskAction -Execute (Get-Command wscript.exe).Source -Argument $arguments -WorkingDirectory $projectDir
$triggers = @(
  New-ScheduledTaskTrigger -AtLogOn -User $user
  New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and $existing.Actions.WorkingDirectory -ne $projectDir) {
  throw 'A different task already uses the name ebongiu Localhost.'
}
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings -User $user -RunLevel Limited -Force | Out-Null
Start-ScheduledTask -TaskName $name
