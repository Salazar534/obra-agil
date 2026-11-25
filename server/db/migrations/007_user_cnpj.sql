-- A customer can be a person (CPF) or a company (CNPJ). The CPF column stays for card payments.

alter table users
  add column cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$');

alter table businesses
  add column legal_name text;
