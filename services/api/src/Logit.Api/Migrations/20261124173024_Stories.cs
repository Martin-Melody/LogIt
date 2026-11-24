using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class Stories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CloseFriends",
                columns: table => new
                {
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FriendId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CloseFriends", x => new { x.OwnerId, x.FriendId });
                    table.ForeignKey(
                        name: "FK_CloseFriends_Users_FriendId",
                        column: x => x.FriendId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CloseFriends_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Stories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    AuthorId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CloseFriends = table.Column<bool>(type: "INTEGER", nullable: false),
                    CardType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CardJson = table.Column<string>(type: "TEXT", maxLength: 3800, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Stories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Stories_Users_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StoryHides",
                columns: table => new
                {
                    OwnerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    HiddenId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoryHides", x => new { x.OwnerId, x.HiddenId });
                    table.ForeignKey(
                        name: "FK_StoryHides_Users_HiddenId",
                        column: x => x.HiddenId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StoryHides_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StoryViews",
                columns: table => new
                {
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ViewerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ViewedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Cheered = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoryViews", x => new { x.StoryId, x.ViewerId });
                    table.ForeignKey(
                        name: "FK_StoryViews_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StoryViews_Users_ViewerId",
                        column: x => x.ViewerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CloseFriends_FriendId",
                table: "CloseFriends",
                column: "FriendId");

            migrationBuilder.CreateIndex(
                name: "IX_Stories_AuthorId_ExpiresAt",
                table: "Stories",
                columns: new[] { "AuthorId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Stories_ExpiresAt",
                table: "Stories",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_StoryHides_HiddenId",
                table: "StoryHides",
                column: "HiddenId");

            migrationBuilder.CreateIndex(
                name: "IX_StoryViews_ViewerId",
                table: "StoryViews",
                column: "ViewerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CloseFriends");

            migrationBuilder.DropTable(
                name: "StoryHides");

            migrationBuilder.DropTable(
                name: "StoryViews");

            migrationBuilder.DropTable(
                name: "Stories");
        }
    }
}
