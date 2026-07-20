-- Short public code for WhatsApp ticket lines (prettier than full trck_user_id).
alter table visitors
  add column if not exists ticket_code text;

create unique index if not exists visitors_ticket_code_uidx
  on visitors (ticket_code)
  where ticket_code is not null;
