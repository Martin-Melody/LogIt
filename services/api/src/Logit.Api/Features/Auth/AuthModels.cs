namespace Logit.Api.Features.Auth;

/// No Username: one is made from the name (sign-up on a coach's invite link asks for less).
public record RegisterRequest(string? Username, string Email, string Password, string DisplayName, string? InviteCode = null, string? AdminKey = null);
/// GET /auth/registration: what the sign-up form needs to know before it's filled in.
/// Setup: nobody is an admin yet and the server has an ADMIN_KEY, so sign-up offers to set the
/// server up (the account made with the key becomes its admin, no invite needed).
public record RegistrationInfo(string Mode, bool SelfHosted, bool Setup = false);
/// AskBeforeMovingBackup: an app that asks "Back up this phone instead?" itself (decision D5).
/// Older apps leave it out and keep the old behaviour: signing in moves a Free backup here.
public record LoginRequest(string UsernameOrEmail, string Password, bool AskBeforeMovingBackup = false);
public record RefreshRequest(string RefreshToken);
public record RevokeRequest(string RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record DeleteAccountRequest(string? Password);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword);

/// BackupElsewhere: a Free account whose backup another phone holds, left there for the app to ask about.
public record AuthResponse(string AccessToken, string RefreshToken, UserDto User, bool IsSelfHosted, bool BackupElsewhere = false);
public record UserDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, string Tier, bool OnboardingCompleted);
