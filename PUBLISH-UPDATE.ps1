[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version,
    [string]$Message,
    [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Invoke-NativeProbe {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 can promote expected native stderr to a
        # terminating NativeCommandError while ErrorActionPreference is Stop.
        $ErrorActionPreference = 'Continue'
        & $FilePath @Arguments *> $null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    [System.IO.File]::WriteAllText(
        $Path,
        $Content,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

foreach ($command in 'git','gh','dotnet','node') {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required." }
}

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated. Run: gh auth login' }

$branch = (& git branch --show-current).Trim()
if ($branch -ne 'main') { throw "Releases must be published from main, current branch is '$branch'." }

$status = (& git status --porcelain)
if ($status) { throw "Working tree is not clean. Commit or stash changes first.`n$status" }

$tag = "v$Version"
$tagExists = Invoke-NativeProbe -FilePath 'git' -Arguments @(
    'show-ref','--tags','--verify','--quiet',"refs/tags/$tag"
)
if ($tagExists) { throw "Tag $tag already exists." }

$propsPath = Join-Path $PSScriptRoot 'Directory.Build.props'
$originalProps = Get-Content $propsPath -Raw
try {
    & (Join-Path $PSScriptRoot 'scripts\Set-Version.ps1') -Version $Version
    & (Join-Path $PSScriptRoot 'scripts\Test-OrbitCord.ps1') -Configuration Release
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed. Release aborted.' }
}
catch {
    Write-Utf8NoBom -Path $propsPath -Content $originalProps
    throw
}

& git add Directory.Build.props
$commitMessage = if ($Message) { $Message } else { "release: $tag" }
& git diff --cached --quiet -- Directory.Build.props
$versionAlreadyCommitted = $LASTEXITCODE -eq 0
if ($versionAlreadyCommitted) {
    Write-Host "Version $Version is already committed; continuing without an empty release commit." -ForegroundColor DarkGray
} else {
    & git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) { throw 'Release commit failed.' }
}

& git tag -a $tag -m "OrbitCord $Version"
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }

& git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push to main failed.' }
& git push origin $tag
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed.' }

Write-Host "Release workflow queued for $tag." -ForegroundColor Green
if ($NoWait) { exit 0 }

$runId = $null
for ($i = 0; $i -lt 30 -and -not $runId; $i++) {
    Start-Sleep -Seconds 2
    $json = & gh run list --workflow release.yml --limit 20 --json databaseId,headBranch,status 2>$null
    if ($LASTEXITCODE -eq 0 -and $json) {
        $runs = $json | ConvertFrom-Json
        $run = $runs | Where-Object { $_.headBranch -eq $tag } | Select-Object -First 1
        if ($run) { $runId = $run.databaseId }
    }
}

if (-not $runId) {
    Write-Warning 'Could not locate the GitHub Actions run yet. The tag was pushed successfully.'
    exit 0
}

& gh run watch $runId --exit-status
if ($LASTEXITCODE -ne 0) { throw 'GitHub release workflow failed.' }

$repo = (& gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>$null).Trim()
if ($repo) {
    Write-Host "Release published: https://github.com/$repo/releases/tag/$tag" -ForegroundColor Green
} else {
    Write-Host "Release published: $tag" -ForegroundColor Green
}
