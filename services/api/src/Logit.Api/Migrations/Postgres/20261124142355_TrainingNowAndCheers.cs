using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class TrainingNowAndCheers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CheersFrom",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "ShowTraining",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TrainingSince",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TrainingUntil",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrainingWhat",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Cheers",
                table: "PushSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CheersFrom",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ShowTraining",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TrainingSince",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TrainingUntil",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TrainingWhat",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Cheers",
                table: "PushSettings");
        }
    }
}
