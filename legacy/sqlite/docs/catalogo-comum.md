# Catálogo comum e livros

Alteração aprovada: o modelo foi reduzido de 58 para 44 tabelas, mantendo 6 views. Foram removidas 16 tabelas `lib_*_source` e adicionadas `catalog_entry` e `catalog_entry_source`. A contagem foi conferida no SQLite.

## Identidade e detalhes

`catalog_entry` é a origem canônica de `kind`, `slug`, `name` e `deprecated_at`. Cada um dos 16 tipos de catálogo mantém sua tabela especializada, seu id inteiro local e seus campos específicos, incluindo o JSON original quando já existia. Slug e nome não são duplicados nos detalhes.

Cada detalhe possui `catalog_entry_id UNIQUE NOT NULL` e `catalog_kind` com DEFAULT e CHECK fixos para seu tipo. A FK composta `(catalog_entry_id, catalog_kind)` aponta a `(id, kind)` do catálogo. Dessa forma, uma magia não pode usar a identidade de uma classe. `UNIQUE(kind, slug)` permite o mesmo slug em tipos distintos, conforme o contrato da biblioteca.

Os ids especializados anteriores foram preservados na conversão da fixture. Personagens continuam referenciando lib_spell.id, lib_class.id etc. Um id do catálogo não deve ser confundido com um id especializado nem com o id/slug externo do pacote.

Os 16 tipos são species, class, subclass, background, fighting_style, spell, feat, item, tool_group, tool, language, alignment, rule, skill, weapon_property e weapon_mastery. Lib_link, projeções de arma e relações de propriedades mantêm suas funções anteriores e não ganham identidades independentes.

## Livros

`rules_source` permanece como cadastro bibliográfico. `catalog_entry_source(catalog_entry_id, source_id)` é a associação única com PK composta. Permite zero, uma ou várias fontes. FKs impedem fontes e opções inexistentes; a PK impede duplicidade. Não existe associação polimórfica sem FK.

Sem associação confirmada, mostrar “Fonte não identificada”. Não preencher livro base por ausência de informação. A classificação base/supplement não comprova oficialidade nem validade de uma regra. O JSON original preserva o rótulo source e a URL de importação da opção; reference_url em rules_source se refere ao livro.

## Escrita e exclusão

Carga e atualização devem ocorrer em transação: localizar/criar identidade por (kind,slug), salvar o detalhe correto, conciliar os livros e conferir completude antes de COMMIT. A consulta de incompletude está em validacao-catalogo.sql.

A FK garante detalhe → identidade, mas não exige identidade → detalhe. Uma identidade sem detalhe pode existir no SQLite. O serviço/importador deve rejeitar uma carga incompleta; este desenho não usa triggers para impor essa restrição inversa. O mesmo vale para exclusão direta de um detalhe, que pode deixar sua identidade órfã.

O catálogo continua seguindo a política de depreciação, sem exclusão habitual. Excluir fisicamente uma identidade tenta apagar seu detalhe e associações em cascata; se o detalhe estiver em uso por personagem ou outro registro protegido, RESTRICT bloqueia a operação. Excluir um livro em uso é bloqueado. Atualizar deprecated_at não apaga concessões existentes.

O schema cria um banco novo. A conversão testada foi da fixture preservada em banco temporário; não é uma migração geral para bancos de produção. Uma migração real precisa mapear os ids comuns, preservar cada id especializado, conferir livros e manter cópia recuperável antes de remover as tabelas antigas.

## Validação executada

12 testes automatizados passaram, incluindo regressões de multiclasse, escolhas, PV e magias, tipos incompatíveis, slug duplicado no mesmo tipo, mesmo slug em tipos distintos, edição de nome, múltiplos livros e exclusão de opção em uso. Script: tests/test_model.py, executado com `python3 -m unittest discover -s tests -v`.

Também foi executada carga completa dos catálogos modelados da versão 0.5.1, com 1.905 identidades (incluindo 18 perícias, 10 propriedades e 8 maestrias), mais 38 definições de armas e 86 vínculos de propriedades. FKs e integridade passaram. A fixture convertida continha 55 identidades nessa etapa; a correção posterior de origens acrescentou registros reais necessários, sem alterar schema. As consultas de documentação foram executadas e a fixture não apresenta identidades sem detalhe.

Esses resultados validam o armazenamento e as restrições testadas. Não validam todas as regras D&D 2024, a oficialidade das fontes, a renderização do diagrama no dbdiagram.io ou um processo de migração em produção.

## Perfil por sistema

A redução descrita acima foi a etapa de 58 para 44 tabelas. A etapa de sistemas chegou a 46 após acrescentar rpg_system e dnd_character; o modelo atual tem 47 com schema_migration. O catálogo comum é comum aos tipos de opção de D&D, não um esquema de regras universal. A suíte atual possui 14 testes; o perfil D&D é a raiz das referências mecânicas da ficha.

Estado administrativo atual: 49 tabelas após refresh_token e login_throttle. O catálogo não recebeu novas tabelas nem alteração de suas regras nesta etapa.
