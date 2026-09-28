export class MeditationController {
  constructor(meditationUsecase) {
    this.meditationUsecase = meditationUsecase;
  }

  async createMeditation(meditationData) {
    try {
      console.log("data", meditationData);
      const meditation =
        await this.meditationUsecase.createMeditation(meditationData);
      return meditation;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async create(req, reply) {
    try {
      const {
        title,
        description,
        duration,
        link,
        originalAudioKey,
        thumbnail,
        appImg,
        isPremium,
        categoryId,
        subcategoryId,
        type,
        tags,
        scheduledAt,
        active,
      } = req.body;
      const file = req.file;

      const meditationData = {
        title,
        description,
        duration: Number(duration),
        link,
        originalAudioKey,
        thumbnail,
        appImg,
        isPremium: isPremium === "true" || isPremium === true,
        categoryId: categoryId,
        subcategoryId: subcategoryId || null,
        type,
        tags,
        scheduledAt,
        active,
      };

      const meditation =
        await this.meditationUsecase.createMeditation(meditationData);
      reply.send(meditation);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }

  async getById(req, reply) {
    try {
      const id = req.params.id;
      const user = req.user;
      const meditation = await this.meditationUsecase.getMeditationById(
        id,
        user,
      );
      reply.send(meditation);
    } catch (err) {
      reply.status(404).send({ message: err.message });
    }
  }

  async getMeditationBySubCategoryId(req, reply) {
    try {
      const id = req.query.id;
      const user = req.user;
      console.log(id);
      const meditation =
        await this.meditationUsecase.getMeditationBySubCategoryId(id, user);
      reply.send(meditation);
    } catch (err) {
      reply.status(404).send({ message: err.message });
    }
  }

  async getMeditationByCategoryId(req, reply) {
    try {
      const id = req.query.id;
      console.log(id);
      const meditation =
        await this.meditationUsecase.getMeditationByCategoryId(id);
      reply.send(meditation);
    } catch (err) {
      reply.status(404).send({ message: err.message });
    }
  }

  async getAll(req, reply) {
    try {
      const { limit, page, sort, order, search, isPremium, categoryId } = req.query;
      const meditations = await this.meditationUsecase.getAllMeditations(
        limit,
        page,
        sort,
        order,
        search,
        isPremium,
        categoryId,
      );
      reply.send(meditations);
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }

  async getByUserSelectedTags(req, reply) {
    try {
      const user = req.user;
      const { limit, page, sort, order } = req.query || {};
      const result =
        await this.meditationUsecase.getMeditationsByUserSelectedTags(
          user?.id,
          limit,
          page,
          sort,
          order,
        );
      reply.send(result);
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }

  async update(req, reply) {
    try {
      const id = req.id;
      const data = req.data;

      const updatedMeditation = await this.meditationUsecase.updateMeditation(
        id,
        data,
      );

      if (!updatedMeditation) {
        return reply.status(404).send({ error: "Meditation not found" });
      }

      return reply.send(updatedMeditation);
    } catch (error) {
      console.error("Update error:", error);
      return reply.status(500).send({
        error: "Failed to update meditation",
        details: error.message,
      });
    }
  }

  async delete(req, reply) {
    try {
      const id = req.params.id;
      const result = await this.meditationUsecase.deleteMeditation(id);
      reply.send(result);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }

  async updateMeditationTime(req, reply) {
    try {
      const { id, ...data } = req.body;
      const user = req.user;
      const result = await this.meditationUsecase.updateMeditationTime(
        user.id,
        id,
        data,
      );
      reply.send(result);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }

  async getWatchHistory(req, reply) {
    try {
      const user = req.user;
      const history = await this.meditationUsecase.getWatchHistory(user.id);
      reply.send(history);
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }

  async getMeditationsByTagId(req, reply) {
    try {
      const { id } = req.params;
      const user = req.user;
      const result = await this.meditationUsecase.getMeditationsByTagId(
        id,
        user,
      );
      reply.send(result);
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }

  async getDownloadUrl(req, reply) {
    try {
      const { id } = req.params;
      const user = req.user;
      const downloadUrl = await this.meditationUsecase.getDownloadUrl(id, user);
      reply.send({ downloadUrl });
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }
}
