import { env } from '../../config/env.js';

export class WhatsAppService {
  get isConfigured() {
    return Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TOKEN);
  }

  async _send(payload) {
    if (!this.isConfigured) {
      console.warn('[WhatsApp] Not configured. Skipping message to:', payload.to);
      return false;
    }

    const url = `${env.META_API_BASE_URL}/${env.META_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          ...payload,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('[WhatsApp] API Error:', JSON.stringify(data, null, 2));
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('[WhatsApp] Fetch Error:', err);
      return false;
    }
  }

  async sendMessage(to, text) {
    return this._send({
      to,
      type: 'text',
      text: { body: text },
    });
  }

  async sendInteractiveMessage(to, text, buttons) {
    // WhatsApp supports up to 3 buttons per interactive message.
    const limitedButtons = buttons.slice(0, 3).map((btn) => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title.slice(0, 20), // Max 20 chars
      },
    }));

    return this._send({
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) }, // Max 1024 chars
        action: { buttons: limitedButtons },
      },
    });
  }

  async sendTemplateMessage(to, templateName, languageCode = 'en_US', components = []) {
    return this._send({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  async sendTypingIndicator(messageId) {
    if (!this.isConfigured) return false;

    // The typing indicator requires status='read' and message_id
    const url = `${env.META_API_BASE_URL}/${env.META_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: {
            type: 'text'
          }
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[WhatsApp] Typing Indicator Error:', JSON.stringify(data, null, 2));
        return false;
      }
      
      return true;
    } catch (err) {
      console.error('[WhatsApp] Typing Indicator Fetch Error:', err);
      return false;
    }
  }
}

export const whatsappService = new WhatsAppService();
