using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class PluginConsent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PluginConsentJson",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PluginConsentJson",
                table: "CoachClientRelationships");
        }
    }
}
