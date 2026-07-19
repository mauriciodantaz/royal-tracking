# Contributing to Royal Tracking

Obrigado por contribuir. O artefato publicado é a imagem Docker Hub `mauriciodantaz/royal-tracking` (não npm).

Branches no GitHub: só **`dev`**, **`beta`** e **`main`**.

## Canais

| Branch | Docker Hub | VPS (demo interna) | SemVer |
|--------|------------|--------------------|--------|
| `dev` | — | build-on-volume via Actions | — |
| `beta` | `:beta` + `:X.Y.Z-beta` | — | não bumpa (usa versão do `package.json`) |
| `main` | `:X.Y.Z` + `:X.Y.Z-stable` + `:stable` + `:latest` | — | bump automático no merge |

`latest` é sempre a stable atual. Tags usam só o número (`0.1.0`), sem prefixo `v`.

## Promoção (dia a dia)

```text
push em dev              → aparece na VPS (tracking.royalgrowth.com.br)
PR  dev  → beta          → imagem :beta no Hub
PR  beta → main + label  → imagem :latest / :stable
```

1. **Teste ao vivo** — commit/push em `dev` (ou PR feature → `dev`).
2. **Pré-release Hub** — PR base `beta`, compare `dev`. Sem label `release:*`.
3. **Stable** — PR base `main`, compare `beta`, com **exatamente um** label `release:*`.

Depois de mergear em `main`, sincronize `main` de volta em `dev` (e em `beta` se precisar) para as três não divergirem.

## Labels de release (obrigatório no PR para `main`)

| Label | SemVer | Quando |
|-------|--------|--------|
| `release:versão` | MAJOR | breaking (API, snippet, webhook, migration incompatível, remoção de env) |
| `release:melhoria` | MINOR | feature / integração nova / endpoint compatível |
| `release:hotfix` | PATCH | bugfix, segurança, regressão |
| `release:none` | — | só docs/CI/chore sem efeito na imagem (skip bump) |

Em dúvida, use `release:hotfix`. Nunca use `release:versão` sem breaking explícito.

Agents no Cursor: use a skill **classify-release** para escolher o label.

## Fluxo para contribuidores externos

1. Fork o repositório e clone o fork.
2. Crie uma branch a partir de `main` (estável) ou `beta` (pré-release).
3. Faça as mudanças e abra um Pull Request.
4. Aplique **exatamente um** label de release se o alvo for `main`.
5. Se o PR alterar env, imagem, rede, Traefik, Postgres ou install, atualize também [`deploy/royal-tracking-stack.yml`](./deploy/royal-tracking-stack.yml) (skill `sync-example-stack`).

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

- [ ] Canal alvo claro (`dev`, `beta` ou `main`)
- [ ] Label `release:*` se o alvo for `main`
- [ ] Stack de exemplo atualizada se env/deploy mudou
- [ ] Test plan no template do PR preenchido
