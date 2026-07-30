# One-time Windows setup for React Native Android native (CMake/Ninja) builds.
# Run from repo root: powershell -ExecutionPolicy Bypass -File android/setup-windows-build.ps1

$ErrorActionPreference = 'Stop'
$toolsDir = Join-Path $PSScriptRoot 'tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
$ninjaExe = Join-Path $toolsDir 'ninja.exe'

if (-not (Test-Path $ninjaExe)) {
  Write-Host 'Downloading Ninja 1.12.1...'
  $zip = Join-Path $env:TEMP 'ninja-win.zip'
  Invoke-WebRequest -Uri 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip' -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $toolsDir -Force
  Remove-Item $zip
}

Write-Host "Ninja: $(& $ninjaExe --version)"

$longPaths = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue
if ($longPaths.LongPathsEnabled -ne 1) {
  Write-Host ''
  Write-Host 'Windows long paths are DISABLED (required for RN 0.84 New Architecture on Windows).'
  Write-Host 'Run PowerShell as Administrator, then:'
  Write-Host '  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force'
  Write-Host 'Restart your PC, then rebuild.'
  Write-Host ''
  Write-Host 'Alternative: clone/move this repo to a very short path, e.g. C:\fu'
}

if ($env:GRADLE_USER_HOME -match 'cursor-sandbox') {
  Write-Host ''
  Write-Host 'GRADLE_USER_HOME points at a Cursor sandbox path (too long for Windows builds).'
  Write-Host 'In Git Bash before building, run:'
  Write-Host '  export GRADLE_USER_HOME=$HOME/.gradle'
}

Write-Host ''
Write-Host 'Then clean and run:'
Write-Host '  rm -rf android/app/.cxx android/build'
Write-Host '  cd android && ./gradlew clean && cd ..'
Write-Host '  npx react-native run-android'
