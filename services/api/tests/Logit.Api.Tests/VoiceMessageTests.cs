using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data.Entities;

namespace Logit.Api.Tests;

/// Voice messages (design canvas M5–M6, M8, C1–C2): between people and between a coach and
/// their client. Up to a minute; kept like photos.
public class VoiceMessageTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), $"logit-voice-{Guid.NewGuid():N}");
    private readonly ApiFactory _api;

    public VoiceMessageTests() => _api = new ApiFactory { Settings = { ["Photos:Folder"] = _folder } };

    public void Dispose()
    {
        _api.Dispose();
        if (Directory.Exists(_folder)) Directory.Delete(_folder, true);
    }

    /// What a phone's recorder starts a WebM file with, then some made-up audio.
    private static readonly byte[] Webm = [0x1A, 0x45, 0xDF, 0xA3, .. Enumerable.Range(0, 4000).Select(i => (byte)i)];

    private static async Task<HttpResponseMessage> Upload(HttpClient http, byte[] bytes, int ms)
    {
        var form = new MultipartFormDataContent();
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(part, "file", "voice.webm");
        form.Add(new StringContent(ms.ToString()), "durationMs");
        return await http.PostAsync("/voice", form);
    }

    private static async Task<JsonElement> Uploaded(HttpClient http, int ms = 11_000)
    {
        var res = await Upload(http, Webm, ms);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
    }

    [Fact]
    public async Task A_recording_is_checked_kept_and_played_back_in_parts()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(ava, "<html>not audio</html>"u8.ToArray(), 5000)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(ava, Webm, 75_000)).StatusCode); // over a minute
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(ava, Webm, 100)).StatusCode);    // a tap, not a message

        var voice = await Uploaded(ava);
        var url = voice.GetProperty("url").GetString()!;
        var anyone = _api.CreateClient();
        var whole = await anyone.GetAsync(url);
        Assert.Equal("audio/webm", whole.Content.Headers.ContentType!.MediaType);
        Assert.Equal(Webm, await whole.Content.ReadAsByteArrayAsync());

        var part = new HttpRequestMessage(HttpMethod.Get, url);
        part.Headers.Range = new RangeHeaderValue(0, 99);
        var res = await anyone.SendAsync(part);
        Assert.Equal(HttpStatusCode.PartialContent, res.StatusCode); // players need this to seek
        Assert.Equal(100, (await res.Content.ReadAsByteArrayAsync()).Length);

        (await ava.DeleteAsync(url)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anyone.GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task A_voice_message_reaches_a_chat_and_stays_locked_in_a_request()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        (await ava.PostAsync("/users/ben/follow", null)).EnsureSuccessStatusCode();

        var voice = await Uploaded(ben, 11_000);
        (await ben.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "v1", body = "", voiceId = voice.GetProperty("id").GetGuid(), voicePeaks = "1357975310" }))
            .EnsureSuccessStatusCode();
        var m = (await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=ben", ApiFactory.Json)).GetProperty("messages")[0];
        Assert.Equal((voice.GetProperty("url").GetString(), 11_000, "1357975310"),
            (m.GetProperty("voiceUrl").GetString(), m.GetProperty("voiceMs").GetInt32(), m.GetProperty("voicePeaks").GetString()));
        var threads = await ava.GetFromJsonAsync<JsonElement>("/dm/threads?box=chats", ApiFactory.Json);
        Assert.Equal("Voice message · 0:11", threads[0].GetProperty("lastBody").GetString());

        // A stranger's voice message waits locked in Ava's requests.
        (await dev.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "v2", body = "", voiceId = (await Uploaded(dev)).GetProperty("id").GetGuid(), voicePeaks = "<script>" }))
            .EnsureSuccessStatusCode();
        var locked = (await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=dev", ApiFactory.Json)).GetProperty("messages")[0];
        Assert.True(locked.GetProperty("voiceHidden").GetBoolean());
        Assert.Equal(JsonValueKind.Null, locked.GetProperty("voiceUrl").ValueKind);
        Assert.Equal("", locked.GetProperty("voicePeaks").GetString()); // not digits: dropped

        // Ben unsends his: the recording goes with it.
        (await ben.DeleteAsync($"/dm/messages/{m.GetProperty("id").GetGuid()}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await _api.CreateClient().GetAsync(voice.GetProperty("url").GetString())).StatusCode);

        // Someone else's recording can't be sent as yours.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await dev.PostAsJsonAsync("/dm/send", new { username = "ava", clientId = "v3", body = "", voiceId = voice.GetProperty("id").GetGuid() })).StatusCode);
    }

    [Fact]
    public async Task A_coach_and_client_can_send_each_other_voice_messages()
    {
        var (client, clientId, _) = await _api.SignUpAsync("ava");
        var (coach, coachId, _) = await _api.SignUpAsync("niamh", UserTier.Studio);
        var rel = Guid.NewGuid();
        await _api.WithDbAsync(async db =>
        {
            db.CoachClientRelationships.Add(new CoachClientRelationship { Id = rel, CoachId = coachId, ClientId = clientId, Status = CoachClientStatus.Active });
            await db.SaveChangesAsync();
        });

        var voice = await Uploaded(coach, 52_000);
        (await coach.PostAsJsonAsync("/coach/messages", new
        {
            relationshipId = rel, messageId = "m1", body = "", createdAtMs = 1, voiceId = voice.GetProperty("id").GetGuid(), voicePeaks = "2468",
        })).EnsureSuccessStatusCode();
        var m = (await client.GetFromJsonAsync<JsonElement>("/coach/messages/all?since=0", ApiFactory.Json)).GetProperty("messages")[0];
        Assert.Equal((voice.GetProperty("url").GetString(), 52_000, "2468"),
            (m.GetProperty("voiceUrl").GetString(), m.GetProperty("voiceMs").GetInt32(), m.GetProperty("voicePeaks").GetString()));
    }
}
