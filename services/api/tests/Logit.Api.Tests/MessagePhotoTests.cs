using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;
using SkiaSharp;

namespace Logit.Api.Tests;

/// Photos in messages (design canvas M5, M8, C1–C2): between people, and between a coach and
/// their client.
public class MessagePhotoTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), $"logit-photos-{Guid.NewGuid():N}");
    private readonly ApiFactory _api;

    public MessagePhotoTests() => _api = new ApiFactory { Settings = { ["Photos:Folder"] = _folder } };

    public void Dispose()
    {
        _api.Dispose();
        if (Directory.Exists(_folder)) Directory.Delete(_folder, true);
    }

    private static async Task<JsonElement> Upload(HttpClient http, int w = 120, int h = 160)
    {
        using var bmp = new SKBitmap(w, h);
        using (var canvas = new SKCanvas(bmp)) canvas.Clear(SKColors.SteelBlue);
        using var img = SKImage.FromBitmap(bmp);
        var form = new MultipartFormDataContent();
        var part = new ByteArrayContent(img.Encode(SKEncodedImageFormat.Png, 90).ToArray());
        part.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(part, "file", "p.png");
        var res = await http.PostAsync("/photos", form);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }

    private static Task<HttpResponseMessage> Send(HttpClient from, string to, Guid photoId, string body = "") =>
        from.PostAsJsonAsync("/dm/send", new { username = to, clientId = Guid.NewGuid().ToString(), body, photoId });

    [Fact]
    public async Task A_photo_reaches_a_chat_and_stays_hidden_in_a_request_until_it_is_accepted()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        (await ava.PostAsync("/users/ben/follow", null)).EnsureSuccessStatusCode();

        // Ben (whom Ava follows) sends a photo on its own: it lands in her chats, with its shape.
        var photo = await Upload(ben);
        var sent = await (await Send(ben, "ava", photo.GetProperty("id").GetGuid())).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        Assert.Equal(photo.GetProperty("url").GetString(), sent.GetProperty("photoUrl").GetString());
        var chat = await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=ben", ApiFactory.Json);
        var m = chat.GetProperty("messages")[0];
        Assert.Equal((120, 160, false), (m.GetProperty("photoWidth").GetInt32(), m.GetProperty("photoHeight").GetInt32(), m.GetProperty("photoHidden").GetBoolean()));
        Assert.Equal(photo.GetProperty("url").GetString(), m.GetProperty("photoUrl").GetString());
        var threads = await ava.GetFromJsonAsync<JsonElement>("/dm/threads?box=chats", ApiFactory.Json);
        Assert.Equal("Sent a photo", threads[0].GetProperty("lastBody").GetString());

        // A stranger's photo sits in Ava's requests without its address until she accepts.
        (await Send(dev, "ava", (await Upload(dev)).GetProperty("id").GetGuid(), "hi")).EnsureSuccessStatusCode();
        var request = await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=dev", ApiFactory.Json);
        var hidden = request.GetProperty("messages")[0];
        Assert.True(hidden.GetProperty("photoHidden").GetBoolean());
        Assert.Equal(JsonValueKind.Null, hidden.GetProperty("photoUrl").ValueKind);
        // Dev sees his own photo.
        var devs = await dev.GetFromJsonAsync<JsonElement>("/dm/chat?username=ava", ApiFactory.Json);
        Assert.Equal(JsonValueKind.String, devs.GetProperty("messages")[0].GetProperty("photoUrl").ValueKind);

        (await ava.PostAsync($"/dm/threads/{request.GetProperty("threadId").GetGuid()}/accept", null)).EnsureSuccessStatusCode();
        var accepted = await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=dev", ApiFactory.Json);
        Assert.Equal(JsonValueKind.String, accepted.GetProperty("messages")[0].GetProperty("photoUrl").ValueKind);

        // Someone else's photo can't be sent as yours.
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(dev, "ava", photo.GetProperty("id").GetGuid())).StatusCode);
    }

    [Fact]
    public async Task A_coach_and_client_can_send_each_other_photos()
    {
        var (client, clientId, _) = await _api.SignUpAsync("ava");
        var (coach, coachId, _) = await _api.SignUpAsync("niamh", UserTier.Studio);
        var rel = Guid.NewGuid();
        await _api.WithDbAsync(async db =>
        {
            db.CoachClientRelationships.Add(new CoachClientRelationship { Id = rel, CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active });
            await db.SaveChangesAsync();
        });

        var photo = await Upload(client, 300, 400);
        (await client.PostAsJsonAsync("/coach/messages", new
        {
            relationshipId = rel, messageId = "m1", body = "", createdAtMs = 1, photoId = photo.GetProperty("id").GetGuid(),
        })).EnsureSuccessStatusCode();

        var forCoach = (await coach.GetFromJsonAsync<JsonElement>($"/coach/messages?relationshipId={rel}&since=0", ApiFactory.Json)).GetProperty("messages")[0];
        Assert.Equal((photo.GetProperty("url").GetString(), 300, 400),
            (forCoach.GetProperty("photoUrl").GetString(), forCoach.GetProperty("photoWidth").GetInt32(), forCoach.GetProperty("photoHeight").GetInt32()));
        var all = (await client.GetFromJsonAsync<JsonElement>("/coach/messages/all?since=0", ApiFactory.Json)).GetProperty("messages")[0];
        Assert.Equal(photo.GetProperty("url").GetString(), all.GetProperty("photoUrl").GetString());

        // A message needs words or a photo, and the photo must be the sender's own.
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PostAsJsonAsync("/coach/messages", new { relationshipId = rel, messageId = "m2", body = "", createdAtMs = 2 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await coach.PostAsJsonAsync("/coach/messages", new
        {
            relationshipId = rel, messageId = "m3", body = "", createdAtMs = 3, photoId = photo.GetProperty("id").GetGuid(),
        })).StatusCode);
    }
}
