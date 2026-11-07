# Publicar o backend no Render

O código está preparado para a publicação da API. Login próprio por e-mail/senha; **não há login Google/Gmail**. O banco continua no Neon, sem nova migração nesta entrega (PostgreSQL v1, 51 tabelas/9 views).

## Atualizar seus arquivos

Pare o servidor, extraia o ZIP na raiz do Grimorio e mantenha seu `.env` preenchido. Não apague tabelas ou o catálogo já carregado. Execute `npm.cmd ci` para conferir as dependências e `npm.cmd run dev` se quiser continuar localmente. Na configuração local, API_PREFIX vazio mantém as URLs antigas, como /auth/login.

O pacote inclui a correção do importador em lotes, com progresso e limites de espera, mesmo que você não tenha usado o ZIP anterior. **Não precisa reimportar o catálogo que já terminou com sucesso.**

Se existir `.github/workflows/verify.yml` de uma entrega antiga, remova esse workflow antes do commit; ele chamava a verificação SQLite arquivada. A rotina nova de backup é separada, opcional e fica desativada até configurar ENABLE_BACKUPS=true.

## Preparar as mensagens de conta

As mensagens de confirmação de endereço e recuperação de senha são e-mails transacionais, não autenticação pelo Google. A opção preparada para Render é **MAIL_MODE=resend**, que envia por HTTPS. SMTP continua opcional, sujeito à disponibilidade de portas no provedor/plano.

No provedor Resend, obter uma API key de envio e cadastrar um remetente autorizado/verificado. Restrições de conta de testes, destinatários, domínio, DNS e cotas devem ser conferidas no painel do provedor. Não se presume envio irrestrito nem domínio gratuito. Informações: https://resend.com/docs/api-reference/emails/send-email.

## Criar o Web Service

No Render, conectar o repositório e usar um Web Service com Dockerfile da raiz; render.yaml também pode ser usado como Blueprint. Não publicar no Vercel este backend.

O Blueprint já define:

| Variável/configuração | Valor |
|---|---|
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| API_PREFIX | /api |
| COOKIE_SAME_SITE | lax |
| TRUSTED_PROXIES | loopback e redes privadas explicitamente declaradas no YAML |
| AUTH_KEY | gerada pelo Render |
| MAIL_MODE | resend |
| Health Check Path | /live |

Preencher nos campos secretos do Render:

- DATABASE_URL: conexão pooled do Neon, com credencial do banco.
- RESEND_API_KEY: chave do provedor de e-mail.
- MAIL_FROM: endereço de remetente autorizado/verificado nesse provedor.

O servidor usa PORT fornecida pelo Render. Não fixe a porta 3000 no painel. RENDER_EXTERNAL_URL fornece automaticamente a origem pública da API; enquanto não houver frontend, ela também será a origem permitida. Depois configure APP_ORIGIN com a URL HTTPS exata do frontend. PUBLIC_API_ORIGIN é opcional se usar domínio próprio para a API.

Não enviar URLs de banco ou chaves ao chat, ao Git, ao frontend ou a variáveis públicas da Vercel.

## Banco e migrações

Seu Neon já recebeu o catálogo. A produção agora **verifica** o schema e o catálogo, sem executar DDL implicitamente na inicialização. Se uma migração ficar pendente, o processo para com instrução de executar db:migrate usando a conexão direta. Antes de futuras migrações, gerar/conferir backup. Para banco novo ainda vazio, executar catalog:import do seu PC antes de subir a API.

Não carregar sample-data.sql em produção. O catálogo mantém origem bibliográfica dos registros; a revisão da biblioteca continua 0.5.1.

## Conferir depois da publicação

- /live: processo está ativo, sem consultar o banco; usado pelo Render/Docker para não manter o compute do Neon acordado por consultas repetidas.
- /health: confere banco, histórico e catálogo. Uma consulta aqui pode acordar o compute; usar na homologação ou investigação, não como ping frequente apenas para impedir suspensão.
- As rotas de negócio ficam sob /api: /api/auth/login, /api/catalog/spell, /api/characters etc.
- No Thunder Client, usar Origin igual à origem permitida. Inicialmente, a URL HTTPS do próprio serviço Render; depois, APP_ORIGIN.

A produção exige catálogo íntegro antes de ouvir conexões. Indisponibilidade temporária do banco retorna erro 503 sanitizado com Retry-After; /live não mascara a checagem inicial, pois o processo só passa a ouvir após os requisitos iniciais.

Para conferir cabeçalhos do proxy sem expor segredos, uma conta admin pode consultar GET /api/admin/runtime. A resposta mostra apenas IP do par, IP considerado e nomes de opções. Não mostra URLs, credenciais ou conteúdo de e-mails. Confia-se só em um par permitido por IP/CIDR e no próximo IP encaminhado, nunca em toda a cadeia. Se a infraestrutura observada usar outro endereço, ajustar a allowlist conscientemente; não usar trustProxy=true, * ou 0.0.0.0/0. Um gateway da Vercel pode aparecer como cliente de rede no Render; limites por e-mail continuam independentes do IP.

Para promover sua conta já cadastrada: executar localmente `npm.cmd run admin:promote -- seu-email`, usando a conexão direta privada. Não existe admin ou senha padrão. O admin lê/modera, mas não ganha edição irrestrita de fichas alheias.

## Quando chegar o frontend

Copiar o exemplo deploy/vercel-proxy.example.json para a configuração do **projeto frontend**, trocando o destino pelo serviço real. O navegador chama /api no mesmo domínio da Vercel, e o encaminhamento mantém /api no Render. Cookies HttpOnly/Secure ficam no domínio visto pelo navegador, com caminhos /api e /api/auth, sem dependência de cookies de terceiros.

Definir APP_ORIGIN no Render para a origem HTTPS exata desse frontend. A opção SameSite=None também existe, mas não elimina bloqueios de cookies de terceiros; o encaminhamento na mesma origem é a opção recomendada. Todas as escritas verificam Origin.

As páginas /verify-email e /reset-password pertencem ao frontend futuro. Elas deverão ler token do fragmento #token e chamar os POSTs correspondentes da API; GET de link não altera conta. Essas páginas não foram feitas nesta entrega de backend. Não convidar usuários finais antes de concluir a interface.

O frontend deve coordenar apenas uma renovação de sessão por vez, inclusive entre abas. Reutilização de refresh revoga a família intencionalmente.

## Backup externo e recuperação

Ver docs/backup-producao.md. A rotina opcional no GitHub exporta o Neon, criptografa com AES-256-GCM e retém somente o archive criptografado e seu manifesto. Nenhuma rotina está ativa no seu repositório por esta entrega; ela depende dos seus secrets e ENABLE_BACKUPS=true.

Os limites e preços dos planos gratuitos devem ser conferidos nos provedores. Não há promessa de disponibilidade ou capacidade ilimitadas. Não foi publicado serviço nem enviado e-mail real nesta homologação.
