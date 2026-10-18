# Cartões, histórico e faturas pelo Meu Pluggy

A conexão inicial e os itens são configurados uma vez. Em **Cartões → Meu Pluggy → Sincronizar cartões**, o app descobre os cartões e copia todo o histórico disponível, inclusive lançamentos futuros e faturas.

## Configuração privada

1. Conecte os bancos em https://meu.pluggy.ai e autorize o conector **MeuPluggy** no Demo de https://dashboard.pluggy.ai.
2. Copie os itemIds em **Itens Conectados**. A listagem automática de itens não está disponível no Meu Pluggy.
3. Configure as variáveis privadas na Vercel ou em .env.local:

```dotenv
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...
PLUGGY_ITEMS_JSON={"uuid-do-usuario":["item-mercado-pago","item-inter","item-nubank"]}
# Somente quando o conector é genérico, como MeuPluggy: banco confirmado pelo usuário.
PLUGGY_ITEM_INSTITUTIONS_JSON={"item-inter":"inter","item-nubank":"nubank"}
```

4. Aplique as migrações de `supabase/migrations/`, incluindo o histórico, a dispensa e os metadados de parcelamento. Os nomes correspondem às versões já aplicadas no Supabase.
5. Reinicie o servidor após mudar o ambiente; na Vercel, faça um novo deploy.
6. Entre na conta e sincronize, mesmo que ainda não existam cartões locais.

Os bancos aceitos são Nubank, Inter e Mercado Pago. Não se deduz o banco pelo nome GOLD/platinum. Credenciais e essas configurações nunca devem usar NEXT_PUBLIC_*. A variável antiga PLUGGY_CARD_MAP_JSON não é utilizada.

## Descoberta e histórico

- Consultam-se somente os itens associados ao usuário autenticado. Um item não pode pertencer a usuários diferentes.
- Contas devem ser CREDIT / CREDIT_CARD, em BRL, com quatro dígitos finais válidos. Contas incompatíveis ou sem banco identificado são ignoradas com aviso.
- O accountId da Pluggy é o UUID local do cartão. Sincronizações repetidas não duplicam cartões.
- Dados locais do cartão são preservados. Datas ausentes são completadas pelos metadados da conta ou pelas faturas mais recentes.
- Todo o histórico disponível é consultado, sem limite de data inicial. A cobertura histórica depende do banco e da Pluggy; não é possível recuperar dados que eles não disponibilizam.
- Em **Transações** e **Faturas**, o período padrão é **Todo o histórico**. Selecione **Mês específico** para restringir a consulta.
- Cada despesa bancária é um lançamento individual. Não se reconstrói o valor total de uma compra parcelada, evitando duplicação de parcelas.
- Créditos, pagamentos e ajustes em BRL aparecem como movimentações bancárias, sem criar compras ou cobrar responsáveis novamente.
- Compras internacionais usam o valor em reais fornecido em amountInAccountCurrency. Não se inventa uma cotação; movimentos sem valor em reais permanecem fora da importação.
- São exibidos lançamentos POSTED e PENDING. Os lançamentos previstos também aparecem nas competências futuras.
- A data do lançamento é convertida para São Paulo. O mês vem da fatura vinculada por billId ou da previsão billForecastDate; na ausência dessas informações, é estimado pelas datas do cartão ou pelo mês do lançamento. Datas de fechamento/vencimento desconhecidas aparecem como **Não informado**.
- Uma parcela prevista pode mudar para a fatura oficial quando a Pluggy fornecer o vínculo, preservando o valor local e os responsáveis já confirmados.

## Responsáveis a partir do início do acompanhamento

A primeira atividade registrada na conta fixa a data de início do acompanhamento. Na conta configurada, essa data é **18/10/2026**; ela não avança nos próximos dias.

- Compras com data do lançamento anterior ao início ficam com status **historical**: visíveis, sem responsável e sem gerar valores a receber.
- Compras dessa data em diante ficam **A atribuir**, inclusive parcelas previstas.
- O corte usa a data do lançamento, não a data em que a sincronização ocorreu. Uma compra de hoje que chegue amanhã ainda exige responsável.
- A mesma regra vale para compras manuais sem atribuição e para CSV. Divisões previamente confirmadas são preservadas.
- Em **Sem responsável**, compras pendentes e históricas podem ser atribuídas, com divisão entre pessoas. No histórico, a atribuição é opcional; ao confirmá-la, a parte de terceiros passa a compor o saldo a receber.
- Parcelamentos identificados pelos metadados da Pluggy aparecem uma única vez nessa lista. A atribuição usa o total das parcelas disponíveis ainda sem responsável e distribui os centavos entre elas; cada lançamento permanece na sua fatura original. O formulário informa quando o grupo inclui parcelas históricas.
- Parcelas novas do mesmo grupo herdam a atribuição ou dispensa nas próximas sincronizações. Atribuições existentes são preservadas; escolhas conflitantes e grupos ambíguos permanecem para revisão. Compras históricas descobertas posteriormente continuam sem atribuição automática.
- **Pular atribuição** dispensa a compra e a retira dessa lista, preservando transações e faturas. Você pode atribuí-la depois pelos detalhes da compra. A dispensa permanece salva após novas sincronizações.
- Créditos e pagamentos bancários não pedem responsáveis e ficam fora dessa lista.

## Faturas e conferência

- Todas as faturas disponíveis são copiadas por GET /bills, com seus totais, vencimentos e fechamentos.
- Totais bancários com frações de centavo são arredondados para os dois decimais exibidos em BRL. Valores de compras continuam exigindo centavos exatos.
- Faturas vinculadas usam as datas do banco, incluindo meses anteriores em que o calendário era diferente do atual.
- Faturas futuras sem extrato são identificadas como estimativas. O total oficial, quando disponível, é mostrado separadamente das compras registradas.
- Uma fatura antiga não é marcada como paga apenas por estar no passado. A confirmação de pagamento permanece manual.
- Totais de extrato já conferidos e valores de compras já importadas são preservados. Alterações do banco são sinalizadas; não há conciliação automática de estornos, exclusões ou compras manuais.
- Compras manuais/CSV semelhantes, por valor e data ou parcela na competência, continuam retidas para conferência.

## Consistência e limites

- GET /api/integrations/pluggy/sync retorna a disponibilidade, a última sincronização e a data de início do acompanhamento; não retorna credenciais nem itemIds.
- POST exige sessão autenticada e mesma origem. Cartões, compras, movimentações e faturas são gravados juntos em um único finance_commit, com revisão e RLS por usuário.
- Falhas de rede, dados inválidos, paginação incompleta ou conflito de revisão cancelam a tentativa inteira.
- Limites: uma página de até 500 contas por item; 20 páginas e até 1.000 faturas por conta; 20 páginas de transações por conta, até 500 por página e 10 mil por tentativa; 15 segundos por chamada e 90 segundos totais.
- O resultado informa compras importadas, históricas, movimentações bancárias, faturas novas, registros existentes, alterados, semelhantes e ignorados.
- Sincronizar copia os dados disponíveis no Meu Pluggy; não força atualização no banco. Agendamento e widget de conexão não fazem parte deste fluxo.

Referências: [Meu Pluggy](https://docs.pluggy.ai/pt/docs/guides/meu-pluggy-personal-use), [faturas](https://docs.pluggy.ai/en/reference/bill/bills-list) e [transações](https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor).
