using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
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
                type: "text",
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
