# Migrações PostgreSQL / Neon

0001_postgresql.sql instala a base do modelo. 0002_builder_documents.sql acrescenta
o armazenamento das fichas e rascunhos do construtor, com proprietário, conteúdo JSON,
revisão para concorrência e visibilidade pública. Execute `npm run db:migrate`
antes de iniciar a API atualizada em produção.

O executor usa uma transação e advisory lock, confere nomes e SHA-256 e registra schema_migration. Não editar arquivos após aplicação real. backend/schema.sql (caminho pela raiz) é o snapshot da baseline 0001 para banco novo. Depois dele, aplique as migrações posteriores com o executor. Não executar esse snapshot em banco já instalado. A importação do catálogo é uma operação posterior.

npm.cmd run db:migrate usa DIRECT_DATABASE_URL, com fallback para DATABASE_URL. O utilitário de transferência SQLite foi removido; o backend atual usa somente PostgreSQL. Nenhuma rotina apaga tabelas existentes para recomeçar.
