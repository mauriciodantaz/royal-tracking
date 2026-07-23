# Docker Hub — publish checklist

Imagem: `mauriciodantaz/royal-tracking`

## Padrão de tags

| Tag | Canal | Origem |
|-----|--------|--------|
| `X.Y.Z` | stable | promoção `beta` → `main` (tag = versão do `package.json`) |
| `stable` | stable | floating = stable atual |
| `latest` | stable | **sempre** = `stable` |
| `X.Y.Z-beta` | beta | bump no merge em `beta` + publish (só enquanto não promovida) |
| `beta` | beta | floating = beta atual |

Sem prefixo `v`. Sem tags com sha (`beta-<sha>`). Sem `X.Y.Z-stable`.

**Uma tip por SemVer:** ao promover `X.Y.Z` para main, apaga-se a Release/tag git `X.Y.Z-beta` e a tag Docker `:X.Y.Z-beta`. Se beta e main são a mesma versão, só existe a stable.

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
| merge PR → `main` | tag `X.Y.Z` + `:stable` / `:latest`; apaga `:X.Y.Z-beta` |
| tag `X.Y.Z` / `workflow_dispatch` | idem |
| `docker-cleanup-tags.yml` | apaga fora do padrão + `*-stable` legado + betas já promovidos |

```bash
gh workflow run docker-publish.yml -f channel=both
gh workflow run docker-cleanup-tags.yml
```
