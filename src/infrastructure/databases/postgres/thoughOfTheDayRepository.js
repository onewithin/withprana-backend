export class ThoughtOfTheDayRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  // Create new or reposted thought
  async create(data) {
    return this.prisma.thoughtOfTheDay.create({ data });
  }

  // Get a thought by ID
  async findById(id) {
    return this.prisma.thoughtOfTheDay.findUnique({
      where: { id },
    });
  }

  // Update status (e.g., to POSTED)
  async updateStatus(id, status) {
    return this.prisma.thoughtOfTheDay.update({
      where: { id },
      data: { status },
    });
  }

  // Update a thought by ID
  async update(id, data) {
    return this.prisma.thoughtOfTheDay.update({
      where: { id },
      data,
    });
  }

  // Delete a thought by ID
  async delete(id) {
    return this.prisma.thoughtOfTheDay.delete({
      where: { id },
    });
  }

  // Fetch all thoughts by filters (e.g., status)
  async findAll({
    status = null,
    limit = null,
    skip = null,
    sort = "createdAt",
    order,
    search = null,
  }) {
    const where = {
      ...(status && { status }),
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.thoughtOfTheDay.findMany({
        where,
        orderBy: {
          [sort || "createdAt"]:
            order?.toLowerCase() === "asc" ? "asc" : "desc",
        },

        ...(limit && { take: Number(limit) }),
        ...(skip && { skip: Number(skip) }),
      }),
      this.prisma.thoughtOfTheDay.count({ where }),
    ]);

    const page = limit
      ? Math.floor((Number(skip) || 0) / Number(limit)) + 1
      : 1;

    return {
      data,
      pagination: {
        total,
        page,
        limit: limit ? Number(limit) : total,
        totalPages: limit ? Math.ceil(total / Number(limit)) : 1,
      },
    };
  }

  async findReleasedUntilNow() {
    return this.prisma.thoughtOfTheDay.findMany({
      where: {
        scheduledAt: {
          lte: new Date(),
        },
        status: "POSTED",
      },
      orderBy: {
        scheduledAt: "desc",
      },
    });
  }

  async findOneReleasedToday() {
    return this.prisma.thoughtOfTheDay.findFirst({
      where: {
        scheduledAt: {
          lte: new Date(),
        },
        status: "POSTED",
      },
      orderBy: {
        scheduledAt: "desc",
      },
    });
  }
}
