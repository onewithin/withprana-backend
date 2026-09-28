import { userDecryption } from "../../../utils/generateSSRLogs.js";

export class SARLogRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async createLog({ userId, status }) {
        return this.prisma.sARLogRequest.create({
            data: {
                userId,
                status,
            },
        });
    }

    async findById(id) {
        return this.prisma.sARLogRequest.findUnique({
            where: { id },
            include: { user: true },
        });
    }

    async findByUserId(userId) {
        return this.prisma.sARLogRequest.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
        });
    }

    async updateStatus(id, status) {
        return this.prisma.sARLogRequest.update({
            where: { id },
            data: { status },
        });
    }

    async deleteLog(id) {
        return this.prisma.sARLogRequest.delete({
            where: { id },
        });
    }

    async findAll({ page = 1, limit = 10, status, sortField = "createdAt", sortOrder = "desc" }) {
        const where = {};
        if (status) where.status = status;

        const total = await this.prisma.sARLogRequest.count({ where });

        const logs = await this.prisma.sARLogRequest.findMany({
            where,
            include: { user: true },
            orderBy: { [sortField]: sortOrder },
            skip: (page - 1) * limit,
            take: limit,
        });

        const decryptedLogs = logs.map(log => ({
            ...log,
            user: log.user ? userDecryption(log.user) : null,
        }));

        const totalPages = Math.ceil(total / limit);

        return {
            data: decryptedLogs,
            pagination: {
                total,
                page,
                limit,
                totalPages,
            },
        };
    }
}
