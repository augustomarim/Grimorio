# Frontend do Grimorio

Pasta reservada para a aplicação web. Ainda não há framework, dependências ou telas aqui.
Quando a implementação começar, adicionar esta pasta aos workspaces do package.json da raiz.

A API em produção usa o prefixo `/api`; a configuração local permite prefixo vazio.
O cliente deve enviar cookies com `credentials: 'include'`, coordenar uma única
renovação de sessão e usar `APP_ORIGIN` correspondente à origem do frontend.
Nenhuma credencial privada de banco, AUTH_KEY ou provedor de e-mail pertence ao cliente.
