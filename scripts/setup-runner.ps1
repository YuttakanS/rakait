<#
.SYNOPSIS
    Install a GitHub Actions self-hosted runner for the scheduled scrape.

.DESCRIPTION
    IHAVECPU and BaNANA answer HTTP 403 to GitHub-hosted runners (datacenter
    IPs), so .github/workflows/scrape.yml runs on a runner labelled
    "pricewatch" on this machine instead.

    Steps: download the latest actions/runner release for win-x64, verify its
    SHA-256 against the checksum published in the release notes, register it
    with a short-lived token obtained through the GitHub CLI, and install it as
    a Windows service so it survives logoff and reboot.

    Run from an elevated (Administrator) PowerShell: installing a service needs
    it. Requires `gh auth login` with admin rights on the repository.

.PARAMETER Dir
    Install directory. Kept outside the project so the runner's work folders
    never mix with the working copy.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\setup-runner.ps1
#>
param(
    [string]$Dir = "C:\actions-runner-rakait",
    [string]$Repo = "YuttakanS/rakait",
    [string]$Labels = "pricewatch"
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated (Administrator) PowerShell."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) not found. Install it and run 'gh auth login' first."
}

if (Test-Path (Join-Path $Dir ".runner")) {
    Write-Host "A runner is already configured in $Dir. To reinstall, run '.\config.cmd remove' there first."
    exit 0
}
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# Latest release and its published checksum for win-x64.
$release = gh api repos/actions/runner/releases/latest | ConvertFrom-Json
$version = $release.tag_name.TrimStart("v")
if ($release.body -notmatch "BEGIN SHA win-x64 -->([0-9a-f]{64})") {
    throw "Could not find the win-x64 checksum in the release notes of v$version."
}
$expected = $Matches[1]
$zip = Join-Path $Dir "actions-runner-win-x64-$version.zip"
$url = "https://github.com/actions/runner/releases/download/v$version/actions-runner-win-x64-$version.zip"

Write-Host "Downloading runner v$version ..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
$actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
if ($actual -ne $expected) {
    Remove-Item $zip -Force
    throw "Checksum mismatch: expected $expected, got $actual."
}
Expand-Archive -Path $zip -DestinationPath $Dir -Force
Remove-Item $zip -Force

# Registration tokens expire after one hour; nothing is stored on disk.
$token = gh api -X POST "repos/$Repo/actions/runners/registration-token" -q .token
if (-not $token) { throw "Could not obtain a registration token for $Repo." }

Push-Location $Dir
try {
    & .\config.cmd --unattended `
        --url "https://github.com/$Repo" `
        --token $token `
        --name "$env:COMPUTERNAME-pricewatch" `
        --labels $Labels `
        --work "_work" `
        --runasservice `
        --replace
    if ($LASTEXITCODE -ne 0) { throw "config.cmd failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Runner installed as a Windows service. Check it with:"
Write-Host "  gh api repos/$Repo/actions/runners --jq '.runners[] | [.name, .status] | join(`" `")'"
Write-Host "Then trigger a run with:  gh workflow run scrape.yml"
