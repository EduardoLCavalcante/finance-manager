-- Pluggy can discover cards before the institution provides billing dates.
alter table public.cards
  alter column closing_day drop not null,
  alter column due_day drop not null;
