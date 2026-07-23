# Changelog

All notable changes to Royal Tracking are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.1] - 2026-07-23

### Changed

- fix(meta): messaging_channel=whatsapp for CTWA CAPI (#31)

## [0.9.0] - 2026-07-23

### Changed

- feat: Elementor WA ticket, remove Geo, beta GitHub Releases (#29)

## [0.8.0] - 2026-07-23

### Changed

- feat(tracking): dual PK email/phone, atribuição 30d e WA sem ticket (#27)

## [0.7.0] - 2026-07-23

### Changed

- feat(tracking): CTWA, Google Ads offline, links /r e qualidade WA (#25)

## [Unreleased]

### Added

- CTWA: parse de `referral`/`ctwa_clid`, Lead WhatsApp sem ticket, CAPI `business_messaging`.
- Google Ads: upload de conversões offline / Enhanced Conversions (`UploadClickConversions`) + docs.
- Links first-party `/r/{slug}` (painel Links) com ticket automático no WhatsApp.
- KPIs de qualidade WhatsApp no dashboard; checklist de atribuição; consent CMP via `window.TRCK_CONSENT`.
- Migrations `012_ctwa_and_click_ids`, `013_tracked_links`.

### Changed

- Snippet captura `wbraid`/`gbraid`; lead/identify persistem click IDs; CRM stage fan-out inclui Google Ads.

## [0.6.0] - 2026-07-21

### Changed

- feat(ui): label de versao e canal no rodape da sidebar (#23)

## [0.5.0] - 2026-07-21

### Changed

- feat(pipedrive): OAuth CRM com emit-once por estágio (#21)

## [0.4.2] - 2026-07-20

### Changed

- fix(self-host): harden snippet endpoint and production env guards (#19)

## [0.4.1] - 2026-07-20

### Changed

- fix(snippet): resolve endpoint from script src (#17)

## [0.4.0] - 2026-07-20

### Added

- Integração WhatsApp **RD Conversas (Tallos)** em modo listen-only: webhook manual, sem token de API, mesmo pipeline Lead → Meta/GA4 dos demais providers. (#15)
- URL curta de inbound `POST /api/w/{slug}` para todos os webhooks WhatsApp (RD Conversas, Evolution, UazAPI).
- Identidade GA4 server-managed via cookie `_rt_fpid` (FPID) com install zero-config no snippet.
- `client_id` sintético estável no Measurement Protocol quando `_ga` estiver ausente.
- Migrations `009_visitor_ticket_code` e `010_ga_fpid_identity`.

### Changed

- Tickets WhatsApp passam a usar só a tag fixa `[rt:código]` no final da mensagem (formatos legados removidos).
- Registro/atualização/remoção de webhooks UazAPI por id; ciclo de vida Evolution/UazAPI endurecido.
- Docs de integrações (RD Conversas, Evolution, UazAPI, GA4, snippet) e stack de exemplo alinhadas.

### Fixed

- Leads vindos de webhook WhatsApp passam a persistir `payload_meta` / `response_meta` / `payload_ga4` / `response_ga4` no `events_log` (flags true sem payload nulo).

## [0.3.0] - 2026-07-19

### Changed

- WhatsApp ticket Lead (Evolution/UazAPI) + catálogo por segmentos. (#13)

## [0.2.0] - 2026-07-19

### Changed

- Add Reportar bug link to the sidebar. (#11)

## [0.1.1] — 2026-07-19

### Changed

- Hide RD Conversas and Pipedrive from the integrations UI for a publish-sequence test. (#6)

## [0.1.0] — 2026-07-18

### Added

- Open-source release surface: Docker Hub image `mauriciodantaz/royal-tracking`, Portainer stack template, SemVer labels on PRs (`release:versão` / `melhoria` / `hotfix` / `none`).
- Channels: `beta` → `:beta` + `:X.Y.Z-beta`; `main` → `:X.Y.Z` + `:X.Y.Z-stable` + `:stable` + `:latest` (`latest` = stable).

[0.4.0]: https://github.com/mauriciodantaz/royal-tracking/releases/tag/0.4.0
[0.3.0]: https://github.com/mauriciodantaz/royal-tracking/releases/tag/0.3.0
[0.2.0]: https://github.com/mauriciodantaz/royal-tracking/releases/tag/0.2.0
[0.1.1]: https://github.com/mauriciodantaz/royal-tracking/releases/tag/0.1.1
[0.1.0]: https://github.com/mauriciodantaz/royal-tracking/releases/tag/0.1.0
