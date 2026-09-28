import { decryptDeterministic } from "../../utils/encryption.js";

export class SupportController {
  constructor(supportUseCase) {
    this.supportUseCase = supportUseCase;
  }

  async sendSupportRequest(req, reply) {
    try {
      const { subject, message, image, attachment, file } = req.body;
      const user = req.user;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const subjectValue =
        subject && typeof subject === "object" && subject.value
          ? subject.value
          : subject;
      const messageValue =
        message && typeof message === "object" && message.value
          ? message.value
          : message;

      const userEmail = decryptDeterministic(user.email);

      // Support generic attachment field name (image, attachment, or file)
      const uploadedFile = image || attachment || file;

      const requestData = {
        subject: subjectValue,
        message: messageValue,
        attachment:
          uploadedFile && uploadedFile.file ? uploadedFile : undefined,
        userEmail: userEmail,
      };

      if (!requestData.subject || !requestData.message) {
        return reply
          .status(400)
          .send({ error: "Subject and message are required" });
      }

      const result = await this.supportUseCase.createSupportDevice(requestData);
      return reply.send(result);
    } catch (error) {
      console.error("Support Controller Error:", error);
      return reply
        .status(500)
        .send({ error: "Failed to send support request" });
    }
  }
}
