export class QrRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async createSession(data) {
    return await this.prisma.qrSession.create({
      data,
    });
  }

  async findByToken(qrToken) {
    return await this.prisma.qrSession.findUnique({
      where: { qrToken },
    });
  }

  async updateSession(qrToken, data) {
    return await this.prisma.qrSession.update({
      where: { qrToken },
      data,
    });
  }

  async deleteExpiredSessions() {
    return await this.prisma.qrSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}
