const $ = (id) => document.getElementById(id);
const digits = (s) => (s || '').replace(/\D/g, '');

// ---------- Máscaras ----------
$('cpf').addEventListener('input', (e) => {
  let v = digits(e.target.value).slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  e.target.value = v;
});
$('cep').addEventListener('input', (e) => {
  let v = digits(e.target.value).slice(0, 8);
  if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  e.target.value = v;
  if (v.replace('-', '').length === 8) buscaCep(v);
});
$('telefone').addEventListener('input', (e) => {
  let v = digits(e.target.value).slice(0, 11);
  if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,5})/, '($1) $2');
  e.target.value = v;
});

// ---------- CEP -> ViaCEP ----------
async function buscaCep(cep) {
  const wrap = $('cepWrap');
  const status = $('cepStatus');
  try {
    wrap.classList.add('loading');
    status.classList.add('show');
    $('cepHint').textContent = 'Buscando endereço…';
    const r = await fetch('https://viacep.com.br/ws/' + digits(cep) + '/json/');
    const d = await r.json();
    if (d.erro) {
      $('cepHint').textContent = 'CEP não encontrado. Preencha manualmente.';
      return;
    }
    $('rua').value = d.logradouro || '';
    $('bairro').value = d.bairro || '';
    $('cidade').value = d.localidade || '';
    $('estado').value = d.uf || '';
    $('cepHint').textContent = 'Endereço preenchido automaticamente. Confira o número.';
    $('numero').focus({ preventScroll: true });
  } catch {
    $('cepHint').textContent = 'Não foi possível buscar o CEP. Preencha manualmente.';
  } finally {
    wrap.classList.remove('loading');
    status.classList.remove('show');
  }
}

// ---------- Foto ----------
$('foto').addEventListener('change', (e) => {
  const file = e.target.files[0];
  $('fotoErr').classList.remove('show');
  $('preview').style.display = 'none';
  if (!file) return;
  const ok = ['image/png', 'image/jpeg'].includes(file.type) && file.size <= 2 * 1024 * 1024;
  if (!ok) { $('fotoErr').classList.add('show'); e.target.value = ''; return; }
  const url = URL.createObjectURL(file);
  $('preview').src = url;
  $('preview').style.display = 'block';
});

// ---------- Dependentes / Pets dinâmicos ----------
function depBlock() {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <div class="grid">
      <div class="field span-6"><label>Nome do dependente</label><input data-k="nome" placeholder="Nome completo"></div>
      <div class="field span-6"><label>Parentesco</label><input data-k="parentesco" placeholder="Filho(a), cônjuge…"></div>
      <div class="field span-6"><label>Data de nascimento</label><input type="date" data-k="nascimento"></div>
      <div class="field span-6"><label>CPF (opcional)</label><input data-k="cpf" class="mono" placeholder="000.000.000-00"></div>
    </div>
    <button type="button" class="btn btn-danger">Remover</button>`;
  div.querySelector('.btn-danger').onclick = () => { div.remove(); updateSummary(); };
  return div;
}
function petBlock() {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <div class="grid">
      <div class="field span-6"><label>Nome do pet</label><input data-k="nome" placeholder="Ex.: Thor"></div>
      <div class="field span-6"><label>Espécie</label><input data-k="especie" placeholder="Cão, gato…"></div>
    </div>
    <button type="button" class="btn btn-danger">Remover</button>`;
  div.querySelector('.btn-danger').onclick = () => div.remove();
  return div;
}
$('addDep').onclick = () => { $('deps').appendChild(depBlock()); updateSummary(); };
$('addPet').onclick = () => $('pets').appendChild(petBlock());

function updateSummary() {
  const count = collect('deps').length;
  const base = Number('<%= typeof planValue !== "undefined" ? planValue : 59.77 %>');
  const total = base + count * 10.00;
  const depLine = $('depLine');
  const depCount = $('depCount');
  const depTotal = $('depTotal');
  const summaryTotal = $('summaryTotal');
  if (depLine && depCount && depTotal && summaryTotal) {
    depLine.style.display = count > 0 ? 'flex' : 'none';
    depCount.textContent = count;
    depTotal.textContent = 'R$ ' + (count * 10.00).toFixed(2).replace('.', ',');
    summaryTotal.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
  }
}

function collect(containerId) {
  return [...document.querySelectorAll('#' + containerId + ' .item')].map((el) => {
    const o = {};
    el.querySelectorAll('[data-k]').forEach((i) => { o[i.dataset.k] = i.value; });
    return o;
  }).filter((o) => Object.values(o).some(Boolean));
}

// ---------- Stepper ----------
const panels = [...document.querySelectorAll('.step-panel')];
const steps = [...document.querySelectorAll('.stepper li')];
const stepDots = steps.map((s) => s.querySelector('.step-dot'));
let current = 0;

function markInvalid(el, bad) {
  if (!el) return;
  el.classList.toggle('field-error', bad);
  el.setAttribute('aria-invalid', bad ? 'true' : 'false');
  if (bad) {
    el.classList.remove('animate-shake');
    void el.offsetWidth;
    el.classList.add('animate-shake');
  }
}

function requiredOk(ids) {
  let ok = true;
  ids.forEach((id) => {
    const el = $(id);
    const bad = !el || !String(el.value || '').trim();
    markInvalid(el, bad);
    if (bad) ok = false;
  });
  return ok;
}

function cpfOk() {
  const cpf = digits($('cpf').value);
  const valid = cpf.length === 11 && !/^(\d)\1+$/.test(cpf);
  $('cpfErr').classList.toggle('show', !valid);
  markInvalid($('cpf'), !valid);
  return valid;
}

function senhaOk() {
  const valid = $('senha').value.length >= 6 && $('senha').value === $('confirmarSenha').value;
  $('senhaErr').classList.toggle('show', !valid);
  markInvalid($('senha'), !valid);
  markInvalid($('confirmarSenha'), !valid);
  return valid;
}

function emailOk() {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim());
  markInvalid($('email'), !valid);
  return valid;
}

function resetStep(i) {
  panels[i].querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
  panels[i].querySelectorAll('.err.show').forEach((el) => el.classList.remove('show'));
}

function validateStep(i) {
  resetStep(i);
  if (i === 0) {
    let ok = requiredOk(['nomeCompleto', 'dataNascimento', 'sexo', 'senha', 'confirmarSenha']);
    if (!cpfOk()) ok = false;
    if (!senhaOk()) ok = false;
    return ok;
  }
  if (i === 1) {
    let ok = requiredOk(['cep', 'rua', 'numero', 'bairro', 'cidade', 'estado', 'telefone', 'email']);
    if (digits($('cep').value).length !== 8) { markInvalid($('cep'), true); ok = false; }
    if (digits($('telefone').value).length < 10) { markInvalid($('telefone'), true); ok = false; }
    if (!emailOk()) ok = false;
    return ok;
  }
  return true;
}

function showStep(i) {
  current = i;
  panels.forEach((p, k) => { p.hidden = k !== i; });
  steps.forEach((s, k) => {
    s.classList.toggle('active', k === i);
    s.classList.toggle('done', k < i);
    s.setAttribute('aria-current', k === i ? 'step' : 'false');
    if (stepDots[k]) stepDots[k].innerHTML = k < i
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : String(k + 1);
  });
  if (i === 3) buildReview();
  panels[i].querySelector('input, select')?.focus({ preventScroll: true });
  document.getElementById('formCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('[data-next]').forEach((b) => {
  b.addEventListener('click', () => {
    if (validateStep(current)) showStep(Math.min(current + 1, panels.length - 1));
    else panels[current].querySelector('.field-error')?.focus();
  });
});
document.querySelectorAll('[data-prev]').forEach((b) => {
  b.addEventListener('click', () => showStep(Math.max(current - 1, 0)));
});

function reviewVal(id) {
  const el = $(id);
  return String(el?.value || '').trim() || '—';
}

function buildReview() {
  const rows = [
    ['Nome', reviewVal('nomeCompleto')],
    ['CPF', reviewVal('cpf')],
    ['Nascimento', reviewVal('dataNascimento')],
    ['E-mail', reviewVal('email')],
    ['Telefone', reviewVal('telefone')],
    ['Endereço', `${reviewVal('rua')}, ${reviewVal('numero')} — ${reviewVal('bairro')}, ${reviewVal('cidade')}/${reviewVal('estado')} · CEP ${reviewVal('cep')}`],
    ['Foto', $('foto').files.length ? $('foto').files[0].name : 'Não enviada (opcional)'],
    ['Dependentes', String(collect('deps').length)],
    ['Pets', String(collect('pets').length)],
  ];
  $('reviewList').innerHTML = rows.map(([k]) => '<div><dt></dt><dd></dd></div>').join('');
  [...$('reviewList').children].forEach((row, i) => {
    row.children[0].textContent = rows[i][0];
    row.children[1].textContent = rows[i][1];
  });
}

// ---------- Validação final ----------
$('form').addEventListener('submit', (e) => {
  const okStep0 = validateStep(0);
  const okStep1 = validateStep(1);
  const ok = okStep0 && okStep1;

  $('dependentesJson').value = JSON.stringify(collect('deps'));
  $('petsJson').value = JSON.stringify(collect('pets'));

  if (!ok) {
    e.preventDefault();
    showStep(!okStep0 ? 0 : 1);
    return;
  }
  const btn = e.target.querySelector('[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = 'Enviando…';
  }
});

showStep(0);
