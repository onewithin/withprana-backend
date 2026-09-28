import { TagRepository } from "../../infrastructure/databases/postgres/tagRepository.js";
import { TagsUsecase } from "../../domain/usecases/tagUsecase.js";
import { TagController } from "../controllers/tagController.js";

export const tagsRoutes = async (app, { prismaRepository }) => {
  const repo = new TagRepository(prismaRepository.prisma);
  const usecase = new TagsUsecase(repo);
  const controller = new TagController(usecase);

  app.post("/", (req, reply) => controller.create(req, reply));
  app.get("/", (req, reply) => controller.getAll(req, reply));
  app.delete("/:id", (req, reply) => controller.delete(req, reply));
};

