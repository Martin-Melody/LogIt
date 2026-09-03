using System.Text;
using Logit.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Features.Social;

/// Shared query building blocks for the social feature: block filtering and
/// opaque cursor pagination.
public static class SocialQueryHelpers
{
    /// User ids the caller can't see and can't be seen by — either direction of a block.
    public static async Task<List<Guid>> BlockedUserIdsAsync(this AppDbContext db, Guid callerId)
    {
        return await db.Blocks
            .Where(b => b.BlockerId == callerId || b.BlockedId == callerId)
            .Select(b => b.BlockerId == callerId ? b.BlockedId : b.BlockerId)
            .ToListAsync();
    }

    // Cursor = base64("<createdAt ticks>"). Tick precision (100ns) makes exact
    // ties between distinct rows vanishingly unlikely for a single user's feed
    // or notifications; a `<` comparison is enough and stays EF-translatable on
    // both SQLite and Postgres.
    public static string EncodeCursor(DateTime createdAt) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(createdAt.Ticks.ToString()));

    public static DateTime? DecodeCursor(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            var ticks = long.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(raw)));
            return new DateTime(ticks, DateTimeKind.Utc);
        }
        catch
        {
            return null;
        }
    }
}
