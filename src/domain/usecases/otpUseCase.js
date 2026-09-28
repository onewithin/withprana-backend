import { OTP } from "../entities/user.js";
import { encryptDeterministic } from "../../utils/encryption.js";

export class OTPUseCase {
  constructor(otpRepository, mailer) {
    this.otpRepository = otpRepository;
    this.mailer = mailer;
  }

  async generateOTP(email) {
    const encryptedEmail = encryptDeterministic(email);

    // Generate 6 digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const otp = new OTP({
      email: encryptedEmail,
      otpcode: otpCode,
      expires_at: expiresAt,
      isvalid: true,
    });

    await this.otpRepository.createOTP(otp);
    await this.sendOTPEmail(email, otpCode);

    return {
      success: true,
      message: "OTP sent successfully",
    };
  }

  async verifyOTP(email, otpCode) {
    const encryptedEmail = encryptDeterministic(email);

    const otp = await this.otpRepository.findOTPByEmail(encryptedEmail);

    if (!otp || otp.otpCode !== otpCode) {
      throw new Error("Invalid OTP");
    }

    if (!otp.isValid) {
      await this.otpRepository.updateOTP(encryptedEmail, false);
      throw new Error("OTP has expired");
    }

    // Mark OTP as used
    await this.otpRepository.updateOTP(encryptedEmail, false);

    return {
      success: true,
      message: "OTP verified successfully",
    };
  }

  async sendOTPEmail(email, otpCode) {
    const mailOptions = {
      from: '"Being One Within" <no-reply@yourapp.com>', // consistent with UserUseCases
      to: email,
      subject: "OTP for verification",
      text: `Your OTP is: ${otpCode}`,
      html: `<p>Your OTP is: <strong>${otpCode}</strong></p>`,
    };

    await this.mailer.sendMail(mailOptions);
  }
}
