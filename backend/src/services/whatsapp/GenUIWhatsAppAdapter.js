import { genUIService } from '../GenUIService.js';
import { whatsappService } from './WhatsAppService.js';
import { db } from '../../db/index.js';
import { genuiConversations, genuiMessages } from '../../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

export class GenUIWhatsAppAdapter {
  async processIncomingMessage(text, orgId, phone, messageId) {
    // 1. Get or create a conversation for this org
    let conversationId = null;
    const recentConvs = await db.select({ id: genuiConversations.id })
      .from(genuiConversations)
      .where(eq(genuiConversations.organization_id, orgId))
      .orderBy(desc(genuiConversations.updated_at))
      .limit(1);

    if (recentConvs.length > 0) {
      conversationId = recentConvs[0].id;
    }

    // 2. Fetch history if conversation exists
    let history = [];
    if (conversationId) {
      const msgs = await genUIService.getConversationMessages(conversationId, orgId);
      if (msgs) {
        history = msgs.map(m => ({
          role: m.role,
          content: m.parts.map(p => p.text).join('\n') // Simplify parts to text for LLM history
        }));
      }
    }

    history.push({ role: 'user', content: text });

    // Mark the message as read and show the official animated typing indicator
    if (messageId) {
      await whatsappService.sendTypingIndicator(messageId);
    }

    // 3. Setup the emitter to capture and forward to WhatsApp
    let accumulatedText = '';
    let hasSentThinking = false;
    
    const emitter = (eventType, payload) => {
      if (eventType === 'tool_status' && payload.status === 'running') {
        // Re-trigger the typing indicator since tools can take a while and the indicator expires after 25s
        if (messageId) {
          whatsappService.sendTypingIndicator(messageId).catch(console.error);
        }
      }
      
      if (eventType === 'text' && payload.delta) {
        accumulatedText += payload.delta;
      }
      
      if (eventType === 'action') {
        // GenUI wants to perform a mutating action
        // Use an interactive button message to confirm
        const button = { id: `action:${payload.actionType}`, title: 'Confirm' };
        whatsappService.sendInteractiveMessage(
          phone, 
          `Confirm Action: ${payload.label}`, 
          [button]
        ).catch(console.error);
      }

      if (eventType === 'error') {
        whatsappService.sendMessage(phone, `❌ Error: ${payload.message}`).catch(console.error);
      }

      if (eventType === 'done') {
        if (accumulatedText.trim().length > 0) {
          whatsappService.sendMessage(phone, accumulatedText.trim()).catch(console.error);
        }
      }
    };

    // 4. Trigger GenUI stream
    // streamChat will create a new conversation if conversationId is null, and save the messages.
    try {
      await genUIService.streamChat(history, orgId, emitter, conversationId);
    } catch (err) {
      console.error('[WhatsApp Adapter] streamChat error:', err);
      whatsappService.sendMessage(phone, 'Sorry, something went wrong processing your request.').catch(console.error);
    }
  }
}

export const genUIWhatsAppAdapter = new GenUIWhatsAppAdapter();
