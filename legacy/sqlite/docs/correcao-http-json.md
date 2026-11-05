# Correção do tratamento HTTP de entrada

Reproduzido antes da correção: POST /auth/register com Content-Type application/json e corpo vazio ou JSON inválido retornava 500 INTERNAL_ERROR. JSON válido retornava 202. Isso não prova a causa de todo erro 500 observado no PC do usuário.

Corrigido: corpo JSON vazio/malformado retorna 400 INVALID_JSON com orientação; mídia não suportada retorna 415; corpo excessivo retorna 413. Erros inesperados continuam 500, sem expor conteúdo enviado ou detalhes SQL, mas incluem requestId para correlação com logs.

Verificação: typecheck/build e 21 testes HTTP passaram no Node 24. Nenhuma migração, dependência, chave ou banco de dados mudou nesta correção.

Aplicação local: parar o servidor, extrair este patch na raiz do projeto substituindo src/app.ts e test/backend.test.ts e iniciar npm.cmd run dev. Não sobrescrever .env nem compartilhar senha/tokens. No Thunder Client, preencher Body > JSON além dos headers Origin e Content-Type. Se continuar 500 com corpo válido, consultar o log correspondente no terminal, sem compartilhar o corpo de cadastro.
