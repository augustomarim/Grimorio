> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Multiclasse: benefícios de entrada e espaços comuns

## Fonte conferida nesta implementação

PDF SRD_CC_v5.2.pdf anexado pelo usuário, 361 páginas, extraído localmente com pdftotext. SHA-256: cf18e1f88a360646940b6fada63fd1bd04c1c02581ca668a9115c2f4577bf8aa. As referências abaixo usam a paginação impressa do documento. Não foi necessário acesso online para esta conferência. O pacote npm é a fonte dos registros catalogados; as regras normativas novas estão explicitamente definidas em src/rules/multiclass-progression.ts.

This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Alterações: regras e tabela convertidas em dados e funções de validação, com documentação em português. Não se presume aprovação ou vínculo com o titular do SRD.

## Espaços comuns (pp. 25–26)

GET /characters/:id/casting mantém os espaços de Pact Magic separados. Quando há Spellcasting de uma única classe, utiliza a tabela dessa classe, mesmo se houver outras classes não conjuradoras ou Warlock na ficha. Quando há Spellcasting de várias classes cobertas, usa a tabela Multiclass Spellcaster:

- Bard, Cleric, Druid, Sorcerer e Wizard: todos os níveis.
- Paladin e Ranger: metade dos níveis de cada classe, arredondada para cima.
- Warlock: não contribui para essa soma; seus espaços de Pacto são apresentados separadamente.

O resultado common inclui effectiveCasterLevel e contributions quando a tabela multiclasse é utilizada, além dos máximos por nível de espaço. perClass continua sendo referência individual; não se somam os espaços das tabelas individuais. Não há persistência ou consumo de espaços.

O exemplo oficial Ranger 4 / Sorcerer 3 resulta em nível efetivo 5 e espaços 4/3/2. Wizard 3 / Cleric 4 / Sorcerer 3 resulta em nível efetivo 10. Paladin 3 / Wizard 1 resulta em nível efetivo 3. Paladin 3 / Ranger 3 resulta em nível efetivo 4, com arredondamento de cada contribuição parcial.

Espaços superiores não liberam magias de nível superior para uma classe: a preparação continua sendo conferida individualmente. Pacto pode ser usado para magias preparadas de Spellcasting e espaços comuns podem ser usados para magias de Warlock, conforme p. 26; esta API apenas informa capacidades, não executa conjurações.

## Benefícios de entrada (não são todos os benefícios da classe inicial)

GET /characters/:id/class-benefits retorna state=verified para a entrada nas classes básicas, com a página fonte em benefits.page. Os benefícios são declarativos: a rota não escreve proficiências, inventário ou características. As características de nível 1 da nova classe também são adquiridas, mas têm validação própria e não devem ser confundidas com os traços iniciais listados abaixo. O dado de vida entra no conjunto de dados de vida da classe; não concede novamente PV máximos de primeiro nível.

| Classe | Página | Treinamentos/proficiências adicionais de entrada |
|---|---:|---|
| Barbarian | 28 | Armas marciais; escudos |
| Bard | 31 | Uma perícia à escolha; um instrumento musical; armadura leve |
| Cleric | 36 | Armaduras leves e médias; escudos |
| Druid | 41 | Armadura leve; escudos |
| Fighter | 47 | Armas marciais; armaduras leves e médias; escudos |
| Monk | 49 | Nenhum traço de proficiência inicial adicional |
| Paladin | 53 | Armas marciais; armaduras leves e médias; escudos |
| Ranger | 57 | Armas marciais; uma perícia da lista de Ranger; armaduras leves e médias; escudos |
| Rogue | 61 | Uma perícia da lista de Rogue; Thieves' Tools; armadura leve |
| Sorcerer | 64 | Nenhum traço de proficiência inicial adicional |
| Warlock | 70 | Armadura leve |
| Wizard | 77 | Nenhum traço de proficiência inicial adicional |

Todas essas entradas concedem o dado de vida e as características de nível 1 indicados pelo documento. Nenhuma concede automaticamente salvaguardas ou equipamento inicial.

Para identificar os traços iniciais de entrada sem confundir com características de nível 1, a aplicação usa uma chave explícita de concessão: ruleKey=`multiclass-core:<id da instância character_class>`, com acquisitionContext=multiclass_entry. A rota class-benefits fornece essa chave em coreGrantRuleKey. Essa convenção é da aplicação, não um id do SRD. Concessões legadas sem essa identificação ficam inconclusivas para essas novas auditorias. Características como Protector/Warden devem usar sua própria concessão, pois podem ampliar os treinamentos.

As escolhas de entrada aparecem em GET /characters/:id/benefits/options para concessões multiclass_entry existentes. Chaves da aplicação: skillChoices:multiclass-training e toolChoices:multiclass-instrument. Limites e opções são auditados com o orçamento compartilhado da mesma origem; atribuir três perícias iniciais ao Bardo não passa como sua escolha de entrada de uma perícia. A mesma identidade de classe não recebe orçamento adicional por criar mais concessões.

A auditoria sinaliza salvaguarda fixa concedida como traço de entrada e armadura/categoria de arma não concedida por essa entrada. Ganhos de características (como uma ordem de Cleric) precisam de uma origem/contexto próprio: não são indevidamente atribuídos à lista de traços de entrada. Para armas, a verificação é de categoria permitida; não comprova preenchimento completo de todos os treinamentos.

## Limites

Artificer e contribuições de subclasses conjuradoras não cobertas pelo SRD fornecido continuam unknown na fórmula combinada. A tabela individual do pacote pode continuar disponível; isso não certifica a combinação. Não se inventam fórmulas de suplemento.

A ficha continua sendo um rascunho editável: achados fail aparecem no relatório, sem bloquear a gravação por essas novas auditorias. rulesVerified permanece false, pois dependências históricas, efeitos completos, escolhas aninhadas e outras regras não estão integralmente modeladas. Não foram adicionados endpoints de escrita de armaduras, armas ou salvaguardas. A compra/recebimento de equipamento também não é executada por estas rotas.

Sem migração, nova tabela, mudança de schema/DBML ou dependência. Preserva a versão 4 do banco.
