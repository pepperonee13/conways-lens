<#
.SYNOPSIS
    Clones/updates the git repositories defined in repos.json and extracts
    commit history into TimelineData.csv for ConwayLens.

.PARAMETER Since
    Start date for history extraction (default: 1 year ago). Format: YYYY-MM-DD

.PARAMETER Until
    End date for history extraction (default: today). Format: YYYY-MM-DD

.PARAMETER ReposFile
    Path to the repos.json file (default: repos.json next to this script)

.PARAMETER WorkDir
    Local directory used for cloning repositories (default: %TEMP%\conwaylens-repos)

.EXAMPLE
    .\Analyse-Repositories.ps1
    .\Analyse-Repositories.ps1 -ReposFile C:\projects\my-repos.json
    .\Analyse-Repositories.ps1 -Since 2024-01-01
    .\Analyse-Repositories.ps1 -Since 2024-01-01 -Until 2024-12-31
#>
param(
    [string]$Since = (Get-Date).AddYears(-1).ToString('yyyy-MM-dd'),
    [string]$Until = (Get-Date).ToString('yyyy-MM-dd'),
    [string]$ReposFile = (Join-Path $PSScriptRoot 'repos.json'),
    [string]$WorkDir = (Join-Path $env:TEMP 'conwaylens-repos')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ensure git output is read as UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$OutputFile  = Join-Path $PSScriptRoot '..\app\public\TimelineData.csv'


# ---------------------------------------------------------------------------
# Validate inputs
# ---------------------------------------------------------------------------
if (-not (Test-Path $ReposFile)) {
    Write-Error "repos.json not found at: $ReposFile"
    exit 1
}

$repos = Get-Content $ReposFile -Raw | ConvertFrom-Json
if ($repos.Count -eq 0) {
    Write-Error "repos.json is empty — add at least one repository."
    exit 1
}

if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir | Out-Null
}

# ---------------------------------------------------------------------------
# CSV rows accumulator
# ---------------------------------------------------------------------------
$rows = [System.Collections.Generic.List[pscustomobject]]::new()

# ---------------------------------------------------------------------------
# Process each repository
# ---------------------------------------------------------------------------
foreach ($repo in $repos) {
    $repoName   = $repo.name
    $repoUrl    = $repo.url
    $branch     = if ($repo.PSObject.Properties['branch'] -and $repo.branch) { $repo.branch } else { 'main' }
    $localPath  = Join-Path $WorkDir $repoName

    Write-Host "`n=== $repoName ===" -ForegroundColor Cyan
    Write-Host "    URL   : $repoUrl"
    Write-Host "    Branch: $branch"
    Write-Host "    Local : $localPath"

    # Clone or update
    if (Test-Path (Join-Path $localPath '.git')) {
        Write-Host "    Pulling latest changes..." -ForegroundColor Gray
        Push-Location $localPath
        try {
            git fetch origin $branch --quiet 2>&1 | Out-Null
            git checkout $branch --quiet 2>&1 | Out-Null
            git reset --hard "origin/$branch" --quiet 2>&1 | Out-Null
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "    Cloning..." -ForegroundColor Gray
        git clone --branch $branch --single-branch $repoUrl $localPath 2>&1 | Out-Null
    }

    if (-not (Test-Path (Join-Path $localPath '.git'))) {
        Write-Warning "    Skipping $repoName — clone failed or directory is not a git repo."
        continue
    }

    # Extract commit history
    Write-Host "    Extracting history since $Since..." -ForegroundColor Gray

    Push-Location $localPath
    try {
        # --name-status gives M/A/D prefix per file; COMMIT| prefix lets us split header from paths
        $logOutput = git log $branch `
            --since="$Since" `
            --until="$Until" `
            --date=iso `
            --pretty=format:"COMMIT|%H|%an|%ad|%s" `
            --name-status `
            2>&1

        $currentCommit = $null

        foreach ($line in $logOutput) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }

            if ($line.StartsWith('COMMIT|')) {
                $parts = $line -split '\|', 5
                $currentCommit = [pscustomobject]@{
                    Hash    = $parts[1].Trim()
                    Author  = $parts[2].Trim()
                    RawDate = $parts[3].Trim()
                    Message = if ($parts.Count -ge 5) { $parts[4].Trim() } else { '' }
                    Date    = $null
                    DateStr = $null
                }
                # Parse ISO date: "2025-01-15 14:30:00 +0100"
                try {
                    $dt = [datetime]::Parse($currentCommit.RawDate)
                    $currentCommit.Date    = $dt.ToString('yyyy-MM-dd')
                    $currentCommit.DateStr = $dt.ToString('yyyy-MM-dd HH:mm:ss')
                } catch {
                    $currentCommit.Date    = $currentCommit.RawDate.Substring(0, 10)
                    $currentCommit.DateStr = $currentCommit.RawDate
                }
                continue
            }

            # File line: "M\tpath/to/file.cs" or "A\tnew.cs" or "D\told.cs"
            if ($currentCommit -and $line -match '^([MADRCTU])\s+(.+)$') {
                $statusChar = $Matches[1]
                $filePath   = $Matches[2].Trim()

                $changeType = switch ($statusChar) {
                    'M' { 'edit' }
                    'A' { 'add' }
                    'D' { 'delete' }
                    'R' { 'rename' }
                    'C' { 'copy' }
                    default { 'edit' }
                }

                $rows.Add([pscustomobject]@{
                    Date          = $currentCommit.Date
                    DateTime      = $currentCommit.DateStr
                    Product       = $repoName
                    Author        = $currentCommit.Author
                    ChangesetId   = $currentCommit.Hash
                    ChangeType    = $changeType
                    FilePath      = $filePath
                    Source        = 'git'
                    CommitMessage = $currentCommit.Message
                })
            }
        }

        Write-Host "    Done — $($rows | Where-Object { $_.Product -eq $repoName } | Measure-Object | Select-Object -ExpandProperty Count) file-commit rows extracted." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Write CSV
# ---------------------------------------------------------------------------
$outputDir = Split-Path $OutputFile -Parent
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

if ($rows.Count -eq 0) {
    Write-Warning "No data extracted. Check that the repositories are accessible and have commits in the given date range."
    exit 0
}

$rows | Export-Csv -Path $OutputFile -NoTypeInformation -Encoding UTF8

# Append date range metadata footer (read by the app)
Add-Content -Path $OutputFile -Value "Since=$Since,Until=$Until" -Encoding UTF8

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Total rows : $($rows.Count)"
Write-Host "Date range : $Since → $Until"
Write-Host "Output     : $OutputFile"
