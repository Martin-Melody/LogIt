using System.Text;
using System.Text.Json.Serialization;
using Logit.Api.Data;
using Logit.Api.Features.Admin;
using Logit.Api.Features.Auth;
using Logit.Api.Features.Social;
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
    builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));
else
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(connectionString));

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
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

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

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapSocialEndpoints();
app.MapAdminEndpoints(builder.Configuration);

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).WithTags("Health");

app.Run();

public partial class Program; // for integration tests
