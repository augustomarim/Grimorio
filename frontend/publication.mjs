import { readFileSync } from 'node:fs';
import * as data from '@freshmag/one-dndb/data';
import { indexCatalog, projectCharacter } from './rules.js';
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
