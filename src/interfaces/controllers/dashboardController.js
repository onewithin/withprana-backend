export class DashboardController {
  constructor(dashboardRepository) {
    this.dashboardRepository = dashboardRepository;
  }

  async getStats(request, reply) {
    try {
      const stats = await this.dashboardRepository.getStats();
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error in DashboardController.getStats:", error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch dashboard stats",
      });
    }
  }
}
