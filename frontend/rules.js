import { damageTypeLabel, spellName } from './spells.js';

export const abilities = [
  ['str', 'Strength', 'Força'],
  ['dex', 'Dexterity', 'Destreza'],
  ['con', 'Constitution', 'Constituição'],
  ['int', 'Intelligence', 'Inteligência'],
  ['wis', 'Wisdom', 'Sabedoria'],
  ['cha', 'Charisma', 'Carisma'],
];
const skills = {
  Acrobatics: 'Acrobacia',
  'Animal Handling': 'Lidar com Animais',
  Arcana: 'Arcanismo',
  Athletics: 'Atletismo',
  Deception: 'Enganação',
  History: 'História',
  Insight: 'Intuição',
  Intimidation: 'Intimidação',
  Investigation: 'Investigação',
  Medicine: 'Medicina',
  Nature: 'Natureza',
  Perception: 'Percepção',
  Performance: 'Atuação',
  Persuasion: 'Persuasão',
  Religion: 'Religião',
  'Sleight of Hand': 'Prestidigitação',
  Stealth: 'Furtividade',
  Survival: 'Sobrevivência',
};

export const labels = {
  human: 'Humano',
  elf: 'Elfo',
  dwarf: 'Anão',
  dragonborn: 'Draconato',
  gnome: 'Gnomo',
  goliath: 'Golias',
  orc: 'Orc',
  aasimar: 'Aasimar',
  artificer: 'Artífice',
  barbarian: 'Bárbaro',
  bard: 'Bardo',
  cleric: 'Clérigo',
  druid: 'Druida',
  fighter: 'Guerreiro',
  monk: 'Monge',
  paladin: 'Paladino',
  ranger: 'Patrulheiro',
  rogue: 'Ladino',
  sorcerer: 'Feiticeiro',
  warlock: 'Bruxo',
  wizard: 'Mago',
  skillful: 'Habilidoso · Proficiência em perícia',
  versatile: 'Versátil · Talento de origem',
  skilled: 'Treinado',
  'magic-initiate': 'Iniciado em Magia',
  'druidic-warrior': 'Guerreiro Druídico',
  'blessed-warrior': 'Guerreiro Abençoado',
  Protector: 'Protetor',
  Thaumaturge: 'Taumaturgo',
  Warden: 'Guardião',
  Magician: 'Mago da Natureza',
  'Divine Strike': 'Golpe Divino',
  'Potent Spellcasting': 'Conjuração Potente',
  'Primal Strike': 'Golpe Primal',
};
export const skillName = (name) => skills[name] ?? name;
// Usos resumidos a partir da tabela de perícias das regras básicas de D&D 2024.
const skillUses = {
  Acrobatics: ['Destreza', 'Mantenha o equilíbrio em terreno instável ou faça uma acrobacia.'],
  'Animal Handling': ['Sabedoria', 'Acalme, conduza ou treine um animal.'],
  Arcana: ['Inteligência', 'Recorde conhecimentos sobre magia, artefatos e planos de existência.'],
  Athletics: ['Força', 'Supere obstáculos físicos, como uma correnteza ou um salto difícil.'],
  Deception: ['Carisma', 'Convença alguém de uma mentira ou sustente um disfarce.'],
  History: ['Inteligência', 'Recorde acontecimentos, povos e personagens do passado.'],
  Insight: ['Sabedoria', 'Interprete o comportamento e as intenções de alguém.'],
  Intimidation: ['Carisma', 'Use ameaças ou sua presença para pressionar alguém.'],
  Investigation: [
    'Inteligência',
    'Junte pistas, pesquise informações ou deduza como algo funciona.',
  ],
  Medicine: ['Sabedoria', 'Reconheça doenças ou investigue a causa de uma morte recente.'],
  Nature: [
    'Inteligência',
    'Identifique plantas e animais ou recorde informações sobre terrenos e clima.',
  ],
  Perception: ['Sabedoria', 'Use os sentidos para perceber algo discreto ou escondido.'],
  Performance: ['Carisma', 'Entretenha um público com atuação, música, dança ou histórias.'],
  Persuasion: ['Carisma', 'Convença alguém com argumentos e tato.'],
  Religion: ['Inteligência', 'Reconheça divindades, ritos e símbolos religiosos.'],
  'Sleight of Hand': ['Destreza', 'Manipule ou esconda um objeto pequeno sem chamar atenção.'],
  Stealth: ['Destreza', 'Mova-se em silêncio ou esconda-se para passar despercebido.'],
  Survival: ['Sabedoria', 'Siga rastros, encontre comida e evite perigos naturais.'],
};
export const displayName = (entry) =>
  entry.id?.startsWith('skill:')
    ? skillName(entry.name)
    : (labels[entry.id] ?? entry.translation?.name ?? entry.name);
export const abilityName = (name) =>
  abilities.find(([id, english]) => id === name || english === name)?.[2] ?? name;
export const armorName = (kind) =>
  ({ Light: 'Leves', Medium: 'Médias', Heavy: 'Pesadas', Shield: 'Escudos' })[kind] ?? kind;
export const creatureTypeName = (type) =>
  ({ Humanoid: 'Humanoide', Fey: 'Feérico', Construct: 'Constructo', Aberration: 'Aberração' })[type] ??
  type;
const sizeName = (size) => ({ Medium: 'Médio', Small: 'Pequeno' })[size] ?? size;
export const grantDetails = ({ label, value }, catalog) => {
  if (label === 'Damage Type') return ['Tipo de dano', damageTypeLabel(value)];
  if (label.startsWith('Level ')) {
    const spell = catalog.spells.find(({ name }) => name === value);
    return [label.replace('Level', 'Nível'), spell ? spellName(spell) : value];
  }
  return [label, value];
};
const byId = (entries) => new Map(entries.map((entry) => [entry.id, entry]));
const opt = (id, name = id, extra) => ({ id, name, ...extra });
const named = (names) => names.map((name) => opt(name));
const abi = (name) => abilities.find(([id, english]) => id === name || english === name)?.[0];
const rank = (rule) => rule.level ?? 1;
const skillOptions = (names) =>
  (names ?? Object.keys(skills)).map((name) => {
    const [ability, body] = skillUses[name] ?? [];
    return opt(`skill:${name}`, name, { ability, translation: { body } });
  });
const compare = (a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR');
export const pointCosts = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const pointBudget = 27;
export const standardScores = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

export const pointsSpent = (scores) =>
  Object.values(scores).reduce((total, score) => total + (pointCosts[score] ?? 0), 0);

export function canAdjustScore(scores, id, delta) {
  const current = scores[id];
  const next = current + delta;
  return (
    Object.hasOwn(pointCosts, next) &&
    (delta < 0 || pointsSpent(scores) - pointCosts[current] + pointCosts[next] <= pointBudget)
  );
}

export function rollAbilityScore(random = Math.random) {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(random() * 6));
  const discarded = Math.min(...dice);
  const score = dice.reduce((sum, die) => sum + die, 0) - discarded;
  return { dice, discarded, score };
}

const metamagic = named([
  'Careful Spell',
  'Distant Spell',
  'Empowered Spell',
  'Extended Spell',
  'Heightened Spell',
  'Quickened Spell',
  'Seeking Spell',
  'Subtle Spell',
  'Transmuted Spell',
  'Twinned Spell',
]);
// D&D 2024 Basic Rules, Character Classes → Eldritch Invocation Options.
const invocations = [
  ['Armor of Shadows', 1, null, 'mage-armor'],
  ['Ascendant Step', 5, null, 'levitate'],
  ['Devil’s Sight', 2],
  ['Devouring Blade', 12, 'Thirsting Blade'],
  ['Eldritch Mind', 1],
  ['Eldritch Smite', 5, 'Pact of the Blade'],
  ['Fiendish Vigor', 2, null, 'false-life'],
  ['Gaze of Two Minds', 5],
  ['Gift of the Depths', 5, null, 'water-breathing'],
  ['Gift of the Protectors', 9, 'Pact of the Tome'],
  ['Investment of the Chain Master', 5, 'Pact of the Chain'],
  ['Lifedrinker', 9, 'Pact of the Blade'],
  ['Mask of Many Faces', 2, null, 'disguise-self'],
  ['Master of Myriad Forms', 5, null, 'alter-self'],
  ['Misty Visions', 2, null, 'silent-image'],
  ['One with Shadows', 5, null, 'invisibility'],
  ['Otherworldly Leap', 2, null, 'jump'],
  ['Pact of the Blade', 1],
  ['Pact of the Chain', 1, null, 'find-familiar'],
  ['Pact of the Tome', 1],
  ['Thirsting Blade', 5, 'Pact of the Blade'],
  ['Visions of Distant Realms', 9, null, 'arcane-eye'],
  ['Whispers of the Grave', 7, null, 'speak-with-dead'],
  ['Witch Sight', 15],
];
const invocationCantrips = {
  'Agonizing Blast': [
    'chill-touch',
    'eldritch-blast',
    'mind-sliver',
    'poison-spray',
    'thunderclap',
    'toll-the-dead',
    'true-strike',
  ],
  'Eldritch Spear': ['eldritch-blast', 'mind-sliver', 'poison-spray', 'toll-the-dead'],
  'Repelling Blast': ['chill-touch', 'eldritch-blast', 'poison-spray'],
};
const cantripRequirements = {
  'Agonizing Blast': 'Um truque de Bruxo que cause dano',
  'Eldritch Spear': 'Um truque de Bruxo que cause dano e tenha alcance de pelo menos 10 pés',
  'Repelling Blast': 'Um truque de Bruxo que cause dano com uma jogada de ataque',
};
const spellChoiceNames = {
  'Blessed Warrior': 'Guerreiro Abençoado',
  'Druidic Warrior': 'Guerreiro Druídico',
  'Student of Arcana': 'Estudante de Arcanismo',
  'Primal Lore': 'Conhecimento Primal',
  'Aberrant Magic': 'Magia Aberrante',
  Cantrip: 'Truque',
  'Rote Casting:': 'Conjuração de Memória',
  'Signature Arcanum:': 'Arcano Característico',
  'Fey Cantrips': 'Truques Feéricos',
  'Fey Magic': 'Magia Feérica',
  'Additional Spells': 'Magias Adicionais',
  'Two Cantrips': 'Dois truques',
  'Level 1 Spell': 'Magia de 1º círculo',
  'Ritual Spells': 'Magias rituais',
  'Shadow Magic': 'Magia das Sombras',
  'Vampire Magic': 'Magia Vampírica',
};
const choiceNames = {
  ...spellChoiceNames,
  'Ability Score Increase': 'Aumento no Valor de Atributo',
  'Skill Proficiencies': 'Perícias',
  'Skill Proficiency': 'Proficiência em Perícia',
  'Ability Score Improvement': 'Aumento no Valor de Atributo',
  'Ativar equipamento': 'Equipamento inicial',
  'Deft Explorer': 'Explorador Hábil',
  'Bestial Instincts': 'Instintos Bestiais',
  'Changeling Instincts': 'Instintos do Cambiante',
  'Channelled Prowess': 'Proeza Canalizada',
  Entreat: 'Súplica',
  Enchanter: 'Encantador',
  'Epic Boon': 'Dádiva Épica',
  Expertise: 'Especialização',
  'Inherent Tongues': 'Idiomas Inatos',
  'Instrument Training': 'Treinamento com Instrumentos Musicais',
  'Keen Observer': 'Observador Aguçado',
  'Keen Senses': 'Sentidos Aguçados',
  'Knowledge from a Past Life': 'Conhecimento de uma Vida Passada',
  'Lore Knowledge': 'Conhecimento Erudito',
  'Natural Affinity': 'Afinidade Natural',
  'Origin Feat': 'Talento de Origem',
  Scholar: 'Erudito',
  'Second Mind': 'Segunda Mente',
  'Severed from Dreams': 'Separado dos Sonhos',
  'Skill Versatility': 'Versatilidade em Perícias',
  Skillful: 'Habilidoso',
  'Specialized Design': 'Projeto Especializado',
  "Thieves' Cant": 'Gíria de Ladrão',
  'Tool Proficiencies': 'Proficiências com Ferramentas',
  'Tool Proficiency': 'Proficiência com Ferramenta',
  Training: 'Treinamento',
  Versatile: 'Versátil',
  'Werewolf Instincts': 'Instintos de Lobisomem',
};
const weaponProficiencyNames = {
  'Simple weapons': 'Armas simples',
  'Simple and Martial weapons': 'Armas simples e marciais',
  'Simple weapons and Martial weapons that have the Light property':
    'Armas simples e armas marciais com a propriedade Leve',
  'Simple weapons and Martial weapons that have the Finesse or Light property':
    'Armas simples e armas marciais com a propriedade Acuidade ou Leve',
};
const prerequisiteFeatures = {
  Spellcasting: 'Conjuração',
  'Pact Magic': 'Magia de Pacto',
  'Fighting Style': 'Estilo de Combate',
  'Medium Armor Training': 'Treinamento com Armaduras Médias',
  'Heavy Armor Training': 'Treinamento com Armaduras Pesadas',
  'Light Armor Training': 'Treinamento com Armaduras Leves',
  'Martial Weapon Proficiency': 'Proficiência com Armas Marciais',
  'Shield Training': 'Treinamento com Escudos',
  'Weapon Mastery': 'Maestria em Arma',
};
const featCategories = { Dragonmark: 'Marca Dracônica', 'Planar Pact': 'Pacto Planar' };

export function prerequisiteText(entry, catalog) {
  const requirement = entry.prereq;
  if (!requirement?.all?.length) return requirement?.text;
  const terms = {
    ability: ({ ability, score }) => `${abilityName(ability)} ${score}+`,
    level: ({ level }) => `Nível ${level}+`,
    feature: ({ feature }) => prerequisiteFeatures[feature],
    feat: ({ feat }) => {
      const required = catalog.byFeat.get(feat);
      return required && displayName(required);
    },
    anyFeat: ({ category }) => `Um talento de ${featCategories[category]}`,
    only: ({ category }) => `Apenas para talentos de ${featCategories[category]}`,
    campaign: ({ setting }) => `Campanha em ${setting}`,
  };
  const groups = requirement.all.map((group) => group.map((term) => terms[term.kind]?.(term)));
  if (groups.some((group) => group.some((term) => !term))) return requirement.text;
  return groups
    .map((group) => group.length > 1 ? `(${group.join(' ou ')})` : group[0])
    .join(' e ');
}

export function indexCatalog(raw, localization, reference = {}) {
  const locale = localization && localization.revision === raw.revision ? localization : {};
  const localized = (entry, translation) => (translation ? { ...entry, translation } : entry);
  const localizedFeature = (entry, translation) => ({
    ...localized(entry, translation),
    ...(translation?.level ? { level: translation.level } : {}),
    options: entry.options?.map((option) => localized(option, translation?.options?.[option.id])),
  });
  const localizedSection = (section, translation) =>
    localized(
      { name: section.heading, body: section.body },
      translation?.sections?.[section.heading]
    );
  const warlockInvocationList = [
    ...invocations,
    ...Object.keys(invocationCantrips).map((name) => [name, 2]),
    ['Lessons of the First Ones', 2],
  ].map(([name, level, requires, spell]) => {
    const translation = locale.invocations?.[name];
    const requirements = [
      level > 1 && `Bruxo nível ${level}+`,
      requires && (locale.invocations?.[requires]?.name ?? requires),
      cantripRequirements[name],
    ].filter(Boolean);
    return opt(name, name, {
      level,
      requires,
      spell,
      translation,
      prereq: requirements.length ? { text: requirements.join(' · ') } : undefined,
    });
  });
  const publications = new Map(
    Object.entries(locale.spellPublications?.supplements ?? {}).flatMap(([book, ids]) =>
      ids.map((id) => [id, book])
    )
  );
  raw = {
    ...raw,
    spells: raw.spells.map((spell) =>
      localized(
        {
          ...spell,
          publication: spell.source ?? publications.get(spell.id) ?? locale.spellPublications?.core,
          references: [
            ...(reference.tableSpells ?? []).filter((table) => table.spell === spell.id),
            ...(reference.creatures ?? []).filter(
              (creature) =>
                creature.summonedBySpell?.toLowerCase() === spell.name.toLowerCase() ||
                spell.id === 'find-familiar' && creature.type === 'beast' && creature.cr === '0' ||
                (
                  {
                    'animate-dead': ['skeleton', 'zombie'],
                    'create-undead': ['ghoul', 'ghast', 'wight', 'mummy'],
                    'phantom-steed': ['riding-horse'],
                  }[spell.id] ?? []
                ).includes(creature.id)
            ),
          ],
          creatureReference: ['polymorph', 'true-polymorph', 'shapechange'].includes(spell.id),
        },
        locale.spells?.[spell.id]
      )
    ),
    feats: raw.feats.map((feat) => localized(feat, locale.feats?.[feat.id])),
    items: [...raw.items, ...(reference.extraItems ?? [])].map((item) =>
      localized(
        { ...item, source: item.source ?? 'Catálogo comum de equipamentos' },
        reference.items?.[item.id]
      )
    ),
    rules: (raw.rules ?? []).map((rule) => localized(rule, reference.rules?.[rule.id])),
    tools: raw.tools.map((tool) => localized(tool, reference.tools?.[tool.id])),
    languages: raw.languages.map((language) =>
      localized(language, reference.languages?.[language.id])
    ),
    glossary: (raw.glossary ?? []).map((entry) => localized(entry, reference.glossary?.[entry.id])),
    alignments: (raw.alignments ?? []).map((entry) =>
      localized(entry, reference.alignments?.[entry.id])
    ),
    content: raw.content.map((entry) => {
      const contentTranslation = locale.content?.[entry.id];
      const styleName = entry.collection === 'fighting-styles' && locale.feats?.[entry.id]?.name;
      const translation = styleName
        ? { name: styleName, ...contentTranslation }
        : contentTranslation;
      const features = entry.features?.map((feature, index) =>
        localizedFeature(feature, {
          ...translation?.features?.[index],
          ...reference.features?.[entry.id]?.[feature.name],
        })
      );
      const sections = [];
      for (const section of entry.sections ?? []) {
        const match = /^level (\d+): (.+)$/i.exec(section.heading);
        if (match && features && entry.featureLevels?.includes(Number(match[1]))) {
          const [, level, name] = match;
          if (!features.some((feature) => feature.name === name)) {
            features.push(
              localizedFeature(
                { name, level: Number(level), body: section.body },
                translation?.sections?.[section.heading]
              )
            );
          }
          continue;
        }
        const sectionEntry = localizedSection(section, {
          sections: { ...reference.sections?.[entry.id], ...translation?.sections },
        });
        const feature =
          features?.find(({ name }) => name.toLowerCase() === section.heading.toLowerCase()) ??
          features?.find(({ body }) => body?.includes(section.heading));
        if (feature && section.body.includes('| ---')) {
          if (!feature.translation?.statBlocks?.length) {
            feature.references = [...(feature.references ?? []), sectionEntry];
          }
        } else {
          sections.push(sectionEntry);
        }
      }
      if (entry.id === 'warlock') {
        const feature = features?.find(({ name }) => name === 'Eldritch Invocations');
        if (feature) {
          feature.invocations = warlockInvocationList;
          const table = entry.progression?.find(({ header }) =>
            header.includes('Eldritch Invocations')
          );
          if (table) {
            const column = table.header.indexOf('Eldritch Invocations');
            feature.tables = [
              {
                columns: ['Nível de Bruxo', 'Invocações conhecidas'],
                rows: table.rows
                  .filter((row, index) => !index || row[column] !== table.rows[index - 1][column])
                  .map((row) => [row[0], row[column]]),
              },
            ];
          }
        }
      }
      if (entry.id === 'vestige-patron') {
        const companion = features?.find(({ name }) => name === 'Vestige Companion');
        const referenceCompanion = reference.creatures?.find(({ id }) => id === 'vestige-companion');
        if (companion && referenceCompanion) {
          companion.references = [referenceCompanion];
          companion.translation = { ...companion.translation, statBlocks: [] };
        }
        const feature = features?.find(({ name }) => name === 'Vestige Spells');
        if (feature) {
          feature.references = [
            'life-domain',
            'light-domain',
            'trickery-domain',
            'war-domain',
          ].flatMap((id) => {
            const domain = raw.content.find((item) => item.id === id);
            return (domain?.sections ?? [])
              .filter(({ heading }) => heading.endsWith('Domain Spells'))
              .map((section) => localizedSection(section, locale.content?.[id]));
          });
        }
      }
      if (entry.id === 'necromancer') {
        const feature = features?.find(({ name }) => name === 'Necromancy Spellbook');
        if (feature) feature.references = (reference.creatures ?? [])
          .filter(({ id }) => ['skeleton', 'zombie'].includes(id));
      }
      return {
        ...entry,
        translation,
        traits: entry.traits?.map((trait, index) =>
          localizedFeature(trait, translation?.traits?.[index])
        ),
        features,
        sections,
        choices: entry.choices
          ?.map((rule, index) => {
            const choice = translation?.choices?.[index];
            return {
              ...localized(rule, choice),
              options: rule.options?.map((option, position) =>
                localized(option, choice?.options?.[position])
              ),
            };
          })
          .filter((rule) => !(entry.id === 'circle-of-the-land' && rule.id === 'spell-list')),
      };
    }),
  };
  const collection = (name) =>
    raw.content.filter((entry) => entry.collection === name).sort(compare);
  return {
    ...raw,
    warlockInvocationList,
    creatures: reference.creatures ?? [],
    referenceOptions: reference.options ?? [],
    tableSpells: reference.tableSpells ?? [],
    referenceSource: reference.source,
    slotTable: reference.slotTable,
    species: collection('species'),
    classes: collection('classes'),
    backgrounds: collection('backgrounds'),
    subclasses: collection('subclasses'),
    styles: collection('fighting-styles'),
    byContent: byId(raw.content),
    byFeat: byId(raw.feats),
    bySpell: byId(raw.spells),
    contentNames: new Map(raw.content.map((entry) => [entry.name, displayName(entry)])),
    byItem: byId(raw.items),
    byTool: byId(raw.tools),
    byLanguage: byId(raw.languages),
    glossary: raw.glossary ?? [],
    alignments: raw.alignments ?? [],
  };
}

export function newCharacter(id) {
  return {
    id,
    name: '',
    species: '',
    background: '',
    class: '',
    level: 1,
    campaign: '',
    method: 'array',
    scores: { ...standardScores },
    selected: {},
    featureNotes: {},
    notes: '',
    saved: false,
  };
}

export function classPlan(draft) {
  return (
    draft.classPlan ??
    Array.from(
      { length: Math.min(20, Math.max(1, Number(draft.level) || 1)) },
      () => draft.class || ''
    )
  );
}

export function plannedClasses(draft, catalog) {
  const classes = new Map();
  for (const [index, id] of classPlan(draft).entries()) {
    const entry = catalog.byContent.get(id);
    if (entry?.collection !== 'classes') continue;
    if (!classes.has(id)) classes.set(id, { entry, levels: [] });
    classes.get(id).levels.push(index + 1);
  }
  return [...classes.values()];
}

export function availableSpellChoices(group, spells) {
  if (!group?.spellPicker || group.existingSpell) return group;
  const known = new Set(spells.map(({ id }) => id));
  return {
    ...group,
    options: group.options.filter(({ id }) => group.selected.includes(id) || !known.has(id)),
  };
}

// Starting proficiencies from SRD 5.2 and Eberron: Forge of the Artificer.
const multiclassArmor = {
  artificer: ['Leves', 'Médias', 'Escudos'],
  barbarian: ['Escudos'],
  bard: ['Leves'],
  cleric: ['Leves', 'Médias', 'Escudos'],
  druid: ['Leves', 'Escudos'],
  fighter: ['Leves', 'Médias', 'Escudos'],
  paladin: ['Leves', 'Médias', 'Escudos'],
  ranger: ['Leves', 'Médias', 'Escudos'],
  rogue: ['Leves'],
  warlock: ['Leves'],
};
const martialMulticlass = new Set(['barbarian', 'fighter', 'paladin', 'ranger']);
const multiclassAbilities = {
  artificer: [['int']],
  barbarian: [['str']],
  bard: [['cha']],
  cleric: [['wis']],
  druid: [['wis']],
  fighter: [['str', 'dex']],
  monk: [['dex'], ['wis']],
  paladin: [['str'], ['cha']],
  ranger: [['dex'], ['wis']],
  rogue: [['dex']],
  sorcerer: [['cha']],
  warlock: [['cha']],
  wizard: [['int']],
};

export function unmetMulticlassRequirements(classes, scores) {
  if (classes.length < 2) return [];
  return classes.flatMap(({ entry }) => {
    const missing = multiclassAbilities[entry.id]
      .filter((options) => !options.some((id) => scores[id] >= 13))
      .map((options) => options.map((id) => abilities.find(([key]) => key === id)[2]).join(' ou '));
    return missing.length ? [`${displayName(entry)} precisa de 13 em ${missing.join(' e ')}`] : [];
  });
}

function increases(keys, points, perAbility) {
  const options = [];
  function visit(start, remaining, values) {
    if (!remaining) {
      const entries = Object.entries(values);
      options.push(
        opt(
          entries.map(([key, n]) => `${key}:${n}`).join(','),
          entries.map(([key, n]) => `+${n} ${abilities.find(([id]) => id === key)[2]}`).join(' · '),
          { increases: values }
        )
      );
      return;
    }
    for (let i = start; i < keys.length; i++) {
      const key = keys[i];
      const next = (values[key] ?? 0) + 1;
      if (next <= perAbility) visit(i, remaining - 1, { ...values, [key]: next });
    }
  }
  visit(0, points, {});
  return options;
}

function featAllowed(feat, level, context, scores, features, taken) {
  const checks = {
    level: (rule) => level >= rule.level,
    campaign: (rule) => context.campaign === rule.setting,
    ability: (rule) => scores[abi(rule.ability)] >= rule.score,
    feature: (rule) => (features.get(rule.feature.toLowerCase()) ?? Infinity) <= level,
    feat: (rule) => taken.has(rule.feat),
    anyFeat: (rule) => [...taken.values()].some((entry) => entry.category === rule.category),
    only: (rule) =>
      ![...taken.values()].some(
        (entry) => entry.category === rule.category && entry.id !== feat.id
      ),
  };
  return (feat.prereq?.all ?? []).every((alternatives) =>
    alternatives.some((rule) => checks[rule.kind]?.(rule))
  );
}

export function projectCharacter(draft, catalog) {
  let projection = projectCharacterPass(draft, catalog);
  const passes = Math.min(13, projection.classes.length);
  for (let pass = 1; pass < passes; pass++) {
    const next = projectCharacterPass(draft, catalog, projection.scoreGrants, projection.feats);
    if (
      JSON.stringify([
        next.scoreGrants,
        next.feats.map(({ id, acquiredAt }) => [id, acquiredAt]),
      ]) ===
      JSON.stringify([
        projection.scoreGrants,
        projection.feats.map(({ id, acquiredAt }) => [id, acquiredAt]),
      ])
    )
      return next;
    projection = next;
  }
  return projection;
}

function projectCharacterPass(draft, catalog, priorGrants, priorFeats) {
  const species = catalog.byContent.get(draft.species);
  const background = catalog.byContent.get(draft.background);
  const totalLevel = classPlan(draft).length;
  const classes = plannedClasses(draft, catalog).map(({ entry, levels }) => {
    const id = draft.selected[`class/${entry.id}/subclass`]?.[0];
    const subclass =
      levels.length >= entry.subclassLevel
        ? catalog.subclasses.find((item) => item.id === id && item.class === entry.name)
        : undefined;
    return { entry, levels, subclass };
  });
  const sections = [
    ...[species, background].filter(Boolean).map((entry) => ({ entry })),
    ...classes.flatMap((track) => [
      { entry: track.entry, track },
      ...(track.subclass ? [{ entry: track.subclass, track }] : []),
    ]),
  ];
  const result = {
    species,
    background,
    classes,
    cls: classes[0]?.entry,
    subclass: classes[0]?.subclass,
    groups: [],
    features: [],
    facts: [],
    spells: [],
    equipment: [],
    scores: { ...draft.scores },
    skills: new Set(),
    expertise: new Set(),
    tools: new Set(),
    languages: new Set(),
    feats: [],
    pending: [],
    ruleIssues: [],
    validSelections: {},
    selectedFeatures: [],
    initiateLists: new Set(),
    armorTraining: new Set(),
    weaponTraining: [],
    resistances: new Set(),
    spellbooks: new Map(),
    scoreGrants: [],
    featOptions: new Map(),
    savingThrows: new Set(classes[0]?.entry.savingThrows?.map(abi).filter(Boolean)),
  };
  const featureNames = new Map();
  const takenFeats = new Map();
  const seenSpells = new Set();
  const grantedSpells = new Set();
  const savingThrowLevels = new Map([...result.savingThrows].map((id) => [id, 1]));
  const savingThrowChoices = [];
  const warlockCantripsByLevel = new Map();
  const expertiseChoices = [];
  let level = totalLevel;
  const active = (entry) => rank(entry) <= level;
  const characterLevel = (meta, at) => meta.track?.levels[at - 1] ?? at;
  const weaponTraining = classes.flatMap(({ entry, levels }) => {
    if (levels[0] === 1) return entry.weaponTraining ?? [];
    return martialMulticlass.has(entry.id) ? [{ category: 'Martial' }] : [];
  });
  for (const { entry, track } of sections) {
    const entryLevel = track?.levels.length ?? totalLevel;
    const reserveSpells = (spells) => {
      for (const spell of spells ?? [])
        if (rank(spell) <= entryLevel) grantedSpells.add(spell.id);
    };
    reserveSpells(
      entry.spellsFixed?.filter(({ id }) => entry.id !== 'illusionist' || id !== 'minor-illusion')
    );
    if (entry.id === 'arcane-trickster') grantedSpells.add('mage-hand');
    for (const feat of entry.featsFixed ?? [])
      if (rank(feat) <= entryLevel) reserveSpells(catalog.byFeat.get(feat.id)?.effects?.spellsFixed);
    for (const feature of (entry.features ?? []).filter((item) => rank(item) <= entryLevel)) {
      const name = feature.name.toLowerCase();
      const at = track?.levels[rank(feature) - 1] ?? rank(feature);
      featureNames.set(name, Math.min(featureNames.get(name) ?? Infinity, at));
    }
    if (entry.id !== 'arcane-archer')
      for (const skill of entry.skillsFixed ?? []) result.skills.add(skill);
  }
  for (const { entry, track } of sections) {
    for (const fixed of (entry.featsFixed ?? []).filter(
      (item) => rank(item) <= (track?.levels.length ?? totalLevel)
    )) {
      const feat = catalog.byFeat.get(fixed.id);
      if (feat) {
        const classLevel =
          entry.collection === 'subclasses'
            ? Math.max(rank(fixed), track?.entry.subclassLevel ?? 1)
            : rank(fixed);
        const acquiredAt = track?.levels[classLevel - 1] ?? classLevel;
        takenFeats.set(feat.id, {
          ...feat,
          acquiredAt: Math.min(acquiredAt, takenFeats.get(feat.id)?.acquiredAt ?? Infinity),
        });
      }
    }
  }
  for (const language of catalog.languages.filter((entry) => entry.always))
    result.languages.add(language.id);
  const addFacts = (source, entries) => {
    for (const [name, value] of entries) if (value) result.facts.push({ source, name, value });
  };
  const noteSpell = (id, grantedBy, metadata = {}) => {
    const spell = catalog.bySpell.get(id);
    const key = `${metadata.originKey ?? grantedBy}/${id}`;
    if (!spell || seenSpells.has(key)) return;
    seenSpells.add(key);
    result.spells.push({ ...spell, grantedBy, ...metadata });
  };
  const group = (key, name, count, options, meta, apply) => {
    if (!(count > 0)) return;
    const alreadyAvailable =
      meta.spellPicker && !meta.existingSpell
        ? new Set([...grantedSpells, ...result.spells.map(({ id }) => id)])
        : undefined;
    const unique = [...byId(options).values()].filter(({ id }) => !alreadyAvailable?.has(id));
    const ids = new Set(unique.map(({ id }) => id));
    const selected = [...new Set(draft.selected[key] ?? meta.legacySelected ?? [])]
      .filter((id) => ids.has(id))
      .slice(0, count);
    result.validSelections[key] = selected;
    result.groups.push({
      ...meta,
      characterLevel: characterLevel(meta, meta.level),
      key,
      name: labels[meta.ruleId] ?? choiceNames[name] ?? catalog.contentNames.get(name) ?? name,
      count,
      options: unique,
      selected,
    });
    if (!meta.optional && selected.length < count) result.pending.push(key);
    for (const id of selected)
      apply?.(
        unique.find((option) => option.id === id),
        `${key}/${id}`
      );
  };
  const learnedOptions = (key, name, options, additions, meta, canReplace) => {
    const known = new Map();
    for (let at = 1; at <= level; at++) {
      const count = additions[at] ?? 0;
      const previous = [...known.values()];
      const available = () => options.filter(({ id }) => !known.has(id));
      const learn = (option) => known.set(option.id, { ...option, source: meta.source, level: at });
      group(`${key}/${at}`, name, count, available(), { ...meta, level: at }, learn);
      if (!canReplace(at, count) || !previous.length || !available().length) continue;
      group(
        `${key}/${at}/replace`,
        'Substituir uma opção aprendida',
        1,
        previous,
        { ...meta, level: at, optional: true },
        (old, childKey) =>
          group(
            `${childKey}/replacement`,
            'Nova opção no lugar da anterior',
            1,
            available(),
            { ...meta, level: at, depth: meta.depth + 1 },
            (option) => {
              known.delete(old.id);
              learn(option);
            }
          )
      );
    }
    result.selectedFeatures.push(...known.values());
    return [...known.values()];
  };
  const spellOptions = (rule) =>
    catalog.spells
      .filter(
        (spell) =>
          (rule.spellLevel == null || spell.level === rule.spellLevel) &&
          (rule.maxSpellLevel == null || spell.level <= rule.maxSpellLevel) &&
          (rule.minSpellLevel == null || spell.level >= rule.minSpellLevel) &&
          (!rule.from || rule.from.includes(spell.id)) &&
          (!rule.exclude || !rule.exclude.includes(spell.id)) &&
          (!rule.list || spell.classes?.includes(rule.list)) &&
          (!rule.lists?.length || rule.lists.some((list) => spell.classes?.includes(list))) &&
          (!rule.schools?.length ||
            rule.schools.some((school) => school.toLowerCase() === spell.school?.toLowerCase())) &&
          (rule.ritual == null || Boolean(spell.ritual) === rule.ritual)
      )
      .map((spell) => opt(spell.id, displayName(spell)));
  const spellChoices = (rules, key, meta) => {
    for (const rule of (rules ?? []).filter(active)) {
      group(
        `${key}/spell/${rule.id}`,
        spellChoiceNames[rule.name] ??
          rule.name.replace(/^Mystic Arcanum \(level (\d+)\)$/, 'Arcano Místico ($1º círculo)'),
        rule.pickProficiency ? 2 + Math.floor((totalLevel - 1) / 4) : rule.pick,
        spellOptions(rule),
        {
          ...meta,
          level: Math.max(meta.level, rank(rule)),
          spellPicker: true,
          existingSpell: rule.id === 'class-prepared' && key === 'class/wizard',
        },
        (option) =>
          noteSpell(option.id, meta.source, {
            castingAbility: rule.ability ?? meta.castingAbility,
            preparation: rule.preparation ?? (rule.spellLevel === 0 ? 'cantrip' : 'always'),
            free: rule.id.startsWith('mystic-arcanum-') ? { uses: 1, per: 'long' } : rule.free,
            freeOnly: rule.id.startsWith('mystic-arcanum-'),
            ritualOnly: rule.ritualOnly,
            originKey: key,
          })
      );
    }
  };
  const toolOptions = (groups, includeSkills, upgrades = false) => [
    ...catalog.tools
      .filter(
        (tool) =>
          (!groups?.length || groups.includes(tool.group)) &&
          (upgrades || !result.tools.has(tool.id))
      )
      .map((tool) => ({ ...tool, id: `tool:${tool.id}` })),
    ...(includeSkills ? skillOptions().filter((option) => !result.skills.has(option.name)) : []),
  ];
  const toolOrSkill = (option) => {
    if (option.id.startsWith('skill:')) result.skills.add(option.name);
    else result.tools.add(option.id.slice(5));
  };
  const languages = (rare) =>
    catalog.languages.filter(
      (entry) => !result.languages.has(entry.id) && (rare || entry.tier === 'common')
    );
  const boost = (key, rule, meta, options) => {
    const acquiredAt = characterLevel(meta, Math.max(meta.level, rank(rule)));
    const scoresBefore = Object.fromEntries(
      abilities.map(([id]) => [
        id,
        Number(draft.scores[id]) +
          (priorGrants ?? result.scoreGrants)
            .filter((grant) => grant.id === id && grant.level <= acquiredAt && grant.key !== key)
            .reduce((total, grant) => total + grant.amount, 0),
      ])
    );
    const candidates =
      options ??
      increases(
        (rule.from ?? abilities.map(([id]) => id)).map(abi).filter(Boolean),
        rule.points,
        rule.perAbility ?? 1
      );
    group(
      key,
      rule.name,
      1,
      candidates.filter((option) =>
        Object.entries(option.increases).every(
          ([id, points]) =>
            scoresBefore[id] + points <= (rule.max ?? 20) &&
            (!rule.savingThrow || !result.savingThrows.has(id))
        )
      ),
      meta,
      (option) => {
        for (const [id, amount] of Object.entries(option.increases)) {
          result.scores[id] = Number(result.scores[id]) + amount;
          result.scoreGrants.push({
            id,
            amount,
            level: acquiredAt,
            key,
          });
          if (rule.savingThrow) {
            result.savingThrows.add(id);
            savingThrowLevels.set(id, Math.min(savingThrowLevels.get(id) ?? Infinity, acquiredAt));
          }
        }
      }
    );
  };

  function applyFeat(feat, key, meta, listConstraint) {
    if (!feat) return;
    const acquiredAt = characterLevel(meta, meta.level);
    takenFeats.set(feat.id, { ...feat, acquiredAt });
    result.feats.push({ ...feat, source: meta.source, grantKey: key, acquiredAt });
    const child = { ...meta, source: displayName(feat), depth: meta.depth + 1 };
    if (feat.id === 'magic-initiate') {
      const lists = listConstraint ? [listConstraint] : ['cleric', 'druid', 'wizard'];
      const configurations = lists.flatMap((list) =>
        abilities
          .slice(3)
          .map(([ability, , name]) =>
            opt(`${list}:${ability}`, `${labels[list]} · ${name}`, { list, ability })
          )
      );
      group(
        `${key}/magic-initiate`,
        'Lista e atributo de conjuração',
        1,
        configurations.filter((option) => !result.initiateLists.has(option.list)),
        child,
        (option, subkey) => {
          result.initiateLists.add(option.list);
          spellChoices(
            (feat.effects?.spellChoices ?? []).map((rule) => ({
              ...rule,
              list: option.list,
              ...(rule.spellLevel === 1 ? { free: { uses: 1, per: 'long' } } : {}),
            })),
            subkey,
            { ...child, castingAbility: option.ability, depth: child.depth + 1 }
          );
        }
      );
    } else {
      const abilitySentence = feat.text?.match(/([^.!?]*?)\bis your spellcasting ability/i)?.[1];
      const castingAbilities = [
        ...new Set(
          (abilitySentence?.match(/Intelligence|Wisdom|Charisma|Constitution/g) ?? []).map(abi)
        ),
      ];
      if (castingAbilities.length > 1) {
        group(
          `${key}/casting-ability`,
          'Atributo de conjuração do talento',
          1,
          abilities
            .filter(([id]) => castingAbilities.includes(id))
            .map(([id, , name]) => opt(id, name)),
          child,
          ({ id }, childKey) =>
            effects(feat.effects ?? {}, childKey, { ...child, castingAbility: id })
        );
      } else {
        effects(feat.effects ?? {}, key, {
          ...child,
          castingAbility: castingAbilities[0] ?? child.castingAbility,
        });
      }
    }
    const damageOptions = {
      'elemental-adept': ['Acid', 'Cold', 'Fire', 'Lightning', 'Thunder'],
      'otherworldly-familiar': ['Necrotic', 'Poison', 'Psychic', 'Radiant', 'Thunder'],
    }[feat.id];
    if (damageOptions) {
      const used = result.featOptions.get(feat.id) ?? new Set();
      group(
        `${key}/damage-type`,
        feat.id === 'elemental-adept' ? 'Maestria em Energia' : 'Resistência do familiar',
        1,
        damageOptions
          .filter((id) => !used.has(id))
          .map((id) =>
            opt(
              id,
              {
                Acid: 'Ácido',
                Cold: 'Frio',
                Fire: 'Fogo',
                Lightning: 'Elétrico',
                Thunder: 'Trovejante',
                Necrotic: 'Necrótico',
                Poison: 'Veneno',
                Psychic: 'Psíquico',
                Radiant: 'Radiante',
              }[id]
            )
          ),
        child,
        (option) => {
          used.add(option.id);
          result.featOptions.set(feat.id, used);
          addFacts(displayName(feat), [['Tipo de dano escolhido', option.name]]);
        }
      );
    }
    if (/ability (?:you )?increase(?:d)? (?:by|with) this feat/i.test(feat.text ?? '')) {
      const increase = result.groups.find(
        (group) => group.key.startsWith(key + '/boost/') && group.selected.length
      );
      const option = increase?.options.find(({ id }) => increase.selected.includes(id));
      const ability = Object.keys(option?.increases ?? {})[0];
      if (ability)
        for (const spell of result.spells.filter(({ originKey }) => originKey === key))
          spell.castingAbility = ability;
    }
  }

  function effects(entry, key, meta) {
    for (const armor of entry.armorTraining ?? []) result.armorTraining.add(armor.kind);
    for (const weapon of entry.weaponTraining ?? []) result.weaponTraining.push(weapon);
    for (const { label, value } of entry.grants ?? []) {
      addFacts(meta.source, [grantDetails({ label, value }, catalog)]);
      if (label === 'Damage Type' && species?.id === 'dragonborn') result.resistances.add(value);
    }
    if (entry.body || entry.translation?.body || entry.summary || entry.translation?.summary) {
      if (!entry.collection && !entry.features)
        result.selectedFeatures.push({ ...entry, source: meta.source });
    }
    for (const skill of entry.skillsFixed ?? []) result.skills.add(skill);
    for (const skill of entry.expertiseFixed ?? []) result.expertise.add(skill);
    for (const value of entry.toolsFixed ?? []) result.tools.add(value);
    for (const value of entry.languagesFixed ?? []) {
      result.languages.add(catalog.languages.find(({ name }) => name === value)?.id ?? value);
    }
    for (const spell of (entry.spellsFixed ?? []).filter(active)) {
      if (entry.id === 'necromancer' && spell.id === 'find-familiar') continue;
      if (
        entry.id === 'illusionist' && spell.id === 'minor-illusion' &&
        result.spells.some(({ id }) => id === spell.id)
      ) continue;
      noteSpell(spell.id, meta.source, {
        preparation: catalog.bySpell.get(spell.id)?.level === 0 ? 'cantrip' : 'always',
        castingAbility: meta.castingAbility,
        free: spell.free,
        originKey: key,
      });
    }
    for (const rule of (entry.skillChoices ?? []).filter(active)) {
      if (rule.upgrade) continue;
      const options = skillOptions(rule.from).filter((option) => !result.skills.has(option.name));
      group(
        `${key}/skill/${rule.id}`,
        rule.name,
        rule.pick,
        options,
        { ...meta, ruleId: rule.id, level: Math.max(meta.level, rank(rule)) },
        toolOrSkill
      );
    }
    for (const rule of [
      ...(entry.expertise ?? []),
      ...(entry.skillChoices ?? []).filter((item) => item.upgrade),
    ].filter(active)) {
      expertiseChoices.push({ rule, key, meta });
    }
    for (const rule of (entry.toolChoices ?? []).filter(active)) {
      group(
        `${key}/tool/${rule.id}`,
        rule.name,
        rule.pick,
        toolOptions([rule.group].flat().filter(Boolean), rule.skills),
        { ...meta, level: Math.max(meta.level, rank(rule)) },
        toolOrSkill
      );
    }
    for (const rule of (entry.languageChoices ?? []).filter(active)) {
      group(
        `${key}/language/${rule.id}`,
        rule.name,
        rule.pick,
        languages(rule.rare),
        { ...meta, level: Math.max(meta.level, rank(rule)) },
        (option) => result.languages.add(option.id)
      );
    }
    for (const rule of (entry.abilityBoosts ?? []).filter(active))
      boost(`${key}/boost/${rule.id}`, rule, meta);
    spellChoices(
      entry.id === 'college-of-the-moon'
        ? entry.spellChoices?.filter(({ id }) => id !== 'primal-lore')
        : entry.spellChoices,
      key,
      meta
    );
    for (const fixed of (entry.featsFixed ?? []).filter(active)) {
      const list = fixed.note?.toLowerCase();
      applyFeat(
        catalog.byFeat.get(fixed.id),
        `${key}/fixed-feat/${fixed.id}`,
        meta,
        ['cleric', 'druid', 'wizard'].includes(list) ? list : undefined
      );
    }
    for (const rule of (entry.featChoices ?? []).filter(active)) {
      const acquiredAt = characterLevel(meta, Math.max(meta.level, rank(rule)));
      const eligibleFeats = new Map(
        [
          ...takenFeats,
          ...(priorFeats ?? [])
            .filter((feat) => !feat.grantKey.startsWith(`${key}/feat/${rule.id}/`))
            .map((feat) => [feat.id, feat]),
        ].filter(([, feat]) => feat.acquiredAt <= acquiredAt)
      );
      const options = catalog.feats
        .filter(
          (feat) =>
            (!takenFeats.has(feat.id) || feat.repeatable) &&
            (!rule.category ||
              feat.category === rule.category ||
              rule.include?.includes(feat.id)) &&
            (!rule.suggestCategory ||
              feat.category === rule.suggestCategory ||
              feat.category === 'General') &&
            featAllowed(
              feat,
              characterLevel(meta, Math.max(meta.level, rank(rule))),
              { campaign: draft.campaign || background?.setting },
              Object.fromEntries(
                abilities.map(([id]) => [
                  id,
                  Number(draft.scores[id]) +
                    (priorGrants ?? result.scoreGrants)
                      .filter(
                        (grant) =>
                          grant.id === id &&
                          grant.level <= characterLevel(meta, Math.max(meta.level, rank(rule))) &&
                          !grant.key?.startsWith(`${key}/feat/${rule.id}/`)
                      )
                      .reduce((total, grant) => total + grant.amount, 0),
                ])
              ),
              featureNames,
              eligibleFeats
            )
        )
        .sort(compare);
      group(
        `${key}/feat/${rule.id}`,
        rule.name,
        rule.pick,
        options,
        { ...meta, ruleId: rule.id, level: Math.max(meta.level, rank(rule)) },
        (feat, subkey) =>
          applyFeat(feat, subkey, { ...meta, level: Math.max(meta.level, rank(rule)) })
      );
    }
    for (const rule of (entry.choices ?? []).filter(active)) {
      let options = [
        ...(rule.options ?? []),
        ...(rule.source?.collection === 'fighting-styles'
          ? catalog.styles.filter((style) => !takenFeats.has(style.id))
          : []),
      ];
      const archerCantrip = entry.id === 'arcane-archer' && rule.id === 'spell-list';
      if (archerCantrip) {
        options = options.filter(
          (option) => !result.spells.some(({ id }) => id === option.id) && !grantedSpells.has(option.id)
        );
        if (!options.length) continue;
      }
      group(
        `${key}/choice/${rule.id}`,
        rule.translation?.name ?? rule.name,
        rule.pick ?? 1,
        options,
        {
          ...meta,
          level: Math.max(meta.level, rank(rule)),
          prompt: rule.translation?.prompt ?? rule.prompt,
          spellPicker: archerCantrip,
        },
        (option, subkey) => {
          const child = {
            ...meta,
            source: displayName(option),
            level: Math.max(meta.level, rank(rule)),
            depth: meta.depth + 1,
            castingAbility: archerCantrip ? 'int' : meta.castingAbility,
          };
          const style =
            option.collection === 'fighting-styles' ? catalog.byFeat.get(option.id) : undefined;
          if (style) applyFeat(style, subkey, child);
          else effects(option, subkey, child);
          if (option.equipment) {
            result.equipment.push({ ...option.equipment, source: meta.source });
            for (const [i, tool] of (option.equipment.toolGroups ?? []).entries()) {
              group(
                `${subkey}/equipment-tool/${i}`,
                'Ferramenta inicial',
                1,
                catalog.tools.filter((item) => tool.groups?.includes(item.group)),
                child,
                (selected) =>
                  result.equipment.push({ items: [{ id: selected.id }], source: child.source })
              );
            }
          }
          if (
            entry.collection === 'species' &&
            option.spellsFixed?.length &&
            ['elf', 'gnome', 'tiefling'].includes(entry.id)
          ) {
            group(
              `${subkey}/casting-ability`,
              'Atributo de conjuração',
              1,
              abilities.slice(3).map(([id, , name]) => opt(id, name)),
              child,
              (selected) => {
                addFacts(child.source, [['Conjuração', selected.name]]);
                for (const spell of result.spells.filter(
                  ({ grantedBy }) => grantedBy === child.source
                ))
                  spell.castingAbility = selected.id;
              }
            );
          }
        }
      );
    }
  }

  function evolvingCantrips(key, rule, counts, meta, onLevel) {
    const firstKey = `${key}/spell/${rule.id}`;
    const legacy = draft.selected[firstKey] ?? [];
    const migrated = new Set();
    const known = new Set();
    const candidates = spellOptions(rule);
    for (let at = 1; at <= level; at++) {
      const previous = [...known].map((id) => catalog.bySpell.get(id));
      const before = counts[at - 2] ?? 0;
      const increase = (counts[at - 1] ?? 0) - before;
      const available = () => candidates.filter(({ id }) => !known.has(id));
      group(
        before ? `${firstKey}/${at}` : firstKey,
        spellChoiceNames[rule.name] ?? rule.name,
        increase,
        available(),
        {
          ...meta,
          level: at,
          spellPicker: true,
          legacySelected: legacy.filter((id) => !migrated.has(id) && !known.has(id)),
        },
        ({ id }) => {
          known.add(id);
          migrated.add(id);
        }
      );
      if (previous.length)
        group(
          `${key}/${rule.id === 'class-cantrips' ? 'replace-cantrip' : 'replace-' + rule.id}/${at}`,
          'Substituir um truque neste nível',
          1,
          previous,
          { ...meta, level: at, spellPicker: true, existingSpell: true, optional: true },
          (old, childKey) =>
            group(
              `${childKey}/replacement`,
              'Novo truque no lugar do anterior',
              1,
              available(),
              { ...meta, level: at, spellPicker: true, depth: meta.depth + 1 },
              ({ id }) => {
                known.delete(old.id);
                known.add(id);
              }
            )
        );
      onLevel?.(at, known);
    }
    for (const id of known)
      noteSpell(id, meta.source, {
        castingAbility: meta.castingAbility,
        preparation: 'cantrip',
        originKey: key,
      });
  }

  function classSpells(entry, key, meta) {
    const casting = entry.casting;
    if (!casting) return;
    const cantrips = casting.cantrips?.[level - 1] ?? 0;
    const prepared = casting.prepared?.[level - 1] ?? 0;
    const maxSpellLevel = casting.maxSpellLevel?.[level - 1];
    const cantripRule = {
      id: 'class-cantrips',
      name: 'Truques da classe',
      pick: cantrips,
      list: casting.list,
      spellLevel: 0,
    };
    const swapsOnLevel = [
      'bard', 'cleric', 'druid', 'sorcerer', 'warlock',
      'arcane-trickster', 'eldritch-knight', 'warrior-of-the-mystic-arts',
    ].includes(entry.id);
    if (entry.id === 'arcane-trickster')
      noteSpell('mage-hand', meta.source, {
        castingAbility: meta.castingAbility,
        preparation: 'cantrip',
        originKey: key,
      });
    if (cantrips && swapsOnLevel) {
      evolvingCantrips(
        key,
        cantripRule,
        casting.cantrips,
        meta,
        entry.id === 'warlock' ? (at, known) => warlockCantripsByLevel.set(at, [...known]) : undefined
      );
    } else spellChoices([cantripRule], key, meta);
    if (!maxSpellLevel) return;
    const spellRule = {
      ...(entry.id === 'bard' && level >= 10
        ? { lists: ['bard', 'cleric', 'druid', 'wizard'] }
        : { list: casting.list }),
      minSpellLevel: 1,
      maxSpellLevel,
      ability: abi(casting.ability),
      preparation: 'prepared',
    };
    const preparedRule = {
      ...spellRule,
      id: 'class-prepared',
      name: 'Magias preparadas',
      pick: prepared,
      exclude: [...(entry.spellsFixed ?? []), ...(meta.track?.subclass?.spellsFixed ?? [])]
        .filter(({ level: at = 1 }) => at <= level)
        .map(({ id }) => id),
    };
    if (entry.id !== 'wizard') {
      if (['bard', 'ranger', 'sorcerer', 'warlock'].includes(entry.id)) {
        const known = new Set();
        const legacy = draft.selected[`${key}/spell/class-prepared`] ?? [];
        for (let at = 1; at <= level; at++) {
          const capacity = casting.prepared[at - 1] ?? 0;
          const increase = capacity - (casting.prepared[at - 2] ?? 0);
          const rule = {
            ...(entry.id === 'bard' && at >= 10
              ? { lists: ['bard', 'cleric', 'druid', 'wizard'] }
              : { list: casting.list }),
            minSpellLevel: 1,
            maxSpellLevel: casting.maxSpellLevel[at - 1],
          };
          if (!rule.maxSpellLevel) continue;
          const options = spellOptions(rule).filter(({ id }) => !known.has(id));
          group(
            `${key}/learned-spells/${at}`,
            'Magias aprendidas',
            increase,
            options,
            {
              ...meta,
              level: at,
              spellPicker: true,
              legacySelected: legacy
                .filter((id) => options.some((option) => option.id === id))
                .slice(0, increase),
            },
            ({ id }) => known.add(id)
          );
          if (at <= 1) continue;
          group(
            `${key}/replace-spell/${at}`,
            'Substituir uma magia neste nível',
            1,
            [...known].map((id) => ({ ...catalog.bySpell.get(id), id })),
            { ...meta, level: at, spellPicker: true, existingSpell: true, optional: true },
            (old, childKey) => {
              group(
                `${childKey}/replacement`,
                'Nova magia no lugar da anterior',
                1,
                spellOptions(rule).filter(({ id }) => !known.has(id)),
                { ...meta, level: at, spellPicker: true, depth: meta.depth + 1 },
                ({ id }) => {
                  known.delete(old.id);
                  known.add(id);
                }
              );
            }
          );
        }
        for (const id of known)
          noteSpell(id, meta.source, {
            preparation: 'prepared',
            castingAbility: abi(casting.ability),
          });
      } else {
        spellChoices([preparedRule], key, meta);
      }
      return;
    }
    const book = [];
    const savant = meta.track?.subclass?.features?.find(({ name }) => name.endsWith(' Savant'));
    for (let at = 1; at <= level; at++) {
      const rule = { ...spellRule, maxSpellLevel: casting.maxSpellLevel[at - 1] };
      group(
        `${key}/spellbook/${at}`,
        'Magias do grimório',
        at === 1 ? 6 : 2,
        spellOptions(rule).filter((option) => !book.includes(option.id)),
        { ...meta, level: at, spellPicker: true },
        (option) => {
          book.push(option.id);
          noteSpell(option.id, `Grimório · ${meta.source}`, {
            preparation: 'spellbook',
            castingAbility: abi(casting.ability),
          });
        }
      );
      if (
        at === 3 &&
        meta.track?.subclass?.id === 'necromancer' &&
        !book.includes('find-familiar')
      ) {
        book.push('find-familiar');
        noteSpell('find-familiar', `Grimório · ${meta.source}`, {
          preparation: 'spellbook',
          castingAbility: 'int',
        });
      }
      if (savant && [3, 5, 7, 9, 11, 13, 15, 17].includes(at)) {
        const school = savant.name.replace(' Savant', '');
        group(
          `${key}/savant/${at}`,
          displayName(savant),
          at === 3 ? 2 : 1,
          spellOptions({
            list: 'wizard',
            minSpellLevel: 1,
            maxSpellLevel: casting.maxSpellLevel[at - 1],
            schools: [school],
          }).filter(({ id }) => !book.includes(id)),
          { ...meta, level: at, spellPicker: true },
          ({ id }) => {
            book.push(id);
            noteSpell(id, `Grimório · ${meta.source}`, {
              preparation: 'spellbook',
              castingAbility: 'int',
            });
          }
        );
      }
    }
    group(
      `${key}/spellbook/copied`,
      'Magias copiadas no grimório',
      catalog.spells.length,
      spellOptions(spellRule).filter(({ id }) => !book.includes(id)),
      { ...meta, level, spellPicker: true, optional: true },
      ({ id }) => {
        book.push(id);
        noteSpell(id, `Grimório · ${meta.source}`, {
          preparation: 'spellbook',
          castingAbility: 'int',
        });
      }
    );
    const signature = [];
    if (level >= 20) {
      group(
        `${key}/signature-spells`,
        'Magias Características',
        2,
        spellOptions({ from: book, spellLevel: 3 }),
        { ...meta, level: 20, spellPicker: true, existingSpell: true },
        ({ id }) => {
          signature.push(id);
          noteSpell(id, 'Magias Características', {
            preparation: 'always',
            castingAbility: 'int',
            free: { uses: 1, per: 'short' },
          });
        }
      );
    }
    result.spellbooks.set(entry.id, book);
    spellChoices(
      [{ ...preparedRule, from: book.filter((id) => !signature.includes(id)), level }],
      key,
      meta
    );
  }

  // Core options described in class features but absent from the catalog's choice arrays.
  function warlockInvocations(entry, key, meta) {
    const table = entry.progression?.find(({ header }) => header.includes('Eldritch Invocations'));
    if (!table) return;
    const column = table.header.indexOf('Eldritch Invocations');
    const known = new Map();
    const optionsAt = (at, retired) => {
      const options = catalog.warlockInvocationList.filter(
        ({ id, level: minimum, requires }) =>
          !invocationCantrips[id] &&
          id !== 'Lessons of the First Ones' &&
          at >= minimum &&
          !known.has(id) &&
          (!requires || (requires !== retired && known.has(requires)))
      );
      if (at >= 2) {
        for (const [name, cantrips] of Object.entries(invocationCantrips)) {
          const reference = catalog.warlockInvocationList.find(({ id }) => id === name);
          for (const id of warlockCantripsByLevel.get(at) ?? []) {
            if (!cantrips.includes(id)) continue;
            const spell = catalog.bySpell.get(id);
            const label = `${name} · ${spell.name}`;
            if (!known.has(label)) {
              options.push({
                ...reference,
                id: label,
                name: label,
                cantripId: id,
                translation: {
                  ...reference.translation,
                  name: `${displayName(reference)} · ${displayName(catalog.bySpell.get(spell.id) ?? spell)}`,
                },
              });
            }
          }
        }
        const lessons = catalog.warlockInvocationList.find(
          ({ id }) => id === 'Lessons of the First Ones'
        );
        for (const feat of catalog.feats.filter(
          (feat) =>
            feat.category === 'Origin' &&
            !takenFeats.has(feat.id) &&
            !known.has(`lessons:${feat.id}`) &&
            featAllowed(
              feat,
              characterLevel(meta, at),
              { campaign: draft.campaign || background?.setting },
              result.scores,
              featureNames,
              takenFeats
            )
        )) {
          options.push({
            ...lessons,
            id: `lessons:${feat.id}`,
            name: `Lessons of the First Ones · ${displayName(feat)}`,
            feat,
            translation: {
              ...lessons.translation,
              name: `${displayName(lessons)} · ${displayName(feat)}`,
            },
          });
        }
      }
      return options;
    };
    for (let at = 1; at <= level; at++) {
      const previous = [...known.values()].map(({ option }) => option);
      const countBefore = Number(table.rows[at - 2]?.[column] ?? 0);
      const count = Number(table.rows[at - 1]?.[column]);
      const learn = (option, childKey) => known.set(option.id, { option, childKey, at });
      for (let index = countBefore + 1; index <= count; index++)
        group(
          `${key}/invocation/${index}`,
          `Invocação mística · ${index}`,
          1,
          optionsAt(at),
          { ...meta, level: at },
          learn
        );
      const replaceable = previous.filter(
        ({ id }) =>
          ![...known.values()].some(({ option }) => option.requires === id) &&
          optionsAt(at, id).length
      );
      if (!replaceable.length) continue;
      group(
        `${key}/replace-invocation/${at}`,
        'Substituir uma invocação neste nível',
        1,
        replaceable,
        { ...meta, level: at, optional: true },
        (old, childKey) =>
          group(
            `${childKey}/replacement`,
            'Nova invocação no lugar da anterior',
            1,
            optionsAt(at, old.id),
            { ...meta, level: at, depth: meta.depth + 1 },
            (option, replacementKey) => {
              known.delete(old.id);
              learn(option, replacementKey);
            }
          )
      );
    }
    const cantrips = warlockCantripsByLevel.get(level) ?? [];
    for (const { option, childKey, at } of known.values()) {
      if (option.cantripId && !cantrips.includes(option.cantripId)) {
        result.ruleIssues.push([
          meta.section,
          `Substitua ${displayName(option)} ou mantenha o truque exigido por ela.`,
        ]);
        continue;
      }
      const source = displayName(option);
      result.selectedFeatures.push({ ...option, source: meta.source, level: at });
      const child = { ...meta, level: at, source, depth: meta.depth + 1 };
      if (option.spell)
        noteSpell(option.spell, source, {
          castingAbility: 'cha',
          preparation: 'always',
          ...(option.id === 'Pact of the Chain' ? { ritualOnly: true } : {}),
          ...(option.id === 'Gift of the Depths' ? { free: { uses: 1, per: 'long' }, freeOnly: true } : {}),
          ...(!['Pact of the Chain', 'Gift of the Depths'].includes(option.id) ? { atWill: true } : {}),
        });
      if (option.feat) applyFeat(option.feat, childKey, child);
      if (option.id === 'Pact of the Tome')
        spellChoices(
          [
            { id: 'tome-cantrips', name: 'Truques do pacto', pick: 3, spellLevel: 0 },
            { id: 'tome-rituals', name: 'Rituais do pacto', pick: 2, spellLevel: 1, ritual: true, ritualOnly: true },
          ],
          childKey,
          child
        );
    }
    addFacts(meta.source, [
      ['Invocações místicas', [...known.values()].map(({ option }) => displayName(option)).join(', ')],
    ]);
  }

  function coreClassChoices(entry, key, meta) {
    if (entry.id === 'warlock') warlockInvocations(entry, key, meta);
    if (entry.id === 'artificer' && level >= 2) {
      const feature = entry.features.find(({ name }) => name === 'Replicate Magic Item');
      const normalize = (name) =>
        name
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, '')
          .split(' ')
          .filter(Boolean)
          .sort()
          .join(' ');
      const plans = new Map();
      const pattern =
        /\*\*Magic Item Plans \(Artificer Level (\d+)\+\)\.\*\*\s*\n\n([\s\S]*?)(?=\n\n\*\*|$)/g;
      for (const match of feature.body.matchAll(pattern)) {
        const minimum = Number(match[1]);
        if (minimum > level) continue;
        for (const row of match[2].split('\n').slice(2)) {
          const name = row.split('|')[1]?.trim();
          if (!name) continue;
          const flexible = /^(Common|Uncommon|Rare) /i.exec(name);
          const candidates = catalog.items.filter((item) =>
            flexible
              ? item.magic &&
                item.rarity === flexible[1].toLowerCase() &&
                !['potion', 'scroll'].includes(item.kind) &&
                !/\bcurse(?:d)?[.:]/i.test(item.text ?? '') &&
                (flexible[1] === 'Common' || item.kind === 'wondrous')
              : normalize(item.name) === normalize(name.replace('Adaption', 'Adaptation'))
          );
          for (const item of candidates) {
            plans.set(item.id, { ...item, level: minimum, plan: true });
          }
        }
      }
      const progression = entry.progression.find(({ header }) => header.includes('Plans Known'));
      const count = Number(progression.rows[level - 1][progression.header.indexOf('Plans Known')]);
      group(
        `${key}/plans`,
        'Planos de itens mágicos conhecidos',
        count,
        [...plans.values()].sort(compare),
        { ...meta, level: 2 },
        (plan, childKey) => {
          result.selectedFeatures.push({ ...plan, source: 'Plano conhecido' });
          if (plan.baseItems?.length) {
            group(
              `${childKey}/base-item`,
              'Tipo de item do plano',
              1,
              catalog.items.filter((item) => plan.baseItems.includes(item.name)),
              { ...meta, source: displayName(plan), depth: meta.depth + 1, level: plan.level },
              (item) => addFacts(displayName(plan), [['Item do plano', displayName(item)]])
            );
          }
        }
      );
    }
    const order = {
      cleric: {
        title: 'Ordem divina',
        martial: 'Protector',
        caster: 'Thaumaturge',
        armor: 'Pesada',
        skill: 'Arcanismo ou Religião',
      },
      druid: {
        title: 'Ordem primal',
        martial: 'Warden',
        caster: 'Magician',
        armor: 'Média',
        skill: 'Arcanismo ou Natureza',
      },
    }[entry.id];
    if (order) {
      group(
        `${key}/order`,
        order.title,
        1,
        named([order.martial, order.caster]),
        meta,
        (option, childKey) => {
          const source = displayName(option);
          const child = { ...meta, source, depth: meta.depth + 1 };
          if (option.id === order.martial) {
            addFacts(source, [
              ['Treinamento adicional', `Armas marciais · Armadura ${order.armor.toLowerCase()}`],
            ]);
          } else {
            addFacts(source, [['Bônus de Sabedoria', order.skill]]);
            const known = new Set(
              result.spells
                .filter((spell) => spell.level === 0 && spell.grantedBy === meta.source)
                .map(({ id }) => id)
            );
            const options = spellOptions({ list: entry.id, spellLevel: 0 }).filter(
              ({ id }) => !known.has(id)
            );
            group(
              `${childKey}/cantrip`,
              'Truque adicional',
              1,
              options,
              { ...child, spellPicker: true },
              (spell) =>
                noteSpell(spell.id, source, {
                  castingAbility: abi(entry.casting.ability),
                  preparation: 'cantrip',
                })
            );
          }
        }
      );
    }
    if (entry.id === 'cleric' && level >= 7) {
      group(
        `${key}/blessed-strikes`,
        'Golpes abençoados',
        1,
        named(['Divine Strike', 'Potent Spellcasting']),
        { ...meta, level: 7 },
        (option) => addFacts(meta.source, [['Golpes abençoados', displayName(option)]])
      );
    }
    if (entry.id === 'druid' && level >= 7) {
      group(
        `${key}/elemental-fury`,
        'Fúria elemental',
        1,
        named(['Potent Spellcasting', 'Primal Strike']),
        { ...meta, level: 7 },
        (option) => addFacts(meta.source, [['Fúria elemental', displayName(option)]])
      );
    }
    if (entry.id === 'sorcerer') {
      const known = learnedOptions(
        `${key}/metamagic`,
        'Metamagia',
        metamagic.map((option) => catalog.referenceOptions.find(({ id }) => id === option.id) ?? option),
        { 2: 2, 10: 2, 17: 2 },
        meta,
        (at) => at > 2
      );
      addFacts(meta.source, [['Metamagias', known.map(displayName).join(', ')]]);
    }
  }

  function subclassChoices(entry, key, meta) {
    const save = {
      'gloom-stalker': { level: 7, ability: 'wis', alternatives: ['int', 'cha'] },
      'knowledge-domain': { level: 6, ability: 'int', alternatives: abilities.map(([id]) => id) },
    }[entry.id];
    if (save && level >= save.level)
      savingThrowChoices.push({ key, meta: { ...meta, level: save.level }, ...save });
    if (entry.id === 'knowledge-domain') {
      group(
        `${key}/knowledge-skills`,
        'Bênçãos do Conhecimento',
        2,
        skillOptions(['Arcana', 'History', 'Nature', 'Religion']).filter(
          ({ name }) => !result.expertise.has(name)
        ),
        { ...meta, level: 3 },
        ({ name }) => {
          result.skills.add(name);
          result.expertise.add(name);
        }
      );
    }
    if (entry.id === 'college-of-the-moon') {
      const primalLore = entry.spellChoices?.find(({ id }) => id === 'primal-lore');
      if (primalLore)
        evolvingCantrips(key, primalLore, Array.from({ length: level }, (_, i) => (i >= 2 ? 1 : 0)), meta);
      result.languages.add('Druídico');
      group(
        `${key}/primal-lore-skill`,
        'Perícia do Conhecimento Primal',
        1,
        skillOptions([
          'Animal Handling',
          'Insight',
          'Medicine',
          'Nature',
          'Perception',
          'Survival',
        ]).filter(({ name }) => !result.skills.has(name)),
        { ...meta, level: 3 },
        ({ name }) => result.skills.add(name)
      );
    }
    if (entry.id === 'college-of-lore' && level >= 6) {
      const known = new Set();
      const casting = meta.track.entry.casting;
      const available = (at) => ({
        lists: ['cleric', 'druid', 'wizard'],
        maxSpellLevel: casting.maxSpellLevel[at - 1],
      });
      group(
        `${key}/magical-discoveries`,
        'Descobertas Mágicas',
        2,
        spellOptions(available(6)),
        { ...meta, level: 6, spellPicker: true },
        ({ id }) => known.add(id)
      );
      for (let at = 7; at <= level; at++) {
        group(
          `${key}/replace-discovery/${at}`,
          'Substituir uma Descoberta Mágica',
          1,
          [...known].map((id) => catalog.bySpell.get(id)),
          { ...meta, level: at, optional: true, spellPicker: true, existingSpell: true },
          (old, childKey) =>
            group(
              `${childKey}/replacement`,
              'Nova Descoberta Mágica',
              1,
              spellOptions(available(at)).filter(({ id }) => !known.has(id)),
              { ...meta, level: at, spellPicker: true, depth: meta.depth + 1 },
              ({ id }) => {
                known.delete(old.id);
                known.add(id);
              }
            )
        );
      }
      for (const id of known)
        noteSpell(id, meta.source, {
          preparation: 'always',
          castingAbility: 'cha',
          originKey: key,
        });
    }
    if (entry.id === 'illusionist') {
      const known = result.spells.some(({ id }) => id === 'minor-illusion');
      if (known) {
        group(
          `${key}/illusion-cantrip`,
          'Truque adicional de Ilusões Aprimoradas',
          1,
          spellOptions({ list: 'wizard', spellLevel: 0 }).filter(
            ({ id }) => !result.spells.some((spell) => spell.id === id)
          ),
          { ...meta, level: 3, spellPicker: true },
          ({ id }) => noteSpell(id, meta.source, { preparation: 'cantrip', castingAbility: 'int' })
        );
      }
    }
    const descriptor = {
      'battle-master': {
        feature: 'Maneuver Options',
        levels: [3, 7, 10, 15],
        initial: 3,
        later: 2,
        title: 'Manobras conhecidas',
      },
      'arcane-archer': {
        feature: 'Arcane Shot Options',
        levels: [3, 7, 10, 15, 18],
        initial: 2,
        later: 1,
        title: 'Disparos Arcanos conhecidos',
      },
    }[entry.id];
    if (descriptor) {
      if (entry.id === 'arcane-archer') {
        const duplicateSkills = (entry.skillsFixed ?? []).filter((skill) => result.skills.has(skill));
        for (const skill of entry.skillsFixed ?? []) result.skills.add(skill);
        group(
          `${key}/lore-skills`,
          'Perícias do Conhecimento do Arqueiro Arcano',
          duplicateSkills.length,
          skillOptions(meta.track.entry.skillChoices?.[0]?.from).filter(
            ({ name }) => !result.skills.has(name)
          ),
          { ...meta, level: 3 },
          toolOrSkill
        );
      }
      const section =
        entry.sections?.find(({ name }) => name === descriptor.feature) ??
        entry.features?.find(({ name }) => name === descriptor.feature);
      // Sections attached to their feature remain available under references.
      const original =
        section?.body ??
        entry.features
          ?.flatMap((feature) => feature.references ?? [])
          .find(({ name }) => name === descriptor.feature)?.body;
      const names = [...(original ?? '').matchAll(/\*\*([^*]+?)\.\*\*/g)].map((match) => match[1]);
      learnedOptions(
        `${key}/learned-options`,
        descriptor.title,
        names.map((name) => catalog.referenceOptions.find(({ id }) => id === name) ?? opt(name)),
        Object.fromEntries(descriptor.levels.map((at) => [at, at === 3 ? descriptor.initial : descriptor.later])),
        meta,
        (at, count) => at > 3 && count > 0
      );
    }
    if (entry.id === 'draconic-sorcery' && level >= 6) {
      group(
        `${key}/elemental-affinity`,
        'Afinidade Elemental',
        1,
        [
          ['Acid', 'Ácido'],
          ['Cold', 'Frio'],
          ['Fire', 'Fogo'],
          ['Lightning', 'Elétrico'],
          ['Poison', 'Veneno'],
        ].map(([id, name]) => opt(id, name)),
        { ...meta, level: 6 },
        ({ id, name }) => {
          result.resistances.add(id);
          addFacts(meta.source, [['Afinidade Elemental', name]]);
        }
      );
    }
  }

  if (background?.abilityScores?.length === 3) {
    const keys = background.abilityScores.map(abi).filter(Boolean);
    if (keys.length === 3) {
      const options = increases(keys, 3, 2);
      boost(
        `background/${background.id}/boost`,
        { name: 'Aumentos do antecedente', max: 20 },
        { section: 'origem', source: displayName(background), level: 1, depth: 0 },
        options
      );
    }
  }
  for (const { entry, track } of sections) {
    const cls = track?.entry;
    const subclass = track?.subclass;
    level = track?.levels.length ?? totalLevel;
    const classEntry = entry === cls || entry === subclass;
    const section = classEntry ? 'progressao' : 'origem';
    const prefix =
      entry === cls
        ? 'class'
        : entry === subclass
          ? 'subclass'
          : entry === species
            ? 'species'
            : 'background';
    const source = displayName(entry);
    const meta = {
      section,
      source,
      track,
      level: entry === subclass ? cls.subclassLevel : 1,
      depth: 0,
      castingAbility: abi((entry.casting ?? cls?.casting)?.ability),
    };
    const key = `${prefix}/${entry.id}`;
    const indexedFeatures = [...(entry.traits ?? []), ...(entry.features ?? [])]
      .map((feature, index) => ({ feature, index }))
      .sort((a, b) => rank(a.feature) - rank(b.feature));
    for (const { index, feature } of indexedFeatures) {
      if (active(feature))
        result.features.push({
          ...feature,
          source,
          section,
          level: rank(feature),
          key: `${key}/feature/${index}`,
        });
    }
    if (entry === species) {
      if (entry.id === 'reborn') {
        group(
          `${key}/strange-endurance`,
          'Tipo de dano da Resistência Incomum',
          1,
          ['Cold', 'Necrotic', 'Poison'].map((type) => opt(type, damageTypeLabel(type))),
          meta,
          ({ id }) => result.resistances.add(id)
        );
      }
      const spellcasting = (entry.traits ?? []).map(({ body }) => body).join(' ');
      if (entry.id === 'aasimar') meta.castingAbility = 'cha';
      if (
        !['elf', 'gnome', 'tiefling'].includes(entry.id) &&
        /Intelligence, Wisdom, or Charisma is your spellcasting ability/.test(spellcasting)
      ) {
        group(
          `${key}/casting-ability`,
          'Atributo de conjuração da espécie',
          1,
          abilities.slice(3).map(([id, , name]) => opt(id, name)),
          meta,
          ({ id }) => {
            meta.castingAbility = id;
          }
        );
      }
      if (entry.size?.length > 1) {
        group(
          `${key}/size`,
          'Tamanho',
          1,
          entry.size.map((size) => opt(size, sizeName(size))),
          meta,
          (option) => addFacts(source, [['Tamanho', option.name]])
        );
      } else addFacts(source, [['Tamanho', entry.size?.map(sizeName).join(', ')]]);
      addFacts(source, [
        ['Deslocamento base', entry.speed && `${entry.speed} pés`],
        ['Tipo de criatura', creatureTypeName(entry.creatureType)],
      ]);
    }
    if (entry === cls) {
      const initial = track.levels[0] === 1;
      addFacts(source, [
        ['Dado de vida', cls.hitDie],
        ['Testes de resistência proficientes', initial && cls.savingThrows?.map(abilityName).join(', ')],
        [
          'Armas',
          initial
            ? weaponProficiencyNames[cls.weaponProficiencies] ?? cls.weaponProficiencies
            : martialMulticlass.has(cls.id) && 'Armas marciais',
        ],
        [
          'Armaduras',
          initial
            ? cls.armorTraining?.map(({ kind }) => armorName(kind)).join(', ')
            : multiclassArmor[cls.id]?.join(', '),
        ],
      ]);
      if (level >= cls.subclassLevel) {
        group(
          `${key}/subclass`,
          'Subclasse',
          1,
          catalog.subclasses.filter((item) => item.class === cls.name),
          { ...meta, level: cls.subclassLevel }
        );
      }
      const mastery = cls.progression?.find(({ header }) => header.includes('Weapon Mastery'));
      if (mastery || ['rogue', 'ranger', 'paladin'].includes(cls.id)) {
        const count = mastery
          ? Number(mastery.rows[level - 1]?.[mastery.header.indexOf('Weapon Mastery')])
          : 2;
        group(
          `${key}/mastery`,
          'Maestria com armas',
          count,
          catalog.items
            .filter(
              (item) =>
                item.weapon?.mastery &&
                weaponTraining.some(
                  (training) =>
                    training.item === item.id ||
                    (training.category === item.weapon.category &&
                      (!training.with?.length ||
                        training.with.some((property) =>
                          item.weapon.properties?.includes(property.toLowerCase())
                        )))
                )
            )
            .map((item) => ({ ...item, name: `${item.name} · ${item.mastery}` })),
          meta
        );
      }
    }
    if (classEntry) classSpells(entry, key, meta);
    if (entry === cls) coreClassChoices(entry, key, meta);
    if (entry === subclass) subclassChoices(entry, key, meta);
    if (entry === cls && track.levels[0] !== 1) {
      const skill = ['artificer', 'bard', 'ranger', 'rogue'].includes(cls.id)
        ? [
            {
              id: 'multiclass-training',
              name: 'Perícia de multiclasse',
              pick: 1,
              from: cls.id === 'bard' ? undefined : cls.skillChoices?.[0]?.from,
            },
          ]
        : [];
      effects(
        {
          ...entry,
          armorTraining: [],
          weaponTraining: [],
          skillsFixed: [],
          skillChoices: [...skill, ...(entry.skillChoices ?? []).filter((rule) => rank(rule) > 1)],
          toolsFixed: { artificer: ['tinkers-tools'], rogue: ['thieves-tools'] }[cls.id] ?? [],
          toolChoices: [
            ...(cls.id === 'bard'
              ? [
                  {
                    id: 'multiclass-instrument',
                    name: 'Instrumento musical',
                    pick: 1,
                    group: 'instrument',
                  },
                ]
              : []),
            ...(entry.toolChoices ?? []).filter((rule) => rank(rule) > 1),
          ],
          choices: entry.choices?.filter(
            (choice) => !choice.options?.some((option) => option.equipment)
          ),
        },
        key,
        meta
      );
    } else effects(entry, key, meta);
  }
  const characterMeta = { section: 'origem', source: 'Personagem', level: 1, depth: 0 };
  group(
    'character/languages',
    'Idiomas iniciais',
    catalog.languagePick,
    languages(false),
    characterMeta,
    (option) => result.languages.add(option.id)
  );

  for (const { rule, key, meta } of expertiseChoices) {
    group(
      `${key}/expertise/${rule.id}`,
      rule.name,
      rule.pick,
      skillOptions(rule.from).filter(
        (option) =>
          (rule.upgrade || result.skills.has(option.name)) && !result.expertise.has(option.name)
      ),
      { ...meta, level: Math.max(meta.level, rank(rule)) },
      (option) => {
        if (rule.upgrade && !result.skills.has(option.name)) result.skills.add(option.name);
        else result.expertise.add(option.name);
      }
    );
  }
  for (const { entry, levels } of classes) {
    const proficiency = {
      monk: { level: 14, saves: abilities.map(([id]) => id) },
      rogue: { level: 15, saves: ['wis', 'cha'] },
    }[entry.id];
    const at = proficiency && levels[proficiency.level - 1];
    if (!at) continue;
    for (const id of proficiency.saves) {
      result.savingThrows.add(id);
      savingThrowLevels.set(id, Math.min(savingThrowLevels.get(id) ?? Infinity, at));
    }
  }
  const savingThrowLevel = ({ meta }) => characterLevel(meta, meta.level);
  for (const choice of savingThrowChoices.sort((a, b) => savingThrowLevel(a) - savingThrowLevel(b))) {
    const { key, meta, ability, alternatives } = choice;
    const at = savingThrowLevel(choice);
    const alreadyProficient = (id) => (savingThrowLevels.get(id) ?? Infinity) <= at;
    const grant = (id) => {
      result.savingThrows.add(id);
      savingThrowLevels.set(id, at);
    };
    if (!alreadyProficient(ability)) {
      grant(ability);
      continue;
    }
    const options = alternatives.filter((id) => !alreadyProficient(id));
    if (options.length)
      group(
        `${key}/saving-throw`,
        'Proficiência em teste de resistência',
        1,
        options.map((id) => opt(id, abilityName(id))),
        meta,
        ({ id }) => grant(id)
      );
  }
  for (const { entry, levels } of classes) {
    if (levels.length < 20) continue;
    const keys = { barbarian: ['str', 'con'], monk: ['dex', 'wis'] }[entry.id] ?? [];
    for (const id of keys) result.scores[id] = Math.min(25, result.scores[id] + 4);
  }
  return result;
}

export function progressionRequirements(draft, projection) {
  const requirements = [];
  for (const track of projection.classes.slice(1)) {
    const at = track.levels[0];
    const scores = Object.fromEntries(
      abilities.map(([id]) => [
        id,
        Number(draft.scores[id]) +
          projection.scoreGrants
            .filter((grant) => grant.id === id && grant.level < at)
            .reduce((total, grant) => total + grant.amount, 0),
      ])
    );
    const classes = projection.classes.filter(({ levels }) => levels[0] <= at);
    for (const requirement of unmetMulticlassRequirements(classes, scores))
      requirements.push(`Nível ${at} · ${requirement}`);
  }
  return requirements;
}
