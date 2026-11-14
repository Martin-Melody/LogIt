using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Logit.Api.Features;

/// <summary>
/// Turns a request body that leaves out a required text field into a 400 with
/// <c>{ error, code: "missing_field", field }</c>, instead of a 500 when the handler calls
/// <c>.Trim()</c> on the null. .NET 8's JSON reader leaves a missing (or explicitly null)
/// <c>string</c> constructor parameter as null even though the record declares it non-nullable.
/// <para>
/// Only top-level <c>string</c> properties declared without <c>?</c> are checked; nested objects
/// and lists are left to the handlers, so older clients that omit optional collections still work.
/// A parameter counts as the body when it has <c>[FromBody]</c> or its type name ends in "Request".
/// </para>
/// </summary>
public static class RequiredFields
{
    private static readonly ConcurrentDictionary<Type, (PropertyInfo Prop, string JsonName)[]> Cache = new();

    public static EndpointFilterDelegate Factory(EndpointFilterFactoryContext context, EndpointFilterDelegate next)
    {
        var bodies = context.MethodInfo.GetParameters()
            .Select((p, i) => (Param: p, Index: i))
            .Where(x => IsBody(x.Param))
            .Select(x => (x.Index, Props: RequiredStrings(x.Param.ParameterType)))
            .Where(x => x.Props.Length > 0)
            .ToArray();

        if (bodies.Length == 0) return next;

        return async invocation =>
        {
            foreach (var (index, props) in bodies)
            {
                // A wholly missing body is already a 400 from the framework.
                if (invocation.Arguments[index] is not { } body) continue;
                foreach (var (prop, jsonName) in props)
                {
                    if (prop.GetValue(body) is null)
                        return Results.BadRequest(new { error = $"{jsonName} is required.", code = "missing_field", field = jsonName });
                }
            }
            return await next(invocation);
        };
    }

    private static bool IsBody(ParameterInfo p) =>
        p.GetCustomAttribute<FromBodyAttribute>() is not null
        || (p.ParameterType.IsClass && p.ParameterType != typeof(string) && p.ParameterType.Name.EndsWith("Request", StringComparison.Ordinal));

    public static (PropertyInfo Prop, string JsonName)[] RequiredStrings(Type type) =>
        Cache.GetOrAdd(type, t =>
        {
            var nullability = new NullabilityInfoContext();
            return t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.PropertyType == typeof(string) && p.CanRead && p.GetIndexParameters().Length == 0)
                .Where(p => nullability.Create(p).ReadState == NullabilityState.NotNull)
                .Select(p => (p, JsonNamingPolicy.CamelCase.ConvertName(p.Name)))
                .ToArray();
        });
}
