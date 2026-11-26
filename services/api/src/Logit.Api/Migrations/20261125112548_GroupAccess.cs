using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class GroupAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Access",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "GroupInvites",
                columns: table => new
                {
                    GroupId = table.Column<Guid>(type: "TEXT", nullable: false),
                    InviteeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    InviterId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupInvites", x => new { x.GroupId, x.InviteeId });
                    table.ForeignKey(
                        name: "FK_GroupInvites_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupInvites_Users_InviteeId",
                        column: x => x.InviteeId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupInvites_Users_InviterId",
                        column: x => x.InviterId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GroupJoinRequests",
                columns: table => new
                {
                    GroupId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OnBoard = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupJoinRequests", x => new { x.GroupId, x.UserId });
                    table.ForeignKey(
                        name: "FK_GroupJoinRequests_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupJoinRequests_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Groups_Access",
                table: "Groups",
                column: "Access");

            migrationBuilder.CreateIndex(
                name: "IX_GroupInvites_InviteeId",
                table: "GroupInvites",
                column: "InviteeId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupInvites_InviterId",
                table: "GroupInvites",
                column: "InviterId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupJoinRequests_UserId",
                table: "GroupJoinRequests",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GroupInvites");

            migrationBuilder.DropTable(
                name: "GroupJoinRequests");

            migrationBuilder.DropIndex(
                name: "IX_Groups_Access",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Access",
                table: "Groups");
        }
    }
}
