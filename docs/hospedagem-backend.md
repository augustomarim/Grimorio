# Hospedagem do backend — preparação para produção

Referência preparada: VPS Linux com Docker Compose, **uma instância Node.js 24**, SQLite em volume local persistente e Caddy com HTTPS. Não houve publicação nesta entrega. Não use disco efêmero de serviço gratuito nem várias réplicas compartilhando SQLite por NFS. Isso não impede adicionar outros sistemas de RPG; quando a carga exigir múltiplos escritores/servidores, avaliar migração de persistência separadamente.

## O que foi preparado

- Dockerfile em duas etapas, dependências de produção, processo como usuário node, healthcheck, sem .env/bancos/segredos na imagem.
- Compose com volumes de banco, backups e certificados. Só Caddy expõe 80/443; API não expõe porta no host. Um proxy com IP fixo é confiável para os cabeçalhos de IP; endereços externos não são confiáveis.
- Produção exige HTTPS e MAIL_MODE=smtp. SMTP 587 exige STARTTLS, 465 usa TLS direto; mínimo TLS 1.2, validação de certificado habilitada e nenhum acesso do template a arquivos/URLs externos.
- /health retorna 503 em produção quando o catálogo está vazio. Importação e migrações usam o catálogo local do pacote, sem baixar regras de uma API.
- Backup online usa a API SQLite, inclui transações do WAL e confere integrity_check, foreign_key_check e histórico/checksums. Arquivos saem com permissão 0600. Restauração nunca sobrescreve um banco existente.

## Antes de publicar

Escolher VPS, domínio da API e serviço SMTP. Criar DNS A/AAAA apontando para o servidor e permitir 80/443; porta SSH deve seguir a política do seu servidor. A rede Docker 172.30.0.0/24 precisa estar livre; se conflitar, mudar a subnet, os dois IPs e TRUSTED_PROXIES em conjunto. Não liberar a porta 3000 publicamente.

No servidor, a partir da raiz do repositório:

```sh
cp deploy/production.env.example deploy/.env.production
chmod 600 deploy/.env.production
```

Preencher o arquivo privado: API_DOMAIN sem protocolo, APP_ORIGIN com a origem HTTPS exata do futuro frontend, chave AUTH_KEY aleatória de 32 bytes ou mais e credenciais SMTP. Gere a chave com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Não enviar chave, senha SMTP nem banco ao Git. O proxy recebe apenas API_DOMAIN; as credenciais ficam só na API.

Os links de confirmação/reset apontam para /verify-email e /reset-password na origem do frontend, com token no fragmento #token=.... **Essas páginas ainda serão implementadas no frontend**; o link sozinho não confirma nem reseta conta. O frontend deverá ler o fragmento e enviar o token ao POST existente da API. Até lá, a validação do fluxo usa os endpoints diretamente. Não publicar como fluxo de cadastro pronto para usuários finais sem essas páginas.

Os e-mails são enviados em português. Falha SMTP gera evento sanitizado no log; cadastro/reset continuam com resposta genérica, sem revelar contas. Os endpoints de reenvio permanecem disponíveis. Não há fila durável nem repetição automática nesta versão. SPF, DKIM, DMARC, domínio remetente e entrega na caixa de entrada dependem do provedor e devem ser verificados na homologação.

## Primeira implantação — comandos preparados, não executados no seu servidor

```sh
docker compose --env-file deploy/.env.production -f deploy/compose.yaml build
docker compose --env-file deploy/.env.production -f deploy/compose.yaml run --rm api node dist/catalog/import-cli.js
docker compose --env-file deploy/.env.production -f deploy/compose.yaml up -d
docker compose --env-file deploy/.env.production -f deploy/compose.yaml ps
```

A importação inicial também executa migrações; não carrega sample-data.sql nem cria contas de exemplo. Consultar https://SEU_DOMINIO/health. Cadastro de administrador é uma promoção explícita do e-mail por `node dist/auth/admin-cli.js EMAIL`, executada no container da API após criar a conta. Não existe senha padrão de administrador.

Após implantar, conferir HTTPS real, resposta /health, login/refresh/logout, cadastro com entrega real e confirmação/reset quando o frontend estiver disponível. Credenciais e aprovação de publicação não foram solicitadas porque ainda estamos preparando e testando os arquivos localmente.

## Backup operacional

No PC de desenvolvimento (servidor pode estar ativo para backup):

```powershell
npm.cmd run db:backup -- ./backups/backup-AAAA-MM-DD.db
npm.cmd run db:verify-backup -- ./backups/backup-AAAA-MM-DD.db
```

No servidor:

```sh
docker compose --env-file deploy/.env.production -f deploy/compose.yaml exec -T api node dist/db/backup-cli.js backup /backups/backup-AAAA-MM-DD.db
docker compose --env-file deploy/.env.production -f deploy/compose.yaml exec -T api node dist/db/backup-cli.js verify /backups/backup-AAAA-MM-DD.db
```

Use um nome novo em cada execução. Recomenda-se agendar no cron do host uma vez por dia e antes de cada atualização; definir frequência conforme a perda máxima aceitável. O agendamento não foi instalado automaticamente. Manter, por exemplo, 7 diários e 4 semanais **depois de verificar os backups**. Não há exclusão automática nesta entrega.

O volume de backup no mesmo VPS não protege contra perda do servidor. Copiar os arquivos concluídos para armazenamento externo privado, com criptografia e retenção. Guardar AUTH_KEY e credenciais separadamente em cofre; backups contêm dados pessoais e hashes. Os certificados/chaves do proxy também têm volume próprio. Não copiar apenas grimorio.db com o servidor ativo; transações podem estar no WAL.

## Restauração e atualizações

1. Parar a API e impedir novas escritas. Preservar o banco anterior e seus arquivos WAL/SHM juntos; nunca remover WAL de um banco ativo.
2. Verificar o backup. Restaurar para **outro caminho**, por exemplo /data/restored-AAAA-MM-DD.db:

```sh
docker compose --env-file deploy/.env.production -f deploy/compose.yaml stop api
docker compose --env-file deploy/.env.production -f deploy/compose.yaml run --rm api node dist/db/backup-cli.js restore /backups/backup-AAAA-MM-DD.db /data/restored-AAAA-MM-DD.db
```

3. Configurar DATABASE_PATH para esse caminho em compose.yaml (ou preparar uma alteração revisável de volume/caminho), iniciar a API e conferir saúde e dados. A versão da aplicação deve reconhecer as migrações do backup. Uma versão antiga não pode abrir um schema futuro; a atualização migra para frente após backup.
4. Só retirar os arquivos antigos depois da conferência. A restauração perde escritas posteriores ao horário do backup; isso deve ser uma decisão explícita do operador.

Para atualização normal, fazer backup, parar a API, construir a nova imagem e executar migrações da nova imagem antes de subir. Evitar períodos com duas versões escrevendo o mesmo banco. Manter a revisão/imagem anterior identificada; rollback de dados é restauração, não SQL inverso automático.

## Limites de prontidão

A consulta npm audit é uma verificação de avisos conhecidos, não uma garantia de segurança. Rate limit global é em memória nesta instância; o bloqueio de login continua persistido no SQLite. Volumes e banco exigem monitoramento de espaço em disco, disponibilidade, logs e backup. Um VPS é ponto único de falha; não há failover ou autoscaling nesta proposta.

Entrega inclui testes locais e do container. Não valida DNS, emissão real de certificado do seu domínio, credenciais/entrega SMTP ou recuperação de desastre de um provedor ainda não escolhido. A ficha interativa e o frontend seguem fora desta etapa.

## Verificação executada nesta entrega

Passaram 153 testes Vitest, 43 testes Python e 76 verificações HTTP com servidor isolado. Typecheck, build, formatação e diff passaram. O npm audit final não encontrou vulnerabilidades conhecidas no lockfile. A imagem Docker foi construída e executada: catálogo vazio retornou 503, importação real criou 1.905 entradas, processo executou como UID 1000, dados persistiram após reinício e backup/restauração foram verificados dentro da imagem. O Compose e o Caddyfile foram validados. Não houve envio externo de e-mails, emissão de certificado público ou implantação no provedor. O teste de SMTP usou transporte JSON local; autenticação e entregabilidade reais continuam para a homologação.
