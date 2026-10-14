// Página inicial: em que alimentador e trecho está uma chave, um transformador ou um poste.
// Ao digitar (3 caracteres ou mais), a lista suspensa mostra os ativos cujo código começa assim (dados/ativos-pref/<2
// primeiros>.json); escolher um (clique, setas + Enter) ou dar Enter busca no índice dados/ativos/<fatia>.json (gerados por
// scripts/gera_trechos.py), que diz o alimentador e o trecho. Baixa só os pedaços do que se digita.
// A lista e o resultado abrem presos ao campo (não empurram o mapa); fecham com Esc ou clicando fora.
// O formulário já vem no HTML dentro da barra em cima do mapa (.mt-barra) e o estilo está em assets/site.css:
// nada muda de lugar nem de cara quando este script carrega.
(function () {
  const form = document.getElementById('ativo');
  if (!form) return;
  const q = document.getElementById('ativo-q'), res = document.getElementById('ativo-res');
  const barra = document.querySelector('.mt-barra');     // página de versão antiga, com o formulário fora da barra
  if (barra && !barra.contains(form)) barra.prepend(form);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { DJ: 'Disjuntor', '79': 'Religador', '03': 'Fusível 03', '33': 'Fusível 33', '02': 'Chave 02', '88': 'Chave faca 88',
    '40': 'Trip saver 40', '41': 'Trip saver 41', SEC: 'Fusível (seccionamento)', FTR: 'Fusível no tronco', poste: 'Poste',
    TR: 'Transformador', ET: 'Transformador', EP: 'Transformador particular', Capacitor: 'Banco de capacitor', Regulador: 'Regulador de tensão',
    Chave: 'Chave', ChaveNA: 'Chave NA' };
  const se = {};                                  // alimentador → subestação (dados do mapa da página inicial)
  ((window.MUN || {}).muns || []).forEach(m => (m.als || []).forEach(a => { se[a.cod] = a.se; }));

  const chave = s => { const k = String(s).toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^\d+$/.test(k) ? (k.replace(/^0+/, '') || '0') : k; };
  const fatia = k => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) >>> 0; return (h % 256).toString(16).padStart(2, '0'); };
  const cache = {};
  const baixa = f => cache[f] || (cache[f] = fetch(`dados/${f}.json`).then(r => r.ok ? r.json() : {}).catch(() => { delete cache[f]; return null; }));

  // ---------- lista suspensa: ativos que começam com o que se digita ----------
  const ORDEM = ['DJ', '79', '03', '33', '02', '40', '41', 'SEC', 'FTR', '88', 'TR', 'ET', 'EP', 'poste'];
  const peso = t => { const i = ORDEM.indexOf(t); return i < 0 ? ORDEM.length - 1.5 : i; };
  let sug = [], marcado = -1, pedido = 0;
  q.setAttribute('role', 'combobox');
  q.setAttribute('aria-autocomplete', 'list');
  q.setAttribute('aria-controls', 'ativo-res');
  q.setAttribute('aria-expanded', 'false');
  const fechaSug = () => { sug = []; marcado = -1; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); };
  const marca = i => {
    marcado = i;
    res.querySelectorAll('.sug-op').forEach((o, k) => o.classList.toggle('marcado', k === i));
    const o = res.querySelector(`#ativo-sug-${i}`);
    if (o) { q.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
  };
  async function sugere() {
    const txt = q.value.trim(), k = chave(txt), meu = ++pedido;
    if (k.length < 3) { fechaSug(); res.innerHTML = ''; return; }
    const d = await baixa('ativos-pref/' + k.slice(0, 2));
    if (meu !== pedido) return;                     // já digitaram outra coisa
    if (d === null) { fechaSug(); res.innerHTML = '<p>Não foi possível carregar a lista. Confira a internet e tente de novo.</p>'; return; }
    const achados = [];
    Object.entries(d).forEach(([tipo, lista]) => lista.split(' ').forEach(n => { if (chave(n).startsWith(k)) achados.push([n, tipo]); }));
    achados.sort((a, b) => (chave(b[0]) === k) - (chave(a[0]) === k) || peso(a[1]) - peso(b[1]) || a[0].length - b[0].length || a[0].localeCompare(b[0]));
    sug = achados.slice(0, 12);
    if (!sug.length) { fechaSug(); res.innerHTML = `<p>Nenhum ativo começa com <b>${esc(txt)}</b>.</p>`; return; }
    res.innerHTML = `<ul class="sug" role="listbox" aria-label="Ativos">${sug.map(([n, tipo], i) =>
      `<li class="sug-op" role="option" id="ativo-sug-${i}" data-i="${i}"><b>${esc(n)}</b><span>${esc(TIPO[tipo] || 'Chave ' + tipo)}</span></li>`).join('')}</ul>` +
      (achados.length > sug.length ? `<p class="sug-mais">e mais ${(achados.length - sug.length).toLocaleString('pt-BR')}: continue digitando</p>` : '');
    q.setAttribute('aria-expanded', 'true');
    marca(-1);
  }
  let espera = 0;
  q.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(sugere, 120); });
  q.addEventListener('keydown', e => {
    if (!sug.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter')) return;
    if (e.key === 'Enter') { if (marcado >= 0) { e.preventDefault(); escolhe(marcado); } return; }
    e.preventDefault();
    marca(e.key === 'ArrowDown' ? Math.min(sug.length - 1, marcado + 1) : Math.max(0, marcado - 1));
  });
  res.addEventListener('mousedown', e => { if (e.target.closest('.sug-op')) e.preventDefault(); });   // o campo não perde o foco
  res.addEventListener('click', e => { const o = e.target.closest('.sug-op'); if (o) escolhe(+o.dataset.i); });
  function escolhe(i) {
    q.value = sug[i][0];
    fechaSug();
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearTimeout(espera); pedido++; fechaSug();
    const txt = q.value.trim(), k = chave(txt);
    if (!k) { res.innerHTML = ''; return; }
    res.innerHTML = '<p>Buscando…</p>';
    const d = await baixa('ativos/' + fatia(k));
    if (d === null) { res.innerHTML = '<p>Não foi possível carregar o índice. Confira a internet e tente de novo.</p>'; return; }
    const hits = d[k] || [];
    if (!hits.length) {
      res.innerHTML = `<p><b>${esc(txt)}</b> não foi encontrado. Confira o código: a busca é pelo código completo da chave, do transformador ` +
        'ou pelo número do poste. Postes sem número no cadastro não entram.</p>';
      return;
    }
    res.innerHTML = `<p>${hits.length === 1 ? '1 resultado' : hits.length + ' resultados'} para <b>${esc(txt)}</b>:</p><ul>` +
      hits.map(([al, tipo, t, papel, lat, lon]) => {
        const onde = tipo === 'poste' ? (papel ? 'Trechos ' + esc(papel) : 'Trecho ' + esc(t)) : esc(papel[0] ? papel[0].toUpperCase() + papel.slice(1) : '');
        return `<li><a href="alimentadores/${encodeURIComponent(al)}/?${t ? 't=' + encodeURIComponent(t) + '&' : ''}a=${encodeURIComponent(txt)}&ll=${lat},${lon}">` +
          `<b>${t ? esc(t) + ' · ' : ''}${esc(al)}</b><span>${esc(TIPO[tipo] || 'Chave ' + tipo)} ${esc(txt)}${se[al] ? ' · ' + esc(se[al]) : ''}</span>` +
          (onde ? `<span>${onde}</span>` : '') + '<span class="ir">Abrir no mapa →</span></a></li>';
      }).join('') + '</ul>';
  });
  // fecha a lista: Esc (no campo ou na lista; o foco volta ao campo) ou clique fora do formulário
  form.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !res.innerHTML) return;
    e.preventDefault();                           // sem isto o Esc também apagaria o texto do campo de busca
    res.innerHTML = '';
    fechaSug();
    q.focus();
  });
  document.addEventListener('pointerdown', e => { if (res.innerHTML && !form.contains(e.target)) { res.innerHTML = ''; fechaSug(); } });
})();
