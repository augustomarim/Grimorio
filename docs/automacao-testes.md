# Verificação do backend PostgreSQL

A suíte ativa é a lista explícita em vitest.config.ts, com regras puras e test/postgres/**/*.test.ts. Isso também ignora testes SQLite antigos que possam ter permanecido no PC após extrair o ZIP. Os testes SQLite anteriores foram arquivados em legacy/sqlite e não representam validação do backend Neon.

- Regras puras: modificadores, proficiência, armadura, multiclasse, slots e projeção dos campos reais do catálogo.
- Integração: PostgreSQL 17 real, migração isolada, carga completa, cadastro/confirmação/login, cookies, inventário, fichas/cálculos, magias/grimório, escolhas aninhadas, publicação, FKs/CHECKs, rollback/savepoints e refresh concorrente.
- Configuração: URL PostgreSQL obrigatória, TLS externo verify-full e preservação de HTTPS/SMTP na produção.

Para integração, configurar TEST_DATABASE_URL de um banco de testes separado. A suíte cria schema aleatório e o remove ao terminar. Sem essa variável, os testes de integração aparecem como ignorados: uma execução só de testes puros não valida o banco.

A conferência de imagem de produção, backup pg_dump/pg_restore e transferência SQLite foi executada separadamente em bancos/containers descartáveis. Nenhum e-mail externo foi enviado e nenhum projeto Neon foi conectado. Resultados atuais: resultado-neon.json.
