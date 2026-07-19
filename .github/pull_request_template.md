## Summary
-

## Canal
- [ ] `dev` (só VPS interna — sem Docker Hub)
- [ ] `beta` (publica `:beta` + `:X.Y.Z-beta`, sem bump)
- [ ] `main` (bump `X.Y.Z` + `:stable` + `:latest`)

## Promoção
- [ ] N/A (feature → um canal)
- [ ] `dev` → `beta`
- [ ] `beta` → `main`

## Release label (obrigatório em PR para `main` — exatamente um)
- [ ] `release:versão` (MAJOR — breaking)
- [ ] `release:melhoria` (MINOR — feature)
- [ ] `release:hotfix` (PATCH — bugfix)
- [ ] `release:none` (sem bump / sem efeito na imagem)

## Stack de exemplo
- [ ] N/A (sem mudança de env/deploy)
- [ ] Atualizei `deploy/royal-tracking-stack.yml` (+ README/SELF-HOSTED se preciso)

## Test plan
- [ ] `docker compose up -d --build` sobe e login admin funciona
- [ ] `/api/identify` e `/api/event` respondem
- [ ] Painel carrega métricas sem erro de DB
