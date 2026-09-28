export class LoginHistoryRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    async create(data) {
        return this.prisma.loginHistory.create({
            data,
        });
    }

    async findById(id) {
        return this.prisma.loginHistory.findUnique({
            where: { id },
        });
    }

    async findActiveByAdminId(adminId) {
        return this.prisma.loginHistory.findMany({
            where: {
                adminId,
                role: "ADMIN",
                isActive: true,
            },
            orderBy: {
                loggedInAt: "desc",
            },
        });
    }

    async findActiveByUserId(userId) {
        return this.prisma.loginHistory.findMany({
            where: {
                userId,
                role: "USER",
                isActive: true,
            },
            orderBy: {
                loggedInAt: "desc",
            },
        });
    }

    async logoutById(id) {
        return this.prisma.loginHistory.update({
            where: { id },
            data: {
                loggedOutAt: new Date(),
                isActive: false,
            },
        });
    }

    async logoutAllForAdmin(adminId) {
        return this.prisma.loginHistory.updateMany({
            where: {
                adminId,
                role: "ADMIN",
                isActive: true,
            },
            data: {
                loggedOutAt: new Date(),
                isActive: false,
            },
        });
    }

    async logoutAllForUser(userId) {
        return this.prisma.loginHistory.updateMany({
            where: {
                userId,
                role: "USER",
                isActive: true,
            },
            data: {
                loggedOutAt: new Date(),
                isActive: false,
            },
        });
    }

    async logoutLastForUser(userId) {
        const lastLogin = await this.prisma.loginHistory.findFirst({
            where: {
                userId,
                role: "USER",
                isActive: true,
            },
            orderBy: {
                loggedInAt: "desc",
            },
        });

        if (!lastLogin) return null;

        return this.prisma.loginHistory.update({
            where: { id: lastLogin.id },
            data: {
                loggedOutAt: new Date(),
                isActive: false,
            },
        });
    }

}
