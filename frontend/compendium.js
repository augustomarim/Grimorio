import { displayName } from './rules.js';

const alphabetical = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
export const sortEntries = (entries) =>
  [...entries].sort((a, b) => alphabetical.compare(displayName(a), displayName(b)));

export const compendiumHref = (category, id) => `#compendio/${category}/${encodeURIComponent(id)}`;

const weaponPropertyTerms = {
  Ammunition: 'Munição',
  Arrow: 'Flecha',
  Bolt: 'Virote',
  Bullet: 'Bala',
  Finesse: 'Acuidade',
  Heavy: 'Pesada',
  Light: 'Leve',
  Loading: 'Recarga',
  Needle: 'Agulha',
  Range: 'Alcance',
  Reach: 'Alcance',
  Thrown: 'Arremesso',
  'Two-Handed': 'Duas Mãos',
  Versatile: 'Versátil',
  'unless mounted': 'exceto se estiver montado',
};

const weaponPropertyPattern = new RegExp(
  `\\b(?:${Object.keys(weaponPropertyTerms).join('|')})\\b`,
  'g'
);

export const weaponPropertiesLabel = (properties) =>
  properties?.replace(weaponPropertyPattern, (term) => weaponPropertyTerms[term]);

export const normalizeWeaponPropertyText = (text) =>
  text
    .replace(/\bpropriedade (?:da )?Luz\b/gi, 'propriedade Leve')
    .replace(/\bLuz\.(?= Quando você realiza a ação de Ataque)/g, 'Leve.')
    .replace(/\b(?:Delicadeza|Sutileza|Finesse)\.(?= Ao fazer um ataque)/g, 'Acuidade.')
    .replace(/\bcom Finesse\b/gi, 'com a propriedade Acuidade')
    .replace(/\bpropriedade (?:de )?(?:Delicadeza|Sutileza|Finesse)\b/gi, 'propriedade Acuidade');

export function classArticles(entry, catalog) {
  return {
    subclasses: sortEntries(catalog.subclasses.filter(({ class: name }) => name === entry.name)),
    spells: sortEntries(catalog.spells.filter(({ classes }) => classes?.includes(entry.id))),
  };
}

const columns = {
  Level: 'Nível',
  'Proficiency Bonus': 'Bônus de proficiência',
  Features: 'Características',
  'Class Features': 'Características',
  'Plans Known': 'Planos conhecidos',
  'Magic Items': 'Itens mágicos',
  Cantrips: 'Truques',
  'Prepared Spells': 'Magias preparadas',
  Rages: 'Fúrias',
  'Rage Damage': 'Dano da Fúria',
  'Weapon Mastery': 'Maestria com Armas',
  'Bardic Die': 'Dado de Inspiração',
  'Channel Divinity': 'Canalizar Divindade',
  'Wild Shape': 'Forma Selvagem',
  'Second Wind': 'Retomar o Fôlego',
  'Martial Arts': 'Artes Marciais',
  'Focus Points': 'Pontos de Foco',
  'Unarmored Movement': 'Movimento sem Armadura',
  'Favored Enemy': 'Inimigo Favorito',
  'Sneak Attack': 'Ataque Furtivo',
  'Sorcery Points': 'Pontos de Feitiçaria',
  'Eldritch Invocations': 'Invocações Místicas',
  'Spell Slots': 'Espaços de magia',
  'Slot Level': 'Círculo dos espaços',
};

export function classProgression(entry) {
  const names = new Map(entry.features?.map((feature) => [feature.name, displayName(feature)]));
  return (entry.progression ?? []).map(({ header, rows }) => ({
    columns: header.map(
      (name) => columns[name] ?? name.replace(/^(\d)(?:st|nd|rd|th)$/, '$1º círculo')
    ),
    rows: rows.map((row) =>
      row.map((value, index) =>
        /^(?:Class )?Features$/.test(header[index]) && typeof value === 'string'
          ? value
              .split(', ')
              .map((name) => names.get(name) ?? name)
              .join(', ')
          : value
      )
    ),
  }));
}
