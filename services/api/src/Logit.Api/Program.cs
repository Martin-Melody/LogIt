using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Logit.Api.Data;
using Logit.Api.Features;
using Logit.Api.Features.Admin;
using Logit.Api.Features.Auth;
using Logit.Api.Features.Billing;
using Logit.Api.Features.Billing.GooglePlay;
using Logit.Api.Features.Coach;
using Logit.Api.Features.Diagnostics;
using Logit.Api.Features.Discover;
using Logit.Api.Features.Email;
using Logit.Api.Features.Plugins;
using Logit.Api.Features.Social;
using Logit.Api.Features.Sync;
using Logit.Api.Features.Users;
using Logit.Api.Features.Sandbox;
using Logit.Api.Features.Guide;
using Logit.Api.Features.Foods;
using Logit.Api.Features.Push;
using Logit.Api.Features.Photos;
using Logit.Api.Features.Voice;
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

// Billing. Subscriptions come from Google Play (and later the App Store); Stripe web checkout
// is off unless Billing:WebCheckout is set. GooglePlayApi is a singleton so its access token is cached.
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<Logit.Api.Features.Admin.AdminKeys>();
builder.Services.AddSingleton<Logit.Api.Features.Auth.LoginLockout>();
builder.Services.AddSingleton<Logit.Api.Features.Discover.DiscoverExperiment>();
builder.Services.AddScoped<Logit.Api.Features.Discover.DiscoverService>();
builder.Services.AddHttpClient("google-play", c => c.Timeout = TimeSpan.FromSeconds(20));
// Food search for the browser app (see FoodSearchEndpoints). Open Food Facts asks apps to
// identify themselves.
builder.Services.AddHttpClient(Logit.Api.Features.Foods.FoodSearchEndpoints.HttpClientName, c =>
{
    c.Timeout = TimeSpan.FromSeconds(8);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("LogIt/1.0 (https://getlogit.app)");
});
builder.Services.AddSingleton<Logit.Api.Features.Foods.FoodSearchCache>();
builder.Services.AddSingleton<IGooglePlayApi>(sp => new GooglePlayApi(
    sp.GetRequiredService<IHttpClientFactory>().CreateClient("google-play"),
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<GooglePlayApi>>()));
builder.Services.AddScoped<GooglePlayBilling>();
builder.Services.AddScoped<ISubscriptionRefresher>(sp => sp.GetRequiredService<GooglePlayBilling>());
builder.Services.AddHostedService<SubscriptionSweeper>();
// Coach payments: coaches' own Stripe accounts (Connect), see Features/Coach/Payments.
builder.Services.AddSingleton<Logit.Api.Features.Coach.Payments.ICoachStripe, Logit.Api.Features.Coach.Payments.CoachStripe>();
builder.Services.AddScoped<Logit.Api.Features.Coach.Payments.CoachPaymentService>();
builder.Services.AddScoped<Logit.Api.Features.Coach.CoachingEnd>();
builder.Services.AddHostedService<Logit.Api.Features.Coach.Payments.CoachPaymentSweeper>();
// Push notifications: Firebase with this server's own key, else (self-hosted) the relay through
// getlogit.app, which an admin turns on in the console.
builder.Services.AddHttpClient("push", c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSingleton(sp => new PushRelay(
    sp.GetRequiredService<IConfiguration>()["Push:RelayUrl"] is { Length: > 0 } url ? url : PushRelay.DefaultUrl));
builder.Services.AddSingleton<IPushSender>(sp =>
{
    var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient("push");
    var fcm = new FcmPushSender(http, sp.GetRequiredService<IConfiguration>(), sp.GetRequiredService<ILogger<FcmPushSender>>());
    return fcm.IsConfigured
        ? fcm
        : new RelayPushSender(http, sp.GetRequiredService<PushRelay>(), sp.GetRequiredService<ILogger<RelayPushSender>>());
});
builder.Services.AddHostedService<PushDispatcher>();
builder.Services.AddHostedService<Logit.Api.Features.Social.StorySweeper>();
builder.Services.AddHostedService<Logit.Api.Features.Social.EventReminderSweeper>();
// Photos: an S3-compatible bucket when Photos:S3:Bucket is set (Cloudflare R2 on getlogit.app),
// otherwise a folder on this server (Photos:Folder; docker-compose.yml puts it in /data/photos).
builder.Services.AddSingleton<IPhotoStore>(sp =>
{
    var c = sp.GetRequiredService<IConfiguration>();
    if (c["Photos:S3:Bucket"] is { Length: > 0 } bucket)
        return new S3PhotoStore(c["Photos:S3:ServiceUrl"]!, bucket, c["Photos:S3:AccessKey"]!, c["Photos:S3:SecretKey"]!);
    var folder = c["Photos:Folder"] is { Length: > 0 } f ? f : Path.Combine(builder.Environment.ContentRootPath, "photos");
    return new FolderPhotoStore(folder);
});
builder.Services.AddHostedService<PhotoSweeper>();
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
    // Signed-out reading of public group posts (getlogit.app renders them on Cloudflare, whose
    // requests share a few addresses; pages are cached there for 5 minutes): roomy, per address.
    o.AddPolicy("public-read", ctx => RateLimitPartition.GetTokenBucketLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new TokenBucketRateLimiterOptions { TokenLimit = 600, TokensPerPeriod = 600, ReplenishmentPeriod = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
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
    // Sign-ins: 30 per address per 10 minutes, right or wrong. Caps password guessing from one
    // address across accounts (LoginLockout covers one account). Auth:LoginsPer10Minutes
    // overrides it (CI raises it: the E2E suite signs in many times from one address).
    var loginLimit = Math.Max(1, builder.Configuration.GetValue("Auth:LoginsPer10Minutes", 30));
    o.AddPolicy(Registration.LoginRateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = loginLimit,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
            }));
    // Scan-to-sign-in: starting a request, and the phone looking one up or answering it.
    // 20 per address per 10 minutes. Polling (every 2 s for up to 2 min) has its own, looser
    // limit. Pairing:StartsPer10Minutes / Pairing:PollsPerMinute override them.
    var pairStartLimit = Math.Max(1, builder.Configuration.GetValue("Pairing:StartsPer10Minutes", 20));
    o.AddPolicy(Logit.Api.Features.Auth.PairingEndpoints.StartRateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = pairStartLimit,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0,
            }));
    var pairPollLimit = Math.Max(1, builder.Configuration.GetValue("Pairing:PollsPerMinute", 90));
    o.AddPolicy(Logit.Api.Features.Auth.PairingEndpoints.PollRateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = pairPollLimit,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    // Food search from the browser app: someone typing fires a search every few keystrokes,
    // so 60 a minute per address. FoodSearch:PerMinute overrides it.
    var foodSearchLimit = Math.Max(1, builder.Configuration.GetValue("FoodSearch:PerMinute", 60));
    o.AddPolicy(Logit.Api.Features.Foods.FoodSearchEndpoints.RateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = foodSearchLimit,
                Window = TimeSpan.FromMinutes(1),
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
    // Crash reports need no sign-in: 10 per phone (or address) per hour. The app sends at most
    // a few per session, so this only stops a crash loop or someone posting junk.
    o.AddPolicy(DiagnosticsEndpoints.CrashRateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            DiagnosticsEndpoints.DeviceIdOf(ctx) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
            }));
    // 60 photos an hour per person: plenty for posting, not enough to fill a disk.
    o.AddPolicy(PhotoEndpoints.UploadRateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("Photos:UploadsPerHour", 60),
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
            }));
    // One self-hosted server relays for all its users, so this is per server, and generous.
    o.AddPolicy(PushEndpoints.RelayRateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 600,
                Window = TimeSpan.FromMinutes(10),
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
    app.Services.GetRequiredService<PushRelay>().On =
        (await db.ServerSettings.FindAsync(PushRelay.SettingKey))?.Value == "on";
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
app.UseSampleTokenGuard();
app.UseRateLimiter();

// Every endpoint answers a body missing a required text field with a 400, not a 500.
var api = app.MapGroup("");
api.AddEndpointFilterFactory(RequiredFields.Factory);

api.MapAuthEndpoints();
api.MapUserEndpoints();
api.MapSocialEndpoints();
api.MapModerationEndpoints();
api.MapNotificationEndpoints();
api.MapSocialSettingsEndpoints();
api.MapDiscoverEndpoints();
api.MapAdminEndpoints(builder.Configuration, app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Logit.Admin"));
api.MapSyncEndpoints();
api.MapBillingEndpoints();
api.MapCoachEndpoints();
api.MapCoachProfileEndpoints();
api.MapCoachRequestEndpoints();
api.MapRequestEmailEndpoints();
api.MapCoachEndingEndpoints();
Logit.Api.Features.Coach.Payments.CoachPaymentManageEndpoints.MapCoachPaymentManageEndpoints(api);
Logit.Api.Features.Coach.CoachAway.MapCoachAwayEndpoints(api);
api.MapDiagnosticsEndpoints();
api.MapPluginEndpoints();
api.MapSandboxEndpoints();
api.MapGuideEndpoints();
api.MapFoodSearchEndpoints();
api.MapPushEndpoints();
api.MapTrainingEndpoints();
api.MapFriendInviteEndpoints();
api.MapDirectMessageEndpoints();
api.MapStoryEndpoints();
api.MapGroupEndpoints();
api.MapEventEndpoints();
api.MapBoardEndpoints();
api.MapGroupPostEndpoints();
api.MapTagEndpoints();
api.MapPublicSocialEndpoints();
api.MapPublicProfileEndpoints();
api.MapPhotoEndpoints();
api.MapVoiceEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");

app.Run();

public partial class Program; // for integration tests
