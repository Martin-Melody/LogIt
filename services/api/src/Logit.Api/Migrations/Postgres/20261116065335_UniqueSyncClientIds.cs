using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class UniqueSyncClientIds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SyncedWorkoutSessions_UserId",
                table: "SyncedWorkoutSessions");

            migrationBuilder.DropIndex(
                name: "IX_SyncedSplits_UserId",
                table: "SyncedSplits");

            migrationBuilder.DropIndex(
                name: "IX_SyncedExercises_UserId",
                table: "SyncedExercises");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedWorkoutSessions_UserId_ClientId",
                table: "SyncedWorkoutSessions",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedSplits_UserId_ClientId",
                table: "SyncedSplits",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedExercises_UserId_ClientId",
                table: "SyncedExercises",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedCheckinSubmissions_UserId_ClientId",
                table: "SyncedCheckinSubmissions",
                columns: new[] { "UserId", "ClientId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SyncedWorkoutSessions_UserId_ClientId",
                table: "SyncedWorkoutSessions");

            migrationBuilder.DropIndex(
                name: "IX_SyncedSplits_UserId_ClientId",
                table: "SyncedSplits");

            migrationBuilder.DropIndex(
                name: "IX_SyncedExercises_UserId_ClientId",
                table: "SyncedExercises");

            migrationBuilder.DropIndex(
                name: "IX_SyncedCheckinSubmissions_UserId_ClientId",
                table: "SyncedCheckinSubmissions");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedWorkoutSessions_UserId",
                table: "SyncedWorkoutSessions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedSplits_UserId",
                table: "SyncedSplits",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedExercises_UserId",
                table: "SyncedExercises",
                column: "UserId");
        }
    }
}
