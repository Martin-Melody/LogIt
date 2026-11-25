using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Features.Photos;
using Logit.Api.Features.Push;
using Logit.Api.Features.Social;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;

namespace Logit.Api.Tests;

/// Stories (design canvas S1–S4; journey F4 in docs/testing-friends.md), copied from Instagram.
public class StoryTests : IDisposable
{
    private static readonly DateTime Noon = new(2026, 11, 24, 12, 0, 0, DateTimeKind.Utc);
    private readonly FakeClock _clock = new(Noon);
    private readonly string _folder = Path.Combine(Path.GetTempPath(), $"logit-photos-{Guid.NewGuid():N}");
    private readonly ApiFactory _api;

    public StoryTests() => _api = new ApiFactory
    {
        Settings = { ["Photos:Folder"] = _folder },
        ConfigureTestServices = s =>
        {
            s.AddSingleton<TimeProvider>(_clock);
            s.Remove(s.Single(d => d.ImplementationType == typeof(PushDispatcher)));
            s.Remove(s.Single(d => d.ImplementationType == typeof(StorySweeper)));
        },
    };

    public void Dispose()
    {
        _api.Dispose();
        if (Directory.Exists(_folder)) Directory.Delete(_folder, true);
    }

    private const string Record = """{"exerciseName":"Squat","weight":110,"unit":"kg","reps":3}""";

    private static async Task Follow(HttpClient who, string whom) => (await who.PostAsync($"/users/{whom}/follow", null)).EnsureSuccessStatusCode();

    private static async Task<Guid> Post(HttpClient http, bool closeFriends = false)
    {
        var res = await http.PostAsJsonAsync("/stories", new { cardType = "PersonalRecord", cardJson = Record, closeFriends });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("id").GetGuid();
    }

    private static async Task<List<string>> Row(HttpClient http) =>
        (await http.GetFromJsonAsync<JsonElement>("/stories", ApiFactory.Json)).EnumerateArray()
            .Select(a => a.GetProperty("user").GetProperty("username").GetString()!).ToList();

    [Fact]
    public async Task Followers_see_a_story_for_24_hours_and_close_friends_hide_and_block_are_honoured()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        var (dev, _, _) = await _api.SignUpAsync("dev");
        var (_, _, _) = await _api.SignUpAsync("eve"); // follows nobody
        await Follow(ben, "ava");
        await Follow(cara, "ava");
        await Follow(dev, "ava");

        await Post(ava);
        Assert.Equal(["ava"], await Row(ava)); // your own story comes first in your row
        Assert.Equal(["ava"], await Row(ben));
        Assert.Equal(["ava"], await Row(cara));

        // Hide story from Dev; Close friends = Ben only.
        (await ava.PutAsync("/stories/lists/hidden/dev", null)).EnsureSuccessStatusCode();
        Assert.Empty(await Row(dev));
        (await ava.PutAsync("/stories/lists/close-friends/ben", null)).EnsureSuccessStatusCode();
        var cf = await Post(ava, closeFriends: true);
        var bens = (await ben.GetFromJsonAsync<JsonElement>("/stories", ApiFactory.Json))[0].GetProperty("stories");
        Assert.Equal(2, bens.GetArrayLength());
        Assert.True(bens[1].GetProperty("closeFriends").GetBoolean());
        Assert.Equal(1, (await cara.GetFromJsonAsync<JsonElement>("/stories", ApiFactory.Json))[0].GetProperty("stories").GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await cara.PostAsync($"/stories/{cf}/seen", null)).StatusCode);

        var lists = await ava.GetFromJsonAsync<JsonElement>("/stories/lists", ApiFactory.Json);
        Assert.Equal("ben", lists.GetProperty("closeFriends")[0].GetProperty("username").GetString());
        Assert.Equal("dev", lists.GetProperty("hidden")[0].GetProperty("username").GetString());

        // A block either way removes it.
        (await cara.PostAsync("/users/ava/block", null)).EnsureSuccessStatusCode();
        Assert.Empty(await Row(cara));

        _clock.Now = Noon.AddHours(24).AddMinutes(1);
        Assert.Empty(await Row(ben));
        Assert.Empty(await Row(ava));
    }

    [Fact]
    public async Task A_private_accounts_story_reaches_approved_followers_only()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        (await ava.PutAsJsonAsync("/users/me/social-settings", new { isPrivate = true })).EnsureSuccessStatusCode();
        await Follow(ben, "ava"); // a request, not a follow
        await Post(ava);
        Assert.Empty(await Row(ben));
        (await ava.PostAsync("/users/me/follow-requests/ben/accept", null)).EnsureSuccessStatusCode();
        Assert.Equal(["ava"], await Row(ben));
    }

    [Fact]
    public async Task Seen_and_cheers_show_to_the_author_and_the_cheers_setting_is_honoured()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        await Follow(ben, "ava");
        await Follow(cara, "ava");
        var id = await Post(ava);

        (await ben.PostAsync($"/stories/{id}/seen", null)).EnsureSuccessStatusCode();
        (await ben.PostAsync($"/stories/{id}/cheer", null)).EnsureSuccessStatusCode();
        (await ben.PostAsync($"/stories/{id}/cheer", null)).EnsureSuccessStatusCode(); // a second tap changes nothing
        (await cara.PostAsync($"/stories/{id}/seen", null)).EnsureSuccessStatusCode();

        var mine = (await ben.GetFromJsonAsync<JsonElement>("/stories", ApiFactory.Json))[0].GetProperty("stories")[0];
        Assert.True(mine.GetProperty("seen").GetBoolean());
        Assert.True(mine.GetProperty("cheered").GetBoolean());

        var viewers = await ava.GetFromJsonAsync<JsonElement>($"/stories/{id}/viewers", ApiFactory.Json);
        Assert.Equal(["ben", "cara"], viewers.EnumerateArray().Select(v => v.GetProperty("user").GetProperty("username").GetString()).ToList());
        Assert.True(viewers[0].GetProperty("cheered").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await ben.GetAsync($"/stories/{id}/viewers")).StatusCode); // the author only

        using (var scope = _api.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.Notifications.CountAsync(n => n.Type == Data.Entities.NotificationType.StoryCheer));
        }

        // "People you follow": Ava doesn't follow Cara, so Cara can't cheer or reply.
        (await ava.PutAsJsonAsync("/users/me/social-settings", new { cheersFrom = "Following" })).EnsureSuccessStatusCode();
        Assert.False((await cara.GetFromJsonAsync<JsonElement>("/stories", ApiFactory.Json))[0].GetProperty("canReply").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await cara.PostAsync($"/stories/{id}/cheer", null)).StatusCode);
    }

    [Fact]
    public async Task A_reply_is_a_message_that_quotes_the_story_until_it_expires_or_is_deleted()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        await Follow(ben, "ava");
        await Follow(ava, "ben");
        var first = await Post(ava);
        var second = await Post(ava);

        async Task<JsonElement> Reply(Guid story, string body)
        {
            var res = await ben.PostAsJsonAsync("/dm/send", new
            {
                username = "ava", clientId = Guid.NewGuid().ToString(), body,
                cardType = "Story", cardJson = JsonSerializer.Serialize(new { storyId = story }),
            });
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        }
        var sent = await Reply(first, "Strong!");
        var quote = JsonDocument.Parse(sent.GetProperty("cardJson").GetString()!).RootElement;
        Assert.Equal("PersonalRecord", quote.GetProperty("type").GetString());
        Assert.Equal("Squat", quote.GetProperty("data").GetProperty("exerciseName").GetString());
        await Reply(second, "And again");

        // Deleting a story removes its quote at once.
        (await ava.DeleteAsync($"/stories/{first}")).EnsureSuccessStatusCode();
        JsonElement Messages(JsonElement chat) => chat.GetProperty("messages");
        var chat = await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=ben", ApiFactory.Json);
        Assert.Equal(JsonValueKind.Null, Messages(chat)[0].GetProperty("cardJson").ValueKind);
        Assert.Equal("Strong!", Messages(chat)[0].GetProperty("body").GetString());
        Assert.Equal(JsonValueKind.String, Messages(chat)[1].GetProperty("cardJson").ValueKind);

        // After 24 hours the other one has gone too, then the sweeper deletes it.
        _clock.Now = Noon.AddHours(25);
        chat = await ava.GetFromJsonAsync<JsonElement>("/dm/chat?username=ben", ApiFactory.Json);
        Assert.Equal(JsonValueKind.Null, Messages(chat)[1].GetProperty("cardJson").ValueKind);
        using var scope = _api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await StorySweeper.SweepAsync(db, scope.ServiceProvider.GetRequiredService<IPhotoStore>(), _clock.Now);
        Assert.Equal(0, await db.Stories.CountAsync());
        Assert.Equal(0, await db.DirectMessages.CountAsync(m => m.CardJson != null));

        // A reply to a story that's gone is refused.
        var late = await ben.PostAsJsonAsync("/dm/send", new
        {
            username = "ava", clientId = "late", body = "Nice",
            cardType = "Story", cardJson = JsonSerializer.Serialize(new { storyId = second }),
        });
        Assert.Equal(HttpStatusCode.NotFound, late.StatusCode);
    }

    private static async Task<JsonElement> Upload(HttpClient http)
    {
        using var bmp = new SKBitmap(90, 160);
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

    [Fact]
    public async Task A_photo_story_carries_the_record_or_not_is_quoted_in_replies_and_leaves_with_the_story()
    {
        var (ava, _, _) = await _api.SignUpAsync("ava");
        var (ben, _, _) = await _api.SignUpAsync("ben");
        var (cara, _, _) = await _api.SignUpAsync("cara");
        await Follow(ben, "ava");
        await Follow(ava, "ben");
        var anon = _api.CreateClient();

        // A photo with the record on top, and a photo on its own.
        var withRecord = await Upload(ava);
        var plain = await Upload(ava);
        var res = await ava.PostAsJsonAsync("/stories", new { cardType = "PersonalRecord", cardJson = Record, closeFriends = false, photoId = withRecord.GetProperty("id").GetGuid() });
        var first = (await res.Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json)).GetProperty("id").GetGuid();
        (await ava.PostAsJsonAsync("/stories", new { closeFriends = false, photoId = plain.GetProperty("id").GetGuid() })).EnsureSuccessStatusCode();

        var seen = (await ben.GetFromJsonAsync<JsonElement>("/stories", ApiFactory.Json))[0].GetProperty("stories");
        Assert.Equal((withRecord.GetProperty("url").GetString(), 90, 160, "PersonalRecord"),
            (seen[0].GetProperty("photoUrl").GetString(), seen[0].GetProperty("photoWidth").GetInt32(), seen[0].GetProperty("photoHeight").GetInt32(), seen[0].GetProperty("cardType").GetString()));
        Assert.Equal(("", plain.GetProperty("url").GetString()), (seen[1].GetProperty("cardType").GetString(), seen[1].GetProperty("photoUrl").GetString()));

        // Nothing at all, or someone else's photo, can't be a story.
        Assert.Equal(HttpStatusCode.BadRequest, (await ava.PostAsJsonAsync("/stories", new { closeFriends = false })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ben.PostAsJsonAsync("/stories", new { closeFriends = false, photoId = plain.GetProperty("id").GetGuid() })).StatusCode);

        // A reply quotes the photo.
        var reply = await (await ben.PostAsJsonAsync("/dm/send", new
        {
            username = "ava", clientId = "r1", body = "Strong!", cardType = "Story", cardJson = JsonSerializer.Serialize(new { storyId = seen[1].GetProperty("id").GetGuid() }),
        })).Content.ReadFromJsonAsync<JsonElement>(ApiFactory.Json);
        var quote = JsonDocument.Parse(reply.GetProperty("cardJson").GetString()!).RootElement;
        Assert.Equal(plain.GetProperty("url").GetString(), quote.GetProperty("photoUrl").GetString());

        // Ben reports the photo story (Cara, who can't see it, can't).
        var report = new { targetType = "Story", targetId = seen[1].GetProperty("id").GetGuid(), reason = "Spam" };
        Assert.Equal(HttpStatusCode.NoContent, (await ben.PostAsJsonAsync("/reports", report)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cara.PostAsJsonAsync("/reports", report)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ava.PostAsJsonAsync("/reports", report)).StatusCode); // not your own

        // Deleting a story deletes its photo; the sweeper does the same after 24 hours.
        (await ava.DeleteAsync($"/stories/{first}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(withRecord.GetProperty("url").GetString())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync(plain.GetProperty("url").GetString())).StatusCode);
        _clock.Now = Noon.AddHours(25);
        using (var scope = _api.Services.CreateScope())
            await StorySweeper.SweepAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), scope.ServiceProvider.GetRequiredService<IPhotoStore>(), _clock.Now);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync(plain.GetProperty("url").GetString())).StatusCode);
    }
}
