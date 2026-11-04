# Access e refresh tokens — proposta de dados e protocolo

Adição solicitada: refresh token com rotação, expiração e revogação. Modelo atual: 49 tabelas e 6 views; schema versão 3. A única tabela nova é refresh_token. O fluxo foi exercitado por SQL em testes, sem criar endpoints, backend ou escolher framework.

## Escolha compatível com as sessões existentes

Tokens opacos, gerados por CSPRNG com pelo menos 32 bytes aleatórios. O servidor armazena apenas SHA-256 do token, não o valor entregue ao cliente. Não aplicar hash lento de senha a esses tokens aleatórios; password_hash mantém sua estratégia própria de senha.

A proposta usa access token opaco e verificação da sessão no servidor, sem JWT nesta etapa. Isso aproveita a sessão persistente e permite revogação imediata. Se JWT for necessário futuramente, é outra decisão: expiração, chave, claims e estratégia de revogação precisam de desenho próprio.

- session é a família/dispositivo de login: user_id, limite absoluto expires_at, revogação e metadados.
- session.token_hash passa a significar o hash do access token atual. access_expires_at marca sua validade curta.
- refresh_token guarda cada geração: hash único, session_id, parent_token_id, created_at, expires_at, used_at e revoked_at.
- O par de FKs garante que pai e filho pertençam à mesma sessão. Uma raiz por família, um sucessor por token e um token não consumido/não revogado por família são impostos por índices.

auth_token permanece exclusivo de recuperação de senha e confirmação de e-mail. Não misturar essas credenciais com refresh tokens.

## Prazos propostos

Access: 15 minutos. Família e refresh: limite absoluto de 30 dias desde o login. Rotação não prolonga a vida absoluta da sessão. Esses prazos são defaults da proposta e dos testes, configuráveis no futuro serviço, não constantes ocultas no schema.

O access nunca pode vencer depois da família. O serviço valida todos os horários e usa UTC ISO 8601 canônico com precisão uniforme. O banco valida certas comparações cronológicas como texto; não é um parser universal de datas. O limite do refresh contra expires_at da sessão é validado pelo serviço.

## Protocolo

1. Login: verificar senha e conta ativa (não implementados pelos testes de protocolo), gerar access e refresh independentes e criar sessão + raiz em transação.
2. Pedido autenticado: localizar o access pelo hash, exigir conta ativa, sessão não revogada, access_expires_at e expires_at futuros. O refresh não autoriza operações normais da ficha.
3. Renovação: sob BEGIN IMMEDIATE, localizar o hash do refresh, conferir sessão, conta, prazos e uso. Consumir o token com UPDATE condicional e conferir que uma linha foi alterada. Criar um novo filho e um novo access; atualizar a sessão e confirmar tudo junto.
4. A rotação invalida imediatamente o access anterior nesta proposta. Consumir o pai e falhar ao criar o filho deve reverter a transação inteira.
5. Reutilização de token consumido: revogar a família e seus refresh tokens, confirmar a revogação e rejeitar a renovação. Não desfazer essa revogação ao produzir a resposta de erro. Outras sessões do usuário continuam independentes.
6. Logout: revogar a sessão e seus tokens. Logout de todos os dispositivos/troca de senha deve revogar as famílias do usuário conforme a política de autenticação.
7. Conta bloqueada: nenhuma sessão ou renovação é aceita. O serviço também deve revogar sessões no bloqueio para que desbloquear a conta não reative credenciais antigas.

As gerações consumidas precisam ser retidas enquanto a família puder ser usada, para detectar replay. Limpeza deve remover famílias encerradas segundo a retenção definida, em vez de apagar individualmente pais ainda referenciados. Excluir uma sessão apaga toda a cadeia; foi testado com pai e filho.

## Navegador e concorrência

Entregar credenciais somente por HTTPS, preferencialmente cookies Secure e HttpOnly. Atributos SameSite, domínio e Path serão ajustados aos domínios reais da implantação; propostas iniciais SameSite=Lax e cookie de refresh restrito ao caminho de renovação. Limpar o cookie usando os mesmos atributos de escopo. Não guardar tokens em localStorage nem URLs ou logs.

Renovação/logout devem usar métodos de escrita e proteção CSRF/origem apropriada a cookies. Isso é requisito para o backend, não implementação já entregue.

A política de replay é estrita, sem janela de tolerância. Duas renovações com o mesmo token podem causar revogação da família: o cliente deve coordenar uma única renovação, inclusive entre abas, e não repetir silenciosamente um refresh antigo após resposta perdida. Tolerância/retry exigiria protocolo adicional, não ativado por suposição.

## Migração e restauração

0001_initial.sql foi preservado sem alteração de checksum. 0002_refresh_tokens.sql revoga sessões antigas, adiciona access_expires_at e cria a tabela/índices. Sessões antigas exigem novo login: não existe refresh seguro para inventar a partir do hash antigo.

schema.sql é o snapshot equivalente a aplicar 0001, 0002 e 0003, com histórico e user_version=3. Não executar os dois caminhos no mesmo banco. A fixture inclui uma família já expirada/revogada e seus hashes demonstrativos; não são credenciais de teste utilizáveis em aplicação.

Backups incluem as cadeias e seu histórico. Na restauração de produção, validar a cópia e depois revogar sessões e tokens antes de reabrir autenticação, para não reativar uma geração consumida depois do backup. A automatização de restauração com aplicação real permanece pendente.

## Validação executada

Testes com relógio simulado: login de protocolo, rotação, hashes sem valores brutos persistidos, invalidação do access anterior, expiração de access e refresh, limite absoluto da família, token desconhecido, bloqueio de conta, logout, replay em outra conexão com revogação confirmada e isolada, falha transacional, parentesco entre famílias, raiz/sucessor únicos, autoparentesco e migração de sessão legada. A migração numerada e o snapshot continuam equivalentes; backup/restauração preservam inclusive os registros de autenticação.

O código em tests/refresh_support.py é suporte de teste para SQL e NÃO valida senhas, emite cookies, atende HTTP ou implementa autenticação de produção. As respostas, rate limiting, CSRF, auditoria, segredo de senha e envio de e-mail ainda fazem parte da futura implementação.

## Políticas de conta

Confirmação de e-mail é exigida para publicar, não para uso privado. Recuperação de senha revoga todas as famílias, sem promover papel ou confirmar e-mail. Tokens auth_token são vinculados ao e-mail e revogáveis desde a migração 0003. Limites temporários e moderação estão em contas-permissoes.md.
