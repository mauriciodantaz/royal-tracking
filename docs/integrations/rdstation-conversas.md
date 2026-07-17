# RD Conversas — API token

Conecte o RD Station Conversas com um **API token** (integração por token; não usa o fluxo OAuth do CRM/Marketing neste módulo).

## Pré-requisitos

- Conta RD Station Conversas
- Permissão para criar/ver tokens de API no painel Conversas
- Stack Royal Tracking atualizada

## Campos no Royal Tracking

| Campo | O que é |
|---|---|
| **Nome** | Rótulo interno (ex.: “Conversas Royal”) |
| **API token** | Token de autenticação da API Conversas |

## Como obter o API token

1. Acesse o painel do **RD Station Conversas**.
2. Abra **Configurações** / **Integrações** / **API** (o caminho exato varia conforme a versão do produto).
3. Crie ou copie um **token de API** com permissões de leitura dos recursos que você pretende sincronizar (conversas, contatos, etc.).
4. Cole no campo **API token** do Royal Tracking.

> Trate o token como senha. Não compartilhe em tickets ou prints.

## Configurar no Royal Tracking

1. **Integrações → RD Conversas**.
2. Preencha Nome e API token.
3. **Adicionar integração**.
4. Configure mapeamentos de eventos (`Lead`, `Message`, etc.) quando o módulo estiver ativo na sua fase.

## Notas

- RD Station **CRM** e **Marketing** neste hub usam **OAuth** (CLIENT_ID/SECRET no Portainer) — não este formulário.
- Se o token for revogado no RD, a conexão deixa de funcionar até você colar um novo.

## Links

- Documentação da API RD Conversas (portal do desenvolvedor RD Station)
- [INTEGRATIONS.md](../INTEGRATIONS.md)
