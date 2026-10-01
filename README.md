# Checkout Ajatmed

Cadastro + pagamento (Asaas) + persistência (Supabase), em Node.js + Express + EJS.

## Rodar

```bash
npm install
cp .env.example .env   # preencha as chaves
npm start
```

Acesse http://localhost:3000

## Fluxo

1. Usuário preenche o cadastro (dados básicos, endereço com busca de CEP via ViaCEP, contato, senha, foto PNG/JPG até 2MB, dependentes e pets opcionais).
2. `POST /submit` valida, faz upload da foto no bucket `fotos-beneficiarios`, insere na tabela `cadastros` (Supabase) com status `aguardando_pagamento`.
3. Cria cliente + cobrança no **Asaas** (Pix/cartão/boleto) e redireciona para o `invoiceUrl`.
4. `POST /webhooks/asaas` atualiza o status para `pago`/`vencido` (configure o webhook no painel Asaas).
5. Equipe faz o cadastro manual no sistema de telemedicina em até **48h** após o pagamento.

## Supabase — SQL

```sql
create table cadastros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  nome_completo text not null,
  cpf text not null,
  rg text,  -- opcional; muitos beneficiários não têm RG hoje em dia
  data_nascimento date not null,
  sexo text not null,
  cep text not null,
  rua text not null,
  numero text not null,
  complemento text,
  bairro text not null,
  cidade text not null,
  estado text not null,
  telefone text not null,
  email text not null,
  senha_hash text,
  foto_url text,
  dependentes jsonb default '[]',
  pets jsonb default '[]',
  status text default 'aguardando_pagamento',
  asaas_customer_id text,
  asaas_payment_id text unique,
  asaas_payment_url text,
  asaas_event text
);
```

Crie o bucket público `fotos-beneficiarios` (Storage) para as fotos.
