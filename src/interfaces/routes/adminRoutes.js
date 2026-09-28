import { UserUseCases } from "../../domain/usecases/userUseCases.js";
import { AdminController } from "../controllers/adminController.js";
import { PrismaUserRepository } from "../../infrastructure/databases/postgres/userRepository.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { NotificationService } from "../../infrastructure/services/notificationService.js";

export const adminRoutes = (
  app,
  { prismaRepository, otpRepository, mailer },
) => {
  const userRepository = new PrismaUserRepository(prismaRepository.prisma);
  const notificationService = new NotificationService();
  // Note: arguments 4 and 5 (loginHistory, subscriptionRepo) are missing here,
  // but we are only updating the 3rd argument from mailer to notificationService
  const userUseCases = new UserUseCases(
    userRepository,
    otpRepository,
    notificationService,
  );
  const adminController = new AdminController(userUseCases);

  app.get("/users", { preHandler: [authMiddleware] }, (req, reply) =>
    adminController.getUsers(req, reply),
  );
  app.get("/users/:id", { preHandler: [authMiddleware] }, (req, reply) =>
    adminController.getUserById(req, reply),
  );
  app.patch(
    "/users/:id/deactivate",
    { preHandler: [authMiddleware] },
    (req, reply) => adminController.deactivateUser(req, reply),
  );
  app.patch(
    "/users/:id/activate",
    { preHandler: [authMiddleware] },
    (req, reply) => adminController.activateUser(req, reply),
  );
};
