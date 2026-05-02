// Thin client around the AI image microservice running at
// AI_MICROSERVICE_URL (FastAPI + Gemini, see /api/image router).
//
// Centralized so both AdsService.generateAdImage and AdsService.discardGeneratedImage
// share one place that knows the microservice's URL, request shape, and
// error-handling. Pattern mirrors AiImageMicroserviceClient in the wenextai
// sibling project.

const DEFAULT_GENERATE_TIMEOUT_MS = 120_000;   // generation can take 30-90s
const DEFAULT_REJECT_TIMEOUT_MS = 15_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;

export class AiImageMicroserviceClient {
  constructor({ logger, baseUrl } = {}) {
    this.logger = logger;
    this.baseUrl = (baseUrl || process.env.AI_MICROSERVICE_URL || "").replace(/\/+$/, "");
    if (!this.baseUrl) {
      this.logger?.warn("[AiImage] AI_MICROSERVICE_URL not set — generation/reject calls will fail");
    }
  }

  _ensureConfigured() {
    if (!this.baseUrl) {
      throw { code: 500, message: "AI_MICROSERVICE_URL is not configured" };
    }
  }

  // POST /api/image/generate
  // payload shape matches ImageGenerationRequest in the microservice.
  // Returns the full ImageGenerationResponse (image_url, image_base64,
  // data_url, width, height, size_bytes, final_prompt, model, token_usage).
  async generate(payload, { timeoutMs = DEFAULT_GENERATE_TIMEOUT_MS } = {}) {
    this._ensureConfigured();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}/api/image/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        this.logger?.error(
          { status: resp.status, body: text.slice(0, 500) },
          "[AiImage] /generate returned non-2xx",
        );
        // Try to surface FastAPI's `{detail: "..."}` shape if present.
        let detail;
        try {
          detail = JSON.parse(text)?.detail;
        } catch { /* keep raw text below */ }
        throw {
          code: 502,
          message: `Image microservice ${resp.status}: ${detail || text.slice(0, 200) || "no body"}`,
        };
      }
      return await resp.json();
    } catch (err) {
      if (err?.code) throw err;
      const isAbort = err?.name === "AbortError";
      throw {
        code: 502,
        message: isAbort
          ? "Image generation timed out — try a simpler prompt."
          : `Image microservice unavailable: ${err.message}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // POST /api/image/reject
  // Returns the parsed ImageRejectResponse: { success, deleted, key }.
  // Idempotent (deleted=false when the object was already gone).
  // Returns 400 if the URL is outside the microservice's bucket — we
  // translate that into `{deleted:false, reason}` instead of throwing,
  // because the user's reject/edit flow shouldn't break on cleanup.
  async reject(imageUrl, { timeoutMs = DEFAULT_REJECT_TIMEOUT_MS } = {}) {
    if (!imageUrl) return { success: false, deleted: false, reason: "no url" };
    this._ensureConfigured();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}/api/image/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
        signal: ac.signal,
      });

      if (resp.status === 400) {
        // URL points at a bucket / prefix the microservice doesn't own.
        return { success: true, deleted: false, reason: "url not in microservice bucket" };
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        this.logger?.warn(
          { status: resp.status, body: text.slice(0, 300) },
          "[AiImage] /reject returned non-2xx",
        );
        return { success: false, deleted: false, reason: `microservice ${resp.status}` };
      }
      const json = await resp.json().catch(() => ({}));
      return {
        success: Boolean(json.success),
        deleted: Boolean(json.deleted),
        key: json.key,
      };
    } catch (err) {
      const isAbort = err?.name === "AbortError";
      this.logger?.warn(
        { err: err.message, isAbort },
        "[AiImage] /reject request failed (non-fatal)",
      );
      return {
        success: false,
        deleted: false,
        reason: isAbort ? "timeout" : err.message,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // GET /api/image/health — useful for /healthz checks. Returns true on 200.
  async healthCheck({ timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
    if (!this.baseUrl) return false;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const resp = await fetch(`${this.baseUrl}/api/image/health`, {
        method: "GET",
        signal: ac.signal,
      });
      return resp.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
