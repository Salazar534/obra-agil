# Obi Ágil

Marketplace de aluguel de equipamentos de obra. Quem aluga informa o endereço da obra, encontra locadoras por perto e paga com Pix ou cartão em até 12x. As locadoras cadastram o estoque, recebem os pedidos e conversam com o cliente pelo app.

- **Site** em [obiagil.com.br](https://obiagil.com.br), para quem ainda não entrou.
- **App** em [app.obiagil.com.br](https://app.obiagil.com.br) (React, Vite, Tailwind), com visual de app iOS, que pode ser instalado na tela de início do celular.
- **API** em [api.obiagil.com.br](https://api.obiagil.com.br) (Express, PostgreSQL, Zod). A página pede a sessão do app. A referência fica em [`docs/API.md`](docs/API.md).
- **App Expo Go** em `mobile/`, que abre o app web em tela cheia e usa o GPS, a vibração e o compartilhar do celular.

## Requisitos

- Node.js 22.18 ou mais novo.
- PostgreSQL 14 ou mais novo instalado na máquina: o `npm run dev` cria um banco só do projeto em `.postgres/`. Para usar outro PostgreSQL (Docker, Neon, Supabase, RDS), ponha `LOCAL_DB=0` e o `DATABASE_URL` no `.env`.

## Rodar

```bash
npm install
npm run dev
```

O primeiro `npm run dev` cria o `.env` com uma senha nova para o banco, inicia o PostgreSQL do projeto, aplica as migrações e sobe:

- o app em http://localhost:5173
- a API em http://localhost:3001/api. A página em http://localhost:3001 pede a sessão.

Não há contas de exemplo: crie uma conta de cliente e outra de locadora pelo próprio app.

## Serviços externos (`.env`)

Tudo funciona em desenvolvimento sem credenciais, menos os pagamentos. Veja [`.env.example`](.env.example).

| Variáveis | Para quê | Sem elas |
| --- | --- | --- |
| `MP_PUBLIC_KEY`, `MP_ACCESS_TOKEN` | Pix e cartão em até 12x pelo Mercado Pago. As credenciais de teste do [painel](https://www.mercadopago.com.br/developers/panel/app) servem para testar sem cobrar. | Pagamentos desligados; o app avisa que ainda não foram configurados. |
| `PUBLIC_URL`, `MP_WEBHOOK_SECRET` | Webhook do Mercado Pago (exige HTTPS). | O servidor confere os Pix sozinho a cada 30 segundos. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | SMS de verdade para entrar com o celular. | Em desenvolvimento o código aparece no terminal da API. Em produção, entrar pelo celular fica desligado. |
| `SMTP_URL`, `MAIL_FROM` | E-mail de troca de senha. | Em desenvolvimento o link aparece no terminal da API. Em produção, a recuperação de senha fica desligada. |
| `APP_URL` | Endereço do app, usado nos links dos e-mails. | `http://localhost:5173` |

## Testar no celular

- **Mesma rede Wi-Fi**: o `npm run dev` mostra no terminal um QR code do app (`http://SEU-IP:5173`). Para o Expo Go, rode `npm run mobile` em outro terminal.
- **Qualquer rede (4G, outra casa)**: com o `npm run dev` rodando, abra outro terminal e rode `npm run phone`. Ele abre dois túneis HTTPS da Cloudflare, inicia o Expo através deles e mostra dois QR codes: o link do app (Safari ou Chrome) e o do Expo Go. Precisa do `cloudflared` (`winget install Cloudflare.cloudflared`). Os links mudam a cada execução e só funcionam enquanto o computador estiver ligado com os dois comandos rodando.
- **Tela de início**: abra o link no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Banco, API (reinicia ao salvar) e app web |
| `npm run phone` | Túneis públicos, Expo Go e QR codes |
| `npm run mobile` | Expo na rede local |
| `npm run test:api` | Teste de ponta a ponta da API num banco separado, com pagamentos simulados |
| `npm run seed:castanhal` | Cria 5 lojas de exemplo com equipamentos em Castanhal (PA), com a API rodando. Senha das lojas: `Castanhal#2026` |
| `npm run docs` | Gera a referência de `docs/API.md` e `docs/openapi.json` a partir das rotas |
| `npm run build` | Confere os tipos e gera o app em `dist/` |
| `npm start` | Servidor de produção: API e app de `dist/` juntos |
| `npm run db:start`, `db:stop`, `db:psql`, `db:migrate` | Banco local |
| `npm run lint` | Lint com oxlint |

## Produção

1. No `.env` da API: `NODE_ENV=production`, `DATABASE_URL`, `APP_URL=https://app.obiagil.com.br`, `PUBLIC_URL=https://api.obiagil.com.br` e `COOKIE_DOMAIN=.obiagil.com.br`. Atrás do proxy, `TRUST_PROXY=1`.
2. No Railway, o serviço `web` entrega o site em `obiagil.com.br` (e `www` redireciona para lá). O serviço `app` entrega o produto em `app.obiagil.com.br` e encaminha `/api` para a API. O serviço `api` escuta em `api.obiagil.com.br`. O Postgres é o banco.
3. `npm run build` e `npm start` continuam servindo API e app juntos numa máquina só.
4. No painel do Mercado Pago, o webhook é `PUBLIC_URL/api/webhooks/mercadopago`, com o evento Pagamentos. O retorno do OAuth continua na URL já cadastrada.

As fotos enviadas ficam em `server/storage/uploads`; faça backup delas junto com o banco.

## Estrutura

```
src/       app web: telas em src/screens, componentes em src/ui, estado e chamadas à API em src/lib
server/    API: rotas, serviços (pagamentos, SMS, e-mail, eventos ao vivo), banco e migrações
mobile/    app Expo Go que abre o app web em tela cheia
scripts/   banco local, teste da API, geração da documentação, túneis e ícones
docs/      API.md e openapi.json
```
