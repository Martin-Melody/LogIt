using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class SwapRulesAndReviewReply : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoachSwapRule",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SwapRule",
                table: "CoachClientRelationships",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reply",
                table: "CheckinReviews",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoachSwapRule",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "SwapRule",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "Reply",
                table: "CheckinReviews");
        }
    }
}
