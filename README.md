# Conta clara

Controle pessoal de cartões, faturas, parcelamentos e despesas compartilhadas, com autenticação e dados isolados por usuário no Supabase. Inclui cadastro manual, importação CSV e sincronização pelo Meu Pluggy.

## Desenvolvimento

Use **Node.js 24 LTS** (a versão está em `.nvmrc`).

```sh
nvm use
npm ci
cp .env.example .env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os dados do seu projeto. Credenciais e vínculos da Pluggy são opcionais e ficam somente no servidor; veja o [guia Meu Pluggy](docs/INTEGRACAO-MEU-PLUGGY.md).

```sh
npm run dev
```

Acesse `http://localhost:3010`. A rota `/demo` usa dados de exemplo armazenados neste navegador. A conta autenticada usa o Supabase.

## Verificação

```sh
npm run check
npm audit --omit=dev --audit-level=high
```

O primeiro comando executa lint, geração dos tipos de rota, tipagem, testes e build. A integração contínua repete essas verificações em Node 24. O build não precisa de credenciais da Pluggy nem realiza sincronizações.

## Produção

1. Configure as variáveis de `.env.example` no provedor. As variáveis `NEXT_PUBLIC_SUPABASE_*` precisam estar presentes durante o build. As variáveis `PLUGGY_*` permanecem privadas no servidor. Um novo valor público exige um novo build.
2. Vincule o Supabase CLI ao projeto correto e confira `supabase migration list --linked` antes de executar `supabase db push`. As versões locais correspondem ao histórico aplicado no projeto `financeiro`; nesse projeto, não reaplique os arquivos manualmente. Em um projeto novo, aplique todas as migrações em ordem.
3. No Supabase Auth, configure **Site URL** com a URL HTTPS da aplicação e inclua `https://seu-dominio/auth/callback` em **Redirect URLs**. Para desenvolvimento, inclua `http://localhost:3010/auth/callback`.
4. Na Vercel, selecione o framework **Next.js**, Node **24.x**, instalação com `npm ci` e build com `npm run build`. O runtime da sincronização aceita até 120 segundos; o plano/provedor deve permitir esse tempo. Em outro provedor, use um servidor Node e HTTPS na frente da aplicação.

Para executar o build de produção em um servidor Node:

```sh
npm ci
npm run build
npm start
```

`npm start` atende em `0.0.0.0`, usa a variável `PORT` e, na ausência dela, a porta 3000. No PowerShell, defina `$env:PORT = '3011'` antes de iniciar se precisar de outra porta. A aplicação precisa de um runtime de servidor: autenticação e sincronização usam rotas de API.

As respostas financeiras são privadas e não armazenadas em cache HTTP. O banco aplica RLS por usuário e grava as alterações com controle de revisão.

## Instalação como PWA

Em produção com HTTPS, o navegador pode instalar o app pelo menu **Instalar aplicativo** no Chrome/Edge. No Safari do iPhone/iPad, use **Compartilhar → Adicionar à Tela de Início**. O manifesto fornece ícones de 192 e 512 pixels, ícone maskable e ícone Apple; a aplicação abre em janela própria.

O service worker é registrado somente no build de produção. Ele guarda apenas ícones e a tela pública de ausência de conexão. Compras, faturas, sessões, páginas autenticadas, respostas RSC e APIs continuam usando a rede. Sem conexão, uma navegação exibe uma tela com **Tentar novamente**; operações financeiras exigem internet.

Para verificar localmente, rode `npm run build` e `npm start` e abra `http://localhost:3000`. Confira **Application → Manifest**, **Service Workers** e **Cache Storage** no DevTools. Ao alterar a tela offline ou os ícones, incremente a versão do cache em `public/sw.js`.

As notificações push e a gravação de operações financeiras sem conexão não fazem parte deste fluxo.
