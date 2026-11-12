using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Logit.Api.Data;
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

app.Logger.LogInformation("Logit API starting ({Environment}, {Database}, self-hosted: {SelfHosted})",
    app.Environment.EnvironmentName,
    connectionString.StartsWith("Host=") || connectionString.StartsWith("postgres") ? "PostgreSQL" : "SQLite",
    app.Configuration.GetValue<bool>("Deployment:SelfHosted"));

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Outermost, so every request (errors included) gets one log line with its id. CORS sits
// outside the exception handler so a 500's body still reaches the browser app.
app.UseRequestLogging();
app.UseCors();
app.UseJsonExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapSocialEndpoints();
app.MapModerationEndpoints();
app.MapNotificationEndpoints();
app.MapAdminEndpoints(builder.Configuration);
app.MapSyncEndpoints();
app.MapBillingEndpoints();
app.MapCoachEndpoints();
app.MapDiagnosticsEndpoints();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");

app.Run();

public partial class Program; // for integration tests
