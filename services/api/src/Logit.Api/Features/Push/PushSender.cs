using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Google.Apis.Auth.OAuth2;

namespace Logit.Api.Features.Push;

/// What a push shows: who (title) and what (body), never the content itself (PRODUCT.md
/// principle 6). Channel is the Android notification channel the app made ("social", "coaching").
public record PushMessage(string Title, string Body, string Channel, IReadOnlyDictionary<string, string> Data);

public enum PushResult { Sent, BadToken, Failed }

public interface IPushSender
{
    bool IsConfigured { get; }
    Task<PushResult> SendAsync(string token, PushMessage message, CancellationToken ct);
}

/// Sends through Firebase Cloud Messaging (HTTP v1) with a service account that has the
/// "Firebase Cloud Messaging API Admin" role. Config: Push:ServiceAccountKeyFile (a path) or
/// Push:ServiceAccountJson (the JSON itself); the project comes from the key.
public class FcmPushSender : IPushSender
{
    private const string Scope = "https://www.googleapis.com/auth/firebase.messaging";
    private readonly HttpClient _http;
    private readonly ILogger<FcmPushSender> _log;
    private readonly GoogleCredential? _credential;
    private readonly string? _sendUrl;

    public FcmPushSender(HttpClient http, IConfiguration config, ILogger<FcmPushSender> log)
    {
        _http = http;
        _log = log;
        var json = config["Push:ServiceAccountJson"];
        var file = config["Push:ServiceAccountKeyFile"];
        if (string.IsNullOrWhiteSpace(json) && !string.IsNullOrWhiteSpace(file))
        {
            if (File.Exists(file)) json = File.ReadAllText(file);
            else log.LogWarning("Push:ServiceAccountKeyFile {File} doesn't exist; no pushes will be sent", file);
        }
        if (string.IsNullOrWhiteSpace(json)) return;
        try
        {
            var account = CredentialFactory.FromJson<ServiceAccountCredential>(json);
            _credential = account.ToGoogleCredential().CreateScoped(Scope);
            _sendUrl = $"https://fcm.googleapis.com/v1/projects/{Uri.EscapeDataString(account.ProjectId)}/messages:send";
        }
        catch (Exception ex)
        {
            log.LogError(ex, "The push service account key couldn't be read; no pushes will be sent");
        }
    }

    public bool IsConfigured => _credential is not null;

    public async Task<PushResult> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        if (_credential is null) return PushResult.Failed;
        try
        {
            var access = await ((ITokenAccess)_credential).GetAccessTokenForRequestAsync(cancellationToken: ct);
            using var req = new HttpRequestMessage(HttpMethod.Post, _sendUrl)
            {
                Content = JsonContent.Create(new
                {
                    message = new
                    {
                        token,
                        notification = new { title = message.Title, body = message.Body },
                        data = message.Data,
                        android = new { notification = new { channel_id = message.Channel } },
                    },
                }),
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
            using var res = await _http.SendAsync(req, ct);
            if (res.IsSuccessStatusCode) return PushResult.Sent;
            var body = await res.Content.ReadAsStringAsync(ct);
            // The app was uninstalled or the token replaced: forget it.
            if (res.StatusCode == HttpStatusCode.NotFound || body.Contains("UNREGISTERED")
                || (res.StatusCode == HttpStatusCode.BadRequest && body.Contains("registration token")))
                return PushResult.BadToken;
            _log.LogWarning("FCM refused a push ({Status}): {Body}", (int)res.StatusCode, body.Length > 300 ? body[..300] : body);
            return PushResult.Failed;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            _log.LogWarning("Couldn't reach FCM: {Reason}", ex.Message);
            return PushResult.Failed;
        }
    }
}

/// For self-hosted servers, which have no Firebase key: whether this server hands its pushes to
/// getlogit.app. Off until an admin turns it on (Server page); saved as a ServerSetting.
public class PushRelay(string url)
{
    public const string SettingKey = "push.relay";
    public const string DefaultUrl = "https://api.getlogit.app/push/relay";
    public string Url { get; } = url;
    public bool On { get; set; }
}

/// Hands the token and the text to getlogit.app's /push/relay, which sends with its key.
public class RelayPushSender(HttpClient http, PushRelay relay, ILogger<RelayPushSender> log) : IPushSender
{
    public bool IsConfigured => relay.On;

    public async Task<PushResult> SendAsync(string token, PushMessage message, CancellationToken ct)
    {
        try
        {
            using var res = await http.PostAsJsonAsync(relay.Url, new RelayRequest(token, message.Title, message.Body, message.Channel,
                message.Data.ToDictionary()), ct);
            if (res.IsSuccessStatusCode) return PushResult.Sent;
            if (res.StatusCode == HttpStatusCode.Gone) return PushResult.BadToken;
            log.LogWarning("The push relay answered {Status}", (int)res.StatusCode);
            return PushResult.Failed;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning("Couldn't reach the push relay: {Reason}", ex.Message);
            return PushResult.Failed;
        }
    }
}

public record RelayRequest(string Token, string Title, string Body, string Channel, Dictionary<string, string>? Data);
