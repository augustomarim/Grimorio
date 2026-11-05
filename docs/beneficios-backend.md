# Benefícios de personagem — backend

Este incremento usa as tabelas existentes. Não altera schema.sql, DBML ou migrações.

## Rotas

- `GET /characters/:id/benefits`: benefícios, concessões de origem, fontes bibliográficas e resumo de perícias. Mesmas permissões de leitura da ficha, inclusive notas públicas quando a ficha é pública.
- `POST /characters/:id/grants`: cria uma concessão imutável vinculada ao personagem.
- `POST /characters/:id/benefits`: adiciona talento (`feat`), ferramenta (`tool`), idioma (`language`) ou perícia (`skill`).
- `PATCH /characters/:id/benefits/:kind/:instanceId`: altera notas e, para ferramentas/perícias, graduação.
- `DELETE /characters/:id/benefits/:kind/:instanceId`: exclui a instância. Excluir um talento também exclui concessões e benefícios derivados dele, conforme as FKs existentes.

Escritas exigem sessão do dono e cabeçalho Origin igual ao APP_ORIGIN. Administradores não editam fichas alheias. Alterações e auditoria são atômicas; atualizam a data da ficha e sua revisão de catálogo.

## Exemplo de concessão

POST /characters/1/grants:

```json
{
  "originKind": "class",
  "originId": 1,
  "acquisitionContext": "initial_class",
  "ruleKey": "wizard.initial.skills",
  "acquiredAtLevel": 1
}
```

`originId` identifica a linha de character_class para classe/subclasse, o id local da espécie/antecedente do personagem para essas origens, ou a instância character_ability do talento de origem. Para subclasse, a API usa a subclasse atualmente vinculada à classe. `ruleKey` é uma chave local de rastreio única por personagem, não um id de característica fornecido pelo pacote.

Contextos: `initial_class`, `multiclass_entry`, `class_progression`, `species`, `background`, `feat`. O contexto deve corresponder à origem. A aquisição não pode ultrapassar o nível total atual. A classe inicial e uma entrada multiclasse são verificadas contra a composição salva. Concessões não são reatribuídas: isso impede formar ciclos entre talentos por atualizações de origem.

## Exemplo de perícia

POST /characters/1/benefits:

```json
{
  "kind": "skill",
  "localId": 1,
  "grantId": 1,
  "selectionKind": "chosen",
  "choiceKey": "wizard.initial.skill.1",
  "proficiencyRank": 2,
  "notes": "Especialização"
}
```

Os números são ilustrativos: consulte a ficha, GET /characters/:id/benefits e GET /catalog/:kind para obter ids reais. `localId` vem do catálogo tipado, não do id global catalog_entry. `grantId` vem de POST /grants.

`selectionKind=fixed` não aceita choiceKey; `chosen` exige chave não vazia. Ferramentas e perícias exigem graduação 1 (proficiência) ou 2 (especialização); talentos e idiomas não aceitam graduação. O resumo de perícias usa MAX, nunca soma graduações de várias origens. Catálogo inexistente ou depreciado não pode gerar nova aquisição. Registros históricos continuam consultáveis.

## Limites explícitos

A API informa `validation.rulesVerified=false`. A integridade da origem não comprova que aquela regra concede o benefício: elegibilidade, pré-requisitos, quantidades de escolhas, repetibilidade de talentos, momento exato de aquisição no histórico, especialização permitida, duplicação entre talentos e estilos de luta e limites de idiomas ainda precisam de validação normativa. Não há cálculo de bônus, CA ou recursos de combate neste incremento. As concessões ficam imutáveis e sem endpoint de exclusão independente por enquanto; remover uma origem segue as cascatas do modelo.

## Verificação

Os testes automatizados cobrem os quatro tipos, edição/exclusão, origens cruzadas, acesso indevido, escolha e graduação inválidas, rollback de auditoria, unicidade de perícia por concessão, MAX entre origens, cascata de talento e preservação do catálogo. Resultados da execução são informados na entrega.

## Auditoria de escolhas

GET /characters/:id/benefits/options expõe escolhas diretas para origens já registradas. A auditoria reconhece a convenção choiceKey `<campo>:<id>`, sem reinterpretar chaves legadas. Veja [escopo e exemplos](escolhas-beneficios-backend.md).

## Traços de entrada multiclasse confirmados

Use coreGrantRuleKey retornado por GET /characters/:id/class-benefits para identificar os traços de entrada de uma nova classe. A implementação baseada no PDF SRD 5.2 está em multiclasse-progressao-srd52.md. As auditorias não alteram o contrato de gravação de rascunhos.

## Exclusão com dependências

DELETE de benefício agora exige confirmação quando a remoção apaga outras concessões, magias ou escolhas. A prévia fica em POST /characters/:id/benefits/:kind/:instanceId/removal-preview; envie confirmationToken na query do DELETE. Remoções sem dependentes continuam diretas. Ver motor-efeitos-magias.md.
