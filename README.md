# Grimorio — backend v0.1

API em **Node.js 24, TypeScript, Fastify e SQLite**, sem frontend. O primeiro incremento implementa autenticação, catálogo e CRUD básico de fichas D&D. As migrações SQL e os artefatos da modelagem permanecem versionados.

## O que já funciona

- Migrações numeradas com checksum, histórico, transação e verificação de integridade.
- Cadastro, hash Argon2id real, login, access/refresh opacos em cookies HttpOnly, rotação e revogação por replay.
- Consulta de conta, logout de uma/todas as sessões, verificação de e-mail e recuperação de senha de uso único.
- Proteção de origem nas escritas, CORS restrito à origem configurada, cabeçalhos de segurança e limites de tentativas.
- Importação da biblioteca **0.5.1** usando sua API pública e IndexedDB em memória; consultas posteriores usam somente SQLite.
- Catálogo paginado por tipo, detalhe, fontes e consulta de sistemas habilitados.
- Criar, consultar, pesquisar, editar e excluir ficha básica; narrativa, atributos, multiclasse e histórico de PV.
- Inventário: adicionar itens do catálogo, listar/filtrar, alterar quantidade/equipamento/notas e remover instâncias com permissões e auditoria.
- Publicação apenas com e-mail confirmado e moderação administrativa, sem permitir edição de ficha alheia.

O backend **não valida todas as regras de D&D 2024**. Respostas de ficha informam `validation.rulesVerified: false`. As verificações já feitas incluem limites de atributos, soma de níveis, classe/subclasse, histórico de PV e opções depreciadas. Requisitos completos de multiclasse e conjuração ainda dependem da conferência normativa documentada.

## Requisitos

Node.js 24 (`.nvmrc` registra a versão usada), npm e disco persistente para o SQLite. A instalação pode precisar de ferramentas de compilação para os módulos nativos, caso a plataforma não tenha binários compatíveis de better-sqlite3/argon2.

## Preparar o ambiente local

Na raiz do repositório:

```sh
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie o valor aleatório para `AUTH_KEY` **somente no arquivo `.env`**, que é ignorado pelo Git. Não use a chave de teste nem envie o segredo ao repositório. No PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`.

Por padrão, o backend escuta `127.0.0.1:3000`, o banco fica em `data/grimorio.db` e a origem permitida é `http://localhost:3000`. Configure `APP_ORIGIN` para a origem exata do futuro cliente. Escritas sem esse cabeçalho `Origin` são rejeitadas, inclusive no Postman/curl; envie-o explicitamente nesses clientes.

```sh
npm run db:migrate
npm run catalog:import
npm run dev
```

O servidor também confere/aplica as migrações ao iniciar, antes de aceitar requisições. **Não execute `schema.sql` ou `sample-data.sql` sobre esse banco:** são caminhos alternativos e exemplos de modelagem, respectivamente. Não existem administrador ou senha padrão. O importador carrega conteúdo, não contas ou personagens de exemplo.

Para executar JavaScript compilado:

```sh
npm run build
npm start
```

Consulte a saúde com:

```sh
curl http://127.0.0.1:3000/health
```

## E-mail de desenvolvimento

Não há provedor de e-mail real conectado. Para exercitar confirmação e reset, configure no `.env`:

```dotenv
MAIL_MODE=file
MAIL_DIRECTORY=./data/mail
```

O backend gravará cada entrega como um arquivo JSON privado nessa pasta, contendo destinatário, finalidade e token. Isso simula a caixa de entrada: use o token na rota de confirmação correspondente. Os arquivos não são servidos pela API e ficam ignorados pelo Git. Não há envio de mensagens externas nem impressão dos tokens nos logs. **Modo de arquivo é proibido em produção.**

`MAIL_MODE=disabled` aceita as solicitações com resposta genérica, mas não entrega mensagens. Se uma entrega em arquivo falhar, há log de falha sem credenciais; reenvio precisa ser solicitado. Ainda não há fila durável de entrega.

## Autenticação e primeiro acesso

1. `POST /auth/register` com `email`, `username` e `password` (12–128 caracteres).
2. A resposta é genérica, inclusive para dados já cadastrados; o papel inicial é sempre `user`.
3. `POST /auth/login` recebe e-mail e senha. O cliente deve armazenar os cookies enviados, sem procurar tokens no JSON.
4. `GET /auth/me` retorna a conta autenticada.
5. Confirme o e-mail com o token da caixa de entrada de desenvolvimento para publicar fichas. Uso privado não exige confirmação.

O cookie de access usa Path `/`; o refresh usa Path `/auth`, para suportar renovação e logout. Ambos são HttpOnly e SameSite=Lax, com Secure quando a origem usa HTTPS. A origem deve ser do mesmo site da API para esse arranjo de cookies; implantações em sites diferentes exigem revisão de cookies/CSRF.

Access: 15 minutos. Família/refresh: limite absoluto de 30 dias. Rotação invalida o access anterior. Reutilizar um refresh consumido revoga a família; o cliente precisa coordenar uma única renovação, inclusive entre abas. Uma conta inativa não autentica nem renova sessões.

Para tornar uma conta existente administradora por operação local explícita:

```sh
npm run admin:promote -- email-da-conta-existente
```

Essa operação é auditada. Não existe endpoint público de promoção. O administrador consulta e modera, mas só edita/exclui fichas que também sejam suas.

## Catálogo e ids

```text
GET /systems
GET /sources?page=1&limit=20
GET /catalog/class?page=1&limit=20
GET /catalog/spell?q=Light
GET /catalog/spell/:id
```

`id` do catálogo é a identidade comum. **As escolhas de ficha usam `localId`**, id da tabela específica. A listagem informa os dois; o detalhe informa o id específico em `details.id`. São espaços de ids diferentes.

A origem bibliográfica é exibida em `sources`. Array vazio significa fonte não identificada, não livro base. O importador preserva vínculos bibliográficos já curados, adiciona fontes explícitas não ambíguas e não inventa fontes para magias sem esse dado. A classificação de fonte não comprova oficialidade ou licença de publicação.

Reimportações preservam ids e referências, atualizam por slug/tipo e depreciam registros ausentes em vez de apagá-los. A revisão não congela todo o conteúdo histórico. A importação foi validada especificamente para a versão 0.5.1, fixada no package.json.

## Criar uma ficha básica

`POST /characters`, autenticado, recebe por exemplo (substitua os ids pelos `localId` do seu catálogo):

```json
{
  "name": "Minha primeira ficha",
  "systemCode": "dnd-2024",
  "attributes": {
    "strength": 10,
    "dexterity": 14,
    "constitution": 14,
    "intelligence": 16,
    "wisdom": 14,
    "charisma": 14
  },
  "speciesId": 1,
  "classes": [
    { "classId": 1, "level": 1, "initial": true }
  ],
  "narrative": { "backstory": "História do personagem" }
}
```

Nível 1 ganha uma entrada inicial de PV com máximo do dado. Para níveis maiores, `progression` permite informar a sequência de classes e os métodos de PV. Se não houver histórico, a ficha é salva como construção parcial e `hitPoints` é `null`, não um máximo fictício de zero.

Ao alterar classes via PATCH, envie o histórico completo para não apagar escolhas de rolagem silenciosamente. Mudança de espécie/antecedente/subclasse com concessões dependentes pode ser rejeitada pelas FKs: a conciliação dessas concessões ainda precisa de endpoints específicos.

O dono edita e exclui. A consulta pública e a galeria exigem publicação liberada, conta ativa e e-mail confirmado. APIs de moderação mantêm bloqueio até liberação administrativa. Nenhuma ficha recebe selo automático de legalidade completa.


### Inventário

Rotas GET/POST `/characters/:id/items` e GET/PATCH/DELETE `/characters/:id/items/:itemInstanceId` estão implementadas. POST usa `itemId` igual ao `localId` de `/catalog/item`, não o id comum do catálogo. Quantidade mínima 1; equipamento booleano; notas opcionais. Duas linhas do mesmo item podem ter estados distintos. Apenas o dono modifica; a leitura acompanha a visibilidade da ficha.

Não é preciso recriar o banco ou aplicar migração para esse incremento. Contrato e limites em [inventario-backend.md](docs/inventario-backend.md).

Veja rotas e limites em [estado do backend](docs/estado-backend.md).

## Verificação automática com um comando

No Windows:

```powershell
npm.cmd run verify
```

Esse comando faz typecheck, compila, executa os testes HTTP e percorre o fluxo completo de uso sozinho, por uma conexão HTTP real. Ele cria um servidor em **porta temporária**, banco, chaves, contas e caixa de e-mail temporários. Confirma e-mails, administra cookies, recupera senha, verifica permissões e cria/edita/publica/exclui fichas sem intervenção no Thunder Client.

**Não altera seu `.env`, não usa sua conta e não altera `data/grimorio.db`.** Você pode manter `npm.cmd run dev` aberto em outro terminal. Os dados temporários são removidos ao final. O relatório atual, sem senhas/tokens, fica em `reports/smoke.json`; o executor remove o relatório anterior antes de iniciar para não confundir um resultado antigo com o atual.

Não precisa de Python para esse comando. Os testes Python anteriores continuam opcionais localmente (`npm.cmd run test:model`) e são executados também no workflow do GitHub.

Para apenas o fluxo real por socket: `npm.cmd run test:smoke` (também compila antes).

A automação do GitHub está preparada em `.github/workflows/verify.yml`, para push/pull request. Sua execução remota depende de os arquivos serem enviados ao repositório; criar o workflow aqui não comprova execução no GitHub.

## Testes e resultados

```sh
npm run typecheck
npm run build
npm test
npm run test:model
npm run format:check
```

Os testes Node usam **SQLite em arquivo**, Fastify HTTP injection, Argon2id e o catálogo real; não simulam o banco. Os testes Python preservam as especificações anteriores do modelo. A demonstração adicional em socket local está registrada em [execucao-backend.json](docs/execucao-backend.json), sem senhas ou tokens.

## Estrutura

```text
src/
  app.ts             montagem da API e políticas HTTP
  server.ts          inicialização e encerramento
  config.ts          validação de configuração
  db/                conexão e migrador real
  auth/              contas, tokens, senhas e entrega de desenvolvimento
  catalog/           importador e consultas
  characters/        ficha básica e permissões
  routes/            rotas de autenticação
migrations/          SQL versionado e imutável
schema.sql           snapshot de referência da modelagem
sample-data.sql      exemplos: não usar como seed de produção
test/               testes HTTP do backend
tests/              testes anteriores do modelo e protocolos
```

## Limites deste incremento

Sem frontend, hospedagem, provedor de e-mail ou agendamento externo de backups. Ainda faltam endpoints de edição de talentos/proficiências, concessões de magia e grimório; cálculo completo de conjuração; conciliação de dependências ao mudar escolhas e teste de implantação real. O schema já tem essas estruturas, mas isso não significa que todos os seus endpoints estejam implementados.

A ficha interativa de partida fica para a v1.5. Confira o histórico de decisões em [docs/modelagem.md](docs/modelagem.md) e as pendências normativas em [docs/fechamento-modelagem-v1.md](docs/fechamento-modelagem-v1.md).

Benefícios de personagem: [rotas, exemplos e limites](docs/beneficios-backend.md).
