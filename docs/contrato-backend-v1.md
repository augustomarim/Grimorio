> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

> Preparação de produção vigente: SMTP com TLS, proxy explícito, Docker/Compose, volume SQLite persistente e CLI de backup/restauração. Consulte [hospedagem do backend](hospedagem-backend.md). Não publicado; DNS/HTTPS do domínio e entrega SMTP real ainda dependem da homologação. Schema permanece 6. As descrições anteriores de produção futura abaixo são históricas.

# Plano de implementação do backend v1

Plano concreto para começar a programação sem frontend e sem construir um motor universal. A escolha técnica recomendada segue a conversa: Node.js LTS, TypeScript, Fastify e SQLite com driver verificado. O plano começou a ser implementado no backend v0.1; confira estado-backend.md para distinguir as partes entregues das futuras. Licenças, compatibilidade do driver e instalação devem ser confirmadas no início da implementação.

## Fronteiras

Núcleo: contas, autenticação, autorização, identidade de ficha, narrativa, galeria e registro de sistemas. Módulo D&D: catálogos atuais, atributos, classes, origem das escolhas e valores derivados. Persistência SQL: repositórios específicos, migrações versionadas e transações nos serviços. A integração do pacote fica em adaptador de carga; não usar a API Dexie de navegador por suposição no servidor.

A aplicação não executa sample-data.sql em produção. A migração cria schema, não usuário administrador nem credenciais fixas. Primeiro administrador exige procedimento de provisionamento próprio, sem senha em repositório. Corpo de requisição nunca fornece owner_id/role confiáveis.

## Entregas em ordem

1. Fundação: configuração tipada, conexão SQLite com FK/WAL, execução segura das migrações, tratamento uniforme de erros, logs sem credenciais e endpoint de saúde. A saúde verifica acesso ao banco e versão esperada, não atesta regras D&D.
2. Contas: cadastro, login com hash de senha real, renovação, logout de uma/todas as sessões, verificação de e-mail e recuperação. Entrega de e-mail começa com adaptador de desenvolvimento explícito; produção depende de provedor e credenciais seguros. Aplicar proteção de tentativas, cookies/CSRF e respostas genéricas.
3. Catálogo: consulta paginada por tipo, detalhes e fontes. Importação 0.5.1 com validação de completude e depreciação, sem transformar links polimórficos em FKs falsas. Suplementos continuam consultáveis com procedência explícita.
4. Fichas: operações do dono, galeria pública elegível e consulta administrativa. Permissão em cada operação; narrativa e alterações mecânicas atualizam a data da identidade na mesma transação.
5. D&D: composição multiclasse, escolhas e concessões, grimório e consultas derivadas. Começar pelas verificações documentadas; não codificar como confirmado o que ainda depende do SRD/livro. Testes devem separar integridade de conformidade de regras.
6. Operação: imagem/container, instância com disco persistente, backups externos, e-mail, domínio/TLS, migrações de implantação e teste real de recuperação. SQLite requer uma topologia compatível; múltiplas réplicas escritoras não são prometidas por este plano.

## Contratos HTTP propostos

| Área | Operações |
|---|---|
| Saúde | GET /health |
| Conta | POST /auth/register, POST /auth/login, GET /auth/me |
| Sessões | POST /auth/refresh, POST /auth/logout, POST /auth/logout-all |
| E-mail | POST /auth/email-verification/request, POST /auth/email-verification/confirm |
| Senha | POST /auth/password-reset/request, POST /auth/password-reset/confirm |
| Sistemas | GET /systems |
| Catálogo | GET /catalog/:kind, GET /catalog/:kind/:id, GET /sources |
| Fichas | POST /characters, GET /characters/mine, GET /characters/public, GET /characters/:id, PATCH /characters/:id, DELETE /characters/:id |
| Publicação | POST /characters/:id/publish, POST /characters/:id/unpublish |
| Moderação | POST /admin/characters/:id/hide, POST /admin/characters/:id/unblock-publication |

As rotas desta tabela estão disponíveis no incremento básico; o comportamento e suas limitações estão em estado-backend.md. Escritas usam transação; exclusão de ficha não toca catálogo. Registro de sistemas futuros não habilita um módulo inexistente. GET não realiza confirmações de e-mail, resets ou consumo de tokens.

## Primeiro incremento verificável

API inicial com conexão/migrações, saúde, cadastro/login real e sessão renovável, testada via HTTP contra SQLite temporário. Sem formulário de frontend nem endpoints de jogo em partida. A etapa seguinte acrescenta catálogo e CRUD de ficha. Não implementar os 41 testes Python como se fossem endpoints prontos: são especificações/ensaios a transportar para testes reais do backend.

## Critério de conclusão da v1

Além de CRUD/autenticação e operações reais testadas, explicitar o nível de validação de cada regra e a procedência do conteúdo. A conferência normativa pendente em fechamento-modelagem-v1.md deve ser concluída antes de prometer legalidade completa das fichas. Provedor de e-mail, hospedagem e backups externos devem ser exercitados no ambiente escolhido; um plano ou teste local não comprova implantação.
