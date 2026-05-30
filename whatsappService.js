import dotenv from 'dotenv';
dotenv.config();

/**
 * Service to communicate with the Meta WhatsApp Cloud API.
 * Includes graceful local debug fallbacks when active Meta credentials are not fully configured.
 */

const getWhatsAppConfig = () => {
  return {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID || 'sandbox_phone_id',
    systemToken: process.env.WA_SYSTEM_TOKEN || 'sandbox_system_token',
    isSandbox: !process.env.WA_PHONE_NUMBER_ID || process.env.WA_PHONE_NUMBER_ID === 'sandbox_phone_id'
  };
};

/**
 * Dispatches a request to Meta Graph API, or logs it locally in sandbox simulation mode.
 */
async function postToMetaAPI(payload) {
  const { phoneNumberId, systemToken, isSandbox } = getWhatsAppConfig();
  
  if (isSandbox || !systemToken || systemToken === 'sandbox_system_token') {
    console.log(`\n==================================================`);
    console.log(`📲 [WhatsApp Simulator] Inbound Notification for: ${payload.to}`);
    console.log(`💬 Type: ${payload.type || 'text'}`);
    
    if (payload.type === 'text') {
      console.log(`✉️ Body: "${payload.text.body}"`);
    } else if (payload.type === 'interactive') {
      const interactive = payload.interactive;
      console.log(`✉️ Header: "${interactive.header?.text || ''}"`);
      console.log(`✉️ Body: "${interactive.body.text}"`);
      
      if (interactive.type === 'button') {
        console.log(`🔘 Buttons:`);
        interactive.action.buttons.forEach((btn, idx) => {
          console.log(`   [${idx + 1}] Title: "${btn.reply.title}" | ID: "${btn.reply.id}"`);
        });
      } else if (interactive.type === 'list') {
        console.log(`📋 List Title: "${interactive.action.button}"`);
        interactive.action.sections.forEach(sec => {
          console.log(`   📂 Section: "${sec.title}"`);
          sec.rows.forEach((row, idx) => {
            console.log(`      [${idx + 1}] Title: "${row.title}" | ID: "${row.id}" | "${row.description || ''}"`);
          });
        });
      }
    } else if (payload.type === 'template') {
      console.log(`📋 Template Name: "${payload.template.name}"`);
      console.log(`📦 Parameters:`, JSON.stringify(payload.template.components || []));
    }
    
    console.log(`==================================================\n`);
    return { status: 'simulated', success: true };
  }

  // Active production Meta Graph API request
  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${systemToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Meta API request failed');
    }
    console.log(`[WhatsApp Service] Message successfully sent to ${payload.to}. Message ID: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error(`[WhatsApp Service Error] Failed to send message to ${payload.to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a standard plain text message to a user.
 */
export async function sendWhatsAppText(to, textBody) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: textBody }
  };
  return postToMetaAPI(payload);
}

/**
 * Sends a Quick Reply interactive message with up to 3 button pills.
 * @param {string} to Phone number.
 * @param {string} bodyText Main text content.
 * @param {Array<{id: string, title: string}>} buttons Array of up to 3 buttons.
 */
export async function sendWhatsAppQuickReplies(to, bodyText, buttons) {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
    return sendWhatsAppText(to, bodyText);
  }
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(btn => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.slice(0, 20) // Meta limits button titles to 20 chars
          }
        }))
      }
    }
  };
  return postToMetaAPI(payload);
}

/**
 * Sends an interactive Selection List message with sections and rows (up to 10 choices).
 * @param {string} to Phone number.
 * @param {string} headerTitle Main bold header.
 * @param {string} bodyText Explanatory text.
 * @param {string} buttonTitle The menu button text.
 * @param {Array<{title: string, rows: Array<{id: string, title: string, description?: string}>}>} sections Option rows categorized in sections.
 */
export async function sendWhatsAppListMenu(to, headerTitle, bodyText, buttonTitle, sections) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: headerTitle ? { type: 'text', text: headerTitle.slice(0, 60) } : undefined,
      body: { text: bodyText.slice(0, 1024) },
      footer: { text: 'AeroFamily Assistant' },
      action: {
        button: buttonTitle.slice(0, 20),
        sections: sections.map(sec => ({
          title: sec.title.slice(0, 24),
          rows: sec.rows.slice(0, 10).map(row => ({
            id: row.id,
            title: row.title.slice(0, 24),
            description: row.description ? row.description.slice(0, 72) : undefined
          }))
        }))
      }
    }
  };
  return postToMetaAPI(payload);
}

/**
 * Dispatches a standard pre-approved template message for OTP verification.
 */
export async function sendWhatsAppVerificationCode(to, code) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'template',
    template: {
      name: 'auth_verification_otp',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: code }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: code }
          ]
        }
      ]
    }
  };
  
  // Under testing/simulator mode, fallback to plain text if template is not registered
  const { isSandbox } = getWhatsAppConfig();
  if (isSandbox) {
    return sendWhatsAppText(to, `🔑 AeroFamily verification: Enter code ${code} to verify your phone number. Code expires in 10 minutes.`);
  }
  
  return postToMetaAPI(payload);
}
