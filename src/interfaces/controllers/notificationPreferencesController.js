export class NotificationPreferencesController {
  constructor(notificationPreferencesUseCases) {
    this.notificationPreferencesUseCases = notificationPreferencesUseCases;
  }

  async getPreferences(req, reply) {
    try {
      const userId = req.user.id; // Assumes auth middleware populates req.user
      const preferences =
        await this.notificationPreferencesUseCases.getPreferences(userId);
      return reply.code(200).send({
        success: true,
        preferences,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message || "Failed to fetch preferences",
      });
    }
  }

  async updatePreferences(req, reply) {
    try {
      const userId = req.user.id;
      const { preferences } = req.body;

      if (!preferences || typeof preferences !== "object") {
        return reply.code(400).send({
          success: false,
          message: "Invalid request body. 'preferences' object is required.",
        });
      }

      const updatedPreferences =
        await this.notificationPreferencesUseCases.updatePreferences(
          userId,
          preferences,
        );
      return reply.code(200).send({
        success: true,
        message: "Preferences updated successfully",
        preferences: updatedPreferences,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }
}
