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
    public DbSet<CommentLike> CommentLikes => Set<CommentLike>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<FollowRequest> FollowRequests => Set<FollowRequest>();
    public DbSet<DiscoverDismissal> DiscoverDismissals => Set<DiscoverDismissal>();
    public DbSet<DiscoverImpression> DiscoverImpressions => Set<DiscoverImpression>();
    public DbSet<CoachClientRelationship> CoachClientRelationships => Set<CoachClientRelationship>();
    public DbSet<SyncedWorkoutSession> SyncedWorkoutSessions => Set<SyncedWorkoutSession>();
    public DbSet<SyncedSplit> SyncedSplits => Set<SyncedSplit>();
    public DbSet<SyncedExercise> SyncedExercises => Set<SyncedExercise>();
    public DbSet<CoachProgram> CoachPrograms => Set<CoachProgram>();
    public DbSet<CoachNutritionPlan> CoachNutritionPlans => Set<CoachNutritionPlan>();
    public DbSet<CheckinSchedule> CheckinSchedules => Set<CheckinSchedule>();
    public DbSet<SyncedCheckinSubmission> SyncedCheckinSubmissions => Set<SyncedCheckinSubmission>();
    public DbSet<CoachMessage> CoachMessages => Set<CoachMessage>();
    public DbSet<SyncedNutritionDay> SyncedNutritionDays => Set<SyncedNutritionDay>();
    public DbSet<SyncedCustomFood> SyncedCustomFoods => Set<SyncedCustomFood>();
    public DbSet<SyncedRecipe> SyncedRecipes => Set<SyncedRecipe>();
    public DbSet<SyncedFavoriteFood> SyncedFavoriteFoods => Set<SyncedFavoriteFood>();
    public DbSet<SyncedMealTemplate> SyncedMealTemplates => Set<SyncedMealTemplate>();
    public DbSet<SyncedWeightEntry> SyncedWeightEntries => Set<SyncedWeightEntry>();
    public DbSet<SyncedHabit> SyncedHabits => Set<SyncedHabit>();
    public DbSet<SyncedHabitEntry> SyncedHabitEntries => Set<SyncedHabitEntry>();
    public DbSet<CoachHabit> CoachHabits => Set<CoachHabit>();
    public DbSet<DiagnosticReport> DiagnosticReports => Set<DiagnosticReport>();
    public DbSet<Invite> Invites => Set<Invite>();
    public DbSet<BillingSubscription> BillingSubscriptions => Set<BillingSubscription>();
    public DbSet<CoachInviteLink> CoachInviteLinks => Set<CoachInviteLink>();
    public DbSet<CheckinReview> CheckinReviews => Set<CheckinReview>();
    public DbSet<HostedPlugin> HostedPlugins => Set<HostedPlugin>();
    public DbSet<PluginRelease> PluginReleases => Set<PluginRelease>();
    public DbSet<SyncedPluginInstall> SyncedPluginInstalls => Set<SyncedPluginInstall>();
    public DbSet<SyncedInsightChart> SyncedInsightCharts => Set<SyncedInsightChart>();

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
            e.HasOne(p => p.RepostOf)
             .WithMany()
             .HasForeignKey(p => p.RepostOfId)
             .OnDelete(DeleteBehavior.SetNull);
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
            e.HasIndex(c => c.ParentCommentId);
            // Replies go with their comment: soft deletes do it by hand (DeleteComment), and a hard
            // delete (account deletion cascading the author's comments) cascades here.
            e.HasOne(c => c.ParentComment)
             .WithMany(c => c.Replies)
             .HasForeignKey(c => c.ParentCommentId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Post)
             .WithMany(p => p.Comments)
             .HasForeignKey(c => c.PostId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author)
             .WithMany(u => u.Comments)
             .HasForeignKey(c => c.AuthorId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<CommentLike>(e =>
        {
            e.HasKey(l => new { l.UserId, l.CommentId });
            e.HasOne(l => l.User)
             .WithMany(u => u.CommentLikes)
             .HasForeignKey(l => l.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(l => l.Comment)
             .WithMany(c => c.Likes)
             .HasForeignKey(l => l.CommentId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Block>(e =>
        {
            e.HasKey(b => new { b.BlockerId, b.BlockedId });
            e.HasIndex(b => b.BlockedId);
            e.HasOne(b => b.Blocker)
             .WithMany()
             .HasForeignKey(b => b.BlockerId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(b => b.Blocked)
             .WithMany()
             .HasForeignKey(b => b.BlockedId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Invite>(e =>
        {
            e.HasIndex(i => i.Code).IsUnique();
            e.Property(i => i.Code).HasMaxLength(16);
            e.Property(i => i.Note).HasMaxLength(InviteLimits.MaxNoteChars);
            e.HasMany(i => i.Users)
             .WithOne(u => u.Invite)
             .HasForeignKey(u => u.InviteId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<BillingSubscription>(e =>
        {
            e.HasIndex(s => new { s.Source, s.ExternalId }).IsUnique();
            e.HasIndex(s => s.UserId);
            e.HasIndex(s => new { s.State, s.ExpiresAt });
            e.Property(s => s.ExternalId).HasMaxLength(512);
            e.Property(s => s.ReplacesExternalId).HasMaxLength(512);
            e.Property(s => s.ProductId).HasMaxLength(200);
            e.HasOne(s => s.User)
             .WithMany(u => u.Subscriptions)
             .HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<DiagnosticReport>(e =>
        {
            e.HasIndex(r => r.CreatedAt);
            e.Property(r => r.AppVersion).HasMaxLength(100);
            e.Property(r => r.Platform).HasMaxLength(20);
            e.Property(r => r.Note).HasMaxLength(DiagnosticsLimits.MaxNoteChars);
            e.HasOne(r => r.User)
             .WithMany()
             .HasForeignKey(r => r.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Report>(e =>
        {
            e.HasIndex(r => r.Status);
            e.HasIndex(r => new { r.TargetType, r.TargetId });
            e.HasOne(r => r.Reporter)
             .WithMany()
             .HasForeignKey(r => r.ReporterId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<FollowRequest>(e =>
        {
            e.HasKey(f => new { f.RequesterId, f.TargetId });
            e.HasIndex(f => new { f.TargetId, f.CreatedAt });
            e.HasOne(f => f.Requester)
             .WithMany()
             .HasForeignKey(f => f.RequesterId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(f => f.Target)
             .WithMany()
             .HasForeignKey(f => f.TargetId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<DiscoverDismissal>(e =>
        {
            e.HasKey(d => new { d.UserId, d.HiddenUserId });
            e.HasOne<User>()
             .WithMany()
             .HasForeignKey(d => d.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(d => d.HiddenUser)
             .WithMany()
             .HasForeignKey(d => d.HiddenUserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<DiscoverImpression>(e =>
        {
            e.HasKey(i => new { i.UserId, i.Kind, i.TargetId });
            e.HasIndex(i => new { i.Arm, i.Recipe });
            e.Property(i => i.Arm).HasMaxLength(64);
            e.Property(i => i.Recipe).HasMaxLength(64);
            e.HasOne<User>()
             .WithMany()
             .HasForeignKey(i => i.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Notification>(e =>
        {
            e.HasIndex(n => new { n.UserId, n.CreatedAt });
            e.HasIndex(n => new { n.UserId, n.ReadAt });
            e.HasOne(n => n.User)
             .WithMany()
             .HasForeignKey(n => n.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(n => n.Actor)
             .WithMany()
             .HasForeignKey(n => n.ActorId)
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
            e.HasOne(r => r.InviteLink)
             .WithMany()
             .HasForeignKey(r => r.InviteLinkId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        model.Entity<CoachInviteLink>(e =>
        {
            e.HasIndex(l => l.Code).IsUnique();
            e.HasIndex(l => l.CoachId);
            e.Property(l => l.Code).HasMaxLength(16);
            e.Property(l => l.Name).HasMaxLength(CoachInviteLinkLimits.MaxNameChars);
            e.HasOne(l => l.Coach)
             .WithMany()
             .HasForeignKey(l => l.CoachId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<CheckinReview>(e =>
        {
            e.HasIndex(r => new { r.CoachId, r.ClientUserId, r.SubmissionId }).IsUnique();
            e.HasIndex(r => r.ClientUserId);
            e.HasOne(r => r.Coach)
             .WithMany()
             .HasForeignKey(r => r.CoachId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(r => r.Client)
             .WithMany()
             .HasForeignKey(r => r.ClientUserId)
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

        model.Entity<CoachNutritionPlan>(e =>
        {
            e.HasIndex(p => new { p.CoachId, p.PlanId }).IsUnique();
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

        // One row per (user, client id). Without this a push repeating an id inserted
        // duplicates, and every later push of that id then failed (SyncEndpoints).
        model.Entity<SyncedWorkoutSession>(e => e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique());
        model.Entity<SyncedSplit>(e => e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique());

        model.Entity<SyncedCheckinSubmission>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User)
             .WithMany()
             .HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // A user's library items. Kind is read from DataJson on push; no database default
        // on SharedWithClients (a default of true would override an explicit false).
        model.Entity<SyncedExercise>(e =>
        {
            e.Property(s => s.Kind).HasMaxLength(16);
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
        });

        // Client-owned nutrition rows — all the same shape (see Data/Entities/Nutrition.cs).
        model.Entity<SyncedNutritionDay>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<SyncedCustomFood>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<SyncedRecipe>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<SyncedFavoriteFood>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<SyncedMealTemplate>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<SyncedWeightEntry>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Personal habits + their check-offs — same shape (see Data/Entities/Habits.cs).
        model.Entity<SyncedHabit>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<SyncedHabitEntry>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Coach-assigned habits — coach→client, same shape as CheckinSchedule.
        model.Entity<CoachHabit>(e =>
        {
            e.HasIndex(h => new { h.CoachId, h.HabitId }).IsUnique();
            e.HasIndex(h => new { h.RecipientUserId, h.SyncedAt });
            e.HasOne(h => h.Coach)
             .WithMany()
             .HasForeignKey(h => h.CoachId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(h => h.Recipient)
             .WithMany()
             .HasForeignKey(h => h.RecipientUserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(h => h.Relationship)
             .WithMany()
             .HasForeignKey(h => h.RelationshipId)
             .OnDelete(DeleteBehavior.SetNull);
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

        // Plugins built on the dashboard (see Data/Entities/Plugins.cs).
        model.Entity<HostedPlugin>(e =>
        {
            e.HasIndex(p => p.PluginId).IsUnique();
            e.HasIndex(p => p.DraftToken).IsUnique();
            e.HasIndex(p => p.LinkToken).IsUnique();
            e.HasIndex(p => p.OwnerId);
            e.HasOne(p => p.Owner).WithMany().HasForeignKey(p => p.OwnerId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<PluginRelease>(e =>
        {
            e.HasIndex(r => new { r.HostedPluginId, r.Version }).IsUnique();
            e.HasIndex(r => r.Status);
            e.HasOne(r => r.Plugin).WithMany(p => p.Releases).HasForeignKey(r => r.HostedPluginId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Installed plugins, same shape as habits.
        model.Entity<SyncedPluginInstall>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Saved Insights charts, same shape as habits plus the coach who sent one.
        model.Entity<SyncedInsightChart>(e =>
        {
            e.HasIndex(s => new { s.UserId, s.SyncedAt });
            e.HasIndex(s => new { s.UserId, s.ClientId }).IsUnique();
            e.HasIndex(s => s.SentByUserId);
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
