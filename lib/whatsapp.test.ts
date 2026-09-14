import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRewardMessage, buildWhatsAppWebUrl, isWhatsAppApiConfigured, sendViaMetaApi } from './whatsapp';

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
  it('substitutes every placeholder in the standard template', () => {
    const message = buildRewardMessage({
      customerName: 'Ana',
      saleDateBR: '14/09/2026',
      rewardBRL: 'R$ 2,30',
      expiresAtBR: '14/10/2026',
    });
    expect(message).toContain('Olá, Ana!');
    expect(message).toContain('realizada no dia 14/09/2026');
    expect(message).toContain('gerou R$ 2,30 de crédito');
    expect(message).toContain('utilizar esse valor até: 14/10/2026');
    expect(message).not.toContain('%nome%');
    expect(message).not.toContain('%dia%');
    expect(message).not.toContain('%cashback%');
    expect(message).not.toContain('%data_limite%');
  });
});

describe('buildWhatsAppWebUrl', () => {
  it('strips formatting from the phone, prefixes the country code, and encodes the text', () => {
    const url = buildWhatsAppWebUrl('(67) 99999-0000', 'Olá!');
    expect(url).toBe('https://web.whatsapp.com/send?phone=5567999990000&text=Ol%C3%A1!');
  });

  it('does not double the country code if already present', () => {
    const url = buildWhatsAppWebUrl('55 67 99999-0000', 'oi');
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
