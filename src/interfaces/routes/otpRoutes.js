import { OTPController } from "../controllers/otpController.js";
import { PostgresOTPRepository } from "../../infrastructure/databases/postgres/otpRepository.js";

export async function otpRoutes(app, deps) {
  if (!deps.prismaRepository || !deps.prismaRepository.prisma) {
    throw new Error("Prisma client is not properly initialized");
  }

  const otpRepository = new PostgresOTPRepository(deps.prismaRepository.prisma);
  const otpController = new OTPController(otpRepository, deps.mailer);

  app.post("/generate", otpController.generateOTP.bind(otpController));
  app.post("/verify", otpController.verifyOTP.bind(otpController));
}
