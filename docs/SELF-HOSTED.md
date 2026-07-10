# Self-hosted — uma stack por domínio

Royal Tracking é **single-tenant**: cada cliente/domínio sobe sua própria stack (app + Postgres + env). Não misture vários clientes no mesmo banco.

## Modelo

```txt
domínio A  →  stack A  →  postgres A  +  ENCRYPTION_KEY A  +  admin A
domínio B  →  stack B  →  postgres B  +  ENCRYPTION_KEY B  +  admin B
```

## URLs por instalação

Substitua `SEU_DOMINIO` pelo host configurado no Traefik:

| Uso | URL |
|-----|-----|
| Painel | `https://SEU_DOMINIO/dashboard` |
| Snippet | `https://SEU_DOMINIO/snippet.js` |
| Identify | `https://SEU_DOMINIO/api/identify` |
| Event | `https://SEU_DOMINIO/api/event` |
| Webhook compra | `https://SEU_DOMINIO/api/webhook/compra` |

No site do cliente, o snippet usa o mesmo domínio (ou `window.TRCK_ENDPOINT`).

## Atualizar

```bash
docker service update --image royalserver/royal-tracking:latest NOME_STACK_app
```

Ou re-deploy da stack no Portainer com a tag nova.

## Migrar de Supabase (legado)

1. Exportar tabelas (`visitors`, `events_log`, `purchases`, settings/contas) do projeto antigo.
2. Subir stack self-hosted limpa **ou** importar SQL no Postgres da stack.
3. Re-cadastrar tokens Meta/GA4 no painel (cifra mudou de pgcrypto → AES-GCM Node) **ou** re-criptografar offline.
4. Apontar DNS / Traefik para a nova stack.
5. Atualizar snippet e webhook nas plataformas de venda.

Produção RoyalServer: `https://tracking.royalserver.com.br` (rede Traefik `RoyalNet`).  
Postgres fica em **stack externa** na mesma rede; a stack do app só sobe o Node.
