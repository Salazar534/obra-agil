alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('card', 'pix', 'boleto', 'pec', 'account_money'));
