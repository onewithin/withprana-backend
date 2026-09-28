export class DownloadedMeditationUseCases {
  constructor(downloadedMeditationRepository) {
    this.repository = downloadedMeditationRepository;
  }

  async addToDownloads(userId, meditationId) {
    try {
      return await this.repository.add(userId, meditationId);
    } catch (error) {
      if (error.code === "P2002") {
        throw new Error("Meditation already in download list.");
      }
      throw error;
    }
  }

  async removeFromDownloads(userId, meditationId) {
    return this.repository.remove(userId, meditationId);
  }

  async getDownloadedMeditations(userId, limit, page) {
    return this.repository.getAll(userId, limit, page);
  }
}
