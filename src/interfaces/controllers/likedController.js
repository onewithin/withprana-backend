export class LikedController {
  constructor(likedUsecase) {
    this.likedUsecase = likedUsecase;
  }

  // POST /liked/like
  async likeMeditation(request, reply) {
    try {
      const { userId, meditationId } = request.body;

      if (!userId || !meditationId) {
        return reply.status(400).send({
          success: false,
          message: "Missing userId or meditationId in request body",
        });
      }

      const liked = await this.likedUsecase.likeMeditation(
        userId,
        meditationId,
      );

      return reply.send({ success: true, message: "Meditation liked", liked });
    } catch (error) {
      console.error("Error in likeMeditation:", error);
      return reply.status(500).send({
        success: false,
        message: "Error liking meditation",
        error: error.message || error,
      });
    }
  }

  // DELETE /liked/dislike
  async dislikeMeditation(request, reply) {
    try {
      const { userId, meditationId } = request.body;

      if (!userId || !meditationId) {
        return reply.status(400).send({
          success: false,
          message: "Missing userId or meditationId in request body",
        });
      }

      await this.likedUsecase.dislikeMeditation(userId, meditationId);

      return reply.send({ success: true, message: "Meditation removed from favourites" });
    } catch (error) {
      console.error("Error in dislikeMeditation:", error);
      return reply.status(500).send({
        success: false,
        message: "Error disliking meditation",
        error: error.message || error,
      });
    }
  }

  // GET /liked/user/:userId
  async getLikedMeditations(request, reply) {
    try {
      const { userId } = request.params;
      const { categoryId, type, limit, skip } = request.query;
      if (!userId) {
        return reply.status(400).send({
          success: false,
          message: "Missing userId in request params",
        });
      }

      const likedMeditations = await this.likedUsecase.getLikedMeditations(
        userId,
        categoryId,
        type,
        limit,
        skip,
      );

      return reply.send({ success: true, likedMeditations });
    } catch (error) {
      if (
        error.message === "No liked meditations found" ||
        error.message.includes("No liked meditations found")
      ) {
        return reply.status(404).send({
          success: false,
          message: "No liked meditations found for this user",
          likedMeditations: [],
        });
      }
      console.error("Error in getLikedMeditations:", error);
      return reply.status(500).send({
        success: false,
        message: "Error retrieving liked meditations",
        error: error.message || error,
      });
    }
  }

  // GET /liked/check?userId=...&meditationId=...
  async isMeditationLiked(request, reply) {
    try {
      const { userId, meditationId } = request.query;

      if (!userId || !meditationId) {
        return reply.status(400).send({
          success: false,
          message: "Missing userId or meditationId in query",
        });
      }

      const isLiked = await this.likedUsecase.isMeditationLiked(
        userId,
        meditationId,
      );

      return reply.send({ success: true, isLiked });
    } catch (error) {
      console.error("Error in isMeditationLiked:", error);
      return reply.status(500).send({
        success: false,
        message: "Error checking liked status",
        error: error.message || error,
      });
    }
  }
}
