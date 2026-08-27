using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class AddCheckins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CheckinSchedules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleId = table.Column<string>(type: "text", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAtMs = table.Column<long>(type: "bigint", nullable: false),
                    DataJson = table.Column<string>(type: "text", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "bigint", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CheckinSchedules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CheckinSchedules_CoachClientRelationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalTable: "CoachClientRelationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CheckinSchedules_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CheckinSchedules_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncedCheckinSubmissions",
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
                    table.PrimaryKey("PK_SyncedCheckinSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedCheckinSubmissions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CheckinSchedules_CoachId_ScheduleId",
                table: "CheckinSchedules",
                columns: new[] { "CoachId", "ScheduleId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CheckinSchedules_RecipientUserId_SyncedAt",
                table: "CheckinSchedules",
                columns: new[] { "RecipientUserId", "SyncedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CheckinSchedules_RelationshipId",
                table: "CheckinSchedules",
                column: "RelationshipId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedCheckinSubmissions_UserId_SyncedAt",
                table: "SyncedCheckinSubmissions",
                columns: new[] { "UserId", "SyncedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CheckinSchedules");

            migrationBuilder.DropTable(
                name: "SyncedCheckinSubmissions");
        }
    }
}
