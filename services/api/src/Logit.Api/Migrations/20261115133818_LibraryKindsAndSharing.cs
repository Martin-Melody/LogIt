using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class LibraryKindsAndSharing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "SyncedExercises",
                type: "TEXT",
                maxLength: 16,
                nullable: false,
                // Every row from before the library is a strength exercise.
                defaultValue: "strength");

            migrationBuilder.AddColumn<bool>(
                name: "SharedWithClients",
                table: "SyncedExercises",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Kind",
                table: "SyncedExercises");

            migrationBuilder.DropColumn(
                name: "SharedWithClients",
                table: "SyncedExercises");
        }
    }
}
