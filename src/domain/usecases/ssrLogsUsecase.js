import { sarLogQueue } from "../../config/bullmq.js";

export class SARLogUseCases {
    constructor(sarLogRepository) {
        this.sarLogRepository = sarLogRepository;
    }

    async createLog({ userId, status = "APPROVED" }) {
        if (!userId) {
            throw new Error("User ID is required");
        }
        await sarLogQueue.add("createSARLog", { userId, status });

        return { success: true, message: "SAR log queued for processing" };
    }

    async getLast30DaysLogs(userId) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        return this.sarLogRepository.findLogsByUser({
            userId,
            from: thirtyDaysAgo,
        });
    }

    async findAll({ page = 1, limit = 10, status, sortField = "createdAt", sortOrder = "desc" }) {
        return this.sarLogRepository.findAll({
            page,
            limit,
            status,
            sortField,
            sortOrder,
        });
    }
}
