using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
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
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "StripeNeeds",
                table: "CoachPaymentAccounts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsChange",
                table: "CoachOffers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "Disputed",
                table: "CoachClientPayments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PendingNoPayment",
                table: "CoachClientPayments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingPackageId",
                table: "CoachClientPayments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PendingPayPackageId",
                table: "CoachClientPayments",
                type: "uuid",
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
