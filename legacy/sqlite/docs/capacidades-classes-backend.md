> Atualização: a seção de limites abaixo registra a etapa anterior. O PDF oficial foi fornecido e a combinação básica e os benefícios de entrada foram implementados; o comportamento vigente está em [multiclasse-progressao-srd52.md](multiclasse-progressao-srd52.md).

# Capacidades de classe e espaços de magia — escopo parcial

## Rotas

GET /characters/:id/casting: capacidades por classe, common e pact separados, rulesVerified=false e tracksRemaining=false. Cada capacidade conhecida informa slots com level e maximum. Usa a tabela progression do catálogo local para o nível individual da classe. Não depende das magias escolhidas no personagem. Não grava espaços derivados nem recursos restantes.

GET /characters/:id/class-benefits: distingue initial_class de multiclass_entry. Para a inicial expõe savingThrows, armorTraining, weaponTraining, toolsFixed, skillChoices e toolChoices, preservando os dados do pacote. O consumidor precisa respeitar os níveis das escolhas. Não cria proficiências ou concede automaticamente benefícios. Para entrada multiclasse retorna state=unknown e benefits=null: não copia os benefícios da classe inicial.

As rotas seguem as permissões de leitura da ficha, com 404 para leitores sem acesso a ficha privada. As consultas ocorrem em transação consistente e não atualizam timestamps, revisão, auditoria ou qualquer conteúdo da ficha. Perfil sem D&D retorna 409 após a verificação de acesso.

## Fonte e cálculo

catalogSlots interpreta ContentItem.progression no pacote @freshmag/one-dndb 0.5.1. Cabeçalhos 1st a 9th identificam a quantidade máxima por nível de espaço. Na classe com casting.pact, os cabeçalhos Spell Slots e Slot Level identificam quantidade e nível dos espaços de Pacto, em outra lista. Linhas ausentes, valores inválidos ou tabelas conflitantes retornam unknown, não zero.

Uma classe sem conjuração retorna lista vazia; se houver indicação de conjuração mas os dados necessários estiverem ausentes, retorna unknown. Para conjuração de subclasse, tenta a tabela própria quando a classe não possui casting; tabela insuficiente também fica inconclusiva.

Exemplos exercitados: Wizard nível 3 → quatro espaços de 1º nível e dois de 2º; Warlock nível 5 → dois espaços de Pacto de 3º; Paladin nível 1 → dois espaços de 1º na tabela individual do pacote. A tabela individual de Paladin NÃO é usada para inferir arredondamentos da fórmula multiclasse.

## Limites explícitos

A combinação comum de espaços em uma ficha com mais de uma classe continua unknown sempre que houver conjuração comum. perClass são referências individuais, não parcelas que possam ser somadas. Isso inclui combinações com apenas uma classe conjuradora, por cautela até conferir as regras de combinação. Pacto permanece separado e sua tabela individual continua disponível. Não se soma Pacto ao nível efetivo de conjurador.

A consulta oficial para esta etapa retornou HTTP 403 neste ambiente. Portanto, não foram inventados a tabela de benefícios de entrada, o cálculo do nível efetivo multiclasse, arredondamentos de classes parciais, nem contribuições de Artificer/subclasses. Não se declara toda a v1 concluída. Os pré-requisitos de atributos enviados e revisados pelo usuário foram integrados separadamente; ver multiclasse-2024.md. A conferência oficial registrada naquele arquivo é da tarefa anterior, não foi repetida nesta implementação.

Também há auditoria de salvaguardas registradas como concessão fixa da classe inicial: compara com savingThrows. Entradas multiclasse e outros contextos permanecem unknown. Não há novos endpoints de escrita para armaduras, armas ou salvaguardas neste incremento.

## Atualização

Sem nova migração ou dependência. Preserva a versão 4 do schema. Dados de catálogo continuam consultáveis localmente. O ZIP inclui os módulos anteriores usados pelo app para manter a atualização compatível.
