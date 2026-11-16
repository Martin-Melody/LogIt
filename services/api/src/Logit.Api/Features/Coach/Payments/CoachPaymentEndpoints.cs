using System.Security.Claims;
using Logit.Api.Data;
using Logit.Api.Data.Entities;
using Logit.Api.Features.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace Logit.Api.Features.Coach.Payments;

/// Coach payments: a coach connects Stripe, makes packages, puts one on an invite link, and
/// people who open the link pay on the web before coaching starts. Nothing here is reachable
/// as a purchase from the app: the app only reads the status (Google Play rules).
public static class CoachPaymentEndpoints
{
    public static void Map(RouteGroupBuilder group)
    {
        group.MapGet("/payments", Overview).RequireTier(UserTier.Studio);
        group.MapPost("/payments/connect", Connect).RequireTier(UserTier.Studio);
        group.MapPost("/payments/refresh", Refresh).RequireTier(UserTier.Studio);
        group.MapPut("/payments/settings", PutSettings).RequireTier(UserTier.Studio);
        group.MapPost("/payments/packages", CreatePackage).RequireTier(UserTier.Studio);
        group.MapPut("/payments/packages/{packageId:guid}", UpdatePackage).RequireTier(UserTier.Studio);
        group.MapPut("/links/{linkId:guid}/package", SetLinkPackage).RequireTier(UserTier.Studio);
        group.MapPut("/payments/clients/{relationshipId:guid}/rule", PutClientRule).RequireTier(UserTier.Studio);
        group.MapPost("/payments/clients/{relationshipId:guid}/paid-elsewhere", PaidElsewhere).RequireTier(UserTier.Studio);
        group.MapPost("/payments/clients/{relationshipId:guid}/stop", CoachStop).RequireTier(UserTier.Studio);

        // Anyone signed in (a Free account can be coached).
        group.MapPost("/links/code/{code}/checkout", StartCheckout);
        group.MapPost("/payments/checkout/confirm", ConfirmCheckout);
        group.MapPost("/payments/mine/{relationshipId:guid}/stop", ClientStop);
    }

    /// Stripe sends events from coaches' accounts here (a Connect webhook endpoint).
    public static void MapWebhook(IEndpointRouteBuilder app) =>
        app.MapPost("/coach/payments/webhook", Webhook).WithTags("Coach");

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = message, code }, statusCode: status);

    // ── DTOs ─────────────────────────────────────────────────────────────────

    private static object AccountDto(CoachPaymentAccount? a) => a is null ? new
    {
        connected = false, ready = false, requirementsDue = false,
        displayName = (string?)null, currency = "eur", country = "ie",
    } : new
    {
        connected = a.StripeAccountId is not null,
        ready = a.CardPaymentsActive,
        requirementsDue = a.RequirementsDue,
        displayName = a.DisplayName,
        currency = a.Currency,
        country = a.Country,
    };

    private static object SettingsDto(CoachPaymentAccount? a) => new
    {
        failRule = a?.FailRule ?? PaymentRules.Pause,
        failDays = a?.FailDays ?? PaymentRules.DefaultDays,
        emailOnFail = a?.EmailOnFail ?? true,
        showClientNote = a?.ShowClientNote ?? true,
    };

    private static object PackageDto(CoachPackage p, IEnumerable<string> links, int clients) => new
    {
        id = p.Id,
        name = p.Name,
        description = p.Description,
        amountCents = p.AmountCents,
        currency = p.Currency,
        interval = p.Interval,
        weeks = p.Weeks,
        hidden = p.Hidden,
        links,
        clients,
    };

    /// What a client is told about paying their coach (My coach, web and app). No price.
    public static object? ClientPaymentDto(CoachClientPayment? p, CoachPaymentAccount? a)
    {
        if (p is null) return null;
        var (rule, _) = CoachPaymentService.EffectiveRule(p, a);
        return new
        {
            mode = p.Mode,
            packageName = p.PackageName,
            interval = p.Interval,
            state = p.State,
            paidUntil = p.PaidUntil,
            unpaidSince = p.UnpaidSince,
            stopsAtPeriodEnd = p.StopsAtPeriodEnd,
            rule = p.Mode == PaymentModes.Stripe ? rule : PaymentRules.Keep,
            actionAt = CoachPaymentService.ActionAt(p, a),
            showNote = a?.ShowClientNote ?? true,
            canStop = p is { Mode: PaymentModes.Stripe, Interval: PaymentIntervals.Month, StripeSubscriptionId: not null }
                && p.State != PaymentStates.Ended,
        };
    }

    // ── Coach: overview ──────────────────────────────────────────────────────

    private static async Task<IResult> Overview(
        ClaimsPrincipal caller, AppDbContext db, ICoachStripe stripe, TimeProvider clock, ILoggerFactory lf, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var account = await db.CoachPaymentAccounts.FirstOrDefaultAsync(a => a.CoachId == coachId, ct);
        // Onboarding happens on Stripe's pages; look again until the account is ready.
        if (account is { StripeAccountId: not null, CardPaymentsActive: false } && stripe.Configured)
            await TryRefresh(db, stripe, account, now, lf.CreateLogger("Logit.CoachPayments"), ct);

        var packages = await db.CoachPackages.AsNoTracking()
            .Where(p => p.CoachId == coachId).OrderBy(p => p.Hidden).ThenBy(p => p.CreatedAt).ToListAsync(ct);
        var links = await db.CoachInviteLinks.AsNoTracking()
            .Where(l => l.CoachId == coachId && l.PackageId != null && l.RevokedAt == null)
            .Select(l => new { l.PackageId, l.Name }).ToListAsync(ct);

        var rels = await db.CoachClientRelationships.AsNoTracking()
            .Include(r => r.Client).Include(r => r.Payment)
            // Sandbox sample clients never pay and never show in Payments.
            .Where(r => r.CoachId == coachId && !r.Client.IsSample && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused))
            .OrderBy(r => r.Client.Username)
            .ToListAsync(ct);

        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var receipts = await db.CoachPaymentReceipts.AsNoTracking()
            .Where(r => r.CoachId == coachId && r.PaidAt >= monthStart)
            .Select(r => new { r.AmountCents, r.Currency }).ToListAsync(ct);
        var currency = account?.Currency ?? "eur";

        var clients = rels.Select(r =>
        {
            var p = r.Payment;
            var (rule, days) = p is null
                ? (account?.FailRule ?? PaymentRules.Pause, account?.FailDays ?? PaymentRules.DefaultDays)
                : CoachPaymentService.EffectiveRule(p, account);
            return new
            {
                relationshipId = r.Id,
                client = r.Client.ToProfileDto(false),
                status = r.Status == CoachClientStatus.Paused ? "paused" : "active",
                since = r.UpdatedAt,
                mode = p?.Mode ?? "none",
                packageName = p?.PackageName,
                amountCents = p?.AmountCents,
                currency = p?.Currency,
                interval = p?.Interval,
                state = p?.State,
                paidUntil = p?.PaidUntil,
                unpaidSince = p?.UnpaidSince,
                stopsAtPeriodEnd = p?.StopsAtPeriodEnd ?? false,
                ownRule = p?.FailRule,
                ownDays = p?.FailDays,
                rule,
                days,
                actionAt = p is null ? null : CoachPaymentService.ActionAt(p, account),
            };
        }).ToList();

        return Results.Ok(new
        {
            configured = stripe.Configured,
            account = AccountDto(account),
            settings = SettingsDto(account),
            packages = packages.Select(p => PackageDto(p,
                links.Where(l => l.PackageId == p.Id).Select(l => l.Name),
                rels.Count(r => r.Payment?.PackageId == p.Id && r.Payment.Mode == PaymentModes.Stripe && r.Payment.State != PaymentStates.Ended))),
            clients,
            summary = new
            {
                currency,
                monthCents = receipts.Where(r => r.Currency == currency).Sum(r => r.AmountCents),
                monthCount = receipts.Count,
                paying = clients.Count(c => c.mode == PaymentModes.Stripe && c.state != PaymentStates.Ended),
                elsewhere = clients.Count(c => c.mode == PaymentModes.Elsewhere),
                problems = clients.Count(c => c.status == "paused" || c.unpaidSince is not null
                    || (c.mode == PaymentModes.Elsewhere && c.paidUntil <= now)),
            },
        });
    }

    private static async Task TryRefresh(AppDbContext db, ICoachStripe stripe, CoachPaymentAccount a, DateTime now, ILogger log, CancellationToken ct)
    {
        try
        {
            var s = await stripe.GetAccountAsync(a.StripeAccountId!, ct);
            a.CardPaymentsActive = s.CardPaymentsActive;
            a.RequirementsDue = s.RequirementsDue;
            a.DisplayName = s.DisplayName ?? a.DisplayName;
            if (s.Currency is { Length: 3 } c) a.Currency = c.ToLowerInvariant();
            a.StatusCheckedAt = now;
            a.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is StripeException or HttpRequestException)
        {
            log.LogWarning("Couldn't read Stripe account {Account}: {Reason}", a.StripeAccountId, ex.Message);
        }
    }

    // ── Coach: connect Stripe ────────────────────────────────────────────────

    /// Countries a coach can pick, and the currency their packages are priced in.
    public static readonly IReadOnlyDictionary<string, string> Countries = new Dictionary<string, string>
    {
        ["ie"] = "eur", ["gb"] = "gbp", ["us"] = "usd", ["ca"] = "cad", ["au"] = "aud", ["nz"] = "nzd",
        ["de"] = "eur", ["fr"] = "eur", ["es"] = "eur", ["it"] = "eur", ["nl"] = "eur", ["be"] = "eur",
        ["pt"] = "eur", ["at"] = "eur", ["fi"] = "eur", ["se"] = "sek", ["dk"] = "dkk", ["no"] = "nok",
    };

    private static async Task<IResult> Connect(
        [FromBody] ConnectRequest req, ClaimsPrincipal caller, AppDbContext db, ICoachStripe stripe,
        TimeProvider clock, ILoggerFactory lf, CancellationToken ct)
    {
        if (!stripe.Configured) return Error(503, "payments_not_configured", "Payments aren't set up on this server.");
        if (string.IsNullOrWhiteSpace(req.ReturnUrl) || string.IsNullOrWhiteSpace(req.RefreshUrl))
            return Results.BadRequest(new { error = "returnUrl and refreshUrl are required." });

        var coachId = caller.GetUserId();
        var coach = await db.Users.FirstAsync(u => u.Id == coachId, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        var account = await db.CoachPaymentAccounts.FirstOrDefaultAsync(a => a.CoachId == coachId, ct);
        var log = lf.CreateLogger("Logit.CoachPayments");
        try
        {
            if (account?.StripeAccountId is null)
            {
                var country = (req.Country ?? "ie").Trim().ToLowerInvariant();
                if (!Countries.TryGetValue(country, out var currency))
                    return Results.BadRequest(new { error = "Pick a country from the list." });
                var name = string.IsNullOrWhiteSpace(coach.DisplayName) ? coach.Username : coach.DisplayName;
                var id = await stripe.CreateAccountAsync(coach.Email, name, country, ct);
                if (account is null)
                {
                    account = new CoachPaymentAccount { CoachId = coachId, CreatedAt = now };
                    db.CoachPaymentAccounts.Add(account);
                }
                account.StripeAccountId = id;
                account.Country = country;
                account.Currency = currency;
                account.DisplayName = name;
                account.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
                log.LogInformation("Coach {CoachId} created Stripe account {Account}", coachId, id);
            }
            var url = await stripe.OnboardingLinkAsync(account.StripeAccountId!, req.ReturnUrl, req.RefreshUrl, ct);
            return Results.Ok(new { url });
        }
        catch (StripeException ex)
        {
            log.LogWarning("Stripe connect failed for coach {CoachId}: {Reason}", coachId, ex.Message);
            return Error(502, "stripe_error", "Stripe didn't accept that: " + ex.Message);
        }
    }

    private static async Task<IResult> Refresh(
        ClaimsPrincipal caller, AppDbContext db, ICoachStripe stripe, TimeProvider clock, ILoggerFactory lf, CancellationToken ct)
    {
        var account = await db.CoachPaymentAccounts.FirstOrDefaultAsync(a => a.CoachId == caller.GetUserId(), ct);
        if (account?.StripeAccountId is null) return Results.Ok(AccountDto(account));
        await TryRefresh(db, stripe, account, clock.GetUtcNow().UtcDateTime, lf.CreateLogger("Logit.CoachPayments"), ct);
        return Results.Ok(AccountDto(account));
    }

    private static async Task<IResult> PutSettings(
        [FromBody] PaymentSettingsRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (!PaymentRules.IsValid(req.FailRule)) return Results.BadRequest(new { error = "failRule must be keep, pause or end." });
        if (req.FailDays is < 1 or > PaymentRules.MaxDays)
            return Results.BadRequest(new { error = $"Days must be 1 to {PaymentRules.MaxDays}." });
        var coachId = caller.GetUserId();
        var now = clock.GetUtcNow().UtcDateTime;
        var a = await db.CoachPaymentAccounts.FirstOrDefaultAsync(x => x.CoachId == coachId, ct);
        if (a is null)
        {
            a = new CoachPaymentAccount { CoachId = coachId, CreatedAt = now };
            db.CoachPaymentAccounts.Add(a);
        }
        a.FailRule = req.FailRule!;
        a.FailDays = req.FailDays;
        a.EmailOnFail = req.EmailOnFail;
        a.ShowClientNote = req.ShowClientNote;
        a.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return Results.Ok(SettingsDto(a));
    }

    // ── Coach: packages ──────────────────────────────────────────────────────

    private static string? ValidatePackage(PackageRequest req)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) return "Give the package a name.";
        if (name.Length > PaymentLimits.MaxNameChars) return $"Keep the name under {PaymentLimits.MaxNameChars} characters.";
        if ((req.Description ?? "").Length > PaymentLimits.MaxDescriptionChars)
            return $"Keep the description under {PaymentLimits.MaxDescriptionChars} characters.";
        if (req.AmountCents is < PaymentLimits.MinAmountCents or > PaymentLimits.MaxAmountCents)
            return "The price must be between 1 and 10,000.";
        if (req.Interval is not (PaymentIntervals.Month or PaymentIntervals.Once)) return "interval must be month or once.";
        if (req.Interval == PaymentIntervals.Once && req.Weeks is not (>= 1 and <= PaymentLimits.MaxWeeks))
            return $"A one-off package lasts 1 to {PaymentLimits.MaxWeeks} weeks.";
        return null;
    }

    private static async Task<IResult> CreatePackage(
        [FromBody] PackageRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (ValidatePackage(req) is { } err) return Results.BadRequest(new { error = err });
        var coachId = caller.GetUserId();
        if (await db.CoachPackages.CountAsync(p => p.CoachId == coachId, ct) >= PaymentLimits.MaxPackages)
            return Results.BadRequest(new { error = $"You can have up to {PaymentLimits.MaxPackages} packages." });
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == coachId, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        var p = new CoachPackage { CoachId = coachId, Currency = account?.Currency ?? "eur", CreatedAt = now };
        Apply(p, req, now);
        db.CoachPackages.Add(p);
        await db.SaveChangesAsync(ct);
        return Results.Ok(PackageDto(p, [], 0));
    }

    private static async Task<IResult> UpdatePackage(
        Guid packageId, [FromBody] PackageRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (ValidatePackage(req) is { } err) return Results.BadRequest(new { error = err });
        var coachId = caller.GetUserId();
        var p = await db.CoachPackages.FirstOrDefaultAsync(x => x.Id == packageId && x.CoachId == coachId, ct);
        if (p is null) return Results.NotFound();
        Apply(p, req, clock.GetUtcNow().UtcDateTime);
        if (p.Hidden)
        {
            // A hidden package comes off its links; clients already on it keep paying.
            await db.CoachInviteLinks.Where(l => l.PackageId == p.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.PackageId, (Guid?)null), ct);
        }
        await db.SaveChangesAsync(ct);
        return Results.Ok(PackageDto(p, [], 0));
    }

    private static void Apply(CoachPackage p, PackageRequest req, DateTime now)
    {
        p.Name = req.Name!.Trim();
        p.Description = (req.Description ?? "").Trim();
        p.AmountCents = req.AmountCents;
        p.Interval = req.Interval!;
        p.Weeks = req.Interval == PaymentIntervals.Once ? req.Weeks : null;
        p.Hidden = req.Hidden;
        p.UpdatedAt = now;
    }

    private static async Task<IResult> SetLinkPackage(
        Guid linkId, [FromBody] LinkPackageRequest req, ClaimsPrincipal caller, AppDbContext db, CancellationToken ct)
    {
        var coachId = caller.GetUserId();
        var link = await db.CoachInviteLinks.FirstOrDefaultAsync(l => l.Id == linkId && l.CoachId == coachId, ct);
        if (link is null) return Results.NotFound();
        if (await CheckPackageForLink(db, coachId, req.PackageId, ct) is { } err) return err;
        link.PackageId = req.PackageId;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// Null when the package can go on a link (or none is given), else the error to answer.
    public static async Task<IResult?> CheckPackageForLink(AppDbContext db, Guid coachId, Guid? packageId, CancellationToken ct)
    {
        if (packageId is null) return null;
        var package = await db.CoachPackages.AsNoTracking().FirstOrDefaultAsync(p => p.Id == packageId && p.CoachId == coachId, ct);
        if (package is null || package.Hidden) return Results.BadRequest(new { error = "That package doesn't exist or is hidden." });
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == coachId, ct);
        if (account is not { CardPaymentsActive: true })
            return Error(409, "payments_not_ready", "Finish connecting Stripe before putting a package on a link.");
        return null;
    }

    // ── Coach: one client ────────────────────────────────────────────────────

    private static Task<CoachClientRelationship?> CoachRel(AppDbContext db, Guid relId, Guid coachId, CancellationToken ct) =>
        db.CoachClientRelationships.Include(r => r.Payment)
            .FirstOrDefaultAsync(r => r.Id == relId && r.CoachId == coachId && !r.Client.IsSample
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused), ct);

    private static async Task<IResult> PutClientRule(
        Guid relationshipId, [FromBody] ClientRuleRequest req, ClaimsPrincipal caller, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        if (req.Rule is not null && !PaymentRules.IsValid(req.Rule))
            return Results.BadRequest(new { error = "rule must be keep, pause, end or null." });
        if (req.Days is < 1 or > PaymentRules.MaxDays)
            return Results.BadRequest(new { error = $"Days must be 1 to {PaymentRules.MaxDays}." });
        var rel = await CoachRel(db, relationshipId, caller.GetUserId(), ct);
        if (rel?.Payment is not { } p) return Results.NotFound();
        p.FailRule = req.Rule;
        p.FailDays = req.Rule is null ? null : req.Days;
        p.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        // "Keep coaching" on a client the rule already paused brings them back.
        if (req.Rule == PaymentRules.Keep && rel.Status == CoachClientStatus.Paused && p.PausedForPayment)
        {
            rel.Status = CoachClientStatus.Active;
            p.PausedForPayment = false;
        }
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> PaidElsewhere(
        Guid relationshipId, [FromBody] PaidElsewhereRequest req, ClaimsPrincipal caller, AppDbContext db,
        CoachPaymentService payments, TimeProvider clock, CancellationToken ct)
    {
        var rel = await CoachRel(db, relationshipId, caller.GetUserId(), ct);
        if (rel is null) return Results.NotFound();
        var until = req.Until is { } d ? DateTime.SpecifyKind(d.ToDateTime(new TimeOnly(23, 59)), DateTimeKind.Utc) : (DateTime?)null;
        await payments.MarkPaidElsewhereAsync(rel, until, clock.GetUtcNow().UtcDateTime, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> CoachStop(
        Guid relationshipId, [FromBody] StopRequest req, ClaimsPrincipal caller, AppDbContext db,
        CoachPaymentService payments, TimeProvider clock, CancellationToken ct)
    {
        var rel = await CoachRel(db, relationshipId, caller.GetUserId(), ct);
        if (rel is null) return Results.NotFound();
        return await Stop(payments, rel, req.Stop, clock, ct);
    }

    private static async Task<IResult> ClientStop(
        Guid relationshipId, [FromBody] StopRequest req, ClaimsPrincipal caller, AppDbContext db,
        CoachPaymentService payments, TimeProvider clock, CancellationToken ct)
    {
        var me = caller.GetUserId();
        var rel = await db.CoachClientRelationships.Include(r => r.Payment)
            .FirstOrDefaultAsync(r => r.Id == relationshipId && r.ClientId == me
                && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Paused), ct);
        if (rel is null) return Results.NotFound();
        return await Stop(payments, rel, req.Stop, clock, ct);
    }

    private static async Task<IResult> Stop(CoachPaymentService payments, CoachClientRelationship rel, bool stop, TimeProvider clock, CancellationToken ct)
    {
        try
        {
            if (!await payments.SetStopAtPeriodEndAsync(rel, stop, clock.GetUtcNow().UtcDateTime, ct))
                return Error(409, "no_plan", "There's no monthly plan running to stop.");
        }
        catch (StripeException ex)
        {
            return Error(502, "stripe_error", "Stripe didn't accept that: " + ex.Message);
        }
        return Results.Ok(new { stopsAtPeriodEnd = stop, paidUntil = rel.Payment!.PaidUntil });
    }

    // ── Client: pay through a link ───────────────────────────────────────────

    private static async Task<IResult> StartCheckout(
        string code, [FromBody] StartCheckoutRequest req, ClaimsPrincipal caller, AppDbContext db,
        ICoachStripe stripe, ILoggerFactory lf, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.SuccessUrl) || string.IsNullOrWhiteSpace(req.CancelUrl))
            return Results.BadRequest(new { error = "successUrl and cancelUrl are required." });
        var normalized = Registration.Normalize(code);
        var link = normalized is null ? null : await db.CoachInviteLinks
            .Include(l => l.Coach).Include(l => l.Package)
            .FirstOrDefaultAsync(l => l.Code == normalized, ct);
        if (link is null) return Results.NotFound(new { error = "That link doesn't exist." });

        var me = caller.GetUserId();
        if (link.CoachId == me) return Results.BadRequest(new { error = "This is your own link." });
        if (link.Package is not { Hidden: false } package)
            return Results.BadRequest(new { error = "This link is free: send a request instead.", code = "no_package" });

        var state = await LinkStateFor(db, link, ct);
        if (state != "active")
            return Error(StatusCodes.Status410Gone, state, "This link can't be used any more. Ask your coach for a new one.");

        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == link.CoachId, ct);
        if (!stripe.Configured || account is not { CardPaymentsActive: true, StripeAccountId: not null })
            return Error(409, "payments_not_ready", "This coach can't take payments right now. Let them know.");

        var existing = await db.CoachClientRelationships.AsNoTracking().Include(r => r.Payment)
            .FirstOrDefaultAsync(r => r.CoachId == link.CoachId && r.ClientId == me, ct);
        if (existing is { Status: CoachClientStatus.Active, Payment: { Mode: PaymentModes.Stripe } p } && p.State != PaymentStates.Ended)
            return Error(409, "already_paying", "You already pay this coach. Manage it in My coach.");

        var client = await db.Users.AsNoTracking().FirstAsync(u => u.Id == me, ct);
        var meta = new CheckoutMeta(link.CoachId, me, link.Id, package.Id, req.Sharing ?? SharingDto.All);
        var successUrl = req.SuccessUrl + (req.SuccessUrl.Contains('?') ? "&" : "?") + "session_id={CHECKOUT_SESSION_ID}";
        try
        {
            var start = await stripe.CreateCheckoutAsync(new CheckoutStartRequest(
                account.StripeAccountId!,
                Monthly: package.Interval == PaymentIntervals.Month,
                Currency: package.Currency,
                AmountCents: package.AmountCents,
                ProductName: package.Name,
                Description: package.Description,
                CustomerEmail: string.IsNullOrWhiteSpace(client.Email) ? null : client.Email,
                ClientReferenceId: me.ToString(),
                Metadata: meta.ToMetadata(),
                SuccessUrl: successUrl,
                CancelUrl: req.CancelUrl), ct);
            return Results.Ok(new { url = start.Url });
        }
        catch (StripeException ex)
        {
            lf.CreateLogger("Logit.CoachPayments").LogWarning("Checkout for link {Link} failed: {Reason}", link.Id, ex.Message);
            return Error(502, "stripe_error", "Couldn't start the payment. Try again in a minute.");
        }
    }

    public static async Task<string> LinkStateFor(AppDbContext db, CoachInviteLink link, CancellationToken ct)
    {
        if (link.Coach.Tier != UserTier.Studio) return "off";
        var used = await db.CoachClientRelationships.CountAsync(r => r.InviteLinkId == link.Id
            && (r.Status == CoachClientStatus.Active || r.Status == CoachClientStatus.Pending), ct);
        return CoachLinkEndpoints.LinkState(link, used, DateTime.UtcNow);
    }

    /// The payment page lands here after Stripe. Starts coaching straight away rather than
    /// waiting for the webhook (both are safe to run).
    private static async Task<IResult> ConfirmCheckout(
        [FromBody] ConfirmCheckoutRequest req, ClaimsPrincipal caller, AppDbContext db, ICoachStripe stripe,
        CoachPaymentService payments, TimeProvider clock, ILoggerFactory lf, CancellationToken ct)
    {
        var normalized = Registration.Normalize(req.Code ?? "");
        var link = normalized is null ? null : await db.CoachInviteLinks.AsNoTracking()
            .FirstOrDefaultAsync(l => l.Code == normalized, ct);
        if (link is null || string.IsNullOrWhiteSpace(req.SessionId)) return Results.NotFound();
        var account = await db.CoachPaymentAccounts.AsNoTracking().FirstOrDefaultAsync(a => a.CoachId == link.CoachId, ct);
        if (account?.StripeAccountId is null || !stripe.Configured) return Results.NotFound();

        CheckoutInfo info;
        try { info = await stripe.GetCheckoutAsync(account.StripeAccountId, req.SessionId, ct); }
        catch (StripeException ex)
        {
            lf.CreateLogger("Logit.CoachPayments").LogWarning("Couldn't read checkout {Session}: {Reason}", req.SessionId, ex.Message);
            return Results.NotFound();
        }
        if (CheckoutMeta.From(info.Metadata) is not { } meta || meta.ClientId != caller.GetUserId()) return Results.NotFound();
        if (!info.Paid) return Results.Ok(new { status = "pending" });

        var rel = await payments.FulfillCheckoutAsync(account.StripeAccountId, info, clock.GetUtcNow().UtcDateTime, ct);
        return rel is null ? Results.Ok(new { status = "pending" }) : Results.Ok(new { status = "active", relationshipId = rel.Id });
    }

    // ── Stripe webhook (Connect events) ──────────────────────────────────────

    private static async Task<IResult> Webhook(
        HttpRequest request, IConfiguration config, CoachPaymentService payments, TimeProvider clock,
        ILoggerFactory lf, CancellationToken ct)
    {
        var log = lf.CreateLogger("Logit.CoachPayments");
        var secret = config["Stripe:ConnectWebhookSecret"];
        if (string.IsNullOrEmpty(secret)) return Results.NotFound();

        using var reader = new StreamReader(request.Body);
        var json = await reader.ReadToEndAsync(ct);
        Event ev;
        try
        {
            ev = EventUtility.ConstructEvent(json, request.Headers["Stripe-Signature"], secret, throwOnApiVersionMismatch: false);
        }
        catch (Exception ex)
        {
            log.LogWarning("Connect webhook rejected: {Reason}", ex.Message);
            return Results.BadRequest();
        }
        if (string.IsNullOrEmpty(ev.Account)) return Results.Ok(); // the platform's own events
        log.LogInformation("Connect webhook {Type} ({Id}) from {Account}", ev.Type, ev.Id, ev.Account);
        var now = clock.GetUtcNow().UtcDateTime;

        switch (ev.Type)
        {
            case "checkout.session.completed" or "checkout.session.async_payment_succeeded":
                if (ev.Data.Object is Session s)
                    await payments.FulfillCheckoutAsync(ev.Account, CoachStripe.FromSession(s), now, ct);
                break;
            case "invoice.paid":
                if (ev.Data.Object is Invoice paid && SubscriptionOf(paid) is { } paidSub)
                    await payments.InvoicePaidAsync(ev.Account, paidSub, paid.Id, paid.AmountPaid, paid.Currency,
                        paid.Lines?.Data?.FirstOrDefault()?.Period?.End, now, ct);
                break;
            case "invoice.payment_failed":
                if (ev.Data.Object is Invoice failed && SubscriptionOf(failed) is { } failedSub)
                    await payments.InvoiceFailedAsync(ev.Account, failedSub, now, ct);
                break;
            case "customer.subscription.updated" or "customer.subscription.deleted":
                if (ev.Data.Object is Subscription sub)
                    await payments.SubscriptionChangedAsync(ev.Account, CoachStripe.FromSubscription(sub), now, ct);
                break;
        }
        return Results.Ok();
    }

    private static string? SubscriptionOf(Invoice i) => i.Parent?.SubscriptionDetails?.SubscriptionId;
}

public record ConnectRequest(string? Country, string ReturnUrl, string RefreshUrl);
public record PaymentSettingsRequest(string? FailRule, int FailDays, bool EmailOnFail, bool ShowClientNote);
public record PackageRequest(string? Name, string? Description, long AmountCents, string? Interval, int? Weeks, bool Hidden);
public record LinkPackageRequest(Guid? PackageId);
public record ClientRuleRequest(string? Rule, int? Days);
public record PaidElsewhereRequest(DateOnly? Until);
public record StopRequest(bool Stop);
public record StartCheckoutRequest(SharingDto? Sharing, string SuccessUrl, string CancelUrl);
public record ConfirmCheckoutRequest(string? Code, string SessionId);
