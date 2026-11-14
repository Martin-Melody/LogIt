using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Logit.Api.Data;
using Logit.Api.Features;
using Logit.Api.Features.Admin;
using Logit.Api.Features.Auth;
using Logit.Api.Features.Billing;
using Logit.Api.Features.Coach;
using Logit.Api.Features.Diagnostics;
using Logit.Api.Features.Email;
using Logit.Api.Features.Social;
using Logit.Api.Features.Sync;
using Logit.Api.Features.Users;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Logs carry our own RequestId scope (see RequestLogging); the default trace/span ids only
// lengthen every line. The console format ("logit", one line per entry; or "json") is set
// under Logging:Console in appsettings.json.
builder.Logging.Configure(o => o.ActivityTrackingOptions = ActivityTrackingOptions.None);
builder.Logging.AddConsoleFormatter<LogitConsoleFormatter, Microsoft.Extensions.Logging.Console.ConsoleFormatterOptions>();

// Serialize/deserialize all enums as strings so the frontend can use names like "Text" / "WorkoutSession"
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Database — SQLite for dev/self-hosted, PostgreSQL for production
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=logit.db";

if (connectionString.StartsWith("Host=") || connectionString.StartsWith("postgres"))
{
    // Postgres gets its own DbContext subclass so it has its own migration history — see
    // PostgresAppDbContext for why the SQLite-authored migrations can't be reused as-is.
    // Registering it under AppDbContext too keeps every existing `AppDbContext db` injection
    // site working unchanged regardless of which provider is active.
    builder.Services.AddDbContext<PostgresAppDbContext>(o => o.UseNpgsql(connectionString));
    builder.Services.AddScoped<AppDbContext>(sp => sp.GetRequiredService<PostgresAppDbContext>());
}
else
{
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connectionString));
}

// JWT auth
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret must be set.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "logit-api",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "logit-app",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Behind a reverse proxy (the hosted server runs behind Caddy and Cloudflare), every request
// arrives from the proxy's address. With Proxy:TrustForwardedHeaders on, the client address
// comes from X-Forwarded-For instead, so rate limits, the admin lockout and the request logs
// see real users. Only turn it on when the proxy is the only way to reach the API, or anyone
// can claim any address. The proxy must set the header itself, not pass on the client's.
var trustForwardedHeaders = builder.Configuration.GetValue<bool>("Proxy:TrustForwardedHeaders");
if (trustForwardedHeaders)
{
    builder.Services.Configure<ForwardedHeadersOptions>(o =>
    {
        o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        o.ForwardLimit = 1;
        // The proxy's address is not known in advance (a Docker network); the API is not
        // published, so whatever connects is the proxy.
        o.KnownNetworks.Clear();
        o.KnownProxies.Clear();
    });
}

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

// Basic abuse control on social writes (post/comment/follow/block/report):
// per-authenticated-user token bucket, falls back to per-IP for anonymous.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("social-write", ctx =>
    {
        var key = ctx.User.Identity?.IsAuthenticated == true
            ? ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "anon"
            : ctx.Connection.RemoteIpAddress?.ToString() ?? "anon";
        return RateLimitPartition.GetTokenBucketLimiter(key, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = 20,
            TokensPerPeriod = 20,
            ReplenishmentPeriod = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true,
        });
    });
    // Sign-ups: 10 per address per 10 minutes. Stops scripted account creation and
    // guessing invite codes on invite-only servers. Registration:SignupsPer10Minutes
    // overrides it (CI raises it: the E2E suite creates many accounts from one address).
    var signupLimit = Math.Max(1, builder.Configuration.GetValue("Registration:SignupsPer10Minutes", 10));
    o.AddPolicy(Registration.RateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = signupLimit,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
            }));
    // Diagnostics reports: a handful per user per hour is plenty.
    o.AddPolicy(DiagnosticsEndpoints.RateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
            }));
});

Stripe.StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

var app = builder.Build();

// Auto-migrate on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.Logger.LogInformation("Logit API starting ({Environment}, {Database}, self-hosted: {SelfHosted}, trust forwarded headers: {TrustForwarded})",
    app.Environment.EnvironmentName,
    connectionString.StartsWith("Host=") || connectionString.StartsWith("postgres") ? "PostgreSQL" : "SQLite",
    app.Configuration.GetValue<bool>("Deployment:SelfHosted"),
    trustForwardedHeaders);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (trustForwardedHeaders) app.UseForwardedHeaders();

// Outermost (after the client address is known), so every request (errors included) gets one
// log line with its id. CORS sits
// outside the exception handler so a 500's body still reaches the browser app.
app.UseRequestLogging();
app.UseCors();
app.UseJsonExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Every endpoint answers a body missing a required text field with a 400, not a 500.
var api = app.MapGroup("");
api.AddEndpointFilterFactory(RequiredFields.Factory);

api.MapAuthEndpoints();
api.MapUserEndpoints();
api.MapSocialEndpoints();
api.MapModerationEndpoints();
api.MapNotificationEndpoints();
api.MapAdminEndpoints(builder.Configuration, app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Logit.Admin"));
api.MapSyncEndpoints();
api.MapBillingEndpoints();
api.MapCoachEndpoints();
api.MapDiagnosticsEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");

app.Run();

public partial class Program; // for integration tests
