using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging.Console;
using Microsoft.Extensions.Options;

namespace Logit.Api.Features.Diagnostics;

/// <summary>
/// The default console format (<c>Logging:Console:FormatterName = "logit"</c>): one line per
/// entry, UTC time, level, category and the request id, e.g.
/// <code>2026-11-12 15:59:13.458Z INFO  Logit.Requests req=76ac8caa85c1 POST /auth/login 401 590ms user=-</code>
/// Easy to read in <c>docker logs</c> and to grep by request id. ASP.NET Core's own scopes
/// (connection id and the like) are left out. Set the formatter name to "json" for structured
/// output instead (e.g. for CloudWatch queries); the request id is then a RequestId field.
/// </summary>
public sealed class LogitConsoleFormatter : ConsoleFormatter, IDisposable
{
    public const string FormatterName = "logit";

    private readonly IDisposable? _reload;
    private ConsoleFormatterOptions _options;

    public LogitConsoleFormatter(IOptionsMonitor<ConsoleFormatterOptions> options) : base(FormatterName)
    {
        _options = options.CurrentValue;
        _reload = options.OnChange(o => _options = o);
    }

    public override void Write<TState>(in LogEntry<TState> entry, IExternalScopeProvider? scopeProvider, TextWriter writer)
    {
        var message = entry.Formatter(entry.State, entry.Exception);
        if (message is null && entry.Exception is null) return;

        var now = _options.UseUtcTimestamp ? DateTime.UtcNow : DateTime.Now;
        writer.Write(now.ToString(_options.UseUtcTimestamp ? "yyyy-MM-dd HH:mm:ss.fff'Z' " : "yyyy-MM-dd HH:mm:ss.fff "));
        writer.Write(Level(entry.LogLevel));
        writer.Write(' ');
        writer.Write(entry.Category);

        string? requestId = null;
        scopeProvider?.ForEachScope((scope, _) =>
        {
            if (scope is IEnumerable<KeyValuePair<string, object?>> pairs)
                foreach (var (key, value) in pairs)
                    if (key == "RequestId" && value is string id) requestId = id;
        }, (object?)null);
        if (requestId is not null)
        {
            writer.Write(" req=");
            writer.Write(requestId);
        }

        if (!string.IsNullOrEmpty(message))
        {
            writer.Write(' ');
            // Keep one entry on one line.
            writer.Write(message.ReplaceLineEndings(" | "));
        }
        writer.WriteLine();

        if (entry.Exception is not null)
        {
            // Stack traces stay multi-line: indented so they read as part of the entry above.
            foreach (var line in entry.Exception.ToString().Split('\n'))
            {
                writer.Write("    ");
                writer.WriteLine(line.TrimEnd('\r'));
            }
        }
    }

    private static string Level(LogLevel level) => level switch
    {
        LogLevel.Trace => "TRACE",
        LogLevel.Debug => "DEBUG",
        LogLevel.Information => "INFO ",
        LogLevel.Warning => "WARN ",
        LogLevel.Error => "ERROR",
        LogLevel.Critical => "CRIT ",
        _ => "     ",
    };

    public void Dispose() => _reload?.Dispose();
}
