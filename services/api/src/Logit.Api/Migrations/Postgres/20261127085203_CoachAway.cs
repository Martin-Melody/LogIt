using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class CoachAway : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AwayExcusesCheckins",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "AwayFrom",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AwayNote",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AwayTellAskers",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "AwayUntil",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AwayExcusesCheckins",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AwayFrom",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AwayNote",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AwayTellAskers",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AwayUntil",
                table: "Users");
        }
    }
}
