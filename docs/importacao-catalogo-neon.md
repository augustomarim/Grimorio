# Correção da importação do catálogo no Neon

O importador anterior enviava milhares de consultas sequenciais e não mostrava progresso. Pela rede, isso podia levar muitos minutos. Como a carga é transacional, outras conexões — incluindo o painel Neon — só veem os dados após o COMMIT. Tabelas lib_* vazias durante a execução não demonstram que nenhuma gravação esteja em andamento.

A correção agrupa até 100 registros de catálogo/detalhes e 250 links por comando. IDs de relações são resolvidos em memória a partir dos RETURNINGs, sem SELECT por registro. Mantém upsert por tipo/slug, fontes bibliográficas, depreciação e as FKs. Nada é confirmado parcialmente; uma falha reverte os lotes.

## Aplicar

1. Parar importações anteriores e o servidor de desenvolvimento com Ctrl+C; responder S se o Windows perguntar sobre finalizar o arquivo em lotes.
2. Extrair o ZIP de correção na raiz do Grimorio, substituindo os arquivos.
3. Executar `npm.cmd run catalog:import`.

Não há nova dependência ou migração nesta correção. Não é necessário apagar tabelas, recriar o projeto Neon ou alterar seu .env. A conexão direta é preferida quando DIRECT_DATABASE_URL está preenchida. Não enviar essa URL ao chat ou ao Git.

Exemplo de saída (contagens reais do pacote):

```text
[catálogo] Conectando e preparando schema
[catálogo] Lendo pacote local de regras
[catálogo] Carregando spell: 100/444
[catálogo] Carregando spell: 444/444
...
[catálogo] Carregando referências: 4631/4631
[catálogo] Importação confirmada: 1905/1905
```

O JSON final continua mostrando total=1905 e links=4631. Mensagens de progresso são emitidas por lote; uma mensagem periódica a cada 10 segundos informa a etapa durante uma espera. Os números de lote representam trabalho dentro da transação, não dados já publicados no banco.

Espera por lock: 15 segundos. Consulta no servidor: 60 segundos. Ausência de resposta no cliente: 70 segundos. Erros são apresentados com etapa/código sem URL ou senha. Uma falha antes de obter o lock também executa rollback, evitando devolver transação abortada ao pool; uma conexão sem resposta é descartada. Se uma tentativa anterior continuar ativa no Neon, o erro de bloqueio agora aparece em vez de esperar indefinidamente. Reimportar preserva IDs e não duplica registros.

## Verificação executada

65 testes passaram em PostgreSQL 17 local, incluindo menos de 250 consultas para uma carga completa com latência artificial por consulta, progresso, reimportação sem mudar IDs, depreciação, rollback após falha no meio dos lotes, timeout real de lock e descarte de conexão após timeout de leitura. O próprio comando catalog:import foi executado com progresso e confirmação de 1.905 entradas/4.631 links. Typecheck, build e formatação passaram.

Não houve conexão ao projeto Neon do usuário; o tempo real depende da rede e do servidor. Esta correção resolve o gargalo identificado no código e torna as demais esperas diagnosticáveis, sem afirmar qual delas ocorreu no projeto remoto.
