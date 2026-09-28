

export class ThoughtOfTheDayUsecase {
  constructor(thoughtRepository, postQueue) {
    this.thoughtRepository = thoughtRepository;
    this.postQueue = postQueue
  }

  // Create a new thought
  async createThought(data) {
    try {
      const {
        title,
        description,
        duration,
        link,
        thumbnail,
        scheduledAt,
        scheduleNow
      } = data;


      if (!title || !description || !duration || !link) {
        throw new Error('All fields are required');
      }

      const now = new Date()
      const scheduleDate = scheduledAt ? new Date(scheduledAt) : now;
      const status = (!scheduleNow && scheduleDate > now) ? 'PENDING' : 'POSTED';

      const thought = await this.thoughtRepository.create({
        title,
        description,
        duration,
        link,
        thumbnail,
        scheduledAt: scheduleDate,
        status,
      });

      if (status === 'PENDING') {
        await this.postQueue.add(
          'thoughtOfTheDayQueue',
          { thoughtId: thought.id },
          {
            delay: new Date(thought.scheduledAt).getTime() - Date.now(),
            attempts: 3, // retry if job fails
            removeOnComplete: true,
            removeOnFail: false
          }
        );
      }

      return thought;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Repost an existing thought
  async repostThought(originalId, newScheduledAt) {
    try {
      const original = await this.thoughtRepository.findById(originalId);

      if (!original) {
        throw new Error('Original thought not found');
      }

      const scheduleDate = new Date(newScheduledAt);
      const now = new Date();
      const status = scheduleDate > now ? 'PENDING' : 'REPOSTED';

      const repost = await this.thoughtRepository.create({
        title: original.title,
        description: original.description,
        duration: original.duration,
        link: original.link,
        thumbnail: original.thumbnail,
        scheduledAt: scheduleDate,
        status,
      });

      if (status === 'PENDING' && this.queueService) {
        await this.queueService.scheduleThought(repost.id, scheduleDate);
      }

      return repost;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Mark a thought as posted (used by worker/scheduler)
  async markAsPosted(thoughtId) {
    try {
      const thought = await this.thoughtRepository.findById(thoughtId);

      if (!thought) {
        throw new Error('Thought not found');
      }

      if (thought.status !== 'PENDING') {
        throw new Error('Thought is not in a schedulable state');
      }

      return await this.thoughtRepository.updateStatus(thoughtId, 'POSTED');
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Get thoughts by filter
  async getThoughts({ status = null, limit = null, skip = null, sort, order, search = null }) {
    try {
      return await this.thoughtRepository.findAll({ status, limit, skip, sort, order, search });
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Get a single thought by ID
  async getThoughtById(id) {
    try {
      return await this.thoughtRepository.findById(id);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Update a thought
  async updateThought(id, data) {
    try {
      return await this.thoughtRepository.update(id, data);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Delete a thought
  async deleteThought(id) {
    try {
      return await this.thoughtRepository.delete(id);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Get all thoughts scheduled to post now or earlier and still pending
  async getDueThoughts() {
    try {
      const now = new Date();
      return await this.thoughtRepository.getUpcomingThoughts(now);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async getTodayThought() {
    try {
      return await this.thoughtRepository.findReleasedUntilNow()
    } catch (error) {
      throw new Error(error.message)
    }
  }
}
