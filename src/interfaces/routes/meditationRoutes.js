import { MeditationRepository } from "../../infrastructure/databases/postgres/meditationRepository.js";
import { MeditationUsecase } from "../../domain/usecases/meditationUsecase.js";
import { MeditationController } from "../controllers/meditationController.js";
import fastifyMultipart from "@fastify/multipart";
import sharp from "sharp";
import { uploadToS3, generatePresignedUrl, moveS3Object } from "../../infrastructure/services/uploadToS3.js";
import {
  convertToHLS,
  removeFolder,
} from "../../infrastructure/services/convertToHLS.js";
import { MeditationWatchHistoryRepository } from "../../infrastructure/databases/postgres/meditationHistoryRepository.js";

export const meditationRoutes = async (
  app,
  { prismaRepository, meditationQueue },
) => {
  const repo = new MeditationRepository(prismaRepository.prisma);
  const watchHistoryRepo = new MeditationWatchHistoryRepository(
    prismaRepository.prisma,
  );
  const usecase = new MeditationUsecase(
    repo,
    watchHistoryRepo,
    meditationQueue,
  );
  const controller = new MeditationController(usecase);

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 5,
    },
    attachFieldsToBody: true,
  });

  app.get("/presigned-url", async (req, reply) => {
    try {
      const { fileName, fileType } = req.query;
      if (!fileName || !fileType) {
        return reply.status(400).send({ error: "fileName and fileType are required query parameters" });
      }
      
      const result = await generatePresignedUrl(fileName, fileType);
      return reply.send(result);
    } catch (error) {
      console.error("Presigned URL error:", error);
      return reply.status(500).send({ error: "Failed to generate presigned URL" });
    }
  });

  app.post("/", async (req, reply) => {
    let audioDir = "";
    try {
      const {
        title,
        description,
        duration,
        categoryId,
        audioFile,
        thumbnail,
        isPremium,
        active,
        subcategoryId,
        type,
        tags,
        schedule,
        appImg,
      } = req.body;

      let audioFileUrl = null;
      let thumbnailUrl = null;
      let appImgUrl = null;
      let originalAudioKey = null;

      if (audioFile?.file) {
        const buffer = await audioFile.toBuffer();

        const originalFileName = audioFile.filename || `original_audio_${Date.now()}.mp3`;
        const originalFile = {
            buffer: buffer,
            originalname: originalFileName
        };
        await uploadToS3(originalFile, "audio");
        originalAudioKey = `audio/${originalFileName}`;

        const { outputDir, manifestPath } = await convertToHLS(buffer);
        audioDir = outputDir;

        const audio = await uploadToS3(
          outputDir,
          `audio/${title?.value}-${Date.now()}`,
        );
        audioFileUrl = audio[0];
      } else if (typeof audioFile === "object" && audioFile.value && typeof audioFile.value === "string") {
        const s3Key = audioFile.value.trim();
        if (s3Key.startsWith("audio/tmp/")) {
          const newKey = s3Key.replace("audio/tmp/", "audio/");
          audioFileUrl = await moveS3Object(s3Key, newKey);
          originalAudioKey = newKey;
        } else {
          audioFileUrl = s3Key;
        }
      } else if (typeof audioFile === "string" && audioFile.trim() !== "") {
        const s3Key = audioFile.trim();
        if (s3Key.startsWith("audio/tmp/")) {
          const newKey = s3Key.replace("audio/tmp/", "audio/");
          audioFileUrl = await moveS3Object(s3Key, newKey);
          originalAudioKey = newKey;
        } else {
          audioFileUrl = s3Key;
        }
      }

      if (!audioFileUrl) {
        return reply.status(400).send({
          error: "Audio file is required",
          message:
            "The link field cannot be null. Please upload an audio file.",
        });
      }

      if (thumbnail?.file) {
        const originalBuffer = await thumbnail.toBuffer();
        
        // Upload original image
        const originalFile = {
          buffer: originalBuffer,
          originalname: thumbnail.filename || 'thumbnail.jpg'
        };
        const uploadedOriginal = await uploadToS3(originalFile, "images");
        thumbnailUrl = uploadedOriginal;
        
        // Resize and upload appImg
        const resizedBuffer = await sharp(originalBuffer)
          .resize({
            width: 1000,
            height: 1100,
            fit: sharp.fit.contain,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .webp({ quality: 80 })
          .toBuffer();
          
        const resizedFile = {
          buffer: resizedBuffer,
          originalname: `appImg_${Date.now()}.webp`
        };
        const uploadedResized = await uploadToS3(resizedFile, "images");
        appImgUrl = uploadedResized;

      } else if (typeof thumbnail === "string" && thumbnail.trim() !== "") {
        thumbnailUrl = thumbnail;
      }
      
      if (typeof appImg === "string" && appImg.trim() !== "") {
        appImgUrl = appImg;
      }

      let parsedTags = [];
      if (tags) {
        if (tags.value) {
          try {
            parsedTags = JSON.parse(tags.value);
          } catch (e) {
            parsedTags = tags.value
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag);
          }
        } else if (typeof tags === "string") {
          try {
            parsedTags = JSON.parse(tags);
            console.log("✅ Successfully parsed JSON tags:", parsedTags);
          } catch (e) {
            console.log(
              "❌ JSON parse failed, treating as comma-separated string",
            );
            parsedTags = tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag);
            console.log("✅ Comma-separated tags:", parsedTags);
          }
        } else if (Array.isArray(tags)) {
          console.log("🔍 Tags is already an array");
          parsedTags = tags
            .map((tag) => (typeof tag === "object" ? tag.value || tag.id : tag))
            .filter((tag) => tag);
          console.log("✅ Processed array tags:", parsedTags);
        } else {
          console.log("❌ Tags format not recognized:", tags);
        }
      } else {
        console.log("⚠️ No tags provided or tags is null/undefined");
      }

      const payload = {
        title: typeof title === "object" ? title.value : title,
        description:
          typeof description === "object" ? description.value : description,
        duration: (() => {
          const raw = typeof duration === "object" ? duration.value : duration;
          if (typeof raw === 'string' && raw.includes(':')) {
            const [mins, secs] = raw.split(':').map(Number);
            return (mins * 60) + (secs || 0);
          }
          return parseInt(raw);
        })(),
        categoryId:
          typeof categoryId === "object" ? categoryId.value : categoryId,
        link: audioFileUrl,
        originalAudioKey: originalAudioKey,
        thumbnail: thumbnailUrl ? (Array.isArray(thumbnailUrl) ? thumbnailUrl[0] : thumbnailUrl) : "",
        appImg: appImgUrl ? (Array.isArray(appImgUrl) ? appImgUrl[0] : appImgUrl) : null,
        isPremium:
          typeof isPremium === "object"
            ? isPremium.value === "true"
            : Boolean(isPremium),
        active:
          typeof active === "object"
            ? active.value === "true"
            : Boolean(active),
        subcategoryId:
          typeof subcategoryId === "object"
            ? subcategoryId.value
            : subcategoryId,
        type: typeof type === "object" ? type.value : type,
        tags: parsedTags.tags,
        scheduledAt: schedule?.value ? new Date(schedule?.value) : null,
        active: schedule?.value ? false : true,
      };
      await controller.create({ ...req, body: payload }, reply);
    } catch (error) {
      console.error("Meditation creation error:", error);
      reply.status(500).send({
        error: "Failed to create meditation",
        details: error.message,
      });
    } finally {
      removeFolder(audioDir);
    }
  });

  app.patch("/:id", async (req, reply) => {
    let audioDir = "";
    try {
      const { id } = req.params; // <-- get id from params

      const {
        title,
        description,
        duration,
        categoryId,
        audioFile,
        thumbnail,
        isPremium,
        active,
        subcategoryId,
        type,
        appImg,
        tags,
      } = req.body;

      let audioFileUrl = null;
      let thumbnailUrl = null;
      let appImgUrl = null;
      let originalAudioKey = null;

      if (audioFile?.file) {
        const buffer = await audioFile.toBuffer();

        const originalFileName = audioFile.filename || `original_audio_${Date.now()}.mp3`;
        const originalFile = {
            buffer: buffer,
            originalname: originalFileName
        };
        await uploadToS3(originalFile, "audio");
        originalAudioKey = `audio/${originalFileName}`;

        const { outputDir, manifestPath } = await convertToHLS(buffer);
        audioDir = outputDir;

        const audio = await uploadToS3(
          outputDir,
          `audio/${title?.value}-${Date.now()}`,
        );
        audioFileUrl = audio[0];
      } else if (typeof audioFile === "object" && audioFile.value && typeof audioFile.value === "string") {
        const s3Key = audioFile.value.trim();
        if (s3Key.startsWith("audio/tmp/")) {
          const newKey = s3Key.replace("audio/tmp/", "audio/");
          audioFileUrl = await moveS3Object(s3Key, newKey);
          originalAudioKey = newKey;
        } else {
          audioFileUrl = s3Key;
        }
      } else if (typeof audioFile === "string" && audioFile.trim() !== "") {
        const s3Key = audioFile.trim();
        if (s3Key.startsWith("audio/tmp/")) {
          const newKey = s3Key.replace("audio/tmp/", "audio/");
          audioFileUrl = await moveS3Object(s3Key, newKey);
          originalAudioKey = newKey;
        } else {
          audioFileUrl = s3Key;
        }
      }

      if (thumbnail?.file) {
        const originalBuffer = await thumbnail.toBuffer();
        
        // Upload original image
        const originalFile = {
          buffer: originalBuffer,
          originalname: thumbnail.filename || 'thumbnail.jpg'
        };
        const uploadedOriginal = await uploadToS3(originalFile, "images");
        thumbnailUrl = uploadedOriginal;
        
        // Resize and upload appImg
        const resizedBuffer = await sharp(originalBuffer)
          .resize({
            width: 1000,
            height: 1100,
            fit: sharp.fit.contain,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .webp({ quality: 80 })
          .toBuffer();
          
        const resizedFile = {
          buffer: resizedBuffer,
          originalname: `appImg_${Date.now()}.webp`
        };
        const uploadedResized = await uploadToS3(resizedFile, "images");
        appImgUrl = uploadedResized;

      } else if (typeof thumbnail === "string" && thumbnail.trim() !== "") {
        thumbnailUrl = thumbnail;
      }

      if (typeof appImg === "string" && appImg.trim() !== "") {
        appImgUrl = appImg;
      }

      let parsedTags = undefined;
      if (tags !== undefined) {
        const rawTags = typeof tags === "object" && tags.value !== undefined ? tags.value : tags;
        if (typeof rawTags === "string") {
          try {
            parsedTags = JSON.parse(rawTags);
          } catch (e) {
            parsedTags = rawTags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag);
          }
        } else if (Array.isArray(rawTags)) {
          parsedTags = rawTags
            .map((tag) => (typeof tag === "object" ? tag.value || tag.id : tag))
            .filter((tag) => tag);
        }
      }

      const updatePayload = {
        ...(title !== undefined && {
          title: typeof title === "object" ? title.value : title,
        }),
        ...(description !== undefined && {
          description:
            typeof description === "object" ? description.value : description,
        }),
        ...(duration !== undefined && {
          duration: (() => {
            const raw = typeof duration === "object" ? duration.value : duration;
            if (typeof raw === 'string' && raw.includes(':')) {
              const [mins, secs] = raw.split(':').map(Number);
              return (mins * 60) + (secs || 0);
            }
            return parseInt(raw);
          })(),
        }),
        ...(categoryId !== undefined && {
          categoryId:
            typeof categoryId === "object" ? categoryId.value : categoryId,
        }),
        ...(subcategoryId !== undefined && {
          subcategoryId:
            typeof subcategoryId === "object"
              ? subcategoryId.value
              : subcategoryId,
        }),
        ...(type !== undefined && {
          type: typeof type === "object" ? type.value : type,
        }),
        ...(audioFileUrl && { link: audioFileUrl }),
        ...(originalAudioKey && { originalAudioKey: originalAudioKey }),
        ...(thumbnailUrl && { thumbnail: Array.isArray(thumbnailUrl) ? thumbnailUrl[0] : thumbnailUrl }),
        ...(appImgUrl && { appImg: Array.isArray(appImgUrl) ? appImgUrl[0] : appImgUrl }),
        ...(isPremium !== undefined && {
          isPremium:
            typeof isPremium === "object"
              ? isPremium.value === "true"
              : Boolean(isPremium),
        }),
        ...(active !== undefined && {
          active:
            typeof active === "object"
              ? active.value === "true"
              : Boolean(active),
        }),
        ...(parsedTags !== undefined && { tags: parsedTags }),
      };

      await controller.update({ id, data: updatePayload }, reply);
    } catch (error) {
      console.error("Meditation update error:", error);
      reply.status(500).send({
        error: "Failed to update meditation",
        details: error.message,
      });
    } finally {
      removeFolder(audioDir);
    }
  });

  app.get("/", (req, reply) => controller.getAll(req, reply));
  app.get("/:id", (req, reply) => controller.getById(req, reply));
  app.get("/subcategory", (req, reply) =>
    controller.getMeditationBySubCategoryId(req, reply),
  );
  app.get("/category", (req, reply) =>
    controller.getMeditationByCategoryId(req, reply),
  );
  app.get("/download/:id", (req, reply) => controller.getDownloadUrl(req, reply));
  app.delete("/:id", (req, reply) => controller.delete(req, reply));

  // Get meditations by the current user's selected tags
  app.get("/by-user-tags", (req, reply) =>
    controller.getByUserSelectedTags(req, reply),
  );
  app.get("/tag/:id", (req, reply) =>
    controller.getMeditationsByTagId(req, reply),
  );
  app.put("/watch-time", (req, reply) =>
    controller.updateMeditationTime(req, reply),
  );
  app.get("/history", (req, reply) => controller.getWatchHistory(req, reply));
};
