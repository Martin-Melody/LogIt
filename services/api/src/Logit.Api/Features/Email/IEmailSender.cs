namespace Logit.Api.Features.Email;

public interface IEmailSender
{
    /// <summary>Whether SMTP is configured on this deployment. Self-hosters without SMTP set
    /// up get a clear "not configured" response instead of a silent failure.</summary>
    bool IsConfigured { get; }

    Task SendAsync(string toAddress, string subject, string textBody);
}
