# Magic Initiate: escolhas diretas de magia do talento

## Fonte e escopo

Regras conferidas no PDF SRD 5.2 fornecido pelo usuário, página impressa 87, seção Magic Initiate. O pacote @freshmag/one-dndb 0.5.1 fornece Feat.effects.spellChoices com os ids two-cantrips e level-1-spell, listas e quantidades. O código da aplicação complementa a relação entre essas escolhas conforme o SRD: uma lista e um atributo compartilhados, e uma lista diferente em cada repetição do talento.

Os ids de configuração descritos abaixo são convenções da aplicação, não propriedades novas ou métodos do pacote. O catálogo original não é modificado. Os registros já cabem em character_choice e character_spell da versão 5; não há migração, tabela ou dependência nova.

## Fluxo

1. Tenha uma instância character_ability de lib_feat magic-initiate no personagem, com a origem registrada.
2. Crie uma concessão em POST /characters/:id/grants com originKind=feat, originId igual ao id dessa instância, acquisitionContext=feat, ruleKey local única e acquiredAtLevel válido.
3. Consulte GET /characters/:id/choices. A concessão expõe choiceId=app:magic-initiate e as opções disponíveis.
4. Escolha a configuração via POST /characters/:id/choices.

```json
{
  "grantId": 1,
  "choiceId": "app:magic-initiate",
  "optionId": "wizard:intelligence"
}
```

Os números são ilustrativos. A parte anterior a `:` de optionId identifica a lista (cleric, druid ou wizard); a posterior identifica intelligence, wisdom ou charisma. Por padrão há nove combinações. Para um talento fixo qualificado pelo antecedente, como Magic Initiate (Wizard) de Sage, o serviço limita as opções à lista indicada em featsFixed.note do catálogo. As qualificações conhecidas são Cleric, Druid e Wizard; qualificação não reconhecida não é interpretada como permissão para qualquer lista.

5. Registre até dois truques e uma magia de nível 1 via POST /characters/:id/spells, usando originKind=feat, originId da instância do talento e choiceInstanceId da configuração selecionada.

Truques usam nestedChoiceKey=spellChoices:two-cantrips e preparationMode=cantrip. A magia de nível 1 usa nestedChoiceKey=spellChoices:level-1-spell e preparationMode=always_prepared. Todas precisam constar da mesma lista selecionada.

```json
{
  "spellId": 1,
  "originKind": "feat",
  "originId": 1,
  "preparationMode": "cantrip",
  "choiceInstanceId": 1,
  "nestedChoiceKey": "spellChoices:two-cantrips"
}
```

spellId é o localId real do catálogo, não o id global catalog_entry. O atributo pode ser omitido: é preenchido a partir da configuração. Se castingAbilityChoice for fornecido com outro atributo, a requisição é recusada. PATCH de uma magia vinculada também não pode trocar ou apagar o atributo de modo inconsistente. Notas continuam editáveis.

## Repetição e limites

Cada instância do talento tem sua configuração e orçamento. Criar outra concessão para a mesma instância não concede novas escolhas. Repetir o talento exige escolher uma lista diferente; trocar somente Intelligence por Wisdom não permite repetir a lista Wizard. A auditoria registra MAGIC_INITIATE_CONFIGURATION e os achados NESTED_SPELL_SELECTION. Uma instância ainda sem configuração é inconclusiva; o rascunho não precisa estar totalmente preenchido para ser salvo.

Não se presume a configuração de talentos ou magias legados. Para atribuir uma magia legada, use POST /characters/:id/spells/:instanceId/nested-origin. Se seu atributo estiver nulo, é preenchido pela configuração, preservando id e notas. Se estiver explicitamente incompatível, precisa ser corrigido antes da atribuição. A auditoria também detecta divergências existentes nos registros.

As verificações de listas/quantidades/atributo de novas atribuições são aplicadas na escrita, além do relatório. rulesVerified continua false para a ficha integral. A validação da concessão original do talento por uma origem ainda depende da cobertura das escolhas dessa origem; esta entrega não certifica toda a alocação de talentos.

## Mudança e exclusão

A configuração é imutável como as demais opções. Excluí-la quando tem magias exige prévia e confirmação; somente depois se escolhe outra configuração. Troca de antecedente/espécie que remove o talento segue a cascata e a prévia de reconciliação já existentes. Não altera inventário ou outras ocorrências independentes do talento.

O SRD permite substituir uma magia ao ganhar um nível. O CRUD permite remover/adicionar uma magia elegível, mas ainda não condiciona a troca ao evento de subida de nível: a ficha é editável, não um controlador completo do histórico de progressão. A conjuração gratuita uma vez por descanso longo não é consumida por esta versão; consumo de recursos fica para a ficha interativa.

Outros efeitos de talentos, modificações de atributos, ataques de reação e exceções ainda não cobertas não foram declarados prontos. Outras escolhas diretas de magias de talentos não são automaticamente projetadas: precisam de políticas que respeitem seus próprios requisitos cruzados.

## Verificação

Testes usam o talento e as magias reais do pacote: nove configurações, normalização sem mutar os dados, rejeição de lista/atributo inválidos, limite 2+1, preparação permanente, atributo automático, proibição de repetição de lista, qualificação de Sage, atribuição de legado preservando notas e detecção de divergência na auditoria. O README foi corrigido para não exigir os atalhos de automação ausentes no repositório nem listar módulos concluídos como pendentes.

## Atribuição

This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Adaptação: requisitos convertidos em validações e opções de configuração da aplicação, com documentação em português.
