> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Pré-requisitos de multiclasse D&D 2024

Implementação no relatório `GET /characters/:id/validation`, achado
`MULTICLASS_REQUIREMENTS`. A auditoria preserva o salvamento de construções
parciais. `rulesVerified` continua `false`.

## Conferência normativa

Fontes consultadas com HTTP 200, mantendo proxy e verificação TLS:

- [Regras gratuitas, Creating a Character / Multiclassing](https://www.dndbeyond.com/sources/dnd/free-rules/creating-a-character#Multiclassing): mínimo 13 no atributo primário da classe nova **e das classes atuais**.
- [SRD 5.2 oficial](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf): páginas impressas 24–25, Prerequisites; tabelas Core Class Traits no capítulo Classes para os atributos primários e suas combinações.

A URL do SRD 5.2.1 citada nos registros anteriores respondeu HTTP 403 nesta
verificação; essa revisão não foi usada como evidência. A configuração de rede
reportou acesso irrestrito aplicado. No executor restrito, o proxy não estava
alcançável; as consultas funcionaram com a execução ampliada, pelo mesmo proxy.

| Classe | Atributos com mínimo 13 |
| --- | --- |
| Barbarian | Strength |
| Bard | Charisma |
| Cleric | Wisdom |
| Druid | Wisdom |
| Fighter | Strength **ou** Dexterity |
| Monk | Dexterity **e** Wisdom |
| Paladin | Strength **e** Charisma |
| Ranger | Dexterity **e** Wisdom |
| Rogue | Dexterity |
| Sorcerer | Charisma |
| Warlock | Charisma |
| Wizard | Intelligence |

As regras ficam em um módulo explícito, separado do JSON externo: não se deduz
limiar ou operadores a partir de `primaryAbility`. O relatório inclui as fontes,
o mínimo exigido e as alternativas com seus valores e resultados por classe.

## Semântica e limites

- Uma única classe não exige esse mínimo. Para multiclasse, todas as classes
  são verificadas, inclusive a inicial, independentemente da ordem do array.
- Classe não mapeada, como Artificer, permanece `unknown`; não se adivinham
  requisitos de suplementos. Uma falha conhecida prevalece sobre desconhecidos.
- O cálculo usa os atributos persistidos no estado atual. Não comprova os
  atributos na aquisição de cada nível nem considera automaticamente bônus
  ainda não aplicados aos atributos persistidos.
- Benefícios de entrada, proficiências, espaços de magia comuns/Pacto,
  interação de Ataque Extra/CA e exceções de suplementos não são certificados
  por este achado. A validação integral de multiclasse permanece pendente.
- Nenhuma migração, dependência nova ou consulta externa em tempo de execução.

Testes unitários cobrem as 12 classes, fronteira 12/13, E/OU, classe inicial,
três classes, suplementos e informação ausente. O teste HTTP confirma o
recálculo depois de alterar atributos e remover a multiclasse, mantendo o
salvamento parcial e `rulesVerified=false`.

## Conferência local posterior

O usuário forneceu o PDF SRD 5.2; a conferência local e a implementação dos benefícios de entrada e espaços comuns estão em multiclasse-progressao-srd52.md. Os limites deste documento sobre atributos na aquisição e suplementos continuam aplicáveis.
