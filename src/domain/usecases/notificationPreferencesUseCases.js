export class NotificationPreferencesUseCases {
  constructor(notificationPreferencesRepository) {
    this.notificationPreferencesRepo = notificationPreferencesRepository;
  }

  async getPreferences(userId) {
    let prefs = await this.notificationPreferencesRepo.getPreferences(userId);
    if (!prefs) {
      // Return default preferences if none exist (all true as per schema default)
      return {
        userId,
        push: true,
        mindful: true,
        newContent: true,
        tips: true,
      };
    }
    return prefs;
  }

  async updatePreferences(userId, preferences) {
    // Validate input (basic check)
    const allowedFields = ["push", "mindful", "newContent", "tips"];
    const updateData = {};

    Object.keys(preferences).forEach((key) => {
      if (
        allowedFields.includes(key) &&
        typeof preferences[key] === "boolean"
      ) {
        updateData[key] = preferences[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error("No valid preference fields provided");
    }

    return await this.notificationPreferencesRepo.updatePreferences(
      userId,
      updateData,
    );
  }
}
