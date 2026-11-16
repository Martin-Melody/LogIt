namespace Logit.Api.Features.Sandbox;

/// Keeps a sample client's token (see SandboxEndpoints.Token) to what a coached client does:
/// syncing their own data and the client side of coaching. Social, plugins, billing, the
/// account and the sandbox itself answer 403, so a sample can't post, follow, pay or make
/// tokens for other samples, whatever the coach's app sends.
public static class SampleTokenGuard
{
    public static IApplicationBuilder UseSampleTokenGuard(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            if (context.User.HasClaim(SandboxEndpoints.SampleClaim, "1") && !Allowed(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { error = "Sample clients can't do that.", code = "sample_client" });
                return;
            }
            await next(context);
        });

    public static bool Allowed(HttpRequest request)
    {
        var path = request.Path.Value?.TrimEnd('/') ?? "";
        if (path.StartsWith("/coach/sandbox", StringComparison.OrdinalIgnoreCase)) return false;
        if (path.StartsWith("/sync/", StringComparison.OrdinalIgnoreCase)) return true;
        if (path.StartsWith("/coach/", StringComparison.OrdinalIgnoreCase)) return true;
        return HttpMethods.IsGet(request.Method) && path.Equals("/users/me", StringComparison.OrdinalIgnoreCase);
    }
}
