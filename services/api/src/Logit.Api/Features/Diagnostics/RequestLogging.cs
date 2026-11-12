using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Diagnostics;

namespace Logit.Api.Features.Diagnostics;

/// <summary>
/// One log line per request, tagged with a request id the app also records. The app sends
/// <c>X-Request-Id</c> with every call and keeps it in its own diagnostics log, so an entry a user
/// shows you ("POST /sync/sessions 500, requestId 3f9a…") can be found in the server log. A
/// request without a usable id gets a fresh one. The id is echoed back in the response header and
/// in the body of a 500.
/// </summary>
public static class RequestLogging
{
    public const string Header = "X-Request-Id";
    public const string Category = "Logit.Requests";

    /// Client-supplied ids are logged verbatim, so only short, plain ones are accepted.
    public static bool IsValidRequestId(string? id) =>
        !string.IsNullOrEmpty(id)
        && id.Length <= 64
        && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

    public static string NewRequestId() => Guid.NewGuid().ToString("N")[..12];

    /// Server errors are errors; client errors are warnings, except 401 (an expired access token
    /// is refreshed and retried as a matter of course) and 404, which are routine.
    public static LogLevel LevelFor(int status) => status switch
    {
        >= 500 => LogLevel.Error,
        401 or 404 => LogLevel.Information,
        >= 400 => LogLevel.Warning,
        _ => LogLevel.Information,
    };

    public static IApplicationBuilder UseRequestLogging(this IApplicationBuilder app)
    {
        var logger = app.ApplicationServices.GetRequiredService<ILoggerFactory>().CreateLogger(Category);

        return app.Use(async (ctx, next) =>
        {
            var incoming = ctx.Request.Headers[Header].FirstOrDefault();
            var requestId = IsValidRequestId(incoming) ? incoming! : NewRequestId();
            ctx.TraceIdentifier = requestId;
            ctx.Response.OnStarting(() =>
            {
                ctx.Response.Headers[Header] = requestId;
                return Task.CompletedTask;
            });

            var path = ctx.Request.Path.Value ?? "/";
            if (path == "/health")
            {
                await next(ctx);
                return;
            }

            // A message-template scope prints as "req=…" on the console and is a RequestId
            // field in the JSON formatter. Every log written during the request carries it.
            using var scope = logger.BeginScope("req={RequestId}", requestId);
            var sw = Stopwatch.StartNew();
            try
            {
                await next(ctx);
            }
            finally
            {
                sw.Stop();
                var status = ctx.Response.StatusCode;
                // ctx.User is filled in by the authentication middleware further in, so it's
                // known by now for any authenticated request.
                var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "-";
                logger.Log(LevelFor(status), "{Method} {Path} {Status} {ElapsedMs}ms user={UserId}",
                    ctx.Request.Method, path, status, sw.ElapsedMilliseconds, userId);
            }
        });
    }

    /// <summary>
    /// Unhandled exceptions become a JSON 500 carrying the request id, in the same
    /// <c>{ error }</c> shape as every other error response, so the app shows a message and logs
    /// the id. ASP.NET Core's exception handler middleware logs the exception itself (category
    /// Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware), inside the request's scope.
    /// </summary>
    public static IApplicationBuilder UseJsonExceptionHandler(this IApplicationBuilder app) =>
        app.UseExceptionHandler(errorApp => errorApp.Run(async ctx =>
        {
            var feature = ctx.Features.Get<IExceptionHandlerFeature>();
            // A client that went away mid-request isn't a server fault.
            var status = feature?.Error is OperationCanceledException && ctx.RequestAborted.IsCancellationRequested
                ? 499
                : StatusCodes.Status500InternalServerError;
            ctx.Response.StatusCode = status;
            await ctx.Response.WriteAsJsonAsync(new
            {
                error = $"Something went wrong on the server. Reference: {ctx.TraceIdentifier}",
                requestId = ctx.TraceIdentifier,
            });
        }));
}
