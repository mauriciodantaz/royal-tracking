# Self-hosted — uma stack por domínio-raiz

Royal Tracking é **single-tenant**: cada marca/apex sobe sua própria stack (app + Postgres + env). Não misture várias marcas no mesmo banco.

O host do painel/snippet costuma ser um subdomínio (`tracking.…`); a allowlist de eventos usa o **apex** da marca (`ALLOWED_EVENT_DOMAINS`), aceitando todos os subdomínios desse apex.

## Modelo

```txt
apex A  →  stack A  →  postgres A  +  ENCRYPTION_KEY A  +  admin A  +  ALLOWED_EVENT_DOMAINS=A
apex B  →  stack B  →  postgres B  +  ENCRYPTION_KEY B  +  admin B  +  ALLOWED_EVENT_DOMAINS=B
```

## URLs por instalação

Substitua `SEU_DOMINIO` pelo host configurado no Traefik:

| Uso | URL |
|-----|-----|
| Painel | `https://SEU_DOMINIO/dashboard` |
| Snippet | `https://SEU_DOMINIO/snippet.js` |
| Identify | `https://SEU_DOMINIO/api/identify` |
| Event | `https://SEU_DOMINIO/api/event` |
| Webhook (por conexão) | `https://SEU_DOMINIO/api/webhook/in/{connectionId}` |

No site do cliente, o snippet usa o mesmo domínio (ou `window.TRCK_ENDPOINT`).

## Atualizar

Produção atual: `deploy.sh` na VPS (git pull + npm build no volume).

Quando a imagem Hub voltar:

```bash
docker service update --image royalserver/royal-tracking:latest NOME_STACK_app
```

## Migrar de Supabase (legado)

1. Exportar tabelas (`visitors`, `events_log`, `purchases`, settings/contas) do projeto antigo.
2. Subir stack self-hosted limpa **ou** importar SQL no Postgres da stack.
3. Re-cadastrar tokens Meta/GA4 no painel (cifra mudou de pgcrypto → AES-GCM Node) **ou** re-criptografar offline.
4. Apontar DNS / Traefik para a nova stack.
5. Atualizar snippet e webhook nas plataformas de venda.

Produção: `https://tracking.royalgrowth.com.br` (rede Traefik `RoyalNet`), apex `royalgrowth.com.br`.  
Postgres fica em **stack externa** na mesma rede; a stack do app só sobe o Node.
