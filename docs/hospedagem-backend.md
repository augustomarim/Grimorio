# Hospedagem atual: Render + Neon

A API Node.js roda no Render; o banco é PostgreSQL no Neon. Não há necessidade de disco persistente SQLite, de instalar Docker no PC dos usuários ou de contratar uma VPS apenas por causa do banco. O Dockerfile é usado pelo serviço de hospedagem para construir o backend.

Criar um Web Service no Render a partir do repositório, usando o Dockerfile da raiz. Definir HOST=0.0.0.0; o servidor usa PORT fornecida pela plataforma. Configurar DATABASE_URL pooled e DIRECT_DATABASE_URL direta do Neon, AUTH_KEY, APP_ORIGIN e SMTP via campos secretos do provedor. Não incluir URLs no frontend. O healthcheck é /health; produção retorna 503 enquanto o catálogo estiver vazio.

A carga inicial pode ser executada do seu PC com a conexão direta e `npm.cmd run catalog:import` antes de iniciar o serviço. Dados antigos devem ser transferidos antes dessa carga, seguindo neon.md. A API também confere/aplica migrações ao iniciar; o usuário de conexão atual precisa das permissões correspondentes. Separar papel de migração e papel restrito de execução é uma evolução de implantação, não está automatizado nesta versão.

Produção exige HTTPS e SMTP. O transporte exige TLS (465 direto ou 587 com STARTTLS). Links de verificação/reset continuam apontando para páginas do futuro frontend, com token em fragmento; elas ainda precisam ser implementadas. Não publicar um fluxo de cadastro para usuários finais sem concluir essa parte.

TRUSTED_PROXIES aceita somente IPs explícitos. A configuração do Compose local confia apenas no Caddy desse Compose. Em Render, conferir os endereços e cabeçalhos da infraestrutura antes de confiar em um proxy; não usar indiscriminadamente true ou *. Sem proxy configurado, os limites por IP podem agrupar clientes pelo IP do proxy. Isso precisa ser conferido na homologação da plataforma.

Frontend na Vercel e API onrender.com são origens e sites diferentes. Cookies SameSite=Lax não devem ser presumidos como funcionais em fetch entre esses dois sites. No frontend, preparar encaminhamento /api pela Vercel ou domínios do mesmo site e ajustar caminhos dos cookies; essa integração ainda não foi implementada, pois o frontend ficou para depois. CORS não substitui essa configuração. Thunder Client continua testando a API diretamente com Origin configurada.

O Compose em deploy continua como alternativa opcional com Caddy, agora conectado ao Neon, sem volume de banco SQLite. Backups pg_dump devem ir para armazenamento privado externo; disco efêmero do Render não é local de retenção.

Os planos gratuitos podem suspender serviços e limitar compute/conexões/armazenamento. Conferir condições atuais nos painéis, sem tratar como hospedagem ilimitada ou disponibilidade garantida. Nenhum serviço foi publicado nesta entrega.
