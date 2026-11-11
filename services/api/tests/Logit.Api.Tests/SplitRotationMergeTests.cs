using System.Text.Json;
using Logit.Api.Features.Sync;

namespace Logit.Api.Tests;

public class SplitRotationMergeTests
{
    private static Dictionary<string, (string Day, long At)> Read(string? json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json!)!
            .ToDictionary(kv => kv.Key, kv => (kv.Value.GetProperty("lastDayId").GetString()!, kv.Value.GetProperty("recordedAtMs").GetInt64()));

    [Fact]
    public void Keeps_the_newer_entry_per_split_from_either_side()
    {
        var stored = """{"a":{"lastDayId":"a2","recordedAtMs":200},"b":{"lastDayId":"b1","recordedAtMs":100}}""";
        var incoming = """{"a":{"lastDayId":"a1","recordedAtMs":100},"b":{"lastDayId":"b3","recordedAtMs":300},"c":{"lastDayId":"c1","recordedAtMs":50}}""";

        var merged = Read(SyncEndpoints.MergeSplitRotations(stored, incoming));

        Assert.Equal(("a2", 200L), merged["a"]); // a stale push doesn't rewind it
        Assert.Equal(("b3", 300L), merged["b"]);
        Assert.Equal(("c1", 50L), merged["c"]);
    }

    [Fact]
    public void Empty_or_unreadable_input_is_ignored()
    {
        Assert.Null(SyncEndpoints.MergeSplitRotations(null, null));
        Assert.Null(SyncEndpoints.MergeSplitRotations("", "not json"));
        var only = SyncEndpoints.MergeSplitRotations("not json", """{"a":{"lastDayId":"a1","recordedAtMs":1}}""");
        Assert.Equal(("a1", 1L), Read(only)["a"]);
    }
}
