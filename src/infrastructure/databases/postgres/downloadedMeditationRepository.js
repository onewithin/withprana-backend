export class DownloadedMeditationRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async add(userId, meditationId) {
    return this.prisma.downloadedMeditation.upsert({
      where: {
        userId_meditationId: {
          userId,
          meditationId,
        },
      },
      update: {
        downloadedAt: new Date(),
      },
      create: {
        userId,
        meditationId,
      },
    });
  }

  async remove(userId, meditationId) {
    return this.prisma.downloadedMeditation.delete({
      where: {
        userId_meditationId: {
          userId,
          meditationId,
        },
      },
    });
  }

  async getAll(userId, limit = 10, page = 1) {
    const skip = (Number(page || 1) - 1) * Number(limit || 10);

    const [data, total] = await Promise.all([
      this.prisma.downloadedMeditation.findMany({
        where: { userId },
        include: {
          meditation: {
            select: {
              id: true,
              title: true,
              duration: true,
              thumbnail: true,
              // category: true,
              link: true,
            },
          },
        },
        orderBy: { downloadedAt: "desc" },
        take: Number(limit || 10),
        skip: Number(skip || 0),
      }),
      this.prisma.downloadedMeditation.count({
        where: { userId },
      }),
    ]);

    return {
      data: data.map((item) => ({
        ...item.meditation,
        downloadedAt: item.downloadedAt, // Include download timestamp if needed
      })),
      pagination: {
        total,
        page: Number(page || 1),
        limit: Number(limit || 10),
        totalPages: Math.ceil(total / (limit || 10)),
      },
    };
  }
}
