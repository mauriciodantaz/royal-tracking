# Self-hosted — uma stack por domínio-raiz

Royal Tracking é **single-tenant / single-stack**: cada marca/apex sobe sua própria stack (app + Postgres + env). Não misture várias marcas no mesmo banco. Não há `tenant_id` no schema — o isolamento entre clientes é operacional (stacks separadas).

Uma eventual oferta cloud será um **agregador de várias stacks single**, não um banco multi-tenant neste app.

O host do painel/snippet costuma ser um subdomínio (`tracking.…`); a allowlist de eventos usa o **apex** do site (`ALLOWED_EVENT_DOMAINS`), aceitando todos os subdomínios desse apex. Em produção a variável é obrigatória (boot falha se faltar ou for placeholder); as APIs públicas também **falham fechadas** se a allowlist estiver vazia.

Checklist de segurança da stack: [SECURITY.md](../SECURITY.md).

## Modelo

```txt
apex A  →  stack A  →  postgres A  +  ENCRYPTION_KEY A  +  admin A  +  ALLOWED_EVENT_DOMAINS=A
apex B  →  stack B  →  postgres B  +  ENCRYPTION_KEY B  +  admin B  +  ALLOWED_EVENT_DOMAINS=B
```

A identidade GA4 (FPID) reutiliza `ENCRYPTION_KEY` — não há secret extra para configurar no install.

## Rate limit

O limite por IP é **em memória no processo Node** (login, reset, tracking, webhooks, redirects). Com uma task Swarm isso cobre abuso básico. Se subir várias réplicas do app, cada réplica conta sozinha — troque a implementação atrás de `src/lib/rate-limit` (ex.: Redis) sem mudar as rotas.

IP do cliente: `X-Forwarded-For` / `X-Real-IP` do Traefik (app não deve ficar exposto sem o proxy).

## Instalação (canônica — imagem Docker Hub)

1. Postgres + rede Swarm/Traefik (ex.: `RoyalNet`).
2. Copie [`deploy/royal-tracking-stack.yml`](../deploy/royal-tracking-stack.yml), preencha placeholders.
3. Deploy no Portainer com a imagem `mauriciodantaz/royal-tracking:latest` (= `:stable`) ou `:beta`.
   O rodapé do painel mostra a versão e o canal (LATEST/BETA); em build VPS aparece Ambiente DEV.

Ou na VPS: `bash install.sh` (padrão puxa Hub; `ROYAL_TRACKING_BUILD_ON_VPS=1` só para build local).

## URLs por instalação

Substitua `SEU_DOMINIO` pelo host configurado no Traefik:

| Uso | URL |
|-----|-----|
| Painel | `https://SEU_DOMINIO/dashboard` |
| Snippet | `https://SEU_DOMINIO/snippet.js` |
| Identify / Event / Lead | `https://SEU_DOMINIO/api/{identify,event,lead}` |
| Webhook curto | `https://SEU_DOMINIO/api/w/{slug}` |
| Webhook (legado) | `https://SEU_DOMINIO/api/webhook/in/{connectionId}` |
| Redirect links | `https://SEU_DOMINIO/r/{slug}` |

Auth dos webhooks (token / Basic / slug): **[WEBHOOK-AUTH.md](./WEBHOOK-AUTH.md)**.

No site do cliente, o snippet usa o mesmo domínio (ou `window.TRCK_ENDPOINT`). A origem do site precisa estar na allowlist (`ALLOWED_EVENT_DOMAINS` = apex).

## Integrações WhatsApp (Evolution / UazAPI)

`base_url` deve ser **HTTPS** público. URLs `http://`, localhost, IPs privados ou metadata são rejeitadas (proteção SSRF).

## Atualizar

Com imagem Hub (recomendado):

```bash
docker service update --image mauriciodantaz/royal-tracking:latest royaltracking_<slug>_app
```

Pré-release:

```bash
docker service update --image mauriciodantaz/royal-tracking:beta royaltracking_<slug>_app
```

Após upgrade com harden de webhooks: revise marketplaces (Hotmart/Kiwify/Eduzz) se usavam `/api/w/…` sem token — ver [WEBHOOK-AUTH.md](./WEBHOOK-AUTH.md).

Variante avançada (build na VPS → volume Swarm): ver [DEPLOY.md](../DEPLOY.md) e [`deploy/portainer-stack.yml`](../deploy/portainer-stack.yml).

```bash
cd /root/projects/royaltracking_<slug>
./deploy.sh   # → ops/deploy.sh
```

Postgres fica em **stack externa** na mesma rede; a stack do app só sobe o Node.
