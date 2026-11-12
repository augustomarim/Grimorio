# Frontend do Grimorio

Na raiz, com Node.js 24, execute `npm ci` e `npm run dev:site`. Abra
http://127.0.0.1:4173. O comando inicia o frontend e a API juntos. Ele usa
`backend/.env` ou, se esse arquivo não existir, o `.env` da raiz. A API
verifica o schema e o catálogo do banco configurado na inicialização.
`npm run frontend:test` verifica as regras projetadas.

## Conta e hub

Configure o banco e `AUTH_KEY` conforme o [README da raiz](../README.md).
O comando `dev:site` ajusta a origem local e o prefixo da API em memória.
O comando respeita o `MAIL_MODE` configurado. Com `resend` ou `smtp`, a API envia
as mensagens pelo provedor configurado. Os arquivos em `data/mail/` são gerados
apenas quando `MAIL_MODE=file` é selecionado. O modo padrão é `disabled`. O cadastro e a publicação de fichas dispensam confirmação de e-mail.
Se preferir executar `npm run frontend:dev` e `npm run dev` separadamente,
configure a API de desenvolvimento em `backend/.env`:

```dotenv
APP_ORIGIN=http://127.0.0.1:4173
API_PREFIX=/api
```

O frontend encaminha as rotas de conta para `http://127.0.0.1:3000`. Use a
variável `FRONTEND_API_ORIGIN` no processo do frontend se a API estiver em
outra origem. Abra o frontend no mesmo endereço configurado em `APP_ORIGIN`.
O backend envia os cookies de sessão e controla o envio dos e-mails.

Depois de entrar, o hub mostra a ficha mais recente, atalhos e o compêndio.
As fichas do construtor são sincronizadas com a conta pela API. O navegador
mantém uma cópia para preservar edições durante falhas de conexão. Edições
concorrentes geram um conflito, com opções para preservar a edição como nova
ficha ou carregar a versão da conta. **Usar fichas locais sem conta** mantém
os rascunhos apenas neste navegador.

Antes de iniciar a API atualizada, execute `npm run db:migrate`. A migração
`0002_builder_documents.sql` acrescenta os documentos do construtor sem alterar
as fichas relacionais existentes. Os documentos usam UUID, propriedade da conta
e revisão para controle de concorrência. As rotas relacionais anteriores
continuam independentes desses documentos.

**Criar personagem** abre uma nova aba com um rascunho independente. O painel
lista as fichas e rascunhos da conta, com busca e exclusão. Origem, atributos, classe, progressão e revisão
podem ser revisitados antes ou depois de salvar.

O catálogo vem de `@freshmag/one-dndb/data` 0.5.1, o mesmo pacote importado pelo
backend. O servidor local lê 25 espécies, 13 classes, 76 subclasses e 71
antecedentes, incluindo suplementos identificados pelo nome da fonte.

O construtor projeta escolhas estruturadas, suas dependências e os benefícios
disponíveis no nível planejado. Inclui as escolhas de perícia e talento do
Humano, as magias de Iniciado em Magia, linhagens, estilos de combate,
equipamento inicial e o grimório do Mago. As regras adicionais de atributos,
ordens de Clérigo e Druida, metamagia e invocações básicas do Bruxo vêm das
[regras básicas de D&D 2024](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes).

Em **Classe e níveis**, escolha a classe de cada avanço até o nível total 20.
O construtor libera características por nível de classe e verifica os atributos
da ficha no momento de entrada de cada classe para os pré-requisitos de multiclasse.
As escolhas incluem manobras, Disparos Arcanos, planos do Artífice, especialização,
magias adicionais dos especialistas em escolas de Mago, Magias Características,
Descobertas Mágicas e atributos de conjuração dos talentos e espécies.
As magias aprendidas acompanham o nível de aquisição. A progressão registra
trocas de magias, truques e invocações quando a classe permite ao subir de nível.
Segredos Mágicos amplia as listas elegíveis nos níveis apropriados.

Configurações escolhidas em ações ou descansos, como Companheiro Primal, modelos
de Armadura Arcana, terreno do Círculo da Terra e Maestria em Magia, aparecem
como referências da habilidade. A revisão exige as escolhas de criação e evolução.

Em **Equipamento**, registre itens, quantidades, tipo de item base, equipamento,
sintonia e observações. O equipamento inicial acompanha as escolhas de origem.
A ficha apresenta CA, PV máximos, dados de vida, proficiência, iniciativa, perícias,
testes de resistência, resistências a dano, deslocamento e conjuração. Os campos
de PV por nível aceitam valores rolados, com média como padrão.
Em **História**, registre alinhamento e narrativa. Uma ficha salva pode ser
compartilhada por link público. As fichas publicadas também aparecem na **Galeria pública**.

As fichas salvas abrem em uma aba própria, com seções para combate, magias,
atributos, inventário, habilidades e anotações. Em **Durante a sessão** é possível registrar dano, cura e PV
temporários, gastar Dados de Vida durante um descanso curto e recuperar recursos
nos descansos. Abra uma magia para escolher o recurso de conjuração e rolar os
efeitos disponíveis. A progressão fica acessível pelo botão **Subir de nível**.
PV atuais e recursos gastos acompanham a ficha privada.

O compêndio e a janela de seleção mostram magias em português brasileiro. A
busca aceita também o nome em inglês e pode ser combinada com filtros de círculo,
escola e publicação. O pacote não inclui a publicação nas magias. Para a revisão
atual, o mapa em `pt-BR.json` usa as listas de suplementos do
[índice de magias por fonte do catálogo](https://dnd2024.wikidot.com/spell:all)
e classifica as demais como Livro do Jogador (2024). A ficha, o compêndio e a janela exibem
o mesmo resumo de conjuração, duração, alcance, dano, cura e resistência, quando
identificáveis no texto do catálogo. O texto original detalha casos condicionais.

O arquivo `pt-BR.json` acompanha a revisão do catálogo e inclui 444 magias e 679
traços e características. Ele foi produzido com tradução automática local e
revisão de termos e descrições selecionadas. Para termos confirmados de edições
anteriores, como **Ancestralidade Feérica** e **Sentidos Aguçados**, foi consultado
o [glossário de referência](https://d1vzi28wh99zvq.cloudfront.net/pdf_previews/308596-sample.pdf).
Os textos traduzidos são adaptações do catálogo e o original em inglês fica
disponível nas fichas. O [SRD público de 2024](https://www.dndbeyond.com/srd) não
lista uma edição em português brasileiro.

O Compêndio inclui equipamentos, ferramentas, idiomas, regras e criaturas.
`reference.json` complementa o pacote com o bestiário SRD 5.2.1, blocos das
magias de invocação, tabelas e os itens específicos dos planos do Artífice.
Os arquivos de origem e as revisões estão registrados em
`scripts/reference-source.json`. `node scripts/import-reference.mjs` reproduz
a importação, aproveitando o cache local em `data/reference/`.
As traduções complementares são automáticas, com nomes comunitários do
projeto `decito/dnd5e-pt-br`, e conservam os textos originais para consulta.
Os cálculos tratam os efeitos permanentes modelados pelo construtor. Condições
situacionais e decisões durante a partida permanecem descritas nas habilidades.

O pacote fornece as opções de Revelação Celestial e a descrição dos 71
antecedentes, mas só menciona os blocos do Companheiro Primal no texto da
subclasse. Os três blocos complementares em `pt-BR.json` seguem o Livro do Jogador
(2024), conforme as fichas publicadas no Roll20
([Terra](https://roll20.net/compendium/dnd5e/Monsters%3ABeast%20of%20the%20Land?expansion=32231),
[Mar](https://roll20.net/compendium/dnd5e/Monsters%3ABeast%20of%20the%20Sea?expansion=32231) e
[Céu](https://roll20.net/compendium/dnd5e/Monsters%3ABeast%20of%20the%20Sky?expansion=32231)).

This work includes material from the System Reference Document 5.2.1 by Wizards
of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is
licensed under the Creative Commons Attribution 4.0 International License
available at https://creativecommons.org/licenses/by/4.0/.
