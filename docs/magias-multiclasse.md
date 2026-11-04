# Magias, concessões, preparação e grimório

Proposta física aprovada nesta etapa: 49 tabelas e 6 views. Os exemplos demonstram armazenamento e integridade; não constituem uma ficha integralmente validada contra todos os livros de D&D 2024.

## Concessão: character_spell

Uma linha identifica uma magia e a origem que concede seu uso. A mesma magia pode aparecer por Mago e Clérigo no mesmo personagem. Não há mais UNIQUE global de personagem e magia nem origem genérica `manual`.

| Coluna | Significado |
|---|---|
| `character_id` | Dono da concessão |
| `lib_spell_id` | Magia real do catálogo |
| `origin_kind` | class, subclass, species, background ou feat |
| `origin_character_class_id` | Instância de classe do próprio personagem; usada em class e subclass |
| `origin_subclass_id` | Subclasse escolhida nessa instância; preenchida apenas em subclass |
| `origin_species_id` | Espécie atual do personagem; apenas em species |
| `origin_background_id` | Antecedente atual do personagem; apenas em background |
| `origin_character_ability_id` e `origin_feat_id` | Instância adquirida e talento associado; ambos exigidos em feat |
| `preparation_mode` | cantrip, selectable, always_prepared ou granted |
| `is_prepared` | Escolha do jogador; só pode ser 1 em selectable |
| `casting_ability_choice` | Atributo escolhido quando a concessão permite escolha; não armazena o atributo já determinado pela classe |
| `notes` | Observações sem substituir dados estruturados necessários às regras |

CHECKs exigem uma origem coerente. FKs compostas garantem pertencimento ao mesmo personagem, subclasse escolhida e talento realmente adquirido (uma ferramenta não pode ser usada como origem de talento). Índices UNIQUE parciais impedem repetir a mesma magia pela mesma origem. Duas instâncias de um talento repetível podem constituir origens distintas.

`preparation_mode` representa o regime da concessão, a ser atribuído pelo serviço a partir de regras confirmadas. `always_prepared` não é uma escolha manual. `granted` representa uma permissão específica que não usa a preparação escolhida; o regime não define sozinho quantas conjurações gratuitas existem, quando recarregam ou se permite usar espaços. Esses detalhes continuam pendentes de modelagem normativa.

Nesta versão, duas características diferentes da mesma classe que concedem a mesma magia são consolidadas em uma concessão de classe; o pacote não fornece ids universais para cada característica. Condições conflitantes exigem revisão antes da implementação. A mesma limitação vale para diferentes concessões dentro da mesma espécie ou antecedente.

## Grimório: character_spellbook_entry

Registra `character_id`, `character_class_id`, `lib_spell_id`, `created_at` e `notes`. A FK composta garante a classe do próprio personagem. A combinação classe e magia é única.

Ter uma entrada não prepara a magia. Remover a preparação não apaga a entrada. O serviço precisa garantir que a classe use grimório e que a magia e seu nível sejam elegíveis. A FK por si não restringe à classe Mago. O modelo considera um grimório lógico por classe; cópias físicas, perda ou destruição de livros não estão modeladas.

## Responsabilidades do serviço

- Validar a existência e elegibilidade da concessão, seu nível e a preparação permitida por classe.
- Validar os truques, os requisitos do grimório e a correspondência entre preparação do Mago e magias inscritas, ressalvadas exceções normativas.
- Validar atributos escolhidos e derivar atributo fixo, CD, ataque, limites de preparação e espaços.
- Calcular progressão multiclasse de Conjuração e Magia de Pacto separadamente, sem presumir regras de arredondamento antes de conferência normativa.
- Reconciliar concessões ao trocar espécie, antecedente, subclasse ou talento. Remoção do registro de classe/talento apaga concessões dependentes; mudança de chaves referenciadas é bloqueada até reconciliação em transação.
- Tratar talentos concedidos por antecedentes como origem feat quando o talento efetivamente concede a magia, preservando o vínculo à instância adquirida. Origem background é para concessão direta.

Não foram criadas tabelas para espaços gastos, recargas, conjurações gratuitas ou uso de recursos em sessão. Persistência desses estados depende do escopo futuro de gerenciamento de jogo.

## Validação executada

SQLite 3.53.1 em banco em arquivo, WAL e foreign_keys habilitados. Schema e fixture executados. Luz aparece duas vezes (Mago e Clérigo); Mísseis Mágicos possui entrada no grimório e concessão preparada do Mago. Nível total permanece 10.

Onze violações rejeitadas: concessão repetida, origem ausente, duas origens, preparação manual de truque, marcação manual de sempre preparada, magia inexistente, subclasse diferente da escolhida, talento não adquirido, entrada duplicada no grimório, classe de outro personagem e grimório de outro personagem. Também executados: retirada de preparação preservando grimório, exclusão em cascata preservando catálogo, rollback, foreign_key_check e integrity_check.

`validacao-magias.sql` contém consultas com resultados esperados e asserções positivas reproduzíveis no banco de exemplo. Os testes de rejeição acima foram executados com ferramenta temporária fora do repositório. DBML não foi renderizado no site; não há alegação de validação normativa completa.

O schema é para banco novo. Dados antigos com origem apenas textual exigem conciliação, não é possível inventar a concessão correta a partir de `manual`.

## Relação com a etapa de proficiências

Talentos em character_ability agora possuem grant_id e contexto de escolha, sem alterar o vínculo da concessão de magia à instância do talento. Histórico por nível e PV foram incluídos em estruturas próprias; não calculam espaços de magia. O regime de magias descrito aqui permanece inalterado.

## Identidade comum do catálogo

Nomes, slugs e deprecated_at agora estão em catalog_entry. Cada tabela lib_* especializada usa catalog_entry_id e catalog_kind com FK composta para garantir o tipo. As referências do personagem continuam apontando aos ids especializados existentes. Os livros usam catalog_entry_source; consultar catalogo-comum.md e validacao-catalogo.sql.

## Fronteira entre sistemas

Estas tabelas e views são do módulo D&D e referenciam dnd_character, não a identidade genérica character. Atributos atuais estão em dnd_character. character_narrative permanece comum. A v1 não persiste o consumo de recursos de partida; essa evolução fica para a v1.5.

## Operação do banco

O histórico técnico schema_migration e a baseline numerada não alteram as regras descritas aqui. Migrações e recuperação local em WAL foram testadas; a automação de hospedagem permanece pendente. Consulte migracoes-backup-restauracao.md.

Atualização administrativa: refresh_token acrescenta renovação de autenticação ao núcleo comum. A revisão do schema é 3; não muda regras ou escolhas D&D. Consulte autenticacao-refresh-token.md.

Políticas atuais de acesso/publicação estão em contas-permissoes.md. A versão 3 acrescenta login_throttle e campos de moderação/vínculo de tokens, sem alterar regras de RPG.
