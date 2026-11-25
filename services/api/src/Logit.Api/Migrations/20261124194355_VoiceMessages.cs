using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class VoiceMessages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "VoiceId",
                table: "DirectMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VoiceMs",
                table: "DirectMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "VoicePeaks",
                table: "DirectMessages",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VoiceId",
                table: "CoachMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VoiceMs",
                table: "CoachMessages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "VoicePeaks",
                table: "CoachMessages",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "VoiceNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    DurationMs = table.Column<int>(type: "INTEGER", nullable: false),
                    Bytes = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VoiceNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VoiceNotes_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VoiceNotes_OwnerId",
                table: "VoiceNotes",
                column: "OwnerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VoiceNotes");

            migrationBuilder.DropColumn(
                name: "VoiceId",
                table: "DirectMessages");

            migrationBuilder.DropColumn(
                name: "VoiceMs",
                table: "DirectMessages");

            migrationBuilder.DropColumn(
                name: "VoicePeaks",
                table: "DirectMessages");

            migrationBuilder.DropColumn(
                name: "VoiceId",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "VoiceMs",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "VoicePeaks",
                table: "CoachMessages");
        }
    }
}
