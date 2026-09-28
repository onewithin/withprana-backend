import { prisma } from "../../config/database.js";
import { NotificationService } from "./notificationService.js";
import { PrismaUserRepository } from "../databases/postgres/userRepository.js";
import { decryptDeterministic } from "../../utils/encryption.js";

export class InactivityService {
  constructor() {
    this.notificationService = new NotificationService();
    // this.userRepo = new PrismaUserRepository(prisma); // Delayed to checkInactivity
  }

  async checkInactivity() {
    // Lazy initialization to ensure prisma is ready
    if (!this.userRepo) {
      this.userRepo = new PrismaUserRepository(prisma);
    }

    try {
      console.log("⏳ Starting inactivity check...");
      await this.processWarnings();
      await this.processDeactivations();
      console.log("✅ Inactivity check completed.");
    } catch (error) {
      console.error("❌ Error in inactivity check:", error);
    }
  }

  async processWarnings() {
    // 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const usersToWarn = await prisma.userLoginLog.findMany({
      where: {
        lastLogin: { lt: sixMonthsAgo },
        warningSent: false,
        user: { active: true }, // Only warn active users
      },
      include: { user: true },
    });

    console.log(`⚠️ Found ${usersToWarn.length} users to warn.`);

    for (const log of usersToWarn) {
      try {
        const email = decryptDeterministic(log.user.email);
        await this.warnUser(email, log.user.fcmToken);

        await prisma.userLoginLog.update({
          where: { id: log.id },
          data: { warningSent: true },
        });
        console.log(`📧 Warning sent to user ${log.userId}`);
      } catch (error) {
        console.error(`❌ Failed to warn user ${log.userId}:`, error);
      }
    }
  }

  async processDeactivations() {
    // 7 months ago (1 month after warning)
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);

    const usersToDeactivate = await prisma.userLoginLog.findMany({
      where: {
        lastLogin: { lt: sevenMonthsAgo },
        user: { active: true },
        // We act on users who have presumably been warned or are just very old
      },
      include: { user: true },
    });

    console.log(`🚫 Found ${usersToDeactivate.length} users to deactivate.`);

    for (const log of usersToDeactivate) {
      try {
        const email = decryptDeterministic(log.user.email);

        // Deactivate user
        await prisma.user.update({
          where: { id: log.userId },
          data: {
            active: false,
            systemDeactivated: true,
          },
        });

        await this.deactivateUser(email, log.user.fcmToken);
        console.log(`zzz Deactivated user ${log.userId}`);
      } catch (error) {
        console.error(`❌ Failed to deactivate user ${log.userId}:`, error);
      }
    }
  }

  async warnUser(email, fcmToken) {
    const subject = "Action Required: Account Inactivity Warning";
    const text =
      "Your account has been inactive for 6 months. It will be deactivated in 1 month if you do not log in.";
    const html =
      "<p>Your account has been inactive for 6 months. It will be <strong>deactivated in 1 month</strong> if you do not log in.</p><p>Please log in to keep your account active.</p>";

    await this.notificationService.sendEmail(email, subject, text, html);
    await this.notificationService.sendPushNotification(
      fcmToken,
      "Inactivity Warning",
      text,
    );
  }

  async deactivateUser(email, fcmToken) {
    const subject = "Account Deactivated";
    const text =
      "Your account has been deactivated due to inactivity. You can reactivate it anytime by logging in.";
    const html =
      "<p>Your account has been <strong>deactivated</strong> due to inactivity.</p><p>You can reactivate it anytime simply by logging in.</p>";

    await this.notificationService.sendEmail(email, subject, text, html);
    await this.notificationService.sendPushNotification(
      fcmToken,
      "Account Deactivated",
      text,
    );
  }
}
