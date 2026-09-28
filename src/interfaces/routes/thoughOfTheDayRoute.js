import fastifyMultipart from '@fastify/multipart';
import { ThoughtOfTheDayUsecase } from '../../domain/usecases/thoughOfTheDayUsecase.js';
import { ThoughtOfTheDayRepository } from '../../infrastructure/databases/postgres/thoughOfTheDayRepository.js';
import { ThoughtOfTheDayController } from '../controllers/thoughOfTheDayController.js';
import { convertToHLS, removeFolder } from '../../infrastructure/services/convertToHLS.js';
import { uploadToS3 } from '../../infrastructure/services/uploadToS3.js';

export const thoughtRoutes = (app, { prismaRepository, thoughtQueue }) => {
  const thoughtRepository = new ThoughtOfTheDayRepository(prismaRepository.prisma);
  const thoughtUsecase = new ThoughtOfTheDayUsecase(thoughtRepository, thoughtQueue);
  const thoughtController = new ThoughtOfTheDayController(thoughtUsecase);

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 5,
    },
    attachFieldsToBody: true,
  });

  app.post('/', async (req, reply) => {
    let audioDir = ''
    try {
      const {
        title,
        description,
        duration,
        scheduledAt,
        thumbnail,
        link,
        scheduleNow,
        tags,
      } = req.body;

      // Handle file uploads or use string URLs
      let thumbnailUrl = null;
      let linkUrl = null;

      if (thumbnail?.file) {
        let image = await uploadToS3(thumbnail, "images")
        thumbnailUrl = image[0]
      } else if (typeof thumbnail === 'string') {
        thumbnailUrl = thumbnail;
      }

      if (link?.file) {
        const buffer = await link.toBuffer();
        const { outputDir, manifestPath } = await convertToHLS(buffer);
        audioDir = outputDir

        const audio = await uploadToS3(outputDir, `audio/${title?.value}-${Date.now()}`);
        linkUrl = audio[0]
      } else if (typeof link === 'string') {
        linkUrl = link;
      }

      // Parse tags if necessary
      let parsedTags = [];
      if (tags) {
        try {
          parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
          if (!Array.isArray(parsedTags)) parsedTags = [parsedTags];
        } catch {
          parsedTags = tags.split(',').map(t => t.trim());
        }
      }

      const payload = {
        title: typeof title === 'object' ? title.value : title,
        description: typeof description === 'object' ? description.value : description,
        duration: typeof duration === 'object' ? duration.value : duration,
        scheduledAt: scheduledAt?.value ? new Date(scheduledAt?.value) : undefined,
        scheduleNow: scheduleNow?.value === 'true' || scheduleNow?.value === true,
        thumbnail: thumbnailUrl || '',
        link: linkUrl || ''
      };


      await thoughtController.createThought({ ...req, body: payload }, reply);
    } catch (error) {
      console.error('Error creating thought:', error);
      reply.status(500).send({
        error: 'Failed to create thought',
        details: error.message,
      });
    } finally {
      removeFolder(audioDir)
    }
  });

  app.post('/repost', (req, reply) => thoughtController.repostThought(req, reply));
  app.get('/', (req, reply) => thoughtController.getThoughts(req, reply));
  app.get('/today', (req, reply) => thoughtController.getTodayThought(req, reply));
  app.patch('/:id/mark-posted', (req, reply) => thoughtController.markAsPosted(req, reply));

  app.get('/:id', (req, reply) => thoughtController.getThoughtById(req, reply));

  app.patch('/:id', async (req, reply) => {
    let audioDir = ''
    try {
      const { id } = req.params;
      const { title, description, duration, scheduledAt, thumbnail, link } = req.body;

      let thumbnailUrl = undefined;
      let linkUrl = undefined;

      if (thumbnail?.file) {
        const image = await uploadToS3(thumbnail, 'images');
        thumbnailUrl = image[0];
      } else if (thumbnail?.value) {
        thumbnailUrl = thumbnail.value;
      } else if (typeof thumbnail === 'string') {
        thumbnailUrl = thumbnail;
      }

      if (link?.file) {
        const buffer = await link.toBuffer();
        const { outputDir } = await convertToHLS(buffer);
        audioDir = outputDir;
        const audio = await uploadToS3(outputDir, `audio/${title?.value || id}-${Date.now()}`);
        linkUrl = audio[0];
      } else if (link?.value) {
        linkUrl = link.value;
      } else if (typeof link === 'string') {
        linkUrl = link;
      }

      const payload = {
        ...(title !== undefined && { title: typeof title === 'object' ? title.value : title }),
        ...(description !== undefined && { description: typeof description === 'object' ? description.value : description }),
        ...(duration !== undefined && { duration: typeof duration === 'object' ? duration.value : duration }),
        ...(scheduledAt?.value && { scheduledAt: new Date(scheduledAt.value) }),
        ...(thumbnailUrl !== undefined && { thumbnail: thumbnailUrl }),
        ...(linkUrl !== undefined && { link: linkUrl }),
      };

      await thoughtController.updateThought({ ...req, params: { id }, body: payload }, reply);
    } catch (error) {
      console.error('Error updating thought:', error);
      reply.status(500).send({ error: 'Failed to update thought', details: error.message });
    } finally {
      removeFolder(audioDir);
    }
  });

  app.delete('/:id', (req, reply) => thoughtController.deleteThought(req, reply));
};
