import { readFileSync } from 'node:fs';
import * as data from '@freshmag/one-dndb/data';
import { displayName, indexCatalog, plannedClasses, projectCharacter, skillName } from './rules.js';
import { normalizeSearch, spellName } from './spells.js';
import { characterIssues } from './validation.js';

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const catalog = indexCatalog(
  { ...data, revision: data.REVISION, languagePick: data.reference.languagePick },
  read('pt-BR.json'),
  read('reference.json')
);

export function validatePublication(draft) {
  const projection = projectCharacter(draft, catalog);
  const issues = characterIssues(draft, projection, catalog);
  for (const group of projection.groups) {
    const supplied = draft.selected[group.key];
    if (supplied?.some((id) => !group.selected.includes(id))) {
      issues.push([group.section, `${group.source} · escolha inválida em ${group.name}`]);
    }
  }
  return { issues, selected: projection.validSelections };
}

export function publicGalleryMatcher({ search, classId, subclassId }) {
  const authorOnly = search.startsWith('@');
  const query = normalizeSearch(authorOnly ? search.slice(1).trim() : search);
  const terms = query ? query.split(/\s+/) : [];
  return ({ data, authorName }) => {
    const draft = { ...data, selected: data.selected ?? {} };
    const classes = plannedClasses(draft, catalog);
    if ((classId || subclassId) && !classes.some(({ entry, subclass }) =>
      (!classId || entry.id === classId) && (!subclassId || subclass?.id === subclassId))) return false;
    if (!terms.length) return true;
    if (authorOnly) return normalizeSearch(authorName).includes(query);

    const projection = projectCharacter(draft, catalog);
    const entries = [
      projection.species, projection.background,
      ...classes.flatMap(({ entry, subclass }) => [entry, subclass]),
      ...projection.feats, ...projection.features, ...projection.selectedFeatures,
      ...[...projection.tools].map((id) => catalog.byTool.get(id)),
      ...[...projection.languages].map((id) => catalog.byLanguage.get(id)),
    ].filter(Boolean);
    const haystack = normalizeSearch([
      draft.name,
      ...entries.flatMap((entry) => [displayName(entry), entry.name]),
      ...projection.spells.flatMap((spell) => [spellName(spell), spell.name]),
      ...[...projection.skills].map(skillName),
    ].filter(Boolean).join(' '));
    return terms.every((term) => haystack.includes(term));
  };
}
