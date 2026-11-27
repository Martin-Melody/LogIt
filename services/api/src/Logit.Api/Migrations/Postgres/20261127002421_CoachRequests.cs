using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
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
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoachExpectSpots",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoachSpots",
                table: "Users",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoachWhenFull",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CardJson",
                table: "CoachMessages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "CoachMessages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AnswersJson",
                table: "CoachClientRelationships",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InterestedPackageId",
                table: "CoachClientRelationships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestStage",
                table: "CoachClientRelationships",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "WaitingSince",
                table: "CoachClientRelationships",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CoachOffers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackageId = table.Column<Guid>(type: "uuid", nullable: true),
                    PackageName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    PackageDescription = table.Column<string>(type: "text", nullable: false),
                    AmountCents = table.Column<long>(type: "bigint", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    Interval = table.Column<string>(type: "text", nullable: false),
                    Weeks = table.Column<int>(type: "integer", nullable: true),
                    HoldUntil = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartsOn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FirstChargeOn = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
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
