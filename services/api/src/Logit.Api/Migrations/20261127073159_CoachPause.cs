using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class CoachPause : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PausedUntil",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PausedUntil",
                table: "CoachClientRelationships");
        }
    }
}
