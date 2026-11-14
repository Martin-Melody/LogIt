using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBillingSubscriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StripeSubscriptionId",
                table: "Users");

            migrationBuilder.AddColumn<int>(
                name: "ManualTier",
                table: "Users",
                type: "INTEGER",
                nullable: true);

            // Plans that exist today (set in the admin page, or by a Stripe test) become admin
            // grants, so nobody loses access when Tier starts being worked out from subscriptions.
            migrationBuilder.Sql("UPDATE \"Users\" SET \"ManualTier\" = \"Tier\" WHERE \"Tier\" <> 0;");

            migrationBuilder.CreateTable(
                name: "BillingSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Source = table.Column<int>(type: "INTEGER", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                    ProductId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Plan = table.Column<int>(type: "INTEGER", nullable: false),
                    State = table.Column<int>(type: "INTEGER", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    AutoRenewing = table.Column<bool>(type: "INTEGER", nullable: false),
                    ReplacesExternalId = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    IsTest = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CheckedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingSubscriptions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingSubscriptions_Source_ExternalId",
                table: "BillingSubscriptions",
                columns: new[] { "Source", "ExternalId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingSubscriptions_State_ExpiresAt",
                table: "BillingSubscriptions",
                columns: new[] { "State", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingSubscriptions_UserId",
                table: "BillingSubscriptions",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillingSubscriptions");

            migrationBuilder.DropColumn(
                name: "ManualTier",
                table: "Users");

            migrationBuilder.AddColumn<string>(
                name: "StripeSubscriptionId",
                table: "Users",
                type: "TEXT",
                nullable: true);
        }
    }
}
