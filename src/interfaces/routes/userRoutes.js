import { UserController } from "../controllers/userController.js";
import { PostgresOTPRepository } from "../../infrastructure/databases/postgres/otpRepository.js";
import { PrismaUserRepository } from "../../infrastructure/databases/postgres/userRepository.js";
import { NotificationService } from "../../infrastructure/services/notificationService.js";
import fastifyMultipart from "@fastify/multipart";
import { LoginHistoryRepository } from "../../infrastructure/databases/postgres/loginHistoryRepository.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { uploadToS3 } from "../../infrastructure/services/uploadToS3.js";

import { SubscriptionRepository } from "../../infrastructure/databases/postgres/SubscriptionRepository.js";
import { QrRepository } from "../../infrastructure/databases/postgres/qrRepository.js";

export const setupRoutes = (app, { prismaRepository, mailer, sseService, stripeService }) => {
  if (!prismaRepository || !prismaRepository.prisma) {
    throw new Error("Prisma client is not properly initialized");
  }

  const otpRepo = new PostgresOTPRepository(prismaRepository.prisma);
  const userRepo = new PrismaUserRepository(prismaRepository.prisma);
  const loginHistoryRepository = new LoginHistoryRepository(
    prismaRepository.prisma,
  );
  const subscriptionRepo = new SubscriptionRepository(prismaRepository.prisma);
  const notificationService = new NotificationService();
  const qrRepo = new QrRepository(prismaRepository.prisma);

  const userController = new UserController(
    userRepo,
    otpRepo,
    notificationService,
    loginHistoryRepository,
    subscriptionRepo,
    qrRepo,
    sseService,
    stripeService
  );

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
    attachFieldsToBody: true,
  });

  app.post("/register", async (request, reply) => {
    try {
      const { profilePicture } = request.body;
      let profilePictureUrl = null;

      if (
        profilePicture &&
        typeof profilePicture.value === "string" &&
        profilePicture.value.trim() !== ""
      ) {
        profilePictureUrl = profilePicture.value;
      }

      if (profilePicture?.file) {
        let image = await uploadToS3(profilePicture, "images");
        profilePictureUrl = image[0];
      }

      const getVal = (val) => (val && typeof val === "object" ? val.value : val);

      const payload = {
        name: getVal(request.body.name),
        email: getVal(request.body.email),
        oauth: getVal(request.body.oauth),
        method: getVal(request.body.method),
        image: profilePictureUrl,
        device: getVal(request.body.device),
        isLogin: getVal(request.body.isLogin),
        idToken: getVal(request.body.idToken) || getVal(request.body.token),
      };

      await userController.register({ ...request, body: payload }, reply);
    } catch (error) {
      console.error("User registration error:", error);
      reply.status(500).send({
        error: "Failed to register user",
        details: error.message,
      });
    }
  });

  app.post("/verify", (request, reply) =>
    userController.verify(request, reply),
  );
  app.post("/resend-otp", (request, reply) =>
    userController.resendOTP(request, reply),
  );
  app.post("/check-email", (request, reply) =>
    userController.checkEmail(request, reply),
  );
  app.post("/login", (request, reply) => userController.login(request, reply));
  app.post("/logout", { preHandler: authMiddleware }, (request, reply) =>
    userController.logout(request, reply),
  );

  app.get("/qr/generate", (request, reply) => userController.generateQr(request, reply));
  app.get("/qr/status", (request, reply) => userController.checkQrStatus(request, reply));
  app.get("/qr/sse", (request, reply) => userController.qrSse(request, reply));
  app.post("/qr/verify", { preHandler: authMiddleware }, (request, reply) => userController.verifyQr(request, reply));

  app.post("/refresh-token", (request, reply) =>
    userController.refresh(request, reply),
  );

  app.get("/:id", { preHandler: [authMiddleware] }, (request, reply) =>
    userController.getUserById(request, reply),
  );

  app.patch(
    "/:id",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { name, profilePicture } = request.body;

        let profilePictureUrl = undefined;

        if (profilePicture) {
          if (profilePicture?.file) {
            let image = await uploadToS3(profilePicture, "images");
            profilePictureUrl = image[0];
          } else {
            const val = typeof profilePicture === "object" ? profilePicture.value : profilePicture;
            if (val === "null" || val === null || val === "") {
              profilePictureUrl = null;
            } else if (typeof val === "string" && val.trim() !== "") {
              profilePictureUrl = val;
            }
          }
        }

        const payload = {
          name: typeof name === "object" ? name.value : name,
        };

        if (profilePictureUrl !== undefined && profilePictureUrl !== "") {
          payload.image = profilePictureUrl;
        }

        await userController.updateUser(
          { ...request, params: { id }, body: payload, user: request.user },
          reply,
        );
      } catch (error) {
        console.error("User update error:", error);
        reply.status(500).send({
          error: "Failed to update user",
          details: error.message,
        });
      }
    },
  );

  app.delete("/:id", { preHandler: [authMiddleware] }, (request, reply) =>
    userController.deleteUser(request, reply),
  );
};
