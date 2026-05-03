import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { approvalService } from '../ApprovalService.js';

export async function handleWhatsAppGet(request, reply) {
  const mode = request.query['hub.mode'];
  const token = request.query['hub.verify_token'];
  const challenge = request.query['hub.challenge'];

  console.log('[WhatsApp Webhook] Verification Request:', { mode, token, expected: env.WHATSAPP_VERIFY_TOKEN });

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN?.trim()) {
    return reply.status(200).send(challenge);
  }
  return reply.status(403).send('Forbidden');
}

export async function handleWhatsAppPost(request, reply) {
  const body = request.body;

  if (body.object !== 'whatsapp_business_account') {
    return reply.status(404).send('Not Found');
  }

  try {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          const value = change.value;
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              const from = message.from; // User's phone number
              
              // 1. Update last interaction time
              let orgId = null;
              try {
                // Remove potential '+' prefix if needed, or match directly.
                // Assuming `users.phone` is stored in same format as WhatsApp's `from` (usually without '+').
                // It's safer to use LIKE or clean formatting if we have issues, but let's try direct match first.
                const phoneWithPlus = from.startsWith('+') ? from : `+${from}`;
                const userQuery = await db.select({ id: users.id }).from(users)
                  .where(eq(users.phone, phoneWithPlus)) // try with plus
                  .limit(1);
                  
                let userMatch = userQuery[0];
                if (!userMatch) {
                  // try without plus
                  const userQuery2 = await db.select({ id: users.id }).from(users)
                    .where(eq(users.phone, from))
                    .limit(1);
                  userMatch = userQuery2[0];
                }

                if (userMatch) {
                  orgId = userMatch.id;
                  await db.update(users)
                    .set({ last_whatsapp_interaction_at: new Date() })
                    .where(eq(users.id, orgId));
                }
              } catch (err) {
                console.error('[WhatsApp Webhook] Error updating user interaction:', err);
              }

              // 2. Handle interactive button replies
              if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                const payload = message.interactive.button_reply.id;
                // payload format: "approval:{approvalId}:{action}"
                if (payload.startsWith('approval:')) {
                  const parts = payload.split(':');
                  if (parts.length === 3) {
                    const [, approvalId, action] = parts;
                    if (orgId) {
                      const result = await approvalService.takeActionById(approvalId, orgId, action);
                      const { whatsappService } = await import('./WhatsAppService.js');
                      await whatsappService.sendMessage(from, result.message);
                    }
                  }
                }
                continue; // Skip text processing for interactive messages
              }

              // 3. Handle standard text messages (Route to GenUI)
              if (message.type === 'text') {
                const text = message.text.body;
                if (orgId) {
                  const { genUIWhatsAppAdapter } = await import('./GenUIWhatsAppAdapter.js');
                  await genUIWhatsAppAdapter.processIncomingMessage(text, orgId, from);
                } else {
                  // Unrecognized user
                  const { whatsappService } = await import('./WhatsAppService.js');
                  await whatsappService.sendMessage(from, 'Hello! Please log in to the platform and add this phone number to your profile to chat with your AI assistant.');
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook] Error processing event:', err);
  }

  // Always return 200 OK to Meta
  return reply.status(200).send('OK');
}
