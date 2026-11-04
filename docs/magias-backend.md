# Magias e grimório

Incremento de gerenciamento, usando as tabelas character_spell e character_spellbook_entry existentes. Nenhuma migração ou dependência nova. Sem consumo de espaços de magia.

## Rotas e segurança

- GET /characters/:id/spells: lista as magias com origem, modo de preparação e fontes bibliográficas.
- POST /characters/:id/spells: adiciona uma magia por origem.
- PATCH /characters/:id/spells/:instanceId: altera isPrepared, castingAbilityChoice e/ou notes.
- DELETE /characters/:id/spells/:instanceId: exclui a instância daquela origem.
- GET /characters/:id/spellbook: lista as entradas do grimório.
- POST /characters/:id/spellbook: adiciona uma entrada.
- PATCH /characters/:id/spellbook/:instanceId: altera apenas notes.
- DELETE /characters/:id/spellbook/:instanceId: exclui uma entrada do grimório.

GET aceita page (padrão 1) e limit (padrão 20, máximo 100). Retorna items, total, page, limit e validation.rulesVerified=false. Cada item inclui sources com os livros associados pelo catálogo; sem fonte catalogada, sources é vazio e não se presume livro base. Os campos persistidos são retornados em snake_case; effectivePrepared é um campo derivado da listagem de magias.

Leituras seguem a visibilidade da ficha, inclusive notas. Escritas exigem sessão do dono e Origin igual ao APP_ORIGIN. Administrador pode ler segundo as regras existentes, mas não editar fichas alheias. Toda mutação é transacional, com auditoria, updated_at e revisão de catálogo. Instâncias são sempre limitadas pelo id do personagem. Excluir uma magia ou entrada não apaga catálogo nem modifica a outra tabela.

## Inclusão de magia

```json
{
  "spellId": 1,
  "originKind": "class",
  "originId": 1,
  "preparationMode": "selectable",
  "isPrepared": false,
  "castingAbilityChoice": "intelligence",
  "notes": null
}
```

Números ilustrativos. spellId é o localId obtido de GET /catalog/spell, não o id global catalog_entry.

originKind aceita class, subclass, species, background ou feat. originId é a instância character_class para classe/subclasse, o id local da espécie/antecedente atual, ou a instância character_ability do talento. A API e as FKs verificam pertencimento. Para subclasse, é usada a subclasse atual da instância de classe. Não existe origem manual. Origem, magia e modo de preparação são imutáveis: para corrigi-los, remova e registre novamente.

A mesma magia pode ter múltiplas origens. A duplicação da mesma origem é bloqueada pelos índices únicos do banco. Remover uma origem do personagem segue as cascatas existentes.

Modos:

- cantrip: obrigatório para magia de nível 0.
- selectable: permite isPrepared true/false; o padrão é false.
- always_prepared: isPrepared é armazenado como false, e effectivePrepared retorna true.
- granted: concessão não representada como preparação manual.

Magias de nível maior que zero não aceitam cantrip. Apenas selectable aceita preparação manual. Os demais modos não aceitam PATCH de isPrepared. Truques e granted não são classificados como preparados por effectivePrepared; sua disponibilidade não deve ser inferida desse campo isoladamente.

castingAbilityChoice é uma escolha explícita opcional, não um atributo calculado. Aceita os seis atributos ou null; a adequação normativa à origem ainda não foi validada.

## Grimório

```json
{
  "spellId": 1,
  "characterClassId": 1,
  "notes": "Registro da magia"
}
```

characterClassId é a instância de classe do personagem. Neste incremento, somente a classe de slug wizard aceita grimório, e somente magias de nível maior que zero. Há unicidade por classe e magia. A entrada não prepara nem concede automaticamente a magia. Excluir a entrada também não exclui um registro existente em character_spell.

## Limites

A API implementa integridade estrutural, não certificação completa das regras de D&D 2024. Permanecem pendentes: listas de magias por classe, pré-requisitos de concessão, limites de preparação, nível máximo permitido, regras de copiar/custo/tempo de grimório, verificação de que a preparação do mago veio do grimório e escolhas de atributo permitidas por origem. Portanto, os registros ainda são rascunhos estruturais e rulesVerified permanece false. Não são calculados espaços, CD, ataque mágico ou dano.

## Testes

A suíte testa inclusão e exclusão sem afetar catálogo, preparação e desmarcação, sempre preparadas e truques, múltiplas origens, duplicidade, isolamento entre personagens e usuários, origem de classe, grimório independente, depreciação e rollback de auditoria. Os resultados executados são registrados na entrega.
