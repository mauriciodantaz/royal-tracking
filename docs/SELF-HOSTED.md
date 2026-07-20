# Self-hosted — uma stack por domínio-raiz

Royal Tracking é **single-tenant**: cada marca/apex sobe sua própria stack (app + Postgres + env). Não misture várias marcas no mesmo banco.

O host do painel/snippet costuma ser um subdomínio (`tracking.…`); a allowlist de eventos usa o **apex** do site (`ALLOWED_EVENT_DOMAINS`), aceitando todos os subdomínios desse apex. Em produção a variável é obrigatória (boot falha se faltar ou for placeholder).

## Modelo

```txt
apex A  →  stack A  →  postgres A  +  ENCRYPTION_KEY A  +  admin A  +  ALLOWED_EVENT_DOMAINS=A
apex B  →  stack B  →  postgres B  +  ENCRYPTION_KEY B  +  admin B  +  ALLOWED_EVENT_DOMAINS=B
```

A identidade GA4 (FPID) reutiliza `ENCRYPTION_KEY` — não há secret extra para configurar no install.

## Instalação (canônica — imagem Docker Hub)

1. Postgres + rede Swarm/Traefik (ex.: `RoyalNet`).
2. Copie [`deploy/royal-tracking-stack.yml`](../deploy/royal-tracking-stack.yml), preencha placeholders.
3. Deploy no Portainer com a imagem `mauriciodantaz/royal-tracking:latest` (= `:stable`) ou `:beta`.

Ou na VPS: `bash install.sh` (padrão puxa Hub; `ROYAL_TRACKING_BUILD_ON_VPS=1` só para build local).

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

Com imagem Hub (recomendado):

```bash
docker service update --image mauriciodantaz/royal-tracking:latest royaltracking_<slug>_app
```

Pré-release:

```bash
docker service update --image mauriciodantaz/royal-tracking:beta royaltracking_<slug>_app
```

Variante avançada (build na VPS → volume Swarm): ver [DEPLOY.md](../DEPLOY.md) e [`deploy/portainer-stack.yml`](../deploy/portainer-stack.yml).

```bash
cd /root/projects/royaltracking_<slug>
./deploy.sh   # → ops/deploy.sh
```

Postgres fica em **stack externa** na mesma rede; a stack do app só sobe o Node.
