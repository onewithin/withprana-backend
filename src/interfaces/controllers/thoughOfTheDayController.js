export class ThoughtOfTheDayController {
  constructor(thoughtUsecase) {
    this.thoughtUsecase = thoughtUsecase;
  }

  // POST /thoughts
  async createThought(request, reply) {
    try {
      const data = request.body;

      const thought = await this.thoughtUsecase.createThought(data);

      return reply.send({
        success: true,
        message: 'Thought created successfully',
        thought,
      });
    } catch (error) {
      console.error('Error in createThought:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to create thought',
        error: error.message || error,
      });
    }
  }

  // POST /thoughts/repost
  async repostThought(request, reply) {
    try {
      const { originalId, newScheduledAt } = request.body;

      if (!originalId || !newScheduledAt) {
        return reply.status(400).send({
          success: false,
          message: 'Missing originalId or newScheduledAt',
        });
      }

      const reposted = await this.thoughtUsecase.repostThought(originalId, newScheduledAt);

      return reply.send({
        success: true,
        message: 'Thought reposted successfully',
        reposted,
      });
    } catch (error) {
      console.error('Error in repostThought:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to repost thought',
        error: error.message || error,
      });
    }
  }

  // GET /thoughts
  async getThoughts(request, reply) {
    try {
      const { status, limit = 10, page, sort, order, search } = request.query;

      const thoughts = await this.thoughtUsecase.getThoughts({ status, limit, skip: limit && page ? (Number(page) - 1) * Number(limit) : null, sort, order, search });

      return reply.send({
        success: true,
        thoughts,
      });
    } catch (error) {
      console.error('Error in getThoughts:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to get thoughts',
        error: error.message || error,
      });
    }
  }

  // PATCH /thoughts/:id/mark-posted
  async markAsPosted(request, reply) {
    try {
      const { id } = request.params;

      if (!id) {
        return reply.status(400).send({
          success: false,
          message: 'Missing thought ID in params',
        });
      }

      const result = await this.thoughtUsecase.markAsPosted(id);

      return reply.send({
        success: true,
        message: 'Thought marked as posted',
        result,
      });
    } catch (error) {
      console.error('Error in markAsPosted:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to update post status',
        error: error.message || error,
      });
    }
  }

  async getTodayThought(request, reply) {
    try {
      const thought = await this.thoughtUsecase.getTodayThought()

      return reply.send({
        success: true,
        thought,
      })
    } catch (error) {
      console.error('Error in getTodayThought:', error)
      return reply.status(500).send({
        success: false,
        message: 'Failed to get today thought',
        error: error.message || error,
      })
    }
  }

  // GET /thought/:id
  async getThoughtById(request, reply) {
    try {
      const { id } = request.params;
      const thought = await this.thoughtUsecase.getThoughtById(id);
      if (!thought) {
        return reply.status(404).send({ success: false, message: 'Thought not found' });
      }
      return reply.send({ success: true, thought });
    } catch (error) {
      console.error('Error in getThoughtById:', error);
      return reply.status(500).send({ success: false, message: 'Failed to get thought', error: error.message || error });
    }
  }

  // PATCH /thought/:id
  async updateThought(request, reply) {
    try {
      const { id } = request.params;
      const data = request.body;
      const thought = await this.thoughtUsecase.updateThought(id, data);
      return reply.send({ success: true, message: 'Thought updated successfully', thought });
    } catch (error) {
      console.error('Error in updateThought:', error);
      return reply.status(500).send({ success: false, message: 'Failed to update thought', error: error.message || error });
    }
  }

  // DELETE /thought/:id
  async deleteThought(request, reply) {
    try {
      const { id } = request.params;
      await this.thoughtUsecase.deleteThought(id);
      return reply.send({ success: true, message: 'Thought deleted successfully' });
    } catch (error) {
      console.error('Error in deleteThought:', error);
      return reply.status(500).send({ success: false, message: 'Failed to delete thought', error: error.message || error });
    }
  }
}
