-- Origem do evento = plataforma (ingest_path) + cursor estável para paginação.

create index if not exists events_log_created_id_idx
  on events_log (created_at desc, id desc);

-- RD Marketing usa rd_deal_stage_emits com pipeline_external_id = 'mkt'.
update events_log e
set ingest_path = 'rdstation_mkt'
from rd_deal_stage_emits s
where e.event_id = s.event_id
  and e.ingest_path = 'webhook'
  and s.pipeline_external_id = 'mkt';

update events_log e
set ingest_path = 'rdstation_crm'
from rd_deal_stage_emits s
where e.event_id = s.event_id
  and e.ingest_path = 'webhook'
  and s.pipeline_external_id is distinct from 'mkt';

update events_log e
set ingest_path = 'rdstation_crm'
from rd_deal_status_emits s
where e.event_id = s.event_id
  and e.ingest_path = 'webhook';

update events_log e
set ingest_path = 'pipedrive'
from pipedrive_deal_stage_emits s
where e.event_id = s.event_id
  and e.ingest_path = 'webhook';

update events_log e
set ingest_path = 'pipedrive'
from pipedrive_deal_status_emits s
where e.event_id = s.event_id
  and e.ingest_path = 'webhook';

-- WhatsApp / inbound leads (form_leads.source_provider).
update events_log e
set ingest_path = f.source_provider
from form_leads f
where e.event_id = f.event_id
  and e.ingest_path = 'webhook'
  and f.source_provider is not null
  and f.source_provider <> ''
  and f.source_provider <> 'snippet';

-- delivery_log.provider is the dest (meta/ga4); only copy inbound source slugs if present.
update events_log e
set ingest_path = d.provider
from (
  select distinct on (event_id) event_id, provider
  from integration_delivery_log
  where provider in (
    'hotmart',
    'kiwify',
    'eduzz',
    'rdstation_crm',
    'rdstation_mkt',
    'rdstation_conversas',
    'pipedrive',
    'evolution_api',
    'uazapi'
  )
  order by event_id, created_at
) d
where e.event_id = d.event_id
  and e.ingest_path = 'webhook';
