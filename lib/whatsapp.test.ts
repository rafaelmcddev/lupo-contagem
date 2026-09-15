import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE, buildRewardMessage, buildWhatsAppOpenUrl, isMobileUserAgent, isWhatsAppApiConfigured, sendViaMetaApi } from './whatsapp';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('isWhatsAppApiConfigured', () => {
  it('is false when the env vars are not set', () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', '');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', '');
    expect(isWhatsAppApiConfigured()).toBe(false);
  });

  it('is true only when the token, the phone number id, and the template name are all set', () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', '');
    expect(isWhatsAppApiConfigured()).toBe(false);

    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    expect(isWhatsAppApiConfigured()).toBe(false);

    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    expect(isWhatsAppApiConfigured()).toBe(true);
  });

  it('is false when the token and phone number id are set but the template name is not (mid template-approval wait)', () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', '');
    expect(isWhatsAppApiConfigured()).toBe(false);
  });
});

describe('buildRewardMessage', () => {
  it('substitutes every placeholder, including the store name and the usage cap, in the standard template', () => {
    const message = buildRewardMessage({
      template: DEFAULT_WHATSAPP_MESSAGE_TEMPLATE,
      storeName: 'Loja Up - Coxim-MS',
      customerName: 'Ana',
      saleDateBR: '14/09/2026',
      rewardBRL: 'R$ 2,30',
      expiresAtBR: '14/10/2026',
      maxUsagePercentText: '20%',
      minPurchaseBRL: 'R$ 11,50',
    });
    expect(message).toContain('Olá, Ana!');
    expect(message).toContain('escolher a Loja Up - Coxim-MS!');
    expect(message).toContain('realizada no dia 14/09/2026');
    expect(message).toContain('gerou R$ 2,30 de crédito');
    expect(message).toContain('até: 14/10/2026');
    expect(message).toContain('cobrir até 20% do valor');
    expect(message).toContain('pelo menos R$ 11,50');
    expect(message).not.toContain('%loja%');
    expect(message).not.toContain('%nome%');
    expect(message).not.toContain('%dia%');
    expect(message).not.toContain('%cashback%');
    expect(message).not.toContain('%data_limite%');
    expect(message).not.toContain('%limite_uso%');
    expect(message).not.toContain('%compra_minima%');
  });

  it('substitutes every occurrence of a placeholder used more than once in a custom template', () => {
    const message = buildRewardMessage({
      template: '%nome%, %nome%! Bem-vindo à %loja%.',
      storeName: 'Loja Up',
      customerName: 'Ana',
      saleDateBR: '14/09/2026',
      rewardBRL: 'R$ 2,30',
      expiresAtBR: '14/10/2026',
      maxUsagePercentText: '20%',
      minPurchaseBRL: 'R$ 11,50',
    });
    expect(message).toBe('Ana, Ana! Bem-vindo à Loja Up.');
  });
});

describe('isMobileUserAgent', () => {
  it('recognizes iPhone and Android user agents as mobile', () => {
    expect(isMobileUserAgent(IPHONE_UA)).toBe(true);
    expect(isMobileUserAgent(ANDROID_UA)).toBe(true);
  });

  it('does not treat a desktop user agent as mobile', () => {
    expect(isMobileUserAgent(DESKTOP_UA)).toBe(false);
  });
});

describe('buildWhatsAppOpenUrl', () => {
  it('on desktop, uses web.whatsapp.com/send (wa.me was found to garble emoji in production)', () => {
    const url = buildWhatsAppOpenUrl('(67) 99999-0000', 'Olá! 👋', DESKTOP_UA);
    expect(url).toBe('https://web.whatsapp.com/send?phone=5567999990000&text=Ol%C3%A1!%20%F0%9F%91%8B');
  });

  it('on mobile, opens the app directly via the whatsapp:// scheme instead of the web redirect', () => {
    const url = buildWhatsAppOpenUrl('(67) 99999-0000', 'Olá!', IPHONE_UA);
    expect(url).toBe('whatsapp://send?phone=5567999990000&text=Ol%C3%A1!');
  });

  it('does not double the country code if already present', () => {
    const url = buildWhatsAppOpenUrl('55 67 99999-0000', 'oi', DESKTOP_UA);
    expect(url).toContain('phone=5567999990000');
  });
});

describe('sendViaMetaApi', () => {
  it('returns not_configured when env vars are missing', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', '');
    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: false, error: 'not_configured' });
  });

  it('returns ok:true on a successful Meta response', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/phone-id/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns ok:false with the Meta error message on a failed response', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid template' } }) }),
    );

    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: false, error: 'Invalid template' });
  });

  it('returns ok:false instead of throwing when fetch itself rejects', async () => {
    vi.stubEnv('META_WHATSAPP_TOKEN', 'tok');
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', 'phone-id');
    vi.stubEnv('META_WHATSAPP_TEMPLATE_NAME', 'reward_notice');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await sendViaMetaApi('67999990000', ['Ana', '14/09/2026', 'R$ 2,30', '14/10/2026']);
    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});
