import {
  encryptDeterministic,
  decrypt,
  decryptDeterministic,
  decryptUserKey,
} from "../../../utils/encryption.js";

export class SubscriptionRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  _decryptUser(user) {
    if (!user) return user;
    const decrypted = { ...user };
    try {
      if (decrypted.encryptedUserKey) {
        const userKey = decryptUserKey(decrypted.encryptedUserKey);
        if (decrypted.name) decrypted.name = decrypt(decrypted.name, userKey);
      } else {
        if (decrypted.name) decrypted.name = decrypt(decrypted.name);
      }
    } catch (error) {
      console.error("Decryption failed for user:", user.id, error);
    }
    if (decrypted.email)
      decrypted.email = decryptDeterministic(decrypted.email);
    if (decrypted.user) {
      decrypted.user = this._decryptUser(decrypted.user);
    }
    return decrypted;
  }

  _decryptTransaction(transaction) {
    if (!transaction) return transaction;
    const decrypted = { ...transaction };
    if (decrypted.user) {
      decrypted.user = this._decryptUser(decrypted.user);
    }
    return decrypted;
  }

  async createSubscription(data) {
    const subscription = await this.prisma.subscription.create({
      data: {
        userId: data.userId,
        planId: data.planId,
        stripeSubscriptionId: data.stripeSubscriptionId || null,
        stripeCustomerId: data.stripeCustomerId || null,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        status: data.status,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
      },
    });

    const result = await this.prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            encryptedUserKey: true,
            subscriptionType: true,
          },
        },
      },
    });

    if (result && result.user) {
      result.user = this._decryptUser(result.user);
    }
    return result;
  }

  async updateSubscription(id, data) {
    const result = await this.prisma.subscription.update({
      where: { id },
      data,
      include: {
        plan: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            encryptedUserKey: true,
            subscriptionType: true,
          },
        },
      },
    });

    if (result && result.user) {
      result.user = this._decryptUser(result.user);
    }
    return result;
  }

  async deleteSubscription(where) {
    try {
      return await this.prisma.subscription.deleteMany({
        where,
      });
    } catch (error) {
      console.error("Error deleting subscription:", error);
      throw error;
    }
  }

  async findActiveSubscriptionByUserId(userId) {
    return await this.prisma.subscription.findFirst({
      where: {
        userId: userId,
        status: { in: ["ACTIVE", "TRIALING"] },
        currentPeriodEnd: {
          gt: new Date(),
        },
      },
      include: {
        plan: true,
      },
    });
  }

  async createTransaction(data) {
    const result = await this.prisma.transaction.create({
      data: {
        userId: data.userId,
        subscriptionId: data.subscriptionId || null,
        planId: data.planId || null,
        amount: data.amount,
        currency: data.currency || "usd",
        status: data.status,
        type: data.type || "SUBSCRIPTION",
        stripePaymentIntentId: data.stripePaymentIntentId || null,
        stripeInvoiceId: data.stripeInvoiceId || null,
        description: data.description || null,
        metadata: data.metadata || null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        subscription: true,
      },
    });

    return this._decryptTransaction(result);
  }

  async updateTransaction(id, data) {
    const result = await this.prisma.transaction.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            encryptedUserKey: true,
          },
        },
        subscription: true,
      },
    });
    return this._decryptTransaction(result);
  }

  async updateTransactionByCheckoutSession(checkoutSessionId, data) {
    // Find transaction by checkout session ID in metadata
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        metadata: {
          path: ["checkoutSessionId"],
          equals: checkoutSessionId,
        },
      },
    });

    if (!transaction) {
      // Alternative: Try to find by payment intent if available in data
      if (data.stripePaymentIntentId) {
        console.log(
          `[DEBUG] updateTransactionByCheckoutSession: Attempting lookup by stripePaymentIntentId: ${data.stripePaymentIntentId}`,
        );
        const transactionByPaymentIntent =
          await this.prisma.transaction.findFirst({
            where: {
              stripePaymentIntentId: data.stripePaymentIntentId,
            },
          });

        if (transactionByPaymentIntent) {
          console.log(
            `[DEBUG] updateTransactionByCheckoutSession: Found transaction ${transactionByPaymentIntent.id} by PaymentIntentID`,
          );
          return await this.prisma.transaction.update({
            where: { id: transactionByPaymentIntent.id },
            data,
          });
        }
      }

      console.warn(
        "Transaction not found for checkout session or payment intent:",
        checkoutSessionId,
      );

      throw new Error(
        "Transaction not found for checkout session: " + checkoutSessionId,
      );
    }

    return await this.prisma.transaction.update({
      where: { id: transaction.id },
      data,
    });
  }

  async findTransactionByStripePaymentIntent(stripePaymentIntentId) {
    const result = await this.prisma.transaction.findFirst({
      where: {
        stripePaymentIntentId: stripePaymentIntentId,
      },
      include: {
        user: true,
        subscription: true,
      },
    });
    return this._decryptTransaction(result);
  }

  async findTransactionByStripeInvoiceId(stripeInvoiceId) {
    const result = await this.prisma.transaction.findFirst({
      where: {
        stripeInvoiceId: stripeInvoiceId,
      },
      include: {
        user: true,
        subscription: true,
      },
    });
    return this._decryptTransaction(result);
  }

  async findTransactionByCheckoutSession(checkoutSessionId) {
    return await this.prisma.transaction.findFirst({
      where: {
        metadata: {
          path: ["checkoutSessionId"],
          equals: checkoutSessionId,
        },
      },
    });
  }

  async getUserTransactions(userId, filters = {}) {
    const { page = 1, limit = 10, status, type } = filters;
    const skip = (page - 1) * limit;

    const where = {
      userId: userId,
      ...(status && { status }),
      ...(type && { type }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Transaction usually just has user ID in this view according to schema/include,
    // but good practice to map if we included user. Here we didn't include user.
    return {
      transactions: transactions.map((t) => this._decryptTransaction(t)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserWithSubscription(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: {
            status: { in: ["ACTIVE", "TRIALING"] },
            currentPeriodEnd: {
              gt: new Date(),
            },
          },
          include: {
            plan: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    return this._decryptUser(user);
  }

  async getAllSubscriptionPlans(includeHidden = false) {
    try {
      return await this.prisma.subscriptionPlan.findMany({
        where: includeHidden ? {} : { visible: true },
        orderBy: { price: "asc" },
      });
    } catch (error) {
      console.error(error);
      throw new Error("Failed to get all subscription plans");
    }
  }

  async createPlan(data) {
    try {
      return await this.prisma.subscriptionPlan.create({
        data,
      });
    } catch (error) {
      console.error(error);
      throw new Error("Failed to create subscription plan");
    }
  }

  async updatePlan(planId, data) {
    try {
      return await this.prisma.subscriptionPlan.update({
        where: { id: planId },
        data,
      });
    } catch (error) {
      console.error(error);
      throw new Error("Failed to update subscription plan by ID: " + planId);
    }
  }

  async findPlanById(planId) {
    try {
      return await this.prisma.subscriptionPlan.findUnique({
        where: { id: planId },
      });
    } catch (error) {
      console.error(error);
      throw new Error("Failed to find subscription plan by ID: " + planId);
    }
  }

  async getSubscriptions(filters = {}) {
    const { page = 1, limit = 10, status, userId, planId, search } = filters;
    const skip = (page - 1) * limit;

    const where = {
      ...(status && { status }),
      ...(userId && { userId: userId }),
      ...(planId && { planId }),
    };

    if (search) {
      // Handle encryption for search
      // Fuzzy search for Name is NOT supported with randomized encryption.
      // We can only do exact match for Email using deterministic encryption.

      const encryptedSearch = encryptDeterministic(search);

      where.OR = [
        { user: { email: { equals: encryptedSearch } } }, // Exact match only
        // { user: { name: { contains: search, mode: "insensitive" } } }, // Cannot do this anymore
        { plan: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              encryptedUserKey: true,
              subscriptionType: true,
            },
          },
          plan: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    const decryptedSubscriptions = subscriptions.map((sub) => {
      if (sub.user) {
        sub.user = this._decryptUser(sub.user);
      }
      return sub;
    });

    return {
      subscriptions: decryptedSubscriptions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findSubscriptionById(subscriptionId) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            encryptedUserKey: true,
            subscriptionType: true,
          },
        },
        plan: true,
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (subscription && subscription.user) {
      subscription.user = this._decryptUser(subscription.user);
    }
    return subscription;
  }

  async findSubscriptionByStripeId(stripeSubscriptionId) {
    if (!stripeSubscriptionId) return null;
    return await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });
  }

  async getAdminTransactions(filters = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      type,
      userId,
      subscriptionId,
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      ...(status && { status }),
      ...(type && { type }),
      ...(userId && { userId: userId }),
      ...(subscriptionId && { subscriptionId }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              encryptedUserKey: true,
            },
          },
          subscription: {
            include: {
              plan: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => this._decryptTransaction(t)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async updateUserStripeCustomerId(userId, stripeCustomerId) {
    return await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId },
    });
  }

  // Additional helper method to check if user has active subscription
  async userHasActiveSubscription(userId) {
    const subscription = await this.findActiveSubscriptionByUserId(userId);
    return !!subscription;
  }

  // Method to get subscription by user ID
  async getSubscriptionByUserId(userId) {
    return await this.prisma.subscription.findFirst({
      where: {
        userId: userId,
      },
      include: {
        plan: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async isUserSubscribed(userId) {
    try {
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: userId,
          status: { in: ["ACTIVE", "TRIALING"] },
          currentPeriodEnd: {
            gt: new Date(), // not expired
          },
        },
        include: {
          plan: true,
        },
      });

      return {
        isSubscribed: !!activeSubscription,
        subscription: activeSubscription || null,
      };
    } catch (error) {
      console.error("Error checking user subscription:", error);
      throw new Error("Failed to check user subscription");
    }
  }
}
