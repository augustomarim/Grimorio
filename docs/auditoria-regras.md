> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

> Atualização vigente — efeitos estruturados: schema 6, base e bônus separados, projeção dos 13 campos de Feat.effects, escolhas estritas e pré-requisitos sem autovalidação por bônus. Consulte [efeitos-regras-consolidados.md](efeitos-regras-consolidados.md). Os incrementos descritos abaixo são históricos; texto de combate e condições de mesa não são executados automaticamente.

# Auditoria preliminar de regras: multiclasse e conjuração

Escopo: análise estática do modelo atual e inspeção executada dos dados reais de @freshmag/one-dndb 0.5.1. Esta etapa não é uma comparação com livros oficiais e não constitui validação normativa completa. SQL, DBML e exemplos não foram alterados.

## Evidências do pacote

- As 13 classes possuem subclassLevel = 3 nos registros inspecionados. Isso confirma o conteúdo do pacote, não a elegibilidade automática de todas as subclasses e fontes.
- Classes conjuradoras possuem casting com ability, list e tabelas por nível de classe para cantrips, prepared e maxSpellLevel.
- Warlock contém casting.pact = true. Seus recursos não podem ser tratados como progressão comum de Conjuração apenas porque spellcasting é verdadeiro.
- Não foram encontradas menções a multiclass nos registros de classe nem nas 155 regras. Não há evidência suficiente nesses registros para deduzir todos os requisitos, benefícios de entrada e arredondamentos de progressão multiclasse.
- savingThrows da classe informa suas proficiências, mas não é prova de que elas sejam concedidas novamente ao entrar por multiclasse.
- As tabelas de progressão são dados do catálogo em JSON. Não existe no pacote um validador completo da ficha que substitua as regras do serviço.

## Exemplo concreto: Ari

Pelos arrays casting do pacote, tomando o nível individual de cada classe:

| Classe | Nível | Atributo indicado | Prepared no pacote | MaxSpellLevel no pacote |
|---|---:|---|---:|---:|
| Wizard | 3 | Intelligence | 6 | 2 |
| Cleric | 4 | Wisdom | 7 | 2 |
| Sorcerer | 3 | Charisma | 6 | 2 |

O total do personagem continua 10. Não usar esse 10 para indexar diretamente os três arrays de preparação ou de nível de magia. A quantidade total e os níveis de espaços de magia são uma regra distinta, ainda dependente de conferência normativa. Os números acima refletem o pacote, sem incluir concessões e exceções de subclasses/talentos nem provar a ficha completa.

## Matriz de fechamento

| Regra | Modelo atual | Evidência faltante / tratamento necessário |
|---|---|---|
| Soma dos níveis | View soma character_class.level | Serviço exige total 1–20 em transação |
| Entrada em multiclasse | Contexto e histórico registráveis | Requisitos de atributos e benefícios por classe precisam de fonte normativa |
| Classe inicial | Flag única no máximo | Serviço exige exatamente uma e verifica primeiro nível |
| Subclasse | FK composta e nível de aquisição no catálogo | Serviço confere nível da classe e compatibilidade da fonte |
| Preparação | Escolha por concessão e classe | Validar limites por classe, exclusões da contagem e exceções de características |
| Grimório | Inscrição separada | Regras de aquisição, cópia, elegibilidade e uso precisam de mapeamento |
| Espaços comuns | Não armazenados como derivados | Conferir fórmula, tabela e arredondamentos por classe/subclasse |
| Magia de Pacto | Identificável no JSON | Modelar cálculo separado e conferir interação com espaços comuns |
| Conjuração gratuita | Categoria granted é insuficiente para toda a mecânica | Precisam ser mapeados quantidade, recarga, atributo e possibilidade de usar espaços |
| Permissões múltiplas da mesma origem | Índices consolidam por classe/espécie/antecedente | Avaliar concessões diferentes com condições distintas antes do backend |
| Benefícios iniciais versus multiclasse | Contextos distintos | Não copiar cegamente savingThrows, armorTraining e weaponTraining da classe |
| Livros/suplementos | Cadastro e associação múltipla | Confirmar procedência e edição; rótulo de pacote não comprova oficialidade |

## Recomendação de implementação futura

Separar definição da regra, escolha do jogador e valores calculados. Preservar o catálogo externo sem tratá-lo como autoridade normativa única. Para cada regra automatizada, registrar referência oficial e edição/versão, exemplos válidos e inválidos, e eventuais divergências do pacote.

Escopo confirmado pelo usuário: v1 de criação/edição e gerenciamento, sem controle de sessão. Calcular capacidades máximas; consumo de espaços, recargas, PV correntes/temporários e rolagens ficam como evolução para v1.5. O núcleo será reutilizado por módulos próprios de outros RPGs, sem exigir estrutura D&D.

Não alterar o esquema para corrigir uma regra sem antes fechar sua fonte e impacto. Não declarar a modelagem aprovada para implementação enquanto regras críticas permanecerem sem conferência.

Atualização de arquitetura: a revisão estatística de magias permanece válida como inspeção do pacote; os atributos da ficha estão agora em dnd_character. A análise estática inicial não foi convertida em validação normativa.

## Fechamento estrutural posterior

A correção de origens dos exemplos e o plano de implementação estão em fechamento-modelagem-v1.md. A tentativa de consultar o SRD oficial falhou por bloqueio do proxy e o rascunho não pôde ser editado. A conferência normativa não foi concluída; isso limita o validador de regras, não contas/catálogo/persistência.
