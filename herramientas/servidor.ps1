# Servidor local de Papeles de Banda (Windows).
# - Sirve la aplicacion web sin conexion (con OCR).
# - Reconoce PDF con Audiveris si esta instalado:
#     GET  /api/omr/status       -> {"available": true/false, "command": "..."}
#     POST /api/omr?name=x.pdf   -> cuerpo: el PDF; respuesta: {"files": [{"name","base64"}], "log": "..."}
# Se lanza desde "Iniciar (Windows).bat". Cierra la ventana para terminar.
# La ruta de Audiveris se busca sola; tambien se puede indicar con la variable de entorno AUDIVERIS.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.wasm' = 'application/wasm'; '.gz' = 'application/octet-stream'; '.json' = 'application/json'
  '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.md' = 'text/plain; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
}

function Find-Audiveris {
  if ($env:AUDIVERIS -and (Test-Path -LiteralPath $env:AUDIVERIS -PathType Leaf)) { return $env:AUDIVERIS }
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Audiveris\Audiveris.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Audiveris\Audiveris.exe'),
    (Join-Path $env:USERPROFILE 'scoop\apps\audiveris\current\Audiveris.exe')
  )
  if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Audiveris\Audiveris.exe') }
  foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c -PathType Leaf)) { return $c } }
  $cmd = Get-Command 'Audiveris' -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Send-Json($ctx, [int]$code, $data) {
  $json = ConvertTo-Json -InputObject $data -Depth 5 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $code
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Invoke-Omr($ctx) {
  $exe = Find-Audiveris
  if (-not $exe) { Send-Json $ctx 500 @{ error = 'Audiveris no esta instalado en este ordenador.' }; return }
  $work = Join-Path ([IO.Path]::GetTempPath()) ('papeles-omr-' + [Guid]::NewGuid().ToString('N'))
  $out = Join-Path $work 'salida'
  New-Item -ItemType Directory -Path $out -Force | Out-Null
  try {
    $name = $ctx.Request.QueryString['name']
    if (-not $name) { $name = 'partitura.pdf' }
    $base = [IO.Path]::GetFileNameWithoutExtension($name) -replace '[^\w .-]', '_'
    if (-not $base.Trim()) { $base = 'partitura' }
    $src = Join-Path $work ($base + '.pdf')
    $fs = [IO.File]::Create($src)
    try { $ctx.Request.InputStream.CopyTo($fs) } finally { $fs.Close() }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = '-batch -export -output "' + $out + '" -- "' + $src + '"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [Diagnostics.Process]::Start($psi)
    $stdout = $p.StandardOutput.ReadToEndAsync()
    $stderr = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit(3600000)) { try { $p.Kill() } catch {} ; Send-Json $ctx 500 @{ error = 'Audiveris ha tardado demasiado.' }; return }
    $log = ($stdout.Result + $stderr.Result)
    if ($log.Length -gt 4000) { $log = $log.Substring($log.Length - 4000) }

    $found = Get-ChildItem -Path $out -Recurse -File | Where-Object { $_.Extension -in @('.mxl', '.xml', '.musicxml') } | Sort-Object FullName
    if (-not $found) { Send-Json $ctx 500 @{ error = "Audiveris no ha generado ningun MusicXML.`n$log" }; return }
    $files = @()
    foreach ($f in $found) {
      $files += @{ name = $f.Name; base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName)) }
    }
    Send-Json $ctx 200 @{ files = $files; log = $log }
  } finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$port = 8765
$listener = $null
while ($port -lt 8800) {
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
    break
  } catch {
    $port++
  }
}
if (-not $listener -or -not $listener.IsListening) { Write-Host 'No se pudo abrir ningun puerto local.'; Read-Host 'Pulsa Intro para salir'; exit 1 }
$url = "http://localhost:$port/index.html"
Write-Host "Papeles de Banda funcionando en $url"
$aud = Find-Audiveris
if ($aud) { Write-Host "Reconocimiento de PDF (Audiveris): $aud" } else { Write-Host 'Reconocimiento de PDF (Audiveris): no instalado' }
Write-Host 'Deja esta ventana abierta mientras uses la aplicacion. Cierrala para terminar.'
Start-Process $url
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq '/api/omr/status') {
      $exe = Find-Audiveris
      Send-Json $ctx 200 @{ available = [bool]$exe; command = $exe }
      continue
    }
    if ($path -eq '/api/omr') {
      if ($ctx.Request.HttpMethod -ne 'POST') { Send-Json $ctx 405 @{ error = 'Usa POST' } } else { Invoke-Omr $ctx }
      continue
    }
    $rel = [Uri]::UnescapeDataString($path).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    try { Send-Json $ctx 500 @{ error = $_.Exception.Message } } catch { $ctx.Response.StatusCode = 500 }
  } finally {
    $ctx.Response.Close()
  }
}
