// Default text for a store that hasn't customized its own message (see the
// per-store `whatsappMessageTemplate` column). %loja% is filled in with that
// store's name at send time, so the text stays correct even if renamed.
export const DEFAULT_WHATSAPP_MESSAGE_TEMPLATE = `Olá, %nome%! 👋

Agradecemos por escolher a %loja%! 💙

Temos uma boa notícia para você! 🎉

Sua compra realizada no dia %dia% gerou %cashback% de crédito para desconto em sua próxima compra.

📅 Você pode utilizar esse valor a partir de amanhã e até: %data_limite%

⚠️ Esse crédito pode cobrir até %limite_uso% do valor da sua próxima compra — então, para usar o valor todo, ela precisa ser de pelo menos %compra_minima%.

É só visitar nossa loja física e aproveitar o seu crédito para pagar menos na sua próxima compra! 😊

Após essa data, o crédito não poderá mais ser utilizado.

Esperamos você! 💙`;

export function isWhatsAppApiConfigured(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_WHATSAPP_TEMPLATE_NAME,
  );
}

export function buildRewardMessage(params: {
  template: string;
  storeName: string;
  customerName: string;
  saleDateBR: string;
  rewardBRL: string;
  expiresAtBR: string;
  maxUsagePercentText: string;
  minPurchaseBRL: string;
}): string {
  return params.template
    .split('%loja%')
    .join(params.storeName)
    .split('%nome%')
    .join(params.customerName)
    .split('%dia%')
    .join(params.saleDateBR)
    .split('%cashback%')
    .join(params.rewardBRL)
    .split('%data_limite%')
    .join(params.expiresAtBR)
    .split('%limite_uso%')
    .join(params.maxUsagePercentText)
    .split('%compra_minima%')
    .join(params.minPurchaseBRL);
}

function toE164Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

// wa.me is WhatsApp's universal link: it opens the native app on a phone
// and falls back to WhatsApp Web on a desktop browser, from the same URL.
export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${toE164Digits(phone)}?text=${encodeURIComponent(text)}`;
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
