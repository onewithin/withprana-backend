import { OTPUseCase } from "../../domain/usecases/otpUseCase.js";
import { decryptDeterministic } from "../../utils/encryption.js";

export class OTPController {
  constructor(otpRepository, mailer) {
    this.otpUseCase = new OTPUseCase(otpRepository, mailer);
  }

  async generateOTP(request, reply) {
    try {
      // Extract email from the authenticated user's token
      const email = request.user.email
        ? decryptDeterministic(request.user.email)
        : null;

      if (!email) {
        return reply.code(400).send({
          success: false,
          message: "Email not found in token",
        });
      }

      const result = await this.otpUseCase.generateOTP(email);
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async verifyOTP(request, reply) {
    try {
      // Extract email from the authenticated user's token
      const email = request.user.email
        ? decryptDeterministic(request.user.email)
        : null;
      const { otp } = request.body;

      if (!email) {
        return reply.code(400).send({
          success: false,
          message: "Email not found in token",
        });
      }

      if (!otp) {
        return reply.code(400).send({
          success: false,
          message: "OTP is required",
        });
      }

      const result = await this.otpUseCase.verifyOTP(email, otp);
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }
}
