export class LikedUsecase {
  constructor(likedRepository, meditationRepository) {
    this.likedRepository = likedRepository;
    this.meditationRepository = meditationRepository;
  }

  // Like a meditation
  async likeMeditation(userId, meditationId) {
    try {
      if (!userId) {
        throw new Error('Valid user ID is required');
      }

      if (!meditationId || typeof meditationId !== 'string') {
        throw new Error('Valid meditation ID is required');
      }

      // Optionally check if the meditation exists
      const meditation = await this.meditationRepository.findById(meditationId);
      if (!meditation || meditation.isDeleted || !meditation.active) {
        throw new Error('Meditation not available to like');
      }

      return await this.likedRepository.likeMeditation(userId, meditationId);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Dislike (unlike) a meditation
  async dislikeMeditation(userId, meditationId) {
    try {
      if (!userId) {
        throw new Error('Valid user ID is required');
      }

      if (!meditationId || typeof meditationId !== 'string') {
        throw new Error('Valid meditation ID is required');
      }

      return await this.likedRepository.dislikeMeditation(userId, meditationId);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Get all liked meditations of a user
  async getLikedMeditations(userId, categoryId, type, limit, skip) {
    try {
      if (!userId) {
        throw new Error('Valid user ID is required');
      }

      const likedMeditations = await this.likedRepository.getLikedMeditations(userId, categoryId, type, limit, skip);

      if (!likedMeditations || likedMeditations.length === 0) {
        throw new Error('No liked meditations found for this user');
      }

      return likedMeditations;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Check if meditation is already liked by user
  async isMeditationLiked(userId, meditationId) {
    try {
      if (!userId) {
        throw new Error('Valid user ID is required');
      }

      if (!meditationId || typeof meditationId !== 'string') {
        throw new Error('Valid meditation ID is required');
      }

      const liked = await this.likedRepository.findLike(userId, meditationId);
      return !!liked;
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
