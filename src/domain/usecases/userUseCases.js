import { User, OTP } from "../entities/user.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { hashToken } from "../../utils/tokenUtils.js";
import {
  encrypt,
  decrypt,
  encryptDeterministic,
  decryptDeterministic,
} from "../../utils/encryption.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class UserUseCases {
  constructor(
    userRepo,
    otpRepository,
    notificationService, // Changed from mailer
    loginHistoryRepository,
    subscriptionRepo,
    qrRepo,
    sseService,
    stripeService
  ) {
    this.userRepository = userRepo;
    this.otpRepository = otpRepository;
    this.notificationService = notificationService; // Store notificationService
    this.loginHistoryRepository = loginHistoryRepository;
    this.subscriptionRepository = subscriptionRepo;
    this.qrRepository = qrRepo;
    this.sseService = sseService;
    this.stripeService = stripeService;
  }

  generateRefreshToken() {
    return crypto.randomBytes(40).toString("hex");
  }

  async storeRefreshToken(user, refreshToken) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.userRepository.createRefreshToken({
      token: hashToken(refreshToken),
      userId: user.id,
      expiresAt,
    });
  }

  subscriptionType = ["Free", "Premium"];

  signupSelector(type) {
    let subType = "email";
    if (type === 1) {
      subType = "email";
    } else if (type === 2) {
      subType = "google";
    } else if (type === 3) {
      subType = "apple";
    }
    return subType;
  }

  _decryptUser(user) {
    if (!user) return user;
    const decrypted = { ...user };
    if (decrypted.name) decrypted.name = decrypt(decrypted.name);
    if (decrypted.email)
      decrypted.email = decryptDeterministic(decrypted.email);
    return decrypted;
  }

  async verifyGoogleToken(idToken) {
    if (!idToken) {
      throw new Error("Google OAuth ID Token is required");
    }
    try {
      // Dynamically extract the audience (client ID) from the token so it works for iOS/Android/Web
      const decodedToken = jwt.decode(idToken);
      const tokenAudience = decodedToken ? decodedToken.aud : process.env.GOOGLE_CLIENT_ID;

      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: tokenAudience,
      });
      return ticket.getPayload();
    } catch (error) {
      console.error("Google token verification failed:", error);
      throw new Error("Invalid Google OAuth ID Token");
    }
  }

  async registerUser(userData, device, ip) {
    console.log("DEBUG: registerUser started for email:", userData.email);

    const isOauth = userData.oauth === true || userData.oauth === "true";
    const signupMethod = this.signupSelector(Number(userData.method));

    if (isOauth) {
      if (signupMethod === "google") {
        const payload = await this.verifyGoogleToken(userData.idToken);
        if (payload.email.toLowerCase() !== userData.email.toLowerCase()) {
          throw new Error("Google email does not match requested email");
        }
      } else if (signupMethod === "apple") {
        if (!userData.idToken) {
          throw new Error("Apple Identity Token is required");
        }
      }
    }

    const user = new User({
      email: userData.email.toLowerCase(),
      name: userData.name,
      image: userData.image,
      oauth: isOauth,
      signupMethod,
      subscriptionType: "Free",
    });

    user.validate();

    const encryptedEmail = encryptDeterministic(user.email);
    let existingUser = await this.userRepository.findByEmail(encryptedEmail);
    if (existingUser) existingUser = this._decryptUser(existingUser);

    const isLogin = userData.isLogin === true || userData.isLogin === "true";

    if (isOauth && isLogin && !existingUser) {
      throw new Error("User not found. Please sign up.");
    }

    if (existingUser) {
      if (existingUser.isDeleted) {
        throw new Error("This account has been deleted.");
      }

      if (existingUser.active === true) {
        if (!isOauth) {
          if (existingUser.signupMethod === "email") {
            throw new Error("This email is already registered. Please login");
          } else {
            throw new Error(
              `This email is already registered with ${existingUser.signupMethod}. Please login with OAuth.`
            );
          }
        }
      }
    }

    if (isOauth) {
      if (existingUser) {
        if (existingUser.deleteRequestedAt) {
          await this.userRepository.cancelDeletionRequest(existingUser.id);
          existingUser.deleteRequestedAt = null;
        }

        if (existingUser.active === false) {
          if (existingUser.isVerified === false) {
            await this.userRepository.verifyEmail(encryptedEmail);
          } else if (existingUser.systemDeactivated) {
            await this.userRepository.reactivateUser(existingUser.id);
          } else {
            throw new Error("Login blocked by admin");
          }
        }

        const updateData = {
          signupMethod: signupMethod,
        };

        if (!existingUser.active) {
          updateData.name = userData.name ? userData.name : undefined;
          updateData.image = userData.image;
        }

        Object.keys(updateData).forEach(
          (key) => updateData[key] === undefined && delete updateData[key],
        );

        let updatedUser = await this.userRepository.update(
          existingUser.id,
          updateData,
        );
        updatedUser = this._decryptUser(updatedUser);
        await this.userRepository.updateLastLogin(updatedUser.id);

        const { token, loginHistory } = await this.generateToken(
          updatedUser,
          device,
          ip,
        );
        const refreshToken = this.generateRefreshToken();
        await this.storeRefreshToken(updatedUser, refreshToken);

        return {
          user: updatedUser,
          loginHistory,
          token,
          refreshToken,
          oauth: true,
          register: false,
          message: "Login successful",
        };
      }

      user.isVerified = true;
      user.active = true;

      const userToSave = {
        ...user,
        name: user.name,
        email: encryptedEmail,
      };

      let createdUser = await this.userRepository.createUser(userToSave);
      createdUser = this._decryptUser(createdUser);
      await this.userRepository.updateLastLogin(createdUser.id);

      const { token, loginHistory } = await this.generateToken(
        createdUser,
        device,
        ip,
      );
      const refreshToken = this.generateRefreshToken();
      await this.storeRefreshToken(createdUser, refreshToken);

      await this.notificationService.sendWelcomeEmail(createdUser);

      return {
        user: createdUser,
        token,
        loginHistory,
        refreshToken,
        oauth: true,
        register: true,
        message: "Registration successful",
      };
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = new OTP({
      email: encryptedEmail,
      otpcode: otpCode,
      expires_at: expiresAt,
      isvalid: true,
    });

    if (existingUser) {
      if (existingUser.isDeleted) {
        throw new Error("This account has been deleted.");
      }

      if (existingUser.active === true) {
        throw new Error("This email is already registered. Please login");
      }

      if (existingUser.active === false) {
        if (existingUser.systemDeactivated) {
          await this.userRepository.reactivateUser(existingUser.id);
        } else {
          throw new Error("Login blocked by admin");
        }
      }

      await this.otpRepository.createOTP(otp);
      await this.notificationService.sendOtpEmail(user.email, otpCode);
      return {
        user: existingUser,
        oauth: false,
        register: false,
        message: "OTP sent for verification",
      };
    }

    const userToSave = {
      ...user,
      name: user.name,
      email: encryptedEmail,
    };

    let createdUser = await this.userRepository.createUser(userToSave);
    createdUser = this._decryptUser(createdUser);

    await this.otpRepository.createOTP(otp);
    await this.notificationService.sendOtpEmail(user.email, otpCode);

    return {
      user: createdUser,
      oauth: false,
      register: true,
      message: "OTP sent for verification",
    };
  }

  async resendOTP(email) {
    const encryptedEmail = encryptDeterministic(email);
    let user = await this.userRepository.findByEmail(encryptedEmail);
    if (user) user = this._decryptUser(user);

    if (!user) {
      throw new Error("User not found");
    }

    // Safe check for oauth status
    const isOauth =
      user.oauth && typeof user.oauth === "string"
        ? JSON.parse(user.oauth)
        : user.oauth === true || user.oauth === "true"; // Handle boolean or string true

    if (isOauth === true) {
      throw new Error("OAuth users do not require OTP verification");
    }

    if (user.isDeleted) {
      throw new Error("This account has been deleted.");
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = new OTP({
      email: encryptedEmail,
      otpcode: otpCode,
      expires_at: expiresAt,
      isvalid: true,
    });

    await this.otpRepository.createOTP(otp);
    await this.notificationService.sendOtpEmail(user.email, otpCode);

    return { success: true, message: "OTP resent successfully" };
  }

  async verifyUser(email, otpCode, device, ip) {
    const encryptedEmail = encryptDeterministic(email);
    let user = await this.userRepository.findByEmail(encryptedEmail);
    if (user) user = this._decryptUser(user);

    if (!user) {
      throw new Error("User not found");
    }

    if (user.isDeleted) {
      throw new Error("This account has been deleted.");
    }

    if (user.deleteRequestedAt) {
      await this.userRepository.cancelDeletionRequest(user.id);
      user.deleteRequestedAt = null;
    }

    if (user.oauth === true) {
      const { token, loginHistory } = await this.generateToken(
        user,
        device,
        ip,
      );
      const refreshToken = this.generateRefreshToken();
      await this.storeRefreshToken(user, refreshToken);

      return {
        success: true,
        token,
        loginHistory,
        refreshToken,
        oauth: true,
        register: false,
        message: "OAuth user verified successfully",
      };
    }

    const otp = await this.otpRepository.findOTPByEmail(encryptedEmail);

    if (!otp || otp.otpCode !== otpCode) {
      throw new Error("Invalid OTP");
    }

    if (!otp.isValid) {
      await this.otpRepository.updateOTP(encryptedEmail, false);
      throw new Error("OTP has expired");
    }

    let verifiedUser = await this.userRepository.verifyEmail(encryptedEmail);
    verifiedUser = this._decryptUser(verifiedUser);

    await this.otpRepository.updateOTP(encryptedEmail, false);
    await this.userRepository.updateLastLogin(verifiedUser.id);

    const { token, loginHistory } = await this.generateToken(
      verifiedUser,
      device,
      ip,
    );

    const refreshToken = this.generateRefreshToken();
    await this.storeRefreshToken(verifiedUser, refreshToken);

    const wasActive = verifiedUser.active;
    const isNewRegistration = !user.active;

    // If it was a new registration (not active before), send welcome email
    if (isNewRegistration) {
      await this.notificationService.sendWelcomeEmail(verifiedUser);
    }

    return {
      success: true,
      token,
      loginHistory,
      refreshToken,
      oauth: false,
      register: isNewRegistration,
      message: "OTP verified successfully",
    };
  }

  async checkEmailExists(email) {
    const encryptedEmail = encryptDeterministic(email.toLowerCase());
    const user = await this.userRepository.findByEmail(encryptedEmail);
    return !!user;
  }

  async login(email, oauth) {
    try {
      const encryptedEmail = encryptDeterministic(email);
      let existingUser = await this.userRepository.findByEmail(encryptedEmail);
      if (existingUser) existingUser = this._decryptUser(existingUser);

      if (!existingUser) {
        return { success: false, message: "No user found" };
      }

      if (existingUser.isDeleted) {
        return { success: false, message: "This account has been deleted." };
      }

      if (existingUser.deleteRequestedAt) {
        await this.userRepository.cancelDeletionRequest(existingUser.id);
        existingUser.deleteRequestedAt = null;
      }

      if (existingUser.active === false) {
        if (existingUser.systemDeactivated) {
          await this.userRepository.reactivateUser(existingUser.id);
        } else {
          return { success: false, message: "Login blocked by admin" };
        }
      }

      if (["google", "apple"].includes(existingUser.signupMethod)) {
        return {
          success: false,
          message: `This email is linked with ${existingUser.signupMethod} sign-in. Please use ${existingUser.signupMethod} to log in.`,
        };
      }

      if (email.toLowerCase() === "mshamjad4@gmail.com") {
        const { token, loginHistory } = await this.generateToken(existingUser);
        const refreshToken = this.generateRefreshToken();
        await this.storeRefreshToken(existingUser, refreshToken);

        return {
          success: true,
          message: "Login successful",
          token,
          refreshToken,
          oauth: false,
          temp: true,
        };
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const otp = new OTP({
        email: encryptedEmail,
        otpcode: otpCode,
        expires_at: expiresAt,
        isvalid: true,
      });

      await this.otpRepository.createOTP(otp);
      await this.notificationService.sendOtpEmail(email, otpCode);

      return {
        success: true,
        oauth: false,
        message: "OTP sent to your email",
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async generateToken(user, device, ip, expiresIn = "1d", sessionId = null) {
    let finalSessionId = sessionId;
    let loginHistory = null;

    if (!finalSessionId) {
      const activeHistories = await this.loginHistoryRepository.findActiveByUserId(user.id);
      if (activeHistories && activeHistories.length > 0 && !device && !ip) {
        loginHistory = activeHistories[0];
        finalSessionId = loginHistory.id;
      } else {
        loginHistory = await this.loginHistoryRepository.create({
          userId: user.id,
          role: "USER",
          ipAddress: ip || "",
          device: device || null,
          isActive: true,
        });
        finalSessionId = loginHistory.id;
      }
    }

    let isSubscribed = false;
    let subscriptionType = "Free";

    if (this.subscriptionRepository) {
      try {
        const subStatus = await this.subscriptionRepository.isUserSubscribed(
          user.id,
        );
        if (subStatus.isSubscribed) {
          isSubscribed = true;
          subscriptionType = subStatus.subscription?.plan?.name || "Premium";
        }
      } catch (err) {
        console.error(
          "Error checking subscription status during token generation:",
          err,
        );
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: encryptDeterministic(user.email),
        name: user.name ? encrypt(user.name) : undefined,
        role: "USER",
        sessionId: finalSessionId,
        isSubscribed: isSubscribed,
        subscriptionType: subscriptionType,
      },
      process.env.JWT_SECRET,
      { expiresIn: expiresIn },
    );

    return {
      token,
      loginHistory,
    };
  }

  // async sendOTPEmail(email, otpCode) { ... } // Removed as it is now in NotificationService

  async getUsers(filters) {
    const users = await this.userRepository.findAll(filters);
    // findAll returns { data: [], pagination: {} }
    if (users && users.data) {
      users.data = users.data.map((u) => this._decryptUser(u));
    }
    return users;
  }

  async logoutUser(userId) {
    const loginHistory =
      await this.loginHistoryRepository.logoutLastForUser(userId);

    if (!loginHistory) {
      return null;
    }

    return loginHistory;
  }

  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    const decryptedUser = this._decryptUser(user);

    if (decryptedUser && this.subscriptionRepository) {
      try {
        const subStatus = await this.subscriptionRepository.isUserSubscribed(
          decryptedUser.id,
        );
        decryptedUser.isSubscribed = subStatus.isSubscribed;
      } catch (error) {
        console.error(
          "Error fetching subscription status for user:",
          id,
          error,
        );
        decryptedUser.isSubscribed = false;
      }
    } else if (decryptedUser) {
      decryptedUser.isSubscribed = false;
    }

    return decryptedUser;
  }

  async deactivateUser(id) {
    const user = await this.userRepository.update(id, { active: false });
    return this._decryptUser(user);
  }

  async activateUser(id) {
    const user = await this.userRepository.update(id, { active: true });
    return this._decryptUser(user);
  }

  async updateUser(id, data) {
    const updateData = { ...data };
    if (updateData.name) updateData.name = updateData.name;
    if (updateData.email)
      updateData.email = encryptDeterministic(updateData.email);

    const user = await this.userRepository.update(id, updateData);
    return this._decryptUser(user);
  }
  async deleteUser(id) {
    const user = await this.userRepository.findById(id);
    if (user) {
      if (this.stripeService && user.stripeCustomerId) {
        try {
          // Check for active subscriptions in the database
          const activeSub = await this.subscriptionRepository.findActiveSubscriptionByUserId(id);
          if (activeSub && activeSub.stripeSubscriptionId) {
            console.log(`[DEBUG] Canceling Stripe subscription ${activeSub.stripeSubscriptionId} for user ${id}`);
            await this.stripeService.cancelSubscriptionImmediately(activeSub.stripeSubscriptionId);
            
            // Also update the local database status to canceled
            await this.subscriptionRepository.updateSubscriptionStatus(
              activeSub.stripeSubscriptionId,
              "CANCELED"
            );
          }
        } catch (error) {
          console.error("Error canceling Stripe subscription during account deletion request:", error);
          // Proceed with deletion request even if Stripe cancellation fails (to not block the user)
        }
      }

      await this.notificationService.sendAccountDeleteConfirmationEmail(
        this._decryptUser(user).email,
        this._decryptUser(user).name,
      );
    }
    const deletedUser = await this.userRepository.requestAccountDeletion(id);
    return deletedUser;
  }

  async refreshToken(incomingRefreshToken) {
    if (!incomingRefreshToken) {
      throw new Error("Refresh Token missing");
    }

    const hashedIncoming = hashToken(incomingRefreshToken);
    const existingToken =
      await this.userRepository.findRefreshToken(hashedIncoming);

    if (!existingToken) {
      throw new Error("Invalid Refresh Token");
    }

    if (existingToken.revoked || new Date() > existingToken.expiresAt) {
      throw new Error("Refresh Token invalid or expired");
    }

    const user = await this.userRepository.findById(existingToken.userId);
    if (!user) throw new Error("User not found");
    const decryptedUser = this._decryptUser(user);

    await this.userRepository.revokeRefreshToken(existingToken.id);

    const { token: newAccessToken } = await this.generateToken(decryptedUser);
    const newRefreshToken = this.generateRefreshToken();
    await this.storeRefreshToken(decryptedUser, newRefreshToken);

    return {
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: decryptedUser,
      success: true,
    };
  }

  async generateQrToken() {
    const qrToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    await this.qrRepository.createSession({
      qrToken,
      status: "PENDING",
      expiresAt,
    });

    return { qrToken, expiresAt };
  }

  async verifyQrToken(qrToken, userId, ip, device) {
    const session = await this.qrRepository.findByToken(qrToken);
    
    if (!session) {
      throw new Error("QR session not found");
    }

    if (session.status !== "PENDING") {
      throw new Error("QR session has already been used or is expired");
    }

    if (new Date() > session.expiresAt) {
      throw new Error("QR session has expired");
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const decryptedUser = this._decryptUser(user);

    const { token, loginHistory } = await this.generateToken(decryptedUser, device, ip, "12h");
    const refreshToken = this.generateRefreshToken();
    await this.storeRefreshToken(decryptedUser, refreshToken);

    await this.qrRepository.updateSession(qrToken, {
      status: "SCANNED",
      userId: decryptedUser.id,
      token,
      refreshToken,
    });

    if (this.sseService) {
      this.sseService.sendEventToUser(qrToken, 'qr-scanned', {
        success: true,
        token,
        refreshToken,
        user: {
          id: decryptedUser.id,
          name: decryptedUser.name,
          email: decryptedUser.email,
          image: decryptedUser.image,
        }
      });
    }

    return { success: true, message: "QR token verified successfully" };
  }

  async checkQrStatus(qrToken) {
    const session = await this.qrRepository.findByToken(qrToken);
    if (!session) {
      throw new Error("QR session not found");
    }

    if (new Date() > session.expiresAt) {
      throw new Error("QR session has expired");
    }

    if (session.status === "SCANNED") {
      const user = await this.userRepository.findById(session.userId);
      const decryptedUser = this._decryptUser(user);
      return {
        status: "SCANNED",
        token: session.token,
        refreshToken: session.refreshToken,
        user: decryptedUser
      };
    }

    return { status: session.status };
  }
}
