# Configura PATH y variables de entorno para SCAR en esta sesión de PowerShell.
# Uso: . .\setup-env.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$mavenBin = Join-Path $root "..\tools\apache-maven-3.9.9\bin"
$envFile = Join-Path $root "dev\local.env"

if (Test-Path $mavenBin) {
    $env:Path = "$mavenBin;$env:Path"
}

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+?)=(.*)$') {
            Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim()
        }
    }
}

Write-Host "Entorno SCAR listo."
Write-Host "  Maven:  $(if (Get-Command mvn -ErrorAction SilentlyContinue) { (mvn --version | Select-Object -First 1) } else { 'no encontrado' })"
Write-Host "  Node:   $(node --version)"
Write-Host "  Java:   $(java -version 2>&1 | Select-Object -First 1)"
