// Account integration contract. No database credentials or browser-stored sessions.
export class AccountError extends Error {
  constructor(code, status = 0) { super(code); this.name = 'AccountError'; this.code = code; this.status = status; }
}

export function normalizeEmail(value) { return String(value ?? '').trim().toLowerCase(); }
export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function validateFields(kind, values) {
  const errors = {}, email = normalizeEmail(values.email), password = String(values.password ?? '');
  const length = [...password].length;
  if (['login', 'register', 'reset-request'].includes(kind) && !validEmail(email)) errors.email = 'Enter a valid email address.';
  if (kind === 'register') {
    const length = [...String(values.displayName ?? '').trim()].length;
    if (length < 2 || length > 80) errors.displayName = 'Enter a name or nickname with 2–80 characters.';
  }
  if (['login', 'register', 'reset-confirm'].includes(kind)) {
    if (!password || length > 128) errors.password = 'Enter your password (up to 128 characters).';
    if (kind !== 'login' && (length < 15 || length > 128 || !password.trim())) errors.password = 'Use 15–128 characters. Try a memorable passphrase.';
    if (kind !== 'login' && password !== values.confirmPassword) errors.confirmPassword = 'The passwords do not match.';
  }
  return errors;
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const tokenOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{32,512}$/.test(value);
const userOK = user => object(user) && typeof user.id === 'string' && user.id.length > 0 && user.id.length <= 128 &&
  typeof user.displayName === 'string' && [...user.displayName].length >= 2 && [...user.displayName].length <= 80 && validEmail(user.email);

export function parseAccountConfig(value, pageURL) {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') throw new AccountError('configuration');
  if (!value.enabled) return { enabled: false };
  if (typeof value.apiBaseUrl !== 'string' || !value.apiBaseUrl.trim() || value.apiBaseUrl !== value.apiBaseUrl.trim()) throw new AccountError('configuration');
  const page = new URL(pageURL), base = new URL(value.apiBaseUrl, page);
  const local = ['localhost', '127.0.0.1', '[::1]'];
  const localDev = page.protocol === 'http:' && local.includes(page.hostname) && local.includes(base.hostname);
  if ((page.protocol !== 'https:' && !localDev) || (base.protocol !== 'https:' && !(localDev && base.protocol === 'http:')) ||
      base.username || base.password || base.search || base.hash) throw new AccountError('configuration');
  const timeout = value.requestTimeoutMs ?? 15000;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) throw new AccountError('configuration');
  const config = { enabled: true, apiBaseUrl: base.href.replace(/\/$/, ''), requestTimeoutMs: timeout };
  if (value.siteOrigins !== undefined) {
    if (!Array.isArray(value.siteOrigins) || value.siteOrigins.length < 1 || value.siteOrigins.length > 5) throw new AccountError('configuration');
    config.siteOrigins = value.siteOrigins.map(origin => {
      if (typeof origin !== 'string') throw new AccountError('configuration');
      let url;
      try { url = new URL(origin); } catch { throw new AccountError('configuration'); }
      if (url.protocol !== 'https:' || url.origin !== origin) throw new AccountError('configuration');
      return origin;
    });
  }
  return config;
}

// Production accounts use same-site cookies. Preview pages link to the live site
// instead of sending credentials from an origin the API does not accept.
export function accountSiteURL(config, pageURL) {
  const page = new URL(pageURL);
  if (!config.siteOrigins || config.siteOrigins.includes(page.origin)) return null;
  const path = /^\/pages\/(?:login-page|create-account|reset-password|verify-email)\.html$/.test(page.pathname)
    ? page.pathname : '/pages/login-page.html';
  return new URL(path, config.siteOrigins[0]).href;
}

// Email links use a fragment so tokens are not sent to the static host in URLs.
// Consume it immediately and retain it only in this module's caller memory.
export function consumeEmailToken(pageURL, replaceURL) {
  const url = new URL(pageURL), params = new URLSearchParams(url.hash.slice(1));
  const present = params.has('token'), value = params.get('token');
  if (url.hash) { url.hash = ''; replaceURL(url.href); }
  return { present, token: present && tokenOK(value) ? value : null };
}

export function accountMessage(error, operation) {
  if (error?.status === 422 && ['register', 'reset-confirm'].includes(operation)) return 'Choose a less common password or passphrase with 15–128 characters.';
  if (error?.status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  if (error?.status === 401 && operation === 'login') return 'We couldn’t log you in. Check your email and password. If you just registered, verify your email first.';
  if ([400, 410].includes(error?.status) && ['verify', 'reset-confirm'].includes(operation)) return 'This link is invalid or has expired. Request a new link and try again.';
  if (error?.status === 403) return 'Your secure session has expired. Reload this page and try again.';
  if (error?.code === 'timeout') return 'The request took too long. Please try again.';
  if (error?.code === 'network') return 'We couldn’t reach the account service. Check your connection and try again.';
  return 'Account access is temporarily unavailable. Please try again later. You can still use the Program Mapper.';
}

export class AccountClient {
  constructor(config, fetcher = globalThis.fetch) {
    this.config = config; this.fetcher = fetcher; this.csrfToken = null;
  }
  async request(path, body, expectedStatus = 200) {
    if (!this.config.enabled) throw new AccountError('disabled');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) {
        if (!tokenOK(this.csrfToken)) throw new AccountError('session');
        headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = this.csrfToken;
      }
      const response = await this.fetcher(this.config.apiBaseUrl + path, {
        method: body === undefined ? 'GET' : 'POST', headers, credentials: 'include', cache: 'no-store',
        redirect: 'error', signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      // Never echo backend error bodies, URLs, tokens, or submitted credentials.
      if (!response.ok) throw new AccountError('request', response.status);
      if (response.status !== expectedStatus) throw new AccountError('response');
      if (expectedStatus === 204) return null;
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new AccountError('response');
      let data;
      try { data = await response.json(); } catch { throw new AccountError('response'); }
      if (!object(data)) throw new AccountError('response');
      return data;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(controller.signal.aborted ? 'timeout' : 'network');
    } finally { clearTimeout(timer); }
  }
  async session() {
    const data = await this.request('/auth/session');
    if (!tokenOK(data.csrfToken) || !(data.user === null || userOK(data.user))) throw new AccountError('response');
    this.csrfToken = data.csrfToken;
    return data.user;
  }
  async login(email, password) {
    const data = await this.request('/auth/login', { email: normalizeEmail(email), password });
    if (!tokenOK(data.csrfToken) || !userOK(data.user)) throw new AccountError('response');
    this.csrfToken = data.csrfToken;
    return data.user;
  }
  async register(displayName, email, password) {
    const data = await this.request('/auth/register', { displayName: displayName.trim(), email: normalizeEmail(email), password }, 202);
    if (data.status !== 'pending_verification') throw new AccountError('response');
  }
  async requestReset(email) {
    const data = await this.request('/auth/password-reset/request', { email: normalizeEmail(email) }, 202);
    if (data.status !== 'accepted') throw new AccountError('response');
  }
  async resetPassword(token, password) {
    if (!tokenOK(token)) throw new AccountError('token');
    const data = await this.request('/auth/password-reset/confirm', { token, password });
    if (data.status !== 'password_reset') throw new AccountError('response');
  }
  async verifyEmail(token) {
    if (!tokenOK(token)) throw new AccountError('token');
    const data = await this.request('/auth/verify-email', { token });
    if (data.status !== 'verified') throw new AccountError('response');
  }
  async logout() { await this.request('/auth/logout', {}, 204); this.csrfToken = null; }
}
