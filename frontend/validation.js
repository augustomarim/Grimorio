import {
  abilities,
  classPlan,
  pointBudget,
  pointCosts,
  pointsSpent,
  progressionRequirements,
  standardScores,
} from './rules.js';
import { deriveCharacter } from './mechanics.js';

export function attributeIssue(draft) {
  const scores = abilities.map(([id]) => draft.scores[id]);
  if (draft.method === 'array') {
    if (new Set(scores).size !== scores.length)
      return 'Há valores repetidos. Use cada valor do conjunto padrão uma única vez.';
    if (!scores.every((value) => Object.values(standardScores).includes(value)))
      return 'Use os seis valores do conjunto padrão.';
  } else if (draft.method === 'points') {
    if (!scores.every((value) => Object.hasOwn(pointCosts, value)))
      return 'Na compra por pontos, os valores base vão de 8 a 15.';
    if (pointsSpent(draft.scores) > pointBudget)
      return 'Você passou do limite de 27 pontos. Diminua um ou mais atributos.';
  } else if (scores.some((value) => !Number.isInteger(value) || value < 3 || value > 18)) {
    return 'Informe um número inteiro de 3 a 18 para cada atributo.';
  }
}

export function characterIssues(draft, projection, catalog) {
  const pending = [];
  if (!draft.name.trim()) pending.push(['origem', 'Nome']);
  if (projection.species?.collection !== 'species') pending.push(['origem', 'Espécie']);
  if (projection.background?.collection !== 'backgrounds') pending.push(['origem', 'Antecedente']);
  classPlan(draft).forEach((id, index) => {
    if (catalog.byContent.get(id)?.collection !== 'classes')
      pending.push(['progressao', `Classe do nível ${index + 1}`]);
  });
  for (const requirement of progressionRequirements(draft, projection))
    pending.push(['progressao', requirement]);
  if (attributeIssue(draft)) pending.push(['atributos', 'Distribuição dos atributos']);
  for (const warning of deriveCharacter(draft, projection, catalog).warnings.filter(
    (message) => !message.startsWith('Falta treinamento')
  ))
    pending.push([warning.startsWith('PV do nível') ? 'progressao' : 'equipamento', warning]);
  return [
    ...pending,
    ...projection.ruleIssues,
    ...projection.groups
      .filter((group) => projection.pending.includes(group.key))
      .map(({ section, source, name }) => [section, `${source} · ${name}`]),
  ];
}
