using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class GroupModerators : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "Reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "GroupResolvedAt",
                table: "Reports",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "MutedUntil",
                table: "GroupMembers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RemovedByModerator",
                table: "DirectMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "GroupResolvedAt",
                table: "Reports");

            migrationBuilder.DropColumn(
                name: "MutedUntil",
                table: "GroupMembers");

            migrationBuilder.DropColumn(
                name: "RemovedByModerator",
                table: "DirectMessages");
        }
    }
}
