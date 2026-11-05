> Atualização vigente: capacidades comuns e benefícios de entrada das 12 classes básicas conferidos no PDF oficial fornecido. Ver multiclasse-progressao-srd52.md; limitações de suplementos, subclasses e certificação integral permanecem.

> Estado atual: schema versão 4; módulos de talentos, magias, grimório, escolhas e auditoria implementados. As contagens abaixo são registros históricos de cada incremento. Capacidades individuais de conjuração e limites desta etapa estão em capacidades-classes-backend.md.

# Backend v0.1 — estado da implementação

Implementado em src, com Node.js 24, TypeScript, Fastify 5, better-sqlite3 e Argon2id. O backend usa as migrações existentes, sem novas tabelas: schema versão 3, 49 tabelas e 6 views. A base estrutural e os testes Python continuam no projeto.

## Rotas executáveis

| Área | Implementado |
|---|---|
| Saúde | GET /health |
| Conta | POST /auth/register, POST /auth/login, GET /auth/me |
| Sessões | POST /auth/refresh, POST /auth/logout, POST /auth/logout-all |
| Confirmação de e-mail | POST /auth/email-verification/request, POST /auth/email-verification/confirm |
| Recuperação de senha | POST /auth/password-reset/request, POST /auth/password-reset/confirm |
| Sistemas/fontes | GET /systems, GET /sources |
| Catálogo | GET /catalog/:kind, GET /catalog/:kind/:id |
| Fichas | POST /characters, GET /characters/mine, GET /characters/public, GET /characters/:id, PATCH /characters/:id, DELETE /characters/:id |
| Publicação | POST /characters/:id/publish, POST /characters/:id/unpublish |
| Administração | POST /admin/characters/:id/hide, POST /admin/characters/:id/unblock-publication |

Todas as escritas HTTP exigem Origin igual a APP_ORIGIN. CORS permite somente essa origem com credenciais. Autenticação usa cookies HttpOnly, não tokens em JSON. O refresh é restrito ao caminho /auth para suportar logout. Dados privados/autenticação usam Cache-Control: private, no-store. trustProxy fica desabilitado até escolher uma implantação e proxies confiáveis.

E-mail tem adaptador explícito de arquivo privado no desenvolvimento, desabilitado por padrão; não há provedor de entrega externa. Senhas são derivadas de verdade com Argon2id. Tokens persistidos são hashes. Limitação de login usa buckets em SQLite; proteções globais/de solicitação são por origem de rede na instância atual. Falha de entrega é registrada sem credenciais e não revela existência de conta pela resposta; não há fila durável nem SLA de entrega.

Promoção inicial de administrador é utilitário local auditado (npm run admin:promote), não endpoint público nem senha padrão. É possível promover uma conta ativa existente; o papel é lido do banco em cada requisição, sem precisar de novo token.

## Catálogo

Importador via API pública load de @freshmag/one-dndb 0.5.1 e fake-indexeddb. Não acessa módulos internos nem faz requisições web de conteúdo. A versão é fixada, a carga valida contagens e é transacional. Carrega 1.905 identidades, 4.631 links, 38 definições de armas e suas propriedades. Catálogos são consultados localmente depois da carga.

Upsert mantém ids e referências; ausência na nova carga deprecia. A lista de vínculos de livros é aditiva para preservar curadoria; rótulos ambíguos não são separados automaticamente. Atualização de regras não produz snapshot histórico completo. A importação não cria contas ou personagens de exemplo.

## Ficha básica

Núcleo comum e perfil D&D são criados na mesma transação. Há nome/retrato, seis atributos, espécie, antecedente, alinhamento, classes/subclasses, narrativa e histórico de níveis/PV. A soma das classes é o nível total. As respostas usam localIds do catálogo para escolhas e não aceitam owner_id ou role no corpo.

Valida faixas, duplicidade de classe, exatamente uma inicial, soma até 20, classe da subclasse, nível indicado pelo catálogo para adquiri-la, correspondência do histórico e limite da rolagem ao dado real. Não implementa todos os requisitos normativos de multiclasse. Alterações de classes exigem histórico completo de PV para não descartar rolagens. Sem histórico em fichas de nível maior que 1, PV é null até completar, e não zero apresentado como máximo válido.

Alterações de narrativa e conteúdo atualizam a identidade da ficha e a referência de revisão do último salvamento. Concessões dependentes já presentes podem bloquear mudança de espécie/antecedente/subclasse pelas FKs; o incremento seguinte precisa de conciliação explícita em vez de apagar silenciosamente escolhas.

Dono edita/exclui; visitantes consultam somente públicas elegíveis; administrador consulta e modera, sem poder editar fichas alheias. A exclusão remove os filhos sem afetar o catálogo. A moderação bloqueia republicação até liberação, sem republicar automaticamente.

A API retorna validation.rulesVerified=false. Isso informa o limite real, em vez de apresentar a persistência como atestado completo de D&D.

## Resultados

Testes Node usam Fastify injection, Argon2id real, SQLite em arquivo e a carga real da biblioteca. Cobrem autenticação, replay, validade, recuperação, e-mail, origem/CORS, permissões, CRUD, multiclasse, rollback, depreciação, catálogos e provisionamento local de administrador. Os testes Python mantêm a especificação do schema, operações e protocolos.

Também foi iniciado o JavaScript compilado e executada uma demonstração em socket local: cadastro 202, login 200, confirmação local 204, criação de ficha 201 (nível 1/PV base 8), refresh 200, publicação 204, consulta pública 200, exclusão 204 e logout 204. O resultado sem credenciais está em execucao-backend.json. A ficha temporária foi excluída ao fim da demonstração. A conta de teste e a entrega de e-mail de desenvolvimento ficam somente no banco/pasta local ignorados pelo Git.

## Incrementos ainda necessários

1. Talentos/proficiências, magias, grimório, inventário e escolhas explícitas já possuem endpoints. Permanecem pendentes a conciliação completa e as regras ainda inconclusivas.
2. Mapeamento completo de escolhas, conciliação de dependências, requisitos e cálculo de conjuração; a consulta ao SRD oficial continua com a limitação de rede documentada.
3. Concorrência de edição da mesma ficha (controle de versão/ETag) antes de colaboração real.
4. Provedor de e-mail, recuperação de falhas de entrega e limites adicionais por destino; integração com domínio/HTTPS/proxy e segredos da implantação.
5. Empacotamento, hospedagem, agendamento/armazenamento externo de backups e restauração exercitada com aplicação real.

Este incremento é backend local verificável, não conclusão de toda a v1 nem implantação em produção. Não há frontend nem recursos de partida da v1.5.

## Verificação final deste incremento

18 testes Node e 41 testes Python passaram. npm run typecheck, npm run build, npm run format:check e git diff --check também passaram. O servidor compilado final respondeu HTTP 200 em /health com schemaVersion=3, SQLite 3.53.2 e catalogEntries=1905. Os segredos e o banco local são ignorados pelo Git. Nenhuma migração SQL foi modificada.

## Automação integral de verificação

Comando único: npm.cmd run verify no Windows (npm run verify em outros ambientes). O executor faz tipos, build, 21 testes do backend e o roteiro de 60 verificações HTTP reais, com banco/contas/e-mails/porta temporários. A suíte Python de 41 testes também foi executada separadamente e fica no CI. Nenhuma conta ou banco de desenvolvimento do usuário é usado no roteiro.

Resultado executado nesta etapa: todas as verificações passaram. O relatório atual sem credenciais está em docs/resultado-verificacao.json; execuções locais gravam reports/smoke.json e descartam o relatório anterior antes de iniciar. Arquivo de CI pronto em .github/workflows/verify.yml, ainda sem execução remota confirmada. Detalhes em automacao-testes.md.

## Inventário implementado

Rotas em /characters/:id/items e /characters/:id/items/:itemInstanceId com permissões da ficha, instâncias independentes, filtros, atualização parcial, depreciação, auditoria e cascata. Usa as tabelas existentes; schema e dependências não mudaram. A leitura da ficha e do inventário compartilham a política central de acesso.

Verificação do incremento de inventário: 35 testes Node, 76 verificações HTTP em socket real e 41 testes do modelo passaram. Nenhuma migração ou dependência foi adicionada. Relatório em resultado-inventario.json.
