namespace Logit.Api.Features.Auth;

/// A short, plain name for the device or browser a request came from, for the list of places
/// you're signed in and for the phone's "Sign in on a computer?" question. Read from the
/// User-Agent; it is only a description, never a security decision.
public static class DeviceLabel
{
    public static string From(HttpRequest request)
    {
        // The Logit Android app sends its device id (Sync.FreeBackup) and runs in a WebView.
        var ua = request.Headers.UserAgent.ToString();
        if (!string.IsNullOrEmpty(request.Headers[Sync.FreeBackup.DeviceHeader]))
            return ua.Contains("iPhone") || ua.Contains("iPad") ? "Logit app on iOS" : "Logit app on Android";
        return FromUserAgent(ua);
    }

    public static string FromUserAgent(string? ua)
    {
        if (string.IsNullOrWhiteSpace(ua)) return "Unknown browser";
        var browser =
            ua.Contains("Edg/") ? "Edge"
            : ua.Contains("OPR/") ? "Opera"
            : ua.Contains("SamsungBrowser/") ? "Samsung Internet"
            : ua.Contains("Firefox/") ? "Firefox"
            : ua.Contains("Chrome/") || ua.Contains("CriOS/") ? "Chrome"
            : ua.Contains("Safari/") ? "Safari"
            : null;
        var os =
            ua.Contains("Windows") ? "Windows"
            : ua.Contains("iPhone") ? "iPhone"
            : ua.Contains("iPad") ? "iPad"
            : ua.Contains("Mac OS X") || ua.Contains("Macintosh") ? "Mac"
            : ua.Contains("CrOS") ? "ChromeOS"
            : ua.Contains("Android") ? "Android"
            : ua.Contains("Linux") ? "Linux"
            : null;
        return (browser, os) switch
        {
            (null, null) => "Unknown browser",
            (null, _) => $"A browser on {os}",
            (_, null) => browser!,
            _ => $"{browser} on {os}",
        };
    }
}
