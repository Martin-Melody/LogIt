using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class TakeSpot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoachAgreement",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CoachAgreementChangedAt",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AgreedAt",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AgreedText",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EndsAt",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoachAgreement",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CoachAgreementChangedAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AgreedAt",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "AgreedText",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "EndsAt",
                table: "CoachClientRelationships");
        }
    }
}
