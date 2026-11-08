# Organização e revisão antes do frontend

## Estrutura adotada

O repositório é um monorepositório com npm workspaces. Somente `backend` é um
workspace executável nesta entrega. `frontend/README.md` reserva o espaço para
a aplicação web sem instalar antecipadamente framework ou dependências.

- `backend/src`, `backend/test`, `backend/migrations`: implementação e testes atuais.
- `backend/schema.sql`, `backend/sample-data.sql`, `backend/modelo.dbml`: modelo PostgreSQL.
- `docs/deploy`: roteiro e mensagem histórica da entrega Render.
- `deploy`, Dockerfile, render.yaml e workflows: implantação e automação na raiz.
- `legacy/sqlite`: único local do histórico SQLite. As cópias antigas da raiz
  foram comparadas byte a byte com o arquivo histórico antes da remoção.

O lockfile é único na raiz, com as mesmas versões e integridades das dependências.
Os comandos npm da raiz delegam ao backend, mantendo um ponto de entrada comum.
Os caminhos relativos de migrações continuam válidos tanto no TypeScript quanto
no JavaScript compilado porque src/dist e migrations foram movidos juntos.

## Ajustes necessários encontrados na revisão

1. O script `scripts/smoke.mjs` da raiz ainda usava SQLite, acesso síncrono ao
   banco e configuração `databasePath`; não era válido para o backend PostgreSQL.
   A cópia histórica foi preservada em legacy/sqlite/scripts. A verificação atual
   executa os testes PostgreSQL HTTP existentes em vez de esse script obsoleto.
2. Testes/migrações SQLite duplicados estavam misturados ao código atual. Foram
   removidas somente as cópias idênticas que já existiam no histórico.
3. Não havia CI atual de verificação: o novo workflow usa PostgreSQL 17
   descartável, executa `npm run verify` e constrói a imagem de produção.
   `verify`/`test:integration` falham se TEST_DATABASE_URL estiver ausente;
   `npm test` continua disponível para executar testes puros sem banco.
4. O Dockerfile incluía pg_dump/pg_restore 17. O health do servidor publicado
   informou PostgreSQL 18 na homologação anterior; pg_dump não pode exportar
   servidor de versão principal superior à sua. A imagem agora inclui as
   ferramentas 18, mantendo o protocolo/esquema e o servidor de testes 17.
5. O README misturava orientações históricas e atuais de e-mail/deploy. O guia
   principal agora aponta ao roteiro atual e explica cwd, .env e workspaces.

## Efeito no ambiente do desenvolvedor

Após atualizar a branch, executar `npm ci` na raiz. O arquivo ignorado `.env`
antigo não é movido pelo Git: copiá-lo para `backend/.env` sem sobrescrever uma
configuração existente. Caminhos relativos personalizados em MAIL_DIRECTORY,
backups e scripts locais devem considerar o novo cwd `backend/`.

Não é necessário executar DDL, limpar banco ou reimportar catálogo por causa
desta organização. Os arquivos SQL executáveis não foram alterados.

O contexto Docker continua na raiz. Dentro da imagem o cwd é `/app/backend`,
preservando `node dist/server.js` e os comandos de backup `node dist/db/...`.
O Render pode manter as definições existentes: Dockerfile da raiz e Root
Directory vazio. O workflow de backup continua separado e opt-in.

## Cobertura e pendências de produto

A organização não adiciona recursos nem certifica integralmente D&D 2024. Os
relatórios de regras mantêm `rulesVerified=false`. A suíte existente cobre
PostgreSQL, catálogo, autenticação, fichas, permissões e configurações de produção;
o resultado da execução desta entrega deve ser consultado no PR.

Antes de publicar o frontend, conferir sua origem real em APP_ORIGIN, estratégia
de domínio/proxy e comportamento dos cookies no navegador. E-mail real,
backup/restauração operacional e particularidades dos suplementos continuam
precisando de homologação nos respectivos ambientes. Nenhuma credencial ou
configuração do serviço publicado foi alterada por esta reorganização.

## Validação desta reorganização

- Instalação limpa (`npm ci`) com lockfile único; versões e integridades das
  dependências comparadas com o lockfile anterior e preservadas.
- `npm run verify`: tipos, compilação, formatação e 97 testes aprovados, sem
  testes ignorados, contra PostgreSQL 17 descartável.
- `test:integration` sem TEST_DATABASE_URL: encerrou com erro explicativo,
  confirmando que a verificação completa não passa sem banco.
- Imagem Docker construída; o CLI aplicou a migração e importou 1.905 registros
  e 4.631 referências em um banco exclusivo de smoke, separado do banco da suíte.
- Servidor da imagem iniciado em desenvolvimento: `/live`, `/health` e
  `/api/systems` retornaram HTTP 200; schema PostgreSQL v1 e catálogo íntegro.
- pg_dump/pg_restore 18.6 carregaram na imagem; backup custom do banco de smoke
  foi gerado e validado por `pg_restore --list` através dos CLIs existentes.

Essas verificações são locais. Não houve deploy ou alteração no banco publicado.
O workflow do GitHub ainda precisa executar na branch/PR após o envio.
