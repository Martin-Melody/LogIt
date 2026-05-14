using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDeletedAtMsToSyncedEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SyncedWorkoutSessions_UserId_ClientId",
                table: "SyncedWorkoutSessions");

            migrationBuilder.DropIndex(
                name: "IX_SyncedWorkoutSessions_UserId_StartedAtMs",
                table: "SyncedWorkoutSessions");

            migrationBuilder.DropIndex(
                name: "IX_SyncedSplits_UserId_ClientId",
                table: "SyncedSplits");

            migrationBuilder.DropIndex(
                name: "IX_SyncedSplits_UserId_UpdatedAtMs",
                table: "SyncedSplits");

            migrationBuilder.DropIndex(
                name: "IX_SyncedExercises_UserId_ClientId",
                table: "SyncedExercises");

            migrationBuilder.DropIndex(
                name: "IX_SyncedExercises_UserId_CreatedAtMs",
                table: "SyncedExercises");

            migrationBuilder.AddColumn<long>(
                name: "DeletedAtMs",
                table: "SyncedWorkoutSessions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "DeletedAtMs",
                table: "SyncedSplits",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "DeletedAtMs",
                table: "SyncedExercises",
                type: "INTEGER",
                nullable: true);

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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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

            migrationBuilder.DropColumn(
                name: "DeletedAtMs",
                table: "SyncedWorkoutSessions");

            migrationBuilder.DropColumn(
                name: "DeletedAtMs",
                table: "SyncedSplits");

            migrationBuilder.DropColumn(
                name: "DeletedAtMs",
                table: "SyncedExercises");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedWorkoutSessions_UserId_ClientId",
                table: "SyncedWorkoutSessions",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedWorkoutSessions_UserId_StartedAtMs",
                table: "SyncedWorkoutSessions",
                columns: new[] { "UserId", "StartedAtMs" });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedSplits_UserId_ClientId",
                table: "SyncedSplits",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedSplits_UserId_UpdatedAtMs",
                table: "SyncedSplits",
                columns: new[] { "UserId", "UpdatedAtMs" });

            migrationBuilder.CreateIndex(
                name: "IX_SyncedExercises_UserId_ClientId",
                table: "SyncedExercises",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedExercises_UserId_CreatedAtMs",
                table: "SyncedExercises",
                columns: new[] { "UserId", "CreatedAtMs" });
        }
    }
}
