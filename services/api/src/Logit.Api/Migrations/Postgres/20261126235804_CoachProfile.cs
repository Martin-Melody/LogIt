using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class CoachProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoachProfileJson",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowOnProfile",
                table: "CoachPackages",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoachProfileJson",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ShowOnProfile",
                table: "CoachPackages");
        }
    }
}
