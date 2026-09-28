import { CacheService } from "../../services/cacheService.js";

export class TagRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async create(data) {
        const created = await this.prisma.tag.create({
            data: {
                name: data.name,
            },
        });
        await CacheService.clearPattern("tags:*");
        return created;
    }

    async findAll() {
        const cacheKey = "tags:all";
        const cached = await CacheService.get(cacheKey);
        if (cached) return cached;

        const tags = await this.prisma.tag.findMany({
            where: {
                active: true,
                isDeleted: false,
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        await CacheService.set(cacheKey, tags, 900);
        return tags;
    }

    async findByNameAndCategory(name, categoryId) {
        return this.prisma.tag.findFirst({
            where: {
                name: {
                    equals: name,
                    mode: 'insensitive'
                },
                categoryId,
                active: true,
                isDeleted: false
            },
            include: {
                category: true
            }
        });
    }

    async delete(id) {
        const deleted = await this.prisma.tag.update({
            where: { id },
            data: { isDeleted: true, active: false },
        });
        await CacheService.clearPattern("tags:*");
        return deleted;
    }
}
