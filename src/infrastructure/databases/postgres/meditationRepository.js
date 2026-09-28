import { CacheService } from "../../services/cacheService.js";

export class MeditationRepository {
  constructor(prisma) {
    // Emergency fallback if prisma is not provided
    if (!prisma) {
      console.warn("⚠️  Prisma not provided - attempting emergency import");
      try {
        // Dynamic import as fallback
        import("../../databases/postgres/prismaClient.js")
          .then((module) => {
            this.prisma = module.default;
            console.log("✅ Emergency prisma import successful");
          })
          .catch((err) => {
            console.error("❌ Emergency import failed:", err);
            throw new Error("Could not initialize Prisma client");
          });
      } catch (error) {
        console.error("❌ Emergency import error:", error);
        throw error;
      }
    } else {
      this.prisma = prisma;
      console.log("✅ Prisma client set via constructor");
    }
  }

  // Add a method to check if prisma is ready
  async ensurePrisma() {
    if (!this.prisma) {
      console.log("⚠️  Waiting for prisma to initialize...");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!this.prisma) {
      throw new Error("Prisma client not initialized");
    }
  }

  async create(data) {
    await this.ensurePrisma();
    const created = await this.prisma.meditation.create({
      data: {
        title: data.title,
        description: data.description,
        duration: data.duration,
        link: data.link,
        thumbnail: data.thumbnail,
        appImg: data.appImg,
        originalAudioKey: data.originalAudioKey,
        isPremium: data.isPremium,
        type: data?.type,
        scheduledAt: data?.scheduledAt,
        active: data.active !== undefined ? data.active : true,
        category: {
          connect: {
            id: data.categoryId,
          },
        },
        ...(data.subcategoryId && {
          subcategory: {
            connect: { id: data.subcategoryId },
          },
        }),
        ...(data.tags &&
          data.tags.length > 0 && {
          meditationTags: {
            create: data.tags.map((tagId) => ({
              tag: {
                connect: { id: tagId },
              },
            })),
          },
        }),
      },
      include: {
        category: true,
        subcategory: true,
        meditationTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    await CacheService.clearPattern("meditations:*");
    await CacheService.clearPattern("dashboard:stats");
    return created;
  }

  async findById(id, userId) {
    await this.ensurePrisma();

    const include = {
      category: true,
      subcategory: true,
      meditationTags: {
        include: {
          tag: true,
        },
      },
    };

    if (userId) {
      include.likedUsers = {
        where: { userId: userId },
        select: { id: true },
      };
    }

    const meditation = await this.prisma.meditation.findUnique({
      where: { id: id },
      include,
    });

    if (meditation && userId) {
      meditation.isLiked = meditation.likedUsers.length > 0;
      delete meditation.likedUsers;
    } else if (meditation) {
      meditation.isLiked = false;
    }

    return meditation;
  }

  async findByTitle(title) {
    await this.ensurePrisma();
    return this.prisma.meditation.findFirst({
      where: {
        title: {
          equals: title,
          mode: 'insensitive',
        },
        isDeleted: false,
      },
    });
  }

  async getMeditationBySubCategoryId(id, userId) {
    await this.ensurePrisma();

    const include = {
    };

    if (userId) {
      include.likedUsers = {
        where: { userId: userId },
        select: { id: true },
      };
    }

    const meditations = await this.prisma.meditation.findMany({
      where: { subcategoryId: id },
      include: Object.keys(include).length > 0 ? include : undefined,
    });

    if (userId) {
      return meditations.map((meditation) => {
        const isLiked = meditation.likedUsers?.length > 0;
        const { likedUsers, ...rest } = meditation;
        return { ...rest, isLiked };
      });
    }

    return meditations.map((m) => ({ ...m, isLiked: false }));
  }

  async getMeditationByCategoryId(id) {
    await this.ensurePrisma();
    return this.prisma.meditation.findMany({
      where: { categoryId: Number(id) },
    });
  }

  async findAll(limit = 10, page = 1, sort, order, search, isPremium, categoryId) {
    await this.ensurePrisma();
    const cacheKey = `meditations:all:${limit}:${page}:${sort || ''}:${order || ''}:${search || ''}:${isPremium || ''}:${categoryId || ''}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (Number(page || 1) - 1) * Number(limit || 10);

    const where = {
      isDeleted: false,
      ...(search?.trim() && {
        title: { contains: search.trim(), mode: "insensitive" },
      }),
      ...(isPremium !== undefined && isPremium !== "" && {
        isPremium: isPremium === "true" || isPremium === true,
      }),
      ...(categoryId && { categoryId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.meditation.findMany({
        where,
        orderBy: {
          [sort || "createdAt"]:
            order?.toLowerCase() === "asc" ? "asc" : "desc",
        },
        include: {
          category: true,
          subcategory: true,
          meditationTags: {
            include: {
              tag: true,
            },
          },
        },
        take: Number(limit || 10),
        skip: Number(skip || 0),
      }),
      this.prisma.meditation.count({ where }),
    ]);

    const result = {
      data,
      pagination: {
        total,
        page: Number(page || 1),
        limit: Number(limit || 10),
        totalPages: Math.ceil(total / (limit || 10)),
      },
    };

    await CacheService.set(cacheKey, result, 900); // 15 minute TTL
    return result;
  }

  async update(id, data) {
    await this.ensurePrisma();
    const updateData = { ...data };

    if (data.categoryId !== undefined) {
      updateData.category = {
        connect: { id: data.categoryId },
      };
      delete updateData.categoryId;
    }

    if (data.subcategoryId !== undefined) {
      updateData.subcategory = {
        connect: { id: data.subcategoryId },
      };
      delete updateData.subcategoryId;
    }

    if (data.isPremium !== undefined) {
      updateData.isPremium = Boolean(data.isPremium);
    }

    if (data.active !== undefined) {
      updateData.active = Boolean(data.active);
    }

    if (data.tags && Array.isArray(data.tags)) {
      updateData.meditationTags = {
        deleteMany: {},
        create: data.tags.map((tagId) => ({
          tag: { connect: { id: tagId } },
        })),
      };
      delete updateData.tags;
    }

    const updated = await this.prisma.meditation.update({
      where: { id: id },
      data: updateData,
      include: {
        category: true,
        subcategory: true,
        meditationTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    await CacheService.clearPattern("meditations:*");
    await CacheService.clearPattern("dashboard:stats");
    return updated;
  }

  async delete(id) {
    await this.ensurePrisma();
    const result = await this.prisma.meditation.update({
      where: { id: id },
      data: { isDeleted: true },
    });

    await CacheService.clearPattern("meditations:*");
    await CacheService.clearPattern("dashboard:stats");
    return result;
  }

  async findByUserSelectedTags(userId, limit = 10, page = 1, sort, order) {
    // Wait for prisma to be ready
    await this.ensurePrisma();

    try {
      console.log("Method called with:", { userId, limit, page, sort, order });

      const skip = (Number(page || 1) - 1) * Number(limit || 10);

      // Fetch the user's selected tag IDs
      console.log("Fetching user tags...");
      const userTags = await this.prisma.userTag.findMany({
        where: { userId: userId },
        select: { tagId: true },
      });
      console.log("User tags found:", userTags.length);

      const tagIds = userTags.map((ut) => ut.tagId);
      console.log("Tag IDs:", tagIds);

      if (tagIds.length === 0) {
        console.log("No tags found for user");
        return {
          data: [],
          pagination: {
            total: 0,
            page: Number(page || 1),
            limit: Number(limit || 10),
            totalPages: 0,
          },
        };
      }

      console.log("Executing parallel queries...");
      const [data, total] = await Promise.all([
        this.prisma.meditation.findMany({
          where: {
            isDeleted: false,
            meditationTags: {
              some: { tagId: { in: tagIds } },
            },
          },
          include: {
            category: true,
            subcategory: true,
            likedUsers: {
              where: {
                userId: userId,
              },
              select: {
                id: true,
              },
            },
          },
          orderBy: {
            [sort || "createdAt"]:
              order?.toLowerCase() === "asc" ? "asc" : "desc",
          },
          take: Number(limit || 10),
          skip: Number(skip || 0),
        }),
        this.prisma.meditation.count({
          where: {
            isDeleted: false,
            meditationTags: {
              some: { tagId: { in: tagIds } },
            },
          },
        }),
      ]);

      console.log("Data found:", data.length);
      console.log("Total count:", total);

      // Transform the data to include isLiked field
      const transformedData = data.map((meditation) => ({
        ...meditation,
        isLiked: meditation.likedUsers.length > 0,
      }));

      return {
        data: transformedData,
        pagination: {
          total,
          page: Number(page || 1),
          limit: Number(limit || 10),
          totalPages: Math.ceil(total / (limit || 10)),
        },
      };
    } catch (error) {
      console.error("Error in findByUserSelectedTags:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Return empty response instead of throwing in production
      if (process.env.NODE_ENV === "production") {
        return {
          data: [],
          pagination: {
            total: 0,
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            totalPages: 0,
          },
        };
      } else {
        throw error;
      }
    }
  }

  async findByTagId(tagId, userId) {
    await this.ensurePrisma();

    const data = await this.prisma.meditation.findMany({
      where: {
        isDeleted: false,
        meditationTags: {
          some: { tagId: tagId },
        },
      },
      include: {
        category: true,
        subcategory: true,
        meditationTags: {
          include: {
            tag: true,
          },
        },
        ...(userId && {
          likedUsers: {
            where: { userId: userId },
            select: { id: true },
          },
        }),
      },
      orderBy: { createdAt: "desc" },
    });

    const transformedData = data.map((meditation) => {
      let isLiked = false;
      if (userId && meditation.likedUsers) {
        isLiked = meditation.likedUsers.length > 0;
        delete meditation.likedUsers;
      }
      return { ...meditation, isLiked };
    });

    return transformedData;
  }
}
