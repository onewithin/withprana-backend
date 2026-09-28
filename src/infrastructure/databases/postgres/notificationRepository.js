export class NotificationRepository {
  constructor(prisma) {
    if (!prisma) {
      throw new Error("Prisma client is required");
    }
    this.prisma = prisma;
  }

  async createNotification(data) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId: data.userId,
          title: data.title,
          body: data.body,
          imageUrl: data.imageUrl || null,
          type: data.type || "GENERAL",
        },
      });
    } catch (error) {
      console.error("Error creating single notification:", error);
      throw error;
    }
  }

  async createBatch(notifications) {
    try {
      const result = await this.prisma.notification.createMany({
        data: notifications,
        skipDuplicates: true
      });
      return result;
    } catch (error) {
      console.error("Error batch creating notifications:", error);
      throw error;
    }
  }

  async getByUserId(userId, { cursor, limit = 20 } = {}) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationsClearedAt: true }
      });
      
      const clearedAt = user?.notificationsClearedAt || new Date(0);
      const takeCount = parseInt(limit, 10);
      const dateCursor = cursor ? new Date(cursor) : new Date();

      const personalNotifications = await this.prisma.notification.findMany({
        where: {
          userId,
          isDeleted: false,
          createdAt: {
            gt: clearedAt,
            lt: dateCursor
          }
        },
        orderBy: { createdAt: 'desc' },
        take: takeCount,
      });

      const globalNotifications = await this.prisma.globalNotification.findMany({
        where: {
          createdAt: {
            gt: clearedAt,
            lt: dateCursor
          },
          deletedBy: {
            none: { userId }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: takeCount,
      });

      const merged = [...personalNotifications, ...globalNotifications]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, takeCount);

      const nextCursor = merged.length > 0 ? merged[merged.length - 1].createdAt.toISOString() : null;

      return {
        data: merged,
        pagination: {
          nextCursor,
          limit: takeCount
        }
      };
    } catch (error) {
      console.error("Error finding notifications by user ID:", error);
      throw error;
    }
  }

  async markAsViewed(id, userId) {
    try {
      const result = await this.prisma.notification.updateMany({
        where: { id, userId },
        data: { viewed: true }
      });
      return result;
    } catch (error) {
      console.error("Error marking notification as viewed:", error);
      throw error;
    }
  }

  async markAllAsViewed(userId) {
    try {
      const result = await this.prisma.notification.updateMany({
        where: { userId, viewed: false },
        data: { viewed: true }
      });
      return result;
    } catch (error) {
      console.error("Error marking all notifications as viewed:", error);
      throw error;
    }
  }

  async deleteOne(id, userId) {
    try {
      const personal = await this.prisma.notification.findFirst({
        where: { id, userId }
      });
      if (personal) {
        return await this.prisma.notification.update({
          where: { id },
          data: { isDeleted: true, viewed: true }
        });
      }

      const globalNote = await this.prisma.globalNotification.findUnique({
        where: { id }
      });
      if (globalNote) {
        return await this.prisma.userDeletedGlobalNotification.create({
          data: {
            userId,
            globalNotificationId: id
          }
        });
      }
      
      throw new Error("Notification not found");
    } catch (error) {
      console.error("Error deleting notification:", error);
      throw error;
    }
  }

  async clearAll(userId) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { notificationsClearedAt: new Date() }
      });
    } catch (error) {
      console.error("Error clearing all notifications:", error);
      throw error;
    }
  }
}
