> Fechamento de produção vigente: [PUBLICAR-RENDER.md](PUBLICAR-RENDER.md) e [homologação](docs/fechamento-backend-render.md). Mensagens transacionais usam HTTPS ou SMTP opcional, sem login Google. Produção verifica schema/catálogo sem DDL; Render usa /live e rotas /api. Referências anteriores divergentes abaixo são históricas.

# Grimorio — backend PostgreSQL / Neon

Node.js 24, TypeScript, Fastify e PostgreSQL 17. O banco agora pode ficar no Neon e a API pode ser hospedada no Render, sem depender de disco SQLite persistente. O frontend será feito depois e poderá ficar na Vercel.

**Não foi conectado nem publicado um projeto Neon real.** A migração, o catálogo e a API foram testados em PostgreSQL 17 local. Nenhuma senha ou URL preenchida acompanha o projeto.

## Configuração local

1. Criar um projeto no Neon e obter a conexão PostgreSQL na opção Connect.
2. Instalar dependências: `npm.cmd ci`.
3. Editar seu `.env` existente: retirar DATABASE_PATH e preencher DATABASE_URL. Manter AUTH_KEY se desejar preservar sessões transferidas. Usar a conexão pooled na API e a conexão direta em DIRECT_DATABASE_URL para operações administrativas. Não enviar essas URLs ao Git ou ao chat.
4. Banco novo sem dados antigos: `npm.cmd run catalog:import`, depois `npm.cmd run dev`.

Não substituir um `.env` preenchido por .env.example. MAIL_MODE=file continua exclusivo de desenvolvimento; produção exige SMTP configurado. Leia [Neon e transferência de dados](docs/neon.md) antes de conectar um banco com dados.

## Artefatos atuais

- schema.sql e migrations/postgresql/0001_postgresql.sql: baseline **PostgreSQL v1**, 51 tabelas e 9 views. A numeração PostgreSQL é independente do antigo SQLite v6.
- modelo.dbml: diagrama PostgreSQL para [dbdiagram.io](https://dbdiagram.io/d).
- sample-data.sql: dados parciais de exemplo, somente em banco novo de testes. Nunca carregar em produção.
- [Dicionário de dados](docs/dicionario-de-dados.md), gerado a partir do schema executado.
- [Hospedagem](docs/hospedagem-backend.md), [backup/restauração](docs/migracoes-backup-restauracao.md) e [estado atual](docs/estado-backend.md).

O histórico SQLite foi preservado em legacy/sqlite; ele não é usado pelo servidor atual. O driver better-sqlite3 é dependência de desenvolvimento apenas para a transferência de dados antigos.

## Desenvolvimento e verificação

`npm.cmd run typecheck`, `npm.cmd run build` e `npm.cmd test`.

A suíte PostgreSQL exige TEST_DATABASE_URL de um banco de testes separado. Cria e remove um schema com nome aleatório, não usa dados de produção. Sem essa variável, o Vitest sinaliza os testes PostgreSQL como ignorados: isso **não** valida a integração. Os testes de regras puras continuam independentes do banco.

## Limites do produto

Os efeitos estruturados e cálculos modelados continuam disponíveis; regras somente textuais e condições de combate não ganharam automação nesta migração. rulesVerified continua false. Rolagens, consumo de espaços e PV atuais ficam para a ficha interativa.
