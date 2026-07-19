# Docker Hub — publish checklist

Imagem: `mauriciodantaz/royal-tracking`

## Padrão de tags

| Tag | Canal | Origem |
|-----|--------|--------|
| `X.Y.Z` | stable | release em `main` |
| `X.Y.Z-stable` | stable | mesmo digest de `X.Y.Z` |
| `stable` | stable | floating = stable atual |
| `latest` | stable | **sempre** = `stable` |
| `X.Y.Z-beta` | beta | push / publish da branch `beta` |
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
| push `beta` | `:beta`, `:X.Y.Z-beta` (versão do `package.json`) |
| tag git `X.Y.Z` | `:X.Y.Z`, `:X.Y.Z-stable`, `:stable`, `:latest` |
| `workflow_dispatch` | `beta` / `stable` / `both` |
| `docker-cleanup-tags.yml` | apaga tags fora do padrão |

```bash
gh workflow run docker-publish.yml -f channel=both
gh workflow run docker-cleanup-tags.yml
```
