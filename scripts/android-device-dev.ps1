param(
  [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$JavaHome = "D:\APPS\Android\jbr"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $AndroidSdk)) {
  throw "Android SDK not found: $AndroidSdk"
}

$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$AndroidSdk\platform-tools;$AndroidSdk\emulator;$env:Path"

Write-Host "[android] ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "[android] JAVA_HOME=$env:JAVA_HOME"
Write-Host "[android] Checking connected devices..."
adb devices -l

Write-Host ""
Write-Host "If the list is empty, enable USB debugging on your phone, reconnect USB, and accept the RSA prompt."
Write-Host "If the device says 'unauthorized', unlock the phone and tap Allow USB debugging."
Write-Host ""

npx expo run:android
