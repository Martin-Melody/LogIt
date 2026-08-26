using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Logit.Api.Data;

/// <summary>
/// Lets `dotnet ef migrations add --context PostgresAppDbContext` scaffold migrations without
/// needing the app's full DI setup or a live database — EF only needs to know the provider to
/// compute type mappings, it doesn't actually connect.
/// </summary>
public class PostgresAppDbContextFactory : IDesignTimeDbContextFactory<PostgresAppDbContext>
{
    public PostgresAppDbContext CreateDbContext(string[] args)
    {
        var builder = new DbContextOptionsBuilder<PostgresAppDbContext>();
        builder.UseNpgsql("Host=localhost;Database=logit_designtime");
        return new PostgresAppDbContext(builder.Options);
    }
}
