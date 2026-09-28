import { pushQueue } from "./config/bullmq.js";
import { initializeDatabaseConnections } from "./config/database.js";

async function runTest() {
  console.log("Initializing DB...");
  await initializeDatabaseConnections();
  
  console.log("Adding a test notification job to the pushQueue...");
  try {
    await pushQueue.add("newMeditationPush", {
      title: "Test Notification",
      message: "Testing the massive batching BullMQ infrastructure.",
      imageUrl: null,
      sendToAllSubscribed: false
    });
    console.log("Job successfully added to Redis!");
    console.log("The worker running in the same script should pick this up immediately shortly.");
    
    // We leave the process running for a few seconds so the worker has time to pick it up and log
    setTimeout(() => {
        console.log("Test finished.");
        process.exit(0);
    }, 15000);

  } catch (error) {
    console.error("Failed to add or process job:", error);
    process.exit(1);
  }
}

runTest();
