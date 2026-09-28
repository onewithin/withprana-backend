import { SARLogUseCases } from "../../domain/usecases/ssrLogsUsecase.js";
import { SARLogRepository } from "../../infrastructure/databases/postgres/ssrLogRepository.js";
import { SARLogController } from "../controllers/ssrLogsController.js";


export const sarLogRoutes = (app, { prismaRepository }) => {
    const sarLogRepo = new SARLogRepository(prismaRepository.prisma);
    const sarLogUseCases = new SARLogUseCases(sarLogRepo);
    const sarLogController = new SARLogController(sarLogUseCases);

    // Queue a SAR log
    app.post('/', (req, reply) => sarLogController.createLog(req, reply));

    // Get last 30 days SAR logs for a user
    app.get('/:userId', (req, reply) => sarLogController.getLast30DaysLogs(req, reply));

    app.get('/', (req, reply) => sarLogController.findAll(req, reply));
};
