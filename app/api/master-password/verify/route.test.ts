import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function verifyReq(password: string) {
  return new Request('http://localhost/api/master-password/verify', { method: 'POST', body: JSON.stringify({ password }) });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/master-password/verify', () => {
  it('returns ok when the password matches the env var', async () => {
    vi.stubEnv('SETTINGS_MASTER_PASSWORD', 'super-secreto');
    const res = await POST(verifyReq('super-secreto'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('returns 401 invalid_password when the password does not match', async () => {
    vi.stubEnv('SETTINGS_MASTER_PASSWORD', 'super-secreto');
    const res = await POST(verifyReq('errada'));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('invalid_password');
  });

  it('returns 401 when no master password is configured', async () => {
    const res = await POST(verifyReq('anything'));
    expect(res.status).toBe(401);
  });

  it('returns 400 invalid_json when the body is malformed', async () => {
    const res = await POST(new Request('http://localhost/api/master-password/verify', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });
});
