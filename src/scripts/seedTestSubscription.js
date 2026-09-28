import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("🌱 Seeding test data for subscription cron...");

    // 1. Get or Create a Plan
    let plan = await prisma.subscriptionPlan.findFirst();
    if (!plan) {
      plan = await prisma.subscriptionPlan.create({
        data: {
          name: "Test Premium Plan",
          price: 9.99,
          currency: "usd",
          interval: "month",
          intervalCount: 1,
          visible: true,
        },
      });
      console.log("✅ Created test plan:", plan.name);
    } else {
      console.log("ℹ️ Using existing plan:", plan.name);
    }

    // 2. Create a unique test user
    const uniqueSuffix = Date.now();
    const userEmail = `test.cron.${uniqueSuffix}@example.com`;

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        name: `Cron Tester ${uniqueSuffix}`,
        subscriptionType: "premium",
        active: true,
        isVerified: true,
      },
    });
    console.log("✅ Created test user:", user.email);

    // 3. Create a subscription ending tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set it to expire tomorrow at noon
    tomorrow.setHours(12, 0, 0, 0);

    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: today,
        currentPeriodEnd: tomorrow,
        cancelAtPeriodEnd: false,
      },
    });

    console.log(
      "✅ Created active subscription ending:",
      tomorrow.toISOString(),
    );
    console.log("   ID:", subscription.id);
    console.log("Found user ID for verification:", user.id);

    console.log(
      "\n🚀 The cron job (running every minute) should pick this up momentarily.",
    );
    console.log(
      '   Look for: "Processing batch of 1 subscriptions..." in the server logs.',
    );
  } catch (error) {
    console.error("❌ Error seeding data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
