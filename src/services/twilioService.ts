import 'dotenv/config';
import twilio, { Twilio } from 'twilio';
  
function getClient(): Twilio {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error('Twilio credentials missing');
  return twilio(accountSid, authToken);
}

export async function sendText(to: string, body: string, imageUrl?: string): Promise<void> {
  const client = getClient();
  try {
    const messageOptions: any = {
      body,
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
    };
    if (imageUrl) {
      messageOptions.mediaUrl = [imageUrl];
    }
    await client.messages.create(messageOptions);
  } catch (err: any) {
    if (err && err.code === 20003) {
      console.error('Twilio auth failed (401). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }
    throw err;
  }
}

export async function sendMenu(to: string, replyText: string): Promise<void> {
  const client = getClient();
  const contentSid = process.env.TWILIO_MENU_SID;
  if (!contentSid) {
    console.warn('TWILIO_MENU_SID missing; falling back to text');
    await sendText(to, replyText);
    return;
  }
  await client.messages.create({
    contentSid,
    contentVariables: JSON.stringify({ '1': replyText }),
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
  });
}

export async function sendCard(to: string, replyText: string): Promise<void> {
  const client = getClient();
  const contentSid = process.env.TWILIO_CARD_SID;
  if (!contentSid) {
    console.warn('TWILIO_CARD_SID missing; falling back to text');
    await sendText(to, replyText);
    return;
  }
  await client.messages.create({
    contentSid,
    contentVariables: JSON.stringify({ '1': replyText }),
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
  });
}

export function validateTwilioRequest(url: string, params: Record<string, any>, signature: string | undefined): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (process.env.TWILIO_VALIDATE_WEBHOOK === 'false') return true;
  if (!authToken) return false;
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}


