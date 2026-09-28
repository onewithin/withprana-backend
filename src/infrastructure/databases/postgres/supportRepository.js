export class SupportRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async createSupportTicket(ticketData) {
    return ticketData;
  }
}
