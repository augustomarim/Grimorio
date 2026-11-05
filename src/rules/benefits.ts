import type Database from 'better-sqlite3';
import type { ContentItem, Feat } from '@freshmag/one-dndb';
import { coreEntryKey, entryBenefits } from './multiclass-progression.js';
import type { Finding } from './validation.js';
const fields = ['skillChoices', 'expertise', 'toolChoices', 'languageChoices'] as const;
type Field = (typeof fields)[number];
export interface Grant {
  id: number;
  origin_kind: string;
  origin_character_class_id: number | null;
  origin_subclass_id: number | null;
  origin_species_id: number | null;
  origin_background_id: number | null;
  origin_character_ability_id: number | null;
  origin_feat_id: number | null;
  acquisition_context: string;
  rule_key: string;
}
interface Source {
  data: ContentItem;
  level: number;
  identity: string;
  deprecatedAt: string | null;
  multiclassVerified: boolean;
  featSlug: string | null;
  magicInitiateListConstraint: string | null;
}
interface Selection {
  id: number;
  grant_id: number;
  choice_key: string | null;
  selection_kind: string;
  rank: number | null;
  kind: string;
  name: string;
  slug: string;
  group_slug: string | null;
  tier: string | null;
  is_always: number | null;
  local_id: number;
}
export class BenefitAudit {
  constructor(private db: Database.Database) {}
  source(characterId: number, g: Grant): Source | undefined {
    let table: string, localId: number | null;
    switch (g.origin_kind) {
      case 'class':
        table = 'class';
        localId =
          (
            this.db
              .prepare('SELECT class_id FROM character_class WHERE character_id=? AND id=?')
              .get(characterId, g.origin_character_class_id) as { class_id: number } | undefined
          )?.class_id ?? null;
        break;
      case 'subclass':
        table = 'subclass';
        localId = g.origin_subclass_id;
        break;
      case 'species':
        table = 'species';
        localId = g.origin_species_id;
        break;
      case 'background':
        table = 'background';
        localId = g.origin_background_id;
        break;
      case 'feat':
        table = 'feat';
        localId = g.origin_feat_id;
        break;
      default:
        return;
    }
    const record = this.db
      .prepare(
        `SELECT l.data,e.deprecated_at FROM lib_${table} l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE l.id=?`
      )
      .get(localId) as { data: string; deprecated_at: string | null } | undefined;
    if (!record) return;
    const raw = JSON.parse(record.data) as ContentItem & Feat;
    const level = g.origin_character_class_id
      ? (
          this.db
            .prepare('SELECT level FROM character_class WHERE character_id=? AND id=?')
            .get(characterId, g.origin_character_class_id) as { level: number }
        ).level
      : (
          this.db
            .prepare('SELECT SUM(level) AS n FROM character_class WHERE character_id=?')
            .get(characterId) as { n: number }
        ).n;
    const entry =
      g.origin_kind === 'class' &&
      g.acquisition_context === 'multiclass_entry' &&
      g.rule_key === coreEntryKey(g.origin_character_class_id!)
        ? entryBenefits(raw.id)
        : undefined;
    let magicInitiateListConstraint: string | null = null;
    if (g.origin_kind === 'feat' && raw.id === 'magic-initiate') {
      const parent = this.db
        .prepare(
          "SELECT a.selection_kind,b.data FROM character_ability a JOIN character_rule_grant p ON p.id=a.grant_id AND p.character_id=a.character_id JOIN lib_background b ON b.id=p.origin_background_id WHERE a.character_id=? AND a.id=? AND p.origin_kind='background'"
        )
        .get(characterId, g.origin_character_ability_id) as
        { selection_kind: string; data: string } | undefined;
      if (parent?.selection_kind === 'fixed') {
        const note = (JSON.parse(parent.data) as ContentItem).featsFixed?.find(
          (f) => f.id === 'magic-initiate'
        )?.note;
        if (note?.trim()) magicInitiateListConstraint = note.trim().toLowerCase();
      }
    }
    return {
      multiclassVerified: !!entry,
      featSlug: g.origin_kind === 'feat' ? raw.id : null,
      magicInitiateListConstraint,
      deprecatedAt: record.deprecated_at,
      data:
        g.origin_kind === 'feat'
          ? ((raw.effects ?? {}) as ContentItem)
          : entry
            ? { ...raw, ...entry, hitDie: `D${entry.hitDie}`, skillsFixed: [] }
            : raw,
      level,
      identity: `${g.origin_kind}:${g.origin_character_class_id ?? g.origin_character_ability_id ?? localId}`,
    };
  }
  private selections(id: number) {
    const skill = this.db
      .prepare(
        "SELECT s.id,s.grant_id,s.choice_key,s.selection_kind,s.proficiency_rank AS rank,'skill' AS kind,e.name,e.slug,NULL AS group_slug,NULL AS tier,NULL AS is_always,l.id AS local_id FROM character_skill s JOIN lib_skill l ON l.id=s.skill_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE s.character_id=?"
      )
      .all(id) as Selection[];
    const result = [...skill];
    for (const kind of ['tool', 'language'] as const) {
      const extra =
        kind === 'tool'
          ? 'ge.slug AS group_slug,NULL AS tier,NULL AS is_always'
          : 'NULL AS group_slug,l.tier,l.is_always';
      const joins =
        kind === 'tool'
          ? 'LEFT JOIN lib_tool_group g ON g.id=l.group_id LEFT JOIN catalog_entry ge ON ge.id=g.catalog_entry_id'
          : '';
      result.push(
        ...(this.db
          .prepare(
            `SELECT s.id,s.grant_id,s.choice_key,s.selection_kind,s.proficiency_rank AS rank,'${kind}' AS kind,e.name,e.slug,${extra},l.id AS local_id FROM character_ability s JOIN lib_${kind} l ON l.id=s.lib_${kind}_id JOIN catalog_entry e ON e.id=l.catalog_entry_id ${joins} WHERE s.character_id=?`
          )
          .all(id) as Selection[])
      );
    }
    return result;
  }
  inspect(id: number) {
    const grants = this.db
      .prepare('SELECT * FROM character_rule_grant WHERE character_id=? ORDER BY id')
      .all(id) as Grant[];
    const selections = this.selections(id),
      findings: Finding[] = [],
      options: Array<{
        grantId: number;
        choiceKey: string;
        field: Field;
        rule: unknown;
        available: boolean;
        scope: string;
      }> = [];
    const sources = new Map(grants.map((g) => [g.id, this.source(id, g)]));
    const processed = new Set<string>();
    for (const grant of grants) {
      const source = sources.get(grant.id);
      if (!source) continue;
      for (const field of fields)
        for (const choice of source.data[field] ?? []) {
          const key = `${field}:${choice.id}`,
            available = source.level >= (choice.level ?? 1);
          options.push({
            grantId: grant.id,
            choiceKey: key,
            field,
            rule: choice,
            available,
            scope: source.identity,
          });
          const pool = `${source.identity}:${key}`;
          if (processed.has(pool)) continue;
          processed.add(pool);
          const selected = selections.filter(
            (s) =>
              s.selection_kind === 'chosen' &&
              s.choice_key === key &&
              sources.get(s.grant_id)?.identity === source.identity
          );
          if (!selected.length) continue;
          const contexts = selected.map(
            (s) => grants.find((g) => g.id === s.grant_id)!.acquisition_context
          );
          const contextUnknown =
            grant.origin_kind === 'class' &&
            ((contexts.includes('multiclass_entry') && !source.multiclassVerified) ||
              ((choice.level ?? 1) === 1 &&
                field !== 'expertise' &&
                contexts.some(
                  (c) =>
                    c !== 'initial_class' &&
                    !(c === 'multiclass_entry' && source.multiclassVerified)
                )));
          const state = contextUnknown ? 'unknown' : !available ? 'fail' : 'pass';
          findings.push({
            code: 'BENEFIT_CHOICE_LEVEL',
            state,
            entityId: grant.id,
            message: 'Disponibilidade da escolha no nível atual da origem',
            evidence: { choiceKey: key, level: source.level, required: choice.level ?? 1 },
          });
          const distinct = new Set(selected.map((s) => `${s.kind}:${s.local_id}`)).size;
          findings.push({
            code: 'BENEFIT_CHOICE_LIMIT',
            state: contextUnknown
              ? 'unknown'
              : selected.length <= choice.pick && distinct === selected.length
                ? 'pass'
                : 'fail',
            entityId: grant.id,
            message:
              'Limite e ausência de repetição na mesma escolha, somando concessões da mesma origem',
            evidence: { choiceKey: key, selected: selected.length, maximum: choice.pick },
          });
          for (const s of selected) {
            let allowed: boolean | undefined;
            if (field === 'skillChoices' || field === 'expertise') {
              const rule = choice as NonNullable<ContentItem['skillChoices']>[number];
              allowed = s.kind === 'skill' && (!rule.from || rule.from.includes(s.name));
              if (rule.upgrade) allowed = undefined;
              else if (field === 'expertise') {
                allowed = allowed && s.rank === 2;
                if (
                  allowed &&
                  !selections.some(
                    (other) =>
                      other.kind === 'skill' && other.local_id === s.local_id && other.rank === 1
                  )
                )
                  allowed = undefined;
              } else allowed = allowed && s.rank === 1;
            } else if (field === 'toolChoices') {
              const rule = choice as NonNullable<ContentItem['toolChoices']>[number];
              const groups = typeof rule.group === 'string' ? [rule.group] : rule.group;
              allowed =
                s.rank === 1 &&
                ((s.kind === 'skill' && rule.skills === true) ||
                  (s.kind === 'tool' && (!groups || groups.includes(s.group_slug ?? ''))));
            } else {
              const rule = choice as NonNullable<ContentItem['languageChoices']>[number];
              allowed =
                s.kind === 'language' &&
                !s.is_always &&
                (rule.rare === true || s.tier === 'common');
            }
            findings.push({
              code: 'BENEFIT_CHOICE_OPTION',
              state:
                contextUnknown || allowed === undefined ? 'unknown' : allowed ? 'pass' : 'fail',
              entityId: s.id,
              message: 'Benefício entre as opções da escolha identificada no pacote',
              evidence: { kind: s.kind, choiceKey: key, name: s.name },
            });
          }
        }
    }
    for (const s of selections) {
      const source = sources.get(s.grant_id);
      if (s.selection_kind === 'chosen') {
        if (!options.some((o) => o.grantId === s.grant_id && o.choiceKey === s.choice_key))
          findings.push({
            code: 'BENEFIT_CHOICE_MAPPING',
            state: 'unknown',
            entityId: s.id,
            message: 'choiceKey sem correspondência direta com uma escolha do pacote',
            evidence: { kind: s.kind, choiceKey: s.choice_key },
          });
      } else {
        const fixed =
          s.kind === 'skill'
            ? s.rank === 2
              ? source?.data.expertiseFixed
              : source?.data.skillsFixed
            : s.kind === 'tool'
              ? source?.data.toolsFixed
              : source?.data.languagesFixed;
        findings.push({
          code: 'BENEFIT_FIXED_SOURCE',
          state:
            fixed?.includes(s.kind === 'skill' ? s.name : s.slug) &&
            !(s.kind === 'tool' && s.rank === 2)
              ? 'pass'
              : 'unknown',
          entityId: s.id,
          message:
            'Benefício fixo encontrado na origem; ausências podem depender de escolhas aninhadas',
          evidence: { kind: s.kind, name: s.name },
        });
      }
    }
    return { findings, options };
  }
}
