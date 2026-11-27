using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class CoachSavedReplies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoachSavedRepliesJson",
                table: "Users",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoachSavedRepliesJson",
                table: "Users");
        }
    }
}
