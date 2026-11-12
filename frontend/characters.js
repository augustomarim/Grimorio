import { restoreSession } from './auth.js';

export async function characterRequest(path = '', options = {}, retry = true, expectedOwner) {
  const response = await fetch('/api/builder' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  }).catch(() => {
    throw new Error('Não foi possível conectar à conta. Sua edição permanece neste navegador.');
  });
  if (response.status === 401 && retry) {
    const session = await restoreSession();
    if (session && (expectedOwner === undefined || session.id === expectedOwner))
      return characterRequest(path, options, false, expectedOwner);
  }
  if (response.status === 204) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message ?? 'Não foi possível sincronizar a ficha');
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

export function syncCharacters({ owner, list, read, cache, notify }) {
  let stopped = false;
  let timer;
  let running;
  let loading;
  let publishing;
  const pending = new Set();
  const conflicts = new Set();
  const store = (character) => cache(character);
  const payload = (character) => {
    const { cloudVersion, cloudDirty, cloudPublic, ...draft } = character;
    return { draft, revision: cloudVersion ?? 0, isPublic: !!cloudPublic && !!draft.saved };
  };
  const save = async (character, isPublic) => {
    const { id } = character;
    const snapshot = JSON.stringify(character);
    const body = payload(character);
    const saved = await characterRequest(
      '/' + id,
      { method: 'PUT', body: JSON.stringify({ ...body, isPublic: isPublic ?? body.isPublic }) },
      true,
      owner
    );
    if (stopped) return;
    const current = read(id);
    if (!current) return;
    const changed = JSON.stringify(current) !== snapshot;
    store({
      ...current,
      cloudVersion: saved.revision,
      cloudPublic: saved.isPublic,
      cloudDirty: changed,
    });
    if (changed) pending.add(id);
    else pending.delete(id);
  };
  const flush = () => {
    if (running || stopped || loading || publishing) return running ?? loading;
    let failed = false;
    running = (async () => {
      for (const id of [...pending]) {
        if (stopped) break;
        pending.delete(id);
        if (conflicts.has(id)) continue;
        const character = read(id);
        if (!character?.cloudDirty) continue;
        try {
          await save(character);
        } catch (error) {
          if (stopped) break;
          if (error.code === 'REVISION_CONFLICT') {
            conflicts.add(id);
            notify(
              'Há outra versão desta ficha na conta. Você pode preservar esta edição como uma nova ficha.'
            );
          } else {
            failed = true;
            pending.add(id);
            notify(error.message);
            break;
          }
        }
      }
    })().finally(() => {
      running = undefined;
      if (!stopped && !failed && pending.size) timer = setTimeout(flush, 100);
    });
    return running;
  };
  return {
    owner,
    conflicts,
    load() {
      if (loading) return loading;
      const currentPublication = publishing;
      loading = (async () => {
        await currentPublication?.catch(() => {});
        await running;
        const { documents } = await characterRequest('', {}, true, owner);
        if (stopped) return;
        const remoteIds = new Set(documents.map(({ id }) => id));
        for (const document of documents) {
          const local = read(document.id);
          if (!local?.cloudDirty) {
            store({
              ...document.draft,
              cloudVersion: document.revision,
              cloudPublic: document.isPublic,
              cloudDirty: false,
            });
          } else if ((local.cloudVersion ?? 0) !== document.revision) {
            conflicts.add(local.id);
          } else pending.add(local.id);
        }
        for (const character of list()) {
          if (remoteIds.has(character.id)) continue;
          if (!character.cloudVersion) {
            store({ ...character, cloudDirty: true });
            pending.add(character.id);
          } else if (character.cloudDirty) conflicts.add(character.id);
          else cache(undefined, character.id);
        }
      })().finally(() => {
        loading = undefined;
      });
      return loading.then(flush);
    },
    schedule(id) {
      if (stopped) return;
      pending.add(id);
      clearTimeout(timer);
      timer = setTimeout(flush, 900);
    },
    setPublication(id, isPublic) {
      if (publishing) return publishing;
      const currentLoad = loading;
      publishing = (async () => {
        await currentLoad;
        await running;
        if (stopped) return;
        const character = read(id);
        if (!character) throw new Error('Ficha não encontrada.');
        if (conflicts.has(id))
          throw new Error('Resolva o conflito da ficha antes de alterar o compartilhamento.');
        try {
          await save(character, isPublic);
        } catch (error) {
          if (error.code === 'REVISION_CONFLICT') conflicts.add(id);
          throw error;
        }
      })().finally(() => {
        publishing = undefined;
        if (!stopped && pending.size) timer = setTimeout(flush, 100);
      });
      return publishing;
    },
    async remove(character) {
      pending.delete(character.id);
      await publishing?.catch(() => {});
      await running;
      pending.delete(character.id);
      const current = read(character.id);
      if (current?.cloudVersion) {
        await characterRequest(
          '/' + current.id + '?revision=' + current.cloudVersion,
          { method: 'DELETE' },
          true,
          owner
        );
      }
      cache(undefined, character.id);
    },
    async reload(id) {
      await publishing?.catch(() => {});
      await running;
      const document = await characterRequest('/' + id, {}, true, owner);
      if (stopped) return;
      pending.delete(id);
      conflicts.delete(id);
      store({
        ...document.draft,
        cloudVersion: document.revision,
        cloudPublic: document.isPublic,
        cloudDirty: false,
      });
    },
    flush,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
