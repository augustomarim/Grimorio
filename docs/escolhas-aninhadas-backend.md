# Escolhas aninhadas: registro e auditoria

## Origem dos dados

Os ids e opções vêm de ContentItem.choices[].options[] do pacote @freshmag/one-dndb 0.5.1. Exemplos executados: Elf → lineage → drow, e Ranger → fighting-style → druidic-warrior. O serviço não inventa opções ausentes. A migração 0004 cria character_choice para registrar a seleção de modo relacional; schema.sql, modelo.dbml, sample-data.sql e o dicionário foram atualizados. Migrações 0001–0003 permanecem imutáveis.

## Rotas

- GET /characters/:id/choices: seleções existentes, escolhas disponíveis nas origens que já têm concessões e achados de auditoria.
- POST /characters/:id/choices: `{ "grantId": 1, "choiceId": "lineage", "optionId": "drow" }` (ids ilustrativos).
- DELETE /characters/:id/choices/:instanceId: exclui somente a seleção.

O grantId deve pertencer ao personagem. choiceId e optionId precisam existir na origem do grant. Para uma linhagem de elfo, crie primeiro uma concessão de origem species apontando para a espécie elf do personagem. A API aplica o nível mínimo e o teto pick do pacote, somando concessões da mesma origem; não permite repetir a opção para ganhar orçamento adicional. Origem depreciada não aceita nova seleção. Entrada multiclasse retorna 409 para escolhas ainda não verificadas nesse contexto.

As permissões de leitura são as da ficha, e somente o dono pode escrever. Escritas exigem Origin permitido. Inclusão/exclusão, revisão do catálogo, data da ficha e auditoria participam da mesma transação. A FK composta impede vínculo com concessão de outro personagem. Exclusão da concessão/personagem remove as seleções por CASCADE.

As seleções não geram automaticamente magias, equipamentos ou características. Remover uma seleção não exclui registros independentes em character_spell ou inventário. Não se deve presumir que a remoção retira esses efeitos sem revisão da ficha.

## Auditoria

GET /characters/:id/validation agora inclui os achados de opções selecionadas. NESTED_OPTION reconhece a opção na origem atual. NESTED_OPTION_LEVEL compara o nível mínimo com o nível atual individual de classe/subclasse ou total para espécie e demais origens.

NESTED_FIXED_SPELL compara spellsFixed da opção com magias registradas na mesma origem. Exemplo: Drow concede Dancing Lights a partir do nível 1, Faerie Fire a partir do 3 e Darkness a partir do 5. Magia presente antes do nível indicado gera fail; presente após a liberação gera pass para essa condição de presença. Magia ausente gera unknown, pois a ficha pode ser rascunho e há substituições ainda não representadas. Não é conferido o modo de preparação ou atributo por esse achado. Os dados free de usos gratuitos são expostos como referência, sem criar consumo de recursos.

SpellChoices aninhadas, como os dois truques de druida de Druidic Warrior, são expostas com suas restrições reais, mas a associação de cada magia a essa escolha continua unknown: character_spell ainda não aponta para uma opção selecionada específica. Não se presume elegibilidade completa pela mera existência da magia na mesma origem.

Opções dinâmicas de choice.source que não estejam explicitamente presentes no JSON local não são inventadas ou aceitas. Opções apenas descritivas podem ser registradas; equipamentos e efeitos delas não são aplicados automaticamente. Escolhas ainda não selecionadas aparecem em options, sem forçar seu preenchimento em rascunhos. rulesVerified permanece false; esta etapa não conclui a validação integral de D&D 2024 ou de multiclasse.

## Atualização

Pare o servidor, extraia os arquivos e execute `npm.cmd run db:migrate` antes de `npm.cmd run dev`. Não execute schema.sql sobre o banco existente e não apague seu banco. A migração somente adiciona a tabela e o índice. Não há dependências novas.

## Testes

A suíte cobre seleção persistente de Drow, orçamento compartilhado entre concessões da espécie, ids inválidos, isolamento por personagem, exclusão, cascata do personagem, rollback de auditoria, magias de linhagem por nível e escolha Druidic Warrior antes/depois do nível 2. Os testes Python comparam o snapshot com a cadeia de migrações e os dados de exemplo e exercitam a atualização de bancos anteriores.
