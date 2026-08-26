namespace Logit.Api.Features.Auth;

public record RegisterRequest(string Username, string Email, string Password, string DisplayName);
public record LoginRequest(string UsernameOrEmail, string Password);
public record RefreshRequest(string RefreshToken);
public record RevokeRequest(string RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword);

public record AuthResponse(string AccessToken, string RefreshToken, UserDto User, bool IsSelfHosted);
public record UserDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, string Tier, bool OnboardingCompleted);
