export class MeditationWatchHistoryRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async create(data) {
        return this.prisma.meditationWatchHistory.create({
            data,
        });
    }

    async findById(id) {
        return this.prisma.meditationWatchHistory.findUnique({
            where: { id },
        });
    }

    async findByUserId(userId, limit = 20, page = 1) {
        const take = Number(limit || 20);
        const skip = (Number(page || 1) - 1) * take;

        return this.prisma.meditationWatchHistory.findMany({
            where: { userId },
            include: {
                meditation: {
                    include: {
                        category: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
            },
            orderBy: { watchedAt: 'desc' },
            take,
            skip,
        });
    }

    async findByUserAndMeditation(userId, meditationId) {
        return this.prisma.meditationWatchHistory.findMany({
            where: { userId, meditationId },
            orderBy: { watchedAt: 'desc' },
        });
    }

    async updateByUserAndMeditation(userId, meditationId, data) {
        const history = await this.prisma.meditationWatchHistory.findFirst({
            where: { userId, meditationId },
            orderBy: { watchedAt: 'desc' },
        });

        if (history) {
            return this.prisma.meditationWatchHistory.update({
                where: { id: history.id },
                data,
            });
        } else {
            return this.prisma.meditationWatchHistory.create({
                data: {
                    userId,
                    meditationId,
                    ...data
                }
            });
        }
    }

    async update(id, data) {
        return this.prisma.meditationWatchHistory.update({
            where: { id },
            data,
        });
    }

    async delete (id) {
        return this.prisma.meditationWatchHistory.delete({
            where: { id },
        });
    }
}

