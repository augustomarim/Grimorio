# Atualização de dependências de teste

Vitest atualizado de 3.2.7 para 5.1.0, compatível com Node 24. Atualizados package.json e package-lock.json. Não foi usado audit fix --force.

Verificação executada: typecheck, build e 18 testes HTTP passaram. npm audit retornou zero vulnerabilidades conhecidas no momento da consulta. Isso é resultado do audit de dependências, não certificação completa da aplicação.

No Windows, usar Node 24 conforme engines/.nvmrc e npm.cmd caso o PowerShell bloqueie npm.ps1. Depois de substituir os arquivos, executar npm.cmd ci. Não sobrescrever .env nem compartilhar AUTH_KEY.
