# Contributing to Royal Tracking

Obrigado por contribuir. O artefato publicado é a imagem Docker Hub `mauriciodantaz/royal-tracking` (não npm).

## Fluxo

1. Fork o repositório e clone o fork.
2. Crie uma branch a partir de `main` (estável) ou `beta` (pré-release).
3. Faça as mudanças e abra um Pull Request.
4. Aplique **exatamente um** label de release (veja abaixo).
5. Se o PR alterar env, imagem, rede, Traefik, Postgres ou install, atualize também [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml) (skill `sync-example-stack`).

## Canais

| Branch | Docker Hub | SemVer |
|--------|------------|--------|
| `beta` | `:beta` | não bumpa |
| `main` | `:vX.Y.Z` + `:latest` | bump automático no merge |

## Labels de release (obrigatório no PR para `main`)

| Label | SemVer | Quando |
|-------|--------|--------|
| `release:versão` | MAJOR | breaking (API, snippet, webhook, migration incompatível, remoção de env) |
| `release:melhoria` | MINOR | feature / integração nova / endpoint compatível |
| `release:hotfix` | PATCH | bugfix, segurança, regressão |
| `release:none` | — | só docs/CI/chore sem efeito na imagem (skip bump) |

Em dúvida, use `release:hotfix`. Nunca use `release:versão` sem breaking explícito.

Agents no Cursor: use a skill **classify-release** para escolher o label.

## Dev local

```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run dev
```

Ou:

```bash
docker compose up -d --build
```

## Checklist do PR

- [ ] Label `release:*` aplicado
- [ ] Canal alvo claro (`beta` ou `main`)
- [ ] Stack de exemplo atualizada se env/deploy mudou
- [ ] Test plan no template do PR preenchido
