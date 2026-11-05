> Persistência atual: PostgreSQL / Neon; veja [neon.md](neon.md). As regras de RPG deste documento continuam como referência; detalhes SQLite, comandos antigos e contagens de testes de entregas anteriores são históricos.

# Núcleo comum, módulo D&D e versões

Decisão aprovada: v1 é criação e gerenciamento de fichas D&D 2024, extensível para outros sistemas. V1.5 é uma evolução possível para uso interativo em partida. O modelo atual contém 49 tabelas e 6 views, incluindo schema_migration como histórico operacional. A separação acrescentou rpg_system e dnd_character; não implementou um motor universal nem outro sistema.

## Núcleo comum

- app_user, session, auth_token e audit_log mantêm autenticação, propriedade e auditoria.
- rpg_system cadastra id, code único, nome, edição e is_enabled. A fixture habilita apenas dnd-2024. O cadastro sozinho não implementa regras nem interface de outro sistema.
- character é a identidade da ficha: id, owner_id, system_id, name, portrait, is_public, created_at e updated_at. Não possui nível, atributos, espécie, classe nem revisão de biblioteca.
- character_narrative continua ligada à identidade comum, com história, descrição, personalidade, motivações e objetivos opcionais.

A galeria geral deve consultar character e rpg_system, aplicando visibilidade e permissão. O resumo de cada módulo pode complementar a apresentação. Nível não é campo obrigatório nem universal para todos os sistemas.

## Perfil D&D

A relação character → dnd_character é 1:0..1 no banco e deve ser 1:1 para uma ficha D&D concluída. character_id é PK e FK; as seis características, espécie, antecedente, alinhamento e ruleset_revision_id ficam nesse perfil. Os ids anteriores de fichas e suas escolhas foram preservados.

system_id no perfil deve corresponder ao da ficha. system_code é fixado por CHECK em dnd-2024. Duas FKs compostas validam o par ficha/sistema e o par id/código do sistema. Não há pressuposição de que o id de D&D seja sempre 1; a fixture usa 1 apenas como dado de exemplo.

Todas as tabelas mecânicas character_* agora referenciam dnd_character, diretamente ou por seus pais; character_narrative permanece comum. As FKs de origem de espécie/antecedente também apontam ao perfil. Assim, uma identidade comum de outro sistema não pode receber classes, magias, inventário D&D ou seus benefícios sem um perfil D&D coerente.

Os nomes históricos character_class, character_spell etc. continuam por compatibilidade com o modelo atual. São tabelas do módulo D&D, não uma representação universal. ruleset_revision, o catálogo comum entre tipos D&D, os livros e lib_link também pertencem a esse módulo nesta versão. A identidade de catálogo comum não significa catálogo universal de todos os RPGs.

As seis views existentes são de D&D. character_summary combina o núcleo e o perfil D&D e calcula nível; não retorna identidades de outros sistemas nem perfis incompletos. character_hp_base e as demais views mecânicas não devem servir como resumo de módulos futuros.

## Escrita e integridade

O serviço deve criar identidade e perfil em transação e conferir que existe o perfil certo antes de concluir uma ficha. As FKs validam perfil → identidade, não exigem identidade → perfil. validacao-sistemas.sql detecta fichas D&D sem perfil.

is_enabled controla disponibilidade na aplicação, sem apagar fichas existentes. O serviço rejeita criação em sistemas desabilitados ou sem módulo implementado. O banco pode registrar um sistema futuro para testes ou preparação, mas isso não torna sua ficha suportada.

Trocar o sistema de uma ficha com perfil é bloqueado pelas referências. Conversão entre sistemas não é um UPDATE simples e não está prevista na v1. Excluir a identidade apaga perfil e escolhas em cascata; catálogo e outras fichas são preservados. Excluir sistema em uso é bloqueado. updated_at do núcleo deve refletir edições de qualquer parte da ficha pela transação de serviço.

## V1

Criar, editar, pesquisar, consultar e publicar fichas; registrar narrativa, equipamentos, escolhas, evolução e magias; calcular capacidades e valores permanentes conforme regras confirmadas. Exibir os livros das opções. Sem motor de rolagens, aplicação de danos ou consumo de recursos em partida.

PV máximos modelados e capacidades máximas de conjuração são valores derivados. Os cálculos de espaços de magia ainda precisam de conferência normativa e implementação futura; a definição de escopo não significa que já estejam prontos.

## V1.5 e outros módulos

Estado de jogo ficará separado da construção permanente: PV correntes/temporários, recursos gastos, espaços consumidos, recargas e descansos. Rolagens, cálculos/aplicação de dano, permissões para alterações em partida e eventual histórico de eventos exigem desenho próprio. Não foram criadas tabelas vazias para essas funções agora.

Um novo sistema deve adicionar seu perfil, catálogos e validações próprios, reutilizando identidade, propriedade, narrativa, autenticação e galeria. Sistemas sem classes, níveis ou seis atributos não precisam adotar as estruturas D&D. A arquitetura de módulos será definida no backend depois da aprovação da modelagem.

## Evidências e limites

Executados schema, fixture e 14 testes em SQLite, com regressões de nível/PV, cadastro de uma identidade de outro sistema sem atributos D&D, narrativa comum, rejeição de mistura de sistemas, exclusão em cascata e identificação por código com id de sistema diferente de 1. O sistema alternativo é fictício e existe apenas em testes temporários, desabilitado.

As consultas de validação foram executadas; FKs e integrity_check passaram. A fixture continua com Ari nível 10/PV base 66 e Bela nível 1/PV base 9. Não houve implementação de backend, módulo alternativo, ficha interativa ou renderização do DBML no site. Artefatos para banco novo; migração/troca em produção continuam pendentes. Backup/restauração local em WAL foram testados na etapa operacional posterior, descrita em migracoes-backup-restauracao.md.

Atualização administrativa: refresh_token acrescenta renovação de autenticação ao núcleo comum. A revisão do schema é 3; não muda regras ou escolhas D&D. Consulte autenticacao-refresh-token.md.

Políticas atuais de acesso/publicação estão em contas-permissoes.md. A versão 3 acrescenta login_throttle e campos de moderação/vínculo de tokens, sem alterar regras de RPG.

> Implementação posterior: README.md e estado-backend.md são a referência do backend executável. O histórico de testes/propostas acima descreve a fase em que este contrato foi definido. O schema permanece versão 3.
