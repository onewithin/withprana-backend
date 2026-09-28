import fastifyMultipart from "@fastify/multipart";
import { SupportRepository } from "../../infrastructure/databases/postgres/supportRepository.js";
import { SupportUseCase } from "../../domain/usecases/supportUseCase.js";
import { SupportController } from "../../interfaces/controllers/supportController.js";

export const supportRoutes = async (app, { prismaRepository }) => {
  // Register multipart support for this scope
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
    attachFieldsToBody: true,
  });

  const supportRepository = new SupportRepository(prismaRepository.prisma);
  const supportUseCase = new SupportUseCase(supportRepository);
  const supportController = new SupportController(supportUseCase);

  app.post("/", (req, reply) =>
    supportController.sendSupportRequest(req, reply),
  );
};
