# Pipedrive — API token

Conecte o Pipedrive com **API token** (e domínio da company, opcional) para eventos de deals/pessoas.

## Pré-requisitos

- Conta Pipedrive
- Usuário com permissão para ver o API token pessoal
- Company domain Pipedrive (ex.: `minhaempresa` em `minhaempresa.pipedrive.com`)

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno |
| **API token** | Personal API token do Pipedrive |
| **Company domain** | Subdomínio da company (opcional, sem `.pipedrive.com`) |

## Como obter o API token

1. No Pipedrive, clique no avatar → **Preferências pessoais** (Personal preferences).
2. Abra **API**.
3. Copie o **Your personal API token** (ou gere um novo se necessário).
4. Cole em **API token** no Royal Tracking.

## Company domain (opcional)

1. Olhe a URL do Pipedrive: `https://SEUDOMINIO.pipedrive.com`.
2. Cole só `SEUDOMINIO` no campo **Company domain**.

Útil quando a API precisa do host da company além do token.

## Configurar no Royal Tracking

1. **Integrações → Pipedrive**.
2. Preencha Nome, API token e (se souber) o domain.
3. **Adicionar integração**.
4. Configure mapeamentos (`Lead`, `deal.won`, etc.) conforme a fase do módulo.

## Segurança

- O token pessoal herda as permissões do usuário — prefira um usuário com escopo mínimo necessário.
- Se alguém sair da empresa, revogue/regenere o token.

## Links

- [Pipedrive API — Authentication](https://pipedrive.readme.io/docs/core-api-concepts-authentication)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
