using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Data;

/// <summary>
/// Same model as <see cref="AppDbContext"/>, used only so Postgres gets its own migration
/// history and model snapshot. EF migrations bake in provider-specific column type mappings
/// (e.g. bool -> INTEGER for SQLite vs a native boolean for Postgres), so the SQLite-authored
/// migrations under Migrations/Sqlite can't safely be replayed against Postgres — see
/// Migrations/Postgres for this context's own set.
/// </summary>
public class PostgresAppDbContext(DbContextOptions<PostgresAppDbContext> options) : AppDbContext(options);
