import cron from "node-cron";
import { NotificationService } from "../services/notificationService.js";
import { NotificationRepository } from "../databases/postgres/notificationRepository.js";

export const initializeSubscriptionCron = (prisma) => {
  const notificationRepo = new NotificationRepository(prisma);
  const notificationService = new NotificationService(notificationRepo);

  // 1. Subscription Ending Soon (Runs daily at midnight)
  cron.schedule("0 0 * * *", async () => {
    console.log("⏳ Running subscription expiry check...");
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const startOfDay = new Date(tomorrow);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(tomorrow);
      endOfDay.setHours(23, 59, 59, 999);

      const subscriptions = await prisma.subscription.findMany({
        where: {
          status: { in: ["ACTIVE", "TRIALING"] },
          currentPeriodEnd: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
          plan: { select: { name: true } },
        },
      });

      console.log(
        `Processing ${subscriptions.length} subscriptions ending soon...`,
      );

      for (const sub of subscriptions) {
        if (sub.user) {
          await notificationService.notifyPlanRenewalReminder(
            sub.user,
            sub.plan || { name: "Subscription" },
            sub.currentPeriodEnd,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error during subscription expiry check:", error);
    }
  });

  // 2. Account Inactivity (Runs daily at 1 AM)
  cron.schedule("0 1 * * *", async () => {
    console.log("⏳ Running account inactivity check...");
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find users who last logged in 30 days ago (and haven't been warned yet today/recently)
      // Note: Logic assumes we check active users.
      // Ideally we should have a flag 'inactivityWarningSent' but for now we query by date range to avoid spamming.
      // We'll check for lastLogin exactly 30 days ago (within that day).

      const startOfDay = new Date(thirtyDaysAgo);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(thirtyDaysAgo);
      endOfDay.setHours(23, 59, 59, 999);

      // We need to look at UserLoginLog or User.lastLogin (if updated on user model? User model doesn't have lastLogin field shown in schema, but UserLoginLog has).
      // Schema has `UserLoginLog` with `lastLogin` and `userId`.
      // We'll find users whose LATEST login log is within the range.

      // Actually, checking `UserLoginLog` is complex because a user has many logs.
      // Better to rely on a `lastLoginAt` on User if it exists (it doesn't in provided schema partial, but `generateToken` updates `loginHistory` active status).
      // Let's use `UserLoginLog` where `lastLogin` is < 30 days. No, that's too heavy.

      // Alternative: Use `LoginHistory`.
      // Let's try to query `UserLoginLog` table which seems to be designed for this (one entry per user? Schema says `userId` @unique).
      // YES: model UserLoginLog { userId String @unique, lastLogin DateTime, warningSent Boolean }

      const inactiveUsers = await prisma.userLoginLog.findMany({
        where: {
          lastLogin: {
            lt: thirtyDaysAgo, // Last login was before 30 days ago
          },
          warningSent: false, // We haven't sent a warning yet
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      console.log(`Processing ${inactiveUsers.length} inactive users...`);

      for (const log of inactiveUsers) {
        if (log.user && log.user.email) {
          await notificationService.sendInactivityEmail(log.user);

          // Mark as warned so we don't spam
          await prisma.userLoginLog.update({
            where: { id: log.id },
            data: { warningSent: true },
          });
        }
      }
    } catch (error) {
      console.error("❌ Error during inactivity check:", error);
    }
  });

  // 3. Payment Due / Failed (Runs daily at 2 AM)
  cron.schedule("0 2 * * *", async () => {
    console.log("⏳ Running payment due check...");
    try {
      // Find subscriptions that are PAST_DUE
      const pastDueSubs = await prisma.subscription.findMany({
        where: {
          status: "PAST_DUE",
          // added filter to avoid spamming every day?
          // Maybe check if we updated it recently?
          // For now, let's just send it. Real production needs a 'lastNotificationSentAt' field.
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
          plan: { select: { name: true } },
        },
      });

      console.log(`Processing ${pastDueSubs.length} past due subscriptions...`);

      for (const sub of pastDueSubs) {
        if (sub.user && sub.user.email) {
          await notificationService.sendPaymentDueEmail(
            sub.user,
            sub.plan || { name: "Subscription" },
            new Date(), // Due "Now"
          );
        }
      }
    } catch (error) {
      console.error("❌ Error during payment due check:", error);
    }
  });

  // 4. Soft Delete Accounts Processing (Runs daily at 3 AM)
  cron.schedule("0 3 * * *", async () => {
    console.log("⏳ Running account deletion processor...");
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const usersToDelete = await prisma.user.findMany({
        where: {
          isDeleted: false,
          deleteRequestedAt: {
            lte: sevenDaysAgo,
          },
        },
      });

      console.log(`Processing ${usersToDelete.length} accounts for permanent soft-delete...`);

      for (const user of usersToDelete) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            isDeleted: true,
            active: false,
            deleteRequestedAt: null, // Clear the request so it's fully marked deleted
          },
        });
        console.log(`✅ Permanently soft-deleted user ${user.id}`);
      }
    } catch (error) {
      console.error("❌ Error during account deletion processing:", error);
    }
  });
};
