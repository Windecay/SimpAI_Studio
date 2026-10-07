param(
    [string]$Archive = "",
    [ValidateSet("cn", "en")][string]$Lang = "cn"
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Root = [IO.Path]::GetFullPath($PSScriptRoot)

function Say([string]$Cn, [string]$En) {
    [Console]::Error.WriteLine($(if ($Lang -eq "cn") { $Cn } else { $En }))
}
function Assert-Child([string]$Path) {
    $Full = [IO.Path]::GetFullPath($Path)
    $Prefix = $Root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $Full.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the MCP package."
    }
    $Current = $Full
    while ($Current -and ($Current -eq $Root -or $Current.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase))) {
        if ((Test-Path -LiteralPath $Current) -and
            ((Get-Item -LiteralPath $Current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "MCP setup refuses reparse points."
        }
        $Current = [IO.Path]::GetDirectoryName($Current)
    }
    return $Full
}
function Check-Runtime([string]$Directory) {
    $Python = Join-Path $Directory "python.exe"
    if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) { throw "Runtime has no python.exe." }
    $Probe = "import sys,struct,importlib.metadata as m; import mcp,mcp_types,requests; assert m.version('mcp')=='2.3.0'; assert m.version('mcp-types')=='2.3.0'; assert sys.version_info[:2]==(3,13); assert sys.platform=='win32' and struct.calcsize('P')==8"
    $Info = [Diagnostics.ProcessStartInfo]::new()
    $Info.FileName = $Python
    $Info.Arguments = '-I -X utf8 -c "' + $Probe + '"'
    $Info.UseShellExecute = $false
    $Info.CreateNoWindow = $true
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Process = [Diagnostics.Process]::new()
    $Process.StartInfo = $Info
    try {
        $Process.Start() | Out-Null
        $Stdout = $Process.StandardOutput.ReadToEndAsync()
        $Stderr = $Process.StandardError.ReadToEndAsync()
        if (-not $Process.WaitForExit(20000)) {
            $Process.Kill()
            $Process.WaitForExit()
            throw "MCP runtime verification timed out."
        }
        if ($Process.ExitCode -ne 0) { throw "MCP runtime verification failed." }
    } finally { $Process.Dispose() }
}

$Stage = $null
$Download = $null
$Lock = $null
try {
    if (-not [Environment]::Is64BitOperatingSystem) { throw "This package requires 64-bit Windows." }
    $ManifestPath = Assert-Child (Join-Path $Root "runtime-manifest.json")
    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $Runtime = $Manifest.runtime
    if ($Manifest.schema -ne 1 -or $Runtime.platform -ne "win_amd64" -or $Runtime.python -ne "3.13" -or $Runtime.sdk -ne "2.3.0" -or
        $Runtime.sha256 -notmatch '^[0-9a-f]{64}$' -or $Runtime.size -le 0 -or $Runtime.size -gt 128MB -or
        $Runtime.unpacked_size -le 0 -or $Runtime.unpacked_size -gt 512MB -or
        $Runtime.file_count -le 0 -or $Runtime.file_count -gt 20000) {
        throw "Invalid pinned MCP runtime manifest."
    }
    $Uri = [Uri]$Runtime.url
    if ($Uri.Scheme -ne "https" -or $Uri.Host -notin @("modelscope.cn", "www.modelscope.cn") -or
        -not $Uri.AbsolutePath.Equals("/models/windecay/SimpAI_dev/resolve/master/SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip", [StringComparison]::Ordinal) -or
        $Uri.UserInfo -or $Uri.Query -or $Uri.Fragment) {
        throw "Runtime URL is outside the configured ModelScope repository."
    }
    $LockPath = Assert-Child (Join-Path $Root ".setup.lock")
    $Lock = [IO.File]::Open($LockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $Destination = Assert-Child (Join-Path $Root "runtime")
    $Marker = Join-Path $Destination ".simpai-runtime.json"
    if (Test-Path -LiteralPath $Destination) {
        if (-not (Test-Path -LiteralPath $Marker -PathType Leaf)) {
            throw "An unmanaged runtime directory already exists; choose a new package folder."
        }
        $Installed = Get-Content -LiteralPath $Marker -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($Installed.sha256 -ne $Runtime.sha256) {
            throw "A different runtime is installed. Extract the new MCP package to another folder."
        }
        Check-Runtime $Destination
        Say "MCP 环境已就绪，无需重复下载。" "MCP runtime is already ready; no download needed."
        exit 0
    }
    if ($Archive) {
        $Source = [IO.Path]::GetFullPath($Archive)
        if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Offline runtime archive does not exist." }
    } else {
        Say "正在从魔搭下载独立 MCP 环境。" "Downloading the standalone MCP runtime from ModelScope."
        $Download = Assert-Child (Join-Path $Root (".runtime-download-" + [Guid]::NewGuid().ToString("N") + ".zip"))
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $Runtime.url -OutFile $Download -UseBasicParsing -TimeoutSec 300 | Out-Null
        $Source = $Download
    }
    if ((Get-Item -LiteralPath $Source).Length -ne $Runtime.size) {
        throw "Runtime archive size or SHA256 does not match. Nothing was installed."
    }
    $Hasher = [Security.Cryptography.SHA256]::Create()
    $InputStream = [IO.File]::OpenRead($Source)
    try {
        $Hash = [BitConverter]::ToString($Hasher.ComputeHash($InputStream)).Replace("-", "").ToLowerInvariant()
    } finally {
        $InputStream.Dispose()
        $Hasher.Dispose()
    }
    if ($Hash -ne $Runtime.sha256) {
        throw "Runtime archive size or SHA256 does not match. Nothing was installed."
    }
    $Stage = Assert-Child (Join-Path $Root (".runtime-stage-" + [Guid]::NewGuid().ToString("N")))
    New-Item -ItemType Directory -Path $Stage | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Zip = [IO.Compression.ZipFile]::OpenRead($Source)
    try {
        $Names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        [long]$Total = 0
        $Count = 0
        foreach ($Entry in $Zip.Entries) {
            $Name = $Entry.FullName
            $Parts = $Name.TrimEnd('/').Split('/')
            if (-not $Name -or $Name.StartsWith('/') -or $Name.Contains('\') -or
                $Name -match '[<>:"|?*\x00-\x1f]' -or $Parts -contains ".." -or $Parts -contains "." -or
                $Parts -contains "" -or (($Entry.ExternalAttributes -shr 16) -band 0xf000) -eq 0xa000) {
                throw "Unsafe path in the runtime archive."
            }
            foreach ($Part in $Parts) {
                if ($Part.EndsWith(".") -or $Part.EndsWith(" ") -or
                    $Part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)') {
                    throw "Unsafe Windows filename in the runtime archive."
                }
            }
            if (-not $Names.Add($Name.TrimEnd('/'))) { throw "Duplicate path in the runtime archive." }
            $Target = [IO.Path]::GetFullPath((Join-Path $Stage ($Name.Replace('/', '\'))))
            if (-not $Target.StartsWith($Stage + '\', [StringComparison]::OrdinalIgnoreCase)) {
                throw "Archive path escapes its staging directory."
            }
            if ($Name.EndsWith('/')) { continue }
            $Total += $Entry.Length
            $Count++
            if ($Total -gt $Runtime.unpacked_size -or $Count -gt $Runtime.file_count) {
                throw "Runtime archive exceeds its manifest limits."
            }
        }
        if ($Count -ne $Runtime.file_count -or $Total -ne $Runtime.unpacked_size) {
            throw "Runtime archive contents do not match the manifest."
        }
        foreach ($Entry in $Zip.Entries) {
            $Target = Join-Path $Stage ($Entry.FullName.Replace('/', '\'))
            if ($Entry.FullName.EndsWith('/')) {
                [IO.Directory]::CreateDirectory($Target) | Out-Null
            } else {
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Target)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $Target, $false)
            }
        }
    } finally { $Zip.Dispose() }
    Check-Runtime $Stage
    @{sha256=$Runtime.sha256; version=$Manifest.version} | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $Stage ".simpai-runtime.json") -Encoding UTF8
    Assert-Child $Stage | Out-Null
    Assert-Child $Destination | Out-Null
    for ($Attempt = 0; ; $Attempt++) {
        Assert-Child $Stage | Out-Null
        Assert-Child $Destination | Out-Null
        try {
            [IO.Directory]::Move($Stage, $Destination)
            break
        } catch [IO.IOException], [UnauthorizedAccessException] {
            if ($Attempt -ge 7 -or (Test-Path -LiteralPath $Destination) -or
                -not (Test-Path -LiteralPath $Stage -PathType Container)) { throw }
            Start-Sleep -Milliseconds 250
        }
    }
    $Stage = $null
    Say "MCP 环境已就绪。多用户模式请由用户完成浏览器配对。" "MCP runtime is ready. In multi-user mode, complete browser pairing."
} catch {
    Say ("MCP 安装失败（脚本第 " + $_.InvocationInfo.ScriptLineNumber + " 行）：" + $_.Exception.Message) `
        ("MCP setup failed at line " + $_.InvocationInfo.ScriptLineNumber + ": " + $_.Exception.Message)
    exit 1
} finally {
    if ($Lock) { $Lock.Dispose() }
    if ($Download -and (Test-Path -LiteralPath $Download)) {
        Assert-Child $Download | Out-Null
        Remove-Item -LiteralPath $Download -Force
    }
    if ($Stage -and (Test-Path -LiteralPath $Stage)) {
        Assert-Child $Stage | Out-Null
        Remove-Item -LiteralPath $Stage -Recurse -Force
    }
}
