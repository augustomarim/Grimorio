# Escolhas de perícias, especializações, ferramentas e idiomas

A auditoria em GET /characters/:id/validation agora reconhece escolhas diretas descritas no catálogo @freshmag/one-dndb 0.5.1. Não cria regras de RPG: interpreta skillChoices, expertise, toolChoices, languageChoices e listas fixas presentes nos dados reais. Continua sendo auditoria do estado atual; não bloqueia a gravação de rascunhos.

## Descobrir escolhas

GET /characters/:id/benefits/options retorna escolhas das origens para as quais já há uma concessão salva. A rota segue as permissões de leitura da ficha. Não retorna todas as escolhas de todo o catálogo nem cria concessões. Cada item contém:

- grantId: concessão existente que aponta para a origem.
- choiceKey: identificador de associação usado pela aplicação.
- field: campo do pacote, como skillChoices ou expertise.
- rule: objeto da escolha preservado, incluindo id, pick, from, group e level quando disponíveis.
- available: nível atual da origem atende ao level da escolha; não representa elegibilidade completa.
- scope: identifica a origem para somar escolhas sem multiplicar o orçamento.

A convenção de choiceKey é `<campo>:<id da escolha>`. É uma convenção da aplicação, não um método ou propriedade nova do pacote. Exemplos reais:

- Mago: skillChoices:training (duas perícias da lista).
- Mago: expertise:scholar (uma especialização, nível 2).
- Skilled: toolChoices:benefit-1 (três escolhas combinando perícias e ferramentas).

Use a choiceKey retornada ao incluir o benefício pela rota POST /characters/:id/benefits. O localId da perícia vem de GET /catalog/skill: os slugs são como skill-arcana, e não arcana. Para registrar a proficiência e depois a especialização da mesma perícia, use concessões distintas, conforme a unicidade por concessão do banco. Notas não identificam escolhas.

## Verificações

- BENEFIT_CHOICE_MAPPING: chave legada ou não reconhecida permanece unknown; não é convertida automaticamente.
- BENEFIT_CHOICE_LEVEL: disponibilidade no nível individual da classe/subclasse ou no nível total para as demais origens.
- BENEFIT_CHOICE_LIMIT: teto pick e ausência de repetição dentro da mesma escolha. Soma benefícios de várias concessões da mesma origem e chave. Instâncias diferentes de um talento repetível têm orçamentos independentes.
- BENEFIT_CHOICE_OPTION: perícia na lista from, graduação correspondente a proficiência/especialização, ferramenta em group e idioma em tier permitido. ToolGrant.skills combina perícias e ferramentas no mesmo orçamento.
- BENEFIT_FIXED_SOURCE: reconhece benefícios explicitamente presentes nas listas fixas da origem. Ausência retorna unknown, pois pode haver escolhas aninhadas. Proficiência fixa em ferramenta não comprova especialização em ferramenta.

Especialização sem registro separado de proficiência permanece unknown. Escolhas upgrade também permanecem unknown: o estado atual não demonstra a ordem anterior da aquisição. Para idioma, rare habilita os raros; sem rare, a escolha é limitada aos comuns, excluindo idiomas marcados como sempre concedidos (is_always).

## Limites

Não são exigidas todas as escolhas em uma ficha em edição. Não há certificação integral: rulesVerified permanece false. Não são resolvidas automaticamente escolhas aninhadas em opções de linhagem ou outras seleções, substituições permitidas pelo mestre, elegibilidade histórica ou escolha com graduação upgrade. Benefícios de entrada multiclasse permanecem unknown, assim como escolhas iniciais de classe registradas em contexto incompatível. A disponibilidade do endpoint de opções só indica nível e não elimina essas ressalvas.

Não há migração, alteração de schema/DBML ou dependência nova. Testes HTTP exercitam escolhas reais de Wizard, Skilled, Artisan e Echoing Soul, chave legada, restrição de acesso e soma de limites entre concessões.
