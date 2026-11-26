import { AccountClient, parseAccountConfig, validateFields, consumeEmailToken, accountMessage } from './account-core.mjs?v=2026.11.20.2';

const byId = id => document.getElementById(id);
const mode = document.body.dataset.authPage;
const form = byId('account-form'), resetForm = byId('reset-form');
const service = byId('service-status'), status = byId('form-status');
let client, ready = false, busy = false, finished = false;
let emailToken = consumeEmailToken(location.href, url => history.replaceState(null, '', url));

function announce(message, tone = 'error') {
  status.textContent = message; status.dataset.tone = tone; status.hidden = false; status.focus();
}
function setEnabled() {
  for (const button of document.querySelectorAll('button[type="submit"]')) button.disabled = !ready || busy || finished;
}
function clearErrors() {
  status.hidden = true;
  for (const input of document.querySelectorAll('input')) input.setAttribute('aria-invalid', 'false');
  for (const error of document.querySelectorAll('.auth-field-error')) error.hidden = true;
}
function values(activeForm) {
  const get = name => activeForm.querySelector('[name="' + name + '"]')?.value ?? '';
  return { email: get('email'), displayName: get('display-name'), password: get('password') || get('new-password'), confirmPassword: get('confirm-password') };
}
function showErrors(errors, activeForm) {
  const names = { email: 'email', displayName: 'display-name', password: mode === 'reset' ? 'new-password' : 'password', confirmPassword: 'confirm-password' };
  let first;
  for (const [key, message] of Object.entries(errors)) {
    const input = activeForm.querySelector('[name="' + names[key] + '"]');
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const error = byId(input.id + '-error'); error.textContent = message; error.hidden = false;
    first ??= input;
  }
  announce('Please check the highlighted fields.'); first?.focus();
}
function showUser(user) {
  byId('account-name').textContent = user.displayName;
  byId('account-email').textContent = user.email;
  byId('account-entry').hidden = true; byId('account-session').hidden = false;
  byId('account-session').querySelector('a').focus();
}
function clearPasswords(activeForm) {
  // Includes fields revealed as text by the show-password control.
  for (const input of activeForm.querySelectorAll('input[autocomplete="new-password"], input[autocomplete="current-password"]')) input.value = '';
}

async function submit(event, operation, activeForm) {
  event.preventDefault();
  if (!ready || busy || finished) return;
  clearErrors();
  const data = values(activeForm), errors = validateFields(operation, data);
  if (Object.keys(errors).length) { showErrors(errors, activeForm); return; }
  if (['verify', 'reset-confirm'].includes(operation) && !emailToken.token) { announce('Open a valid link from your email to continue.'); return; }
  busy = true; setEnabled(); activeForm.setAttribute('aria-busy', 'true');
  const button = activeForm.querySelector('button[type="submit"]'), originalLabel = button.textContent;
  button.textContent = 'Please wait…';
  try {
    if (operation === 'login') showUser(await client.login(data.email, data.password));
    if (operation === 'register') {
      await client.register(data.displayName, data.email, data.password); finished = true;
      announce('If registration can proceed, you’ll receive an email with verification instructions. Check your inbox and spam folder, then return to log in.', 'success');
    }
    if (operation === 'reset-request') {
      await client.requestReset(data.email);
      announce('If an account matches that email address, you’ll receive password-reset instructions. Check your inbox and spam folder.', 'success');
    }
    if (operation === 'reset-confirm') {
      await client.resetPassword(emailToken.token, data.password); emailToken = { present: false, token: null }; finished = true;
      announce('Your password has been reset. You can now return to log in.', 'success');
    }
    if (operation === 'verify') {
      await client.verifyEmail(emailToken.token); emailToken = { present: false, token: null }; finished = true;
      announce('Your email is verified. Return to log in to your account.', 'success');
    }
  } catch (error) {
    announce(accountMessage(error, operation));
    // Refresh the page to obtain a new pre-auth session/CSRF pair after expiry.
    if (error.status === 403) ready = false;
  } finally {
    clearPasswords(activeForm); busy = false; setEnabled();
    activeForm.setAttribute('aria-busy', 'false'); button.textContent = originalLabel;
  }
}

async function boot() {
  for (const button of document.querySelectorAll('[data-toggle]')) button.addEventListener('click', () => {
    const input = byId(button.dataset.toggle), reveal = input.getAttribute('type') === 'password';
    input.setAttribute('type', reveal ? 'text' : 'password'); button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(reveal));
    button.setAttribute('aria-label', (reveal ? 'Hide ' : 'Show ') + document.querySelector('label[for="' + input.id + '"]').textContent.toLowerCase());
  });
  form.addEventListener('submit', event => submit(event, mode === 'reset' ? 'reset-request' : mode, form));
  resetForm?.addEventListener('submit', event => submit(event, 'reset-confirm', resetForm));
  if (mode === 'reset' && emailToken.present) {
    byId('reset-request').hidden = true; byId('reset-confirm').hidden = false;
    byId('account-title').textContent = 'Choose a new password.';
  }
  if (mode === 'verify' && !emailToken.present) byId('verify-help').textContent = 'Open the verification link in your email to continue. If you already verified your email, return to log in.';
  byId('sign-out').addEventListener('click', async () => {
    if (busy || !client) return;
    const button = byId('sign-out'), sessionStatus = byId('session-status');
    busy = true; button.disabled = true; sessionStatus.textContent = 'Signing out…';
    try {
      await client.logout();
      byId('account-session').hidden = true; byId('account-entry').hidden = false;
      byId('account-name').textContent = ''; byId('account-email').textContent = '';
      ready = false; finished = false; service.hidden = false; service.textContent = 'Signed out. Checking account availability…';
      // Fetch a fresh anonymous CSRF token so another account can log in safely.
      try { await client.session(); ready = true; service.hidden = true; announce('You’re signed out.', 'success'); }
      catch { service.textContent = 'You’re signed out. Reload the page to log in again.'; }
    } catch (error) { sessionStatus.textContent = accountMessage(error, 'logout'); }
    finally { busy = false; button.disabled = false; setEnabled(); }
  });
  try {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try { response = await fetch('../data/accounts/config.json?v=2026.11.20.1', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('configuration');
    const config = parseAccountConfig(await response.json(), location.href);
    if (!config.enabled) { service.textContent = 'Account access isn’t available yet. You can use the Program Mapper without an account.'; return; }
    client = new AccountClient(config);
    const user = await client.session();
    if (user && ['login', 'register'].includes(mode)) showUser(user);
    ready = true; service.hidden = true;
    if (['verify', 'reset'].includes(mode) && emailToken.present && !emailToken.token) {
      ready = false; announce('This link is invalid. Request a new link and try again.');
    } else if (mode === 'verify' && !emailToken.token) ready = false;
  } catch {
    service.textContent = 'Account access is temporarily unavailable. Please try again later. You can still use the Program Mapper.';
  } finally { setEnabled(); }
}
void boot();
