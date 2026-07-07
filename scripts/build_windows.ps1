param(
    [switch]$SkipTauriBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$packageJsonPath = Join-Path $repoRoot "package.json"
$appVersion = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
$releaseDir = Join-Path $repoRoot "src-tauri\target\release"
$appExe = Join-Path $releaseDir "app.exe"
$resourceDir = Join-Path $releaseDir "_up_"
$bundledNode = Join-Path $resourceDir "vendor\node\win-x64\node.exe"
$wixObj = Join-Path $releaseDir "wix\x64\main.wixobj"
$wixLoc = Join-Path $releaseDir "wix\x64\locale.wxl"
$msiDir = Join-Path $releaseDir "bundle\msi"
$msiPath = Join-Path $msiDir "LanDock_${appVersion}_x64_en-US.msi"
$wixLight = Join-Path $env:LOCALAPPDATA "tauri\WixTools314\light.exe"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

function Assert-Exists {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Fail "$Description missing: $Path"
    }

    Write-Host "[ok] ${Description}: $Path" -ForegroundColor Green
}

Push-Location $repoRoot
try {
    if (Test-Path -LiteralPath $cargoBin) {
        $env:PATH = "$cargoBin;$env:PATH"
    }

    $buildOutput = @()
    $tauriExitCode = 0

    if (-not $SkipTauriBuild) {
        Write-Step "Running npm run tauri build"
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $buildOutput = & npm.cmd run tauri build 2>&1
            $tauriExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        $buildOutput | ForEach-Object { Write-Host $_ }
    } else {
        Write-Step "Skipping npm run tauri build by request"
    }

    if ($tauriExitCode -ne 0) {
        $outputText = ($buildOutput | Out-String)
        $looksLikeKnownWixIceFailure =
            $outputText -match "light\.exe" -and
            $outputText -match "failed to bundle project" -and
            (Test-Path -LiteralPath $appExe) -and
            (Test-Path -LiteralPath $wixObj)

        if (-not $looksLikeKnownWixIceFailure) {
            Fail "Tauri build failed before producing the release executable and WiX object. Refusing MSI fallback."
        }

        Write-Host "[warn] Tauri build failed at WiX light.exe after release artifacts were generated." -ForegroundColor Yellow
        Write-Host "[warn] Applying known local WiX ICE validation workaround with light.exe -sval." -ForegroundColor Yellow

        Assert-Exists $wixLight "WiX light.exe"
        Assert-Exists $wixLoc "WiX locale file"
        New-Item -ItemType Directory -Force -Path $msiDir | Out-Null

        Write-Step "Running WiX light.exe with -sval"
        & $wixLight `
            -sval `
            -ext WixUIExtension `
            -cultures:en-us `
            -loc $wixLoc `
            -out $msiPath `
            $wixObj

        if ($LASTEXITCODE -ne 0) {
            Fail "WiX light.exe -sval fallback failed with exit code $LASTEXITCODE."
        }
    }

    Write-Step "Verifying release outputs"
    Assert-Exists $appExe "Release app.exe"
    Assert-Exists $resourceDir "Release _up_ resources"
    Assert-Exists $bundledNode "Bundled Node runtime"
    Assert-Exists $msiPath "Windows MSI installer"

    $msi = Get-Item -LiteralPath $msiPath
    Write-Host ""
    Write-Host "Windows build complete." -ForegroundColor Green
    Write-Host "MSI: $($msi.FullName)"
    Write-Host "Size: $($msi.Length) bytes"
} finally {
    Pop-Location
}
