using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class ReactionPushes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PushedAt",
                table: "DmReactions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReactedAt",
                table: "CoachMessages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reaction",
                table: "CoachMessages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReactionPushedAt",
                table: "CoachMessages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DmReactions_PushedAt",
                table: "DmReactions",
                column: "PushedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DmReactions_PushedAt",
                table: "DmReactions");

            migrationBuilder.DropColumn(
                name: "PushedAt",
                table: "DmReactions");

            migrationBuilder.DropColumn(
                name: "ReactedAt",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "Reaction",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "ReactionPushedAt",
                table: "CoachMessages");
        }
    }
}
