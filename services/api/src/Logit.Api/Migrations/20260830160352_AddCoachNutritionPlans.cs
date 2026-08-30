using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCoachNutritionPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CoachNutritionPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlanId = table.Column<string>(type: "TEXT", nullable: false),
                    CoachId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    RelationshipId = table.Column<Guid>(type: "TEXT", nullable: true),
                    UpdatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachNutritionPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachNutritionPlans_CoachClientRelationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalTable: "CoachClientRelationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CoachNutritionPlans_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CoachNutritionPlans_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoachNutritionPlans_CoachId_PlanId",
                table: "CoachNutritionPlans",
                columns: new[] { "CoachId", "PlanId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoachNutritionPlans_RecipientUserId_SyncedAt",
                table: "CoachNutritionPlans",
                columns: new[] { "RecipientUserId", "SyncedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CoachNutritionPlans_RelationshipId",
                table: "CoachNutritionPlans",
                column: "RelationshipId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CoachNutritionPlans");
        }
    }
}
