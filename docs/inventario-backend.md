# Inventário — incremento do backend

Implementado sobre character_item/lib_item/catalog_entry, sem migração, nova tabela ou dependência. O banco permanece na versão 3, com 49 tabelas e 6 views. Código em src/inventory, dividido em rotas/validação, serviço e repositório SQL.

## Rotas

| Operação | Rota | Sucesso |
|---|---|---|
| Listar | GET /characters/:id/items | 200 |
| Consultar instância | GET /characters/:id/items/:itemInstanceId | 200 |
| Adicionar | POST /characters/:id/items | 201 |
| Alterar | PATCH /characters/:id/items/:itemInstanceId | 200 |
| Remover instância | DELETE /characters/:id/items/:itemInstanceId | 204 |

Escritas seguem autenticação por cookie e Origin do backend existente. Somente o dono altera, mesmo se outro usuário for administrador. Leitura usa a mesma política da ficha: dono e administrador ativo consultam privadas; visitante/outras contas consultam públicas elegíveis. Moderação ou bloqueio da conta retira o acesso público ao inventário também. Notas são parte da ficha e ficam visíveis quando ela é publicada; não há campo de notas privadas separado.

Listagem: page (padrão 1), limit (padrão 20, máximo 100), equipped (true/false opcional), q (busca literal no nome). Totais e ordenação por id da instância. Perfil não D&D não usa essas tabelas: responde 409 para quem possui acesso à ficha, sem fingir inventário universal.

## Entrada e ids

POST recebe itemId (obrigatório, localId do catálogo de itens), quantity (padrão 1), equipped (padrão false), notes (padrão null). Não aceita criação de item personalizado nem ownerId/characterId vindos do corpo.

PATCH aceita somente quantity, equipped e notes, com ao menos um campo. Campos omitidos são preservados; notes=null limpa a observação; equipped=false desequipa. itemId não pode ser trocado por PATCH: outra opção do catálogo exige nova instância. Quantidade deve ser inteiro positivo até Number.MAX_SAFE_INTEGER, para manter representação exata em JavaScript. Notes permite até 10.000 caracteres.

A resposta tem id da instância, characterId, quantity, equipped, notes e item com id local, catalogId, slug, name, kind, rarity, costCp, weight, deprecatedAt e sources. Não confundir id da instância com item.id nem com item.catalogId. Um catalogId vazio de fontes não é presumido livro base.

Duas aquisições do mesmo item geram duas instâncias independentes. Não há empilhamento automático por catálogo. Se unidades precisam de notas ou equipamento diferentes, use linhas separadas. Uma quantidade na mesma linha compartilha o mesmo estado equipado/observações.

## Regras e consistência

Item inexistente/depreciado não pode ser adquirido. Uma instância legada de item depreciado continua consultável, pode ser equipada/desequipada, anotada, reduzida ou removida; aumentar quantidade conta como nova aquisição e é rejeitado. O catálogo nunca é apagado por remover uma instância.

Mutações verificam dono, perfil, catálogo/instância e fazem gravação, atualização da ficha/revisão e auditoria na mesma transação. A consulta de instância sempre inclui character_id e id: um id válido de outra ficha não pode ser usado nem quando a mesma pessoa é dona das duas. Exclusão da ficha remove seus itens em cascata, sem tocar no catálogo.

Auditoria usa inventory.add/update/remove, entidade character_item, id da instância e metadados characterId/itemId/quantity/equipped quando aplicáveis. Não duplica notas no log. Falha em auditoria reverte item e atualização da ficha.

Marcar equipped representa a escolha de uso da instância; não afirma proficiência, sintonia, respeito a todas as restrições de armadura/mãos ou cálculo automático de CA/dano. Isso depende do módulo de regras ainda em evolução. Moedas, compra/venda, bolsas/containers, sintonia e efeitos de combate não foram acrescentados por suposição.

## Execução dos testes

Novos casos HTTP verificam dados reais/estrutura/fontes, instâncias independentes, atualização parcial/null/false, filtros/paginação, quantidades e alvos inválidos, propriedade, público/admin/moderação, ids de outra ficha, depreciação, auditoria/revisão, rollback e cascata. O roteiro HTTP por socket também exercita adicionar/alterar/listar/remover e seus bloqueios usando somente banco temporário.

Os resultados atuais são publicados depois da execução em resultado-verificacao.json. Os testes são executados pelo assistente no ambiente de desenvolvimento, sem pedir ao usuário que confira cada rota no Thunder Client. Arquivos internos de teste não exigem alteração da conta, .env ou banco local do usuário.

Resultado final executado: 35 testes do backend, 76 verificações HTTP reais e 41 testes Python passaram. Typecheck, build, formatação e diff também passaram. Os dados temporários foram removidos; nenhuma conta do usuário foi usada. Esta entrega inclui funcionalidade real de inventário e seus testes, sem exigir que o usuário execute testes manuais.
