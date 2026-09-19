import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

type AdminAuthConfig = {
  enabled: boolean;
  username: string;
  passwordHash: string;
  sessionSecret: string;
  sessionHours: number;
};

type SessionPayload = { sub: string; exp: number };

export function hashAdminPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  if (password.length < 10) throw new Error('Password admin minimal 10 karakter.');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(value => {
    const separator = value.indexOf('=');
    if (separator < 0) return [value.trim(), ''];
    return [value.slice(0, separator).trim(), decodeURIComponent(value.slice(separator + 1))];
  }));
}

export class AdminAuthService {
  readonly cookieName = 'antarfix_admin_session';

  constructor(private readonly config: AdminAuthConfig) {}

  get enabled() { return this.config.enabled; }

  verifyCredentials(username: string, password: string): boolean {
    if (!this.enabled || username !== this.config.username) return false;
    const [, salt, expectedHex] = this.config.passwordHash.split('$');
    if (!salt || !expectedHex) return false;
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  createToken(now = Date.now()): string {
    const payload: SessionPayload = {
      sub: this.config.username,
      exp: Math.floor(now / 1000) + this.config.sessionHours * 3600,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.config.sessionSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  readSession(cookieHeader: string | undefined, now = Date.now()): SessionPayload | null {
    if (!this.enabled) return null;
    const token = parseCookies(cookieHeader)[this.cookieName];
    if (!token) return null;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = createHmac('sha256', this.config.sessionSecret).update(encoded).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
      if (payload.sub !== this.config.username || payload.exp <= Math.floor(now / 1000)) return null;
      return payload;
    } catch { return null; }
  }

  sessionCookie(token: string, production: boolean): string {
    const maxAge = this.config.sessionHours * 3600;
    return `${this.cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
  }

  clearCookie(production: boolean): string {
    return `${this.cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`;
  }
}
