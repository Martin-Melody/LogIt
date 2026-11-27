using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class CoachRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoachAskQuestionsJson",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoachExpectSpots",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoachSpots",
                table: "Users",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoachWhenFull",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CardJson",
                table: "CoachMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "CoachMessages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AnswersJson",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InterestedPackageId",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestStage",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "WaitingSince",
                table: "CoachClientRelationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CoachOffers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PackageId = table.Column<Guid>(type: "TEXT", nullable: true),
                    PackageName = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    PackageDescription = table.Column<string>(type: "TEXT", nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Currency = table.Column<string>(type: "TEXT", nullable: false),
                    Interval = table.Column<string>(type: "TEXT", nullable: false),
                    Weeks = table.Column<int>(type: "INTEGER", nullable: true),
                    HoldUntil = table.Column<DateTime>(type: "TEXT", nullable: false),
                    StartsOn = table.Column<DateTime>(type: "TEXT", nullable: true),
                    FirstChargeOn = table.Column<DateTime>(type: "TEXT", nullable: true),
                    State = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachOffers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachOffers_CoachClientRelationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalTable: "CoachClientRelationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoachOffers_RelationshipId",
                table: "CoachOffers",
                column: "RelationshipId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CoachOffers");

            migrationBuilder.DropColumn(
                name: "CoachAskQuestionsJson",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CoachExpectSpots",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CoachSpots",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CoachWhenFull",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CardJson",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "CoachMessages");

            migrationBuilder.DropColumn(
                name: "AnswersJson",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "InterestedPackageId",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "RequestStage",
                table: "CoachClientRelationships");

            migrationBuilder.DropColumn(
                name: "WaitingSince",
                table: "CoachClientRelationships");
        }
    }
}
