import { CacheService } from "../../services/cacheService.js";

export class CategoryRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async create(data) {
        const created = await this.prisma.category.create({ 
            data: {
                name: data.name,
                backgroundImage: data.backgroundImage || null,
                icon: data.icon || null,
                active: data.active !== undefined ? data.active : true,
                isDeleted: data.isDeleted !== undefined ? data.isDeleted : false,
                color: data?.color
            }
        });
        await CacheService.clearPattern("categories:*");
        await CacheService.clearPattern("meditations:*");
        return created;
    }

    async findById(id) {
        const cacheKey = `categories:id:${id}`;
        const cached = await CacheService.get(cacheKey);
        if (cached) return cached;

        const category = await this.prisma.category.findUnique({ 
            where: { id },
            include: {
                meditations: {
                    where: {
                        active: true,
                        isDeleted: false
                    }
                },
                subcategories: {
                    where: {
                        active: true,
                        isDeleted: false
                    }
                }
            }
        });
        if (category) {
            await CacheService.set(cacheKey, category, 900);
        }
        return category;
    }

    async findAll() {
        const cacheKey = "categories:all";
        const cached = await CacheService.get(cacheKey);
        if (cached) return cached;

        const categories = await this.prisma.category.findMany({
            where: {
                active: true,
                isDeleted: false,
            },
            include: {
                _count: {
                    select: {
                        meditations: {
                            where: {
                                active: true,
                                isDeleted: false
                            }
                        },
                        subcategories: {
                            where: {
                                active: true,
                                isDeleted: false
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        await CacheService.set(cacheKey, categories, 900);
        return categories;
    }

    async update(id, data) {
        const updated = await this.prisma.category.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date()
            },
            include: {
                meditations: {
                    where: {
                        active: true,
                        isDeleted: false
                    }
                },
                subcategories: {
                    where: {
                        active: true,
                        isDeleted: false
                    }
                }
            }
        });
        await CacheService.clearPattern("categories:*");
        await CacheService.clearPattern("meditations:*");
        return updated;
    }

    async delete(id) {
        const deleted = await this.prisma.category.update({ 
            where: { id },
            data: { 
                isDeleted: true,
                active: false,
                updatedAt: new Date()
            }
        });
        await CacheService.clearPattern("categories:*");
        await CacheService.clearPattern("meditations:*");
        return deleted;
    }

    async findByName(name) {
        return this.prisma.category.findFirst({
            where: {
                name: {
                    equals: name,
                    mode: 'insensitive'
                },
                active: true,
                isDeleted: false
            }
        });
    }

    async findByActiveStatus(active) {
        return this.prisma.category.findMany({
            where: {
                active: active,
                isDeleted: false
            },
            orderBy: {
                name: 'asc'
            }
        });
    }

    async restore(id) {
        const restored = await this.prisma.category.update({
            where: { id },
            data: {
                isDeleted: false,
                active: true,
                updatedAt: new Date()
            }
        });
        await CacheService.clearPattern("categories:*");
        await CacheService.clearPattern("meditations:*");
        return restored;
    }
}