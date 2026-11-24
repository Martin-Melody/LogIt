using SkiaSharp;

namespace Logit.Api.Features.Photos;

/// Every upload is decoded and saved again as a JPEG: turned upright, at most MaxSide pixels on
/// its long side, and with nothing of the original file kept (no location, camera or other metadata).
public static class PhotoProcessing
{
    public const int MaxSide = 2048;
    public const int Quality = 82;

    public record Result(byte[] Bytes, int Width, int Height);

    /// Null when the bytes aren't a picture Skia can read.
    public static Result? Process(byte[] input)
    {
        using var codec = SKCodec.Create(new MemoryStream(input));
        if (codec is null) return null;
        using var decoded = SKBitmap.Decode(codec);
        if (decoded is null) return null;

        using var upright = Orient(decoded, codec.EncodedOrigin);
        var scale = Math.Min(1.0, (double)MaxSide / Math.Max(upright.Width, upright.Height));
        var w = Math.Max(1, (int)Math.Round(upright.Width * scale));
        var h = Math.Max(1, (int)Math.Round(upright.Height * scale));
        using var sized = scale < 1 ? upright.Resize(new SKImageInfo(w, h), new SKSamplingOptions(SKCubicResampler.Mitchell)) : upright.Copy();
        using var image = SKImage.FromBitmap(sized);
        using var jpeg = image.Encode(SKEncodedImageFormat.Jpeg, Quality);
        return new Result(jpeg.ToArray(), sized.Width, sized.Height);
    }

    private static SKBitmap Orient(SKBitmap src, SKEncodedOrigin origin)
    {
        if (origin == SKEncodedOrigin.TopLeft) return src.Copy();
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var dst = new SKBitmap(swap ? src.Height : src.Width, swap ? src.Width : src.Height);
        using var canvas = new SKCanvas(dst);
        canvas.Clear(SKColors.White);
        switch (origin)
        {
            case SKEncodedOrigin.TopRight: canvas.Scale(-1, 1, src.Width / 2f, 0); break;
            case SKEncodedOrigin.BottomRight: canvas.RotateDegrees(180, src.Width / 2f, src.Height / 2f); break;
            case SKEncodedOrigin.BottomLeft: canvas.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.LeftTop: canvas.RotateDegrees(90); canvas.Scale(1, -1); break;
            case SKEncodedOrigin.RightTop: canvas.Translate(dst.Width, 0); canvas.RotateDegrees(90); break;
            case SKEncodedOrigin.RightBottom: canvas.Translate(dst.Width, dst.Height); canvas.RotateDegrees(90); canvas.Scale(-1, 1); break;
            case SKEncodedOrigin.LeftBottom: canvas.Translate(0, dst.Height); canvas.RotateDegrees(270); break;
        }
        canvas.DrawBitmap(src, 0, 0);
        return dst;
    }
}
