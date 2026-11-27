using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class GroupJoinQuestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JoinQuestionsJson",
                table: "Groups",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AnswersJson",
                table: "GroupJoinRequests",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "JoinQuestionsJson",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "AnswersJson",
                table: "GroupJoinRequests");
        }
    }
}
