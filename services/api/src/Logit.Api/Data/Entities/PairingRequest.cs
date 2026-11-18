namespace Logit.Api.Data.Entities;

/// "Sign in on a computer": the web sign-in page asks for one of these and shows its code as a
/// QR; a phone that is already signed in scans it, shows where the request came from, and the
/// person approves or turns it down. Only hashes are stored: the code (in the QR) and the poll
/// secret (kept by the web page) are never written down, so reading the table gives nothing
/// that signs anyone in. See Features/Auth/PairingEndpoints.cs.
public class PairingRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// SHA-256 of the code in the QR, hex.
    public string CodeHash { get; set; } = string.Empty;
    /// SHA-256 of the secret only the asking web page holds, hex. Needed to collect the session.
    public string PollSecretHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    /// What the phone shows before approving: "Chrome on Windows".
    public string Device { get; set; } = string.Empty;
    public Guid? ApprovedUserId { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? DeniedAt { get; set; }
    /// Set when the web page collected its session; the request can't be used again.
    public DateTime? CollectedAt { get; set; }
}
