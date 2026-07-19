## Summary
-

## Canal
- [ ] `beta` (publica `:beta`, sem SemVer)
- [ ] `main` (bump SemVer + `:latest`)

## Release label (obrigatório — exatamente um)
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
