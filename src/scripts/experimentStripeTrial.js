import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

async function main() {
  try {
    console.log("🧪 Starting Stripe Trial Experiment...");

    // 1. Create a dummy customer
    const customer = await stripe.customers.create({
      email: `experiment.${Date.now()}@test.com`,
      name: "Experiment User",
      address: {
        line1: "123 Test St",
        city: "Mumbai",
        state: "Maharashtra",
        postal_code: "400001",
        country: "IN",
      },
    });
    console.log("✅ Created Customer:", customer.id);

    // 2. Create a product and price (with trial)
    const product = await stripe.products.create({
      name: "Test Trial Plan",
    });

    // 3. Create Subscription with same config as app
    console.log("Creating subscription...");
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price_data: {
            currency: "usd",
            product: product.id,
            unit_amount: 1000, // $10.00
            recurring: {
              interval: "month",
            },
          },
        },
      ],
      payment_behavior: "default_incomplete", // ⚠️ Key param
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
      trial_period_days: 7,
      trial_settings: {
        end_behavior: {
          missing_payment_method: "cancel",
        },
      },
    });

    console.log("\n--- Subscription Result ---");
    console.log("ID:", subscription.id);
    console.log("Status:", subscription.status);
    console.log("Default Payment Method:", subscription.default_payment_method);
    console.log(
      "Pending Setup Intent:",
      subscription.pending_setup_intent
        ? subscription.pending_setup_intent.id
        : "NULL",
    );
    console.log("Latest Invoice ID:", subscription.latest_invoice.id);
    console.log("Latest Invoice Status:", subscription.latest_invoice.status);
    console.log("Latest Invoice Paid:", subscription.latest_invoice.paid);
    console.log("Table of Contents:", Object.keys(subscription));
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
