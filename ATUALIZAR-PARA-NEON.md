# Atualizar o Grimorio para Neon

1. Parar o servidor e guardar uma cópia do banco SQLite antigo. Não apagar seu banco nem seu .env.
2. Extrair este ZIP na raiz do Grimorio e executar `npm.cmd ci`.
3. Criar o projeto PostgreSQL 17 no Neon e colocar DATABASE_URL e, opcionalmente, DIRECT_DATABASE_URL no seu .env. Não postar essas URLs no chat ou no Git.
4. Escolher **uma** das opções abaixo:
   - Banco novo, sem preservar fichas antigas: `npm.cmd run catalog:import`.
   - Preservar fichas: antes de qualquer importação/início da API, `npm.cmd run db:transfer-sqlite -- C:\caminho\grimorio.db`, apontando a conexão para um PostgreSQL novo vazio. Depois `npm.cmd run catalog:import`.
5. Executar `npm.cmd run dev` e conferir /health.

As migrações atuais ficam em migrations/postgresql. Os arquivos SQLite antigos eventualmente deixados em migrations pela extração não serão executados. A suíte de testes também ignora backend.test.ts/production.test.ts antigos do SQLite. Se existir .github/workflows/verify.yml de uma entrega antiga, remover esse workflow antes do commit: ele chamava a verificação SQLite que foi arquivada. Não foi instalado um novo CI automático.

Para hospedagem, ler docs/neon.md e docs/hospedagem-backend.md. Neon hospeda apenas o banco; Render pode hospedar a API, e a Vercel o frontend futuro. Ainda não houve conexão a um projeto Neon real nem publicação.
