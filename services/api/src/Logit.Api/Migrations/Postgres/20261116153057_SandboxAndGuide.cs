using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class SandboxAndGuide : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GuideJson",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsSample",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SampleOwnerId",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_SampleOwnerId",
                table: "Users",
                column: "SampleOwnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Users_SampleOwnerId",
                table: "Users",
                column: "SampleOwnerId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_Users_SampleOwnerId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_SampleOwnerId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "GuideJson",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsSample",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "SampleOwnerId",
                table: "Users");
        }
    }
}
