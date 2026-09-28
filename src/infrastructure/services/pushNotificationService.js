import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

const pushConfig = {
  onesignal: {
    appId: process.env.APP_ID || process.env.API_ID,
    apiKey: process.env.APP_KEY || process.env.API_KEY,
    baseUrl: "https://onesignal.com/api/v1/notifications",
  },
};

class PushNotificationService {
  constructor() {
    this.scheduledJobs = new Map();
    this.defaultProvider = "onesignal";
  }

  setDefaultProvider(provider) {
    if (!pushConfig[provider]) {
      throw new Error(`Invalid push provider: ${provider}`);
    }
    this.defaultProvider = provider;
  }

  async sendNotification({
    recipients,
    message,
    provider,
    title,
    imageUrl,
    sendToAllSubscribed = false,
  }) {
    try {
      if (!message) {
        message = "Notification";
      }

      const providerType = provider || this.defaultProvider;
      const providerConfig = pushConfig[providerType];

      if (!providerConfig) {
        throw new Error(`Unsupported push provider: ${providerType}`);
      }

      const recipientList = Array.isArray(recipients)
        ? recipients
        : typeof recipients === "string"
        ? recipients.split("\n").map((r) => r.trim()).filter(Boolean)
        : [String(recipients)];

      const results = [];

      try {
        const result = await this._sendPushNotification(
          recipientList,
          message,
          providerConfig,
          title,
          imageUrl,
          sendToAllSubscribed
        );

        results.push({
          channel: "push",
          recipients: recipientList,
          status: "success",
          ...result,
          provider: providerType,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          channel: "push",
          recipients: recipientList,
          status: "failed",
          error: error.message,
          http_status: error.response?.status || null,
          server_response: error.response?.data || null,
          provider: providerType,
          timestamp: new Date().toISOString(),
        });
      }

      return results;
    } catch (error) {
      throw error;
    }
  }

  async _sendPushNotification(
    deviceTokens,
    message,
    providerConfig,
    title,
    imageUrl,
    sendToAllSubscribed
  ) {
    const payloadTemplate = {
      app_id: providerConfig.appId,
      headings: { en: title || "Notification" },
      contents: { en: message },
    };

    if (imageUrl) {
      payloadTemplate.big_picture = imageUrl; 
      payloadTemplate.ios_attachments = { id1: imageUrl }; 
    }

    if (sendToAllSubscribed) {
      payloadTemplate.included_segments = ["Subscribed Users"];
      try {
        const response = await axios.post(
          providerConfig.baseUrl,
          payloadTemplate,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${providerConfig.apiKey}`,
            },
          }
        );
        return {
          http_status: response.status,
          server_response: response.data,
          successCount: response.data.recipients || 0,
          failureCount: 0,
        };
      } catch (error) {
        return Promise.reject(error);
      }
    }

    // Chunking logic for huge batches
    const CHUNK_SIZE = 2000; // OneSignal default max user IDs per request
    const chunks = [];
    for (let i = 0; i < deviceTokens.length; i += CHUNK_SIZE) {
      chunks.push(deviceTokens.slice(i, i + CHUNK_SIZE));
    }

    let totalSuccess = 0;
    let totalFailure = 0;
    let lastStatus = 200;
    let lastResponse = null;

    for (const chunk of chunks) {
      const payload = {
        ...payloadTemplate,
        include_external_user_ids: chunk,
        channel_for_external_user_ids: "push",
      };

      try {
        const response = await axios.post(
          providerConfig.baseUrl,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${providerConfig.apiKey}`,
            },
          }
        );
        
        lastStatus = response.status;
        lastResponse = response.data;
        const recipientCount = response.data.recipients || 0;
        totalSuccess += recipientCount;
        totalFailure += (chunk.length - recipientCount);
        
        // Small delay to prevent rate limiting on huge batches
        if (chunks.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay between chunks
        }
      } catch (error) {
        console.error("Push batch error:", error.response?.data || error.message);
        totalFailure += chunk.length;
        lastStatus = error.response?.status || 500;
        lastResponse = error.response?.data || { error: error.message };
      }
    }

    return {
      http_status: lastStatus,
      server_response: lastResponse,
      successCount: totalSuccess,
      failureCount: totalFailure,
    };
  }

  scheduleNotification({ cronPattern, notificationOptions, callback }) {
    const job = cron.schedule(cronPattern, async () => {
      try {
        const results = await this.sendNotification(notificationOptions);
        if (callback) callback(null, results);
      } catch (error) {
        if (callback) callback(error, null);
      }
    });

    const jobId = `job-${Date.now()}`;
    this.scheduledJobs.set(jobId, job);
    return jobId;
  }

  cancelScheduledNotification(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(jobId);
    }
  }

  getScheduledJobs() {
    return this.scheduledJobs;
  }
}

const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
