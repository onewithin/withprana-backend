import { NotificationPreferencesController } from "../controllers/notificationPreferencesController.js";
import { NotificationPreferencesUseCases } from "../../domain/usecases/notificationPreferencesUseCases.js";
import { NotificationPreferencesRepository } from "../../infrastructure/databases/postgres/notificationPreferencesRepository.js";

export async function notificationPreferencesRoutes(fastify, opts) {
  const repository = new NotificationPreferencesRepository(
    opts.prismaRepository.prisma,
  );
  const useCases = new NotificationPreferencesUseCases(repository);
  const controller = new NotificationPreferencesController(useCases);

  fastify.get("/preferences", async (req, reply) => {
    return controller.getPreferences(req, reply);
  });

  fastify.post("/preferences", async (req, reply) => {
    return controller.updatePreferences(req, reply);
  });
}
