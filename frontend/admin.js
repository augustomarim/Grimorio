import { restoreSession } from './auth.js';
import { escapeHtml as escape } from './spells.js';

export const adminView = `<section class="panel admin-panel" id="admin-panel">
  <h1>Painel de Administração</h1>
  <nav class="admin-actions" aria-label="Áreas de administração">
    <button class="button secondary" type="button" data-admin-tab="accounts" aria-pressed="true">Contas</button>
    <button class="button secondary" type="button" data-admin-tab="sheets" aria-pressed="false">Fichas publicadas</button>
  </nav>
  <form class="admin-search">
    <label for="admin-search">Buscar por nome ou e-mail</label>
    <div class="admin-actions"><input id="admin-search" name="search" type="search" maxlength="120"><button class="button secondary">Buscar</button></div>
  </form>
  <p data-admin-status role="status"></p>
  <div data-admin-results></div>
  <dialog class="admin-confirm" aria-labelledby="admin-confirm-title"><form method="dialog">
    <h2 id="admin-confirm-title"></h2><p data-admin-confirm-message></p>
    <div class="admin-actions"><button class="button secondary" value="cancel" autofocus>Cancelar</button>
      <button class="button primary" value="apply">Confirmar</button></div>
  </form></dialog>
</section>`;

async function request(path, owner, method = 'GET', retry = true) {
  const response = await fetch('/api/admin/' + path, { method, credentials: 'same-origin' });
  if (response.status === 401 && retry) {
    const user = await restoreSession();
    if (user?.id === owner && user.role === 'admin') return request(path, owner, method, false);
  }
  if (response.status === 204) return;
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error?.message ?? 'Não foi possível acessar a administração.');
  return data;
}

const actionButton = (action, label) =>
  `<button class="button secondary" type="button" data-admin-action="${action}">${label}</button>`;

function itemView(item, tab) {
  const account = tab === 'accounts';
  const name = account ? item.username : item.name;
  const state = account
    ? item.isActive
      ? 'Ativa'
      : 'Desativada'
    : item.blocked
      ? 'Publicação bloqueada'
      : item.visible
        ? 'Visível'
        : 'Conta desativada';
  const actions = account
    ? item.role === 'admin'
      ? ''
      : item.isActive
        ? actionButton('deactivate', 'Desativar') + actionButton('delete', 'Excluir conta')
        : actionButton('reactivate', 'Reativar') + actionButton('delete', 'Excluir conta')
    : (item.visible
        ? `<a class="button secondary" href="#publica/${encodeURIComponent(item.id)}">Abrir ficha</a>`
        : '') +
      (item.blocked
        ? actionButton('unblock', 'Liberar publicação')
        : actionButton('block', 'Bloquear publicação'));
  return `<li class="admin-row" data-admin-id="${escape(item.id)}">
    <div><strong>${escape(name || 'Ficha sem nome')}</strong>
      <span class="muted">${escape(account ? item.email : item.author)}</span></div>
    <div class="admin-actions"><span class="tag">${state}</span>${account && item.role === 'admin' ? '<span class="tag">Administrador</span>' : ''}${actions}</div>
  </li>`;
}

const confirmations = {
  delete: ['Excluir conta', 'A conta e suas fichas no servidor serão excluídas permanentemente.'],
  deactivate: [
    'Desativar conta',
    'As sessões serão encerradas e as fichas sairão da galeria enquanto a conta estiver desativada.',
  ],
  reactivate: [
    'Reativar conta',
    'O usuário poderá entrar novamente. As publicações que estavam visíveis voltam à galeria.',
  ],
  block: [
    'Bloquear publicação',
    'A ficha sai da galeria e o proprietário continua podendo editá-la em privado.',
  ],
  unblock: [
    'Liberar publicação',
    'A ficha permanece privada até que o proprietário a publique novamente.',
  ],
};

export function mountAdmin(panel, owner) {
  const form = panel.querySelector('form.admin-search');
  const results = panel.querySelector('[data-admin-results]');
  const status = panel.querySelector('[data-admin-status]');
  const dialog = panel.querySelector('dialog');
  let tab = 'accounts';
  let page = 1;
  let search = '';
  let generation = 0;
  let busy = false;
  let pending;

  async function load(message = '') {
    const version = ++generation;
    status.textContent = message || 'Carregando…';
    results.replaceChildren();
    try {
      const query = new URLSearchParams({ page: String(page), search });
      const { items, hasMore } = await request(tab + '?' + query, owner);
      if (version !== generation || !panel.isConnected) return;
      if (!items.length && page > 1) {
        page--;
        return load(message);
      }
      status.textContent = message || (items.length ? '' : 'Nenhum resultado encontrado.');
      results.innerHTML = `${items.length ? `<ul class="admin-list">${items.map((item) => itemView(item, tab)).join('')}</ul>` : ''}
        ${
          page > 1 || hasMore
            ? `<nav class="admin-actions" aria-label="Paginação">
          <button class="button secondary" type="button" data-admin-page="-1" ${page === 1 ? 'disabled' : ''}>Anterior</button>
          <span>Página ${page}</span>
          <button class="button secondary" type="button" data-admin-page="1" ${hasMore ? '' : 'disabled'}>Próxima</button></nav>`
            : ''
        }`;
    } catch (error) {
      if (version === generation && panel.isConnected) {
        status.textContent = error.message;
        results.innerHTML =
          '<button class="button secondary" type="button" data-admin-retry>Tentar novamente</button>';
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    search = form.elements.search.value.trim();
    page = 1;
    void load();
  });
  panel.addEventListener('click', ({ target }) => {
    const button = target.closest('button');
    if (busy || !button) return;
    if (button.dataset.adminTab && button.dataset.adminTab !== tab) {
      tab = button.dataset.adminTab;
      panel.querySelectorAll('[data-admin-tab]').forEach((option) => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      form.querySelector('label').textContent =
        tab === 'accounts' ? 'Buscar por nome ou e-mail' : 'Buscar por ficha ou autor';
      form.reset();
      search = '';
      page = 1;
      void load();
    } else if (button.dataset.adminPage) {
      page += Number(button.dataset.adminPage);
      void load();
    } else if (button.hasAttribute('data-admin-retry')) {
      void load();
    } else if (button.dataset.adminAction) {
      const action = button.dataset.adminAction;
      const row = button.closest('[data-admin-id]');
      const [title, message] = confirmations[action];
      pending = { action, id: row.dataset.adminId, tab };
      dialog.querySelector('h2').textContent =
        title + ' · ' + row.querySelector('strong').textContent;
      dialog.querySelector('[data-admin-confirm-message]').textContent = message;
      dialog.returnValue = 'cancel';
      dialog.showModal();
    }
  });
  dialog.addEventListener('close', async () => {
    const operation = pending;
    pending = undefined;
    if (dialog.returnValue !== 'apply' || !operation) return;
    busy = true;
    status.textContent = 'Aplicando alteração…';
    try {
      await request(
        `${operation.tab}/${encodeURIComponent(operation.id)}/${operation.action}`,
        owner,
        'POST'
      );
      if (panel.isConnected) await load('Alteração aplicada.');
    } catch (error) {
      if (panel.isConnected) status.textContent = error.message;
    } finally {
      busy = false;
    }
  });
  void load();
}
