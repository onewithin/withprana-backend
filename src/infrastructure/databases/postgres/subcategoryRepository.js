import { CacheService } from "../../services/cacheService.js";

export class SubcategoryRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async create(data) {
    const created = await this.prisma.subcategory.create({
      data: {
        name: data.name,
        color: data?.color || null,
        categoryId: data.categoryId,
        active: data.active !== undefined ? data.active : true,
        isDeleted: data.isDeleted !== undefined ? data.isDeleted : false,
      },
      include: {
        category: true,
        meditations: {
          where: {
            active: true,
            isDeleted: false,
          },
        },
      },
    });

    await CacheService.clearPattern("subcategories:*");
    await CacheService.clearPattern("categories:*");
    return created;
  }

  async findById(id, userId) {
    const cacheKey = `subcategories:id:${id}:${userId || ''}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) return cached;

    const include = {
      category: true,
      meditations: {
        where: {
          active: true,
          isDeleted: false,
        },
        include: {
          ...(userId && {
            likedUsers: {
              where: { userId: userId },
              select: { id: true },
            },
          }),
        },
      },
    };

    const subcategory = await this.prisma.subcategory.findUnique({
      where: { id },
      include,
    });

    if (subcategory && subcategory.meditations) {
      subcategory.meditations = subcategory.meditations.map((meditation) => {
        const isLiked = userId
          ? meditation.likedUsers && meditation.likedUsers.length > 0
          : false;
        if (meditation.likedUsers) delete meditation.likedUsers;

        return {
          ...meditation,
          isLiked,
        };
      });
    }

    if (subcategory) {
      await CacheService.set(cacheKey, subcategory, 900);
    }
    return subcategory;
  }

  async findAll(categoryId) {
    const cacheKey = `subcategories:all:${categoryId || ''}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) return cached;

    const subcategories = await this.prisma.subcategory.findMany({
      where: {
        active: true,
        isDeleted: false,
        categoryId: categoryId,
      },
      include: {
        category: true,
        _count: {
          select: {
            meditations: {
              where: {
                active: true,
                isDeleted: false,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    await CacheService.set(cacheKey, subcategories, 900);
    return subcategories;
  }

  async update(id, data) {
    const updated = await this.prisma.subcategory.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        category: true,
        meditations: {
          where: {
            active: true,
            isDeleted: false,
          },
        },
      },
    });

    await CacheService.clearPattern("subcategories:*");
    await CacheService.clearPattern("categories:*");
    return updated;
  }

  async delete(id) {
    const deleted = await this.prisma.subcategory.update({
      where: { id },
      data: {
        isDeleted: true,
        active: false,
        updatedAt: new Date(),
      },
    });

    await CacheService.clearPattern("subcategories:*");
    await CacheService.clearPattern("categories:*");
    return deleted;
  }

  async findByName(name) {
    return this.prisma.subcategory.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
        active: true,
        isDeleted: false,
      },
      include: {
        category: true,
      },
    });
  }

  async findByActiveStatus(active) {
    return this.prisma.subcategory.findMany({
      where: {
        active: active,
        isDeleted: false,
      },
      include: {
        category: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  async restore(id) {
    const restored = await this.prisma.subcategory.update({
      where: { id },
      data: {
        isDeleted: false,
        active: true,
        updatedAt: new Date(),
      },
    });

    await CacheService.clearPattern("subcategories:*");
    await CacheService.clearPattern("categories:*");
    return restored;
  }

  async findByNameAndCategory(name, categoryId) {
    return this.prisma.subcategory.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
        categoryId,
        active: true,
        isDeleted: false,
      },
      include: {
        category: true,
      },
    });
  }
}
