param(
    [Parameter(Mandatory=$true)]
    [string]$SoundPath
)

try {
    Add-Type -AssemblyName PresentationCore
    $mediaPlayer = New-Object system.windows.media.mediaplayer
    $mediaPlayer.open($SoundPath)
    $mediaPlayer.PlaySync()
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($mediaPlayer) {
        $mediaPlayer.Close()
    }
} 