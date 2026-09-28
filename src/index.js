import "dotenv/config";
import fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./interfaces/routes/index.js";
import { initializeDatabaseConnections } from "./config/database.js";
import { initializeMailer } from "./config/mail.js";
import { PrismaUserRepository } from "./infrastructure/databases/postgres/userRepository.js";
import fastifyRawBody from "fastify-raw-body";
import rateLimit from "@fastify/rate-limit";
import {
  thoughtQueue,
  meditationQueue,
  inactivityQueue,
} from "./config/bullmq.js";
import { StripeService } from "./infrastructure/services/stripeService.js";
import { NotificationService } from "./infrastructure/services/notificationService.js";
import { SSEService } from "./infrastructure/services/sseService.js";
import { uploadToS3 } from "./infrastructure/services/uploadToS3.js";
import { initializeSubscriptionCron } from "./infrastructure/jobs/subscriptionCron.js";

const startServer = async () => {
  const app = fastify({ logger: true });

  BigInt.prototype.toJSON = function () {
    return this.toString();
  };

  await app.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
  });

  await app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1"],
    keyGenerator: (req) => req.user?.id || req.ip,
    errorResponseBuilder: (req, context) => ({
      code: 429,
      error: "Too Many Requests",
      message:
        "You’re going a little fast — please relax and try again soon 🧘‍♂️",
    }),
  });

  const { prisma, mongoClient } = await initializeDatabaseConnections();
  const mailer = initializeMailer();

  // Initialize subscription expiry cron job
  initializeSubscriptionCron(prisma);

  const prismaRepository = { prisma };
  const mongoRepository = { mongo: mongoClient };
  const userRepository = new PrismaUserRepository(prisma); // Initialize repositories

  // Services
  const stripeService = new StripeService();
  const notificationService = new NotificationService();
  const sseService = new SSEService();

  await registerRoutes(app, {
    prismaRepository,
    mongoRepository,
    userRepository, // Pass the instantiated repository
    mailer,
    thoughtQueue,
    meditationQueue,
    uploadToS3,
    notificationService,
    stripeService,
    sseService,
  });

  try {
    const address = await app.listen({
      port: process.env.PORT || 3000,
      host: "0.0.0.0",
    });
    app.log.info(`🚀 Server running at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

startServer();

inactivityQueue.add(
  "checkInactivity",
  {},
  {
    repeat: {
      pattern: "0 0 * * *",
    },
  },
);
