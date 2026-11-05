> Atualização vigente — efeitos estruturados: schema 6, base e bônus separados, projeção dos 13 campos de Feat.effects, escolhas estritas e pré-requisitos sem autovalidação por bônus. Consulte [efeitos-regras-consolidados.md](efeitos-regras-consolidados.md). Os incrementos descritos abaixo são históricos; texto de combate e condições de mesa não são executados automaticamente.

# Auditoria de regras do catálogo

GET `/characters/:id/validation` inspeciona a ficha salva, sem alterar seus dados. Usa o catálogo local SQLite, sem Dexie ou chamadas externas em tempo de execução. A leitura ocorre em uma transação para produzir um retrato consistente. As permissões são as mesmas da ficha: dono, administrador ou público elegível.

## Resultado

- `rulesVerified`: permanece false. O endpoint não certifica integralmente D&D 2024.
- `basis`: versão da biblioteca, revisão atual do catálogo, revisão do último salvamento e escopo current-state.
- `summary`: quantidade de verificações pass, fail e unknown.
- `findings`: código, estado, mensagem, id da entidade quando pertinente e evidência disponível.

Pass significa atendimento à condição específica; fail significa divergência em relação à condição padrão do catálogo; unknown significa cobertura ou informação insuficiente. Mesmo com zero fail, a ficha não é declarada válida. Exceções de classe, subclasse ou suplementos ainda não modeladas podem explicar divergências. A auditoria não bloqueia salvamentos, não apaga registros e não muda a visibilidade da ficha.

## O que é conferido

Pré-requisitos de talentos seguem o tipo real FeatRequirement do pacote: cada cláusula precisa ser atendida (E); dentro dela basta uma alternativa (OU). A avaliação tem três estados, preservando condições desconhecidas. São avaliados nível total atual, atributos, outro talento exigido, qualquer talento de categoria e exclusividade de categoria, excluindo o próprio registro como pré-requisito. Características com nome exato presentes nas classes/subclasses no nível atual são reconhecidas; ausência não é tratada como prova de impossibilidade, pois outras origens podem conceder características. Campanha permanece desconhecida. Repetições são comparadas a repeatable do talento.

Magias de origem direta class são comparadas a casting.list, casting.maxSpellLevel, casting.prepared e casting.cantrips do JSON da classe. O índice das tabelas usa o nível daquela classe, não a soma de níveis de multiclasse. A preparação conta apenas selectable com is_prepared=1, excluindo always_prepared e origens independentes. Limites são tetos, não exigência de preencher todas as escolhas de um rascunho. O relatório verifica ainda se uma magia preparada diretamente pela classe wizard está no grimório daquela classe, e se as entradas do grimório correspondem à lista wizard e ao limite padrão de nível.

## Limites e pendências

Talentos e magias são auditados contra @freshmag/one-dndb 0.5.1. Os pré-requisitos de atributos de multiclasse usam também conferência independente nas regras gratuitas e no SRD 5.2 oficiais, registrada em [multiclasse-2024.md](multiclasse-2024.md). O campo `basis.officialSources` identifica essas fontes; elas não certificam os demais achados do catálogo.

- Pré-requisitos de multiclasse: mínimo 13 com lógica E/OU explícita para as 12 classes básicas, incluindo todas as classes atuais. Classes de suplementos não mapeadas continuam inconclusivas. A regra não é inferida de primaryAbility.
- Elegibilidade na data de aquisição: não avaliada. O relatório usa estado atual; atributos e dependências históricas não estão totalmente representados.
- Benefícios e quantidades de escolhas: escolhas diretas reconhecidas pela convenção choiceKey `<campo>:<id>` agora são auditadas; escolhas aninhadas, chaves antigas e contextos não confirmados permanecem inconclusivos. Veja escolhas-beneficios-backend.md.
- Exceções de listas, preparação e limites concedidas por subclasses, talentos e suplementos: pendentes. Magias de origem independente não são tratadas como pertencentes automaticamente à lista da classe.
- Dependências cíclicas de pré-requisitos e benefícios que concedem atributos: não resolvidas por esta auditoria do estado atual.
- Campanha, autorização do mestre e restrições de suplemento: não inferidas.
- Não confere espaços de magia, dano, CA, custo/tempo de cópia, combate ou consumo de recursos.

## Verificação executável

Testes cobrem lógica E/OU em três estados, talentos reais War Caster e Aberrant Anatomy, magia Cure Wounds fora da lista padrão de mago, Wish acima do nível do grimório, excesso de preparação, exclusão de always_prepared da contagem, acesso a fichas privadas, leitura sem mutação e permanência de rulesVerified=false quando não há divergências detectadas.

Nenhuma migração ou dependência nova.

## Conferência posterior no PDF anexado

Os benefícios de entrada e a tabela de espaços comuns das classes básicas foram implementados após leitura local do SRD 5.2. Ver multiclasse-progressao-srd52.md para páginas, hash, escopo, atribuição e limitações de suplementos/subclasses.
