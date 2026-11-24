-- Calendario de adviento: tablas y permisos
-- Pégalo entero en Supabase → SQL Editor → New query → Run

create table if not exists ajustes (
  id int primary key default 1,
  data jsonb not null default '{}'
);

create table if not exists regalos (
  id text primary key,
  numero int not null,
  activo boolean not null default false,
  entregado boolean not null default false,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists eventos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  regalo_id text,
  tipo text not null,
  detalle text
);

alter table ajustes enable row level security;
alter table regalos enable row level security;
alter table eventos enable row level security;

-- Ajustes (título, fecha del cumple…): los lee cualquiera, solo tú los cambias
create policy "ajustes: leer" on ajustes for select to anon, authenticated using (true);
create policy "ajustes: admin" on ajustes for all to authenticated using (true) with check (true);

-- Regalos: ella solo descarga los activados o entregados; tú lo ves y cambias todo
create policy "regalos: leer activos" on regalos for select to anon using (activo or entregado);
create policy "regalos: admin" on regalos for all to authenticated using (true) with check (true);

-- Actividad: la web de ella la registra; tú la lees y la puedes borrar
create policy "eventos: registrar" on eventos for insert to anon, authenticated with check (true);
create policy "eventos: leer" on eventos for select to anon, authenticated using (true);
create policy "eventos: borrar" on eventos for delete to authenticated using (true);

grant select on ajustes, regalos, eventos to anon, authenticated;
grant insert on eventos to anon, authenticated;
grant insert, update, delete on ajustes, regalos to authenticated;
grant delete on eventos to authenticated;
