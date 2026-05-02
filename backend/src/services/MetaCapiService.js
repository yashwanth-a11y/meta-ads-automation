import axios from "axios";
import crypto from "crypto";
import { config } from "../config/index.js";

const META_API_BASE = process.env.META_API_BASE_URL || "https://graph.facebook.com";
const META_API_VERSION = config.meta.apiVersion;

export class MetaCapiService {
  constructor(logger) {
    this.logger = logger;
  }

  hashPhone(phone, countryCode = "91") {
    const normalized = this.normalizePhone(phone, countryCode);
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  hashEmail(email) {
    return crypto
      .createHash("sha256")
      .update(email.trim().toLowerCase())
      .digest("hex");
  }

  normalizePhone(phone, countryCode = "91") {
    let cleaned = phone.replace(/[^0-9+]/g, "");
    if (cleaned.startsWith("+")) {
      return cleaned;
    }
    if (cleaned.startsWith("0")) {
      cleaned = cleaned.slice(1);
    }
    return `+${countryCode}${cleaned}`;
  }

  async sendEvent(pixelId, accessToken, event) {
    const url = `${META_API_BASE}/${META_API_VERSION}/${pixelId}/events`;

    const eventData = {
      event_name: event.eventName,
      event_time: event.eventTime || Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      action_source: "messaging",
      messaging_channel: "whatsapp",
      user_data: {},
      custom_data: event.customData || {},
    };

    // Add hashed user data
    if (event.userData?.phone) {
      eventData.user_data.ph = [this.hashPhone(event.userData.phone)];
    }
    if (event.userData?.email) {
      eventData.user_data.em = [this.hashEmail(event.userData.email)];
    }

    // Add ctwa_clid for attribution
    if (event.ctwaClid) {
      eventData.user_data.ctwa_clid = event.ctwaClid;
    }

    try {
      const testCode = config.meta.capiTestCode;
      const response = await axios.post(
        url,
        {
          data: [eventData],
          // Only attach test_event_code when explicitly configured (copy it
          // from Meta Events Manager → Test events tab). Hardcoded "TEST"
          // does not show up in the test events view.
          ...(testCode && { test_event_code: testCode }),
        },
        {
          params: { access_token: accessToken },
          timeout: 15000,
        }
      );

      this.logger?.info(
        { pixelId, eventName: event.eventName, eventId: event.eventId },
        "CAPI event sent"
      );

      return { success: true, response: response.data };
    } catch (error) {
      const metaError = error.response?.data?.error;
      this.logger?.error(
        {
          pixelId,
          eventName: event.eventName,
          metaErrorCode: metaError?.code,
          message: metaError?.message || error.message,
        },
        "CAPI event failed"
      );

      return {
        success: false,
        error: metaError?.message || error.message,
        metaErrorCode: metaError?.code,
      };
    }
  }
}
