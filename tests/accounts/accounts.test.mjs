import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AccountClient, AccountError, parseAccountConfig, validateFields, consumeEmailToken, accountMessage, normalizeEmail } from '../../js/pages/account-core.mjs';
import { launchPage } from './dom-harness.mjs';

const origin = 'https://site.test/pages/login-page.html';
const csrf = 'c'.repeat(43), emailToken = 't'.repeat(43), pass = 'a long memorable passphrase';
const user = { id: '123e4567-e89b-12d3-a456-426614174000', displayName: '<Steven>', email: 'student@example.com' };
const config = { schemaVersion: 1, enabled: true, apiBaseUrl: '/api', requestTimeoutMs: 1000 };
const parsed = parseAccountConfig(config, origin);
const reply = (data, status = 200, type = 'application/json') => ({ ok: status >= 200 && status < 300, status, headers: { get: () => type }, json: async () => data });
function mockAPI(routes = {}, enabled = true) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith('../data/accounts/config.json')) return reply({ ...config, enabled });
    const path = new URL(url).pathname;
    if (routes[path]) return typeof routes[path] === 'function' ? routes[path](url, options) : routes[path];
    if (path === '/api/auth/session') return reply({ user: null, csrfToken: csrf });
    throw new Error('Unexpected request: ' + path);
  };
  return { fetch, calls };
}
async function submit(page, id = 'account-form') {
  const event = page.document.getElementById(id).trigger('submit');
  assert.equal(event.defaultPrevented, true); await Promise.all(event.pending);
}
function fill(page, id, value) { page.document.getElementById(id).value = value; }

test('config defaults disabled and contains no secret or RDS information', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../../data/accounts/config.json', import.meta.url)));
  assert.equal(raw.enabled, false); assert.deepEqual(parseAccountConfig(raw, origin), { enabled: false });
  assert.doesNotMatch(JSON.stringify(raw), /password|token|rds|amazonaws/i);
});
test('API URL validation enforces secure transport and rejects URL credentials/query/fragment', () => {
  assert.equal(parsed.apiBaseUrl, 'https://site.test/api');
  for (const apiBaseUrl of ['http://api.example.com', 'https://user:secret@example.com/api', 'https://example.com/api?key=1', 'https://example.com/api#token', 'javascript:alert(1)', '']) {
    assert.throws(() => parseAccountConfig({ ...config, apiBaseUrl }, origin));
  }
  assert.throws(() => parseAccountConfig(config, 'http://site.test/pages/login-page.html'));
  assert.equal(parseAccountConfig(config, 'http://localhost:8000/pages/login-page.html').apiBaseUrl, 'http://localhost:8000/api');
  assert.throws(() => parseAccountConfig({ ...config, apiBaseUrl: 'http://evil.test' }, 'http://localhost:8000/'));
  for (const requestTimeoutMs of [0, 999, 30001, '15000']) assert.throws(() => parseAccountConfig({ ...config, requestTimeoutMs }, origin));
});
test('new passwords allow Unicode, spaces and paste-compatible phrases; no trimming', () => {
  const base = { email: ' TEST@Example.com ', displayName: 'Steven', password: pass, confirmPassword: pass };
  assert.deepEqual(validateFields('register', base), {});
  const unicode = '🎓'.repeat(15);
  assert.deepEqual(validateFields('register', { ...base, password: unicode, confirmPassword: unicode }), {});
  const spaced = ' a passphrase with spaces ';
  assert.deepEqual(validateFields('register', { ...base, password: spaced, confirmPassword: spaced }), {});
  for (const password of ['a'.repeat(14), 'a'.repeat(129), ' '.repeat(20)]) assert.ok(validateFields('register', { ...base, password, confirmPassword: password }).password);
  assert.ok(validateFields('register', { ...base, confirmPassword: 'different' }).confirmPassword);
  assert.equal(normalizeEmail(base.email), 'test@example.com');
});
test('login accepts old short passwords but requires an email and password', () => {
  assert.deepEqual(validateFields('login', { email: user.email, password: 'short' }), {});
  assert.ok(validateFields('login', { email: 'bad', password: '' }).email);
  assert.ok(validateFields('login', { email: user.email, password: '' }).password);
  assert.ok(validateFields('register', { displayName: 'a', email: user.email, password: pass, confirmPassword: pass }).displayName);
});
test('email token is removed from URL immediately, even when malformed', () => {
  let next;
  assert.deepEqual(consumeEmailToken(origin + '#token=' + emailToken, value => next = value), { present: true, token: emailToken });
  assert.equal(next, origin);
  assert.deepEqual(consumeEmailToken(origin + '#token=%3Cscript%3E', value => next = value), { present: true, token: null });
  assert.equal(next, origin);
  assert.deepEqual(consumeEmailToken(origin, () => assert.fail()), { present: false, token: null });
});
test('client requires pre-auth CSRF then sends password only in JSON POST with cookies', async () => {
  const api = mockAPI({ '/api/auth/login': reply({ user, csrfToken: 'n'.repeat(43) }) });
  const client = new AccountClient(parsed, api.fetch);
  await assert.rejects(client.login(user.email, pass), /session/); assert.equal(api.calls.length, 0);
  assert.equal(await client.session(), null);
  assert.deepEqual(await client.login(' STUDENT@EXAMPLE.COM ', ' ' + pass + ' '), user);
  const request = api.calls.at(-1);
  assert.equal(request.options.method, 'POST'); assert.equal(request.options.credentials, 'include');
  assert.equal(request.options.headers['X-CSRF-Token'], csrf); assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'no-store'); assert.equal(client.csrfToken, 'n'.repeat(43));
  assert.deepEqual(JSON.parse(request.options.body), { email: user.email, password: ' ' + pass + ' ' });
  assert.doesNotMatch(request.url, /student|password|passphrase/);
});
test('client rejects HTML catch-all, unexpected success status and invalid user payloads', async () => {
  for (const response of [reply({}, 200, 'text/html'), reply({ user, csrfToken: csrf }, 202), reply({ user: { id: 2 }, csrfToken: csrf })]) {
    const api = mockAPI({ '/api/auth/login': response }), client = new AccountClient(parsed, api.fetch);
    await client.session(); await assert.rejects(client.login(user.email, pass), /response/);
  }
  const api = mockAPI({ '/api/auth/session': reply({ user: null, csrfToken: 'short' }) });
  await assert.rejects(new AccountClient(parsed, api.fetch).session(), /response/);
});
test('all non-login API response contracts and CSRF methods are checked', async () => {
  const api = mockAPI({
    '/api/auth/register': reply({ status: 'pending_verification' }, 202),
    '/api/auth/password-reset/request': reply({ status: 'accepted' }, 202),
    '/api/auth/password-reset/confirm': reply({ status: 'password_reset' }),
    '/api/auth/verify-email': reply({ status: 'verified' }), '/api/auth/logout': reply(null, 204)
  });
  const client = new AccountClient(parsed, api.fetch); await client.session();
  await client.register(' Steven ', user.email, pass); await client.requestReset(user.email);
  await client.resetPassword(emailToken, pass); await client.verifyEmail(emailToken); await client.logout();
  assert.equal(client.csrfToken, null);
  for (const call of api.calls.slice(1)) assert.equal(call.options.headers['X-CSRF-Token'], csrf);
  assert.equal(JSON.parse(api.calls[1].options.body).displayName, 'Steven');
  for (const [path, action] of [
    ['/api/auth/register', c => c.register('Steven', user.email, pass)],
    ['/api/auth/password-reset/request', c => c.requestReset(user.email)],
    ['/api/auth/password-reset/confirm', c => c.resetPassword(emailToken, pass)],
    ['/api/auth/verify-email', c => c.verifyEmail(emailToken)]
  ]) {
    const bad = mockAPI({ [path]: reply({}, path.endsWith('/register') || path.endsWith('/request') ? 202 : 200) });
    const c = new AccountClient(parsed, bad.fetch); await c.session(); await assert.rejects(action(c), /response/);
  }
});
test('client safely handles network, timeout and disabled service without leaking server text', async () => {
  const disabled = new AccountClient({ enabled: false }, () => assert.fail());
  await assert.rejects(disabled.session(), /disabled/);
  const client = new AccountClient(parsed, async () => { throw new Error('secret'); });
  await assert.rejects(client.session(), error => error.code === 'network' && !error.message.includes('secret'));
  const timeout = new AccountClient({ ...parsed, requestTimeoutMs: 1 }, (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  await assert.rejects(timeout.session(), error => error.code === 'timeout');
  assert.match(accountMessage(new AccountError('request', 429)), /Too many attempts/);
  assert.match(accountMessage(new AccountError('request', 403)), /Reload/);
  assert.match(accountMessage(new AccountError('request', 410), 'verify'), /expired/);
});
test('all account pages have shared navigation, meaningful form labels and no secret storage', () => {
  for (const name of ['login-page', 'create-account', 'reset-password', 'verify-email']) {
    const html = fs.readFileSync(new URL('../../pages/' + name + '.html', import.meta.url), 'utf8');
    for (const target of ['../index.html', 'program-mapper.html', 'registration.html', 'resources.html', 'cybersecurity.html', 'login-page.html']) assert.ok(html.includes('href="' + target + '"'), target);
    assert.match(html, /name="referrer" content="no-referrer"/);
    assert.match(html, /method="post" novalidate/); assert.match(html, /type="submit" disabled/);
    assert.doesNotMatch(html, /href="#"/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(ids.length, new Set(ids).size, name);
    for (const [, id] of html.matchAll(/<input id="([^"]+)"/g)) assert.ok(html.includes('for="' + id + '"'), id);
  }
  const js = fs.readFileSync(new URL('../../js/pages/account.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../js/pages/account-core.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /localStorage|sessionStorage|\.innerHTML|console\./);
});
test('disabled frontend never sends entered credentials or claims success', async t => {
  for (const name of ['login-page.html', 'create-account.html', 'reset-password.html', 'verify-email.html']) {
    const api = mockAPI({}, false), page = await launchPage(name, { fetch: api.fetch }); t.after(page.dispose);
    assert.deepEqual(page.errors, []); assert.match(page.document.getElementById('service-status').textContent, /isn’t available yet/);
    await submit(page); assert.equal(api.calls.length, 1); assert.equal(page.document.querySelector('button[type="submit"]').disabled, true);
    assert.equal(page.storage.size, 0);
  }
});
test('login validates fields, reveals password and renders real account safely; signs out', async t => {
  const api = mockAPI({ '/api/auth/login': reply({ user, csrfToken: csrf }), '/api/auth/logout': reply(null, 204) });
  const page = await launchPage('login-page.html', { fetch: api.fetch }); t.after(page.dispose);
  await submit(page); assert.equal(api.calls.length, 2); assert.equal(page.document.activeElement.id, 'email');
  fill(page, 'email', ' STUDENT@EXAMPLE.COM '); fill(page, 'password', pass);
  const toggle = page.document.querySelector('[data-toggle="password"]'); toggle.click();
  assert.equal(page.document.getElementById('password').getAttribute('type'), 'text'); assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  await submit(page);
  assert.equal(page.document.getElementById('account-session').hidden, false);
  assert.equal(page.document.getElementById('account-name').textContent, '<Steven>');
  assert.equal(page.document.getElementById('password').value, ''); assert.equal(page.storage.size, 0);
  const event = page.document.getElementById('sign-out').click(); await Promise.all(event.pending);
  assert.equal(page.document.getElementById('account-session').hidden, true); assert.equal(page.document.getElementById('account-form').querySelector('button[type="submit"]').disabled, false);
  assert.deepEqual(page.errors, []);
});
test('existing session skips entry and shows only the project account summary', async t => {
  const api = mockAPI({ '/api/auth/session': reply({ user, csrfToken: csrf }) });
  const page = await launchPage('create-account.html', { fetch: api.fetch }); t.after(page.dispose);
  assert.equal(page.document.getElementById('account-entry').hidden, true);
  assert.equal(page.document.getElementById('account-email').textContent, user.email);
});
test('registration confirms passwords, omits confirmation from API and shows generic verification notice', async t => {
  const api = mockAPI({ '/api/auth/register': reply({ status: 'pending_verification' }, 202) });
  const page = await launchPage('create-account.html', { fetch: api.fetch }); t.after(page.dispose);
  fill(page, 'display-name', 'Steven'); fill(page, 'email', user.email); fill(page, 'password', pass); fill(page, 'confirm-password', 'oops');
  await submit(page); assert.equal(api.calls.length, 2); assert.equal(page.document.getElementById('confirm-password').getAttribute('aria-invalid'), 'true');
  fill(page, 'confirm-password', pass); await submit(page);
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { displayName: 'Steven', email: user.email, password: pass });
  assert.match(page.document.getElementById('form-status').textContent, /If registration can proceed/);
  assert.equal(page.document.getElementById('password').value, ''); assert.equal(page.document.getElementById('confirm-password').value, '');
  await submit(page); assert.equal(api.calls.length, 3);
});
test('failed login is generic, clears password and permits retry; expired CSRF requires reload', async t => {
  const api = mockAPI({ '/api/auth/login': reply({ error: '<script>secret SQL</script>' }, 401) });
  const page = await launchPage('login-page.html', { fetch: api.fetch }); t.after(page.dispose);
  fill(page, 'email', user.email); fill(page, 'password', pass); await submit(page);
  const status = page.document.getElementById('form-status'); assert.match(status.textContent, /couldn’t log you in/); assert.doesNotMatch(status.textContent, /secret|script|SQL/);
  assert.equal(page.document.getElementById('password').value, ''); assert.equal(page.document.querySelector('button[type="submit"]').disabled, false);
  const expired = mockAPI({ '/api/auth/login': reply({}, 403) }), other = await launchPage('login-page.html', { fetch: expired.fetch }); t.after(other.dispose);
  fill(other, 'email', user.email); fill(other, 'password', pass); await submit(other);
  assert.equal(other.document.querySelector('button[type="submit"]').disabled, true);
});
test('repeat submission while pending sends exactly one login request', async t => {
  let release;
  const api = mockAPI({ '/api/auth/login': () => new Promise(resolve => release = resolve) });
  const page = await launchPage('login-page.html', { fetch: api.fetch }); t.after(page.dispose);
  fill(page, 'email', user.email); fill(page, 'password', pass);
  const pending = page.document.getElementById('account-form').trigger('submit');
  await submit(page); assert.equal(api.calls.length, 3); assert.equal(page.document.querySelector('button[type="submit"]').disabled, true);
  release(reply({ user, csrfToken: csrf })); await Promise.all(pending.pending);
});
test('password reset requests stay generic and never auto-login', async t => {
  const api = mockAPI({ '/api/auth/password-reset/request': reply({ status: 'accepted' }, 202) });
  const page = await launchPage('reset-password.html', { fetch: api.fetch }); t.after(page.dispose);
  fill(page, 'email', user.email); await submit(page);
  assert.match(page.document.getElementById('form-status').textContent, /If an account matches/);
  assert.equal(page.document.getElementById('account-session').hidden, true);
});
test('reset token is consumed only after explicit new-password submission', async t => {
  const api = mockAPI({ '/api/auth/password-reset/confirm': reply({ status: 'password_reset' }) });
  const page = await launchPage('reset-password.html', { fetch: api.fetch, url: 'https://site.test/pages/reset-password.html#token=' + emailToken }); t.after(page.dispose);
  assert.equal(new URL(page.location.href).hash, ''); assert.equal(api.calls.length, 2);
  assert.equal(page.document.getElementById('reset-request').hidden, true); assert.equal(page.document.getElementById('reset-confirm').hidden, false);
  fill(page, 'new-password', pass); fill(page, 'confirm-password', pass); await submit(page, 'reset-form');
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { token: emailToken, password: pass });
  assert.match(page.document.getElementById('form-status').textContent, /has been reset/);
  assert.equal(page.document.getElementById('new-password').value, ''); assert.equal(page.storage.size, 0);
});
test('verification requires explicit action; invalid/missing links cannot be submitted', async t => {
  const api = mockAPI({ '/api/auth/verify-email': reply({ status: 'verified' }) });
  const page = await launchPage('verify-email.html', { fetch: api.fetch, url: 'https://site.test/pages/verify-email.html#token=' + emailToken }); t.after(page.dispose);
  assert.equal(api.calls.length, 2); assert.equal(new URL(page.location.href).hash, '');
  await submit(page); assert.equal(api.calls.length, 3); assert.match(page.document.getElementById('form-status').textContent, /email is verified/);
  for (const fragment of ['', '#token=bad']) {
    const api = mockAPI(), invalid = await launchPage('verify-email.html', { fetch: api.fetch, url: 'https://site.test/pages/verify-email.html' + fragment }); t.after(invalid.dispose);
    assert.equal(invalid.document.querySelector('button[type="submit"]').disabled, true); await submit(invalid); assert.equal(api.calls.length, 2);
  }
});
test('API/session failures leave forms disabled and explain availability', async t => {
  for (const fetch of [async () => { throw new Error('Offline'); }, mockAPI({ '/api/auth/session': reply({}, 500) }).fetch, async () => reply({}, 200, 'text/html')]) {
    const page = await launchPage('login-page.html', { fetch }); t.after(page.dispose);
    assert.equal(page.document.querySelector('button[type="submit"]').disabled, true);
    assert.match(page.document.getElementById('service-status').textContent, /temporarily unavailable/);
    assert.deepEqual(page.errors, []);
  }
});
test('account schema is additive and separates session/reset/verification tokens and password hashes', () => {
  const sql = fs.readFileSync(new URL('../../backend/accounts/schema.sql', import.meta.url), 'utf8');
  for (const name of ['users', 'sessions', 'email_verification_tokens', 'password_reset_tokens']) assert.ok(sql.includes('csun_accounts.' + name));
  assert.match(sql, /UNIQUE INDEX.*\(lower\(email\)\)/); assert.match(sql, /password_hash text NOT NULL/);
  assert.match(sql, /octet_length\(token_hash\) = 32/); assert.match(sql, /REFERENCES csun_accounts.users\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|SCHEMA)|TRUNCATE|ALTER TABLE csun_mapper|CREATE ROLE|PASSWORD '/i);
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
});
