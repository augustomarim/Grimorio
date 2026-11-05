# Migrações e recuperação — PostgreSQL

A cadeia atual começa em migrations/0001_postgresql.sql. Esta é baseline PostgreSQL v1, independente de SQLite v6. schema.sql instala um banco novo e registra o mesmo checksum. Migrações são aplicadas em transação e protegidas por advisory lock; mudanças de checksum ou sequência incompatível são recusadas. O arquivo SQLite original está arquivado, não deve ser executado no Neon.

`npm.cmd run db:migrate` usa DIRECT_DATABASE_URL quando preenchida, senão DATABASE_URL. Não aplicar DDL antigo manualmente no projeto Neon. Fazer backup antes de alterações e conferir a versão da aplicação.

## Backup

A API não usa mais cópia de arquivo .db/WAL. O formato é um archive PostgreSQL custom, produzido por pg_dump 17. A imagem Docker inclui pg_dump/pg_restore; para executar os comandos no Windows fora do container, esses utilitários precisam estar instalados e no PATH. Conectar ao Neon para usar a API não exige essa instalação; isso é apenas para operação manual de backup.

```powershell
npm.cmd run db:backup -- ./backups/grimorio-AAAA-MM-DD.dump
npm.cmd run db:verify-backup -- ./backups/grimorio-AAAA-MM-DD.dump
```

A URL direta é lida do ambiente, não aparece nos argumentos do pg_dump. O arquivo de destino deve ser novo. É criado em diretório temporário privado, conferido com pg_restore --list e publicado sem sobrescrever arquivo existente. A conferência do catálogo do archive **não prova** a recuperação completa: o teste de restauração é separado.

## Restauração

Configurar RESTORE_DATABASE_URL em seu ambiente para um banco PostgreSQL separado e vazio. Nunca apontar essa variável para a produção em uso. Então executar:

```powershell
npm.cmd run db:restore -- ./backups/grimorio-AAAA-MM-DD.dump
```

A ferramenta recusa destino com tabelas em public e usa pg_restore com --single-transaction e --exit-on-error, sem --clean. Uma falha reverte a restauração. Não substitui um banco existente e não promove automaticamente o destino a principal. Conferir histórico, contagens, contas, personagens e saúde antes de alterar a conexão da API. Senhas de conexão ficam em variáveis do processo filho, sem URLs no log.

Guardar arquivos fora do servidor da API, em armazenamento privado com criptografia, retenção e permissões adequadas. Agendamento, envio externo e monitoramento não estão instalados automaticamente. Recursos de recuperação/branches do Neon dependem do plano; conferir o painel e não assumir retenção ilimitada no plano gratuito. Manter AUTH_KEY separada em cofre; trocar a chave invalida sessões.
