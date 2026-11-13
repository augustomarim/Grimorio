export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function authRequest(path, body) {
  let response;
  try {
    response = await fetch('/api/auth/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError(503, 'Não foi possível conectar. Tente novamente em instantes.');
  }
  if (response.status === 204) return;
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new AuthError(
      response.status,
      data?.error?.message || 'O serviço de contas está indisponível. Tente novamente em instantes.'
    );
  }
  return data;
}

// The backend rotates refresh tokens. Recheck the access cookie after obtaining
// the shared lock so another tab's completed rotation is reused.
export function withSessionLock(operation) {
  return navigator.locks ? navigator.locks.request('grimorio-session', operation) : operation();
}

async function accessUser() {
  try {
    return (await authRequest('me')).user;
  } catch (error) {
    if (error.status !== 401) throw error;
    return null;
  }
}

let restoring;
export function restoreSession() {
  restoring ??= (async () => {
    const user = await accessUser();
    if (user) return user;
    // Without a cross-tab lock, require a new login after access expires.
    if (!navigator.locks) return null;
    return withSessionLock(async () => {
      const renewed = await accessUser();
      if (renewed) return renewed;
      try {
        return (await authRequest('refresh', {})).user;
      } catch (error) {
        if (error.status !== 401) throw error;
        return null;
      }
    });
  })().finally(() => {
    restoring = undefined;
  });
  return restoring;
}

const emailField =
  '<label for="email">E-mail</label><input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>';
const passwordField = (
  newPassword
) => `<label for="password">${newPassword ? 'Nova senha' : 'Senha'}</label>
  <input id="password" name="password" type="password" autocomplete="${newPassword ? 'new-password' : 'current-password'}"
    maxlength="128" ${newPassword ? 'minlength="12" aria-describedby="password-hint"' : ''} required>
  ${newPassword ? '<small id="password-hint">Use pelo menos 12 caracteres.</small>' : ''}`;
const confirmField =
  '<label for="confirmation">Confirmar senha</label><input id="confirmation" name="confirmation" type="password" autocomplete="new-password" maxlength="128" required>';

export function accountLink(href, label, icon) {
  return `<a class="navigation-row account-action" href="${href}"><span class="game-emblem account-action-icon" aria-hidden="true">${icon}</span><span>${label}</span><span aria-hidden="true">›</span></a>`;
}

export function accountView(view) {
  const forms = {
    login: [
      'Entrar no Grimório',
      'Acesse seu painel de aventuras.',
      `${emailField}${passwordField(false)}`,
      'Entrar',
      accountLink('#recuperar', 'Esqueci a senha', '?') + accountLink('#cadastro', 'Criar conta', '+'),
    ],
    cadastro: [
      'Criar conta',
      'Escolha como você quer ser chamado no Grimório.',
      `<label for="username">Nome de usuário</label><input id="username" name="username" autocomplete="username" minlength="3" maxlength="32" required>
      ${emailField}${passwordField(true).replace('Nova senha', 'Senha')}${confirmField}`,
      'Cadastrar',
      accountLink('#login', 'Já tenho conta', '→'),
    ],
    recuperar: [
      'Recuperar senha',
      'Informe o e-mail da conta para solicitar um link.',
      emailField,
      'Solicitar link',
      accountLink('#login', 'Voltar para entrar', '←'),
    ],
    redefinir: [
      'Redefinir senha',
      'Escolha a nova senha para sua conta.',
      `${passwordField(true)}${confirmField}`,
      'Salvar nova senha',
      accountLink('/#login', 'Voltar para entrar', '←'),
    ],
  };
  const [heading, description, fields, action, links] = forms[view];
  return `<div class="account-layout"><section class="account-intro">
      <p class="eyebrow">Grimório · D&amp;D 2024</p><h2>Suas próximas aventuras começam aqui.</h2>
      <p>Monte personagens, planeje a progressão e consulte o compêndio.</p>
    </section>
    <section class="panel account-panel"><header><h1>${heading}</h1><p class="muted">${description}</p></header>
      <form class="account-form" id="account-form" data-view="${view}">
        ${fields}<p id="account-error" role="alert"></p><button class="button primary" type="submit">${action}</button>
      </form>
      <div class="account-links">${links}
        ${view === 'login' ? '<button class="navigation-row account-action" type="button" data-guest><span class="game-emblem account-action-icon" aria-hidden="true">↪</span><span>Usar fichas locais sem conta</span><span aria-hidden="true">›</span></button>' : ''}
      </div>
    </section></div>`;
}
