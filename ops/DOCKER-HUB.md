# Docker Hub — publish checklist

Imagem: `mauriciodantaz/royal-tracking`

## Padrão de tags

| Tag | Canal | Origem |
|-----|--------|--------|
| `X.Y.Z` | stable | promoção `beta` → `main` (tag = versão do `package.json`) |
| `X.Y.Z-stable` | stable | mesmo digest de `X.Y.Z` |
| `stable` | stable | floating = stable atual |
| `latest` | stable | **sempre** = `stable` |
| `X.Y.Z-beta` | beta | bump no merge em `beta` + publish |
| `beta` | beta | floating = beta atual |

Sem prefixo `v`. Sem tags com sha (`beta-<sha>`).

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|--------|
| `DOCKERHUB_USERNAME` | `mauriciodantaz` |
| `DOCKERHUB_TOKEN` | Access Token (Read/Write/Delete) |

```bash
gh secret set DOCKERHUB_USERNAME --body "mauriciodantaz"
gh secret set DOCKERHUB_TOKEN --body "<token>"
```

## Workflows

| Evento | Tags publicadas |
|--------|-----------------|
| merge PR → `beta` + `release:*` | bump + `:beta`, `:X.Y.Z-beta` |
| merge PR → `main` | tag `X.Y.Z` + `:stable` / `:latest` |
| push `beta` / tag `X.Y.Z` | idem (publish direto) |
| `workflow_dispatch` | `beta` / `stable` / `both` |
| `docker-cleanup-tags.yml` | apaga tags fora do padrão |

```bash
gh workflow run docker-publish.yml -f channel=both
gh workflow run docker-cleanup-tags.yml
```
