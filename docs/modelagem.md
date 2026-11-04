# Modelagem consolidada — Grimorio

Estado atual: **49 tabelas e 6 views**, conferidos no SQLite. Consolidação estrutural para iniciar o núcleo do backend, com pendências normativas explícitas em fechamento-modelagem-v1.md; nenhum backend ou frontend implementado. Os artefatos foram reconstruídos a partir do resumo fornecido, pois os arquivos do projeto anterior não foram anexados.

## Requisitos e decisões preservadas

- Usuários com login por e-mail e senha; papéis user/admin; access e refresh tokens opacos com hash; rotação e revogação por família de sessão; bloqueio por is_active; auditoria preservada.
- A identidade comum da ficha guarda dono, sistema, nome, retrato, visibilidade e datas. Narrativa é comum. Atributos, espécie, antecedente, alinhamento e revisão ficam em dnd_character. Privado por padrão; publicação e permissões validadas pelo serviço.
- Multiclasse: character_class guarda classe, nível, subclasse correspondente e indicação de classe inicial. character não possui level. O total é a soma dos níveis das classes.
- Catálogo local de regras @freshmag/one-dndb 0.5.1, com ids locais inteiros e slugs externos únicos por tipo. Não há itens, talentos ou magias personalizados.
- Livros base e suplementos permitidos, com fontes bibliográficas explícitas e múltiplos livros por opção. Ausência de procedência não significa livro base.
- Inventário guarda instâncias, quantidade e equipamento; concessões de magias, grimório, talentos, ferramentas, idiomas, estilos, perícias, treinamentos, maestrias e evolução têm estruturas próprias.
- Dados derivados são consultados: nível total, rank efetivo de perícia, ordem de evolução, PV e armas cobertas pelo treinamento. Ataques, CA, bônus de proficiência e espaços de magia continuam cálculos futuros do serviço.

## Arquitetura do catálogo

catalog_entry concentra kind, slug, name e deprecated_at. As tabelas lib_* especializadas mantêm ids locais e detalhes tipados, com FK composta que garante o tipo. JSON externo completo permanece no detalhe quando previsto. Os personagens continuam usando FKs para os detalhes apropriados.

rules_source cadastra livros; catalog_entry_source é a associação única. A simplificação removeu 16 associações específicas e acrescentou duas tabelas, levando de 58 a 44 naquela etapa. A separação posterior de núcleo e perfil D&D acrescentou duas tabelas, totalizando 46 nessa etapa. O histórico técnico schema_migration acrescentou uma tabela operacional, levando a 47 nessa etapa; refresh_token e login_throttle elevaram o total atual a 49. Referências polimórficas da biblioteca em lib_link continuam sem FKs por decisão explícita de consulta, independentes das relações bibliográficas.

A carga deve verificar identidades sem detalhe antes de COMMIT: a FK não exige a presença inversa do subtipo. Ver catalogo-comum.md.

## Integridade e responsabilidades

SQLite >= 3.37 com JSON, tabelas STRICT, foreign_keys=ON em toda conexão e WAL em arquivo. Datas em TEXT UTC por contrato; booleanos 0/1; updated_at mantido pelo serviço. Audit_log.details admite JSON opcional além dos JSONs de catálogo.

O banco valida FKs, enums, faixas por linha, pertencimento de subclasse, origem coerente, propriedade de concessões, unicidades e escolhas fixas/selecionadas. Regras agregadas e normativas permanecem no serviço: total de níveis até 20, exatamente uma classe inicial, elegibilidade, limites de escolhas, preparação, progressão multiclasse e benefícios corretos por contexto.

Histórico e composição atual devem ser conciliados em transação. O histórico possui ordem dos níveis e classe adquirida em cada passo; não representa todo o histórico de mudanças de atributos, equipamentos ou escolhas. Grafo de concessões deve ser acíclico, com origem anterior ao benefício; FKs não provam essa condição.

Excluir personagem remove seus registros dependentes sem afetar catálogos. Catálogo é depreciado, não apagado habitualmente; RESTRICT protege opções em uso. Excluir usuário exige remover personagens em transação; sessões/tokens saem em cascata e auditoria anula o autor.

## Documentação e execução

- catalogo-comum.md: identidades, livros, completude e conversão.
- magias-multiclasse.md: concessões, preparação e grimório.
- proficiencias-progressao.md: benefícios, escolhas, armas e PV.
- compatibilidade-biblioteca.md: contrato da versão 0.5.1.
- dicionario-de-dados.md: definições físicas por coluna.
- sistemas-e-versoes.md: núcleo comum, perfil D&D, fronteiras da v1 e v1.5.
- migracoes-backup-restauracao.md e migrations/README.md: migrações, histórico, backup e restauração local testados.
- autenticacao-refresh-token.md: contrato de access/refresh tokens e rotação.
- contas-permissoes.md: acesso, publicação, moderação, recuperação e limitação de tentativas.
- validacao-catalogo.sql, validacao-magias.sql e validacao-proficiencias.sql e validacao-sistemas.sql: consultas executadas sobre a fixture atual.

`python3 -m unittest discover -s tests -v` executou 41 testes com sucesso (14 de modelo, 8 operacionais, 7 de refresh, 9 de políticas de conta e 3 de coerência dos exemplos com o catálogo). Carga completa dos catálogos modelados também foi executada. Schema e sample-data são para banco novo; exemplos são parciais, com personagens fictícios e sem senha utilizável. Não constituem fichas integralmente validadas segundo D&D 2024.

DBML é para importar em https://dbdiagram.io/d . Sua renderização no site não foi executada. O SQL é a definição executável; índices parciais e alguns detalhes de SQLite são documentados em notas do DBML.

## Pendências antes do backend

1. Conferir as regras normativas e o mapeamento de concessões, especialmente multiclasse, conjuração, benefícios iniciais e exceções de suplementos.
2. Curar todas as fontes bibliográficas e completar as fichas quando necessário. As origens incompatíveis identificadas nos exemplos foram corrigidas contra o pacote, mas os exemplos continuam parciais e sem certificação normativa.
3. Revisar separadamente a repetição de origem entre character_spell e character_rule_grant; não foi alterada na simplificação do catálogo.
4. Desenhar estado de jogo apenas na evolução v1.5: foi aprovado que a v1 é criador/gerenciador, sem PV atuais, consumo de espaços ou descansos. Outros sistemas recebem módulos próprios, compartilhando apenas o núcleo.
5. Implantar migrações e backups quando a hospedagem for escolhida: baseline e protocolo local de recuperação já foram testados, mas agendamento, armazenamento externo, manifesto do backup e troca em produção continuam pendentes.
6. Implementar as políticas já aprovadas: confirmação para publicar, uso privado antes disso, recuperação com revogação de sessões e bloqueio temporário por e-mail/rede. Contrato SQL e testes existem; endpoints, e-mail e controle HTTP ainda não.
7. Aplicar no serviço a deduplicação de estilo/talento por slug já decidida; manter explícita a limitação das múltiplas permissões de magia pela mesma origem, sem inventar validação para exceções.
8. Aplicar a decisão de depreciação: preservar e sinalizar referências existentes, rejeitar novas aquisições depreciadas e não converter fichas automaticamente. Upsert e revision_id não preservam versões históricas completas do conteúdo.
9. Iniciar o núcleo conforme contrato-backend-v1.md sem afirmar validação completa de D&D. O bloqueio de acesso à fonte oficial e suas consequências estão em fechamento-modelagem-v1.md. Interface permanece para depois; hospedagem ainda não foi definida.

## Escopo confirmado

Apenas D&D 2024 está habilitado na v1. rpg_system identifica o sistema da ficha; não implementa suas regras. O núcleo não exige classes, níveis ou os seis atributos de D&D de um futuro sistema. Consulte sistemas-e-versoes.md.

## Histórico operacional

A baseline 0001 e a migração 0002 de refresh tokens e 0003 de políticas de conta têm histórico em schema_migration; o estado atual usa PRAGMA user_version=3. schema.sql instala o mesmo estado em banco novo; não executar os dois caminhos no mesmo banco. Backup/restauração foram exercitados em WAL com comparação de todas as tabelas e dados. Os ensaios não implementam backend nem automação de produção.

## Renovação de autenticação

refresh_token é a única tabela adicionada nesta etapa. session passa a ser família de tokens e guarda o hash do access atual e sua validade curta. A migração 0002 revoga sessões legadas, exigindo novo login. O protocolo de rotação foi testado por SQL; não há endpoints, cookies ou login de produção implementados.

## Políticas de conta aprovadas

Dono edita/exclui, visitante consulta públicas elegíveis e administrador consulta todas/modera publicações sem editar fichas alheias. Moderação bloqueia republicação até liberação. Tokens de confirmação/reset são vinculados ao e-mail, de uso único e revogáveis. login_throttle é o único acréscimo de tabela nesta etapa; os demais ajustes ampliam character e auth_token.

## Encerramento da preparação estrutural

Leia fechamento-modelagem-v1.md e contrato-backend-v1.md. O início de contas/catálogo/persistência não depende de certificar todo suplemento, mas a promessa de legalidade completa depende da conferência oficial ainda bloqueada por rede. O rascunho de rede não pôde ser alterado; requisitos estão em requisitos-rede-pendentes.md.
