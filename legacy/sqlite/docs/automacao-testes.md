# Testes automáticos, sem roteiro manual no Thunder Client

Comando único no Windows: `npm.cmd run verify`. Node 24 e dependências instaladas com npm ci são os pré-requisitos. Não é necessário configurar segredo, .env, cadastrar uma conta ou iniciar o servidor antes.

O executor scripts/verify.mjs elimina o relatório anterior e executa as etapas sequencialmente, preservando o código de falha: typecheck, build, testes Vitest e scripts/smoke.mjs. Usa o executável Node e o npm_cli recebidos pelo próprio npm, sem montagem de comandos com dados de usuário. Não depende do PowerShell liberar npm.ps1.

O smoke executa o JavaScript compilado, carrega o catálogo real e abre um servidor em 127.0.0.1 numa porta temporária escolhida pelo SO. Banco, cookies, senhas aleatórias, segredo e e-mails são isolados em diretório temporário e não dependem da configuração .env nem usam os dados do usuário. A conta de administrador é provisionada somente nesse banco de teste. A caixa de e-mail é local e o roteiro lê os tokens sozinho; não há envio real.

Fluxos: cadastro, duplicidade, login, sessão, privacidade, publicação antes/depois de confirmar e-mail, confirmação única, edição, outro dono, administração, moderação e liberação, refresh, replay, logout global, reset de senha, respostas genéricas, senha antiga/nova, multiclasse 3+4+3, histórico obrigatório, limite 20, exclusão, limpeza e integridade. Também consulta saúde/sistemas/fontes/catálogo e rejeita origem incorreta e JSON inválido.

São verificados os códigos de resposta e resultados relevantes (nível 10/PV base 66; nível 1/PV base 8; ausência de token no JSON; senha armazenada como hash; ausência de alteração parcial; FKs/integridade; catálogo preservado). O relatório contém apenas rótulos, rotas, códigos e resumo, sem valores de cookies/senhas/tokens. A ausência de envio de dados reais não significa certificação de todas as regras D&D ou de implantação de produção.

Os testes Vitest também cobrem expiração com relógio simulado, validação, rollback/checksums, erros de entrada, dependências e permissões. A suíte Python mantém os ensaios de schema, migrações e backup/restauração; GitHub Actions executa ambos. Não é necessário realizar cada requisição manualmente a cada mudança.

O workflow foi criado em .github/workflows/verify.yml. Será acionado por push/PR depois de enviado; não foi executado remotamente nesta etapa. O teste local completo foi executado; o resultado atual está em reports/smoke.json (ignorado pelo Git). Em caso de falha, o comando retorna código não zero e interrompe as etapas seguintes.

Verificação final executada: typecheck/build, 21 testes Vitest, 60 verificações HTTP e 41 testes Python passaram. docs/resultado-verificacao.json é uma cópia do relatório da execução real desta entrega. O cenário multiclasse continua com total 10 e PV base 66.
