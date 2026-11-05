> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Proficiências, escolhas e progressão

Modelo físico para revisão: 49 tabelas e 6 views. Esta etapa inclui os benefícios discutidos e pontos de vida/progressão. Não implementa backend nem um motor completo de D&D 2024.

## Origem e escolha são informações diferentes

`character_rule_grant` registra uma regra que concede benefícios. Reutiliza o contrato de origem de magias: classe do próprio personagem, subclasse escolhida, espécie, antecedente ou instância de talento adquirido. FKs compostas impedem misturar personagens ou usar uma ferramenta como talento. A origem identifica uma regra/opção do catálogo; não há conteúdo personalizado.

`acquisition_context` distingue `initial_class`, `multiclass_entry`, `class_progression`, `species`, `background` e `feat`. `acquired_at_level` é o nível total em que o benefício foi adquirido. Entradas iniciais exigem nível 1, entradas por multiclasse exigem nível superior a 1. O serviço deve conferir a classe marcada como inicial e o histórico real: o CHECK não identifica sozinho qual classe era inicial.

`rule_key` é um identificador local estável da regra dentro do personagem, por exemplo `rogue/expertise`. Não é uma propriedade inventada da biblioteca. A biblioteca não oferece ids universais para cada característica; a integração precisa de um mapeamento explícito, versionado e revisável. O identificador local não autoriza regras personalizadas nem substitui a fonte normativa.

Um benefício possui `grant_id`, `selection_kind` (`fixed` ou `chosen`) e `choice_key`. Um elemento fixo não tem choice_key; um escolhido exige uma chave não vazia do grupo de escolha (ex.: `wizard/skills`). As opções escolhidas ficam em linhas relacionais, não em JSON. Contagem de escolhas, opções permitidas, substituições e pré-requisitos são responsabilidade do serviço. A chave local identifica o grupo; não comprova a legalidade da escolha.

## Tabelas de benefícios

| Tabela | O que registra |
|---|---|
| `character_skill` | Perícia e rank 1 (proficiência) ou 2 (especialização) por concessão |
| `character_saving_throw` | Proficiência em um dos seis testes de resistência |
| `character_armor_training` | Treinamento Light, Medium, Heavy ou Shield |
| `character_weapon_training` | Arma específica ou cláusula de categoria Simple/Martial, com faixa Melee/Ranged opcional |
| `character_weapon_training_property` | Propriedades aceitas (`require_any`, OR entre elas) e proibidas (`exclude`, nenhuma pode estar presente) em uma cláusula |
| `character_weapon_mastery` | Tipo de arma escolhido para utilizar sua maestria, separado de treinamento com a arma |
| `character_ability` | Talentos, ferramentas e idiomas existentes, agora com proveniência e escolhas; ferramentas têm rank 1/2, talentos e idiomas não têm rank |

`character_skill_summary` usa MAX do rank, não SUM: duas proficiências não viram especialização; duas especializações não quadruplicam o bônus. O número do bônus de proficiência e o modificador do atributo não são armazenados. Ferramentas também devem ser consolidadas por MAX no serviço/consulta. Não inferir vantagem ou especialização somente pela combinação ferramenta/perícia.

`character_weapon_proficiency` resolve as cláusulas contra os metadados das armas. Cada cláusula tem `clause_key` único por concessão; os resultados de várias concessões são unidos sem duplicar armas. `require_any` permite uma propriedade OU outra (Finesse OU Light), evitando conceder todas as armas marciais indevidamente. Regras que exigirem combinações de propriedades mais complexas precisam de extensão explícita, não texto livre.

Maestria é uma escolha de tipo de arma do catálogo, não de uma instância do inventário. Sua propriedade vem de `lib_weapon_definition.mastery_id`. O serviço valida treinamento, quantidade de armas, trocas permitidas e exceções de características. Substituições de maestria por ataque e efeitos transitórios não estão modelados.

## Novos catálogos

- `lib_skill`: 18 perícias derivadas das entradas `skill-*` de glossary no pacote 0.5.1. O atributo padrão é extraído do rótulo de kind e validado contra os seis atributos. O mestre ainda pode pedir um teste com outro atributo; esse evento não muda o catálogo.
- `lib_weapon_property`: 10 propriedades reais com JSON original.
- `lib_weapon_mastery`: 8 maestrias reais com JSON original.
- `lib_weapon_definition`: categoria, faixa e maestria, como projeção tipada de `lib_item.data.weapon`.
- `lib_weapon_property_link`: relação de tipos de arma e propriedades.
- Livros de perícias, propriedades e maestrias são relacionados por `catalog_entry_source`, como os demais tipos; não preencher procedência por suposição.

Na inspeção, propriedades e maestrias foram lidas do módulo empacotado interno, apenas para verificar o tarball 0.5.1. Esse caminho não é API pública e não deve virar dependência da aplicação. A futura carga deve usar a API pública Dexie (com IndexedDB compatível em Node) ou exportação oficialmente suportada. `/data` continua sem essas duas coleções.

A carga integral normalizou 38 definições de armas e 86 vínculos de propriedades presentes em `weapon`. Itens mágicos/famílias sem essa estrutura não recebem metadados inventados; resolver seus tipos-base exige curadoria. O JSON original de todos os itens é preservado.

## Progressão por nível

`character_level_entry` registra uma linha por nível total adquirido:

- `sequence_no`: posição 1–20, única por personagem.
- `character_class_id`: classe do personagem que recebeu esse nível.
- `hp_method`: `first_max` no primeiro nível; `average` ou `roll` nos demais.
- `hp_roll`: somente o resultado escolhido quando o método é roll; NULL nos outros métodos.

`character_level_history` calcula o nível da classe em cada passo com ROW_NUMBER. Não armazena um segundo nível da classe por linha. `character_class.level` continua representando a composição atual aprovada. O serviço deve garantir, na mesma transação, contagem por classe igual a esse nível, sequência contínua, soma até 20 e classe inicial compatível. As duas estruturas têm papéis distintos, mas sua coerência agregada não é imposta pelas FKs.

Requisitos de multiclasse, aquisição de subclasse e benefícios recebidos precisam ser conferidos em fonte normativa. Nem a existência do registro nem o texto do pacote comprovam esses requisitos.

## Pontos de vida

`character_hp_base` calcula ganho inicial pelo dado da classe, médias pelo dado/2 + 1, ou resultado rolado; aplica o modificador atual de Constituição a cada nível e mínimo de 1 por ganho. A Constituição atual é utilizada retroativamente. Os atributos atuais estão no perfil dnd_character, sem histórico completo de alterações de atributo.

`character_hit_point_bonus` permite concessões rastreáveis de bônus fixo, por nível total ou por nível de uma classe, com valor inteiro e origem. A fixture não atribui bônus fictícios aos personagens; cálculos adicionais são exercitados apenas nos testes isolados. O serviço precisa confirmar cada concessão e impedir empilhamentos proibidos.

`character_hit_point_summary.modeled_max_hit_points` soma a base e esses bônus. É o máximo calculado para o escopo modelado, não uma simulação de todos os efeitos de jogo. Não persistimos máximo derivado, modificador de Constituição nem média do dado. O serviço deve validar rolagem contra o dado real da classe (o CHECK geral apenas limita 1–12).

PV atuais, PV temporários, dados de vida gastos, efeitos temporários, descanso, ressurreição e estados de combate não foram incluídos. Bônus complexos e alterações de máximo com condições próprias exigem regra específica. Backup/restauração e migrações continuam pendentes.

## Exemplo e validação

Ari mantém Mago 3, Clérigo 4 e Feiticeiro 3, total 10, agora com dez entradas de evolução. Seu PV base é 66 usando médias e Constituição 14. Bela, Ladina de nível 1, demonstra Furtividade proficiente e especializada (resultado efetivo 2), treinamento leve, cláusula marcial com Finesse OU Light e escolha da maestria de Adaga. PV base de Bela é 9 com Constituição 12.

São exemplos parciais de armazenamento. Não representam todas as escolhas obrigatórias de uma ficha e não comprovam a legalidade integral de cada concessão antiga (incluindo escolhas obrigatórias não preenchidas na fixture). Os vínculos de origem desses exemplos precisam de curadoria normativa antes de uso como personagens reais.

Executar: `python3 -m unittest discover -s tests -v`, na raiz do repositório. O conjunto cria bancos em arquivos temporários e executa schema e sample-data reais. Verifica integridade, FKs, WAL, ranks sem soma, escolhas obrigatórias, contexto de aquisição, alvos tipados, pertencimento, filtros de propriedades, magias, histórico, PV, bônus, cascata e rollback. Os testes sintéticos não alteram o catálogo salvo.

A carga completa do catálogo também foi executada separadamente. Renderização do DBML no dbdiagram.io e validação normativa de todos os livros não foram executadas. Schema para banco novo; alterações de bancos existentes exigem migração e conciliação de origens, não devem ser aplicadas por DROP indiscriminado.

As relações entre concessões e talentos formam um grafo de dependências. O serviço deve impedir ciclos (por exemplo, talento concedendo a si próprio) e garantir que a origem preceda o benefício. As FKs validam existência e pertencimento, não ausência de ciclos. Também devem validar acquired_at_level contra o histórico e usar rule_key que diferencie ocorrências legítimas da mesma regra.

## Identidade comum do catálogo

Nomes, slugs e deprecated_at agora estão em catalog_entry. Cada tabela lib_* especializada usa catalog_entry_id e catalog_kind com FK composta para garantir o tipo. As referências do personagem continuam apontando aos ids especializados existentes. Os livros usam catalog_entry_source; consultar catalogo-comum.md e validacao-catalogo.sql.

## Fronteira entre sistemas

Estas tabelas e views são do módulo D&D e referenciam dnd_character, não a identidade genérica character. Atributos atuais estão em dnd_character. character_narrative permanece comum. A v1 não persiste o consumo de recursos de partida; essa evolução fica para a v1.5.

## Operação do banco

O histórico técnico schema_migration e a baseline numerada não alteram as regras descritas aqui. Migrações e recuperação local em WAL foram testadas; a automação de hospedagem permanece pendente. Consulte migracoes-backup-restauracao.md.

Atualização administrativa: refresh_token acrescenta renovação de autenticação ao núcleo comum. A revisão do schema é 3; não muda regras ou escolhas D&D. Consulte autenticacao-refresh-token.md.

Políticas atuais de acesso/publicação estão em contas-permissoes.md. A versão 3 acrescenta login_throttle e campos de moderação/vínculo de tokens, sem alterar regras de RPG.

Correção posterior da fixture: Human/Criminal; Alert e Thieves Tools concedidos por Criminal, e Thieves Cant por Rogue. Common não ocupa aquisição. Os três novos testes conferem esse mapeamento ao pacote, não à fonte oficial. A ficha continua parcial.
