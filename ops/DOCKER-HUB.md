# Docker Hub — publish checklist

Imagem: `mauriciodantaz/royal-tracking`

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|--------|
| `DOCKERHUB_USERNAME` | `mauriciodantaz` |
| `DOCKERHUB_TOKEN` | Access Token do Docker Hub (Read/Write/Delete) |

Criar token: https://hub.docker.com/settings/security

Via CLI (após ter o token):

```bash
gh secret set DOCKERHUB_USERNAME --body "mauriciodantaz"
gh secret set DOCKERHUB_TOKEN --body "<token>"
```

## Canais

| Evento | Tags |
|--------|------|
| push em `beta` | `:beta`, `:beta-<sha>` |
| tag `vX.Y.Z` (criada pelo `release.yml`) | `:vX.Y.Z`, `:X.Y.Z`, `:latest` |
| `workflow_dispatch` | `beta` / `latest` / `both` |

## Primeiro publish

Depois dos secrets:

```bash
gh workflow run docker-publish.yml -f channel=both
gh run watch
```

Ou push da branch `beta` + tag `v0.1.0` em `main`.
