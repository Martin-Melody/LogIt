using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class ExerciseSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SyncedExerciseSettings",
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
                    table.PrimaryKey("PK_SyncedExerciseSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedExerciseSettings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedExerciseSettings_UserId_ClientId",
                table: "SyncedExerciseSettings",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedExerciseSettings_UserId_SyncedAt",
                table: "SyncedExerciseSettings",
                columns: new[] { "UserId", "SyncedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SyncedExerciseSettings");
        }
    }
}
