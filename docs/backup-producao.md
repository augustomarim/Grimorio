# Backup de produção e recuperação

O backup usa pg_dump 17 no formato custom. Na produção, preferir a conexão direta do Neon. A imagem Docker inclui pg_dump e pg_restore. Não existe endpoint HTTP para baixar banco ou executar recuperação.

## Exportação criptografada

Criar uma chave separada de AUTH_KEY:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guardar essa chave em cofre/gerenciador de senhas e configurar BACKUP_ENCRYPTION_KEY no ambiente da operação. Não enviar chave nem dump ao Git ou ao chat. A chave é necessária para recuperação; um secret do GitHub não substitui uma cópia recuperável no cofre.

```powershell
npm.cmd run db:backup-encrypted -- ./backups/grimorio-AAAA-MM-DD.dump.enc
```

A chave tem 64 caracteres hexadecimais (32 bytes). Usa AES-256-GCM com IV aleatório, cabeçalho autenticado e tag de integridade. O arquivo final tem SHA-256/tamanho no resultado JSON. O dump não criptografado existe apenas em diretório temporário privado durante a exportação e é removido ao terminar, inclusive em erro. Nenhum destino existente é sobrescrito.

## Rotina opcional no GitHub

O arquivo .github/workflows/backup-neon.yml está pronto, mas o job fica desativado por padrão. Para ativar no repositório:

1. Adicionar secret NEON_BACKUP_DATABASE_URL com a conexão direta do banco a copiar.
2. Adicionar secret BACKUP_ENCRYPTION_KEY com a chave guardada no cofre.
3. Criar variável de repositório ENABLE_BACKUPS com o valor true.
4. Executar manualmente o workflow primeiro e conferir o artifact. Depois o agendamento é diário às 06:00 UTC, 03:00 em São Paulo.

O job constrói a imagem, exporta dentro de um container temporário e publica somente .dump.enc e manifesto, com retenção de 30 dias. A chave e a URL ficam em ambiente privado temporário, não nos argumentos do pg_dump nem no artifact. Conferir cotas de armazenamento/minutos do GitHub e reduzir retenção se necessário. Falhas aparecem na execução do workflow; conferir notificações de Actions. Com rotina diária, considerar a perda de escritas posteriores ao último backup, potencialmente até 24 horas. Recursos de recuperação do próprio Neon dependem do plano e não foram presumidos como ilimitados.

A rotina não foi ativada nem executada no seu GitHub durante esta entrega. Antes de usá-la com dados reais, executar e recuperar um backup de homologação. A implementação foi testada localmente com exportação criptografada e restauração real em outro PostgreSQL.

## Recuperar

Baixar o artifact criptografado, manter uma cópia intacta e configurar a mesma BACKUP_ENCRYPTION_KEY:

```powershell
npm.cmd run db:decrypt-backup -- ./backup.dump.enc ./restaurado.dump
npm.cmd run db:verify-backup -- ./restaurado.dump
```

A descriptografia recusa chave errada/adulteração antes de publicar o arquivo de saída. pg_restore --list só verifica o catálogo do archive; a recuperação completa é a prova seguinte.

Configurar RESTORE_DATABASE_URL para **outro banco vazio**, nunca para a produção em uso:

```powershell
npm.cmd run db:restore -- ./restaurado.dump
```

Essas operações de pg_dump/restore requerem utilitários PostgreSQL 17 no PATH ou a imagem Docker. Não são necessários no PC dos usuários do site.

O restore recusa tabelas, sequências ou views de usuário em qualquer schema do destino e usa uma transação para restaurar o archive. Não usa --clean e não troca automaticamente a conexão da API. Depois confere histórico/checksum e FKs. Se a conferência posterior falhar, o destino restaurado permanece isolado e não deve ser adotado; a CLI informa explicitamente esse estado.

Na recuperação bem-sucedida, sessões, refresh tokens e tokens de conta pendentes são revogados no destino para não ressuscitar credenciais anteriormente invalidadas. Usuários precisarão entrar novamente. O histórico de auditoria ganha operations.restore. Conferir contas, personagens, níveis, equipamentos e /health antes de promover o destino. Remover cópias em claro quando não forem mais necessárias.

AUTH_KEY protege os identificadores dos limites de login; não é uma chave JWT. Sua troca não substitui revogação de sessões. A recuperação implementada revoga explicitamente as credenciais restauradas.
