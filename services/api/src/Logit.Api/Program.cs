using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Logit.Api.Data;
using Logit.Api.Features.Admin;
using Logit.Api.Features.Auth;
using Logit.Api.Features.Billing;
using Logit.Api.Features.Coach;
using Logit.Api.Features.Email;
using Logit.Api.Features.Social;
using Logit.Api.Features.Sync;
using Logit.Api.Features.Users;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

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
});

Stripe.StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

var app = builder.Build();

// Auto-migrate on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
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

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");

app.Run();

public partial class Program; // for integration tests
