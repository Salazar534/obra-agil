-- Optional identity for a storefront. A CNPJ is not required to publish.

alter table businesses
  add column person_type text not null default 'pf' check (person_type in ('pf', 'pj'));

alter table businesses
  add column document text check (document is null or document ~ '^[0-9]{11}$' or document ~ '^[0-9]{14}$');
