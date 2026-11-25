using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
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
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "PhotoId",
                table: "Stories",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PhotoWidth",
                table: "Stories",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<string>(
                name: "CardJson",
                table: "DirectMessages",
                type: "character varying(4400)",
                maxLength: 4400,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(4000)",
                oldMaxLength: 4000,
                oldNullable: true);
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

            migrationBuilder.AlterColumn<string>(
                name: "CardJson",
                table: "DirectMessages",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(4400)",
                oldMaxLength: 4400,
                oldNullable: true);
        }
    }
}
