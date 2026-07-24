## Summary
-

## Canal
- [ ] `dev` (só VPS interna — sem Docker Hub)
- [ ] `beta` (bump SemVer + `:beta` / `:X.Y.Z-beta`)
- [ ] `main` (promove a **mesma** versão → `:stable` / `:latest`)

## Promoção
- [ ] N/A (feature → um canal)
- [ ] `dev` → `beta`
- [ ] `beta` → `main` (**merge commit**, nunca squash/rebase)

## Release label (obrigatório em PR para `beta` — exatamente um)
- [ ] `release:versão` (MAJOR — breaking)
- [ ] `release:melhoria` (MINOR — feature)
- [ ] `release:hotfix` (PATCH — bugfix)
- [ ] `release:none` (sem bump / chore CI-docs)

## Stack de exemplo
- [ ] N/A (sem mudança de env/deploy)
- [ ] Atualizei `deploy/royal-tracking-stack.yml` (+ README/SELF-HOSTED se preciso)

## Segurança
- [ ] N/A (só docs/chore)
- [ ] Sem vazamento de erro interno / secrets
- [ ] Webhook/auth/SSRF/allowlist revisados se tocados ([SECURITY.md](../SECURITY.md), [WEBHOOK-AUTH.md](../docs/WEBHOOK-AUTH.md))
- [ ] Sem `tenant_id` / multi-tenant no app (single-stack)

## Test plan
- [ ] `docker compose up -d --build` sobe e login admin funciona
- [ ] `/api/identify` e `/api/event` respondem
- [ ] Painel carrega métricas sem erro de DB
- [ ] Se webhook marketplace: URL + token válidos (401 sem token)
