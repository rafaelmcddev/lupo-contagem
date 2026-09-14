const REWARD_MESSAGE_TEMPLATE = `Olá, %nome%! 👋

Agradecemos por escolher a loja Up! 💙

Temos uma boa notícia para você! 🎉

Sua compra realizada no dia %dia% gerou %cashback% de crédito para desconto em sua próxima compra.

📅 Você pode utilizar esse valor até: %data_limite%

É só visitar nossa loja física e aproveitar o seu crédito para pagar menos na sua próxima compra! 😊

Após essa data, o crédito não poderá mais ser utilizado.

Esperamos você! 💙`;

export function isWhatsAppApiConfigured(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_WHATSAPP_TEMPLATE_NAME,
  );
}

export function buildRewardMessage(params: {
  customerName: string;
  saleDateBR: string;
  rewardBRL: string;
  expiresAtBR: string;
}): string {
  return REWARD_MESSAGE_TEMPLATE.replace('%nome%', params.customerName)
    .replace('%dia%', params.saleDateBR)
    .replace('%cashback%', params.rewardBRL)
    .replace('%data_limite%', params.expiresAtBR);
}

function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function buildWhatsAppWebUrl(phone: string, text: string): string {
  return `https://web.whatsapp.com/send?phone=${toE164Digits(phone)}&text=${encodeURIComponent(text)}`;
}

export async function sendViaMetaApi(
  phone: string,
  templateParams: string[],
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.META_WHATSAPP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
    return { ok: false, error: 'not_configured' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toE164Digits(phone),
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          components: [
            {
              type: 'body',
              parameters: templateParams.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error?.message ?? `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}
