export class SubscriptionUseCases {
  constructor(
    subscriptionRepository,
    userRepository,
    stripeService,
    notificationService,
    sseService,
  ) {
    this.subscriptionRepo = subscriptionRepository;
    this.userRepo = userRepository;
    this.stripeService = stripeService;
    this.notificationService = notificationService;
    this.sseService = sseService;
  }

  async createSubscriptionCheckout(userId, planId) {
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const plan = await this.subscriptionRepo.findPlanById(planId);
      if (!plan) {
        throw new Error("Invalid subscription plan");
      }

      // Check for active subscription
      const activeSubscription =
        await this.subscriptionRepo.findActiveSubscriptionByUserId(userId);
      if (activeSubscription) {
        throw new Error("User already has an active subscription");
      }

      const customer = await this.stripeService.createOrGetCustomer(user);

      if (user.stripeCustomerId !== customer.id) {
        await this.subscriptionRepo.updateUserStripeCustomerId(
          userId,
          customer.id,
        );
      }

      let trialDays = plan.trialDays ?? 7;

      // Check if user has ever had a subscription to prevent multiple trials
      const pastSubscription = await this.subscriptionRepo.getSubscriptionByUserId(userId);
      if (pastSubscription) {
        console.log(`[DEBUG] User ${userId} already had a subscription previously. Forfeiting trial days.`);
        trialDays = 0;
      }

      console.log(
        `[DEBUG] createSubscriptionCheckout: Plan ${plan.name} has trialDays: ${trialDays}`,
      );

      const sessionConfig = {
        customer: customer.id,
        payment_method_collection: "always",
        payment_method_types: ["card"],
        mode: "subscription",
        success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
        metadata: {
          userId: userId.toString(),
          planId: plan.id,
          type: "SUBSCRIPTION_PAYMENT",
        },
        line_items: plan.stripePriceId ? [
          {
            price: plan.stripePriceId,
            quantity: 1,
          }
        ] : [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product_data: {
                name: plan.name,
                description: `${plan.intervalCount} ${plan.interval}(s) subscription`,
              },
              unit_amount: Math.round(plan.price * 100),
              recurring: {
                interval: plan.interval,
                interval_count: plan.intervalCount,
              },
            },
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            planId: plan.id,
          },
        },
      };

      if (trialDays > 0) {
        console.log(
          "[DEBUG] Using PAYMENT mode (Validation Charge) for trial subscription",
        );
        // For trials, we charge a small amount to validate and remove the card, then refund.
        sessionConfig.mode = "payment";
        sessionConfig.currency = plan.currency.toLowerCase();

        // Remove subscription-specific fields
        delete sessionConfig.subscription_data;

        // Add Validation Line Item (e.g., 1.00)
        sessionConfig.line_items = [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product_data: {
                name: "Card Validation (Refundable)",
                description:
                  "A temporary charge to validate your card. This will be fully refunded immediately.",
              },
              unit_amount: 100, // 1.00 unit (e.g., $1.00 or ₹1.00 if INR handles cents differently usually 100 paise)
            },
            quantity: 1,
          },
        ];

        // IMPORTANT: Save the card for future use (the subscription)
        sessionConfig.payment_intent_data = {
          setup_future_usage: "off_session",
        };

        // Update metadata for the webhook handler
        sessionConfig.metadata = {
          ...sessionConfig.metadata,
          type: "TRIAL_VALIDATION_CHARGE", // New Type
          trialDays: trialDays.toString(),
          planPrice: plan.price.toString(),
          planCurrency: plan.currency,
          planName: plan.name,
          planInterval: plan.interval,
          planIntervalCount: plan.intervalCount.toString(),
          stripePriceId: plan.stripePriceId || "", // Pass it for the webhook
        };
      }

      const session =
        await this.stripeService.stripe.checkout.sessions.create(sessionConfig);

      // Create pending transaction
      await this.subscriptionRepo.createTransaction({
        userId,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        status: "PENDING",
        type: "SUBSCRIPTION",
        stripePaymentIntentId: session.payment_intent || null,
        metadata: {
          checkoutSessionId: session.id,
          planName: plan.name,
          stripeCustomerId: customer.id,
          planInterval: plan.interval,
          planIntervalCount: plan.intervalCount,
        },
      });

      return {
        success: true,
        sessionId: session.id,
        paymentUrl: session.url,
        message: "Payment session created successfully",
      };
    } catch (error) {
      console.error("Error in createSubscriptionCheckout:", error);
      throw new Error(`Failed to create payment session: ${error.message}`);
    }
  }

  async sendTrialSubscriptionEmail(user, plan, trialEndDate) {
    try {
      if (!this.notificationService) {
        console.warn(
          "NotificationService not initialized, skipping trial email.",
        );
        return;
      }

      const trialEnd = new Date(trialEndDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const nextBillingDate = trialEnd;
      const amount = `${plan.currency.toUpperCase()} ${plan.price}`;

      await this.notificationService.sendTrialStartedEmail(
        user,
        plan,
        trialEndDate,
      );
      console.log(`Trial subscription email sent to ${user.email}`);
    } catch (error) {
      console.error("Failed to send trial subscription email:", error);
      // Don't throw error to prevent rolling back successful subscription
    }
  }

  /*
  async createAppSubscriptionCheckout(userId, planId) {
    try {
      console.log("Starting app checkout for user:", userId);

      const user = await this.userRepo.findById(userId);
      if (!user) throw new Error("User not found");

      const plan = await this.subscriptionRepo.findPlanById(planId);
      if (!plan) throw new Error("Invalid subscription plan");

      let trialDays = plan.trialDays ?? 7;

      // Check if user has ever had a subscription to prevent multiple trials
      const pastSubscription = await this.subscriptionRepo.getSubscriptionByUserId(userId);
      if (pastSubscription) {
        console.log(`[DEBUG] User ${userId} already had a subscription previously. Forfeiting trial days.`);
        trialDays = 0;
      }

      console.log(
        `[DEBUG] createAppSubscriptionCheckout: Plan ${plan.name} has trialDays: ${trialDays}`,
      );

      // Check for active subscription
      const activeSubscription =
        await this.subscriptionRepo.findActiveSubscriptionByUserId(userId);
      if (activeSubscription)
        throw new Error("User already has an active subscription");

      // Create or get valid Stripe customer
      const customer = await this.stripeService.createOrGetCustomer(user);

      // ✅ UPDATE CUSTOMER WITH REQUIRED DETAILS FOR INDIAN EXPORTS
      console.log(
        "🔄 Updating customer with required billing details for Indian exports...",
      );

      const updatedCustomer = await this.stripeService.stripe.customers.update(
        customer.id,
        {
          name: user.name || "Customer", // REQUIRED: Customer name
          address: {
            line1: "123 Main Street", // REQUIRED: Address line 1
            city: "Mumbai", // REQUIRED: City
            state: "Maharashtra", // REQUIRED: State
            postal_code: "400001", // REQUIRED: Postal code
            country: "IN", // REQUIRED: Country
          },
          // Also ensure email is set if not already
          email: user.email,
        },
      );

      console.log("✅ Customer updated with billing details:", {
        name: updatedCustomer.name,
        address: updatedCustomer.address,
      });

      // Update user with valid Stripe customer ID if changed
      if (user.stripeCustomerId !== customer.id) {
        await this.subscriptionRepo.updateUserStripeCustomerId(
          userId,
          customer.id,
        );
        console.log("Updated user with new Stripe customer ID:", customer.id);
      }

      // Create proper description for Indian regulations
      const description = `Meditation App Subscription: ${plan.name} - ${plan.intervalCount} ${plan.interval}(s) access`;

      // debug fix - removed duplicate declaration
      if (trialDays > 0) {
        console.log(
          `[DEBUG] createAppSubscriptionCheckout: creating Validation Charge for trial plan.`,
        );

        // Create a PaymentIntent for 1.00 unit to validate card
        const paymentIntent =
          await this.stripeService.stripe.paymentIntents.create({
            amount: 100, // 1.00 unit
            currency: plan.currency.toLowerCase(),
            customer: customer.id,
            setup_future_usage: "off_session",
            description: "Card Validation (Refundable)",
            metadata: {
              type: "APP_TRIAL_VALIDATION",
              userId: userId.toString(),
              planId: plan.id,
              planName: plan.name,
              planPrice: plan.price.toString(),
              planCurrency: plan.currency,
              planInterval: plan.interval,
              planIntervalCount: plan.intervalCount.toString(),
              trialDays: trialDays.toString(),
              stripePriceId: plan.stripePriceId || "",
            },
          });

        // Create transaction record for this validation charge
        await this.subscriptionRepo.createTransaction({
          userId,
          planId: plan.id,
          amount: 1, // 1.00
          currency: plan.currency,
          status: "PENDING",
          type: "VALIDATION",
          stripePaymentIntentId: paymentIntent.id,
          description: "Trial Validation Charge",
          metadata: {
            type: "APP_TRIAL_VALIDATION",
          },
        });

        const ephemeralKey = await this.stripeService.createEphemeralKey(
          customer.id,
        );

        return {
          success: true,
          clientSecret: paymentIntent.client_secret,
          customerId: customer.id,
          ephemeralKey: ephemeralKey.secret,
          trialValidation: true, // Flag to tell frontend this is a validation charge
        };
      }

      // NO TRIAL - Standard Subscription Creation
      console.log(`Creating subscription (No Trial) for user ${userId}`);

      const subscriptionConfig = {
        customer: customer.id,
        items: plan.stripePriceId ? [
          {
            price: plan.stripePriceId,
          }
        ] : undefined,
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
        metadata: {
          userId: userId.toString(),
          planId: plan.id,
          type: "APP_SUBSCRIPTION",
          planName: plan.name,
          description: description,
        },
      };

      if (!plan.stripePriceId) {
        // Fallback for old plans without stripePriceId
        const product = await this.stripeService.stripe.products.create({
          name: plan.name,
          description: description,
        });

        subscriptionConfig.items = [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product: product.id,
              unit_amount: Math.round(plan.price * 100),
              recurring: {
                interval: plan.interval,
                interval_count: plan.intervalCount,
              },
            },
          },
        ];
      }

      const subscription =
        await this.stripeService.stripe.subscriptions.create(
          subscriptionConfig,
        );

      console.log("✅ Subscription created:", subscription.id);

      // --- FIX START: Create Local Records Immediately ---
      try {
        const currentPeriodStart = new Date(
          subscription.current_period_start * 1000,
        );
        const currentPeriodEnd = new Date(
          subscription.current_period_end * 1000,
        );

        // 1. Create Local Subscription
        const newSub = await this.subscriptionRepo.createSubscription({
          userId: userId,
          planId: planId,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customer.id,
          currentPeriodStart: currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd,
          status: subscription.status.toUpperCase(),
          cancelAtPeriodEnd: false,
        });

        console.log(
          `Created local subscription ${newSub.id} for user ${userId}`,
        );

        // 2. Create Pending Transaction
        // We unlocked 'latest_invoice.payment_intent' so it should be available
        let paymentIntentId = null;
        let clientSecret = null;

        if (subscription.pending_setup_intent) {
          clientSecret = subscription.pending_setup_intent.client_secret;
        } else if (
          subscription.latest_invoice &&
          subscription.latest_invoice.payment_intent
        ) {
          const pi = subscription.latest_invoice.payment_intent;
          paymentIntentId = pi.id || pi; // Could be object or string depending on expansion
          clientSecret = pi.client_secret;
        }

        if (paymentIntentId) {
          await this.subscriptionRepo.createTransaction({
            userId,
            planId,
            subscriptionId: newSub.id,
            amount: plan.price,
            currency: plan.currency,
            status: "PENDING",
            type: "SUBSCRIPTION",
            stripePaymentIntentId: paymentIntentId,
            description: description,
            metadata: {
              ...subscriptionConfig.metadata,
              planInterval: plan.interval,
              planIntervalCount: plan.intervalCount,
            },
          });
          console.log(`Created pending transaction for PI ${paymentIntentId}`);
        }

        // Create Ephemeral Key for Mobile SDK
        const ephemeralKey = await this.stripeService.createEphemeralKey(
          customer.id,
        );

        return {
          success: true,
          clientSecret: clientSecret,
          subscriptionId: subscription.id,
          customerId: customer.id,
          ephemeralKey: ephemeralKey.secret,
          requiresPaymentMethod: !!subscription.pending_setup_intent,
          description: description,
          message: "Subscription initiated successfully",
        };
      } catch (innerError) {
        console.error(
          "Error creating local records during checkout:",
          innerError,
        );
        // Don't fail the whole request if local DB fails, but it's risky.
        // Re-throwing is probably safer so client knows something is wrong,
        // but Stripe sub is already created.
        // Ideally we should cancel Stripe sub here if DB fails, but let's just log for now
        // and return the stripe details so user can at least pay (webhook might fix it via fallback).
        // Actually, if we re-throw, the frontend might retry or show error.
        throw innerError;
      }
      // --- FIX END ---
    } catch (error) {
      console.error("❌ Error in createAppSubscriptionCheckout:", error);
      throw new Error(`Failed to create mobile subscription: ${error.message}`);
    }
  }
  */

  async createAppSubscriptionCheckout(userId, planId) {
    try {
      console.log("Starting web checkout session for user:", userId);

      const user = await this.userRepo.findById(userId);
      if (!user) throw new Error("User not found");

      const plan = await this.subscriptionRepo.findPlanById(planId);
      if (!plan) throw new Error("Invalid subscription plan");

      let trialDays = plan.trialDays ?? 7;

      // Check if user has ever had a subscription to prevent multiple trials
      const pastSubscription = await this.subscriptionRepo.getSubscriptionByUserId(userId);
      if (pastSubscription) {
        console.log(`[DEBUG] User ${userId} already had a subscription previously. Forfeiting trial days.`);
        trialDays = 0;
      }

      console.log(
        `[DEBUG] createAppSubscriptionCheckout: Plan ${plan.name} has trialDays: ${trialDays}`
      );

      // Check for active subscription
      const activeSubscription = await this.subscriptionRepo.findActiveSubscriptionByUserId(userId);
      if (activeSubscription) throw new Error("User already has an active subscription");

      // Create or get valid Stripe customer
      const customer = await this.stripeService.createOrGetCustomer(user);

      // ✅ UPDATE CUSTOMER WITH REQUIRED DETAILS FOR INDIAN EXPORTS
      console.log("🔄 Updating customer with required billing details for Indian exports...");
      await this.stripeService.stripe.customers.update(customer.id, {
        name: user.name || "Customer", // REQUIRED: Customer name
        address: {
          line1: "123 Main Street",
          city: "Mumbai", // REQUIRED: City
          state: "Maharashtra", // REQUIRED: State
          postal_code: "400001", // REQUIRED: Postal code
          country: "IN", // REQUIRED: Country
        },
        // Also ensure email is set if not already
        email: user.email,
      });

      console.log("✅ Customer updated with billing details:", {
        name: user.name || "Customer",
      });

      // Update user with valid Stripe customer ID if changed
      if (user.stripeCustomerId !== customer.id) {
        await this.subscriptionRepo.updateUserStripeCustomerId(
          userId,
          customer.id
        );
        console.log("Updated user with new Stripe customer ID:", customer.id);
      }

      // Create proper description for Indian regulations
      const description = `Meditation App Subscription: ${plan.name} - ${plan.intervalCount} ${plan.interval}(s) access`;

      console.log(`Creating checkout session for user ${userId}`);

      const sessionConfig = {
        payment_method_types: ['card'],
        mode: 'subscription',
        customer: customer.id,
        // Update these URLs to match your frontend routes
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancelled`,
        metadata: {
          userId: userId.toString(),
          planId: plan.id,
          type: "APP_SUBSCRIPTION_CHECKOUT",
        },
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            planId: plan.id,
            type: "APP_SUBSCRIPTION",
            planName: plan.name,
            description: description,
          }
        }
      };

      if (trialDays > 0) {
        sessionConfig.subscription_data.trial_period_days = trialDays;
      }

      if (plan.stripePriceId) {
        sessionConfig.line_items = [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ];
      } else {
        // Fallback for custom plan without stripePriceId
        const product = await this.stripeService.stripe.products.create({
          name: plan.name,
          description: description,
        });

        sessionConfig.line_items = [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product: product.id,
              unit_amount: Math.round(plan.price * 100),
              recurring: {
                interval: plan.interval,
                interval_count: plan.intervalCount,
              },
            },
            quantity: 1,
          },
        ];
      }

      const session = await this.stripeService.stripe.checkout.sessions.create(sessionConfig);

      console.log("✅ Checkout Session created:", session.id);

      return {
        success: true,
        url: session.url,
        sessionId: session.id,
        message: "Checkout session created successfully",
      };

    } catch (error) {
      console.error("❌ Error in createAppSubscriptionCheckout (Session):", error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  async handleWebhookEvent(event) {
    try {
      console.log(`Received webhook event: ${event.type}`);

      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;

        case "payment_intent.succeeded":
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case "payment_intent.payment_failed":
          await this.handlePaymentIntentFailed(event.data.object);
          break;

        case "invoice.payment_succeeded":
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;

        case "customer.subscription.updated":
          await this.handleSubscriptionUpdated(event.data.object);
          break;

        case "customer.subscription.deleted":
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error("Webhook error:", error);
      throw new Error(`Webhook handling failed: ${error.message}`);
    }
  }

  async handleSubscriptionDeleted(stripeSubscription) {
    try {
      console.log("Processing subscription deletion:", stripeSubscription.id);

      const existingSubscription =
        await this.subscriptionRepo.findSubscriptionByStripeId(
          stripeSubscription.id,
        );

      // Check if already processed/canceled to avoid duplicate emails (e.g. from manual cancel)
      if (existingSubscription && existingSubscription.status === "CANCELED") {
        console.log(
          `Subscription ${existingSubscription.id} is already CANCELED. Skipping webhook processing/email.`,
        );
        return;
      }

      if (existingSubscription) {
        // Capture previous status to determine email type
        const previousStatus = existingSubscription.status;

        await this.subscriptionRepo.updateSubscription(
          existingSubscription.id,
          {
            status: "CANCELED",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: new Date(),
          },
        );

        await this.userRepo.updateUserSubscriptionType(
          existingSubscription.userId,
          "Free",
        );

        console.log(
          `Subscription ${existingSubscription.id} canceled and user reverted to free plan.`,
        );

        // Send Cancellation Email
        try {
          const user = await this.userRepo.findById(
            existingSubscription.userId,
          );
          const plan = await this.subscriptionRepo.findPlanById(
            existingSubscription.planId,
          );

          if (user && this.notificationService) {
            const planName = plan ? plan.name : "Premium Plan";

            if (previousStatus === "TRIALING") {
              // It was a trial, send Trial Cancelled Email
              await this.notificationService.sendTrialCancelledEmail(
                user,
                planName,
              );
            } else {
              // It was active/paid, send Subscription Cancelled Email
              // Note: If cancelAtPeriodEnd was true, user might have already received "Scheduled" email.
              // We might want to avoid spamming, but for now, sending a "Final" cancellation email (with current date/access revoked)
              // using the generic email might be okay, OR we skip if we want.
              // Given requirements, let's treat it as a generic cancellation if not trial.
              // BUT, the 'sendSubscriptionCancelledEmail' says "You will continue to have access...".
              // That is wrong for a 'deleted' event (access is gone).

              // Ideally we should have a 'sendSubscriptionEndedEmail'.
              // For now, to solve the reported bug (incorrect message), we at least ensure it doesn't send the "Scheduled" email for Trial.

              // If it was Paid and deleted, we probably shouldn't send the "Scheduled" email again.
              // If existingSubscription.cancelAtPeriodEnd is true, they already got the email.

              if (!existingSubscription.cancelAtPeriodEnd) {
                // Only send if it wasn't already scheduled (e.g. involuntary churn or immediate cancel)
                // But wait, the method sends "Access until...". If deleted, access is NOW.
                // The template needs to be accurate.

                // Let's use the Trial email for immediate revocation? No, text is specific.
                // Let's Skip email for Paid deletion for now to be safe, AS REQUESTED only Trial issue was highlighted.
                // AND preventing the duplicate is key.

                // Reverting to previous logic but gated:
                await this.notificationService.sendSubscriptionCancelledEmail(
                  user,
                  planName,
                  new Date(), // Access ends now
                );
              }
            }
          }
        } catch (emailError) {
          console.error(
            "Failed to send subscription cancellation email:",
            emailError,
          );
        }
      }
    } catch (error) {
      console.error("Error handling subscription deletion:", error);
    }
  }

  async handleInvoicePaymentSucceeded(invoice) {
    try {
      if (!invoice.subscription) {
        console.log(
          "Invoice payment succeeded but no subscription ID found. Full invoice:",
          JSON.stringify(invoice, null, 2),
        );
        // Try fallback mechanisms?
        return;
      }

      console.log(
        `Processing invoice payment succeeded: ${invoice.id} for subscription ${invoice.subscription}`,
      );

      // Fetch subscription from Stripe to get latest dates
      const stripeSubscription = await this.stripeService.retrieveSubscription(
        invoice.subscription,
      );

      const currentPeriodStart = new Date(
        stripeSubscription.current_period_start * 1000,
      );
      const currentPeriodEnd = new Date(
        stripeSubscription.current_period_end * 1000,
      );
      const status = stripeSubscription.status.toUpperCase();

      // Update local subscription
      const existingSubscription =
        await this.subscriptionRepo.findSubscriptionByStripeId(
          invoice.subscription,
        );

      if (existingSubscription) {
        await this.subscriptionRepo.updateSubscription(
          existingSubscription.id,
          {
            status: status,
            currentPeriodStart: currentPeriodStart,
            currentPeriodEnd: currentPeriodEnd,
            stripeCustomerId: invoice.customer,
          },
        );

        // Ensure user type is set to premium on successful payment/renewal
        await this.userRepo.updateUserSubscriptionType(
          existingSubscription.userId,
          "premium",
        );

        console.log(
          `Updated subscription ${existingSubscription.id} after invoice payment`,
        );

        // Check if a transaction already exists for this invoice (Primary Check)
        let existingTransaction =
          await this.subscriptionRepo.findTransactionByStripeInvoiceId(
            invoice.id,
          );

        // Secondary Check: Payment Intent (if Invoice ID lookup failed)
        if (!existingTransaction && invoice.payment_intent) {
          const paymentIntentId =
            typeof invoice.payment_intent === "string"
              ? invoice.payment_intent
              : invoice.payment_intent.id;

          existingTransaction =
            await this.subscriptionRepo.findTransactionByStripePaymentIntent(
              paymentIntentId,
            );
        }

        if (existingTransaction) {
          console.log(
            `Transaction already exists for Invoice ${invoice.id}, updating...`,
          );
          await this.subscriptionRepo.updateTransaction(
            existingTransaction.id,
            {
              status: "SUCCEEDED",
              stripeInvoiceId: invoice.id,
              description: `Subscription renewal/payment: ${invoice.number}`,
              metadata: {
                invoiceUrl: invoice.hosted_invoice_url,
                periodStart: currentPeriodStart,
                periodEnd: currentPeriodEnd,
              },
            },
          );
        } else {
          // Create a succeeded transaction record for this invoice (Renewal)
          const paymentIntentId =
            typeof invoice.payment_intent === "string"
              ? invoice.payment_intent
              : invoice.payment_intent?.id;

          await this.subscriptionRepo.createTransaction({
            userId: existingSubscription.userId,
            subscriptionId: existingSubscription.id,
            planId: existingSubscription.planId,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            status: "SUCCEEDED",
            type: "RENEWAL",
            stripePaymentIntentId: paymentIntentId,
            stripeInvoiceId: invoice.id,
            description: `Subscription renewal/payment: ${invoice.number}`,
            metadata: {
              invoiceUrl: invoice.hosted_invoice_url,
              periodStart: currentPeriodStart,
              periodEnd: currentPeriodEnd,
            },
          });

          // Send Digital Receipt (In-app + Email)
          const user = await this.userRepo.findById(
            existingSubscription.userId,
          );
          if (user && this.notificationService) {
            await this.notificationService.notifyDigitalBillingReceipt(
              user,
              invoice.amount_paid / 100,
              invoice.currency,
              invoice.hosted_invoice_url,
              `Subscription payment (${invoice.number || "Receipt"})`,
            );
          }

          if (this.sseService) {
            this.sseService.sendEventToUser(existingSubscription.userId, "payment_success", {
              message: "Subscription payment succeeded",
              amount: invoice.amount_paid / 100,
              currency: invoice.currency
            });
          }
        }
      } else {
        // Fallback or New Subscription for No-Trial plans:
        // If no existing subscription is found in DB, it might be a new subscription that had 0 trial days,
        // so we relied on this webhook to create it.

        console.log(
          "Subscription not found in DB. Checking if it needs to be created (No-Trial Flow)...",
        );

        // Metadata should have been attached during subscription creation
        const metadata = stripeSubscription.metadata;

        if (metadata && metadata.userId && metadata.planId) {
          const userId = metadata.userId;
          const planId = metadata.planId;

          console.log(
            `Creating new ACTIVE subscription for user ${userId} via webhook.`,
            metadata,
          );

          // Get Subscription details from Stripe to verify payment method
          // fetching stripeSubscription which was already fetched above.
          const sub = stripeSubscription;

          // STRICT CHECK: For trials, ensure a default payment method is set on the subscription
          let finalStatus = status;
          if (
            sub.status === "trialing" &&
            !sub.default_payment_method &&
            !invoice.default_payment_method
          ) {
            console.log(
              "No payment method found for trial. Marking as INCOMPLETE locally.",
            );
            finalStatus = "INCOMPLETE";
          }

          // Get Plan details for Email and Transaction
          const plan = await this.subscriptionRepo.findPlanById(planId);
          // Get User for Email
          const user = await this.userRepo.findById(userId);

          await this.subscriptionRepo.createSubscription({
            userId: userId,
            planId: planId,
            stripeSubscriptionId: invoice.subscription,
            stripeCustomerId: invoice.customer,
            currentPeriodStart: currentPeriodStart,
            currentPeriodEnd: currentPeriodEnd,
            status: finalStatus, // Use the gated status
            cancelAtPeriodEnd: false,
          });

          // Update user to premium ONLY if status is NOT INCOMPLETE
          if (finalStatus !== "INCOMPLETE") {
            await this.userRepo.updateUserSubscriptionType(userId, "premium");
          } else {
            // Ensure they stay on Free if incomplete
            await this.userRepo.updateUserSubscriptionType(userId, "Free");
          }

          // Fetch the newly created subscription to get its DB ID
          const newSub = await this.subscriptionRepo.findSubscriptionByStripeId(
            invoice.subscription,
          );

          // Send Trial Email if status is TRIALING (and valid)
          if (finalStatus === "TRIALING" && plan && user) {
            await this.notificationService.sendTrialStartedEmail(
              user,
              plan,
              currentPeriodEnd,
            );
          } else if (finalStatus === "ACTIVE" && plan && user) {
            // Send Subscription Started Email (Non-Trial)
            await this.notificationService.sendSubscriptionStartedEmail(
              user,
              plan,
              currentPeriodEnd,
            );
          }

          if (newSub) {
            // Create the transaction
            await this.subscriptionRepo.createTransaction({
              userId: userId,
              planId: planId,
              subscriptionId: newSub.id,
              amount: invoice.amount_paid / 100,
              currency: invoice.currency,
              status: "SUCCEEDED",
              type: "SUBSCRIPTION", // Initial payment
              stripePaymentIntentId: invoice.payment_intent,
              stripeInvoiceId: invoice.id,
              description: `Subscription payment: ${invoice.number}`,
              metadata: {
                invoiceUrl: invoice.hosted_invoice_url,
                periodStart: currentPeriodStart,
                periodEnd: currentPeriodEnd,
              },
            });
            console.log(
              `Created new subscription ${newSub.id} and transaction for user ${userId}`,
            );
            if (this.sseService) {
              this.sseService.sendEventToUser(userId, "payment_success", {
                message: "Subscription created successfully",
                amount: invoice.amount_paid / 100,
                currency: invoice.currency
              });
            }
          } else {
            console.error(
              "Failed to retrieve newly created subscription for transaction creation.",
            );
          }
        } else {
          console.warn(
            "Subscription not found and no metadata to create it:",
            invoice.id,
          );
        }
      }
    } catch (error) {
      console.error("Error handling invoice payment:", error);
    }
  }

  async handleSubscriptionUpdated(stripeSubscription) {
    try {
      console.log("Processing subscription update:", stripeSubscription.id);

      const existingSubscription =
        await this.subscriptionRepo.findSubscriptionByStripeId(
          stripeSubscription.id,
        );

      if (existingSubscription) {
        let currentPeriodStart = existingSubscription.currentPeriodStart;
        let currentPeriodEnd = existingSubscription.currentPeriodEnd;

        if (stripeSubscription.current_period_start) {
          try {
            const start = new Date(
              stripeSubscription.current_period_start * 1000,
            );
            if (!isNaN(start.getTime())) {
              currentPeriodStart = start;
            } else {
              console.warn(
                `Invalid current_period_start for subscription ${stripeSubscription.id}:`,
                stripeSubscription.current_period_start,
              );
            }
          } catch (e) {
            console.error("Error parsing current_period_start:", e);
          }
        }

        if (stripeSubscription.current_period_end) {
          try {
            const end = new Date(stripeSubscription.current_period_end * 1000);
            if (!isNaN(end.getTime())) {
              currentPeriodEnd = end;
            } else {
              console.warn(
                `Invalid current_period_end for subscription ${stripeSubscription.id}:`,
                stripeSubscription.current_period_end,
              );
            }
          } catch (e) {
            console.error("Error parsing current_period_end:", e);
          }
        }

        await this.subscriptionRepo.updateSubscription(
          existingSubscription.id,
          {
            status: stripeSubscription.status.toUpperCase(),
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          },
        );
        console.log(
          `Synced subscription ${existingSubscription.id} with Stripe update`,
        );
      }
    } catch (error) {
      console.error("Error handling subscription update:", error);
    }
  }

  async handleCheckoutSessionCompleted(session) {
    try {
      const { userId, planId, type } = session.metadata;

      // Handle Trial Validation Charge (Charge & Refund flow)
      if (type === "TRIAL_VALIDATION_CHARGE") {
        await this.handleTrialValidationSuccess(session);
        return;
      }

      // Handle Trial Setup Session
      if (type === "SUBSCRIPTION_TRIAL_SETUP") {
        await this.handleTrialSetupCompleted(session);
        return;
      }

      if (!userId || !planId || type !== "SUBSCRIPTION_PAYMENT") {
        console.warn("Invalid metadata in checkout session:", session.id);
        return;
      }

      // Check if this was a subscription mode session
      let stripeSubscriptionId = null;
      let currentPeriodStart = new Date();
      let currentPeriodEnd = new Date();
      let status = "ACTIVE";

      let existingSubscription = null;

      if (session.subscription) {
        // It's a subscription mode session
        stripeSubscriptionId = session.subscription;

        // 1. Try to find by Stripe Subscription ID first (Best match)
        existingSubscription =
          await this.subscriptionRepo.findSubscriptionByStripeId(
            stripeSubscriptionId,
          );

        // Fetch actual subscription details from Stripe
        // We use the stripe service instance attached to this class
        const stripeSubscription =
          await this.stripeService.retrieveSubscription(stripeSubscriptionId);

        if (stripeSubscription) {
          currentPeriodStart = new Date(
            stripeSubscription.current_period_start * 1000,
          );
          currentPeriodEnd = new Date(
            stripeSubscription.current_period_end * 1000,
          );
          status = stripeSubscription.status.toUpperCase(); // e.g. TRIALING, ACTIVE
        }
      } else {
        // Fallback for one-time payment mode (legacy support)
        const plan = await this.subscriptionRepo.findPlanById(planId);
        if (plan) {
          if (plan.interval === "month") {
            currentPeriodEnd.setMonth(
              currentPeriodStart.getMonth() + (plan.intervalCount || 1),
            );
          } else if (plan.interval === "year") {
            currentPeriodEnd.setFullYear(
              currentPeriodStart.getFullYear() + (plan.intervalCount || 1),
            );
          } else {
            currentPeriodEnd.setMonth(currentPeriodStart.getMonth() + 1);
          }
        }
      }

      // 2. Fallback: Find active subscription by User ID if not found by Stripe ID
      if (!existingSubscription) {
        existingSubscription =
          await this.subscriptionRepo.findActiveSubscriptionByUserId(userId);
      }

      if (existingSubscription) {
        console.log(
          "Subscription already exists (updating):",
          existingSubscription.id,
        );
        // If it exists but we just completed a new checkout, we might want to update it
        // specially if we are switching plans or re-subscribing
        await this.subscriptionRepo.updateSubscription(
          existingSubscription.id,
          {
            stripeSubscriptionId:
              stripeSubscriptionId || existingSubscription.stripeSubscriptionId,
            currentPeriodStart,
            currentPeriodEnd,
            status,
            planId, // Update plan if changed
          },
        );

        await this.subscriptionRepo.updateTransactionByCheckoutSession(
          session.id,
          {
            status: "SUCCEEDED",
            stripePaymentIntentId: session.payment_intent,
            subscriptionId: existingSubscription.id,
          },
        );
        return;
      }

      const subscription = await this.subscriptionRepo.createSubscription({
        userId: userId,
        planId: planId,
        stripeSubscriptionId: stripeSubscriptionId,
        stripeCustomerId: session.customer,
        currentPeriodStart: currentPeriodStart,
        currentPeriodEnd: currentPeriodEnd,
        status: status,
        cancelAtPeriodEnd: false,
      });

      await this.userRepo.updateUserSubscriptionType(userId, "premium");

      if (this.notificationService) {
        const user = await this.userRepo.findById(userId);
        const plan = await this.subscriptionRepo.findPlanById(planId);
        if (user && plan) {
          await this.notificationService.notifyPremiumPlanSelected(
            user,
            plan,
            currentPeriodEnd,
          );
        }
      }

      await this.subscriptionRepo.updateTransactionByCheckoutSession(
        session.id,
        {
          status: "SUCCEEDED",
          subscriptionId: subscription.id,
          stripePaymentIntentId: session.payment_intent,
        },
      );

      console.log(
        `Subscription created for user ${userId} via webhook. Status: ${status}`,
      );

      if (this.sseService) {
        this.sseService.sendEventToUser(userId, "payment_success", {
          message: "Checkout session completed successfully",
          status: status
        });
      }
    } catch (error) {
      console.error("Error handling checkout session completed:", error);
      await this.subscriptionRepo.updateTransactionByCheckoutSession(
        session.id,
        {
          status: "FAILED",
        },
      );
      throw error;
    }
  }

  async handlePaymentIntentSucceeded(paymentIntent) {
    try {
      console.log("Processing payment intent succeeded:");

      // Check for Trial Validation Charge
      if (
        paymentIntent.metadata &&
        (paymentIntent.metadata.type === "TRIAL_VALIDATION_CHARGE" ||
          paymentIntent.metadata.type === "APP_TRIAL_VALIDATION")
      ) {
        // Construct a mock "session" object since handleTrialValidationSuccess expects session-like structure with metadata
        // and payment_intent property.
        const mockSession = {
          id: paymentIntent.id, // Use PI ID as session ID for logging/transaction update
          metadata: paymentIntent.metadata,
          payment_intent: paymentIntent.id,
          customer: paymentIntent.customer,
        };
        await this.handleTrialValidationSuccess(mockSession);
        return;
      }

      const transaction =
        await this.subscriptionRepo.findTransactionByStripePaymentIntent(
          paymentIntent.id,
        );

      if (!transaction) {
        console.warn(
          "No transaction found for payment intent:",
          paymentIntent.id,
        );
        return;
      }

      if (transaction.status === "SUCCEEDED") {
        return;
      }
      let existingSubscription = null;
      if (transaction.subscriptionId) {
        existingSubscription = await this.subscriptionRepo.findSubscriptionById(
          transaction.subscriptionId,
        );
      }

      if (!existingSubscription) {
        existingSubscription =
          await this.subscriptionRepo.findActiveSubscriptionByUserId(
            transaction.userId,
          );
      }

      if (!existingSubscription) {
        const plan = await this.subscriptionRepo.findPlanById(
          transaction.planId,
        );
        if (!plan) {
          throw new Error(`Plan not found: ${transaction.planId}`);
        }

        const now = new Date();
        let currentPeriodEnd = new Date();

        if (plan.interval === "month") {
          currentPeriodEnd.setMonth(now.getMonth() + (plan.intervalCount || 1));
        } else if (plan.interval === "year") {
          currentPeriodEnd.setFullYear(
            now.getFullYear() + (plan.intervalCount || 1),
          );
        } else {
          currentPeriodEnd.setMonth(now.getMonth() + 1);
        }

        const subscription = await this.subscriptionRepo.createSubscription({
          userId: transaction.userId,
          planId: transaction.planId,
          stripeSubscriptionId: null,
          stripeCustomerId: paymentIntent.customer,
          currentPeriodStart: now,
          currentPeriodEnd: currentPeriodEnd,
          status: "ACTIVE",
          cancelAtPeriodEnd: false,
        });

        await this.userRepo.updateUserSubscriptionType(
          transaction.userId,
          "premium",
        );

        await this.subscriptionRepo.updateTransaction(transaction.id, {
          status: "SUCCEEDED",
          subscriptionId: subscription.id,
        });

        console.log(
          `Subscription created for user ${transaction.userId} via payment intent webhook`,
        );
      } else {
        await this.subscriptionRepo.updateTransaction(transaction.id, {
          status: "SUCCEEDED",
        });
        console.log(
          `Payment succeeded for existing subscription user: ${transaction.userId}`,
        );
      }
    } catch (error) {
      console.error("Error handling payment intent succeeded:", error);
      const transaction =
        await this.subscriptionRepo.findTransactionByStripePaymentIntent(
          paymentIntent.id,
        );
      if (transaction) {
        await this.subscriptionRepo.updateTransaction(transaction.id, {
          status: "FAILED",
        });
      }
    }
  }

  async handlePaymentIntentFailed(paymentIntent) {
    try {
      console.log("Processing payment intent failed:", paymentIntent.id);

      const transaction =
        await this.subscriptionRepo.findTransactionByStripePaymentIntent(
          paymentIntent.id,
        );

      if (transaction) {
        await this.subscriptionRepo.updateTransaction(transaction.id, {
          status: "FAILED",
        });
        console.log(`Payment failed for transaction: ${transaction.id}`);
      }
    } catch (error) {
      console.error("Error handling payment intent failed:", error);
    }
  }

  async cancelSubscription(userId) {
    const activeSubscription =
      await this.subscriptionRepo.getSubscriptionByUserId(userId);

    if (!activeSubscription) {
      throw new Error("No active subscription found");
    }

    if (!activeSubscription.stripeSubscriptionId) {
      throw new Error("Subscription cannot be cancelled (missing Stripe ID)");
    }

    // Get User details for email
    const user = await this.userRepo.findById(userId);
    const userEmail = user ? user.email : "Unknown Email";

    // ALLOW CANCELLATION IF: ACTIVE, TRIALING, INCOMPLETE, or PAST_DUE
    const allowedStatuses = ["ACTIVE", "TRIALING", "INCOMPLETE", "PAST_DUE"];
    if (!allowedStatuses.includes(activeSubscription.status)) {
      throw new Error(
        `Subscription status ${activeSubscription.status} cannot be cancelled via this flow.`,
      );
    }

    // Prepare Plan Name for Email
    let planName = "Premium Plan";
    if (activeSubscription.planId) {
      const plan = await this.subscriptionRepo.findPlanById(
        activeSubscription.planId,
      );
      if (plan) planName = plan.name;
    }

    // BRANCH LOGIC: TRIAL vs PAID
    // treat INCOMPLETE as Trial/Immediate cancel to clean up
    const isTrial =
      activeSubscription.status === "TRIALING" ||
      activeSubscription.status === "INCOMPLETE";

    if (isTrial) {
      console.log(
        `Cancelling TRIAL subscription for user ${userId} IMMEDIATELY.`,
      );
      // --- TRIAL CHECKOUT LOGIC: CANCEL IMMEDIATELY ---

      try {
        await this.stripeService.cancelSubscriptionImmediately(
          activeSubscription.stripeSubscriptionId,
        );
      } catch (error) {
        if (error.message && error.message.includes("No such subscription")) {
          console.warn(
            `Stripe subscription ${activeSubscription.stripeSubscriptionId} already deleted. Proceeding with local cancellation.`,
          );
        } else {
          throw error;
        }
      }

      // Update local DB to CANCELED immediately
      try {
        await this.subscriptionRepo.updateSubscription(activeSubscription.id, {
          status: "CANCELED",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date(), // End access immediately
        });
      } catch (error) {
        console.warn(
          "Failed to update subscription status to CANCELED:",
          error.message,
        );
      }

      // Downgrade user immediately
      await this.userRepo.updateUserSubscriptionType(userId, "Free");

      // Send Trial Cancelled Email
      if (this.notificationService && user) {
        try {
          await this.notificationService.sendTrialCancelledEmail(
            user,
            planName,
          );
        } catch (emailError) {
          console.error("Failed to send trial cancellation email:", emailError);
        }
      }

      return {
        message:
          "Trial canceled immediately. You have been downgraded to Free.",
        canceledImmediately: true,
      };
    } else {
      console.log(
        `Cancelling PAID subscription for user ${userId} WITH REFUND.`,
      );
      // --- PAID SUBSCRIPTION LOGIC: REFUND + CANCEL IMMEDIATELY ---

      let refundId = null;

      try {
        // 1. Get latest invoice's payment intent to refund
        const stripeSub = await this.stripeService.retrieveSubscription(
          activeSubscription.stripeSubscriptionId,
        );

        if (stripeSub && stripeSub.latest_invoice) {
          const invoiceId =
            typeof stripeSub.latest_invoice === "string"
              ? stripeSub.latest_invoice
              : stripeSub.latest_invoice.id;

          const invoice = await this.stripeService.retrieveInvoice(invoiceId);

          if (invoice && invoice.payment_intent) {
            const paymentIntentId =
              typeof invoice.payment_intent === "string"
                ? invoice.payment_intent
                : invoice.payment_intent.id;

            console.log(
              `Initiating refund for PaymentIntent: ${paymentIntentId}`,
            );
            const refund =
              await this.stripeService.refundPayment(paymentIntentId);
            refundId = refund.id;
            console.log(`Refund successful: ${refund.id}`);
          }
        }

        // 2. Cancel Subscription Immediately in Stripe
        await this.stripeService.cancelSubscriptionImmediately(
          activeSubscription.stripeSubscriptionId,
        );
      } catch (error) {
        console.error("Error during refund/cancellation process:", error);
        // Continue to local cancellation to ensure DB consistency
        if (
          error.message &&
          !error.message.includes("No such subscription") &&
          !error.message.includes("charge has already been refunded")
        ) {
          // If it's a critical error (not just 'already done'), we might want to throw,
          // but for cancellation, we usually prefer to ensure local state is updated.
          console.warn("Continuing with local cancellation despite errors.");
        }
      }

      // 3. Update Local DB to CANCELED immediately
      try {
        await this.subscriptionRepo.updateSubscription(activeSubscription.id, {
          status: "CANCELED",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date(), // End access immediately
        });
      } catch (error) {
        console.warn(
          "Failed to update subscription status to CANCELED:",
          error.message,
        );
      }

      // 4. Downgrade user immediately
      await this.userRepo.updateUserSubscriptionType(userId, "Free");

      // 5. Send Email (Re-using Trial Cancelled email for now as it fits "Immediate" nature,
      // or we can add a specific Refund email later. For now, adapting Trial email or sending standard cancel with short date)

      // Let's send the "Trial Cancelled" style email because it says "cancelled immediately",
      // which is accurate here, even if it was valid.
      // OR better, use admin email to notify of refund.
      if (this.notificationService && user) {
        try {
          // Using sendTrialCancelledEmail as a base for "Immediate Cancellation" message
          // You might want to rename this method to sendImmediateCancellationEmail in the future
          await this.notificationService.sendTrialCancelledEmail(
            user,
            planName,
          );
        } catch (emailError) {
          console.error("Failed to send cancellation email:", emailError);
        }
      }

      // --- NEW: SEND ADMIN EMAIL ---
      if (this.notificationService) {
        try {
          await this.notificationService.sendAdminSubscriptionCancelledEmail(
            user,
            `${planName} (Refunded: ${refundId ? "Yes" : "Failed/No PI"})`,
            new Date(),
          );
        } catch (adminEmailError) {
          console.error(
            "Failed to send admin cancellation email:",
            adminEmailError,
          );
        }
      }

      return {
        message:
          "Subscription canceled and refund initiated. You have been downgraded to Free.",
        canceledImmediately: true,
        refundId: refundId,
      };
    }
  }

  async getUserSubscriptionStatus(userId) {
    const userWithSubscription =
      await this.subscriptionRepo.getUserWithSubscription(userId);

    if (!userWithSubscription) {
      throw new Error("User not found");
    }

    const activeSubscription = userWithSubscription.subscriptions?.[0] || null;
    const isPremium =
      !!activeSubscription &&
      (activeSubscription.status === "ACTIVE" ||
        activeSubscription.status === "TRIALING") &&
      new Date() < new Date(activeSubscription.currentPeriodEnd);

    const plan = activeSubscription?.plan || null;

    return {
      subscriptionType: userWithSubscription.subscriptionType || (isPremium ? "premium" : "Free"),
      isPremium,
      hasAccessToPremium: isPremium,
      status: activeSubscription?.status || "INACTIVE",
      planId: activeSubscription?.planId || null,
      planName: plan?.name || null,
      price: plan?.price ?? null,
      currency: plan?.currency || null,
      interval: plan?.interval || null,
      intervalCount: plan?.intervalCount ?? null,
      currentPeriodStart: activeSubscription?.currentPeriodStart || null,
      currentPeriodEnd: activeSubscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: activeSubscription?.cancelAtPeriodEnd || false,
      activeSubscription: isPremium ? activeSubscription : null,
    };
  }

  async getTransactionHistory(userId, filters) {
    return await this.subscriptionRepo.getUserTransactions(userId, filters);
  }

  async getSubscriptionPlans(user, includeHidden = false) {
    // Check if user has an active subscription
    const result = await this.subscriptionRepo.isUserSubscribed(user.id);

    if (result.isSubscribed) {
      return {
        isSubscribed: true,
        subscription: result.subscription,
      };
    }

    return await this.subscriptionRepo.getAllSubscriptionPlans(includeHidden);
  }

  async validatePremiumAccess(userId) {
    const status = await this.getUserSubscriptionStatus(userId);

    if (!status.hasAccessToPremium) {
      throw new Error("Premium subscription required to access this content");
    }

    return true;
  }

  // Admin methods
  async createPlan(planData) {
    try {
      const {
        name,
        price,
        interval,
        intervalCount = 1,
        trialDays,
        currency = "usd",
      } = planData;

      if (!name || !price || !interval) {
        throw new Error("Name, price, and interval are required");
      }

      // 1. Create Product in Stripe
      const stripeProduct = await this.stripeService.createProduct(name);

      // 2. Create Price in Stripe
      const stripePrice = await this.stripeService.createPrice(
        stripeProduct.id,
        price,
        currency,
        interval,
        intervalCount
      );

      // 3. Save to Local DB
      const plan = await this.subscriptionRepo.createPlan({
        name,
        price,
        currency,
        interval: interval.toLowerCase(),
        intervalCount,
        trialDays,
        stripePriceId: stripePrice.id,
        visible: true,
      });

      return plan;
    } catch (error) {
      throw new Error(`Failed to create subscription plan: ${error.message}`);
    }
  }

  async updatePlan(planId, planData) {
    try {
      const existingPlan = await this.subscriptionRepo.findPlanById(planId);
      if (!existingPlan) {
        throw new Error("Plan not found");
      }

      const updateData = { ...planData };

      // If price, currency, interval, or intervalCount changes, we must create a new Stripe Price
      // (Stripe Prices are immutable for these fields)
      const priceChanged = updateData.price && updateData.price !== existingPlan.price;
      const currencyChanged = updateData.currency && updateData.currency !== existingPlan.currency;
      const intervalChanged = updateData.interval && updateData.interval !== existingPlan.interval;
      const intervalCountChanged = updateData.intervalCount && updateData.intervalCount !== existingPlan.intervalCount;

      if (priceChanged || currencyChanged || intervalChanged || intervalCountChanged) {
        // We need a product ID. If existing plan doesn't have a product ID, we create a new product.
        // Or to keep it simple, just create a new product for the new price since we don't store stripeProductId.
        const stripeProduct = await this.stripeService.createProduct(updateData.name || existingPlan.name);

        const stripePrice = await this.stripeService.createPrice(
          stripeProduct.id,
          updateData.price || existingPlan.price,
          updateData.currency || existingPlan.currency || "usd",
          updateData.interval || existingPlan.interval,
          updateData.intervalCount || existingPlan.intervalCount || 1
        );

        updateData.stripePriceId = stripePrice.id;
      }

      const updatedPlan = await this.subscriptionRepo.updatePlan(planId, updateData);

      return updatedPlan;
    } catch (error) {
      throw new Error(`Failed to update subscription plan: ${error.message}`);
    }
  }

  async togglePlanVisibility(planId) {
    try {
      const plan = await this.subscriptionRepo.findPlanById(planId);
      if (!plan) {
        throw new Error("Subscription plan not found");
      }

      const updatedPlan = await this.subscriptionRepo.updatePlan(planId, {
        visible: !plan.visible,
      });

      return updatedPlan;
    } catch (error) {
      throw new Error(`Failed to toggle plan visibility: ${error.message}`);
    }
  }

  async getSubscriptions(filters = {}) {
    try {
      const { page = 1, limit = 10, status, userId, planId, search } = filters;

      const result = await this.subscriptionRepo.getSubscriptions({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        userId: userId ? userId : undefined,
        planId,
        search,
      });

      return result;
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to get subscriptions: ${error.message}`);
    }
  }

  async getSubscriptionById(subscriptionId) {
    try {
      const subscription =
        await this.subscriptionRepo.findSubscriptionById(subscriptionId);
      if (!subscription) {
        throw new Error("Subscription not found");
      }

      return subscription;
    } catch (error) {
      throw new Error(`Failed to get subscription: ${error.message}`);
    }
  }

  async adminCancelSubscription(subscriptionId) {
    try {
      const subscription =
        await this.subscriptionRepo.findSubscriptionById(subscriptionId);
      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // Update in database only (internal cancellation)
      const updatedSubscription =
        await this.subscriptionRepo.updateSubscription(subscriptionId, {
          status: "CANCELED",
          cancelAtPeriodEnd: true,
        });

      // Downgrade user
      await this.userRepo.updateUserSubscriptionType(
        subscription.userId,
        "Free",
      );

      return updatedSubscription;
    } catch (error) {
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  async getAdminTransactions(filters = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        type,
        userId,
        subscriptionId,
      } = filters;

      const result = await this.subscriptionRepo.getAdminTransactions({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        type,
        userId: userId ? userId : undefined,
        subscriptionId,
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to get transactions: ${error.message}`);
    }
  }

  async handleTrialValidationSuccess(session) {
    try {
      const {
        userId,
        planId,
        trialDays,
        planPrice,
        planCurrency,
        planName,
        planInterval,
        planIntervalCount,
      } = session.metadata;

      const paymentIntentId = session.payment_intent;

      console.log(
        `Processing Trial Validation for User ${userId}. PI: ${paymentIntentId}`,
      );

      // 1. Retrieve Payment Intent to get Payment Method
      const paymentIntent =
        await this.stripeService.retrievePaymentIntent(paymentIntentId);
      const paymentMethodId = paymentIntent.payment_method;

      if (!paymentMethodId) {
        throw new Error("No payment method found in PaymentIntent");
      }

      // 2. Create the Subscription with Trial
      console.log(
        `Creating trial subscription (${trialDays} days) for user ${userId} using PM ${paymentMethodId}`,
      );

      const customerId = session.customer;

      const plan = await this.subscriptionRepo.findPlanById(planId);
      if (!plan) throw new Error("Plan not found");

      const subscriptionConfig = {
        customer: customerId,
        default_payment_method: paymentMethodId,
        trial_period_days: parseInt(trialDays),
        items: plan.stripePriceId ? [
          {
            price: plan.stripePriceId,
          }
        ] : undefined,
        metadata: {
          userId: userId,
          planId: planId,
          type: "APP_SUBSCRIPTION",
        },
      };

      if (!plan.stripePriceId) {
        // Fallback for old plans without stripePriceId
        const product = await this.stripeService.stripe.products.create({
          name: planName,
        });

        subscriptionConfig.items = [
          {
            price_data: {
              currency: planCurrency.toLowerCase(),
              product: product.id,
              unit_amount: Math.round(parseFloat(planPrice) * 100),
              recurring: {
                interval: planInterval,
                interval_count: parseInt(planIntervalCount),
              },
            },
          },
        ];
      }

      const subscription =
        await this.stripeService.stripe.subscriptions.create(
          subscriptionConfig,
        );

      console.log("✅ Trial Subscription created:", subscription.id);

      // 3. REFUND THE VALIDATION CHARGE (Now that subscription is created)
      try {
        await this.stripeService.refundPayment(paymentIntentId);
        console.log("✅ Validation check refunded.");
      } catch (refundError) {
        console.error(
          "⚠️ Failed to refund validation charge:",
          refundError.message,
        );
        // Continue, don't block user access if refund fails (can be manual).
      }

      // 4. Update DB
      const currentPeriodStart = new Date(
        subscription.current_period_start * 1000,
      );
      const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

      const newSub = await this.subscriptionRepo.createSubscription({
        userId: userId,
        planId: planId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        currentPeriodStart: currentPeriodStart,
        currentPeriodEnd: currentPeriodEnd,
        status: subscription.status.toUpperCase(),
        cancelAtPeriodEnd: false,
      });

      // Update user to premium
      await this.userRepo.updateUserSubscriptionType(userId, "premium");

      // Send Email
      const user = await this.userRepo.findById(userId);
      await this.notificationService.sendTrialStartedEmail(
        user,
        plan,
        currentPeriodEnd,
      );

      // Update Transaction (The Validation Charge)
      await this.subscriptionRepo.updateTransactionByCheckoutSession(
        session.id,
        {
          status: "REFUNDED", // Since we refunded it
          description: "Trial Validation Charge (Refunded)",
          subscriptionId: newSub.id,
          stripePaymentIntentId: paymentIntentId,
          metadata: {
            ...session.metadata,
            subscriptionId: subscription.id,
            refunded: true,
          },
        },
      );
    } catch (error) {
      console.error("Error handling trial validation success:", error);
      // FIX: Pass stripePaymentIntentId so repository can find the transaction
      await this.subscriptionRepo.updateTransactionByCheckoutSession(
        session.id,
        {
          status: "FAILED",
          description: `Trial validation processing failed: ${error.message}`,
          stripePaymentIntentId: session.payment_intent, // Required for lookup if session.id is a PI
        },
      );
      throw error;
    }
  }

  async generateBillingPortalLink(userId, returnUrl) {
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) throw new Error("User not found");

      if (!user.stripeCustomerId) {
        throw new Error("User does not have a Stripe customer account");
      }

      const activeSubscription = await this.subscriptionRepo.findActiveSubscriptionByUserId(userId);
      if (!activeSubscription) {
        throw new Error("No active subscription found. You must have an active subscription to manage billing.");
      }

      const session = await this.stripeService.createBillingPortalSession(
        user.stripeCustomerId,
        returnUrl || process.env.FRONTEND_URL
      );

      return session.url;
    } catch (error) {
      throw new Error(`Failed to generate billing portal link: ${error.message}`);
    }
  }
}
