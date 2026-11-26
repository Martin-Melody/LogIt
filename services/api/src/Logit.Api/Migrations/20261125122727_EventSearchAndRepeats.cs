using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class EventSearchAndRepeats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GoingTo",
                table: "GroupJoinRequests",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Repeats",
                table: "GroupEvents",
                type: "TEXT",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SeriesId",
                table: "GroupEvents",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Sport",
                table: "GroupEvents",
                type: "TEXT",
                maxLength: 24,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GroupEvents_SeriesId",
                table: "GroupEvents",
                column: "SeriesId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupEvents_StartsAt",
                table: "GroupEvents",
                column: "StartsAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GroupEvents_SeriesId",
                table: "GroupEvents");

            migrationBuilder.DropIndex(
                name: "IX_GroupEvents_StartsAt",
                table: "GroupEvents");

            migrationBuilder.DropColumn(
                name: "GoingTo",
                table: "GroupJoinRequests");

            migrationBuilder.DropColumn(
                name: "Repeats",
                table: "GroupEvents");

            migrationBuilder.DropColumn(
                name: "SeriesId",
                table: "GroupEvents");

            migrationBuilder.DropColumn(
                name: "Sport",
                table: "GroupEvents");
        }
    }
}
