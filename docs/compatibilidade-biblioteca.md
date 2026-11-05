> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Compatibilidade — @freshmag/one-dndb 0.5.1

Tarball publicado no npm inspecionado: https://www.npmjs.com/package/@freshmag/one-dndb/v/0.5.1 . REVISION: d29f5fbddf06c00a. O pacote fornece dados e consultas, não uma validação completa de personagem D&D 2024. Seu conteúdo combina diferentes fontes; não foi comprovada completude normativa nem oficialidade de todos os rótulos.

## Contrato atual de identidade

Cada registro importado cria/localiza catalog_entry por (kind,slug). O id externo vira slug; name e deprecated_at ficam nessa identidade. Cada lib_* usa seu próprio id local, catalog_entry_id e catalog_kind fixo. Os ids do catálogo e dos detalhes não são intercambiáveis.

Quando prevista, a coluna data no detalhe guarda o JSON original completo. Mudanças de nomes ou depreciação são aplicadas ao catálogo, sem reescrever concessões. Upsert entre revisões e preservação histórica completa ainda precisam de teste específico.

## Mapeamento de detalhes

| Destino | Origem / transformação |
|---|---|
| ruleset_revision | REVISION, versão 0.5.1 |
| lib_species | content/species; creatureType → creature_type, speed e setting |
| lib_class | content/classes; hitDie D6/D8/D10/D12 → 6/8/10/12; spellcasting → is_spellcaster; subclassLevel → subclass_level |
| lib_subclass.class_id | class identifica nome da classe: resolver por lib_class JOIN catalog_entry.name; exigir correspondência única, não inferir slug |
| lib_background | content/backgrounds; setting |
| lib_fighting_style | content/fighting-styles |
| lib_spell | level, school; concentration → is_concentration; ritual → is_ritual; flags ausentes → 0 |
| lib_feat | category, setting; repeatable → is_repeatable, ausente → 0 |
| lib_item | kind, rarity, weight; magic → is_magic; cost → cost_cp, já em cobre; NULL preservado |
| lib_tool.group_id | group resolvido pelo slug do catálogo ligado a lib_tool_group |
| lib_language | tier, origin, note; always → is_always |
| lib_alignment | abbr; order → order_axis; morality → morality_axis; body |
| lib_rule | rules; category e JSON completo |
| lib_link | key → link_key; fromType/from/kind/toType/to → from_type/from_slug/kind/to_type/to_slug |
| lib_skill | 18 entradas skill-* de glossary; atributo extraído de kind, validado no enum |
| lib_weapon_property/mastery | 10 propriedades e 8 maestrias, com JSON original |
| lib_weapon_definition | items[].weapon.category/range/mastery, projetados em categoria/faixa/FK |
| lib_weapon_property_link | items[].weapon.properties normalizado em relações |

Booleanos viram 0/1. Campos opcionais ausentes viram NULL, exceto flags definidas com padrão 0. Não inferir concentração ou ritual a partir de duration/time, pois o pacote possui flags explícitas.

Enums confirmados: escolas Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation; tipos de item gear, weapon, armor, tool, mount, poison, potion, scroll, wondrous, ring, rod, staff, wand; raridades common, uncommon, rare, very rare, legendary, artifact, varies (ou NULL).

## Fontes e escopo de integração

source do JSON identifica um rótulo externo a conciliar com rules_source e catalog_entry_source. Rótulos ambíguos não devem ser separados automaticamente; falta de source não significa livro base. URL de importação fica no JSON, separada da referência bibliográfica.

/data exporta content, spells, feats, items, tools, toolGroups, rules, glossary, languages, alignments, reference e links, mais REVISION. Não exporta propriedades/maestrias diretamente. Sua inspeção usou o módulo interno do tarball, que não constitui API suportada para a aplicação. Carga futura deve usar API pública Dexie com IndexedDB compatível ou exportação oficialmente suportada.

Reference e entradas de glossary não relacionadas a perícias permanecem fora do esquema. Links podem referenciar tipos não persistidos; são polimórficos por contrato. Itens sem weapon não recebem dados inferidos; famílias e variantes mágicas exigem resolução do tipo-base. Chaves locais rule_key e choice_key não são propriedades garantidas pelo pacote.

## Evidência de execução atual

Carga em SQLite: espécies 25, classes 13, subclasses 76, antecedentes 71, estilos 13, magias 444, talentos 204, itens 799, grupos de ferramentas 4, ferramentas 37, idiomas 19, alinhamentos 9, regras 155, links 4.631, perícias 18, propriedades 10 e maestrias 8. Total de identidades comuns: 1.905; definições de arma: 38; vínculos de propriedades: 86. FKs e integrity_check passaram.

A fixture é um recorte desses dados; personagens e concessões são demonstrativos e ainda exigem curadoria normativa. O código do pacote é MIT; o README distingue o conteúdo de jogo pertencente à Wizards of the Coast e descreve o índice como de uso pessoal. Isso não estabelece licença geral de publicação do catálogo.

## Separação por sistema

O pacote e os catálogos descritos neste documento pertencem ao módulo D&D 2024. A identidade comum character não depende do pacote nem de ruleset_revision. Essa referência fica em dnd_character. Novos RPGs terão integrações e perfis próprios; a v1 habilita somente dnd-2024.
