---
name: classify-release
description: >-
  Classifica o tamanho da alteração de um PR como versão (MAJOR), melhoria
  (MINOR), hotfix (PATCH) ou none, e aplica o label release:* correspondente.
  Use ao preparar/revisar PR, perguntar se é versão/melhoria/hotfix, ou antes
  de merge em beta do Royal Tracking (bump SemVer). Promoção beta→main não bumpa.
---

# Classify release (SemVer)

## Quando usar

- Antes de abrir ou mergear um PR
- Usuário pergunta se a mudança é versão, melhoria ou hotfix
- Revisar se o label `release:*` está correto

## Mapeamento

| Classificação | Label | SemVer |
|---------------|-------|--------|
| versão | `release:versão` | MAJOR |
| melhoria | `release:melhoria` | MINOR |
| hotfix | `release:hotfix` | PATCH |
| none | `release:none` | skip |

## Rubrica

1. Ler o diff vs a base do PR (`gh pr diff` ou `git diff origin/beta...HEAD` / `origin/main...HEAD`).
   Label `release:*` é obrigatório quando a base for **`beta`**.
2. Classificar:
   - **versão (MAJOR)**: breaking em API/snippet/webhook, migration incompatível, remoção de env ou comportamento público
   - **melhoria (MINOR)**: feature, integração nova, endpoint novo compatível, UX relevante
   - **hotfix (PATCH)**: bugfix, patch de segurança, typo runtime, regressão
   - **none**: só docs, README, comments, workflow sem efeito na imagem publicada
3. Default se ambíguo: **hotfix**. Nunca major sem breaking explícito.
4. Se o diff toca deploy/env/install → lembrar de rodar também **sync-example-stack**.

## Output (obrigatório)

```markdown
**Label:** release:<tipo>
**SemVer:** MAJOR|MINOR|PATCH|skip
**Justificativa:**
- …
**Risco self-hosters:** baixo|médio|alto — …
**CHANGELOG:** sim|não
```

## Aplicar o label

Se houver PR aberto:

```bash
gh pr edit <N> --remove-label "release:versão" --remove-label "release:melhoria" --remove-label "release:hotfix" --remove-label "release:none"
gh pr edit <N> --add-label "release:<tipo>"
```

(Ignore erros de remove-label se o label não existir no PR.)

Garanta que os labels existam no repo (`gh label list`). Se faltarem:

```bash
gh label create "release:versão" --color B60205 --description "SemVer MAJOR"
gh label create "release:melhoria" --color 0E8A16 --description "SemVer MINOR"
gh label create "release:hotfix" --color 1D76DB --description "SemVer PATCH"
gh label create "release:none" --color C5DEF5 --description "Sem bump / SemVer skip"
```
