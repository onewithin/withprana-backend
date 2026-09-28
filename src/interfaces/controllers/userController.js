import { UserUseCases } from "../../domain/usecases/userUseCases.js";
import { CreateUserDTO, VerifyUserDTO } from "../dtos/userDTO.js";

export class UserController {
  constructor(
    userRepository,
    otpRepository,
    notificationService,
    loginHistoryRepository,
    subscriptionRepository,
    qrRepository,
    sseService,
    stripeService
  ) {
    this.userUseCases = new UserUseCases(
      userRepository,
      otpRepository,
      notificationService,
      loginHistoryRepository,
      subscriptionRepository,
      qrRepository,
      sseService,
      stripeService
    );
    this.sseService = sseService;
  }

  async register(request, reply) {
    try {
      const { device, ...userDTO } = new CreateUserDTO(request.body);
      const result = await this.userUseCases.registerUser(
        userDTO,
        device,
        request.ip,
      );

      if (JSON.parse(result.oauth)) {
        return reply.code(201).send({
          success: true,
          message: result.message,
          token: result.token,
          loginHistory: result.loginHistory,
          refreshToken: result.refreshToken,
          register: result.register,
          // user: result.user,
          // oauth: true
        });
      } else {
        return reply.code(201).send({
          success: true,
          token: result.token,
          message: result.message,
          loginHistory: result.loginHistory,
          register: result.register,
          // user: result.user,
          // oauth: false
        });
      }
    } catch (error) {
      console.log(error);
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async verify(request, reply) {
    try {
      const verifyDTO = new VerifyUserDTO(request.body);
      const result = await this.userUseCases.verifyUser(
        verifyDTO.email,
        verifyDTO.otp,
        verifyDTO.device,
        request?.ip,
      );

      return reply.code(200).send({
        success: result.success,
        message: result.message,
        token: result.token,
        refreshToken: result.refreshToken,
        oauth: result.oauth,
        register: result.register,
      });
    } catch (error) {
      console.log(error);
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async resendOTP(request, reply) {
    try {
      const userDTO = new CreateUserDTO(request.body);
      const result = await this.userUseCases.resendOTP(userDTO.email);

      return reply.code(200).send({
        success: true,
        message: result.message,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async checkEmail(request, reply) {
    try {
      const { email } = request.body;
      if (!email) {
        return reply.code(400).send({
          success: false,
          message: "Email is required",
        });
      }

      const exists = await this.userUseCases.checkEmailExists(email);

      return reply.code(200).send({
        success: true,
        exists,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async login(request, reply) {
    try {
      const userDTO = new CreateUserDTO(request.body);
      const result = await this.userUseCases.login(
        userDTO.email,
        userDTO.oauth,
      );

      if (result.success) {
        return reply.code(200).send({
          success: true,
          message: result.message,
          token: result.token,
          refreshToken: result.refreshToken,
          oauth: result.oauth,
          ...(result.temp && { temp: result.temp }),
        });
      } else {
        return reply.code(400).send({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async logout(request, reply) {
    try {
      const userId = request.user.id;

      const result = await this.userUseCases.logoutUser(userId);

      if (result && result.success !== false) {
        return reply.code(200).send({
          success: true,
          message: "Logged out successfully",
        });
      }

      return reply.code(400).send({
        success: false,
        message: "No active session found",
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }
  async refresh(request, reply) {
    try {
      const { refreshToken } = request.body;
      const result = await this.userUseCases.refreshToken(refreshToken);

      return reply.code(200).send({
        success: true,
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (error) {
      return reply.code(401).send({
        success: false,
        message: error.message || "Invalid Refresh Token",
      });
    }
  }

  async getUserById(request, reply) {
    try {
      const { id } = request.params;
      const requestingUser = request.user;

      const user = await this.userUseCases.getUserById(id);

      if (!user) {
        return reply
          .code(404)
          .send({ success: false, message: "User not found" });
      }

      if (!requestingUser || String(requestingUser.id) !== String(user.id)) {
        return reply.code(200).send({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            image: user.image,
          },
        });
      }

      return reply.code(200).send({
        success: true,
        user,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message,
      });
    }
  }

  async updateUser(request, reply) {
    try {
      const userDTO = new CreateUserDTO(request.body);
      const { id } = request.params;
      const requestingUser = request.user || request.body.user;

      if (!requestingUser || String(requestingUser.id) !== String(id)) {
        return reply.code(403).send({
          success: false,
          message: "Unauthorized: You can only update your own profile",
        });
      }

      userDTO.id = id;
      const user = await this.userUseCases.updateUser(id, userDTO);

      return reply.code(200).send({
        success: true,
        message: "User updated successfully",
        user,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async getUsers(request, reply) {
    try {
      const filters = request.query;
      const users = await this.userUseCases.getUsers(filters);
      return reply.code(200).send({
        success: true,
        users,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message,
      });
    }
  }

  async deactivateUser(request, reply) {
    try {
      const { id } = request.params;
      const user = await this.userUseCases.deactivateUser(id);
      return reply.code(200).send({
        success: true,
        message: "User deactivated successfully",
        user,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async activateUser(request, reply) {
    try {
      const { id } = request.params;
      const user = await this.userUseCases.activateUser(id);
      return reply.code(200).send({
        success: true,
        message: "User activated successfully",
        user,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }
  async deleteUser(request, reply) {
    try {
      const { id } = request.params;

      if (!request.user || String(request.user.id) !== String(id)) {
        return reply.code(403).send({
          success: false,
          message: "Unauthorized: You can only delete your own account",
        });
      }

      const user = await this.userUseCases.deleteUser(id);

      return reply.code(200).send({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async generateQr(request, reply) {
    try {
      const result = await this.userUseCases.generateQrToken();
      return reply.code(200).send({
        success: true,
        qrToken: result.qrToken,
        expiresAt: result.expiresAt
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  }

  async verifyQr(request, reply) {
    try {
      const { qrToken } = request.body;
      const userId = request.user.id;
      const device = request.body.device;
      
      if (!qrToken) {
        return reply.code(400).send({ success: false, message: "QR Token is required" });
      }

      const result = await this.userUseCases.verifyQrToken(qrToken, userId, request.ip, device);
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async checkQrStatus(request, reply) {
    try {
      const { token } = request.query;
      if (!token) {
        return reply.code(400).send({ success: false, message: "QR Token is required" });
      }
      const result = await this.userUseCases.checkQrStatus(token);
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async qrSse(request, reply) {
    const { token } = request.query;
    if (!token) {
      return reply.code(400).send("Token is required");
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send an initial event so connection is established
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

    if (this.sseService) {
      this.sseService.addClient(token, reply);
    }

    request.raw.on('close', () => {
      if (this.sseService) {
        this.sseService.removeClient(token, reply);
      }
    });
  }
}
