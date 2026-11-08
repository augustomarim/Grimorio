import { asyncFilter } from '../db/async-array.js';
import type { Database } from '../db/database.js';
import type { ContentItem, Feat } from '@freshmag/one-dndb';
import { entryBenefits } from './multiclass-progression.js';
import {
  attributeState,
  AttributeChoices,
  abilityName,
  abilities,
  type Ability,
} from './attributes.js';
import { BenefitAudit, type Grant } from './benefits.js';
export const effectFields = [
  'abilityBoosts',
  'skillsFixed',
  'skillChoices',
  'expertise',
  'expertiseFixed',
  'toolsFixed',
  'toolChoices',
  'languagesFixed',
  'languageChoices',
  'spellsFixed',
  'spellChoices',
  'armorTraining',
  'weaponTraining',
] as const;
interface Source {
  identity: string;
  kind: string;
  instanceId: number;
  slug: string;
  name: string;
  level: number;
  data: ContentItem;
  grantIds: number[];
}
export class EffectEngine {
  constructor(private db: Database) {}
  async sources(id: number): Promise<Source[]> {
    const total = (
      (await this.db
        .prepare('SELECT COALESCE(SUM(level),0) AS n FROM character_class WHERE character_id=?')
        .get(id)) as {
        n: number;
      }
    ).n;
    const result: Source[] = [],
      grants = (await this.db
        .prepare('SELECT * FROM character_rule_grant WHERE character_id=?')
        .all(id)) as Grant[],
      audit = new BenefitAudit(this.db);
    const append = async (
      kind: string,
      instanceId: number,
      row: {
        data: string;
        slug: string;
        name: string;
      },
      level: number,
      override?: ContentItem
    ) => {
      const raw = JSON.parse(row.data) as ContentItem & Feat,
        identity = `${kind}:${instanceId}`;
      result.push({
        identity,
        kind,
        instanceId,
        slug: row.slug,
        name: row.name,
        level,
        data: override ?? (kind === 'feat' ? ((raw.effects ?? {}) as ContentItem) : raw),
        grantIds: (
          await asyncFilter(grants, async (g) => (await audit.source(id, g))?.identity === identity)
        ).map((g) => g.id),
      });
    };
    const classes = (await this.db
      .prepare(
        'SELECT cc.*,c.data,e.slug,e.name FROM character_class cc JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id WHERE cc.character_id=?'
      )
      .all(id)) as {
      id: number;
      level: number;
      is_initial_class: number;
      subclass_id: number | null;
      data: string;
      slug: string;
      name: string;
    }[];
    for (const row of classes) {
      const raw = JSON.parse(row.data) as ContentItem,
        entry = !row.is_initial_class ? entryBenefits(row.slug) : undefined;
      const data = row.is_initial_class
        ? raw
        : entry
          ? { ...raw, ...entry, hitDie: raw.hitDie ?? `D${entry.hitDie}`, skillsFixed: [] }
          : {
              ...raw,
              savingThrows: [],
              armorTraining: [],
              weaponTraining: [],
              toolsFixed: [],
              skillsFixed: [],
            };
      await append('class', row.id, row, row.level, data);
      if (row.subclass_id) {
        const sub = (await this.db
          .prepare(
            'SELECT s.data,e.slug,e.name FROM lib_subclass s JOIN catalog_entry e ON e.id=s.catalog_entry_id WHERE s.id=?'
          )
          .get(row.subclass_id)) as {
          data: string;
          slug: string;
          name: string;
        };
        await append('subclass', row.id, sub, row.level);
      }
    }
    for (const kind of ['species', 'background'] as const) {
      const row = (await this.db
        .prepare(
          `SELECT l.id,l.data,e.slug,e.name FROM dnd_character d JOIN lib_${kind} l ON l.id=d.${kind}_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE d.character_id=?`
        )
        .get(id)) as
        | {
            id: number;
            data: string;
            slug: string;
            name: string;
          }
        | undefined;
      if (row) await append(kind, row.id, row, total);
    }
    const feats = (await this.db
      .prepare(
        'SELECT a.id,f.data,e.slug,e.name FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id JOIN catalog_entry e ON e.id=f.catalog_entry_id WHERE a.character_id=?'
      )
      .all(id)) as {
      id: number;
      data: string;
      slug: string;
      name: string;
    }[];
    for (const row of feats) await append('feat', row.id, row, total);
    return result;
  }
  async project(id: number) {
    const sources = await this.sources(id),
      skills = new Map<string, number>(),
      tools = new Map<string, number>(),
      languages = new Set<string>(),
      armor = new Set<string>(),
      saving = new Set<string>(),
      weaponClauses: NonNullable<ContentItem['weaponTraining']> = [];
    for (const source of sources) {
      const d = source.data;
      for (const name of d.skillsFixed ?? []) skills.set(name, Math.max(skills.get(name) ?? 0, 1));
      for (const name of d.expertiseFixed ?? []) skills.set(name, 2);
      for (const slug of d.toolsFixed ?? []) tools.set(slug, Math.max(tools.get(slug) ?? 0, 1));
      for (const slug of d.languagesFixed ?? []) languages.add(slug);
      for (const rule of d.armorTraining ?? [])
        if (source.level >= (rule.level ?? 1)) armor.add(rule.kind);
      for (const rule of d.weaponTraining ?? [])
        if (source.level >= (rule.level ?? 1)) weaponClauses.push(rule);
      for (const name of d.savingThrows ?? []) saving.add(abilityName(name));
    }
    const stored = (await this.db
      .prepare(
        'SELECT e.name,e.slug,s.proficiency_rank FROM character_skill s JOIN lib_skill l ON l.id=s.skill_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE s.character_id=?'
      )
      .all(id)) as {
      name: string;
      proficiency_rank: number;
    }[];
    for (const s of stored)
      skills.set(s.name, Math.max(skills.get(s.name) ?? 0, s.proficiency_rank));
    for (const kind of ['tool', 'language'] as const) {
      const rows = (await this.db
        .prepare(
          `SELECT e.slug,a.proficiency_rank FROM character_ability a JOIN lib_${kind} l ON l.id=a.lib_${kind}_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE a.character_id=?`
        )
        .all(id)) as {
        slug: string;
        proficiency_rank: number | null;
      }[];
      for (const r of rows)
        if (kind === 'tool')
          tools.set(r.slug, Math.max(tools.get(r.slug) ?? 0, r.proficiency_rank ?? 1));
        else languages.add(r.slug);
    }
    for (const r of (await this.db
      .prepare('SELECT armor_kind FROM character_armor_training WHERE character_id=?')
      .all(id)) as {
      armor_kind: string;
    }[])
      armor.add(r.armor_kind);
    for (const r of (await this.db
      .prepare('SELECT ability FROM character_saving_throw WHERE character_id=?')
      .all(id)) as {
      ability: string;
    }[])
      saving.add(r.ability);
    const boosts = (await this.db
      .prepare('SELECT * FROM character_ability_boost WHERE character_id=?')
      .all(id)) as {
      grant_id: number;
      rule_id: string;
      ability: Ability;
      amount: number;
    }[];
    const grantRows = (await this.db
        .prepare('SELECT * FROM character_rule_grant WHERE character_id=?')
        .all(id)) as Grant[],
      audit = new BenefitAudit(this.db);
    for (const b of boosts) {
      const g = grantRows.find((g) => g.id === b.grant_id),
        rule = g
          ? (await audit.source(id, g))?.data.abilityBoosts?.find((r) => r.id === b.rule_id)
          : undefined;
      if (rule?.savingThrow) saving.add(b.ability);
    }
    const weaponIds = new Set(
      (
        (await this.db
          .prepare('SELECT item_id FROM character_weapon_proficiency WHERE character_id=?')
          .all(id)) as {
          item_id: number;
        }[]
      ).map((r) => r.item_id)
    );
    const weapons = (await this.db
      .prepare('SELECT w.item_id,w.category,w.weapon_range FROM lib_weapon_definition w')
      .all()) as {
      item_id: number;
      category: string;
      weapon_range: string;
    }[];
    for (const w of weapons) {
      const props = (
        (await this.db
          .prepare(
            'SELECT e.slug FROM lib_weapon_property_link p JOIN lib_weapon_property l ON l.id=p.property_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE p.item_id=?'
          )
          .all(w.item_id)) as {
          slug: string;
        }[]
      ).map((p) => p.slug);
      if (
        weaponClauses.some(
          (r) =>
            r.category === w.category &&
            (!r.range || r.range === w.weapon_range) &&
            (!r.with || r.with.some((p) => props.includes(p))) &&
            (!r.without || r.without.every((p) => !props.includes(p)))
        )
      )
        weaponIds.add(w.item_id);
    }
    return {
      skills: [...skills].map(([name, rank]) => ({ name, rank })),
      tools: [...tools].map(([slug, rank]) => ({ slug, rank })),
      languages: [...languages],
      armor: [...armor],
      savingThrows: [...saving],
      weaponItemIds: [...weaponIds].sort((a, b) => a - b),
    };
  }
  async report(id: number) {
    const sources = await this.sources(id),
      attributes = await attributeState(this.db, id),
      allocations = await this.db
        .prepare('SELECT * FROM character_ability_boost WHERE character_id=? ORDER BY id')
        .all(id);
    return {
      characterId: id,
      attributes,
      allocations,
      projected: await this.project(id),
      rules: sources.map((s) => ({
        identity: s.identity,
        kind: s.kind,
        instanceId: s.instanceId,
        slug: s.slug,
        name: s.name,
        level: s.level,
        grantIds: s.grantIds,
        effects: Object.fromEntries(
          effectFields.filter((f) => s.data[f]?.length).map((f) => [f, s.data[f]])
        ),
        featChoices: s.data.featChoices ?? [],
        featsFixed: s.data.featsFixed ?? [],
      })),
      coverage: {
        structuredEffectTypes: effectFields.length,
        handlers: effectFields,
        unrecognizedFields: [
          ...new Set(
            sources
              .filter((s) => s.kind === 'feat')
              .flatMap((s) =>
                Object.keys(s.data).filter(
                  (k) => !effectFields.includes(k as (typeof effectFields)[number])
                )
              )
          ),
        ],
        scope: 'current-state',
        textOnly:
          'Texto descritivo, condições de mesa e combate são preservados como referência, não executados automaticamente',
      },
      rulesVerified: false,
    };
  }
  async audit(id: number) {
    const findings = await new AttributeChoices(this.db).audit(id),
      sources = await this.sources(id),
      grants = (await this.db
        .prepare('SELECT * FROM character_rule_grant WHERE character_id=?')
        .all(id)) as Grant[],
      audit = new BenefitAudit(this.db);
    for (const source of sources) {
      for (const rule of source.data.abilityBoosts ?? []) {
        const count = (
          (await this.db
            .prepare(
              'SELECT grant_id,amount FROM character_ability_boost WHERE character_id=? AND rule_id=?'
            )
            .all(id, rule.id)) as {
            grant_id: number;
            amount: number;
          }[]
        )
          .filter((r) => source.grantIds.includes(r.grant_id))
          .reduce((n, r) => n + r.amount, 0);
        if (count < rule.points)
          findings.push({
            code: 'ABILITY_BOOST_INCOMPLETE',
            state: 'unknown',
            entityId: source.instanceId,
            message: 'Aumento de atributo ainda não distribuído integralmente',
          });
      }
      for (const feat of source.data.featsFixed ?? []) {
        if (source.level < (feat.level ?? 1)) continue;
        const present = (await this.db
          .prepare(
            'SELECT a.grant_id FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id JOIN catalog_entry e ON e.id=f.catalog_entry_id WHERE a.character_id=? AND e.slug=?'
          )
          .all(id, feat.id)) as {
          grant_id: number;
        }[];
        if (!present.some((row) => source.grantIds.includes(row.grant_id)))
          findings.push({
            code: 'FIXED_FEAT_INCOMPLETE',
            state: 'unknown',
            entityId: source.instanceId,
            message: 'Talento fixo da origem ainda não registrado',
          });
      }
    }
    const styles = (await this.db
      .prepare(
        "SELECT a.id FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id JOIN catalog_entry e ON e.id=f.catalog_entry_id JOIN lib_fighting_style s ON s.catalog_entry_id IN (SELECT id FROM catalog_entry WHERE slug=e.slug AND kind='fighting_style') JOIN character_fighting_style cs ON cs.lib_fighting_style_id=s.id AND cs.character_id=a.character_id WHERE a.character_id=?"
      )
      .all(id)) as {
      id: number;
    }[];
    for (const row of styles)
      findings.push({
        code: 'FIGHTING_STYLE_DUPLICATE',
        state: 'fail',
        entityId: row.id,
        message: 'Estilo registrado também como talento; não acumular a mesma concessão',
      });
    // Fixed arrays and choices share a source; this check does not guess rules from free text.
    for (const row of (await this.db
      .prepare(
        'SELECT a.id,a.grant_id,a.selection_kind,a.choice_key,f.data,e.slug FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id JOIN catalog_entry e ON e.id=f.catalog_entry_id WHERE a.character_id=?'
      )
      .all(id)) as {
      id: number;
      grant_id: number;
      selection_kind: string;
      choice_key: string | null;
      data: string;
      slug: string;
    }[]) {
      const g = grants.find((g) => g.id === row.grant_id),
        source = g ? await audit.source(id, g) : undefined,
        feat = JSON.parse(row.data) as Feat;
      if (row.selection_kind === 'fixed')
        findings.push({
          code: 'FEAT_ORIGIN',
          state: source?.data.featsFixed?.some(
            (f) => f.id === row.slug && source.level >= (f.level ?? 1)
          )
            ? 'pass'
            : 'unknown',
          entityId: row.id,
          message: 'Talento fixo versus origem declarada',
        });
      else {
        const rule = source?.data.featChoices?.find(
          (r) => row.choice_key === `featChoices:${r.id}`
        );
        if (!rule) {
          findings.push({
            code: 'FEAT_ORIGIN',
            state: 'unknown',
            entityId: row.id,
            message: 'Escolha de talento sem regra identificada',
          });
          continue;
        }
        const pool = (
          await asyncFilter(
            grants,
            async (other) => (await audit.source(id, other))?.identity === source?.identity
          )
        ).map((g) => g.id);
        const selected = (
          (await this.db
            .prepare(
              'SELECT grant_id,choice_key FROM character_ability WHERE character_id=? AND lib_feat_id IS NOT NULL'
            )
            .all(id)) as {
            grant_id: number;
            choice_key: string | null;
          }[]
        ).filter((r) => pool.includes(r.grant_id) && r.choice_key === row.choice_key).length;
        findings.push({
          code: 'FEAT_ORIGIN',
          state:
            source!.level >= (rule.level ?? 1) &&
            selected <= rule.pick &&
            (!rule.category || feat.category === rule.category || !!rule.include?.includes(feat.id))
              ? 'pass'
              : 'fail',
          entityId: row.id,
          message: 'Categoria, quantidade e nível da escolha de talento',
        });
      }
    }
    return findings;
  }
}
