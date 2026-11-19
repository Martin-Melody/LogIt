namespace Logit.Api.Data.Entities;

/// A setting changed in the admin console that wins over the server's .env (e.g. who can sign up).
public class ServerSetting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// Server errors (5xx) per UTC day and route, for the admin console. Routes are endpoint
/// patterns ("POST /sync/sessions"), never raw paths, so no ids end up here.
public class ServerErrorCount
{
    public DateOnly Date { get; set; }
    public string Route { get; set; } = string.Empty;
    public int Count { get; set; }
}
