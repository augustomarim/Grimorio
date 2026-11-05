# Cálculos derivados da ficha — D&D 2024

`GET /characters/:id/derived` calcula os valores usando o estado persistido. Usa a mesma política de acesso da ficha (dono/admin, ou visitante quando pública e elegível). A leitura é uma transação consistente e não grava totais ou modificadores. O schema continua na versão 6; não há tabelas, colunas ou migrações adicionais nesta etapa.

## Contrato

- `totalLevel`: soma dos níveis das classes. `proficiencyBonus`: +2 nos níveis 1–4, +3 em 5–8, +4 em 9–12, +5 em 13–16, +6 em 17–20.
- `attributes`: base, efetivos e modificadores floor((efetivo−10)/2), inclusive valores negativos.
- `skills`: cada perícia do catálogo, atributo padrão, rank, contribuição e bônus. Proficiência soma PB uma vez; expertise soma 2×PB. Proficiências fixas e registradas se combinam pelo maior rank, não pela soma.
- Bardo 2+ com Jack of All Trades: metade do PB arredondada para baixo nas perícias sem proficiência. Não concede proficiência, não acumula com expertise e não é aplicada à iniciativa — a redação de 2024 exige uma perícia.
- `savingThrows`: bônus de testes de resistência dos seis atributos. Não significa resistência a dano. Usa as proficiências projetadas pelo motor de efeitos.
- `initiative`: Destreza e contribuição de Alert quando presente, uma única vez. Não rola dados nem executa troca de iniciativa. Outros efeitos textuais podem exigir revisão.
- `passivePerception`: 10 + bônus modelado de Perception, sem vantagem/desvantagem situacional.
- `armorClass`: candidatos, bônus de escudo, valor modelado, problemas e penalidades de equipamento. `value` é nulo quando há informação ambígua detectada; `modeledValue` preserva o cálculo básico disponível. Não é certificação de todos os efeitos textuais possíveis.
- `hitPoints`: PV base e máximo modelado com Constituição efetiva e bônus explicitamente registrados. Se o histórico de níveis estiver incompleto, os dois valores são nulos. Não representa PV atuais nem temporários.

O relatório expõe `rulesVerified:false`, limitações e `textEffectsRequiringReview`. Os valores refletem as escolhas registradas, inclusive rascunhos; conferir `/validation` para pré-requisitos e integridade das escolhas.

## Armadura

As fórmulas comuns são lidas de `Item.ac`: número fixo, base + Destreza e base + Destreza com máximo 2. Um modificador negativo não é descartado por esse máximo. O parser aceita apenas essa gramática; não executa texto do catálogo.

Sem armadura: 10 + Destreza. Monge com Unarmored Defense e sem armadura/escudo: 10 + Destreza + Sabedoria. Bárbaro com Unarmored Defense sem armadura: 10 + Destreza + Constituição; permite escudo. São candidatos alternativos, jamais somados; o maior disponível é recomendado no valor modelado.

O inventário com equipped=1 é interpretado como armadura vestida/escudo empunhado; ocupação de mãos e tempo para vestir não são simulados. Escudo comum concede +2 apenas com treino. Equipar escudo sem treino impede a defesa do monge mesmo sem conceder CA. Armadura sem treino continua definindo sua CA, mas o relatório indica desvantagem em testes de Força/Destreza e impossibilidade de conjurar. Requisito de Força é comparado com o atributo efetivo exato, sem reconstruí-lo pelo modificador. Indica também a desvantagem de furtividade declarada no item.

Duas armaduras, dois escudos, quantidade equipada diferente de um ou fórmula desconhecida impedem definir CA final. Equipamento mágico equipado requer revisão: o registro genérico +1 Armor não determina qual armadura base foi escolhida. Não se presume couro nem placa. Efeitos de CA encontrados no texto de características/talentos também pedem revisão, sem tentar interpretar seus parágrafos como fórmulas.

Esta etapa não modela escolha de variante de item mágico, sintonização, estados de combate, magias ativas ou bônus condicionais. Dados derivados não substituem a auditoria da ficha.

## Fontes conferidas

PDF oficial SRD 5.2 fornecido pelo usuário: regras de CA (p. 7), proficiência (p. 8), registro da ficha (p. 22), multiclasse/CA (p. 25), defesa do bárbaro (p. 29), Jack of All Trades (p. 32), defesa do monge (p. 50), Alert (p. 87) e armaduras (p. 91). Dados de armaduras, perícias e características: pacote real @freshmag/one-dndb 0.5.1. As regras de cálculo são políticas da aplicação, conferidas no SRD; não são métodos inventados do pacote.

This work includes material taken from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

## Instalação

Extrair o ZIP na raiz do projeto e reiniciar com `npm.cmd run dev`. Se a atualização de efeitos anterior ainda não foi aplicada, executar `npm.cmd run db:migrate` antes de iniciar. O ZIP cumulativo inclui essa migração. Não executar schema.sql sobre banco existente.

## Verificação desta etapa

147 testes Vitest passaram, incluindo fórmulas, acesso privado, armadura/escudo, requisito de Força ímpar, magia sem variante base, Jack of All Trades, Alert, multiclasse com defesas alternativas, histórico incompleto e regressão dos módulos anteriores. Build, typecheck, formatação e git diff --check passaram. O schema não foi modificado nesta etapa; os resultados anteriores de modelo/migração estão documentados na entrega de efeitos.
