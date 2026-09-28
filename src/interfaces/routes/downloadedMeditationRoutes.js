import { DownloadedMeditationRepository } from "../../infrastructure/databases/postgres/downloadedMeditationRepository.js";
import { DownloadedMeditationUseCases } from "../../domain/usecases/downloadedMeditationUseCases.js";
import { DownloadedMeditationController } from "../controllers/downloadedMeditationController.js";

export async function downloadedMeditationRoutes(fastify, opts) {
  const repository = new DownloadedMeditationRepository(
    opts.prismaRepository.prisma,
  );
  const useCases = new DownloadedMeditationUseCases(repository);
  const controller = new DownloadedMeditationController(useCases);

  fastify.post("/", async (req, reply) => controller.add(req, reply));
  fastify.get("/", async (req, reply) => controller.getAll(req, reply));
  fastify.delete("/:meditationId", async (req, reply) =>
    controller.remove(req, reply),
  );
}
