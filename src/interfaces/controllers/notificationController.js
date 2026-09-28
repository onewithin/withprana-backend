export class NotificationController {
  constructor(notificationUsecase) {
    this.notificationUsecase = notificationUsecase;
  }

  async getMyNotifications(req, reply) {
    try {
      const userId = req.user.id || req.user._id;
      const { cursor, limit = 20 } = req.query;
      
      const result = await this.notificationUsecase.getUserNotifications(userId, { cursor, limit });
      reply.send(result);
    } catch (error) {
      console.error("Error in getMyNotifications details:", error);
      reply.status(500).send({ error: "Failed to fetch notifications" });
    }
  }

  async markAsViewed(req, reply) {
    try {
      const userId = req.user.id || req.user._id;
      const { id } = req.params;
      
      await this.notificationUsecase.markAsViewed(id, userId);
      reply.send({ success: true, message: "Notification marked as viewed" });
    } catch (error) {
      console.error("Error in markAsViewed details:", error);
      reply.status(500).send({ error: "Failed to update notification" });
    }
  }

  async markAllAsViewed(req, reply) {
    try {
      const userId = req.user.id || req.user._id;
      
      await this.notificationUsecase.markAllAsViewed(userId);
      reply.send({ success: true, message: "All notifications marked as viewed" });
    } catch (error) {
      console.error("Error in markAllAsViewed details:", error);
      reply.status(500).send({ error: "Failed to update notifications" });
    }
  }

  async deleteNotification(req, reply) {
    try {
      const userId = req.user.id || req.user._id;
      const { id } = req.params;
      
      await this.notificationUsecase.deleteNotification(id, userId);
      reply.send({ success: true, message: "Notification deleted successfully" });
    } catch (error) {
      console.error("Error in deleteNotification details:", error);
      reply.status(500).send({ error: "Failed to delete notification" });
    }
  }

  async clearAllNotifications(req, reply) {
    try {
      const userId = req.user.id || req.user._id;
      
      await this.notificationUsecase.clearAll(userId);
      reply.send({ success: true, message: "All notifications cleared successfully" });
    } catch (error) {
      console.error("Error in clearAllNotifications details:", error);
      reply.status(500).send({ error: "Failed to clear notifications" });
    }
  }
}
