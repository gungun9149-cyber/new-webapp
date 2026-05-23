$prefix = 'http://127.0.0.1:5500/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
 $port = $env:PORT -as [int]
 $port = if ($port -and $port -gt 0) { $port } else { 5500 }
 $prefix = "http://localhost:$port/"
try {
    $listener.Start()
    Write-Host "Serving HTTP on $prefix from $(Get-Location)"
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.RawUrl -replace '\?.*$', ''
        if ([string]::IsNullOrEmpty($rawUrl) -or $rawUrl -eq '/') {
            $relPath = 'index.html'
        } else {
            $relPath = $rawUrl.TrimStart('/')
        }

        $localPath = Join-Path (Get-Location) $relPath
        if (-not (Test-Path $localPath)) {
            $response.StatusCode = 404
            $response.ContentType = 'text/plain; charset=utf-8'
            $buf = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
            $response.OutputStream.Write($buf,0,$buf.Length)
            $response.OutputStream.Close()
            continue
        }

        try {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = @{
                '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
                '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json';
                '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif';
                '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.woff'='font/woff'; '.woff2'='font/woff2';
                '.ttf'='font/ttf'; '.map'='application/octet-stream'
            }
            $response.ContentType = $mime[$ext] -or 'application/octet-stream'
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
        } catch {
            $response.StatusCode = 500
            $response.ContentType = 'text/plain; charset=utf-8'
            $buf = [System.Text.Encoding]::UTF8.GetBytes('500 Internal Server Error')
            $response.OutputStream.Write($buf,0,$buf.Length)
            $response.OutputStream.Close()
        }
    }
} catch {
    Write-Error "Failed to start HTTP listener: $_"
} finally {
    if ($listener.IsListening) { $listener.Stop(); $listener.Close() }
}
