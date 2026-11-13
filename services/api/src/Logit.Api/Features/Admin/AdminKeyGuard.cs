using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace Logit.Api.Features.Admin;

/// <summary>
/// Protects the admin key against guessing: the key is compared in constant time, and an
/// address that sends too many wrong keys is locked out for a while (every request from it
/// gets 429, right key or not, so the lockout doesn't tell an attacker anything).
/// </summary>
/// <remarks>
/// The client address is the connection's remote address. Behind a reverse proxy that is the
/// proxy's address unless forwarded headers are configured, in which case a lockout would hit
/// everyone using that proxy (inconvenient, never a way in).
/// </remarks>
public sealed class AdminKeyGuard
{
    /// <summary>Wrong keys allowed from one address within <see cref="Window"/>.</summary>
    public const int MaxFailures = 10;

    /// <summary>How long failures are remembered, and how long a lockout lasts.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    /// <summary>Shorter keys still work, but the API warns about them at startup.</summary>
    public const int RecommendedMinKeyLength = 24;

    private sealed class Entry
    {
        public int Failures;
        public DateTime FirstFailureAt;
        public DateTime? LockedUntil;
    }

    private readonly ConcurrentDictionary<string, Entry> _entries = new();
    private readonly byte[] _keyHash;

    public AdminKeyGuard(string key)
    {
        _keyHash = Hash(key);
    }

    /// <summary>
    /// Constant-time comparison. Both sides are hashed first so the time taken doesn't depend
    /// on the key's length or on how many leading characters were right.
    /// </summary>
    public bool KeyMatches(string? provided) =>
        provided is not null && CryptographicOperations.FixedTimeEquals(Hash(provided), _keyHash);

    /// <summary>When the client's lockout ends, or null if it isn't locked out.</summary>
    public DateTime? LockedUntil(string client, DateTime now)
    {
        if (!_entries.TryGetValue(client, out var e)) return null;
        lock (e)
        {
            return e.LockedUntil is { } until && until > now ? until : null;
        }
    }

    /// <summary>Counts a wrong key. Returns true when this failure starts a lockout.</summary>
    public bool RecordFailure(string client, DateTime now)
    {
        if (_entries.Count > 10_000) Prune(now);
        var e = _entries.GetOrAdd(client, _ => new Entry { FirstFailureAt = now });
        lock (e)
        {
            if (now - e.FirstFailureAt > Window || (e.LockedUntil is { } ended && ended <= now))
            {
                e.Failures = 0;
                e.FirstFailureAt = now;
                e.LockedUntil = null;
            }
            e.Failures++;
            if (e.Failures >= MaxFailures && e.LockedUntil is null)
            {
                e.LockedUntil = now + Window;
                return true;
            }
            return false;
        }
    }

    /// <summary>Forgets addresses whose failures and lockouts have all expired.</summary>
    public void Prune(DateTime now)
    {
        foreach (var (client, e) in _entries)
        {
            bool expired;
            lock (e)
            {
                expired = now - e.FirstFailureAt > Window && (e.LockedUntil is null || e.LockedUntil <= now);
            }
            if (expired) _entries.TryRemove(client, out _);
        }
    }

    private static byte[] Hash(string s) => SHA256.HashData(Encoding.UTF8.GetBytes(s));
}
