import { SubscriptionController } from "../controllers/subscriptionController.js";
import { SubscriptionUseCases } from "../../domain/usecases/subscriptionUseCases.js";
import { SubscriptionRepository } from "../../infrastructure/databases/postgres/SubscriptionRepository.js";
import { NotificationRepository } from "../../infrastructure/databases/postgres/notificationRepository.js";
import { StripeService } from "../../infrastructure/services/stripeService.js";
import { NotificationService } from "../../infrastructure/services/notificationService.js";
import Stripe from "stripe";
import { registerProtectedRoute } from "../../infrastructure/services/registerProtectedRoute.js";

export const setupSubscriptionRoutes = (
  app,
  { prismaRepository, userRepository, mailer, sseService },
) => {
  const subscriptionRepo = new SubscriptionRepository(prismaRepository.prisma);
  const notificationRepo = new NotificationRepository(prismaRepository.prisma);
  const stripeService = new StripeService();
  const notificationService = new NotificationService(notificationRepo);
  const subscriptionUseCases = new SubscriptionUseCases(
    subscriptionRepo,
    userRepository,
    stripeService,
    notificationService,
    sseService,
  );
  const subscriptionController = new SubscriptionController(
    subscriptionUseCases,
    sseService,
  );
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  app.post("/webhook", {
    config: {
      parse: false,
      rawBody: true,
    },
    handler: async (request, reply) => {
      const sig = request.headers["stripe-signature"];

      console.log("Webhook received - Headers:", {
        "stripe-signature": sig ? "present" : "missing",
        "content-type": request.headers["content-type"],
        "content-length": request.headers["content-length"],
      });

      if (!sig) {
        console.error("❌ Missing Stripe signature header");
        return reply.code(400).send("Missing Stripe signature");
      }

      let rawBody;
      try {
        if (request.rawBody && Buffer.isBuffer(request.rawBody)) {
          rawBody = request.rawBody;
          console.log("✅ Using request.rawBody, length:", rawBody.length);
        } else if (request.raw) {
          console.log("🔄 Reading from request.raw stream...");
          const chunks = [];

          await new Promise((resolve, reject) => {
            request.raw.on("data", (chunk) => {
              chunks.push(chunk);
            });

            request.raw.on("end", () => {
              rawBody = Buffer.concat(chunks);
              console.log(
                "✅ Stream reading complete, length:",
                rawBody.length,
              );
              resolve();
            });

            request.raw.on("error", (err) => {
              console.error("❌ Stream error:", err);
              reject(err);
            });

            setTimeout(() => {
              if (!rawBody) {
                reject(new Error("Stream reading timeout"));
              }
            }, 5000);
          });
        } else {
          throw new Error("No raw body or raw stream available");
        }

        if (!rawBody || rawBody.length === 0) {
          throw new Error("Empty raw body received");
        }

        console.log(
          "✅ Raw body successfully obtained, length:",
          rawBody.length,
        );
        console.log("First 200 chars:", rawBody.toString().substring(0, 200));
      } catch (err) {
        console.error("❌ Error reading raw body:", err.message);
        return reply.code(400).send(`Cannot read body: ${err.message}`);
      }

      let event;
      try {
        console.log("🔐 Verifying webhook signature...");
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET,
        );
        console.log("✅ Verified webhook:", event.type);
      } catch (err) {
        console.error("⚠️ Webhook signature verification failed:", err.message);

        return reply.code(400).send(`Webhook Error: ${err.message}`);
      }

      try {
        await subscriptionController.handleWebhook(event);
        reply.send({ received: true });
      } catch (err) {
        console.error("❌ Error processing webhook:", err);
        reply.code(500).send("Internal Server Error");
      }
    },
  });

  registerProtectedRoute(
    app,
    "",
    async (protectedApp) => {
      protectedApp.get("/sse/subscribe", (req, res) =>
        subscriptionController.subscribeSSE(req, res),
      );
      protectedApp.get("/plans", (req, res) =>
        subscriptionController.getPlans(req, res),
      );
      protectedApp.post("/web-checkout", (req, res) =>
        subscriptionController.createCheckoutSession(req, res),
      );
      protectedApp.post("/app-checkout", (req, res) =>
        subscriptionController.createAppCheckoutSession(req, res),
      );
      protectedApp.get("/status", (req, res) =>
        subscriptionController.getSubscriptionStatus(req, res),
      );
      protectedApp.post("/portal", (req, res) =>
        subscriptionController.generateBillingPortal(req, res),
      );
      protectedApp.post("/cancel", (req, res) =>
        subscriptionController.cancelSubscription(req, res),
      );
      protectedApp.get("/transactions", (req, res) =>
        subscriptionController.getTransactionHistory(req, res),
      );
      protectedApp.get("/validate-premium", (req, res) =>
        subscriptionController.validatePremiumAccess(req, res),
      );

      protectedApp.post("/admin/plans", (req, res) =>
        subscriptionController.createPlan(req, res),
      );
      protectedApp.put("/admin/plans/:planId", (req, res) =>
        subscriptionController.updatePlan(req, res),
      );
      protectedApp.patch("/admin/plans/:planId/visibility", (req, res) =>
        subscriptionController.togglePlanVisibility(req, res),
      );
      protectedApp.get("/admin/subscriptions", (req, res) =>
        subscriptionController.getSubscriptions(req, res),
      );
      protectedApp.get("/admin/subscriptions/:subscriptionId", (req, res) =>
        subscriptionController.getSubscriptionById(req, res),
      );
      protectedApp.post(
        "/admin/subscriptions/:subscriptionId/cancel",
        (req, res) => subscriptionController.adminCancelSubscription(req, res),
      );
      protectedApp.get("/admin/transactions", (req, res) =>
        subscriptionController.getAdminTransactions(req, res),
      );
    },
    {
      prismaRepository,
      userRepository,
    },
  );
};
