using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Logit.Api.Features.Photos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;

namespace Logit.Api.Tests;

public class PhotoTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), $"logit-photos-{Guid.NewGuid():N}");
    private readonly ApiFactory _api;

    public PhotoTests() => _api = new ApiFactory { Settings = { ["Photos:Folder"] = _folder } };

    public void Dispose()
    {
        _api.Dispose();
        if (Directory.Exists(_folder)) Directory.Delete(_folder, true);
    }

    private static byte[] Picture(int w, int h, SKEncodedImageFormat format = SKEncodedImageFormat.Png)
    {
        using var bmp = new SKBitmap(w, h);
        using (var canvas = new SKCanvas(bmp))
        {
            canvas.Clear(SKColors.SteelBlue);
            using var red = new SKPaint { Color = SKColors.Red };
            canvas.DrawRect(0, 0, w / 4f, h / 4f, red); // marks the top-left corner
        }
        using var img = SKImage.FromBitmap(bmp);
        return img.Encode(format, 90).ToArray();
    }

    /// A JPEG with an EXIF block saying "rotate 90° clockwise to show" and a made-up GPS tag text.
    private static byte[] JpegWithExif(int w, int h)
    {
        var jpeg = Picture(w, h, SKEncodedImageFormat.Jpeg);
        var tiff = new List<byte>();
        tiff.AddRange("II*\0"u8.ToArray());
        tiff.AddRange(BitConverter.GetBytes(8));
        tiff.AddRange(BitConverter.GetBytes((ushort)1));            // one entry
        tiff.AddRange(BitConverter.GetBytes((ushort)0x0112));       // Orientation
        tiff.AddRange(BitConverter.GetBytes((ushort)3));            // SHORT
        tiff.AddRange(BitConverter.GetBytes(1));
        tiff.AddRange(BitConverter.GetBytes(6)); tiff.RemoveRange(tiff.Count - 2, 2); tiff.AddRange(new byte[2]);
        tiff.AddRange(BitConverter.GetBytes(0));                    // no next IFD
        tiff.AddRange(Encoding.ASCII.GetBytes("GPS 53.3498N 6.2603W"));
        var payload = Encoding.ASCII.GetBytes("Exif\0\0").Concat(tiff).ToArray();
        var len = payload.Length + 2;
        var app1 = new byte[] { 0xFF, 0xE1, (byte)(len >> 8), (byte)len }.Concat(payload);
        return jpeg.Take(2).Concat(app1).Concat(jpeg.Skip(2)).ToArray();
    }

    private static async Task<HttpResponseMessage> Upload(HttpClient http, byte[] bytes, string name = "p.jpg")
    {
        var form = new MultipartFormDataContent();
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(part, "file", name);
        return await http.PostAsync("/photos", form);
    }

    [Fact]
    public async Task A_big_picture_is_shrunk_to_a_jpeg_anyone_with_its_address_can_load()
    {
        var (http, _, _) = await _api.SignUpAsync("ava");
        var res = await Upload(http, Picture(3000, 1000));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.Equal((2048, 683), (body.GetProperty("width").GetInt32(), body.GetProperty("height").GetInt32()));
        var url = body.GetProperty("url").GetString()!;
        Assert.Matches("^/photos/[0-9a-f]{32}$", url);

        var get = await _api.CreateClient().GetAsync(url); // no sign-in, like an <img>
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.Equal("image/jpeg", get.Content.Headers.ContentType?.MediaType);
        Assert.Contains("immutable", get.Headers.CacheControl?.ToString());
        var bytes = await get.Content.ReadAsByteArrayAsync();
        Assert.Equal((byte)0xFF, bytes[0]);
        Assert.Equal((byte)0xD8, bytes[1]);
    }

    [Fact]
    public async Task A_phone_photo_is_turned_upright_and_keeps_no_metadata()
    {
        var input = JpegWithExif(400, 200);
        Assert.Contains("GPS 53", Encoding.ASCII.GetString(input));
        var (http, _, _) = await _api.SignUpAsync("ava");
        var body = await (await Upload(http, input)).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.Equal((200, 400), (body.GetProperty("width").GetInt32(), body.GetProperty("height").GetInt32()));

        var stored = await _api.CreateClient().GetByteArrayAsync(body.GetProperty("url").GetString());
        var text = Encoding.ASCII.GetString(stored);
        Assert.DoesNotContain("Exif", text);
        Assert.DoesNotContain("GPS 53", text);
        // Rotated 90° clockwise: the red top-left corner is now top-right.
        using var shown = SKBitmap.Decode(stored);
        Assert.True(shown.GetPixel(shown.Width - 10, 10).Red > 200);
        Assert.True(shown.GetPixel(10, 10).Red < 100);
    }

    [Fact]
    public async Task Not_a_picture_is_refused()
    {
        var (http, _, _) = await _api.SignUpAsync("ava");
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(http, Encoding.UTF8.GetBytes("<script>alert(1)</script>"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(_api.CreateClient(), Picture(10, 10))).StatusCode);
    }

    [Fact]
    public async Task Only_the_owner_deletes_a_photo_and_a_deleted_account_takes_its_photos()
    {
        var (ava, avaId, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var first = (await (await Upload(ava, Picture(50, 50))).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("url").GetString()!;
        var second = (await (await Upload(ava, Picture(60, 60))).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("url").GetString()!;

        Assert.Equal(HttpStatusCode.NotFound, (await ben.DeleteAsync(first)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ava.DeleteAsync(first)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _api.CreateClient().GetAsync(first)).StatusCode);

        var del = new HttpRequestMessage(HttpMethod.Delete, "/auth/account") { Content = JsonContent.Create(new { password = "Passw0rd!long" }) };
        (await ava.SendAsync(del)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await _api.CreateClient().GetAsync(second)).StatusCode); // gone at once
        using (var scope = _api.Services.CreateScope())
            Assert.Equal(1, await PhotoSweeper.SweepAsync(scope.ServiceProvider, default));
        Assert.Empty(Directory.EnumerateFiles(_folder, "*", SearchOption.AllDirectories));
        Assert.Equal(0, await _api.WithDbAsync(db => db.Photos.CountAsync()));
    }

    [Fact]
    public async Task A_replaced_profile_picture_or_progress_photo_is_deleted()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        async Task<string> Up() => (await (await Upload(ava, Picture(40, 40))).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("url").GetString()!;
        string Profile(string photo) => JsonSerializer.Serialize(new { progressPhoto = new { dataUrl = photo, updatedAtMs = 1 } });
        var (avatar1, avatar2, progress1, progress2) = (await Up(), await Up(), await Up(), await Up());
        var anon = _api.CreateClient();

        (await ava.PatchAsJsonAsync("/users/me", new { avatarUrl = avatar1, publicProfileJson = Profile(progress1) })).EnsureSuccessStatusCode();
        (await ava.PatchAsJsonAsync("/users/me", new { avatarUrl = avatar2 })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(avatar1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync(progress1)).StatusCode); // still on the profile

        (await ava.PatchAsJsonAsync("/users/me", new { publicProfileJson = Profile(progress2) })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(progress1)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync(avatar2)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync(progress2)).StatusCode);
    }
}
