using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class Boards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ShowOnBoards",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "BoardWeeks",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WeekStart = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Done = table.Column<int>(type: "integer", nullable: false),
                    Planned = table.Column<int>(type: "integer", nullable: false),
                    WeeksKept = table.Column<int>(type: "integer", nullable: false),
                    VolumePct = table.Column<int>(type: "integer", nullable: true),
                    Rest = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardWeeks", x => new { x.UserId, x.WeekStart });
                    table.ForeignKey(
                        name: "FK_BoardWeeks_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoardWeeks_WeekStart",
                table: "BoardWeeks",
                column: "WeekStart");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoardWeeks");

            migrationBuilder.DropColumn(
                name: "ShowOnBoards",
                table: "Users");
        }
    }
}
