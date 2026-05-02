FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Logit.Api/Logit.Api.csproj", "src/Logit.Api/"]
RUN dotnet restore "src/Logit.Api/Logit.Api.csproj"
COPY . .
RUN dotnet publish "src/Logit.Api/Logit.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Logit.Api.dll"]
