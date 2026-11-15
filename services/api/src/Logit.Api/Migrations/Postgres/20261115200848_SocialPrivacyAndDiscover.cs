using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class SocialPrivacyAndDiscover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HideFromSuggestions",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HidePeopleSuggestions",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPrivate",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ShowInDiscover",
                table: "Users",
                type: "boolean",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DiscoverDismissals",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    HiddenUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscoverDismissals", x => new { x.UserId, x.HiddenUserId });
                    table.ForeignKey(
                        name: "FK_DiscoverDismissals_Users_HiddenUserId",
                        column: x => x.HiddenUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DiscoverDismissals_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiscoverImpressions",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Arm = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Recipe = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ShownAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscoverImpressions", x => new { x.UserId, x.Kind, x.TargetId });
                    table.ForeignKey(
                        name: "FK_DiscoverImpressions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FollowRequests",
                columns: table => new
                {
                    RequesterId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FollowRequests", x => new { x.RequesterId, x.TargetId });
                    table.ForeignKey(
                        name: "FK_FollowRequests_Users_RequesterId",
                        column: x => x.RequesterId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FollowRequests_Users_TargetId",
                        column: x => x.TargetId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscoverDismissals_HiddenUserId",
                table: "DiscoverDismissals",
                column: "HiddenUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscoverImpressions_Arm_Recipe",
                table: "DiscoverImpressions",
                columns: new[] { "Arm", "Recipe" });

            migrationBuilder.CreateIndex(
                name: "IX_FollowRequests_TargetId_CreatedAt",
                table: "FollowRequests",
                columns: new[] { "TargetId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscoverDismissals");

            migrationBuilder.DropTable(
                name: "DiscoverImpressions");

            migrationBuilder.DropTable(
                name: "FollowRequests");

            migrationBuilder.DropColumn(
                name: "HideFromSuggestions",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "HidePeopleSuggestions",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsPrivate",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ShowInDiscover",
                table: "Users");
        }
    }
}
