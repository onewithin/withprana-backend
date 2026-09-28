import Stripe from "stripe";

export class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });
  }

  async createEphemeralKey(customerId, apiVersion = "2023-10-16") {
    try {
      const ephemeralKey = await this.stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: apiVersion },
      );
      return ephemeralKey;
    } catch (error) {
      console.error("Stripe ephemeral key creation error:", error);
      throw new Error(`Failed to create ephemeral key: ${error.message}`);
    }
  }

  async createProduct(name) {
    try {
      const product = await this.stripe.products.create({ name });
      return product;
    } catch (error) {
      throw new Error(`Failed to create Stripe product: ${error.message}`);
    }
  }

  async createPrice(productId, amount, currency, interval, intervalCount = 1) {
    try {
      const price = await this.stripe.prices.create({
        product: productId,
        unit_amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        recurring: {
          interval: interval.toLowerCase(),
          interval_count: intervalCount,
        },
      });
      return price;
    } catch (error) {
      throw new Error(`Failed to create Stripe price: ${error.message}`);
    }
  }

  async createBillingPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session;
    } catch (error) {
      throw new Error(`Failed to create billing portal session: ${error.message}`);
    }
  }

  async createCustomer(user) {
    try {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user.id.toString(),
        },
      });
      return customer;
    } catch (error) {
      console.error("Stripe customer creation error:", error);
      throw new Error(`Failed to create Stripe customer: ${error.message}`);
    }
  }

  async getCustomer(customerId) {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      return customer;
    } catch (error) {
      if (error.code === "resource_missing") {
        return null;
      }
      throw error;
    }
  }

  async createOrGetCustomer(user) {
    try {
      if (user.stripeCustomerId) {
        const existingCustomer = await this.getCustomer(user.stripeCustomerId);
        if (existingCustomer && !existingCustomer.deleted) {
          return existingCustomer;
        }
      }

      const customer = await this.createCustomer(user);
      return customer;
    } catch (error) {
      console.error("Error in createOrGetCustomer:", error);
      throw error;
    }
  }

  async createPaymentIntent(amount, currency = "usd", customerId = null) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
        },
      });
      return paymentIntent;
    } catch (error) {
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  async constructEvent(payload, signature, webhookSecret) {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      throw new Error(
        `Webhook signature verification failed: ${error.message}`,
      );
    }
  }

  async cancelSubscription(stripeSubscriptionId) {
    try {
      // Use update to cancel at period end instead of immediate cancellation
      const subscription = await this.stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        },
      );
      return subscription;
    } catch (error) {
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  async cancelSubscriptionImmediately(stripeSubscriptionId) {
    try {
      const subscription =
        await this.stripe.subscriptions.cancel(stripeSubscriptionId);
      return subscription;
    } catch (error) {
      throw new Error(
        `Failed to cancel subscription immediately: ${error.message}`,
      );
    }
  }

  async retrieveSubscription(stripeSubscriptionId) {
    try {
      const subscription =
        await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
      return subscription;
    } catch (error) {
      throw new Error(`Failed to retrieve subscription: ${error.message}`);
    }
  }

  async retrieveInvoice(invoiceId) {
    try {
      const invoice = await this.stripe.invoices.retrieve(invoiceId);
      return invoice;
    } catch (error) {
      throw new Error(`Failed to retrieve invoice: ${error.message}`);
    }
  }

  async retrievePaymentIntent(paymentIntentId) {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      throw new Error(`Failed to retrieve payment intent: ${error.message}`);
    }
  }

  async refundPayment(paymentIntentId) {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      return refund;
    } catch (error) {
      throw new Error(`Failed to refund payment: ${error.message}`);
    }
  }
}
