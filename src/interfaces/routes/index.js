import { setupRoutes } from "./userRoutes.js";
import { adminRoutes } from "./adminRoutes.js";
import { authRoutes } from "./authRoutes.js";
import { categoryRoutes } from "./categoryRoutes.js";
import { meditationRoutes } from "./meditationRoutes.js";
import { subcategoryRoutes } from "./subCategoryRoutes.js";
import { tagsRoutes } from "./tagRoutes.js";
import { likedRoutes } from "./likedRoutes.js";
import { thoughtRoutes } from "./thoughOfTheDayRoute.js";
import { playlistRoutes } from "./playListRoutes.js";
import { policyRoutes } from "./privacyPolicyRoutes.js";
import { onboardingRoutes } from "./onBoardingRoutes.js";
import { userTagsRoutes } from "./userTagRoutes.js";
import { setupSubscriptionRoutes } from "./subscriptionRoutes.js";
import { registerProtectedRoute } from "../../infrastructure/services/registerProtectedRoute.js";
import { dashboardRoutes } from "./dashboardRoutes.js";
import { settingsRoutes } from "./settingsRoute.js";
import { sarLogRoutes } from "./ssrLogRoute.js";
import { otpRoutes } from "./otpRoutes.js";
import { supportRoutes } from "./supportRoutes.js";
import { notificationPreferencesRoutes } from "./notificationPreferencesRoutes.js";
import { downloadedMeditationRoutes } from "./downloadedMeditationRoutes.js";
import { notificationRoutes } from "./notificationRoutes.js";

export async function registerRoutes(app, deps) {
  // ------------------------ PUBLIC ROUTES ------------------------
  app.register(
    async function (authScope) {
      authRoutes(authScope, {
        prismaRepository: deps.prismaRepository,
        mailer: deps.mailer,
      });
    },
    { prefix: "/api/auth" },
  );

  app.register(
    async function (subscriptionScope) {
      setupSubscriptionRoutes(subscriptionScope, {
        prismaRepository: deps.prismaRepository,
        mailer: deps.mailer,
        userRepository: deps.userRepository || {
          findById: (id) =>
            deps.prismaRepository.prisma.user.findUnique({
              where: { id: id },
            }),
          updateUserStripeCustomerId: (userId, stripeCustomerId) =>
            deps.prismaRepository.prisma.user.update({
              where: { id: userId },
              data: { stripeCustomerId },
            }),
          updateUserSubscriptionType: (userId, subscriptionType) => {
            const id =
              typeof userId === "bigint" ? Number(userId) : Number(userId);
            return deps.prismaRepository.prisma.user.update({
              where: { id },
              data: { subscriptionType: subscriptionType.toUpperCase() },
            });
          },
        },
        sseService: deps.sseService,
      });
    },
    { prefix: "/api/subscriptions" },
  );

  app.register(
    async function (setupScope) {
      setupRoutes(setupScope, {
        prismaRepository: deps.prismaRepository,
        mailer: deps.mailer,
        sseService: deps.sseService,
        stripeService: deps.stripeService,
      });
    },
    { prefix: "/api/user" },
  );

  app.register(
    async function (onboardScope) {
      onboardingRoutes(onboardScope, {
        prismaRepository: deps.prismaRepository,
        postQueue: deps.postQueue,
      });
    },
    { prefix: "/api/onboard" },
  );

  // ------------------------ PROTECTED ROUTES ------------------------

  registerProtectedRoute(app, "/api/admin", adminRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/category", categoryRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/meditation", meditationRoutes, {
    prismaRepository: deps.prismaRepository,
    mongoRepository: deps.mongoRepository,
    meditationQueue: deps.meditationQueue,
  });

  registerProtectedRoute(app, "/api/subcategory", subcategoryRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/tags", tagsRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/liked", likedRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/thought", thoughtRoutes, {
    prismaRepository: deps.prismaRepository,
    thoughtQueue: deps.thoughtQueue,
  });

  registerProtectedRoute(app, "/api/playlist", playlistRoutes, {
    prismaRepository: deps.prismaRepository,
    postQueue: deps.postQueue,
  });

  registerProtectedRoute(app, "/api/privacy-policy", policyRoutes, {
    prismaRepository: deps.prismaRepository,
    postQueue: deps.postQueue,
  });

  registerProtectedRoute(app, "/api/usertags", userTagsRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/settings", settingsRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/dashboard", dashboardRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/sar-log", sarLogRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/otp", otpRoutes, {
    prismaRepository: deps.prismaRepository,
    mailer: deps.mailer,
  });

  registerProtectedRoute(app, "/api/support", supportRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(
    app,
    "/api/notifications",
    notificationPreferencesRoutes,
    {
      prismaRepository: deps.prismaRepository,
    },
  );

  registerProtectedRoute(app, "/api/downloads", downloadedMeditationRoutes, {
    prismaRepository: deps.prismaRepository,
  });

  registerProtectedRoute(app, "/api/inbox", notificationRoutes, {
    prismaRepository: deps.prismaRepository,
  });
}
