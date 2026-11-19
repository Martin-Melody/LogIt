namespace Logit.Api.Features.Auth;

/// No Username: one is made from the name (sign-up on a coach's invite link asks for less).
public record RegisterRequest(string? Username, string Email, string Password, string DisplayName, string? InviteCode = null, string? AdminKey = null);
/// GET /auth/registration: what the sign-up form needs to know before it's filled in.
/// Setup: nobody is an admin yet and the server has an ADMIN_KEY, so sign-up offers to set the
/// server up (the account made with the key becomes its admin, no invite needed).
public record RegistrationInfo(string Mode, bool SelfHosted, bool Setup = false);
public record LoginRequest(string UsernameOrEmail, string Password);
public record RefreshRequest(string RefreshToken);
public record RevokeRequest(string RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record DeleteAccountRequest(string? Password);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword);

public record AuthResponse(string AccessToken, string RefreshToken, UserDto User, bool IsSelfHosted);
public record UserDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, string Tier, bool OnboardingCompleted);
