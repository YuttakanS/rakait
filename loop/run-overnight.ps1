<#
  Overnight autonomous loop for Claude Code (Windows PowerShell).

  Usage (from anywhere, AFTER committing or stashing your own work):
    powershell -ExecutionPolicy Bypass -File loop\run-overnight.ps1

  Emergency stop (from another terminal):
    New-Item loop\STOP

  NOTE: verify the flags below with `claude --help` before the first real run.
#>
param(
  [int]$MaxIterations = 40,
  [int]$DeadlineHour = 7,            # stop at the next 07:00
  [int]$MaxConsecutiveFailures = 12, # failures usually mean usage limits; wait and retry
  [int]$FailSleepMinutes = 20,
  [int]$PauseSeconds = 30,
  [int]$MaxTurns = 150
)

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

# ---------- safety checks ----------
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Write-Error "claude CLI not found in PATH"; exit 1 }
if (-not (Test-Path ".git")) { Write-Error "This is not a git repository"; exit 1 }
$dirty = git status --porcelain
if ($dirty) {
  Write-Error "Working tree has uncommitted/untracked changes. Commit or stash them first so the overnight work is isolated."
  exit 1
}

# ---------- isolate work on its own branch ----------
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$branch = "auto/overnight-$stamp"
git checkout -b $branch | Out-Null
Write-Host "Working on branch: $branch"

New-Item -ItemType Directory -Force -Path "loop\logs" | Out-Null
$exclude = ".git\info\exclude"
if (-not (Test-Path $exclude)) { New-Item -ItemType File -Force -Path $exclude | Out-Null }
foreach ($p in @("loop/logs/", "loop/STOP")) {
  if (-not (Select-String -Path $exclude -Pattern ([regex]::Escape($p)) -Quiet)) { Add-Content $exclude $p }
}
Remove-Item "loop\STOP" -ErrorAction SilentlyContinue

# ---------- limits ----------
$deadline = (Get-Date).Date.AddHours($DeadlineHour)
if ($deadline -le (Get-Date)) { $deadline = $deadline.AddDays(1) }
Write-Host "Deadline: $deadline"

$allowed = @("Read", "Write", "Edit", "Glob", "Grep", "Bash", "Task", "Agent", "WebSearch", "WebFetch")
$denied  = @(
  "Bash(git push:*)", "Bash(git reset --hard:*)", "Bash(git clean:*)",
  "Bash(git checkout main:*)", "Bash(git checkout master:*)", "Bash(git branch -D:*)",
  "Bash(rm -rf:*)", "Bash(Remove-Item -Recurse:*)"
)

# ---------- main loop: each iteration is a fresh claude session ----------
$fails = 0
for ($i = 1; $i -le $MaxIterations; $i++) {
  if (Test-Path "loop\STOP") { Write-Host "STOP file found. Exiting."; break }
  if ((Get-Date) -ge $deadline) { Write-Host "Deadline reached. Exiting."; break }

  $log = "loop\logs\iter-{0:D3}.log" -f $i
  Write-Host ("[{0}] iteration {1}/{2}" -f (Get-Date -Format "HH:mm:ss"), $i, $MaxIterations)

  claude -p "Read loop/PROMPT.md and follow it exactly." `
    --max-turns $MaxTurns `
    --allowedTools ($allowed -join ",") `
    --disallowedTools ($denied -join ",") 2>&1 | Tee-Object -FilePath $log
  $code = $LASTEXITCODE

  # checkpoint every iteration so any step can be rolled back
  git add -A | Out-Null
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { git commit -m ("auto: iteration {0}" -f $i) | Out-Null }

  if ($code -ne 0) {
    $fails++
    Write-Host "claude exited with code $code (consecutive failures: $fails)"
    if ($fails -ge $MaxConsecutiveFailures) { Write-Host "Too many consecutive failures. Exiting."; break }
    Start-Sleep -Seconds ($FailSleepMinutes * 60)
  }
  else {
    $fails = 0
    Start-Sleep -Seconds $PauseSeconds
  }
}

Write-Host ""
Write-Host "Finished. Branch: $branch"
Write-Host "Review:  git log --oneline $branch"
Write-Host "Summary: loop\PROGRESS.md   Blocked items: loop\BACKLOG.md"
