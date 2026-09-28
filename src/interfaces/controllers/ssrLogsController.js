export class SARLogController {
    constructor(sarLogUseCases) {
        this.sarLogUseCases = sarLogUseCases;
    }
    // Queue a SAR log for a user
    async createLog(request, reply) {
        try {
            const { userId, status } = request.body;
            const result = await this.sarLogUseCases.createLog({ userId, status });
            reply.send(result);
        } catch (error) {
            console.error(error);
            reply.status(400).send({ success: false, message: error.message });
        }
    }

    // Get last 30 days SAR logs for a user
    async getLast30DaysLogs(request, reply) {
        try {
            const { userId } = request.params;
            if (!userId) {
                return reply.status(400).send({ success: false, message: "User ID is required" });
            }

            const logs = await this.sarLogUseCases.getLast30DaysLogs(userId);
            reply.send({ success: true, logs });
        } catch (error) {
            console.error(error);
            reply.status(500).send({ success: false, message: "Failed to fetch logs" });
        }
    }

    async findAll(request, reply) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                sortField = "createdAt",
                sortOrder = "desc",
            } = request.query;

            const parsedPage = parseInt(page, 10);
            const parsedLimit = parseInt(limit, 10);

            const result = await this.sarLogUseCases.findAll({
                page: parsedPage,
                limit: parsedLimit,
                status: status,
                sortField: sortField,
                sortOrder: sortOrder,
            });

            reply.send({ success: true, logs: result.data, pagination: result.pagination });
        } catch (error) {
            console.error(error);
            reply.status(500).send({ success: false, message: "Failed to fetch SAR logs" });
        }
    }
}
