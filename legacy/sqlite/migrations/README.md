# Migrações do banco

`0001_initial.sql` é a baseline inicial do modelo atual. Seu conteúdo é apenas SQL de schema; não contém dados de exemplo, criação de arquivos, configuração de WAL ou comandos de transação.

`schema.sql`, na raiz, é o snapshot para banco novo: configura a conexão, executa o schema e as alterações das migrações 0002, 0003, 0004, 0005 e 0006 em transação e registra as versões 1, 2, 3, 4, 5 e 6 com PRAGMA user_version=6. Não execute snapshot e migração 0001 no mesmo banco. sample-data.sql é uma fixture opcional de desenvolvimento e nunca deve ser parte da migração de produção.

## Contrato do futuro executor

1. Abrir uma conexão exclusiva de manutenção, com foreign_keys=ON e timeout de bloqueio. Configurar WAL fora de transação. Pausar escrita da aplicação durante a manutenção; sua infraestrutura ainda não foi escolhida.
2. Validar os nomes `NNNN_descricao.sql`, ordem contínua e histórico de execução. Banco existente sem histórico deve ser conciliado explicitamente; não adotar silenciosamente como versão zero.
3. Executar cada migração pendente sob BEGIN IMMEDIATE, relendo o histórico após obter o bloqueio.
4. Executar os comandos SQL sem o commit implícito de uma API de execução de scripts. Não permitir que o arquivo gerencie transações, altere PRAGMAs ou execute VACUUM/ATTACH/DETACH. Manutenção fora de transação exige procedimento próprio.
5. Executar foreign_key_check e integrity_check. Migrações de dados também devem executar suas asserções de negócio e completude de catálogo/perfis antes do COMMIT.
6. Inserir a versão, nome, SHA-256 dos bytes do arquivo e data UTC em schema_migration. Atualizar PRAGMA user_version na mesma transação e confirmar. Em qualquer erro, reverter tudo.
7. Repetir sem reaplicar versões já registradas. Divergências de checksum, versões desconhecidas, lacunas ou inconsistência com user_version bloqueiam a execução.

Uma migração aplicada é imutável. Correções são novos arquivos numerados. Antes da primeira publicação, a baseline ainda representa a proposta de modelagem; após uso real, não deve ser reescrita. 0002_refresh_tokens.sql é a primeira evolução após a baseline: revoga sessões antigas, adiciona access_expires_at e cria refresh_token. As versões 0007 usadas pelos testes são sintéticas e ficam somente em diretórios temporários.

Não há rollback automático por SQL inverso nesta proposta. Para falha na transação, usar ROLLBACK. Para mudança já confirmada, avaliar migração corretiva ou restauração de backup com o procedimento documentado, considerando as escritas posteriores ao backup.

## Estado da entrega

O contrato foi exercitado por `tests/db_support.py` e `tests/test_operations.py`, sem implementar backend ou CLI de produção. Executar na raiz:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```

Os testes comparam o schema criado pela baseline com o snapshot, carregam os exemplos em ambos, conferem o histórico/checksum e testam reaplicação, falha, rollback de DDL, arquivo aplicado modificado, banco sem histórico e versão ausente. Automação de implantação ainda não está instalada.

## Versão atual

Atual: 3. Para banco novo, aplicar 0001, 0002 e 0003 pelo executor ou usar schema.sql. Para banco na versão 1, aplicar 0002 e 0003 após backup; 0002 exige novo login nas sessões legadas. Para banco na versão 2, aplicar somente 0003; ela exige novos links de verificação/reset para substituir tokens antigos sem vínculo ao e-mail. Não reescrever a baseline. O snapshot e a cadeia inteira são comparados nos testes.

0003_account_policies.sql retira publicações inelegíveis, adiciona bloqueio administrativo, vínculo/revogação dos tokens de conta e login_throttle. Preserva fichas e as migrações anteriores.

0004_character_choices.sql adiciona o registro de opções explícitas, preservando personagens e dados anteriores. Atualize com npm.cmd run db:migrate; nunca aplique schema.sql sobre banco existente.

0005_nested_spell_choices.sql adiciona vínculo opcional de magias a opções, recompõe character_spell preservando dados e contador de ids, recria índices e mantém as magias antigas sem atribuição presumida. Consulte magias-escolhas-aninhadas.md.


Versão vigente: **6**. `0006_structured_effects.sql` preserva os atributos existentes como base, adiciona contexto opcional de campanha, escolhas de aumento de atributos e três views de projeção. Não insere bônus presumidos em fichas antigas. As versões anteriores descritas acima são históricas. Atualizar com `npm.cmd run db:migrate`, com o servidor parado e backup do banco. Nunca executar schema.sql sobre um banco existente.
