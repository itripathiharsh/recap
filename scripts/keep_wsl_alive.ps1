# Keep WSL2 Ubuntu-24.04 active in the background so services never sleep
$wslDistro = "Ubuntu-24.04"
Write-Output "Ensuring $wslDistro is running and services are started..."
wsl -d $wslDistro sudo systemctl start xvfb.service
wsl -d $wslDistro sudo systemctl start meeting-recorder-worker.service
Write-Output "Recap background daemon is active."
