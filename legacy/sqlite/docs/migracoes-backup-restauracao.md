> Preparação de produção vigente: SMTP com TLS, proxy explícito, Docker/Compose, volume SQLite persistente e CLI de backup/restauração. Consulte [hospedagem do backend](hospedagem-backend.md). Não publicado; DNS/HTTPS do domínio e entrega SMTP real ainda dependem da homologação. Schema permanece 6. As descrições anteriores de produção futura abaixo são históricas.

# Migrações, backup e restauração

Escopo desta etapa: contrato operacional e validação real em SQLite local. Sem alterar regras de D&D, criar backend ou implantar rotinas externas. O modelo passa a **49 tabelas e 6 views**: schema_migration é o histórico técnico e refresh_token foi acrescentada pela etapa posterior de autenticação.

## Versão do schema

Arquivos numerados em migrations, 0001_initial.sql (baseline) e 0002_refresh_tokens.sql (renovação de autenticação) e 0003_account_policies.sql (políticas de conta). schema_migration guarda versão, nome, checksum SHA-256 e applied_at UTC. PRAGMA user_version espelha a última versão confirmada. Não confundir essa versão com ruleset_revision (revisão do conteúdo de D&D), a versão do pacote npm, a edição do RPG ou as versões de produto v1/v1.5.

snapshot schema.sql instala a mesma baseline em banco novo e registra os checksums das três migrações e user_version=3. O SHA-256 do arquivo é calculado sobre seus bytes exatos; padronizar arquivos UTF-8 e LF no repositório. Não alterar migração já aplicada. A estratégia foi testada, mas não existe migrador de produção instalado: o executor atual é suporte de testes, com contrato em migrations/README.md.

Mudanças anteriores da modelagem não viraram uma sequência fictícia de migrações de produção. O projeto não tinha uma versão de banco publicada. Bancos de desenvolvimento anteriores sem histórico exigem conciliação, exportação/transformação e validação antes de adoção, nunca marcação artificial como versão 1.

## Conexões

Toda conexão da aplicação deve habilitar foreign_keys. WAL é configurado no arquivo antes de iniciar transações. Recomenda-se timeout de bloqueio e synchronous=FULL para durabilidade; medir custos quando a hospedagem estiver definida. O modo WAL não dispensa backup nem torna seguro copiar somente o arquivo principal com conexões ativas.

Migrações devem ocorrer com escrita da aplicação pausada, uma conexão de manutenção e backup confirmado. BEGIN IMMEDIATE protege a execução e o histórico; arquivos não podem conter COMMIT, BEGIN, PRAGMAs de configuração, VACUUM ou gerenciamento de bancos anexos. São executados por instrução, sem commit implícito. Detalhes e restrições estão no README de migrações.

## Backup consistente

Método escolhido: API online de backup do SQLite. A demonstração usa sqlite3.Connection.backup do Python, sem ferramenta externa. Para o backend futuro, escolher uma implementação oficialmente suportada pelo driver adotado; não supor nomes de métodos de bibliotecas ainda não escolhidas.

Procedimento:

1. Criar destino novo em diretório protegido, com nome temporário e único. Recusar sobrescrita. A base pode estar em WAL com dados confirmados no log; não executar checkpoint destrutivo nem remover arquivos WAL/SHM para produzir o backup.
2. Abrir origem existente em leitura e copiar pela API de backup para o destino temporário. Somente alterações confirmadas são copiadas; uma escrita não confirmada em outra conexão não deve ser incluída.
3. Fechar o destino e validá-lo independentemente: integrity_check, foreign_key_check, user_version, histórico/checksums e completude de catálogo e perfis.
4. Somente depois publicar o arquivo final. A demonstração renomeia dentro do mesmo diretório/sistema de arquivos; envio a object storage e sua publicação/atomicidade exigem implementação própria.
5. Para operação real, produzir manifesto externo com horário UTC, versão do schema, checksum SHA-256 do arquivo final, tamanho e identificador da execução; armazenar com a cópia. Permissões, criptografia e credenciais de armazenamento serão definidas na hospedagem. Esse manifesto e o envio externo ainda não foram implementados.

O artefato de backup validado é independente dos WAL/SHM da origem. Não copiar a pasta ativa com arquivos possivelmente de instantes diferentes. VACUUM INTO continua alternativa possível, mas não foi o método executado nesta entrega.

## Retenção proposta

Como ponto inicial para revisão: backup diário com 7 diários, 4 semanais e 3 mensais, além de uma cópia antes de migrações/importações significativas. Manter pelo menos uma cópia fora do disco/servidor do aplicativo. Não remover cópias anteriores antes de confirmar o novo backup. A política ainda deve ser ajustada ao volume e à tolerância de perda do usuário.

Um backup diário pode perder até um intervalo entre execuções bem-sucedidas; não foi acordado SLA de perda ou tempo de recuperação. Não há agendamento, armazenamento externo, alerta de falha ou retenção automatizados nesta máquina.

## Restauração

1. Selecionar backup e manifesto compatíveis com a versão da aplicação; conferir tamanho/checksum externo quando o manifesto existir. Preservar a base atual e seus arquivos associados antes de qualquer troca.
2. Restaurar primeiro para caminho novo, separado da base ativa, usando a API de backup ou cópia de um artefato já fechado e completo. Nunca substituir um banco aberto.
3. Validar integridade, FKs, versão e histórico; rejeitar backups truncados, versões desconhecidas, checksums de migração divergentes e referências quebradas. Conferir completude de catálogo/perfis e consultas representativas.
4. Reabrir a cópia com foreign_keys=ON e WAL, e conferir fichas, níveis, PV e registros de autenticação. Se precisar de migrações posteriores, executar em cópia de recuperação com backup prévio e validar novamente.
5. Para troca em produção, parar todos os processos que usam a base, fechar conexões, preservar o conjunto ativo para retorno e publicar a cópia validada sem reaproveitar WAL/SHM antigos. Religar a aplicação e validar comportamento antes de reabrir escrita.
6. Revogar sessões e tokens restaurados antes de reabrir autenticação em produção, para não reativar gerações de refresh já consumidas após o backup. A cópia inicial restaurada deve ser validada sem alterações; os testes desta entrega comparam os dados integralmente.

A restauração volta ao instante do snapshot. Escritas posteriores não são recuperadas por este procedimento. Recuperação ponto a ponto, replicação, alta disponibilidade e armazenamento de retratos fora do SQLite exigem estratégia adicional; o backup do banco não inclui arquivos de imagem externos.

## Validação executada

SQLite 3.53.1. Testes em arquivos temporários, sem tocar em base de produção:

- Baseline numerada e snapshot criam o mesmo schema. Os mesmos exemplos são carregados em ambos; todas as linhas são comparadas, desconsiderando apenas o horário independente de aplicação da baseline.
- Migração de teste bem-sucedida preserva dados e avança histórico/user_version. Reexecução não reaplica.
- Migração com erro reverte DDL, dados e histórico; um COMMIT dentro do arquivo é rejeitado. Arquivo aplicado modificado, lacuna na sequência e banco não gerenciado são rejeitados.
- Backup com WAL não vazio inclui alteração confirmada e exclui uma alteração não confirmada mantida por outra conexão.
- Restauração compara schema, todas as linhas de todas as tabelas, histórico, user_version e sqlite_sequence. A base de origem continua evoluindo, sem alterar o backup já salvo.
- Níveis restaurados: Ari 10, Bela 1. PV base: 66 e 9. foreign_key_check e integrity_check limpos; WAL e FKs habilitados na cópia reaberta.
- Backup truncado é rejeitado. Cópia fisicamente íntegra mas com FKs quebradas também é rejeitada e não é publicada pelo suporte de testes.

Executar na raiz: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v`. A suíte atual tem 38 testes: 14 do modelo, 8 operacionais, 7 de refresh e 9 de políticas de conta. Em tests/db_support.py está o suporte reproduzível; não é um utilitário de produção, nem prova de restauração em uma hospedagem remota.

## Ainda pendente

Escolha da hospedagem/driver, armazenamento externo, manifesto/checksum do backup, agendamento, alertas, credenciais, criptografia, retenção automática e ensaio de troca da base com a aplicação real. A API de backup e a restauração local foram executadas; esses componentes externos não foram implantados. Backup/restauração não substitui a conferência normativa de D&D nem a aprovação final da modelagem.

## Atualização de autenticação

A migração 0002 mantém o checksum da baseline e exige novo login nas sessões legadas. Os ensaios de backup/restauração agora também comparam as cadeias expiradas/revogadas de refresh presentes na fixture. Testes sintéticos de migração posterior usam versão 0004 em diretório temporário.

A migração 0003 retira publicações de contas não confirmadas/inativas e invalida links legados sem vínculo de e-mail. Snapshot e migrações continuam equivalentes; o teste de recuperação agora inclui tokens de confirmação e o bucket temporário da fixture. O esquema está na versão 3.

> Implementação posterior: README.md e estado-backend.md são a referência do backend executável. O histórico de testes/propostas acima descreve a fase em que este contrato foi definido. O schema permanece versão 3.
