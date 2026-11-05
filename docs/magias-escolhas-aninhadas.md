# Vínculo explícito entre magia e opção escolhida

## Modelo e migração 0005

character_spell recebe choice_instance_id e nested_choice_key, ambas nulas ou preenchidas juntas. A FK composta (character_id,choice_instance_id) aponta para character_choice(character_id,id) e assegura o mesmo personagem. ON DELETE CASCADE exclui a magia vinculada quando sua opção deixa de existir. O índice único de apoio fica em character_choice(character_id,id).

A migração reconstrói character_spell preservando todos os campos e ids legados, o contador autoincremental e os índices. Nenhum vínculo é inferido para registros antigos. Não cria nova tabela: o banco permanece com 50 tabelas e 6 views, agora versão 5.

Unicidade: magias sem vínculo explícito mantêm os índices parciais anteriores por origem; magias vinculadas usam UNIQUE(character_id,choice_instance_id,nested_choice_key,lib_spell_id). Isso permite permissões distintas para a mesma magia, sem duplicar uma magia dentro da mesma escolha. A lista de magias continua mostrando instâncias por origem/permissão; não as funde silenciosamente.

## Criar magia vinculada

POST /characters/:id/spells conserva os campos anteriores e aceita o par opcional choiceInstanceId e nestedChoiceKey. choiceInstanceId é o id de character_choice obtido em GET /characters/:id/choices ou POST de seleção. Não é o id textual da opção da biblioteca.

```json
{
  "spellId": 1,
  "originKind": "class",
  "originId": 1,
  "preparationMode": "cantrip",
  "choiceInstanceId": 1,
  "nestedChoiceKey": "spellChoices:druidic-warrior"
}
```

Ids numéricos ilustrativos. Consulte /catalog/spell para o localId da magia, /choices para a opção selecionada e a ficha para a instância de classe. A origem precisa ser exatamente a mesma da concessão associada à opção, não apenas pertencer ao mesmo personagem.

Convenções de chave da aplicação:

- spellsFixed:<slug da magia>: concessão fixa da opção, como spellsFixed:dancing-lights.
- spellChoices:<id da escolha>: escolha da opção, como spellChoices:druidic-warrior.

Os prefixos são convenções locais. Os ids, listas, níveis, escolas, ritual e limites vêm dos campos reais ChoiceOption.spellsFixed e ChoiceOption.spellChoices do pacote @freshmag/one-dndb 0.5.1. Nenhum método de validação de personagem da biblioteca foi inventado.

## Atribuir uma magia legada

POST /characters/:id/spells/:instanceId/nested-origin:

```json
{ "choiceInstanceId": 1, "nestedChoiceKey": "spellChoices:druidic-warrior" }
```

Preserva o id e as notas, aplicando as mesmas verificações de nova associação. Não permite trocar um vínculo existente por outro: para corrigir a origem de uma instância vinculada, remova a instância e registre novamente. Magias e origens depreciadas continuam legíveis, mas não recebem novas associações. A migração não modifica suas origens automaticamente.

## Verificações e auditoria

Novas atribuições explícitas são recusadas quando violam:

- pertencimento ao personagem ou compatibilidade de origem;
- existência da opção e da chave no catálogo atual;
- nível de liberação da opção e da concessão;
- magia fixa correta, com cantrip para nível 0 ou always_prepared para nível maior;
- spellLevel/maxSpellLevel, list/lists, schools e ritual quando descritos pela escolha;
- quantidade pick, ou pickProficiency quando o pacote indica orçamento pelo bônus de proficiência.

O bônus de proficiência para esse orçamento usa o nível total, segundo o SRD 5.2. O serviço não cria nem consome usos de magia gratuitos. FreeCasts permanece referência do catálogo. Escolhas de magia não fixas têm o nível global de cantrip verificado, mas modo de preparação e atributo específicos da característica ainda exigem regras adicionais quando não estão estruturados no pacote.

GET /characters/:id/validation inclui NESTED_SPELL_SELECTION para cada vínculo e atualiza o resumo NESTED_SPELL_CHOICES. Escolhas vazias permanecem inconclusivas; não é obrigatório preencher um rascunho. NESTED_FIXED_SPELL só reconhece a presença de uma concessão atribuída explicitamente à opção. Ter uma magia legada na mesma espécie/classe não prova que ela veio daquela opção.

Magias explicitamente vinculadas são conferidas pela regra da opção, separadas da lista e dos limites padrão da classe. Assim, os truques extras de Druidic Warrior não são rejeitados por não integrarem a lista padrão de Ranger nem consomem seu orçamento padrão de truques. rulesVerified permanece false; esses achados não certificam toda a ficha.

## Exclusão e prévia

DELETE /characters/:id/choices/:instanceId continua direto quando não existem dependências. Se houver magias vinculadas, retorna 409 até o dono revisar:

POST /characters/:id/choices/:instanceId/removal-preview

Depois, envie DELETE /characters/:id/choices/:instanceId?confirmationToken=<token da prévia>. O token é um identificador de estado/alteração, não uma credencial de sessão. A confirmação é específica à opção e ao estado; token de outra remoção é recusado. A prévia não muda dados nem timestamps. A exclusão e sua auditoria são atômicas. O catálogo e magias independentes não são apagados.

A prévia de troca de espécie/antecedente/classe/subclasse também vê a cascata opção → magias. Continua sujeita à política conservadora de redução de nível descrita em reconciliacao-personagens.md.

## Limites que permanecem

Esta entrega cobre os spellsFixed e spellChoices de opções efetivamente registradas em character_choice. Atualização: Magic Initiate agora possui uma projeção local explícita de configuração que associa suas escolhas diretas à concessão, compartilhando lista e atributo. O catálogo original não é modificado; ver magic-initiate-backend.md. Os demais campos estruturados de concessão de magias agora são lidos por um motor genérico; ver motor-efeitos-magias.md. Outros efeitos e relações não estruturadas continuam pendentes.

Regras descritas apenas em texto, substituições após descanso, requisitos cruzados entre várias escolhas, conjuração gratuita, efeitos completos de talentos e alterações semânticas em atualização de catálogo ainda não são integralmente certificados. A existência do vínculo não torna oficiais os dados de suplemento. Não há recursos da ficha interativa nesta etapa.

## Atualização

Pare o servidor, extraia os arquivos e execute npm.cmd run db:migrate, depois npm.cmd run dev. Não execute schema.sql ou sample-data.sql sobre banco existente. Migrações 0001–0004 não foram modificadas. Não há dependências novas.

Os testes usam bancos temporários: exercício real da migração 4 → 5 com preservação de dados/ids/contador, FKs, CHECKs, orçamento, lista, nível, preparação, atribuição legada, rollback, cascata confirmada e recusa de token de outra opção.
