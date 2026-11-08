# Migrações PostgreSQL / Neon

0001_postgresql.sql instala o modelo atual. A cadeia PostgreSQL é independente da antiga SQLite v6, disponível apenas no histórico Git.

O executor usa uma transação e advisory lock, confere nomes e SHA-256 e registra schema_migration. Não editar arquivos após aplicação real. backend/schema.sql (caminho pela raiz) é snapshot para banco novo e tem o mesmo DDL/checksum; não executar em banco já instalado. A importação do catálogo é uma operação posterior.

npm.cmd run db:migrate usa DIRECT_DATABASE_URL, com fallback para DATABASE_URL. O utilitário de transferência SQLite foi removido; o backend atual usa somente PostgreSQL. Nenhuma rotina apaga tabelas existentes para recomeçar.
