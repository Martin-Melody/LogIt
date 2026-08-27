using Logit.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Logit.Api.Data;

public class AppDbContext(DbContextOptions options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<Follow> Follows => Set<Follow>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Like> Likes => Set<Like>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<CoachClientRelationship> CoachClientRelationships => Set<CoachClientRelationship>();
    public DbSet<SyncedWorkoutSession> SyncedWorkoutSessions => Set<SyncedWorkoutSession>();
    public DbSet<SyncedSplit> SyncedSplits => Set<SyncedSplit>();
    public DbSet<SyncedExercise> SyncedExercises => Set<SyncedExercise>();
    public DbSet<CoachProgram> CoachPrograms => Set<CoachProgram>();
    public DbSet<CheckinSchedule> CheckinSchedules => Set<CheckinSchedule>();
    public DbSet<SyncedCheckinSubmission> SyncedCheckinSubmissions => Set<SyncedCheckinSubmission>();
    public DbSet<CoachMessage> CoachMessages => Set<CoachMessage>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
        });

        model.Entity<RefreshToken>(e =>
        {
            e.HasIndex(t => t.Token).IsUnique();
            e.HasOne(t => t.User)
             .WithMany(u => u.RefreshTokens)
             .HasForeignKey(t => t.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<PasswordResetToken>(e =>
        {
            e.HasIndex(t => t.Token).IsUnique();
            e.HasOne(t => t.User)
             .WithMany(u => u.PasswordResetTokens)
             .HasForeignKey(t => t.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Follow>(e =>
        {
            e.HasKey(f => new { f.FollowerId, f.FollowedId });
            e.HasOne(f => f.Follower)
             .WithMany(u => u.Following)
             .HasForeignKey(f => f.FollowerId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(f => f.Followed)
             .WithMany(u => u.Followers)
             .HasForeignKey(f => f.FollowedId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Post>(e =>
        {
            e.HasIndex(p => p.AuthorId);
            e.HasIndex(p => p.CreatedAt);
            e.HasOne(p => p.Author)
             .WithMany(u => u.Posts)
             .HasForeignKey(p => p.AuthorId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Like>(e =>
        {
            e.HasKey(l => new { l.UserId, l.PostId });
            e.HasOne(l => l.User)
             .WithMany(u => u.Likes)
             .HasForeignKey(l => l.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(l => l.Post)
             .WithMany(p => p.Likes)
             .HasForeignKey(l => l.PostId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Comment>(e =>
        {
            e.HasIndex(c => c.PostId);
            e.HasIndex(c => c.CreatedAt);
            e.HasOne(c => c.Post)
             .WithMany(p => p.Comments)
             .HasForeignKey(c => c.PostId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author)
             .WithMany(u => u.Comments)
             .HasForeignKey(c => c.AuthorId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<CoachClientRelationship>(e =>
        {
            e.HasIndex(r => new { r.CoachId, r.ClientId }).IsUnique();
            e.HasOne(r => r.Coach)
             .WithMany(u => u.CoachRelationships)
             .HasForeignKey(r => r.CoachId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.Client)
             .WithMany(u => u.ClientRelationships)
             .HasForeignKey(r => r.ClientId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<CoachProgram>(e =>
        {
            e.HasIndex(p => new { p.CoachId, p.ProgramId }).IsUnique();
            e.HasIndex(p => new { p.RecipientUserId, p.SyncedAt });
            e.HasOne(p => p.Coach)
             .WithMany()
             .HasForeignKey(p => p.CoachId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(p => p.Recipient)
             .WithMany()
             .HasForeignKey(p => p.RecipientUserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(p => p.Relationship)
             .WithMany()
             .HasForeignKey(p => p.RelationshipId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<CheckinSchedule>(e =>
        {
            e.HasIndex(s => new { s.CoachId, s.ScheduleId }).IsUnique();
            e.HasIndex(s => new { s.RecipientUserId, s.SyncedAt });
            e.HasOne(s => s.Coach)
             .WithMany()
             .HasForeignKey(s => s.CoachId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(s => s.Recipient)
             .WithMany()
             .HasForeignKey(s => s.RecipientUserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(s => s.Relationship)
             .WithMany()
             .HasForeignKey(s => s.RelationshipId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<SyncedCheckinSubmission>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasOne(s => s.User)
             .WithMany()
             .HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<CoachMessage>(e =>
        {
            e.HasIndex(m => new { m.SenderUserId, m.MessageId }).IsUnique();
            e.HasIndex(m => new { m.RelationshipId, m.SyncedAt });
            e.HasOne(m => m.Relationship)
             .WithMany()
             .HasForeignKey(m => m.RelationshipId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(m => m.Sender)
             .WithMany()
             .HasForeignKey(m => m.SenderUserId)
             .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
