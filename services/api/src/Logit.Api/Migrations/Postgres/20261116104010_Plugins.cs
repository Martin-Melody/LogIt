using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class Plugins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HostedPlugins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    PluginId = table.Column<string>(type: "text", nullable: false),
                    Family = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    DraftManifestJson = table.Column<string>(type: "text", nullable: false),
                    DraftSource = table.Column<string>(type: "text", nullable: false),
                    DraftUpdatedAtMs = table.Column<long>(type: "bigint", nullable: false),
                    DraftToken = table.Column<string>(type: "text", nullable: false),
                    LinkToken = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HostedPlugins", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HostedPlugins_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncedPluginInstalls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtMs = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAtMs = table.Column<long>(type: "bigint", nullable: false),
                    DataJson = table.Column<string>(type: "text", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "bigint", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedPluginInstalls", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedPluginInstalls_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PluginReleases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HostedPluginId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<string>(type: "text", nullable: false),
                    ManifestJson = table.Column<string>(type: "text", nullable: false),
                    Source = table.Column<string>(type: "text", nullable: false),
                    Integrity = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    ChangeNote = table.Column<string>(type: "text", nullable: true),
                    ReviewNote = table.Column<string>(type: "text", nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PluginReleases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PluginReleases_HostedPlugins_HostedPluginId",
                        column: x => x.HostedPluginId,
                        principalTable: "HostedPlugins",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HostedPlugins_DraftToken",
                table: "HostedPlugins",
                column: "DraftToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HostedPlugins_LinkToken",
                table: "HostedPlugins",
                column: "LinkToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HostedPlugins_OwnerId",
                table: "HostedPlugins",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_HostedPlugins_PluginId",
                table: "HostedPlugins",
                column: "PluginId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PluginReleases_HostedPluginId_Version",
                table: "PluginReleases",
                columns: new[] { "HostedPluginId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PluginReleases_Status",
                table: "PluginReleases",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedPluginInstalls_UserId_ClientId",
                table: "SyncedPluginInstalls",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedPluginInstalls_UserId_SyncedAt",
                table: "SyncedPluginInstalls",
                columns: new[] { "UserId", "SyncedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PluginReleases");

            migrationBuilder.DropTable(
                name: "SyncedPluginInstalls");

            migrationBuilder.DropTable(
                name: "HostedPlugins");
        }
    }
}
