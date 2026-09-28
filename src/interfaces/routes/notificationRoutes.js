import { NotificationRepository } from "../../infrastructure/databases/postgres/notificationRepository.js";
import { NotificationUsecase } from "../../domain/usecases/notificationUsecase.js";
import { NotificationController } from "../controllers/notificationController.js";

export const notificationRoutes = async (app, { prismaRepository }) => {
  const repo = new NotificationRepository(prismaRepository.prisma);
  const usecase = new NotificationUsecase(repo);
  const controller = new NotificationController(usecase);

  app.get("/", (req, reply) => controller.getMyNotifications(req, reply));
  app.patch("/view-all", (req, reply) => controller.markAllAsViewed(req, reply));
  app.patch("/:id/view", (req, reply) => controller.markAsViewed(req, reply));
  app.delete("/:id", (req, reply) => controller.deleteNotification(req, reply));
  app.delete("/", (req, reply) => controller.clearAllNotifications(req, reply));
};
