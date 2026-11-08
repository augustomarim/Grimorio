> Fechamento de produção vigente: [PUBLICAR-RENDER.md](deploy/PUBLICAR-RENDER.md) e [homologação](fechamento-backend-render.md). Mensagens transacionais usam HTTPS ou SMTP opcional, sem login Google. Produção verifica schema/catálogo sem DDL; Render usa /live e rotas /api. Referências anteriores divergentes abaixo são históricas.

# Estado atual — PostgreSQL / Neon

O servidor usa pg com pool de conexões e consultas assíncronas. São 51 tabelas, 9 views e 90 FKs. A baseline PostgreSQL é versão 1, independente do antigo SQLite v6, disponível no histórico Git.

Mantidos: autenticação por senha, refresh rotativo, papéis user/admin, contas/sessões, catálogo local one-dndb 0.5.1, origem por livro/suplemento, fichas multiclasse, narrativa, inventário, benefícios, magias/grimório, escolhas, reconciliação com prévia, auditoria, efeitos estruturados e cálculos derivados. Os atributos base continuam separados dos bônus. Nível total continua soma dos níveis das classes, sem nível próprio de subclasse.

Novidades operacionais: DATABASE_URL no lugar de DATABASE_PATH, conexão direta opcional para administração, migrações PostgreSQL com checksum/lock, backup com ferramentas PostgreSQL 18 na imagem e restauração para banco vazio. A implementação SQLite, o driver e o utilitário de transferência foram removidos.

A transferência foi exercitada com a fixture v6. A compatibilidade foi executada em PostgreSQL 17 local; autenticação, configuração, permissões e limites de um projeto Neon real dependem da conexão do usuário. A aplicação e o banco ainda não foram publicados.

Permanecem fora desta entrega: frontend, integração de cookies Vercel↔Render, páginas de confirmação/reset, entrega SMTP real, domínio/HTTPS do provedor, backups externos agendados e monitoramento de produção. Condições textuais de combate, rolagens e consumo de recursos não foram adicionados por esta migração; rulesVerified continua false.
