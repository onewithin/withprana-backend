export class DownloadedMeditationController {
  constructor(downloadedMeditationUseCases) {
    this.useCases = downloadedMeditationUseCases;
  }

  async add(req, reply) {
    try {
      const { meditationId } = req.body;
      const user = req.user;

      if (!meditationId) {
        return reply.status(400).send({ message: "meditationId is required" });
      }

      const result = await this.useCases.addToDownloads(user.id, meditationId);
      reply.send(result);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }

  async remove(req, reply) {
    try {
      const { meditationId } = req.params;
      const user = req.user;

      await this.useCases.removeFromDownloads(user.id, meditationId);
      reply.send({ message: "Removed from downloads successfully" });
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }

  async getAll(req, reply) {
    try {
      const { limit, page } = req.query;
      const user = req.user;

      const result = await this.useCases.getDownloadedMeditations(
        user.id,
        limit,
        page,
      );
      reply.send(result);
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }
}
