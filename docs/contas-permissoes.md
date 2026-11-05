> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Contas, permissões e publicação — v1

Regras aprovadas pelo usuário. Estado atual: 49 tabelas, 6 views e schema versão 3. A única tabela adicionada nesta etapa é login_throttle; moderação e vínculo dos tokens ampliam estruturas existentes. A fase de modelagem não implementava endpoints. O backend v0.1 agora inclui autenticação HTTP e Argon2id real; entrega externa de e-mail ainda não existe. Consulte estado-backend.md.

## Matriz de acesso

| Ação | Visitante | Dono ativo | Outro usuário ativo | Administrador ativo |
|---|---|---|---|---|
| Consultar ficha pública elegível | Sim | Sim | Sim | Sim |
| Consultar ficha privada | Não | Sim | Não | Sim |
| Criar ficha privada | Não | Sim, mesmo sem e-mail confirmado | Sim, sob sua própria propriedade | Sim, sob sua própria propriedade |
| Editar/excluir ficha | Não | Sim | Não | Somente se for dono |
| Publicar ficha | Não | Se e-mail confirmado e publicação não bloqueada | Não | Somente suas próprias fichas, sob as mesmas condições |
| Ocultar/bloquear publicação | Não | Pode retirar sua ficha de publicação, sem poder remover bloqueio administrativo | Não | Sim |
| Remover bloqueio administrativo | Não | Não | Não | Sim; ficha continua privada até republicação do dono |

Administrador não recebe permissão implícita para alterar atributos ou apagar fichas de outros usuários. Política deriva do papel persistido em app_user e da identidade autenticada no servidor, nunca de user_id/role enviados pelo navegador.

Uma ficha pública elegível exige is_public=1, publication_blocked_at NULL, dono ativo e email_verified_at preenchido. O filtro é aplicado em toda consulta pública, não só na galeria. Conta inativa não autentica; o administrador pode consultar suas fichas para moderação. Um usuário inativo não é tratado silenciosamente como autenticado com permissões antigas.

Recursos privados/inexistentes devem usar resposta uniforme para quem não pode consultá-los, evitando revelar sua existência. A escolha final de códigos HTTP fica no contrato da API. Consultas por id não podem ignorar autorização.

## E-mail

Cadastro cria conta não confirmada. O usuário ativo pode criar/editar fichas privadas antes de confirmar. Confirmar e-mail não altera papel nem publica automaticamente fichas.

Token de confirmação: aleatório com alta entropia, apenas hash no banco, finalidade email_verification, validade proposta de 24 horas e uso único. issued_email_hash vincula o token ao e-mail normalizado da emissão. E-mail alterado invalida o token antigo por divergência do vínculo. Reenvio revoga a geração anterior da mesma finalidade.

Normalização proposta: trim + casefold no serviço, consistentemente no cadastro, consulta e vínculo. O COLLATE NOCASE do SQLite cobre apenas a parte ASCII; endereços internacionais e regras de equivalência precisam de política explícita antes de suporte completo. Não aplicar heurísticas específicas de provedores (remover pontos ou sufixos) por suposição.

Mudança de e-mail deve retirar a confirmação e a publicação, revogar tokens antigos e iniciar nova confirmação em transação. O endpoint de alteração de e-mail ainda não foi desenhado. Consultas públicas também exigem confirmação atual, evitando exposição por um flag is_public antigo.

## Recuperação de senha

Solicitação tem a mesma resposta genérica para endereço conhecido, desconhecido ou conta inelegível. Token de propósito password_reset, 30 minutos propostos, hash aleatório, vínculo ao e-mail e uso único. Nova solicitação revoga as anteriores. Token de confirmação não pode ser usado como reset nem vice-versa.

Consumo ocorre em transação: conferir token, conta ativa, propósito, prazo, uso, revogação e vínculo; marcar como usado; gravar o novo hash de senha; revogar todas as sessões e refresh tokens do usuário e os demais resets pendentes. Falha em qualquer gravação reverte tudo, inclusive consumo e revogações.

A recuperação não desbloqueia conta administrativa, não confirma e-mail, não promove papel e não cria sessão automaticamente. Novo login é exigido. A implementação futura deve derivar e validar hash de senha com algoritmo e parâmetros próprios (proposta Argon2id); os testes usam somente marcadores inválidos de desenvolvimento e não comprovam essa parte.

Os tokens e a senha nunca entram em logs ou respostas de solicitação. A entrega privada é por e-mail no backend futuro. Ainda não há provedor configurado, modelo de e-mail, fila/outbox ou confirmação de entrega.

## Limite de tentativas

login_throttle registra buckets temporários de scope=email e scope=network, inclusive para endereços sem conta. Sem FK para app_user para não excluir o caso desconhecido. key_hash é um HMAC de escopo + identificador normalizado, usando segredo da aplicação, evitando persistir e-mail/IP brutos nos buckets. Os testes usam segredo efêmero; nenhum segredo de produção foi criado ou solicitado.

Defaults da proposta: 5 falhas por e-mail em janela de 15 minutos; 50 por origem de rede em 15 minutos; bloqueio de 15 minutos ao atingir o limite. Novas tentativas durante o bloqueio não prolongam indefinidamente o prazo no protocolo testado. Após expirar, o login pode ser tentado novamente. Bloqueio temporário não altera is_active.

Contagem e bloqueio usam transação/UPSERT. Login bem-sucedido limpa o bucket de e-mail, mas não o da origem compartilhada. Limiares são configuráveis e precisam ser ajustados a NAT/redes compartilhadas. IP/origem deve vir da conexão e de proxies explicitamente confiáveis, nunca de um header arbitrário aceito do cliente.

Mensagem de falha não revela existência da conta. O backend também deverá executar comparação fictícia de hash para usuários desconhecidos e tratar duração/respostas, limites distribuídos, abuso de solicitação de e-mail e automação. Os testes de SQL não comprovam resistência a enumeração por tempo nem proteção HTTP já implantada.

expires_at permite limpeza dos buckets após 24 horas de inatividade, como proposta inicial. Limpeza, agendamento e métricas não estão instalados. SQLite serve à v1 de uma instância; múltiplas instâncias deverão compartilhar um mecanismo consistente de limitação, a definir com a hospedagem.

## Moderação e auditoria

Ocultar administrativamente seta is_public=0 e publication_blocked_at. A presença do bloqueio impede o dono de republicar até liberação por administrador; editar o conteúdo privado continua permitido. Desbloquear não publica automaticamente. O autor, ação, entidade e horário ficam em audit_log; justificativa de moderação pode ser registrada em details, sem tokens ou dados de senha.

Publicação/moderação são verificadas em transação e auditadas no protocolo de teste. Os campos não substituem autorização do serviço: escrita SQL arbitrária não representa um pedido de usuário autorizado. Outras ações sensíveis também precisarão de auditoria no backend.

## Migração

0003_account_policies.sql preserva os arquivos 0001 e 0002, retira de publicação fichas de donos inativos/não confirmados, adiciona publication_blocked_at e login_throttle. As fichas e seus dados são preservados.

Tokens auth_token legados são removidos porque não possuem vínculo seguro ao e-mail de emissão. É necessário pedir novos links de confirmação/recuperação; sessões e refresh tokens não são revogados por essa migração. issued_email_hash passa a ser obrigatório por CHECK para novas linhas, e uma única geração não usada/não revogada por usuário e propósito é imposta por índice parcial.

O snapshot é equivalente a 0001+0002+0003, com user_version=3. A fixture tem dono confirmado e um token de confirmação expirado/consumido, sem credenciais utilizáveis. Não implementar migração de senha ou de confirmação inventando dados de verificação.

## Validação executada e limites

38 testes passaram: 14 de modelo, 8 operacionais, 7 de refresh e 9 de políticas de conta. A etapa nova verificou matriz de acesso, conta bloqueada, criação/edição antes de confirmar, publicação após confirmação, consumo único, moderação/liberação/republicação, revogação de todas as sessões no reset preservando outras contas, expiração/finalidade/vínculo/reenvio e rollback em falha.

Também verificou respostas genéricas por entradas conhecidas/desconhecidas, bloqueio temporário por e-mail, bloqueio por rede usando contas desconhecidas, permanência de is_active e migração de dados legados. Esses ensaios usam protocolos de teste em tests/account_support.py e não endpoints de produção. As consultas em validacao-contas.sql foram executadas sobre a fixture. Backup/restauração continuam comparando todos os dados.

Faltam implementação de autenticação real, comparação de senha, autorização em cada endpoint, CSRF/cookies, e-mail, rate limiting HTTP e operacionalização. Conferência normativa de D&D e aprovação final do modelo também permanecem pendentes.

> Implementação posterior: README.md e estado-backend.md são a referência do backend executável. O histórico de testes/propostas acima descreve a fase em que este contrato foi definido. O schema permanece versão 3.
