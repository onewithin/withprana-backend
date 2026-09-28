export class SubscriptionController {
  constructor(subscriptionUseCases, sseService) {
    this.subscriptionUseCases = subscriptionUseCases;
    this.sseService = sseService;
  }

  async subscribeSSE(request, reply) {
    const userId = request.user.id;

    // Set proper headers for SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    reply.raw.write(`retry: 10000\n\n`);

    // Register the client
    this.sseService.addClient(userId, reply);

    // Handle client disconnect
    request.raw.on('close', () => {
      this.sseService.removeClient(userId, reply);
    });
  }

  async createCheckoutSession(request, reply) {
    try {
      const { planId } = request.body;
      const userId = request.user.id;

      const result = await this.subscriptionUseCases.createSubscriptionCheckout(
        userId,
        planId,
      );

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async createAppCheckoutSession(request, reply) {
    try {
      const { planId } = request.body;
      const userId = request.user.id;

      const result =
        await this.subscriptionUseCases.createAppSubscriptionCheckout(
          userId,
          planId,
        );

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async handleWebhook(event) {
    try {
      await this.subscriptionUseCases.handleWebhookEvent(event);

      return { received: true };
    } catch (error) {
      console.error("Webhook error:", error);
      throw error;
    }
  }

  async getSubscriptionStatus(request, reply) {
    try {
      const userId = request.user.id;
      const status =
        await this.subscriptionUseCases.getUserSubscriptionStatus(userId);

      return reply.code(200).send({
        success: true,
        data: status,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async cancelSubscription(request, reply) {
    try {
      const userId = request.user.id;
      const result = await this.subscriptionUseCases.cancelSubscription(userId);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async generateBillingPortal(request, reply) {
    try {
      const userId = request.user.id;
      const { returnUrl } = request.body || {};
      const url = await this.subscriptionUseCases.generateBillingPortalLink(userId, returnUrl);
      return reply.code(200).send({ success: true, url });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getTransactionHistory(request, reply) {
    try {
      const userId = request.user.id;
      const filters = request.query;

      const result = await this.subscriptionUseCases.getTransactionHistory(
        userId,
        filters,
      );

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async getPlans(request, reply) {
    try {
      const includeHidden = request.query?.includeHidden === "true" || request.query?.includeHidden === true;
      const plans = await this.subscriptionUseCases.getSubscriptionPlans(
        request.user,
        includeHidden,
      );

      if (plans?.isSubscribed) {
        const planData = {
          plan: plans?.subscription?.plan?.name,
          renewalDate: plans?.subscription?.currentPeriodEnd,
          nextBillingAmount: plans?.subscription?.plan?.price,
          currency: plans?.subscription?.plan?.currency,
        };
        return reply.code(200).send({
          success: true,
          data: plans.subscription,
        });
      }

      if (!plans || (Array.isArray(plans) && plans.length === 0)) {
        return reply.code(200).send({
          success: true,
          data: [],
          message: "No subscription plans available",
        });
      }

      return reply.code(200).send({
        success: true,
        data: plans,
      });
    } catch (error) {
      console.error("Error in getPlans:", error);
      // Determine if it should be 404 or 400 based on error
      const statusCode = error.message.includes("not found") ? 404 : 400;
      return reply.code(statusCode).send({
        success: false,
        message: error.message,
      });
    }
  }

  async validatePremiumAccess(request, reply) {
    try {
      const userId = request.user.id;
      await this.subscriptionUseCases.validatePremiumAccess(userId);

      return reply.code(200).send({
        success: true,
        message: "Premium access granted",
      });
    } catch (error) {
      return reply.code(403).send({
        success: false,
        message: error.message,
      });
    }
  }

  async createPlan(request, reply) {
    try {
      const planData = request.body;

      const plan = await this.subscriptionUseCases.createPlan(planData);

      return reply.code(201).send({
        success: true,
        message: "Subscription plan created successfully",
        data: plan,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  // Admin: Update subscription plan
  async updatePlan(request, reply) {
    try {
      const { planId } = request.params;
      const planData = request.body;

      const plan = await this.subscriptionUseCases.updatePlan(planId, planData);

      return reply.code(200).send({
        success: true,
        message: "Subscription plan updated successfully",
        data: plan,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  // Admin: Toggle plan visibility
  async togglePlanVisibility(request, reply) {
    try {
      const { planId } = request.params;

      const plan = await this.subscriptionUseCases.togglePlanVisibility(planId);

      return reply.code(200).send({
        success: true,
        message: `Plan ${plan.visible ? "activated" : "deactivated"
          } successfully`,
        data: plan,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async getSubscriptions(request, reply) {
    try {
      const filters = request.query;

      const result = await this.subscriptionUseCases.getSubscriptions(filters);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  async getSubscriptionById(request, reply) {
    try {
      const { subscriptionId } = request.params;

      const subscription =
        await this.subscriptionUseCases.getSubscriptionById(subscriptionId);

      return reply.code(200).send({
        success: true,
        data: subscription,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  // Admin: Cancel subscription
  async adminCancelSubscription(request, reply) {
    try {
      const { subscriptionId } = request.params;

      const result =
        await this.subscriptionUseCases.adminCancelSubscription(subscriptionId);

      return reply.code(200).send({
        success: true,
        message: "Subscription cancelled successfully",
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }

  // Admin: Get all transactions with pagination
  async getAdminTransactions(request, reply) {
    try {
      const filters = request.query;

      const result =
        await this.subscriptionUseCases.getAdminTransactions(filters);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: error.message,
      });
    }
  }
}
