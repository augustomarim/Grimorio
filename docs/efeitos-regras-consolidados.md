# Efeitos e regras estruturados — backend D&D 2024

Esta entrega consolida o motor para os **13 campos realmente presentes em Feat.effects** da versão 0.5.1 de @freshmag/one-dndb. Não existe um resolvedor escrito individualmente para cada talento. O teste de cobertura enumera os campos do catálogo real e compara com os campos tratados. O texto original e os metadados de livro/suplemento continuam no catálogo.

## Atributos base e bônus

Decisão aprovada: os seis atributos de `dnd_character` são a base informada. A migração 0006 não presume bônus em fichas antigas. Quem já informou um valor com bônus embutido deve revisar a base antes de registrar esse mesmo bônus separadamente.

`character_ability_boost` registra concessão, regra, atributo e quantidade. O orçamento, a distribuição e os atributos permitidos vêm de `abilityBoosts` do catálogo. ASI permite +2 ou +1/+1; regras com um ponto não aceitam dois. Cada origem compartilha orçamento entre suas concessões; criar outro grant não duplica pontos. Instâncias diferentes de talento repetível têm orçamentos independentes.

O teto vem de cada regra (inclusive teto 30 quando declarado). A aplicação segue nível de aquisição, concessão, regra e id. Uma base já acima do teto não é reduzida. A API recusa uma distribuição que não possa ser aplicada integralmente ou que torne outra distribuição existente excedente. Alterar a base também respeita isso. Escolhas incompletas são permitidas em rascunho e aparecem como pendência.

`character_summary` e a ficha expõem atributos efetivos; `baseAttributes` permite editar a base. A projeção de PV usa Constituição efetiva, sem inventar níveis ausentes no histórico. O endpoint de atributos aceita uma lista vazia para remover a distribuição.

## Campos tratados

| Campo do catálogo | Tratamento |
|---|---|
| abilityBoosts | distribuição, opções, orçamento, máximo e resistência associada quando declarada |
| skillsFixed | projeção de proficiência fixa |
| skillChoices | opções, quantidade, nível e upgrade para expertise quando já proficiente |
| expertise | escolha de expertise com proficiência anterior identificada |
| expertiseFixed | projeção de expertise fixa |
| toolsFixed | proficiência fixa, sem multiplicar cópias |
| toolChoices | quantidade, grupo/ferramenta permitida e nível |
| languagesFixed | idiomas fixos |
| languageChoices | quantidade, idioma comum/raro e exclusão de idiomas automáticos da escolha |
| spellsFixed | grupo de concessão e vínculo de magia à regra de origem |
| spellChoices | filtros estruturados, quantidade, nível, lista/escola/ritual e vínculo explícito |
| armorTraining | categorias de armadura e nível |
| weaponTraining | categoria, alcance e filtros de propriedades with/without |

A projeção agrega proficiências sem somar duas vezes a mesma concessão; expertise prevalece sobre proficiência. Resistências de classe e de bônus com savingThrow são projetadas. Talentos fixos e escolhas de talentos dos campos ContentItem também têm identificação de origem, categoria, include, quantidade e nível. `suggests` é recomendação, não proibição.

## API

Leitura: `GET /characters/:id/effects`. Retorna base/efetivos, distribuições, proficiências projetadas, regras, grants e cobertura. Respeita acesso privado/público/admin da ficha.

Distribuição: `PUT /characters/:id/effects/:grantId/ability-boosts/:ruleId`:

```json
{"abilities":["intelligence","intelligence"]}
```

Escolha estrita de benefício: `POST /characters/:id/effects/:grantId/benefits`, com o mesmo corpo de benefício existente, sem grantId (ele está na URL). Para escolha, usar a choiceKey retornada em `/benefits/options`; origem fixa deve conceder o benefício, escolha deve ter regra identificada, respeitar filtros/quantidade/nível e pré-requisitos de talento comprovados. Erros não deixam gravação parcial. Regras inconclusivas retornam 409. A rota antiga de benefícios continua disponível para rascunhos e registros legados; não significa que a ficha esteja validada.

Magias continuam nos endpoints de magias e escolhas existentes. Concessões de talento com campos de magia recebem grupo técnico `app:feat-spells`; outras origens com campos diretos recebem `app:source-spells`. Criar grant da mesma origem reutiliza o grupo. Magic Initiate mantém a configuração compartilhada e a política específica já documentada no SRD; não se inventa uma regra geral equivalente para todo talento.

Prévia de exclusão e confirmação incluem os registros de bônus. Remover a origem remove suas dependências em cascata. Mudar uma base não converte valores efetivos em base automaticamente.

## Pré-requisitos e auditoria

`GET /characters/:id/validation` integra escolhas, capacidades, efeitos e pré-requisitos. As cláusulas estruturadas usam E entre grupos e OU dentro de cada grupo. Nível é o total das classes; regras de classe continuam usando nível individual. Campanha pode ser informada por `campaignSetting` no POST/PATCH da ficha; ausência mantém o requisito inconclusivo.

Um talento não usa seu próprio bônus para cumprir seu pré-requisito. O avaliador parte de talentos comprovados, resolve dependências progressivamente e não aprova ciclos por mera presença de registros. Efeitos de talentos concedidos pelo próprio talento também são excluídos dessa prova. Se um bônus de talento ainda não comprovado poderia satisfazer um requisito, o resultado é inconclusivo. Isso avalia o estado atual, não reconstrói atributos na data histórica de aquisição.

O relatório também identifica estilos de luta registrados simultaneamente como talento e estilo. Ele não apaga escolhas do usuário automaticamente.

## Limites explícitos

Cobrir os 13 campos estruturados **não significa executar todo o texto de D&D**. Condições como estar montado, usar determinada ação, alcance em mesa, frequência de uso, danos condicionais e substituição de uma perícia em circunstância específica podem existir apenas no texto. Ficam como referência, com aviso de revisão. Atributo de conjuração vinculado por texto ao atributo aumentado por um talento não é deduzido arbitrariamente; a configuração de Magic Initiate é a política confirmada especificamente. Suplementos não ganham certificação oficial por serem importados.

`rulesVerified` permanece false: não há certificação integral nem reconstrução de toda a história da ficha. Escolhas aninhadas além das magias conservam as limitações da auditoria documentada. O motor não consome espaços, rola dados, altera PV atuais ou executa combate; isso pertence à ficha interativa prevista para 1.5.

O próximo bloco pode tratar o fechamento operacional do backend e os cálculos derivados da ficha. Essa entrega encerra a implementação genérica dos campos estruturados acima, e não a automação de cada parágrafo dos livros.

## Atualização local

Pare o servidor e faça backup do SQLite. Extraia a atualização na raiz do projeto e execute:

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

O banco passa da versão 5 para 6, com 51 tabelas e 9 views. Não execute schema.sql sobre o banco existente. Schema, DBML, dicionário e exemplos estão atualizados. Os exemplos mantêm bônus não preenchidos, deliberadamente.

## Verificação executada nesta entrega

134 testes Vitest, 43 testes Python de modelo/migração e 76 verificações HTTP com servidor real passaram. Typecheck, build e formatação passaram. A migração 5→6 foi executada em banco temporário e conferida contra os atributos anteriores, sem bônus presumidos. O snapshot foi comparado à cadeia completa de migrações. O catálogo real confirma 13 campos em Feat.effects e 132 talentos com abilityBoosts. Não se verificou a renderização no site dbdiagram.io.
