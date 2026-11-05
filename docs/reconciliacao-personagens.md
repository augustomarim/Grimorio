> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Trocas de origem com prévia e confirmação

## Objetivo

Permitir editar espécie, antecedente, classes e subclasses sem bloquear toda troca por FK nem apagar dependências silenciosamente. Não altera schema, DBML, migrações ou dependências. As FKs continuam ativas.

## Fluxo HTTP

1. POST /characters/:id/changes/preview com o mesmo corpo de alteração aceito pelo PATCH, sem confirmationToken.
2. Ler requiresConfirmation, removals, progressionReplacement e policy.
3. Se houver dependências a remover, enviar PATCH /characters/:id com exatamente a mesma alteração, acrescentando confirmationToken retornado pela prévia.

Exemplo de prévia (ids ilustrativos):

```json
{ "speciesId": 2 }
```

Exemplo de confirmação:

```json
{ "speciesId": 2, "confirmationToken": "<64 caracteres hexadecimais retornados pela prévia>" }
```

O token acima é ilustrativo, não um valor válido. Precisa ser copiado da resposta real. Se não houver dependências excluídas, o PATCH continua aceitando a alteração diretamente; a prévia é opcional. Retirar uma classe sem conteúdo dependente não exige confirmação adicional. O corpo classes representa a composição completa pretendida, preservando o contrato existente de histórico de PV.

## Resposta da prévia

- confirmationToken: hash da alteração e do estado lido da ficha, dependências e histórico de revisões do catálogo.
- requiresConfirmation: true se alguma linha dependente será excluída.
- removals: tabela, ids e contagem dos registros realmente removidos, incluindo cascatas transitivas.
- progressionReplacement: contagem anterior e nova do histórico quando há substituição da composição de classes. Recriar as linhas do histórico enviado não é contado sozinho como exclusão de benefícios.
- policy: regra de reconciliação e aviso sobre redução de níveis.

O token não substitui sessão, permissão, Origin ou validação do corpo. Não é um refresh token e não vai para a tabela de sessões. Não tem expiração temporal própria: deixa de ser válido se mudar o estado considerado ou o corpo da alteração.

## Como a prévia é calculada

O serviço simula a limpeza de origens e a edição pelo fluxo real em transação/savepoint e reverte integralmente a simulação. Compara os registros antes/depois, inclusive dependências em cascata de talentos. Não grava a prévia, não deixa auditoria temporária, não muda updated_at nem consome ids. Campos textuais entram no hash para detectar alterações concorrentes, mas não são expostos pela prévia.

Na confirmação, o serviço adquire BEGIN IMMEDIATE, recalcula a prévia no estado atual e compara o token antes de persistir. A limpeza, alteração, updated_at, revisão e auditoria são atômicos. Falha em qualquer etapa reverte tudo.

## Regras de reconciliação

- Espécie/antecedente: exclui concessões e magias vinculadas à origem antiga antes de alterar o perfil. Talentos derivados e benefícios concedidos por eles seguem as cascatas do banco.
- Subclasse: exclui somente concessões e magias da subclasse da instância alterada. Benefícios da classe e seu grimório ficam preservados se o nível não foi reduzido.
- Classe removida: suas FKs excluem concessões, magias, grimório, histórico e demais dependências registradas.
- Classe inicial alterada: reinicia concessões de traços iniciais/entrada vinculadas às instâncias cujo papel mudou. Magias da classe permanecem quando o nível não foi reduzido.
- Redução de nível de classe: reinicia concessões, magias e grimório daquela classe. É uma política conservadora explícita, não uma regra de D&D: o modelo ainda não informa o nível de aquisição de todos os registros, portanto alguns registros que continuariam elegíveis também podem ser removidos. A prévia mostra seus ids antes de confirmar; podem ser registrados novamente após revisar a ficha.
- Nível total reduzido: reinicia concessões com acquired_at_level acima do novo total, inclusive de outras origens.
- Catálogos, narrativa, retrato, inventário e origens independentes ficam preservados. Bônus que tenham FK específica à classe removida seguem essa FK e aparecem na prévia.

## Erros e permissões

- 409 DEPENDENCIES_REQUIRE_CONFIRMATION: há remoções e faltou confirmação; gere a prévia.
- 409 CHANGE_PREVIEW_STALE: token não corresponde à ficha e alteração atuais; gere nova prévia e revise novamente.
- Alterações inválidas continuam retornando 400 e não persistem nem durante a prévia.
- Só o dono pode simular e aplicar. Administrador não edita ficha alheia. Visitantes não recebem ids de dependências privadas.

## Limites

Não há certificação integral das regras de D&D, undo ou restauração automática de conteúdo removido após confirmação. Não se infere a origem de conteúdo sem vínculo estrutural: character_fighting_style possui source genérico, sem id da classe de origem; esses estilos precisam de revisão manual. A mesma limitação vale para equipamento recebido de uma origem e já registrado como item independente, e para referências narrativas em texto. Reordenar histórico de níveis sem redução não reconstrói toda a elegibilidade histórica de benefícios. As confirmações protegem alterações estruturais, não implementam controle de concorrência geral para todos os endpoints.

## Verificação

Testes executam simulação repetível sem persistência, confirmação e recusa sem token, token desatualizado, troca de corpo, permissões, rollback de auditoria, cascata espécie → talento → perícia, retirada de antecedente, troca de subclasse, redução de nível, troca de classe inicial e remoção de classe com preservação de magias da outra classe. Asserções incluem integridade de FKs. Nenhum banco ou conta local do usuário é usado: as suítes criam fixtures temporárias.

## Extensão para opções com magias

A confirmação agora também atende DELETE de opção com magias vinculadas. A prévia fica em POST /characters/:id/choices/:instanceId/removal-preview e o DELETE recebe confirmationToken na query. A confirmação é específica à opção, e a exclusão da opção sozinha não exige confirmação extra. Ver magias-escolhas-aninhadas.md.

## Exclusão de talentos e outros benefícios

POST /characters/:id/benefits/:kind/:instanceId/removal-preview permite revisar as cascatas antes do DELETE. Talentos com magias ou outros filhos exigem confirmationToken na query; as outras instâncias e catálogos são preservados. Ver motor-efeitos-magias.md.
