using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class CoachPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PackageId",
                table: "CoachInviteLinks",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CoachClientPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Mode = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    PackageId = table.Column<Guid>(type: "TEXT", nullable: true),
                    PackageName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    Interval = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    StripeCheckoutSessionId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    StripeSubscriptionId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    StripeCustomerId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    State = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    PaidUntil = table.Column<DateTime>(type: "TEXT", nullable: true),
                    UnpaidSince = table.Column<DateTime>(type: "TEXT", nullable: true),
                    StopsAtPeriodEnd = table.Column<bool>(type: "INTEGER", nullable: false),
                    FailRule = table.Column<string>(type: "TEXT", maxLength: 10, nullable: true),
                    FailDays = table.Column<int>(type: "INTEGER", nullable: true),
                    PausedForPayment = table.Column<bool>(type: "INTEGER", nullable: false),
                    CoachEmailedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachClientPayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachClientPayments_CoachClientRelationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalTable: "CoachClientRelationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CoachPackages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CoachId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 600, nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    Interval = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Weeks = table.Column<int>(type: "INTEGER", nullable: true),
                    Hidden = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachPackages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachPackages_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CoachPaymentAccounts",
                columns: table => new
                {
                    CoachId = table.Column<Guid>(type: "TEXT", nullable: false),
                    StripeAccountId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    CardPaymentsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    RequirementsDue = table.Column<bool>(type: "INTEGER", nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    Country = table.Column<string>(type: "TEXT", maxLength: 2, nullable: false),
                    StatusCheckedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    FailRule = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    FailDays = table.Column<int>(type: "INTEGER", nullable: false),
                    EmailOnFail = table.Column<bool>(type: "INTEGER", nullable: false),
                    ShowClientNote = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachPaymentAccounts", x => x.CoachId);
                    table.ForeignKey(
                        name: "FK_CoachPaymentAccounts_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CoachPaymentReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CoachId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    PaidAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoachPaymentReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoachPaymentReceipts_Users_CoachId",
                        column: x => x.CoachId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoachInviteLinks_PackageId",
                table: "CoachInviteLinks",
                column: "PackageId");

            migrationBuilder.CreateIndex(
                name: "IX_CoachClientPayments_RelationshipId",
                table: "CoachClientPayments",
                column: "RelationshipId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoachClientPayments_StripeSubscriptionId",
                table: "CoachClientPayments",
                column: "StripeSubscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_CoachClientPayments_UnpaidSince",
                table: "CoachClientPayments",
                column: "UnpaidSince");

            migrationBuilder.CreateIndex(
                name: "IX_CoachPackages_CoachId",
                table: "CoachPackages",
                column: "CoachId");

            migrationBuilder.CreateIndex(
                name: "IX_CoachPaymentAccounts_StripeAccountId",
                table: "CoachPaymentAccounts",
                column: "StripeAccountId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoachPaymentReceipts_CoachId_PaidAt",
                table: "CoachPaymentReceipts",
                columns: new[] { "CoachId", "PaidAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CoachPaymentReceipts_ExternalId",
                table: "CoachPaymentReceipts",
                column: "ExternalId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CoachInviteLinks_CoachPackages_PackageId",
                table: "CoachInviteLinks",
                column: "PackageId",
                principalTable: "CoachPackages",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CoachInviteLinks_CoachPackages_PackageId",
                table: "CoachInviteLinks");

            migrationBuilder.DropTable(
                name: "CoachClientPayments");

            migrationBuilder.DropTable(
                name: "CoachPackages");

            migrationBuilder.DropTable(
                name: "CoachPaymentAccounts");

            migrationBuilder.DropTable(
                name: "CoachPaymentReceipts");

            migrationBuilder.DropIndex(
                name: "IX_CoachInviteLinks_PackageId",
                table: "CoachInviteLinks");

            migrationBuilder.DropColumn(
                name: "PackageId",
                table: "CoachInviteLinks");
        }
    }
}
