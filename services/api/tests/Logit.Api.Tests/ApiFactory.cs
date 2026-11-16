using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Logit.Api.Tests;

/// The whole API in memory over HTTP, on its own SQLite file, for tests that go through the
/// real routes, filters and middleware (tier locks, the sample-token guard).
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"logit-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
        builder.UseSetting("Jwt:Secret", "test-secret-that-is-at-least-32-characters-long");
        builder.UseSetting("Registration:Mode", "Open");
        builder.UseSetting("Registration:SignupsPer10Minutes", "10000");
        builder.ConfigureServices(s => s.AddTransient<IStartupFilter, StreamBodyFilter>());
    }

    /// On a newer runtime than the app targets (this machine rolls a net8.0 build forward to .NET 10),
    /// System.Text.Json writes to the response through PipeWriter.UnflushedBytes, which the .NET 8
    /// TestServer's writer doesn't have. Putting a plain stream in front gives every request a
    /// writer that does. Harmless on .NET 8 (CI).
    private sealed class StreamBodyFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, nxt) =>
            {
                ctx.Response.Body = new PassThrough(ctx.Response.Body);
                await nxt(ctx);
            });
            next(app);
        };
    }

    private sealed class PassThrough(Stream inner) : Stream
    {
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => inner.Flush();
        public override Task FlushAsync(CancellationToken ct) => inner.FlushAsync(ct);
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => inner.Write(buffer, offset, count);
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken ct) => inner.WriteAsync(buffer, offset, count, ct);
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken ct = default) => inner.WriteAsync(buffer, ct);
    }

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// Signs up a new account and returns a client that sends its token.
    public async Task<(HttpClient Http, Guid Id, string Username)> SignUpAsync(string username, UserTier tier = UserTier.Free)
    {
        var http = CreateClient();
        var res = await http.PostAsJsonAsync("/auth/register", new
        {
            username, email = $"{username}@example.com", password = "Passw0rd!long", displayName = username,
        });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(Json);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        var id = body.GetProperty("user").GetProperty("id").GetGuid();
        if (tier != UserTier.Free) await SetTierAsync(id, tier);
        return (http, id, username);
    }

    public async Task SetTierAsync(Guid userId, UserTier tier)
    {
        await WithDbAsync(async db =>
        {
            var u = await db.Users.SingleAsync(x => x.Id == userId);
            u.ManualTier = tier == UserTier.Free ? null : tier;
            u.Tier = tier;
            await db.SaveChangesAsync();
        });
    }

    public HttpClient ClientWithToken(string token)
    {
        var http = CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http;
    }

    public async Task WithDbAsync(Func<AppDbContext, Task> work)
    {
        using var scope = Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> work)
    {
        using var scope = Services.CreateScope();
        return await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbPath); } catch { /* best effort */ }
    }
}
