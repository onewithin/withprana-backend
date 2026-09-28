export class NotificationUsecase {
  constructor(notificationRepository) {
    this.notificationRepository = notificationRepository;
  }

  async getUserNotifications(userId, params) {
    return await this.notificationRepository.getByUserId(userId, params);
  }

  async markAsViewed(id, userId) {
    return await this.notificationRepository.markAsViewed(id, userId);
  }

  async markAllAsViewed(userId) {
    return await this.notificationRepository.markAllAsViewed(userId);
  }

  async deleteNotification(id, userId) {
    return await this.notificationRepository.deleteOne(id, userId);
  }

  async clearAll(userId) {
    return await this.notificationRepository.clearAll(userId);
  }
}
