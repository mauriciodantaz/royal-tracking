# Contributing to Royal Tracking

Obrigado por contribuir. O artefato publicado é a imagem Docker Hub `mauriciodantaz/royal-tracking` (não npm).

Branches no GitHub: só **`dev`**, **`beta`** e **`main`**.

## Canais

| Branch | Docker Hub | VPS (demo interna) | SemVer |
|--------|------------|--------------------|--------|
| `dev` | — | build-on-volume via Actions | — |
| `beta` | `:beta` + `:X.Y.Z-beta` | — | bump no merge (label `release:*`) |
| `main` | `:X.Y.Z` + `:stable` + `:latest` | — | **mesma** versão do `package.json` (tag) |

`latest` é sempre a stable atual. Tags usam só o número (`0.1.0`), sem prefixo `v`.
Uma release por SemVer: ao promover `beta` → `main`, apaga-se `X.Y.Z-beta` (GitHub + Docker).

## Promoção (dia a dia)

```text
push em dev                         → VPS
PR  dev  → beta + label release:*   → bump X.Y.Z + imagem :beta / :X.Y.Z-beta
PR  beta → main (merge commit)      → tag X.Y.Z + imagem :stable / :latest
```

1. **Teste ao vivo** — commit/push em `dev`.
2. **Pré-release Hub** — PR base `beta`, compare `dev`, com **exatamente um** label `release:*`.
   O check **Release label** bloqueia merge sem o label.
3. **Stable** — PR base `main`, compare `beta` (sem bump; promove a versão já definida).
   Use **Create a merge commit** — nunca squash/rebase na promoção (mantém `beta` e `main` alinhados).

Depois de mergear em `main`, sincronize `main` de volta em `dev` e em `beta`
(`git checkout beta && git reset --hard origin/main && git push --force-with-lease`,
ou merge `main` → `beta` / `dev`).

## Labels de release (obrigatório no PR para `beta`)

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
4. Aplique **exatamente um** label de release se o alvo for `beta`.
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
- [ ] Label `release:*` se o alvo for `beta`
- [ ] Stack de exemplo atualizada se env/deploy mudou
- [ ] Test plan no template do PR preenchido
- [ ] Segurança (ver [SECURITY.md](./SECURITY.md) e rule `security-hardening`):
  - [ ] Sem vazamento de `err.message`/stack/SQL ao cliente
  - [ ] Webhooks inbound autenticados ([docs/WEBHOOK-AUTH.md](./docs/WEBHOOK-AUTH.md))
  - [ ] Sem SSRF em URL configurável (HTTPS + bloquear privados)
  - [ ] Sem introduzir multi-tenant / `tenant_id` no app OSS
