using Logit.Api.Features;
using Logit.Api.Features.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Logit.Api.Tests;

public class RequiredFieldsTests
{
    private static Task<IResult> Login([FromBody] LoginRequest req) => Task.FromResult(Results.Ok());
    private static Task<IResult> Delete([FromBody] DeleteAccountRequest req) => Task.FromResult(Results.Ok());

    private static async Task<object?> Run(string method, object? body)
    {
        var info = typeof(RequiredFieldsTests).GetMethod(method, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        var ctx = new EndpointFilterFactoryContext { MethodInfo = info, ApplicationServices = null! };
        EndpointFilterDelegate handler = _ => ValueTask.FromResult<object?>("handler ran");
        var filtered = RequiredFields.Factory(ctx, handler);
        return await filtered(new DefaultEndpointFilterInvocationContext(new DefaultHttpContext(), body));
    }

    [Fact]
    public void Only_non_nullable_strings_are_required()
    {
        Assert.Equal(["usernameOrEmail", "password"], RequiredFields.RequiredStrings(typeof(LoginRequest)).Select(x => x.JsonName));
        Assert.Empty(RequiredFields.RequiredStrings(typeof(DeleteAccountRequest))); // string? Password
    }

    [Fact]
    public async Task A_missing_field_is_a_400_naming_it()
    {
        var result = await Run(nameof(Login), new LoginRequest("martin", null!));
        var bad = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(400, bad.StatusCode);
        var value = Assert.IsAssignableFrom<IValueHttpResult>(result).Value!;
        Assert.Equal("missing_field", value.GetType().GetProperty("code")!.GetValue(value));
        Assert.Equal("password", value.GetType().GetProperty("field")!.GetValue(value));
    }

    [Fact]
    public async Task Complete_bodies_and_optional_fields_reach_the_handler()
    {
        Assert.Equal("handler ran", await Run(nameof(Login), new LoginRequest("martin", "pw")));
        Assert.Equal("handler ran", await Run(nameof(Delete), new DeleteAccountRequest(null)));
    }
}
