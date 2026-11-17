const theme = localStorage.getItem('grimorio.theme');
if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.dataset.theme = 'dark';
}

const filter = document.querySelector('#credits-filter');
const input = document.querySelector('#credits-search');
const list = document.querySelector('#credits-list');
const status = document.querySelector('#credits-status');
const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const authorNames = {
  caroa: 'Caro Asercion',
  'carl-olsen': 'Carl Olsen',
  darkzaitzev: 'DarkZaitzev',
};

try {
  const response = await fetch('/game-icons-credits.txt');
  if (!response.ok) throw new Error('Créditos indisponíveis');
  const entries = [
    ...(await response.text()).matchAll(
      /^([a-z0-9-]+) — (?:([^\r\n]+) — )?(https:\/\/game-icons\.net\/1x1\/([a-z0-9-]+)\/[^\s]+)$/gm
    ),
  ].map(([, id, note, url, author]) => {
    const slug = new URL(url).pathname
      .split('/')
      .at(-1)
      .replace(/\.html$/, '');
    const name = slug.replaceAll('-', ' ');
    const authorName = authorNames[author] ?? author;
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = name;
    const label = document.createElement('small');
    label.textContent = note ? authorName + ' · ' + id + ' · ' + note : authorName + ' · ' + id;
    item.append(link, label);
    return { item, search: normalize(id.replaceAll('-', ' ') + ' ' + name + ' ' + authorName) };
  });
  if (!entries.length) throw new Error('Créditos vazios');
  const render = () => {
    const query = normalize(input.value.trim());
    const matches = entries.filter(({ search }) =>
      query.split(/\s+/).every((word) => search.includes(word))
    );
    list.replaceChildren(...matches.map(({ item }) => item));
    status.textContent =
      matches.length === 0
        ? 'Nenhum ícone encontrado.'
        : matches.length === 1
          ? '1 ícone'
          : matches.length + ' ícones';
  };
  input.addEventListener('input', render);
  filter.hidden = false;
  render();
} catch {
  status.textContent = 'A lista não pôde ser carregada. Consulte as atribuições em texto.';
}
