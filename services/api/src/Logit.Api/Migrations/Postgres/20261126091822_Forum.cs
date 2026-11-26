using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Logit.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class Forum : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Groups_Slug",
                table: "Groups");

            migrationBuilder.DropIndex(
                name: "IX_GroupPosts_AuthorId",
                table: "GroupPosts");

            migrationBuilder.DropColumn(
                name: "PostsOn",
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

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "GroupPosts");

            migrationBuilder.DropColumn(
                name: "MembersOnlyComments",
                table: "GroupPosts");

            migrationBuilder.AlterColumn<Guid>(
                name: "GroupId",
                table: "GroupPosts",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "Tags",
                table: "GroupPosts",
                type: "character varying(420)",
                maxLength: 420,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "Hashtags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Tag = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ForumPostId = table.Column<Guid>(type: "uuid", nullable: true),
                    PostId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Hashtags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Hashtags_GroupPosts_ForumPostId",
                        column: x => x.ForumPostId,
                        principalTable: "GroupPosts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Hashtags_Posts_PostId",
                        column: x => x.PostId,
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GroupPosts_AuthorId_CreatedAt",
                table: "GroupPosts",
                columns: new[] { "AuthorId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GroupPosts_LastActivityAt",
                table: "GroupPosts",
                column: "LastActivityAt");

            migrationBuilder.CreateIndex(
                name: "IX_Hashtags_ForumPostId",
                table: "Hashtags",
                column: "ForumPostId");

            migrationBuilder.CreateIndex(
                name: "IX_Hashtags_PostId",
                table: "Hashtags",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_Hashtags_Tag_CreatedAt",
                table: "Hashtags",
                columns: new[] { "Tag", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Hashtags");

            migrationBuilder.DropIndex(
                name: "IX_GroupPosts_AuthorId_CreatedAt",
                table: "GroupPosts");

            migrationBuilder.DropIndex(
                name: "IX_GroupPosts_LastActivityAt",
                table: "GroupPosts");

            migrationBuilder.DropColumn(
                name: "Tags",
                table: "GroupPosts");

            migrationBuilder.AddColumn<bool>(
                name: "PostsOn",
                table: "Groups",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "Groups",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "WhoCanComment",
                table: "Groups",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "WhoCanPost",
                table: "Groups",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<Guid>(
                name: "GroupId",
                table: "GroupPosts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "GroupPosts",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "MembersOnlyComments",
                table: "GroupPosts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Groups_Slug",
                table: "Groups",
                column: "Slug");

            migrationBuilder.CreateIndex(
                name: "IX_GroupPosts_AuthorId",
                table: "GroupPosts",
                column: "AuthorId");
        }
    }
}
