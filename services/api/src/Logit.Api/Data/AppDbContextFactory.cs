using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Logit.Api.Data;

/// <summary>
/// Explicit design-time factory for AppDbContext (SQLite) — without this, `dotnet ef` can end
/// up preferring the only other IDesignTimeDbContextFactory in the project
/// (PostgresAppDbContextFactory) even when --context AppDbContext is passed explicitly, since
/// PostgresAppDbContext derives from AppDbContext. Giving both contexts their own explicit
/// factory removes the ambiguity.
/// </summary>
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var builder = new DbContextOptionsBuilder<AppDbContext>();
        builder.UseSqlite("Data Source=logit_designtime.db");
        return new AppDbContext(builder.Options);
    }
}
