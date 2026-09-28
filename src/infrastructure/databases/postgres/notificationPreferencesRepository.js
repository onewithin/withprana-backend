export class NotificationPreferencesRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async getPreferences(userId) {
    return await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });
  }

  async updatePreferences(userId, data) {
    return await this.prisma.notificationPreferences.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }
}
