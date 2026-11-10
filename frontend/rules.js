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
  skilled: 'Treinado (Skilled)',
  'magic-initiate': 'Iniciado em Magia (Magic Initiate)',
  'druidic-warrior': 'Guerreiro Druídico (Druidic Warrior)',
  'blessed-warrior': 'Guerreiro Abençoado (Blessed Warrior)',
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
  'Skill Proficiencies': 'Perícias',
  'Ability Score Improvement': 'Aumento no Valor de Atributo',
  'Ativar equipamento': 'Equipamento inicial',
  'Deft Explorer': 'Explorador Hábil',
};

export function indexCatalog(raw, localization) {
  const locale = localization && localization.revision === raw.revision ? localization : {};
  const localized = (entry, translation) => (translation ? { ...entry, translation } : entry);
  const localizedFeature = (entry, translation) => ({
    ...localized(entry, translation),
    ...(translation?.level ? { level: translation.level } : {}),
    options: entry.options?.map((option) => localized(option, translation?.options?.[option.id])),
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
        },
        locale.spells?.[spell.id]
      )
    ),
    feats: raw.feats.map((feat) => localized(feat, locale.feats?.[feat.id])),
    content: raw.content.map((entry) => {
      const translation = locale.content?.[entry.id];
      if (!translation) return entry;
      return {
        ...entry,
        translation,
        traits: entry.traits?.map((trait, index) =>
          localizedFeature(trait, translation.traits?.[index])
        ),
        features: entry.features?.map((feature, index) =>
          localizedFeature(feature, translation.features?.[index])
        ),
        choices: entry.choices?.map((rule, index) => {
          const choice = translation.choices?.[index];
          return {
            ...localized(rule, choice),
            options: rule.options?.map((option, position) =>
              localized(option, choice?.options?.[position])
            ),
          };
        }),
      };
    }),
  };
  const collection = (name) =>
    raw.content.filter((entry) => entry.collection === name).sort(compare);
  return {
    ...raw,
    species: collection('species'),
    classes: collection('classes'),
    backgrounds: collection('backgrounds'),
    subclasses: collection('subclasses'),
    styles: collection('fighting-styles'),
    byContent: byId(raw.content),
    byFeat: byId(raw.feats),
    bySpell: byId(raw.spells),
    byItem: byId(raw.items),
    byTool: byId(raw.tools),
    byLanguage: byId(raw.languages),
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
    validSelections: {},
  };
  const featureNames = new Map();
  const takenFeats = new Map();
  const seenSpells = new Set();
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
    for (const feature of (entry.features ?? []).filter((item) => rank(item) <= entryLevel)) {
      const name = feature.name.toLowerCase();
      const at = track?.levels[rank(feature) - 1] ?? rank(feature);
      featureNames.set(name, Math.min(featureNames.get(name) ?? Infinity, at));
    }
    for (const skill of entry.skillsFixed ?? []) result.skills.add(skill);
  }
  for (const { entry, track } of sections) {
    for (const fixed of (entry.featsFixed ?? []).filter(
      (item) => rank(item) <= (track?.levels.length ?? totalLevel)
    )) {
      const feat = catalog.byFeat.get(fixed.id);
      if (feat) takenFeats.set(feat.id, feat);
    }
  }
  for (const language of catalog.languages.filter((entry) => entry.always))
    result.languages.add(language.id);
  const addFacts = (source, entries) => {
    for (const [name, value] of entries) if (value) result.facts.push({ source, name, value });
  };
  const noteSpell = (id, grantedBy) => {
    const spell = catalog.bySpell.get(id);
    const key = `${grantedBy}/${id}`;
    if (!spell || seenSpells.has(key)) return;
    seenSpells.add(key);
    result.spells.push({ ...spell, grantedBy });
  };
  const group = (key, name, count, options, meta, apply) => {
    if (!(count > 0)) return;
    const unique = [...byId(options).values()];
    const ids = new Set(unique.map(({ id }) => id));
    const selected = [...new Set(draft.selected[key] ?? [])]
      .filter((id) => ids.has(id))
      .slice(0, count);
    result.validSelections[key] = selected;
    result.groups.push({
      ...meta,
      characterLevel: characterLevel(meta, meta.level),
      key,
      name: labels[meta.ruleId] ?? choiceNames[name] ?? name,
      count,
      options: unique,
      selected,
    });
    if (selected.length < count) result.pending.push(key);
    for (const id of selected)
      apply?.(
        unique.find((option) => option.id === id),
        `${key}/${id}`
      );
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
        { ...meta, level: Math.max(meta.level, rank(rule)), spellPicker: true },
        (option) => noteSpell(option.id, meta.source)
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
          ([id, points]) => Number(result.scores[id]) + points <= (rule.max ?? 20)
        )
      ),
      meta,
      (option) => {
        for (const [id, amount] of Object.entries(option.increases))
          result.scores[id] = Number(result.scores[id]) + amount;
      }
    );
  };

  function applyFeat(feat, key, meta, listConstraint) {
    if (!feat) return;
    takenFeats.set(feat.id, feat);
    result.feats.push({ ...feat, source: meta.source });
    const child = { ...meta, source: displayName(feat), depth: meta.depth + 1 };
    if (feat.id === 'magic-initiate') {
      const lists = listConstraint ? [listConstraint] : ['cleric', 'druid', 'wizard'];
      const configurations = lists.flatMap((list) =>
        abilities
          .slice(3)
          .map(([ability, , name]) =>
            opt(`${list}:${ability}`, `${labels[list]} · ${name}`, { list })
          )
      );
      group(
        `${key}/magic-initiate`,
        'Lista e atributo de conjuração',
        1,
        configurations,
        child,
        (option, subkey) =>
          spellChoices(
            (feat.effects?.spellChoices ?? []).map((rule) => ({ ...rule, list: option.list })),
            subkey,
            { ...child, depth: child.depth + 1 }
          )
      );
    } else {
      effects(feat.effects ?? {}, key, child);
    }
  }

  function effects(entry, key, meta) {
    for (const skill of entry.skillsFixed ?? []) result.skills.add(skill);
    for (const skill of entry.expertiseFixed ?? []) result.expertise.add(skill);
    for (const value of entry.toolsFixed ?? []) result.tools.add(value);
    for (const value of entry.languagesFixed ?? []) {
      result.languages.add(catalog.languages.find(({ name }) => name === value)?.id ?? value);
    }
    for (const spell of (entry.spellsFixed ?? []).filter(active)) noteSpell(spell.id, meta.source);
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
    spellChoices(entry.spellChoices, key, meta);
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
              result.scores,
              featureNames,
              takenFeats
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
      const options = [
        ...(rule.options ?? []),
        ...(rule.source?.collection === 'fighting-styles'
          ? catalog.styles.filter((style) => !takenFeats.has(style.id))
          : []),
      ];
      group(
        `${key}/choice/${rule.id}`,
        rule.translation?.name ?? rule.name,
        rule.pick ?? 1,
        options,
        {
          ...meta,
          level: Math.max(meta.level, rank(rule)),
          prompt: rule.translation?.prompt ?? rule.prompt,
        },
        (option, subkey) => {
          const child = {
            ...meta,
            source: displayName(option),
            level: Math.max(meta.level, rank(rule)),
            depth: meta.depth + 1,
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
              (selected) => addFacts(child.source, [['Conjuração', selected.name]])
            );
          }
        }
      );
    }
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
    spellChoices([cantripRule], key, meta);
    if (!maxSpellLevel) return;
    const spellRule = { list: casting.list, minSpellLevel: 1, maxSpellLevel };
    const preparedRule = {
      ...spellRule,
      id: 'class-prepared',
      name: 'Magias preparadas',
      pick: prepared,
    };
    if (entry.id !== 'wizard') {
      spellChoices([preparedRule], key, meta);
      return;
    }
    const book = [];
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
          noteSpell(option.id, 'Grimório');
        }
      );
    }
    spellChoices([{ ...preparedRule, from: book, level }], key, meta);
  }

  // Core options described in class features but absent from the catalog's choice arrays.
  function warlockInvocations(entry, key, meta) {
    const table = entry.progression?.find(({ header }) => header.includes('Eldritch Invocations'));
    if (!table) return;
    const column = table.header.indexOf('Eldritch Invocations');
    const count = Number(table.rows[level - 1]?.[column]);
    const known = new Set();
    const spells = result.spells.filter((spell) => spell.grantedBy === meta.source);
    for (let index = 1; index <= count; index++) {
      const at = table.rows.findIndex((row) => Number(row[column]) >= index) + 1;
      const options = invocations
        .filter(
          ([name, minimum, requires]) =>
            at >= minimum && !known.has(name) && (!requires || known.has(requires))
        )
        .map(([name, , , spell]) => opt(name, name, { spell }));
      if (at >= 2) {
        for (const [name, cantrips] of Object.entries(invocationCantrips)) {
          for (const spell of spells.filter((spell) => cantrips.includes(spell.id))) {
            const label = `${name} · ${spell.name}`;
            if (!known.has(label)) options.push(opt(label));
          }
        }
        for (const feat of catalog.feats.filter(
          (feat) =>
            feat.category === 'Origin' &&
            !takenFeats.has(feat.id) &&
            featAllowed(
              feat,
              characterLevel(meta, at),
              { campaign: draft.campaign || background?.setting },
              result.scores,
              featureNames,
              takenFeats
            )
        )) {
          options.push(
            opt(`lessons:${feat.id}`, `Lessons of the First Ones · ${displayName(feat)}`, { feat })
          );
        }
      }
      const invocationKey = `${key}/invocation/${index}`;
      group(
        invocationKey,
        `Invocação mística · ${index}`,
        1,
        options,
        { ...meta, level: at },
        (option, childKey) => {
          known.add(option.id);
          const child = { ...meta, level: at, source: option.name, depth: meta.depth + 1 };
          if (option.spell) noteSpell(option.spell, option.name);
          if (option.feat) applyFeat(option.feat, childKey, child);
          if (option.id === 'Pact of the Tome') {
            const exclude = spells.map(({ id }) => id);
            spellChoices(
              [
                { id: 'tome-cantrips', name: 'Truques do pacto', pick: 3, spellLevel: 0, exclude },
                {
                  id: 'tome-rituals',
                  name: 'Rituais do pacto',
                  pick: 2,
                  spellLevel: 1,
                  ritual: true,
                  exclude,
                },
              ],
              childKey,
              child
            );
          }
        }
      );
    }
    addFacts(meta.source, [
      [
        'Invocações místicas',
        [...known]
          .map((id) =>
            id.startsWith('lessons:')
              ? `Lessons of the First Ones · ${displayName(catalog.byFeat.get(id.slice(8)))}`
              : id
          )
          .join(', '),
      ],
    ]);
  }

  function coreClassChoices(entry, key, meta) {
    if (entry.id === 'warlock') warlockInvocations(entry, key, meta);
    const order = {
      cleric: {
        title: 'Ordem divina',
        martial: 'Protector',
        caster: 'Thaumaturge',
        armor: 'Pesada',
        skill: 'Arcana ou Religião',
      },
      druid: {
        title: 'Ordem primal',
        martial: 'Warden',
        caster: 'Magician',
        armor: 'Média',
        skill: 'Arcana ou Natureza',
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
          const child = { ...meta, source: option.name, depth: meta.depth + 1 };
          if (option.id === order.martial) {
            addFacts(option.name, [
              ['Treinamento adicional', `Armas marciais · Armadura ${order.armor.toLowerCase()}`],
            ]);
          } else {
            addFacts(option.name, [['Bônus de Sabedoria', order.skill]]);
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
              (spell) => noteSpell(spell.id, option.name)
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
        (option) => addFacts(meta.source, [['Golpes abençoados', option.name]])
      );
    }
    if (entry.id === 'druid' && level >= 7) {
      group(
        `${key}/elemental-fury`,
        'Fúria elemental',
        1,
        named(['Potent Spellcasting', 'Primal Strike']),
        { ...meta, level: 7 },
        (option) => addFacts(meta.source, [['Fúria elemental', option.name]])
      );
    }
    if (entry.id === 'sorcerer') {
      const known = new Set();
      for (const at of [2, 10, 17].filter((minimum) => level >= minimum)) {
        group(
          `${key}/metamagic/${at}`,
          'Metamagia',
          2,
          metamagic.filter(({ id }) => !known.has(id)),
          { ...meta, level: at },
          (option) => known.add(option.id)
        );
      }
      addFacts(meta.source, [['Metamagias', [...known].join(', ')]]);
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
    };
    const key = `${prefix}/${entry.id}`;
    for (const [index, feature] of [...(entry.traits ?? []), ...(entry.features ?? [])].entries()) {
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
      if (entry.size?.length > 1) {
        group(
          `${key}/size`,
          'Tamanho',
          1,
          entry.size.map((size) => opt(size, { Medium: 'Médio', Small: 'Pequeno' }[size] ?? size)),
          meta,
          (option) => addFacts(source, [['Tamanho', option.name]])
        );
      } else addFacts(source, [['Tamanho', entry.size?.join(', ')]]);
      addFacts(source, [
        ['Deslocamento base', entry.speed && `${entry.speed} pés`],
        ['Tipo de criatura', entry.creatureType],
      ]);
    }
    if (entry === cls) {
      const initial = track.levels[0] === 1;
      addFacts(source, [
        ['Dado de vida', cls.hitDie],
        ['Salvaguardas proficientes', initial && cls.savingThrows?.join(', ')],
        [
          'Armas',
          initial ? cls.weaponProficiencies : martialMulticlass.has(cls.id) && 'Armas marciais',
        ],
        [
          'Armaduras',
          initial
            ? cls.armorTraining?.map((item) => item.kind).join(', ')
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
        (option) => result.skills.has(option.name) && !result.expertise.has(option.name)
      ),
      { ...meta, level: Math.max(meta.level, rank(rule)) },
      (option) => result.expertise.add(option.name)
    );
  }
  return result;
}
