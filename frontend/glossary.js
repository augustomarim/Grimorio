const terms = [
  [
    'Amedrontado',
    'amedrontad[oa]s?|assustad[oa]s?|condição (?:de )?medo|frightened',
    'Você tem desvantagem em testes de atributo e jogadas de ataque enquanto vê a fonte do medo. Você não pode se aproximar dela voluntariamente.',
  ],
  [
    'Agarrado',
    'agarrad[oa]s?|grappled',
    'Seu deslocamento é 0 e não pode aumentar. Você tem desvantagem em ataques contra outros alvos que não quem o agarrou. Essa criatura pode arrastar ou carregar você, gastando 1 pé adicional por pé percorrido, exceto se você for Minúsculo ou pelo menos duas categorias de tamanho menor.',
  ],
  [
    'Atordoado',
    'atordoad[oa]s?|stunned',
    'Você fica incapacitado e falha automaticamente em testes de resistência de Força e Destreza. Ataques contra você têm vantagem.',
  ],
  [
    'Caído',
    'caíd[oa]s?|derrubad[oa]s?|prone',
    'Você pode rastejar ou gastar metade do seu deslocamento, arredondada para baixo, para se levantar. Com deslocamento 0, você não pode se levantar. Seus ataques têm desvantagem. Ataques contra você têm vantagem a até 5 pés e desvantagem de mais longe.',
  ],
  [
    'Cego',
    'ceg[oa]s?|blinded|cegueira',
    'Você não enxerga e falha automaticamente em testes de atributo que dependem de visão. Seus ataques têm desvantagem e ataques contra você têm vantagem.',
  ],
  [
    'Enfeitiçado',
    'enfeitiçad[oa]s?|encantad[oa]s?(?= condição)|charmed',
    'Você não pode atacar quem o enfeitiçou nem tê-lo como alvo de habilidades ou efeitos mágicos que causem dano. Essa criatura tem vantagem em testes de atributo para interagir socialmente com você.',
  ],
  [
    'Envenenado',
    'envenenad[oa]s?|poisoned',
    'Você tem desvantagem em jogadas de ataque e testes de atributo.',
  ],
  [
    'Exaustão',
    'exaustão|exhaustion',
    'Cada nível reduz seus testes de d20 em 2 e seu deslocamento em 5 pés. Você morre ao chegar ao nível 6. Um descanso longo remove 1 nível.',
  ],
  [
    'Incapacitado',
    'incapacitad[oa]s?|incapacitated',
    'Você não pode usar ações, ações bônus ou reações, nem falar. Sua concentração termina. Se rolar iniciativa enquanto incapacitado, você tem desvantagem.',
  ],
  [
    'Inconsciente',
    'inconscientes?|unconscious',
    'Você fica incapacitado e caído, larga o que segura e não percebe o ambiente. Seu deslocamento é 0 e não pode aumentar. Você falha em testes de resistência de Força e Destreza. Ataques contra você têm vantagem, e acertos a até 5 pés são críticos. Ao despertar, você continua caído.',
  ],
  [
    'Invisível',
    'invisível|invisíveis|invisible',
    'Você tem vantagem na iniciativa se estiver invisível ao rolá-la. Efeitos que exigem ver o alvo não o afetam, salvo se puderem ver você. Contra quem não vê você, seus ataques têm vantagem e os ataques contra você têm desvantagem.',
  ],
  [
    'Paralisado',
    'paralisad[oa]s?|paralyzed',
    'Você fica incapacitado. Seu deslocamento é 0 e não pode aumentar. Você falha em testes de resistência de Força e Destreza. Ataques contra você têm vantagem, e acertos a até 5 pés são críticos.',
  ],
  [
    'Petrificado',
    'petrificad[oa]s?|petrified',
    'Você e seus pertences não mágicos viram matéria inanimada. Seu peso multiplica por dez e você para de envelhecer. Você fica incapacitado, tem deslocamento 0, falha em testes de resistência de Força e Destreza, resiste a todo dano e é imune à condição Envenenado. Ataques contra você têm vantagem.',
  ],
  [
    'Contido',
    'contid[oa]s?|restringid[oa]s?|restrained',
    'Seu deslocamento é 0 e não pode aumentar. Seus ataques e testes de resistência de Destreza têm desvantagem. Ataques contra você têm vantagem.',
  ],
  [
    'Surdo',
    'surd[oa]s?|deafened|surdez',
    'Você não escuta e falha automaticamente em testes de atributo que dependem de audição.',
  ],
  [
    'Congelamento',
    'congelad[oa]s?|frozen',
    'O efeito depende da descrição que causou o congelamento. Consulte esse trecho para saber se há mudança de deslocamento, transformação ou outra consequência.',
  ],
  [
    'Concentração',
    'concentração|concentration',
    'Você mantém um efeito de concentração por vez. Sofrer dano exige um teste de resistência de Constituição (CD 10 ou metade do dano, arredondada para baixo, o que for maior, até CD 30). Ficar incapacitado ou morrer encerra a concentração.',
  ],
  [
    'Resistência a dano',
    'resistência a(?:o)? danos?|resistance to [a-z]+ damage',
    'O dano do tipo indicado é reduzido à metade, arredondada para baixo.',
  ],
  [
    'Vulnerabilidade a dano',
    'vulnerabilidade a(?:o)? danos?|vulnerability to [a-z]+ damage',
    'O dano do tipo indicado é dobrado.',
  ],
  [
    'Imunidade a dano',
    'imunidade a(?:o)? danos?|immunity to [a-z]+ damage',
    'Você não sofre dano do tipo indicado.',
  ],
];

export const glossary = terms.map(([name, , description]) => ({ name, description }));
const matchers = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${terms.map(([, pattern]) => `(${pattern})`).join('|')})(?![\\p{L}\\p{N}])`,
  'giu'
);

export function annotateTerms(value, escape) {
  let end = 0;
  let result = '';
  for (const match of value.matchAll(matchers)) {
    const term = match.slice(1).findIndex(Boolean);
    result += escape(value.slice(end, match.index));
    result += `<button type="button" class="glossary-term" data-glossary="${term}">${escape(match[0])}</button>`;
    end = match.index + match[0].length;
  }
  return result + escape(value.slice(end));
}

export function installGlossary() {
  const tooltip = document.createElement('div');
  tooltip.id = 'glossary-tooltip';
  tooltip.className = 'glossary-tooltip';
  tooltip.role = 'tooltip';
  tooltip.popover = 'manual';
  const title = document.createElement('strong');
  const description = document.createElement('p');
  tooltip.append(title, description);
  document.body.append(tooltip);
  let active;

  const close = () => {
    if (!active) return;
    active.removeAttribute('aria-describedby');
    tooltip.hidePopover();
    active = undefined;
  };

  const open = (trigger) => {
    const term = glossary[trigger.dataset.glossary];
    if (!term || active === trigger) return;
    close();
    active = trigger;
    title.textContent = term.name;
    description.textContent = term.description;
    tooltip.showPopover();
    trigger.setAttribute('aria-describedby', tooltip.id);
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    tooltip.style.left =
      Math.max(
        gap,
        Math.min(rect.left, document.documentElement.clientWidth - tooltip.offsetWidth - gap)
      ) + 'px';
    tooltip.style.top =
      (rect.bottom + tooltip.offsetHeight + gap <= window.innerHeight
        ? rect.bottom + gap
        : Math.max(gap, rect.top - tooltip.offsetHeight - gap)) + 'px';
  };

  const termAt = (event) => event.target.closest?.('[data-glossary]');
  document.addEventListener('pointerover', (event) => {
    const term = termAt(event);
    if (term && event.pointerType !== 'touch') open(term);
  });
  const closeAfterHover = () => {
    if (active && !active.matches(':hover, :focus') && !tooltip.matches(':hover')) close();
  };
  document.addEventListener('pointerout', (event) => {
    if (termAt(event) || tooltip.contains(event.target)) {
      setTimeout(closeAfterHover, 140);
    }
  });
  document.addEventListener('focusin', (event) => {
    const term = termAt(event);
    if (term) open(term);
    else close();
  });
  document.addEventListener('click', (event) => {
    const term = termAt(event);
    if (term) open(term);
    else if (!tooltip.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  window.addEventListener('resize', close);
  window.addEventListener('hashchange', close);
  window.addEventListener('scroll', close, true);
}
