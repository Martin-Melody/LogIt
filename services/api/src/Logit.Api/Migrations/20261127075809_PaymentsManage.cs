using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class PaymentsManage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PaymentsStopped",
                table: "CoachPaymentAccounts",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "StripeNeeds",
                table: "CoachPaymentAccounts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsChange",
                table: "CoachOffers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "Disputed",
                table: "CoachClientPayments",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PendingNoPayment",
                table: "CoachClientPayments",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingPackageId",
                table: "CoachClientPayments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingPayPackageId",
                table: "CoachClientPayments",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaymentsStopped",
                table: "CoachPaymentAccounts");

            migrationBuilder.DropColumn(
                name: "StripeNeeds",
                table: "CoachPaymentAccounts");

            migrationBuilder.DropColumn(
                name: "IsChange",
                table: "CoachOffers");

            migrationBuilder.DropColumn(
                name: "Disputed",
                table: "CoachClientPayments");

            migrationBuilder.DropColumn(
                name: "PendingNoPayment",
                table: "CoachClientPayments");

            migrationBuilder.DropColumn(
                name: "PendingPackageId",
                table: "CoachClientPayments");

            migrationBuilder.DropColumn(
                name: "PendingPayPackageId",
                table: "CoachClientPayments");
        }
    }
}
