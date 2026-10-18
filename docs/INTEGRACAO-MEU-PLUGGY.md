# Sincronização de cartões: Meu Pluggy

Este projeto usa o fluxo **Meu Pluggy para uso pessoal**; não conecte individualmente Nubank/Inter/Mercado Pago pelo widget comercial.

1. Em https://meu.pluggy.ai conecte Nubank, Inter e Mercado Pago (cada consentimento é independente).
2. No https://dashboard.pluggy.ai (mesma conta), habilite o conector **MeuPluggy** em Customização → Conectores e selecione-o no Demo.
3. Copie os `itemId` de cada instituição em **Itens Conectados**. O endpoint `GET /v2/items` **não está disponível** para Meu Pluggy.
4. Gere Client ID/Client Secret no dashboard Pluggy (nunca os coloque em `NEXT_PUBLIC_*`).
5. Liste contas de crédito para cada item usando a API do Pluggy, e obtenha seu `accountId`.
6. No app, cadastre os cartões com quatro dígitos, fechamento e vencimento. Anote seus UUIDs do app.
7. Configure variáveis de ambiente privadas na Vercel / .env.local:

```dotenv
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...
# Chaves: accountId da Pluggy. Valores: itemId e cardId da aplicação.
PLUGGY_CARD_MAP_JSON={"account-uuid":{"itemId":"item-uuid","cardId":"app-card-uuid"}}
```

8. Com sessão autenticada, use **POST /api/integrations/pluggy/sync** para sincronizar. Um botão na página de cartões chama essa rota.

## Contratos e cuidados

- API usada: `POST /auth`, `GET /accounts?itemId=...&type=CREDIT`, `GET /v2/transactions?accountId=...`.
- Importa apenas despesas `DEBIT`, `POSTED`, em BRL e com valor não nulo. Pagamentos, créditos e estornos devem ser reconciliados separadamente.
- Cada lançamento bancário é importado como compra **pendente** de 1 parcela. Não tentar inferir total parcelado ou reconstruir compras por heurística: isso causaria duplicações e valores inventados.
- Transações com ID já registrado não são duplicadas. Possíveis equivalências a lançamentos manuais ou CSV **não são importadas automaticamente**, para evitar cobrar duas vezes. O resultado informa quantas foram ignoradas por semelhança.
- Não altere importações históricas automaticamente; lançamentos corrigidos/estornos precisam de uma etapa de reconciliação.
- Meu Pluggy atualiza os bancos aproximadamente a cada 24 horas; apertar sincronizar copia a versão atual do Meu Pluggy, **não força atualização do banco**.
- Não expor credenciais, tokens, nomes completos ou detalhes financeiros em repositório público. Não use `service_role` no navegador.
- Para sincronizar sem interação humana futuramente, criar um cron com autenticação própria e escopo exclusivo, **não reutilizar** uma rota autenticada por cookie.
- O Meu Pluggy é gratuito até cinco conexões para uso pessoal, sujeito à cobertura real de cada cartão e aos termos do fornecedor.

Referência: https://docs.pluggy.ai/pt/docs/guides/meu-pluggy-personal-use
