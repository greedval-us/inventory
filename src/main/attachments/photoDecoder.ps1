$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

# Inspect only the first frame. Decode to the display size before converting its pixels.
$stream = [IO.File]::OpenRead($env:INVENTORY_PREVIEW_INPUT)
try {
    $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($stream, 'PreservePixelFormat', 'OnDemand')
    $frame = $decoder.Frames[0]
    $orientation = 1
    foreach ($query in '/ifd/{ushort=274}', '/app1/ifd/{ushort=274}') {
        try {
            $tag = $frame.Metadata.GetQuery($query)
            if ($tag -ge 1 -and $tag -le 8) { $orientation = $tag; break }
        } catch { }
    }

    try {
        $bitmap = New-Object Windows.Media.Imaging.BitmapImage
        $bitmap.BeginInit()
        $bitmap.CacheOption = 'OnLoad'
        $stream.Position = 0
        $bitmap.StreamSource = $stream
        if ($frame.PixelWidth -ge $frame.PixelHeight) {
            $bitmap.DecodePixelWidth = [Math]::Min(1920, $frame.PixelWidth)
        } else {
            $bitmap.DecodePixelHeight = [Math]::Min(1920, $frame.PixelHeight)
        }
        $bitmap.EndInit()
    } catch {
        # Some camera codecs expose only the embedded preview.
        $bitmap = $frame.Thumbnail
        if (!$bitmap) { throw }
        $scale = 1920.0 / [Math]::Max($bitmap.PixelWidth, $bitmap.PixelHeight)
        if ($scale -lt 1) {
            $resize = New-Object Windows.Media.ScaleTransform -ArgumentList $scale, $scale
            $bitmap = New-Object Windows.Media.Imaging.TransformedBitmap -ArgumentList $bitmap, $resize
        }
    }

    $matrix = switch ($orientation) {
        2 { -1, 0, 0, 1 }
        3 { -1, 0, 0, -1 }
        4 { 1, 0, 0, -1 }
        5 { 0, 1, 1, 0 }
        6 { 0, 1, -1, 0 }
        7 { 0, -1, -1, 0 }
        8 { 0, -1, 1, 0 }
    }
    if ($matrix) {
        $transform = New-Object Windows.Media.MatrixTransform -ArgumentList ($matrix + @(0, 0))
        $bitmap = New-Object Windows.Media.Imaging.TransformedBitmap -ArgumentList $bitmap, $transform
    }
    $pixels = New-Object Windows.Media.Imaging.FormatConvertedBitmap -ArgumentList $bitmap, ([Windows.Media.PixelFormats]::Bgra32), $null, 0
    $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($pixels))
    $png = New-Object IO.MemoryStream
    try {
        $encoder.Save($png)
        $out = [Console]::OpenStandardOutput()
        $out.Write($png.GetBuffer(), 0, [int]$png.Length)
        $out.Flush()
    } finally { $png.Dispose() }
} finally { $stream.Dispose() }
