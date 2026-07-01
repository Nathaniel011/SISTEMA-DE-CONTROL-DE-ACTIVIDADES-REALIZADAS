# Arranca backend y frontend de SCAR en ventanas separadas.
# Requisitos: PostgreSQL local en ejecución (puerto 5432).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$envFile = Join-Path $root "dev\local.env"
$exampleFile = Join-Path $root "dev\local.env.example"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"

if (-not (Test-Path $envFile)) {
    Copy-Item $exampleFile $envFile
    Write-Host "Se creo dev/local.env desde el ejemplo."
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)=(.*)$') {
        Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
}

$dbReady = $false
if (Test-Path $psql) {
    $env:PGPASSWORD = $env:DB_PASSWORD
    $check = & $psql -U $env:DB_USER -h $env:DB_HOST -p $env:DB_PORT -d $env:DB_NAME -tAc "SELECT 1" 2>$null
    if ($check -eq "1") { $dbReady = $true }
}

if (-not $dbReady -and ($env:DB_ADMIN_PASSWORD -eq "CAMBIA_ESTO" -or [string]::IsNullOrWhiteSpace($env:DB_ADMIN_PASSWORD))) {
    Write-Host ""
    Write-Host "La base '$($env:DB_NAME)' no existe todavia."
    Write-Host "Edita dev/local.env y pon DB_ADMIN_PASSWORD con tu contraseña de postgres local."
    Write-Host ""
    notepad $envFile
    exit 1
}

$pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
if ($pgService -and $pgService.Status -ne "Running") {
    Write-Host "Iniciando PostgreSQL 16..."
    Start-Service "postgresql-x64-16"
}

Write-Host "Arrancando backend (http://localhost:8080)..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root\backend'; mvn spring-boot:run"
)

Start-Sleep -Seconds 2

Write-Host "Arrancando frontend (http://localhost:4200)..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root\frontend'; npm start"
)

Write-Host ""
Write-Host "Listo."
Write-Host "  Frontend: http://localhost:4200"
Write-Host "  Backend:  http://localhost:8080"
Write-Host "  pgAdmin:  localhost:5432 / base scar / usuario scar / contraseña 60465524"
Write-Host ""
