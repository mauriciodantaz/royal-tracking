---
name: sync-example-stack
description: >-
  Mantém a stack Portainer de exemplo (deploy/royal-tracking-stack.yml) e o
  quickstart do README/SELF-HOSTED alinhados com env, imagem e deploy reais.
  Use em todo PR ou trabalho que altere .env.example, install.sh, Dockerfile,
  variáveis de runtime, Traefik, Postgres ou docs de instalação do Royal Tracking.
---

# Sync example stack

## Fonte da verdade (copy-paste OSS)

`deploy/royal-tracking-stack.yml` (raiz do repo)

Imagem: `mauriciodantaz/royal-tracking` (`:latest` = stable no template; comentar `:beta` / `:X.Y.Z` / `:X.Y.Z-stable`).

Variante avançada (build-on-VPS): `deploy/portainer-stack.yml` — não é o caminho canônico OSS.

## Quando usar

Sempre que o trabalho tocar:

- `.env.example` ou schema de env no boot
- `install.sh`, `Dockerfile`, workflows de publish
- rede Traefik, Postgres, naming `royaltracking_<slug>`
- docs de install (`README.md`, `docs/SELF-HOSTED.md`, `DEPLOY.md`)

## Checklist (mesmo PR da mudança)

1. Diff de `.env.example`, `install.sh`, docs de deploy e `deploy/portainer-stack.yml`.
2. Atualizar `deploy/royal-tracking-stack.yml`:
   - `image:` correta (`mauriciodantaz/royal-tracking:latest` + comentários de tags)
   - `environment:` completo, mesmos nomes/ordem que o produto exige
   - labels Traefik, rede, resources e placeholders (`<SLUG>`, `<DOMAIN>`, `<APEX_DOMAIN>`, etc.)
3. Espelhar quickstart em `README.md` e `docs/SELF-HOSTED.md` se o fluxo de uso mudou (comando de update, nome da imagem, vars novas).
4. Se só a variante build-on-VPS mudou → atualizar `deploy/portainer-stack.yml` e deixar claro no README que o canônico OSS é a stack Hub.
5. Ninguém deve descobrir env nova só lendo o código — YAML + README mostram como usar.

## Output

```markdown
**Stack de exemplo:** sincronizada
**Arquivos:** …
**O que colar/trocar no Portainer:**
- …
```
