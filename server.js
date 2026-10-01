require('dotenv').config();
const express = require('express');
const path = require('path');
const fileUpload = require('express-fileupload');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Supabase ----
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ---- Asaas ----
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';
const ASAAS_BASE_URL = (process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3').replace(/\/$/, '');

async function asaasRequest(endpoint, method, body) {
  const res = await fetch(`${ASAAS_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.errors?.[0]?.description || 'Erro na API Asaas');
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 },
  abortOnLimit: true,
  useTempFiles: false,
}));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  const planRaw = Number(process.env.PLAN_VALUE || 59.77);
  const planValueFmt = planRaw.toFixed(2).replace('.', ',');
  res.render('checkout', {
    asaasCheckoutUrl: process.env.ASAAS_CHECKOUT_URL || '',
    planValue: planRaw,
    planValueFmt,
    planName: process.env.PLAN_NAME || 'Plano Individual AjatMed',
    whatsappUrl: process.env.WHATSAPP_SUPPORT_URL
      || 'https://wa.me/5511999999999?text=Ol%C3%A1%2C%20gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20o%20Plano%20AjatMed',
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Recebe o cadastro, salva no Supabase e cria link/cobranca no Asaas
app.post('/submit', async (req, res) => {
  try {
    const f = req.body || {};

    if (!f.nomeCompleto || !f.cpf || !f.email || !f.senha) {
      return res.status(400).send('Preencha os campos obrigatórios.');
    }
    if ((f.senha || '').length < 6 || f.senha !== f.confirmarSenha) {
      return res.status(400).send('Senha inválida: mínimo 6 caracteres e confirmação igual.');
    }

    const dependentes = parseJsonArray(f.dependentesJson);
    const pets = parseJsonArray(f.petsJson);

    // Upload da foto
    let fotoUrl = null;
    const foto = req.files && req.files.fotoBeneficiario;
    if (foto && foto.name) {
      const okType = ['image/png', 'image/jpeg', 'image/jpg'].includes(foto.mimetype);
      const okExt = /\.(png|jpe?g)$/i.test(foto.name);
      if (!okType && !okExt) return res.status(400).send('Foto deve ser PNG ou JPG.');
      if (foto.size > 2 * 1024 * 1024) return res.status(400).send('Foto deve ter até 2MB.');

      if (!supabase) return res.status(500).send('Supabase não configurado (SUPABASE_URL / SUPABASE_ANON_KEY).');

      const ext = foto.name.split('.').pop().toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('fotos-beneficiarios')
        .upload(fileName, foto.data, { contentType: foto.mimetype, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('fotos-beneficiarios').getPublicUrl(fileName);
      fotoUrl = pub.publicUrl;
    }

    // Salva no Supabase
    let cadastroId = null;
    if (supabase) {
      const { data, error } = await supabase.from('cadastros').insert([{
        nome_completo: f.nomeCompleto,
        cpf: onlyDigits(f.cpf),
        rg: f.rg,
        data_nascimento: f.dataNascimento,
        sexo: f.sexo,
        cep: onlyDigits(f.cep),
        rua: f.rua,
        numero: f.numero,
        complemento: f.complemento || null,
        bairro: f.bairro,
        cidade: f.cidade,
        estado: f.estado,
        telefone: f.telefone,
        email: f.email,
        senha_hash: null, // senha tratada via hash em produção; nunca salve em texto
        foto_url: fotoUrl,
        dependentes,
        pets,
        status: 'aguardando_pagamento',
      }]).select('id').single();
      if (error) throw error;
      cadastroId = data && data.id;
    }

    // Cria cliente + cobrança no Asaas
    let paymentUrl = process.env.ASAAS_CHECKOUT_URL || null;
    if (ASAAS_API_KEY) {
      const customer = await asaasRequest('/customers', 'POST', {
        name: f.nomeCompleto,
        email: f.email,
        phone: onlyDigits(f.telefone),
        cpfCnpj: onlyDigits(f.cpf),
        postalCode: onlyDigits(f.cep),
        address: f.rua,
        addressNumber: f.numero,
        complement: f.complemento || undefined,
        province: f.bairro,
        city: convertIbgeCity(f.cidade),
        state: f.estado,
        externalReference: cadastroId ? String(cadastroId) : undefined,
      });

      const dueDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const payment = await asaasRequest('/payments', 'POST', {
        customer: customer.id,
        billingType: 'UNDEFINED', // cliente escolhe (pix/cartão/boleto) no checkout do Asaas
        value: Number(process.env.PLAN_VALUE || 49.9),
        dueDate,
        description: `Ajatmed - Adesão ${f.nomeCompleto}`,
        externalReference: cadastroId ? String(cadastroId) : undefined,
      });

      paymentUrl = payment.invoiceUrl || paymentUrl;

      if (supabase && cadastroId) {
        await supabase.from('cadastros').update({
          asaas_customer_id: customer.id,
          asaas_payment_id: payment.id,
          asaas_payment_url: paymentUrl,
          status: 'aguardando_pagamento',
        }).eq('id', cadastroId);
      }
    }

    res.render('success', { nome: f.nomeCompleto, email: f.email, paymentUrl });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).send('Erro ao processar cadastro. Tente novamente.');
  }
});

// Webhook do Asaas (configure a URL no painel Asaas apontando para /webhooks/asaas)
app.post('/webhooks/asaas', express.json(), async (req, res) => {
  try {
    const event = req.body?.event;
    const payment = req.body?.payment || {};
    if (supabase && payment.id) {
      const status = mapAsaasStatus(event, payment.status);
      if (status) {
        await supabase.from('cadastros')
          .update({ status, asaas_event: event })
          .eq('asaas_payment_id', payment.id);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook Asaas:', err);
    res.status(500).json({ received: false });
  }
});

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

function parseJsonArray(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function convertIbgeCity(v) { return v; } // ViaCEP já retorna o nome; Asaas aceita nome da cidade

function mapAsaasStatus(event, paymentStatus) {
  if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED' || event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') return 'pago';
  if (paymentStatus === 'OVERDUE' || event === 'PAYMENT_OVERDUE') return 'vencido';
  return null;
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Checkout Ajatmed rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
