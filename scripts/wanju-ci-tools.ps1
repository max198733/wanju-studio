$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = '9.0.2'
$name = "ffmpeg-$version-essentials_build"
$sha256 = '60F467265B1E312373DBCD92200C2618A74850F98D3D078E94296BB3FA2047BA'
$tools = Join-Path $root '.local/tools/ffmpeg'
$directory = Join-Path $tools $name
if (-not (Test-Path -LiteralPath (Join-Path $directory 'bin/ffmpeg.exe'))) {
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $archive = Join-Path $tools "$name.zip"
    Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/packages/$name.zip" -OutFile $archive -TimeoutSec 180
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $sha256) {
        throw 'FFmpeg archive checksum does not match the reviewed build input.'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $tools -Force
}
foreach ($file in @('bin/ffmpeg.exe', 'bin/ffprobe.exe', 'LICENSE', 'README.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $directory $file))) { throw "Missing FFmpeg build input: $file" }
}
if ($env:GITHUB_ENV) {
    "WANJU_FFMPEG_DIR=$directory" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
    (Join-Path $directory 'bin') | Out-File -FilePath $env:GITHUB_PATH -Append -Encoding utf8
}
& (Join-Path $directory 'bin/ffmpeg.exe') -version | Select-Object -First 1
