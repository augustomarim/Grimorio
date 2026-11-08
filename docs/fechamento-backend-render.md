# Fechamento do backend antes do Render

Implementação entregue: configuração Render/Docker, API prefixável, cookies seguros com caminhos consistentes, CORS/Origin, confiança de proxy por IP/CIDR com apenas um encaminhamento, e-mail transacional HTTPS e SMTP opcional, proteção de memória Argon2, liveness/readiness separados, verificação de schema/catálogo sem DDL em produção, erros sanitizados e encerramento gracioso.

Backup: exportação pg_dump 17, archive criptografado AES-256-GCM, manifesto, rotina externa opt-in, restauração em banco vazio, checagens e revogação das credenciais restauradas. Não houve mudança de schema (PostgreSQL v1, 51 tabelas/9 views).

Login Google/OAuth continua fora da v1. As regras estruturadas e os cálculos de D&D mantêm o escopo anterior; automação de texto condicional e ficha interativa não foram introduzidas aqui.

A homologação usa PostgreSQL 17 real, certificado de teste confiável e um proprietário de banco sem SUPERUSER. Inclui Chromium por HTTPS local, login/refresh/cookies/reset/logout e recuperação real do grafo de dados. Nenhum projeto Neon/Render/Resend real foi acessado: não existem credenciais desses serviços no ambiente. Também não foi ativado um workflow no GitHub.

Assim, o código está preparado para publicação; permanecem como dados/configuração dos seus provedores: URLs privadas do Neon, remetente autorizado e chave de envio, e secrets/ativação de backup. Em Render, conferir os valores observados de proxy e origem. Domínio, entrega na caixa de entrada e integrações dos painéis só podem ser confirmados após configurar esses serviços. Não são apresentados como testes já executados.

A configuração passo a passo está em [deploy/PUBLICAR-RENDER.md](deploy/PUBLICAR-RENDER.md). Resultados executados estão em resultado-fechamento-render.json.
