using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class CoachSharingLinksReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "InviteLinkId",
                table: "CoachClientRelationships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequestedByClient",
                table: "CoachClientRelationships",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Relationships made before the sharing switches shared everything, so they keep doing so.
            migrationBuilder.AddColumn<bool>(
                name: "ShareBodyweight",
                table: "CoachClientRelationships",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShareCheckins",
                table: "CoachClientRelationships",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShareHabits",
                table: "CoachClientRelationships",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShareNutrition",
                table: "CoachClientRelationships",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShareWorkouts",
                table: "CoachClientRelationships",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "CheckinReviews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionId = table.Column<string>(type: "text", nullable: false),
                    ReviewedAtMs = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CheckinReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CheckinReviews_Users_ClientUserId",
                        column: x => x.ClientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CheckinReviews_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CoachInviteLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MaxUses = table.Column<int>(type: "integer", nullable: true),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachInviteLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachInviteLinks_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoachClientRelationships_InviteLinkId",
                table: "CoachClientRelationships",
                column: "InviteLinkId");

            migrationBuilder.CreateIndex(
                name: "IX_CheckinReviews_ClientUserId",
                table: "CheckinReviews",
                column: "ClientUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CheckinReviews_CoachId_ClientUserId_SubmissionId",
                table: "CheckinReviews",
                columns: new[] { "CoachId", "ClientUserId", "SubmissionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoachInviteLinks_CoachId",
                table: "CoachInviteLinks",
                column: "CoachId");

            migrationBuilder.CreateIndex(
                name: "IX_CoachInviteLinks_Code",
                table: "CoachInviteLinks",
                column: "Code",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CoachClientRelationships_CoachInviteLinks_InviteLinkId",
                table: "CoachClientRelationships",
                column: "InviteLinkId",
                principalTable: "CoachInviteLinks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CoachClientRelationships_CoachInviteLinks_InviteLinkId",
                table: "CoachClientRelationships");

            migrationBuilder.DropTable(
                name: "CheckinReviews");

            migrationBuilder.DropTable(
                name: "CoachInviteLinks");

            migrationBuilder.DropIndex(
                name: "IX_CoachClientRelationships_InviteLinkId",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "InviteLinkId",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "RequestedByClient",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "ShareBodyweight",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "ShareCheckins",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "ShareHabits",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "ShareNutrition",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "ShareWorkouts",
                table: "CoachClientRelationships");
        }
    }
}
