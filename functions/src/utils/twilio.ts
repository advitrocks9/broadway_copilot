import fetch from "node-fetch";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

type SendWhatsAppParams = {
  to: string;
  body: string;
};

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export async function sendWhatsAppText({ to, body }: SendWhatsAppParams): Promise<void> {
  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  const payload = new URLSearchParams({
    To: `whatsapp:+${to}`,
    From: fromNumber,
    Body: body,
  });

  const response = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to send WhatsApp message: ${response.status} ${response.statusText} - ${errorBody}`,
    );
  }
}
