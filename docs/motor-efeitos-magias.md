> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Motor geral para efeitos estruturados de magia

## Escopo

O resolvedor lê Feat.effects.spellsFixed e Feat.effects.spellChoices do pacote @freshmag/one-dndb 0.5.1. No catálogo dessa versão há 53 talentos com esses campos. Magic Initiate mantém sua política específica de configuração compartilhada, confirmada no SRD; os outros 52 usam a mesma projeção genérica. Não há código selecionando Fey Touched, Shadow Touched ou Ritual Caster pelo nome para aplicar seus critérios de magia.

Isso é cobertura dos campos estruturados, não certificação de todos os efeitos desses talentos. Aumentos de atributo, relações entre escolhas expressas só em texto, exceções de preparo/atributo e concessões gratuitas ainda precisam de resolução. A auditoria informa FEAT_SPELL_EFFECTS_PARTIAL=unknown para esses grupos; rulesVerified continua false.

## Critérios interpretados

| Campo do pacote | Tratamento |
|---|---|
| spellsFixed[].id | Correspondência da magia fixa |
| spellsFixed[].level | Nível de liberação da concessão, não nível da magia |
| spellChoices[].spellLevel | Nível exato da magia |
| spellChoices[].maxSpellLevel | Teto de nível da magia |
| spellChoices[].list / lists | Lista ou listas permitidas |
| spellChoices[].schools | Escolas permitidas |
| spellChoices[].ritual | Exige o marcador de ritual |
| spellChoices[].pick | Quantidade máxima na escolha |
| spellChoices[].pickProficiency | Quantidade calculada pelo bônus de proficiência do nível total |
| spellChoices[].level | Liberação da escolha |

Os mesmos critérios servem para qualquer talento com essa estrutura. Os grupos de magia fixa usam cantrip em nível 0 e always_prepared para magias de nível maior conforme o contrato atual dos vínculos. Exceções não estruturadas não são presumidas válidas por esse tratamento; exigem ampliação do contrato. Magias cuja origem ou registro de catálogo está depreciado não recebem novas atribuições; registros históricos continuam consultáveis.

## Registro automático do vínculo técnico

1. Registre a instância do talento em POST /characters/:id/benefits.
2. Registre sua concessão em POST /characters/:id/grants com originKind=feat e originId da instância do talento.
3. Para efeitos de magia genéricos, a resposta inclui spellChoiceInstanceId. O vínculo técnico é criado na mesma transação da concessão.
4. Registre as magias via POST /characters/:id/spells com originKind=feat, originId da mesma instância e choiceInstanceId retornado.

A chave é spellsFixed:<id da magia> ou spellChoices:<id da escolha real do pacote>. O backend organiza os vínculos em character_choice usando choice_id=app:feat-spells e option_id=catalog. São convenções da aplicação; não alteram o JSON original nem afirmam a existência de uma opção no pacote. GET /characters/:id/choices identifica esse grupo com automatic=true, para que o cliente não imponha uma seleção artificial ao jogador.

Criar uma segunda concessão para a mesma instância reutiliza o grupo existente e seu orçamento. Instâncias diferentes do talento têm vínculos próprios, sujeitos à repetibilidade e outras regras de elegibilidade que o relatório cobre parcialmente. Não são geradas magias automaticamente: a API de magias registra as escolhas efetivas e as concessões fixas.

Magic Initiate exige escolha real de lista e atributo e continua seguindo magic-initiate-backend.md; não recebe automaticamente uma configuração arbitrária.

## Exemplos executados no catálogo real

- Fey Touched: Misty Step fixa e uma magia de nível 1 das escolas Divination ou Enchantment.
- Shadow Touched: Invisibility fixa e uma magia de nível 1 das escolas Illusion ou Necromancy.
- Ritual Caster: magias de nível 1 com Ritual e quantidade pelo bônus de proficiência. Ao passar do nível total 4 ao 5, o orçamento sobe de 2 para 3 sem persistir um valor derivado.

São exemplos de testes, não ramificações do motor por nome de talento. A pré-condição de aquisição do talento continua no relatório de elegibilidade. O novo motor não passa a bloquear todo salvamento de ficha parcial por essas pré-condições.

## Legados

Concessões e magias já existentes não são reatribuídas em leituras. Para uma concessão antiga sem grupo, o cliente pode registrar o vínculo por POST /characters/:id/choices com choiceId=app:feat-spells e optionId=catalog. Também é possível registrar outra concessão da mesma instância; o serviço reutiliza o grupo se existir. Magias antigas são associadas explicitamente por POST /characters/:id/spells/:instanceId/nested-origin, mantendo as verificações de origem, ids e notas.

## Exclusão com dependências

Excluir um talento pode remover concessões, escolhas, magias e outros benefícios derivados. DELETE /characters/:id/benefits/:kind/:instanceId retorna 409 se houver dependências além da própria instância.

Use POST /characters/:id/benefits/:kind/:instanceId/removal-preview e, após revisar as remoções, envie o token na query do DELETE: ?confirmationToken=<token>. O token fica vinculado à ação, tipo, instância e estado atual. Remoções simples, sem dependentes, continuam diretas. Permissão do dono e Origin permitido continuam obrigatórios; administrador não edita ficha alheia.

O grupo automático e as magias são preservados se a exclusão não for confirmada ou falhar. Catálogos e origens independentes não são apagados. As mesmas regras de prévia/rollback descritas em reconciliacao-personagens.md se aplicam. As mensagens 409 indicam a rota de prévia correspondente a cada operação.

## Atualização e limites

Sem migração, nova tabela ou dependência. Requer a versão 5 do banco da entrega anterior. O modelo físico continua igual; o dicionário documenta a nova convenção de chave.

Ainda faltam resolver efeitos de aumento de atributo, habilidade de conjuração quando vinculada a escolhas não persistidas, condições que aparecem apenas em texto, usos gratuitos, recursos de combate e regras normativas de suplementos. O motor não interpreta texto livre como uma regra executável. Os requisitos externos e a classificação dos livros seguem as limitações do catálogo atual.

A projeção foi testada sobre todos os 52 registros genéricos reais, preservando seus objetos, e os testes HTTP exercitam critérios válidos/inválidos, orçamento dinâmico, reutilização de vínculo, auditoria parcial e exclusão confirmada com cascata.
