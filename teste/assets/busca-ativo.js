// Página inicial: busca única atrás da lupa — ativo (chave, transformador, poste), município ou alimentador.
// Tocar na lupa abre o campo. Ao digitar, a lista suspensa mostra os municípios e os alimentadores que batem (dados do
// mapa, window.MUN) e, com 3 caracteres ou mais, os ativos cujo código começa assim (dados/ativos-pref/<2 primeiros>.json).
// Escolher um município ou alimentador abre a página dele; escolher um ativo (ou dar Enter) busca no índice
// dados/ativos/<fatia>.json (gerados por scripts/gera_trechos.py), que diz o alimentador e o trecho.
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
  const muns = ((window.MUN || {}).muns || []).filter(m => m.slug);
  muns.forEach(m => (m.als || []).forEach(a => { se[a.cod] = a.se; }));
  const als = Object.keys(se).sort();
  const semAcento = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // lupa: abre e fecha o campo (fechado, só a lupa aparece)
  const lupa = document.getElementById('lupa');
  const abreCampo = sim => {
    if (!lupa) return;
    q.hidden = !sim;
    lupa.setAttribute('aria-expanded', String(sim));
    if (sim) q.focus(); else { q.value = ''; res.innerHTML = ''; fechaSug(); }
  };
  if (lupa) lupa.addEventListener('click', () => abreCampo(q.hidden || !q.value.trim() ? q.hidden : true));
  q.addEventListener('blur', () => setTimeout(() => {
    if (lupa && !form.contains(document.activeElement) && !q.value.trim() && !res.innerHTML) abreCampo(false);
  }, 150));

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
    const txt = q.value.trim(), k = chave(txt), meu = ++pedido, n = semAcento(txt), K = txt.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const ms = n.length >= 2 ? muns.filter(m => m.busca.includes(n)).sort((a, b) => a.busca.indexOf(n) - b.busca.indexOf(n) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 5) : [];
    const as = K.length >= 2 ? als.filter(c => c.includes(K)).sort((a, b) => a.indexOf(K) - b.indexOf(K) || a.localeCompare(b)).slice(0, 5) : [];
    let achados = [];
    if (k.length >= 3) {
      const d = await baixa('ativos-pref/' + k.slice(0, 2));
      if (meu !== pedido) return;                   // já digitaram outra coisa
      if (d) Object.entries(d).forEach(([tipo, lista]) => lista.split(' ').forEach(c => { if (chave(c).startsWith(k)) achados.push([c, tipo]); }));
      achados.sort((a, b) => (chave(b[0]) === k) - (chave(a[0]) === k) || peso(a[1]) - peso(b[1]) || a[0].length - b[0].length || a[0].localeCompare(b[0]));
    }
    if (meu !== pedido) return;
    if (!txt) { fechaSug(); res.innerHTML = ''; return; }
    const at = achados.slice(0, ms.length || as.length ? 8 : 12);
    sug = [...ms.map(m => ({ href: `municipios/${m.slug}/` })), ...as.map(c => ({ href: `alimentadores/${encodeURIComponent(c)}/` })), ...at.map(([c]) => ({ ativo: c }))];
    if (!sug.length) {
      fechaSug();
      res.innerHTML = n.length < 2 ? '' : `<p>Nada encontrado para <b>${esc(txt)}</b>.</p>`;
      return;
    }
    let i = 0;
    const op = (b, sp, cl = '') => `<li class="sug-op" role="option" id="ativo-sug-${i}" data-i="${i++}"><b${cl}>${b}</b><span>${sp}</span></li>`;
    const bloco = (t, itens) => itens.length ? `<li class="sug-t" role="presentation">${t}</li>` + itens.join('') : '';
    res.innerHTML = `<ul class="sug" role="listbox" aria-label="Resultados">` +
      bloco('Municípios', ms.map(m => op(esc(m.nome), `${m.als.length} alimentador${m.als.length > 1 ? 'es' : ''}`, ' class="nome"'))) +
      bloco('Alimentadores', as.map(c => op(esc(c), esc(se[c] || '')))) +
      bloco('Ativos', at.map(([c, tipo]) => op(esc(c), esc(TIPO[tipo] || 'Chave ' + tipo)))) + '</ul>' +
      (achados.length > at.length ? `<p class="sug-mais">e mais ${(achados.length - at.length).toLocaleString('pt-BR')} ativos: continue digitando</p>` : '');
    q.setAttribute('aria-expanded', 'true');
    marca(-1);
  }
  let espera = 0;
  q.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(sugere, 120); });
  q.addEventListener('keydown', e => {
    if (!sug.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter')) return;
    if (e.key === 'Enter') {
      // Enter sem escolher: se só veio município ou alimentador, abre o primeiro; senão busca o ativo digitado
      const i = marcado >= 0 ? marcado : sug.some(o => o.ativo) ? -1 : 0;
      if (i >= 0) { e.preventDefault(); escolhe(i); }
      return;
    }
    e.preventDefault();
    marca(e.key === 'ArrowDown' ? Math.min(sug.length - 1, marcado + 1) : Math.max(0, marcado - 1));
  });
  res.addEventListener('mousedown', e => { if (e.target.closest('.sug-op')) e.preventDefault(); });   // o campo não perde o foco
  res.addEventListener('click', e => { const o = e.target.closest('.sug-op'); if (o) escolhe(+o.dataset.i); });
  function escolhe(i) {
    if (sug[i].href) { location.href = sug[i].href; return; }
    q.value = sug[i].ativo;
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
    if (e.key !== 'Escape') return;
    if (!res.innerHTML) { if (lupa && !q.hidden) { e.preventDefault(); abreCampo(false); lupa.focus(); } return; }
    e.preventDefault();                           // sem isto o Esc também apagaria o texto do campo de busca
    res.innerHTML = '';
    fechaSug();
    q.focus();
  });
  document.addEventListener('pointerdown', e => { if (res.innerHTML && !form.contains(e.target)) { res.innerHTML = ''; fechaSug(); } });
})();
