using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class MessagePhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PhotoHeight",
                table: "DirectMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "PhotoId",
                table: "DirectMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhotoWidth",
                table: "DirectMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "PhotoHeight",
                table: "CoachMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "PhotoId",
                table: "CoachMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhotoWidth",
                table: "CoachMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhotoHeight",
                table: "DirectMessages");

            migrationBuilder.DropColumn(
                name: "PhotoId",
                table: "DirectMessages");

            migrationBuilder.DropColumn(
                name: "PhotoWidth",
                table: "DirectMessages");

            migrationBuilder.DropColumn(
                name: "PhotoHeight",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "PhotoId",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "PhotoWidth",
                table: "CoachMessages");
        }
    }
}
