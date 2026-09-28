import { CategoryRepository } from "../../infrastructure/databases/postgres/categoryRepository.js";
import { CategoryUsecase } from "../../domain/usecases/categoryUsecase.js";
import { CategoryController } from "../controllers/categoryController.js";
import fastifyMultipart from "@fastify/multipart";
import { uploadToS3 } from "../../infrastructure/services/uploadToS3.js";

export const categoryRoutes = async (app, { prismaRepository }) => {
  const repo = new CategoryRepository(prismaRepository.prisma);
  const usecase = new CategoryUsecase(repo);
  const controller = new CategoryController(usecase);

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 2
    },
    attachFieldsToBody: true
  });

  app.post("/", async (req, reply) => {
    try {
      const { name, backgroundImage, icon, color } = req.body;

      let backgroundImageUrl = null;
      let iconUrl = null;

      if (backgroundImage?.file) {
        const image = await uploadToS3(backgroundImage, "images");
        backgroundImageUrl = image[0] || null;
      } else if (
        backgroundImage &&
        typeof backgroundImage.value === "string" &&
        backgroundImage.value.trim() !== ""
      ) {
        backgroundImageUrl = backgroundImage.value;
      } else if (
        typeof backgroundImage === "string" &&
        backgroundImage.trim() !== ""
      ) {
        backgroundImageUrl = backgroundImage;
      }

      if (icon?.file) {
        const image = await uploadToS3(icon, "images");
        iconUrl = image[0] || null;
      } else if (
        icon &&
        typeof icon.value === "string" &&
        icon.value.trim() !== ""
      ) {
        iconUrl = icon.value;
      } else if (typeof icon === "string" && icon.trim() !== "") {
        iconUrl = icon;
      }

      const payload = {
        name: typeof name === "object" ? name.value : name,
        backgroundImage: backgroundImageUrl,
        icon: iconUrl,
        color: typeof color === "object" ? color.value : color,
      };

      await controller.create({ ...req, body: payload }, reply);
    } catch (error) {
      console.error("Form data processing error:", error);
      reply
        .status(500)
        .send({ error: "Failed to process form data", details: error.message });
    }
  });


  app.patch("/:id", async (req, reply) => {
    try {
      const { name, backgroundImage, icon, color } = req.body;

      let backgroundImageUrl;
      let iconUrl;

      if (backgroundImage?.file) {
        const image = await uploadToS3(backgroundImage, "images");
        backgroundImageUrl = image[0] || null;
      } else if (
        backgroundImage &&
        typeof backgroundImage.value === "string"
      ) {
        backgroundImageUrl = backgroundImage.value;
      } else if (typeof backgroundImage === "string") {
        backgroundImageUrl = backgroundImage;
      }

      if (icon?.file) {
        const image = await uploadToS3(icon, "images");
        iconUrl = image[0] || null;
      } else if (icon && typeof icon.value === "string") {
        iconUrl = icon.value;
      } else if (typeof icon === "string") {
        iconUrl = icon;
      }

      const normalizedName = typeof name === "object" ? name.value : name;
      const normalizedColor = typeof color === "object" ? color.value : color;

      req.body = {
        ...(normalizedName !== undefined && { name: normalizedName }),
        ...(normalizedColor !== undefined && { color: normalizedColor }),
        ...(backgroundImageUrl !== undefined && {
          backgroundImage: backgroundImageUrl,
        }),
        ...(iconUrl !== undefined && { icon: iconUrl }),
      };

      await controller.update(req, reply);
    } catch (error) {
      console.error("Update form data processing error:", error);
      reply
        .status(500)
        .send({ error: "Failed to process update form data", details: error.message });
    }
  });

  app.get("/", (req, reply) => controller.getAll(req, reply));
  app.get("/:id", (req, reply) => controller.getById(req, reply));
  app.delete("/:id", (req, reply) => controller.delete(req, reply));
};
