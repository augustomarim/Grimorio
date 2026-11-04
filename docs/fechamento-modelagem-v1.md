# Fechamento estrutural da modelagem v1

## O que pode começar a ser implementado

A estrutura está consolidada em 49 tabelas e 6 views, com schema versão 3. O núcleo comum, o módulo D&D, os contratos de contas e permissões, catálogo bibliográfico, CRUD de construção de ficha, migrações e recuperação local estão documentados e testados nos limites descritos.

Isso permite iniciar backend de contas, sessões, catálogo, acesso e persistência. Não equivale a certificar todas as fichas ou regras de D&D 2024. A autorização do usuário para concluir esta etapa não apaga as limitações conhecidas.

Escopo v1: criar, editar, consultar, buscar, publicar e gerenciar fichas. Apenas D&D 2024 habilitado. Outros RPGs recebem perfis/módulos próprios. Rolagens, dano, PV correntes, descansos e consumo de espaços são evolução v1.5, sem tabelas vazias agora.

## Decisões encerradas para a v1

- Total do personagem é soma dos níveis de classe; subclasse pertence à classe e não tem nível próprio.
- Regras agregadas e elegibilidade são responsabilidade transacional do módulo, não CHECKs por linha.
- Nomes, slugs e depreciação são canônicos no catálogo comum; FKs tipadas permanecem nos detalhes.
- Opções podem ter vários livros. Fonte ausente é “Fonte não identificada”; não inferir livro base ou oficialidade.
- Não há opções personalizadas; o JSON é a preservação de registros externos, com exceção do JSON opcional de auditoria.
- Opções depreciadas continuam referenciadas por fichas existentes e devem aparecer sinalizadas. Nova aquisição é rejeitada; editar narrativa ou outro dado independente não exige substituir automaticamente a opção. Não converter uma ficha sem consentimento.
- Atualização de catálogo não congela seu conteúdo histórico. ruleset_revision_id identifica a revisão do salvamento, não é snapshot. Não apresentar uma ficha antiga como reconstrução exata de regras anteriores.
- Estilo de luta e talento de mesma categoria/slug representam a mesma aquisição mecânica: o serviço deve rejeitar dupla aquisição entre character_fighting_style e character_ability em transação, salvo exceção normativa confirmada. Origem pode ser exibida sem duplicar o benefício.
- Concessões de magia distintas por classe/espécie/talento são preservadas. Limitação conhecida: o schema atual consolida uma magia por classe/espécie/antecedente; condições diferentes dentro da mesma origem precisam de mapeamento explícito, não valores inventados em notes. Exceções não conferidas não devem ser apresentadas como automaticamente validadas.
- Conta ativa usa privadamente antes de confirmar e-mail; publicação exige confirmação e ausência de bloqueio administrativo. Dono edita/exclui; administrador consulta/modera, sem editar fichas alheias implicitamente.
- Access/refresh opacos, hashes no banco, rotação e revogação de família. Recuperação de senha revoga sessões; políticas de limite de tentativas são temporárias e não mudam is_active.
- Baseline e migrações aplicadas são imutáveis. schema.sql e cadeia de migrações são caminhos alternativos para banco novo. Backup online e restauração em WAL foram testados; automação externa depende da hospedagem.

## Correção dos exemplos

Ari e Bela agora usam Human/Criminal, existentes no pacote. Alert e Thieves' Tools de Ari são relacionados ao antecedente Criminal, cujo JSON efetivamente os concede. A proficiência de ferramenta de Alchemist foi substituída por Thieves' Tools. Thieves' Cant foi vinculado a Rogue de Bela, pois consta em languagesFixed da classe.

Common permanece no catálogo com is_always=1, sem ocupar uma aquisição por antecedente. Deve ser incluído pelo módulo como idioma universal quando a regra aplicável assim o determinar. As tabelas de preparação do pacote são indexadas pelo nível individual de cada classe, não pelo nível total 10.

Esses exemplos são PARCIAIS: não contêm todas as escolhas obrigatórias de uma ficha completa. Não são seed de produção nem atestado normativo. Foram corrigidas as incoerências de origem identificadas, sem inventar opções faltantes.

## Conferência normativa bloqueada

Tentativa de leitura do PDF oficial SRD 5.2.1 em media.dndbeyond.com foi bloqueada pelo proxy: CONNECT com resposta 403. O rascunho de rede foi lido e a tentativa de salvar os domínios oficiais retornou draft_not_editable; a alteração de rede NÃO foi confirmada.

Portanto, não foi concluída a conferência oficial dos requisitos de multiclasse, benefícios de entrada, tabela/arredondamentos de espaços, Magia de Pacto, grimório, exceções de subclasses ou de suplementos. Dados do pacote não substituem essa conferência. Não declarar “D&D 2024 totalmente validado”.

Para desbloquear, configurar nas opções do ambiente acesso a media.dndbeyond.com e www.dndbeyond.com, preservando os presets/hosts existentes, ou fornecer os trechos/documentos oficiais necessários. A tarefa atual não deve inventar autorização de publicação para o conteúdo dos suplementos. O catálogo bibliográfico identifica procedência, não licença nem oficialidade.

Essa pendência não bloqueia contas, catálogo ou persistência. Bloqueia a promessa de um validador normativo completo e a implementação de automatismos que dependam das regras não conferidas. A API deve distinguir persistência válida de construção plenamente conferida, sem atribuir um selo de legalidade pelo simples sucesso das FKs.

## Evidências atuais

Schema e exemplos executados no SQLite 3.53.1; consultas por domínio executadas; migrações/checksums e backup/restauração local em WAL testados. A suíte passa com 41 testes: 38 anteriores e 3 novos sobre coerência dos exemplos com o pacote. Esses 3 não são validação normativa oficial.

SQL/DBML/dicionário descrevem a estrutura; regras de acesso e protocolos são exercitados por suporte de testes, não endpoints. DBML não foi renderizado no site. Não há backend, frontend, e-mail ou hospedagem implementados.

## Próxima execução: backend

Ordem concreta em contrato-backend-v1.md: fundação e migrações; contas/sessões; catálogo/fontes; persistência e permissões de ficha; módulo D&D com verificações confirmadas; operação/hospedagem. Não voltar a acrescentar tabelas por hipóteses de sistemas futuros. Uma nova mudança física deve resolver uma necessidade demonstrável e vir como migração posterior à versão 3.
