# Grimorio

API de fichas D&D em **Node.js 24, TypeScript, Fastify e PostgreSQL**. O backend
pode ser hospedado no Render com banco no Neon. O construtor web roda em `frontend/`.

## Organização

```text
backend/             API atual, testes, migrações e modelos PostgreSQL
frontend/            aplicação web de criação de personagens
scripts/             comandos de verificação do repositório
deploy/              Compose, Caddy e exemplos de configuração de implantação
docs/                documentação funcional, técnica e registros de validação
.github/workflows/   integração contínua e backup opcional
Dockerfile           imagem de produção; contexto de build na raiz
render.yaml          configuração do Render; contexto de build na raiz
package.json         workspace e comandos de conveniência
package-lock.json    lockfile único; instalação pela raiz
```

Os arquivos do modelo atual estão em `backend/schema.sql`,
`backend/sample-data.sql` e `backend/modelo.dbml` (para [dbdiagram.io](https://dbdiagram.io)).
Migrações executáveis: `backend/migrations/postgresql/`. Não executar o snapshot
ou dados de exemplo sobre um banco existente ou em produção.

## Instalar e iniciar

Na raiz, com Node.js 24:

```sh
npm ci
```

Crie **`backend/.env`** a partir de `backend/.env.example`, somente se ainda não
existir configuração local. Se você já tinha `.env` na raiz antes da reorganização,
copie-o para `backend/.env`, preservando seus valores. O Git não move arquivos
ignorados. Não sobrescreva configurações preenchidas nem envie segredos ao Git.

Preencha `DATABASE_URL` e `AUTH_KEY`; a conexão direta pode ser configurada em
`DIRECT_DATABASE_URL` para migrações/importação. O servidor e os CLIs carregam
`backend/.env` porque os comandos abaixo executam nesse workspace.

```sh
npm run db:migrate
npm run catalog:import
npm run dev
```

Use migração/importação somente quando necessário. Não reimporte um catálogo
já carregado apenas por causa da mudança de pastas. Configuração local padrão:
`http://127.0.0.1:3000/health`. No PowerShell com scripts bloqueados, use `npm.cmd`.

Os comandos antigos continuam disponíveis **na raiz**, incluindo `build`, `start`,
`db:backup`, `db:restore`, `admin:promote`, `typecheck` e `test`.
Também é possível executar os scripts diretamente dentro de `backend/`.

## Verificação

```sh
npm run typecheck
npm run build
npm run format:check
npm test
```

`npm test` executa testes puros e os de PostgreSQL; estes últimos são ignorados
se `TEST_DATABASE_URL` não estiver definida. Isso não valida a integração.

Para a verificação completa, defina `TEST_DATABASE_URL` com um PostgreSQL
**exclusivo de testes**, exportada no terminal (não basta colocá-la no `.env`):

```sh
npm run verify
```

Este comando falha sem a variável. Os testes criam schemas aleatórios e os removem
ao terminar. A CI fornece PostgreSQL 17 descartável e valida também o Dockerfile.
`npm run test:integration` executa a suíte com o mesmo requisito explícito.

## Produção e frontend

[Publicação no Render](docs/deploy/PUBLICAR-RENDER.md),
[homologação anterior](docs/fechamento-backend-render.md),
[organização e revisão atual](docs/organizacao-repositorio.md) e
[Neon](docs/neon.md).

O Dockerfile e o `render.yaml` continuam na raiz. Não configure Root Directory
como `backend` no Render: a imagem usa o workspace e o lockfile da raiz.
As rotas publicadas usam `/api`; `/live` e `/health` permanecem na raiz HTTP.
O processo de produção verifica schema e catálogo sem aplicar DDL automaticamente.

Rode `npm run dev:site` para abrir o site e a API de contas em
http://127.0.0.1:4173. A aplicação usa a mesma versão do catálogo de regras do
backend e salva rascunhos e fichas no navegador. Consulte o
[escopo do construtor](frontend/README.md).

O backend ainda não certifica integralmente as regras de D&D 2024;
`rulesVerified` permanece `false`. Veja o escopo documentado em `docs/`.

A implementação SQLite, seu importador e suas dependências foram removidos.
Versões anteriores continuam disponíveis no histórico Git. O backend atual usa
somente PostgreSQL; esta remoção não altera nem apaga dados do banco publicado.
