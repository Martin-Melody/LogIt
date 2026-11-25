using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations
{
    /// <inheritdoc />
    public partial class GroupPosts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupCommentId",
                table: "Notifications",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GroupPostId",
                table: "Notifications",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PostsOn",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "PostsOnWeb",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "Groups",
                type: "TEXT",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "WhoCanComment",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "WhoCanPost",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "GroupPosts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    GroupId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AuthorId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    Slug = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    PhotoId = table.Column<Guid>(type: "TEXT", nullable: true),
                    PhotoWidth = table.Column<int>(type: "INTEGER", nullable: false),
                    PhotoHeight = table.Column<int>(type: "INTEGER", nullable: false),
                    CardType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: true),
                    CardJson = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    MembersOnlyComments = table.Column<bool>(type: "INTEGER", nullable: false),
                    OnWeb = table.Column<bool>(type: "INTEGER", nullable: false),
                    Pinned = table.Column<bool>(type: "INTEGER", nullable: false),
                    Locked = table.Column<bool>(type: "INTEGER", nullable: false),
                    Upvotes = table.Column<int>(type: "INTEGER", nullable: false),
                    CommentCount = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastActivityAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EditedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    RemovedByModerator = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupPosts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupPosts_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupPosts_Users_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "GroupComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PostId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ParentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    AuthorId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Body = table.Column<string>(type: "TEXT", maxLength: 5000, nullable: false),
                    Upvotes = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EditedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    RemovedByModerator = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupComments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupComments_GroupPosts_PostId",
                        column: x => x.PostId,
                        principalTable: "GroupPosts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupComments_Users_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "GroupVotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PostId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CommentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupVotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupVotes_GroupPosts_PostId",
                        column: x => x.PostId,
                        principalTable: "GroupPosts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupVotes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Groups_Slug",
                table: "Groups",
                column: "Slug");

            migrationBuilder.CreateIndex(
                name: "IX_GroupComments_AuthorId",
                table: "GroupComments",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupComments_PostId",
                table: "GroupComments",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupPosts_AuthorId",
                table: "GroupPosts",
                column: "AuthorId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupPosts_GroupId_CreatedAt",
                table: "GroupPosts",
                columns: new[] { "GroupId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GroupPosts_GroupId_LastActivityAt",
                table: "GroupPosts",
                columns: new[] { "GroupId", "LastActivityAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GroupVotes_PostId",
                table: "GroupVotes",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupVotes_UserId_PostId_CommentId",
                table: "GroupVotes",
                columns: new[] { "UserId", "PostId", "CommentId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GroupComments");

            migrationBuilder.DropTable(
                name: "GroupVotes");

            migrationBuilder.DropTable(
                name: "GroupPosts");

            migrationBuilder.DropIndex(
                name: "IX_Groups_Slug",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "GroupCommentId",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "GroupPostId",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "PostsOn",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "PostsOnWeb",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "WhoCanComment",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "WhoCanPost",
                table: "Groups");
        }
    }
}
