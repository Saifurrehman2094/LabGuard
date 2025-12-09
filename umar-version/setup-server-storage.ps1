# LabGuard Server Storage Setup (PowerShell)
# Run this script as Administrator

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "LabGuard Server Storage Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To run as Administrator:" -ForegroundColor Yellow
    Write-Host "1. Right-click PowerShell" -ForegroundColor Yellow
    Write-Host "2. Select Run as Administrator" -ForegroundColor Yellow
    Write-Host "3. Navigate to: $PSScriptRoot" -ForegroundColor Yellow
    Write-Host "4. Run: .\setup-server-storage.ps1" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

# Get local IP address
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*"} | Select-Object -First 1).IPAddress

Write-Host "Server IP Address: $localIP" -ForegroundColor Green
Write-Host ""

# Define paths
$projectRoot = $PSScriptRoot
$dataDir = Join-Path $projectRoot "backend\data"
$shareName = "LabGuard"
$shareDescription = "LabGuard Exam System Storage"

Write-Host "Project Root: $projectRoot"
Write-Host "Data Directory: $dataDir"
Write-Host "Share Name: $shareName"
Write-Host ""

# Ensure data directory exists
if (-not (Test-Path $dataDir)) {
    Write-Host "Creating data directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Host "Data directory created" -ForegroundColor Green
} else {
    Write-Host "Data directory exists" -ForegroundColor Green
}

# Create subdirectories
$uploadsDir = Join-Path $dataDir "uploads"
$submissionsDir = Join-Path $dataDir "submissions"

if (-not (Test-Path $uploadsDir)) {
    New-Item -ItemType Directory -Path $uploadsDir -Force | Out-Null
    Write-Host "Uploads directory created" -ForegroundColor Green
}

if (-not (Test-Path $submissionsDir)) {
    New-Item -ItemType Directory -Path $submissionsDir -Force | Out-Null
    Write-Host "Submissions directory created" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Setting up Windows Network Share..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check if share already exists
$existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue

if ($existingShare) {
    Write-Host "Share already exists. Removing it first..." -ForegroundColor Yellow
    Remove-SmbShare -Name $shareName -Force
    Write-Host "Existing share removed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Creating new network share..." -ForegroundColor Yellow

try {
    # Create the share with full permissions
    New-SmbShare -Name $shareName -Path $dataDir -FullAccess "Everyone" -Description $shareDescription | Out-Null
    Write-Host "Network share created successfully!" -ForegroundColor Green
    
    # Set NTFS permissions
    $acl = Get-Acl $dataDir
    $permission = "Everyone","FullControl","ContainerInherit,ObjectInherit","None","Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl $dataDir $acl
    Write-Host "NTFS permissions set" -ForegroundColor Green
    
} catch {
    Write-Host "Failed to create share: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Share Information:" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Share Name: $shareName" -ForegroundColor White
Write-Host "Local Path: $dataDir" -ForegroundColor White
Write-Host "Network Path: \\$localIP\$shareName" -ForegroundColor Yellow
Write-Host "UNC Path for Uploads: \\$localIP\$shareName\uploads" -ForegroundColor White
Write-Host "UNC Path for Submissions: \\$localIP\$shareName\submissions" -ForegroundColor White
Write-Host ""

# Update network config
$configPath = Join-Path $projectRoot "config\network-config.json"
$configDir = Split-Path $configPath

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$config = @{
    deployment = @{
        mode = "network"
    }
    server = @{
        host = $localIP
    }
    database = @{
        useSharedDatabase = $false
        sharedPath = ""
    }
    storage = @{
        useSharedStorage = $true
        sharedStoragePath = "\\$localIP\$shareName"
    }
}

$config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
Write-Host "Network configuration updated" -ForegroundColor Green
Write-Host "Config saved to: $configPath" -ForegroundColor White
Write-Host ""

# Enable File and Printer Sharing in Firewall
Write-Host "Enabling File and Printer Sharing in Windows Firewall..." -ForegroundColor Yellow
try {
    Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue
    Write-Host "Firewall rules enabled" -ForegroundColor Green
} catch {
    Write-Host "Could not enable firewall rules automatically" -ForegroundColor Yellow
    Write-Host "Please enable File and Printer Sharing manually in Windows Firewall" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "SETUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. This machine is now the SERVER" -ForegroundColor White
Write-Host "2. Other machines can access files at: \\$localIP\$shareName" -ForegroundColor Yellow
Write-Host "3. Test access by running: node test-network-storage.js" -ForegroundColor White
Write-Host ""
Write-Host "To configure client machines:" -ForegroundColor Cyan
Write-Host "1. Run the app on client machine" -ForegroundColor White
Write-Host "2. Go to Network Settings in Admin Panel" -ForegroundColor White
Write-Host "3. Set Server IP to: $localIP" -ForegroundColor Yellow
Write-Host "4. Enable Network Mode" -ForegroundColor White
Write-Host ""

pause
