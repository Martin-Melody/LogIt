using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNutrition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NutritionGoalJson",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "NutritionGoalUpdatedAtMs",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "SyncedCustomFoods",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClientId = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedCustomFoods", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedCustomFoods_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncedNutritionDays",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClientId = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedNutritionDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedNutritionDays_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncedRecipes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClientId = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedRecipes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedRecipes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncedWeightEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClientId = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedAtMs = table.Column<long>(type: "INTEGER", nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    DeletedAtMs = table.Column<long>(type: "INTEGER", nullable: true),
                    SyncedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedWeightEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedWeightEntries_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedCustomFoods_UserId_ClientId",
                table: "SyncedCustomFoods",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedCustomFoods_UserId_SyncedAt",
                table: "SyncedCustomFoods",
                columns: new[] { "UserId", "SyncedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedNutritionDays_UserId_ClientId",
                table: "SyncedNutritionDays",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedNutritionDays_UserId_SyncedAt",
                table: "SyncedNutritionDays",
                columns: new[] { "UserId", "SyncedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedRecipes_UserId_ClientId",
                table: "SyncedRecipes",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedRecipes_UserId_SyncedAt",
                table: "SyncedRecipes",
                columns: new[] { "UserId", "SyncedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedWeightEntries_UserId_ClientId",
                table: "SyncedWeightEntries",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedWeightEntries_UserId_SyncedAt",
                table: "SyncedWeightEntries",
                columns: new[] { "UserId", "SyncedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SyncedCustomFoods");

            migrationBuilder.DropTable(
                name: "SyncedNutritionDays");

            migrationBuilder.DropTable(
                name: "SyncedRecipes");

            migrationBuilder.DropTable(
                name: "SyncedWeightEntries");

            migrationBuilder.DropColumn(
                name: "NutritionGoalJson",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "NutritionGoalUpdatedAtMs",
                table: "Users");
        }
    }
}
