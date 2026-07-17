# Meta Ads — credenciais

Use estas credenciais para puxar **insights e campanhas** (gastos, ROAS no painel). Não é o mesmo token do Pixel/CAPI — é token da **Marketing API / Ads**.

## Pré-requisitos

- Conta de anúncios Meta (Ad Account)
- Usuário com acesso à conta no Business Manager
- App Meta ou token de sistema com permissão de leitura de ads (ou token de usuário gerado no Graph API Explorer / Business)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “Ads Royal”) |
| **Ad Account ID** | ID da conta, com ou sem prefixo `act_` |
| **Ads token** | Access token com escopos de ads |

## Como obter o Ad Account ID

1. Abra o [Gerenciador de Anúncios](https://adsmanager.facebook.com/) ou Business Settings → **Contas de anúncios**.
2. Selecione a conta.
3. Copie o ID (números). Pode colar como `123456789` ou `act_123456789`.

## Como obter o Ads token

Opções comuns:

### Token de usuário (rápido para teste)

1. Abra o [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Selecione um app Meta da sua empresa.
3. Adicione permissões como `ads_read` (e `ads_management` se for o caso).
4. Gere o token e autentique com a conta que tem acesso ao ad account.
5. Cole em **Ads token**.

> Tokens de usuário expiram. Para produção, prefira **System User** no Business Manager com token permanente.

### System User (recomendado)

1. Business Settings → **Usuários → Usuários do sistema**.
2. Crie/selecione um system user e atribua a conta de anúncios.
3. Gere um token com `ads_read`.
4. Cole no Royal Tracking.

## Configurar no Royal Tracking

1. **Integrações → Meta Ads**.
2. Preencha Nome, Ad Account ID e Ads token.
3. **Adicionar integração**.
4. A aba **Campanhas** do painel passa a usar essa conexão para insights.

## Links oficiais

- [Marketing API — Ad Accounts](https://developers.facebook.com/docs/marketing-api/reference/ad-account)
- [System Users](https://www.facebook.com/business/help/503306463396797)
