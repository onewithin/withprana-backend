import { DashboardController } from "../controllers/dashboardController.js";
import { DashboardRepository } from "../../infrastructure/databases/postgres/dashboardRepository.js";

export const dashboardRoutes = (app, { prismaRepository }) => {
  if (!prismaRepository || !prismaRepository.prisma) {
    throw new Error("Prisma client is not properly initialized");
  }

  const dashboardRepository = new DashboardRepository(prismaRepository.prisma);
  const dashboardController = new DashboardController(dashboardRepository);

  app.get("/stats", (request, reply) =>
    dashboardController.getStats(request, reply),
  );
};
