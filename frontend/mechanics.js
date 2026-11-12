import { abilities, classPlan, displayName, skillName } from './rules.js';

export function rollDice(count, sides, bonus = 0, random = Math.random) {
  const dice = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
  return { dice, sides, bonus, total: dice.reduce((sum, value) => sum + value, bonus) };
}

export function playResources(draft, calculated) {
  const stored = draft.play ?? {};
  const hitDice = new Map();
  for (const value of calculated.hitDice) {
    const [count, sides] = value.split('d').map(Number);
    hitDice.set(sides, (hitDice.get(sides) ?? 0) + count);
  }
  const resources = (entries, used) =>
    entries.map((entry) => ({
      ...entry,
      remaining: Math.max(0, entry.maximum - (used?.[entry.key] ?? 0)),
    }));
  const slots = [
    ...calculated.commonSlots.map((slot) => ({ ...slot, key: `spell-${slot.level}` })),
    ...calculated.casting
      .filter(({ pact }) => pact)
      .flatMap(({ slots }) =>
        (slots ?? []).map((slot) => ({ ...slot, key: 'pact', pact: true }))
      ),
  ].filter(({ maximum }) => maximum > 0);
  return {
    currentHP: Math.max(0, calculated.maximumHP - (stored.damage ?? 0)),
    temporaryHP: stored.temporaryHP ?? 0,
    hitDice: resources(
      [...hitDice].map(([sides, maximum]) => ({ key: String(sides), sides, maximum })),
      stored.hitDice
    ),
    slots: resources(slots, stored.slots),
    shortRest: !!stored.shortRest,
  };
}

export function updatePlayHP(play, maximum, action, amount) {
  if (action === 'temporary') return { ...play, temporaryHP: amount };
  const damage = Math.min(maximum, play.damage ?? 0);
  if (action === 'heal') return { ...play, damage: Math.max(0, damage - amount) };
  const absorbed = Math.min(play.temporaryHP ?? 0, amount);
  return {
    ...play,
    temporaryHP: (play.temporaryHP ?? 0) - absorbed,
    damage: Math.min(maximum, damage + amount - absorbed),
  };
}

export function completeRest(play, type) {
  if (type === 'long') return {};
  return {
    ...play,
    shortRest: false,
    slots: Object.fromEntries(Object.entries(play.slots ?? {}).filter(([key]) => key !== 'pact')),
    free: Object.fromEntries(Object.entries(play.free ?? {}).filter(([key]) => !key.startsWith('short:'))),
  };
}

export function equippedWeaponRolls(projection, calculated) {
  const training = [...projection.weaponTraining];
  for (const { entry, levels } of projection.classes) {
    if (levels[0] > 1 && ['barbarian', 'fighter', 'paladin', 'ranger'].includes(entry.id))
      training.push({ category: 'Martial' });
  }
  if (projection.groups.some(({ selected }) => selected.includes('Protector')))
    training.push({ category: 'Martial' });
  const archery = projection.feats.some(({ id }) => id === 'archery');
  return calculated.inventory.flatMap(({ id, name, item, base, equipped, attuned }) => {
    const definition = base ?? item;
    const weapon = definition?.weapon;
    const damage = /^(\d+)d(\d+)$/.exec(weapon?.damage?.dice ?? '');
    if (!equipped || !damage) return [];
    const ranged = weapon.range === 'Ranged';
    const { str, dex } = calculated.modifiers;
    const bonus = ranged || (weapon.properties?.includes('finesse') && dex > str) ? dex : str;
    const proficient = training.some(({ item, category, with: properties }) =>
      item === definition.id ||
      (category === weapon.category &&
        (!properties?.length || properties.some((name) => weapon.properties?.includes(name.toLowerCase()))))
    );
    const magic = !item.attunement || attuned ? Number(item.name.match(/^\+(\d) /)?.[1] ?? 0) : 0;
    return [{
      id,
      name,
      attack: bonus + (proficient ? calculated.proficiency : 0) + magic + (archery && ranged ? 2 : 0),
      damage: { count: Number(damage[1]), sides: Number(damage[2]), bonus: bonus + magic },
      type: weapon.damage.type,
    }];
  });
}

const modifier = (score) => Math.floor((score - 10) / 2);
const abilityId = (name) => abilities.find(([id, english]) => name === id || name === english)?.[0];
const skillAbilities = {
  Acrobatics: 'dex',
  'Animal Handling': 'wis',
  Arcana: 'int',
  Athletics: 'str',
  Deception: 'cha',
  History: 'int',
  Insight: 'wis',
  Intimidation: 'cha',
  Investigation: 'int',
  Medicine: 'wis',
  Nature: 'int',
  Perception: 'wis',
  Performance: 'cha',
  Persuasion: 'cha',
  Religion: 'int',
  'Sleight of Hand': 'dex',
  Stealth: 'dex',
  Survival: 'wis',
};

export function characterInventory(draft, projection, catalog) {
  const starter = projection.equipment.flatMap((kit) =>
    (kit.items ?? []).map((item, index) => ({
      id: `starter/${encodeURIComponent(kit.source)}/${item.id}/${index}`,
      itemId: item.id,
      quantity: item.quantity ?? 1,
      source: kit.source,
    }))
  );
  const changes = new Map((draft.inventory ?? []).map((item) => [item.id, item]));
  const rows = [
    ...starter.map((item) => ({ ...item, ...changes.get(item.id) })),
    ...(draft.inventory ?? []).filter((item) => !item.id.startsWith('starter/')),
  ];
  return rows
    .filter(({ id }) => !(draft.removedEquipment ?? []).includes(id))
    .map((row) => {
      const item = catalog.byItem.get(row.itemId) ?? catalog.byTool.get(row.itemId);
      const base = catalog.byItem.get(row.baseItemId);
      return { ...row, item, base, name: item ? displayName(item) : row.itemId };
    });
}

function individualSlots(entry, level) {
  for (const table of entry.progression ?? []) {
    const row = table.rows.find((row) => Number(row[0]) === level);
    if (!row) continue;
    const count = table.header.indexOf('Spell Slots');
    if (count >= 0)
      return [
        { level: Number(row[table.header.indexOf('Slot Level')]), maximum: Number(row[count]) },
      ];
    const columns = table.header
      .map((name, index) =>
        /^[1-9](st|nd|rd|th)$/.test(name) ? { level: Number(name[0]), index } : undefined
      )
      .filter(Boolean);
    if (columns.length)
      return columns.map(({ level, index }) => ({ level, maximum: Number(row[index]) || 0 }));
  }
}

export function deriveCharacter(draft, projection, catalog) {
  const totalLevel = classPlan(draft).length;
  const proficiency = 2 + Math.floor((totalLevel - 1) / 4);
  const modifiers = Object.fromEntries(
    abilities.map(([id]) => [id, modifier(projection.scores[id])])
  );
  const levels = Object.fromEntries(
    projection.classes.map(({ entry, levels }) => [entry.id, levels.length])
  );
  const feats = new Set(projection.feats.map(({ id }) => id));
  const features = new Set(projection.features.map(({ name }) => name));
  const options = new Set(projection.groups.flatMap(({ selected }) => selected));
  const inventory = characterInventory(draft, projection, catalog);
  const equipped = inventory.filter(({ equipped }) => equipped);
  const activeItems = new Set(
    equipped
      .filter(({ item, attuned }) => item && (!item.attunement || attuned))
      .map(({ itemId }) => itemId)
  );
  const arcaneClass = ['sorcerer', 'warlock', 'wizard'].some((id) => levels[id]);
  const staffOfPower = arcaneClass && activeItems.has('staff-of-power');
  const archmagiRobe = arcaneClass && activeItems.has('robe-of-the-archmagi');
  const luckBonus = activeItems.has('stone-of-good-luck') ? 1 : 0;
  const spellAttackBonus = (staffOfPower ? 2 : 0) + (archmagiRobe ? 2 : 0);
  const spellSaveBonus = archmagiRobe ? 2 : 0;
  const armorItems = equipped.filter(
    ({ item, base }) =>
      (base ?? item)?.kind === 'armor' &&
      (base ?? item)?.id !== 'shield' &&
      !/shield/i.test(item?.name ?? '')
  );
  const shields = equipped.filter(
    ({ item, base }) =>
      (base ?? item)?.id === 'shield' || (item?.kind === 'armor' && /shield/i.test(item.name))
  );
  const armor = armorItems[0];
  const shield = shields[0];
  const warnings = [];
  const training = new Set(projection.armorTraining);
  for (const { entry, levels } of projection.classes) {
    if (levels[0] === 1) for (const { kind } of entry.armorTraining ?? []) training.add(kind);
    else
      for (const kind of {
        artificer: ['Light', 'Medium', 'Shield'],
        barbarian: ['Shield'],
        bard: ['Light'],
        cleric: ['Light', 'Medium', 'Shield'],
        druid: ['Light', 'Shield'],
        fighter: ['Light', 'Medium', 'Shield'],
        paladin: ['Light', 'Medium', 'Shield'],
        ranger: ['Light', 'Medium', 'Shield'],
        rogue: ['Light'],
        warlock: ['Light'],
      }[entry.id] ?? [])
        training.add(kind);
  }
  if (options.has('Protector')) training.add('Heavy');
  if (options.has('Warden')) training.add('Medium');
  const magicBonus = (item) => Number(item?.name?.match(/^\+(\d) /)?.[1] ?? 0);
  const baseArmor = armor?.base ?? armor?.item;
  let ac = 10 + modifiers.dex;
  let armorSource = 'Sem armadura';
  if (baseArmor?.ac) {
    const formula = baseArmor.ac;
    const base = Number.parseInt(formula, 10);
    ac =
      base +
      (/Dex/i.test(formula)
        ? /max[^\d]*2/i.test(formula)
          ? Math.min(2, modifiers.dex)
          : modifiers.dex
        : 0);
    ac += magicBonus(armor.item);
    armorSource = armor.name;
  } else if (armor) {
    warnings.push('Escolha o tipo de armadura base para calcular sua CA.');
  } else {
    const formulas = [[ac, 'Sem armadura']];
    const initialDefense = projection.classes.find(({ entry }) =>
      ['monk', 'barbarian'].includes(entry.id)
    );
    if (initialDefense?.entry.id === 'barbarian')
      formulas.push([10 + modifiers.dex + modifiers.con, 'Defesa sem Armadura · Bárbaro']);
    if (initialDefense?.entry.id === 'monk' && !shield)
      formulas.push([10 + modifiers.dex + modifiers.wis, 'Defesa sem Armadura · Monge']);
    if (features.has('Draconic Resilience'))
      formulas.push([10 + modifiers.dex + modifiers.cha, 'Resiliência Dracônica']);
    if (features.has('Dazzling Footwork') && !shield)
      formulas.push([10 + modifiers.dex + modifiers.cha, 'Esquiva do Colégio da Dança']);
    if (archmagiRobe) formulas.push([15 + modifiers.dex, 'Manto do Arquimago']);
    [ac, armorSource] = formulas.sort(([a], [b]) => b - a)[0];
  }
  if (shield) ac += 2 + (shield.itemId === 'repulsion-shield' ? 1 : magicBonus(shield.item));
  if (armor && feats.has('defense')) ac++;
  const protectionBonus = ['ring-of-protection', 'cloak-of-protection'].filter((id) =>
    activeItems.has(id)
  ).length;
  ac += protectionBonus + (staffOfPower ? 2 : 0);
  if (activeItems.has('bracers-of-defense') && !armor && !shield) ac += 2;
  if (armorItems.length > 1) warnings.push('Equipe apenas uma armadura.');
  if (shields.length > 1) warnings.push('Equipe apenas um escudo.');
  for (const row of [...armorItems, ...shields]) {
    const base = row.base ?? row.item;
    const kind =
      base?.id === 'shield' || /shield/i.test(row.item?.name ?? '')
        ? 'Shield'
        : /Heavy/.test(base?.shelf)
          ? 'Heavy'
          : /Medium/.test(base?.shelf)
            ? 'Medium'
            : 'Light';
    if (!training.has(kind)) warnings.push('Falta treinamento para ' + row.name + '.');
  }
  const attunementLimit =
    levels.artificer >= 18 ? 6 : levels.artificer >= 14 ? 5 : levels.artificer >= 10 ? 4 : 3;
  if (inventory.filter(({ attuned }) => attuned).length > attunementLimit)
    warnings.push('O limite de itens sintonizados é ' + attunementLimit + '.');
  const magicSaveBonus = protectionBonus + luckBonus + (staffOfPower ? 2 : 0);
  const savingThrows = abilities.map(([id, , name]) => ({
    id,
    name,
    proficient: projection.savingThrows.has(id),
    bonus: modifiers[id] + (projection.savingThrows.has(id) ? proficiency : 0) + magicSaveBonus,
  }));
  const skills = Object.entries(skillAbilities).map(([id, ability]) => {
    const expertise = projection.expertise.has(id);
    const proficient = projection.skills.has(id);
    const half = !proficient && (levels.bard ?? 0) >= 2 ? Math.floor(proficiency / 2) : 0;
    const bonus =
      modifiers[ability] +
      (expertise ? proficiency * 2 : proficient ? proficiency : half) +
      luckBonus;
    return { id, name: skillName(id), ability, proficient, expertise, bonus };
  });
  for (const skill of skills) {
    if (
      (options.has('Thaumaturge') && ['Arcana', 'Religion'].includes(skill.id)) ||
      (options.has('Magician') && ['Arcana', 'Nature'].includes(skill.id))
    )
      skill.bonus += Math.max(1, modifiers.wis);
  }
  const hitDice = [];
  let maximumHP = 0;
  const classCounts = {};
  for (const [index, classId] of classPlan(draft).entries()) {
    const cls = catalog.byContent.get(classId);
    if (!cls) continue;
    const die = Number(String(cls.hitDie).replace(/\D/g, ''));
    if (!die) continue;
    classCounts[classId] = (classCounts[classId] ?? 0) + 1;
    const roll = draft.hp?.[index + 1];
    const base = index === 0 ? die : (roll ?? Math.floor(die / 2) + 1);
    if (index > 0 && roll != null && (!Number.isInteger(roll) || roll < 1 || roll > die))
      warnings.push('PV do nível ' + (index + 1) + ' precisam de um valor entre 1 e ' + die + '.');
    maximumHP += Math.max(1, base + modifiers.con);
  }
  for (const [id, count] of Object.entries(classCounts))
    hitDice.push(count + 'd' + String(catalog.byContent.get(id).hitDie).replace(/\D/g, ''));
  if (feats.has('tough')) maximumHP += 2 * totalLevel;
  if (projection.species?.id === 'dwarf') maximumHP += totalLevel;
  if (features.has('Draconic Resilience')) maximumHP += levels.sorcerer;
  if (feats.has('boon-of-fortitude')) maximumHP += 40;
  let speed = projection.species?.speed ?? 30;
  if (options.has('wood-elf')) speed = 35;
  if (feats.has('speedy')) speed += 10;
  if (feats.has('transmuted-anatomy')) speed += 5;
  if (feats.has('boon-of-speed')) speed += 30;
  if ((levels.barbarian ?? 0) >= 5 && !/Heavy/.test(baseArmor?.shelf ?? '')) speed += 10;
  if ((levels.monk ?? 0) >= 2 && !armor && !shield)
    speed += 10 + 5 * Math.floor((levels.monk - 2) / 4);
  if ((levels.ranger ?? 0) >= 6 && !/Heavy/.test(baseArmor?.shelf ?? '')) speed += 10;
  if (features.has('Aura of Alacrity')) speed += 10;
  const armorStrength = Number(String(baseArmor?.strength ?? '').match(/\d+/)?.[0] ?? 0);
  if (activeItems.has('boots-of-striding-and-springing')) speed = Math.max(30, speed);
  else if (projection.scores.str < armorStrength) speed = Math.max(0, speed - 10);
  const resistance = new Set(projection.resistances);
  const permanentResistances = {
    'Celestial Resistance': ['Necrotic', 'Radiant'],
    'Trace of Undeath': ['Necrotic'],
    'Dwarven Resilience': ['Poison'],
    'Fire Resistance': ['Fire'],
    'Mental Discipline': ['Psychic'],
    'Cold Resistance': ['Cold'],
    'Construct Resilience': ['Poison'],
    'Psychic Defenses': ['Psychic'],
    'Chemical Mastery': ['Acid', 'Poison'],
    'Radiant Soul': ['Radiant'],
    Stormborn: ['Cold', 'Lightning', 'Thunder'],
    'Necromancy Spellbook': ['Necrotic'],
    'Guarded Mind': ['Psychic'],
    'Necrotic Husk': ['Necrotic'],
    'Avatar of Battle': ['Bludgeoning', 'Piercing', 'Slashing'],
    'Frigid Explorer': ['Cold'],
  };
  for (const name of features)
    for (const type of permanentResistances[name] ?? []) resistance.add(type);
  const damageImmunities = features.has('Frozen Haunt') ? ['Cold'] : [];
  for (const type of damageImmunities) resistance.delete(type);
  for (const [option, type] of [
    ['abyssal', 'Poison'],
    ['chthonic', 'Necrotic'],
    ['infernal', 'Fire'],
  ])
    if (options.has(option) && projection.species?.id === 'tiefling') resistance.add(type);
  const casting = projection.classes.flatMap(({ entry, subclass, levels }) => {
    const caster = entry.casting ? entry : subclass?.casting ? subclass : undefined;
    if (!caster) return [];
    const ability = abilityId(caster.casting.ability);
    const slots = individualSlots(entry, levels.length) ?? individualSlots(caster, levels.length);
    return [
      {
        id: entry.id,
        name: displayName(entry),
        level: levels.length,
        ability,
        saveDC: 8 + proficiency + modifiers[ability] + spellSaveBonus,
        attack: proficiency + modifiers[ability] + spellAttackBonus,
        pact: !!caster.casting.pact,
        slots,
        subclassCasting: caster !== entry,
      },
    ];
  });
  const common = casting.filter(({ pact }) => !pact);
  let commonSlots = common[0]?.slots ?? [];
  let casterLevel;
  if (common.length > 1) {
    casterLevel = common.reduce(
      (sum, caster) =>
        sum +
        (['artificer', 'paladin', 'ranger'].includes(caster.id)
          ? Math.ceil(caster.level / 2)
          : caster.subclassCasting
            ? Math.floor(caster.level / 3)
            : caster.level),
      0
    );
    commonSlots = (catalog.slotTable?.[casterLevel - 1] ?? []).map((maximum, index) => ({
      level: index + 1,
      maximum,
    }));
  } else if (common.length === 1 && !common[0].slots && common[0].subclassCasting) {
    const source = catalog.classes.find(({ id }) => id === 'wizard');
    commonSlots = individualSlots(source, Math.max(1, Math.ceil(common[0].level / 3))) ?? [];
  }
  return {
    proficiency,
    modifiers,
    inventory,
    armorClass: ac,
    armorSource,
    maximumHP,
    hitDice,
    skills,
    savingThrows,
    speed,
    resistances: [...resistance],
    damageImmunities,
    initiative:
      modifiers.dex +
      luckBonus +
      (feats.has('alert') ? proficiency : 0) +
      (features.has('Tactical Wit') ? modifiers.int : 0),
    passivePerception: 10 + skills.find(({ id }) => id === 'Perception').bonus,
    casting,
    spellSaveBonus,
    spellAttackBonus,
    commonSlots,
    casterLevel,
    warnings,
    attunementLimit,
  };
}
