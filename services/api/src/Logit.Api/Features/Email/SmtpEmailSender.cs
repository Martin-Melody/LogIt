using System.Net;
using System.Net.Mail;

namespace Logit.Api.Features.Email;

/// <summary>
/// Generic SMTP sender — deliberately not tied to any one provider. Self-hosters point it at
/// whatever relay they have (Gmail, Postfix, Mailgun's SMTP endpoint, ...); the cloud deployment
/// points it at AWS SES's SMTP interface. No vendor-specific SDK needed either way.
/// </summary>
public class SmtpEmailSender(IConfiguration config) : IEmailSender
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(config["Smtp:Host"]);

    public async Task SendAsync(string toAddress, string subject, string textBody)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("SMTP is not configured on this server.");

        var host = config["Smtp:Host"]!;
        var port = config.GetValue<int?>("Smtp:Port") ?? 587;
        var user = config["Smtp:User"];
        var password = config["Smtp:Password"];
        var from = config["Smtp:FromAddress"] ?? user ?? "no-reply@logit.ie";

        using var client = new SmtpClient(host, port) { EnableSsl = true };
        if (!string.IsNullOrWhiteSpace(user))
            client.Credentials = new NetworkCredential(user, password);

        using var message = new MailMessage(from, toAddress, subject, textBody);
        await client.SendMailAsync(message);
    }
}
