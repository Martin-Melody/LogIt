using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class PhotoStories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PhotoHeight",
                table: "Stories",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "PhotoId",
                table: "Stories",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhotoWidth",
                table: "Stories",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PhotoHeight",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "PhotoId",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "PhotoWidth",
                table: "Stories");
        }
    }
}
