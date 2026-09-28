import { CacheService } from "../../services/cacheService.js";

export class DashboardRepository {
  constructor(prisma) {
    if (!prisma) {
      throw new Error("Prisma client is required for DashboardRepository");
    }
    this.prisma = prisma;
  }

  async getStats() {
    try {
      const cacheKey = "dashboard:stats";
      const cached = await CacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const days = Array.from({ length: 7 }, (_, i) => {
        const start = new Date(now);
        start.setDate(start.getDate() - (6 - i));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      });

      const dailyQueries = days.flatMap(({ start, end }) => [
        this.prisma.user.count({
          where: { createdAt: { gte: start, lte: end }, subscriptionType: "Free" },
        }),
        this.prisma.user.count({
          where: { createdAt: { gte: start, lte: end }, subscriptionType: { not: "Free" } },
        }),
      ]);

      const [
        [
          totalUsers,
          activeUsers,
          newUsersLast30Days,
          newUsersToday,
          totalMeditations,
          activeSubscriptions,
          newSubscriptionsToday,
          totalRevenueResult,
          mostPlayedMeditation,
        ],
        dailyActivityRaw,
      ] = await Promise.all([
        Promise.all([
          this.prisma.user.count(),
          this.prisma.user.count({ where: { active: true } }),
          this.prisma.user.count({
            where: {
              createdAt: {
                gte: new Date(new Date().setDate(new Date().getDate() - 30)),
              },
            },
          }),
          this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
          this.prisma.meditation.count({ where: { isDeleted: false } }),
          this.prisma.subscription.count({ where: { status: "ACTIVE" } }),
          this.prisma.subscription.count({
            where: { status: "ACTIVE", createdAt: { gte: todayStart } },
          }),
          this.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { status: "SUCCEEDED" },
          }),
          this.prisma.meditation.findFirst({
            where: { isDeleted: false },
            orderBy: { playCount: "desc" },
            select: { title: true, playCount: true },
          }),
        ]),
        Promise.all(dailyQueries),
      ]);

      const dailyActivity = days.map(({ start }, i) => ({
        day: start.toLocaleDateString("en-US", { weekday: "short" }),
        freeUsers: dailyActivityRaw[i * 2],
        premiumUsers: dailyActivityRaw[i * 2 + 1],
      }));

      const result = {
        users: {
          total: totalUsers,
          active: activeUsers,
          newLast30Days: newUsersLast30Days,
          newToday: newUsersToday,
        },
        content: {
          meditations: totalMeditations,
        },
        subscriptions: {
          active: activeSubscriptions,
          newToday: newSubscriptionsToday,
        },
        revenue: {
          total: totalRevenueResult._sum.amount || 0,
        },
        mostPlayed: mostPlayedMeditation ?? null,
        dailyActivity,
      };

      await CacheService.set(cacheKey, result, 600); // 10 minute TTL
      return result;
    } catch (error) {
      console.error("Error in DashboardRepository.getStats:", error);
      throw error;
    }
  }
}
