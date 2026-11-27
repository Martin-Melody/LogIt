using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class LinksPayAndStart : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PayAndStart",
                table: "CoachInviteLinks",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // Links with a package used to mean "pay and start"; they keep doing that.
            migrationBuilder.Sql("UPDATE \"CoachInviteLinks\" SET \"PayAndStart\" = 1 WHERE \"PackageId\" IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PayAndStart",
                table: "CoachInviteLinks");
        }
    }
}
