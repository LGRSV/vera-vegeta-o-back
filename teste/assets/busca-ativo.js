// Página inicial: em que alimentador e trecho está uma chave ou um poste.
// O índice fica em dados/ativos/<fatia>.json (gerado por scripts/gera_trechos.py); baixa só o pedaço do código buscado.
(function () {
  const form = document.getElementById('ativo');
  if (!form) return;
  const q = document.getElementById('ativo-q'), res = document.getElementById('ativo-res');
  const mapa = document.querySelector('.mt-mapa');       // em cima do mapa do Tocantins (coluna do meio no computador)
  if (mapa) { mapa.prepend(form); form.classList.add('no-mapa'); }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { DJ: 'Disjuntor', '79': 'Religador', '03': 'Fusível 03', '33': 'Fusível 33', '02': 'Chave 02', '88': 'Chave faca 88',
    '40': 'Trip saver 40', '41': 'Trip saver 41', SEC: 'Fusível (seccionamento)', FTR: 'Fusível no tronco', poste: 'Poste' };
  const se = {};                                  // alimentador → subestação (dados do mapa da página inicial)
  ((window.MUN || {}).muns || []).forEach(m => (m.als || []).forEach(a => { se[a.cod] = a.se; }));
  const css = document.createElement('style');
  css.textContent = '.ativo{display:grid;gap:8px;padding:14px 16px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}' +
    '.ativo label{font-size:14px;color:var(--muted)}.ativo label b{display:block;font-size:16px;color:var(--fg)}' +
    '.ativo>div:first-of-type{display:flex;gap:8px;flex-wrap:wrap}.ativo .busca{flex:1 1 220px}' +
    '.ativo button{font:inherit;font-weight:600;padding:8px 16px;border:0;border-radius:6px;background:var(--accent);color:#fff;cursor:pointer}' +
    '.ativo button:focus-visible{outline:2px solid var(--fg);outline-offset:2px}#ativo-res{display:grid;gap:8px}#ativo-res:empty{display:none}' +
    '#ativo-res p{font-size:14px}.ativo.no-mapa{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:4px 4px 12px;margin-bottom:8px;' +
    'text-align:center;justify-items:center}.ativo.no-mapa>div:first-of-type{justify-content:center;width:100%;max-width:560px}' +
    '.ativo.no-mapa #ativo-res{justify-self:stretch;text-align:left}' +
    '.ativo.no-mapa .grade{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}';
  document.head.append(css);

  const chave = s => { const k = String(s).toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^\d+$/.test(k) ? (k.replace(/^0+/, '') || '0') : k; };
  const fatia = k => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) >>> 0; return (h % 256).toString(16).padStart(2, '0'); };
  const cache = {};
  const baixa = f => cache[f] || (cache[f] = fetch(`dados/ativos/${f}.json`).then(r => r.ok ? r.json() : {}).catch(() => { delete cache[f]; return null; }));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const txt = q.value.trim(), k = chave(txt);
    if (!k) { res.innerHTML = ''; return; }
    res.innerHTML = '<p>Buscando…</p>';
    const d = await baixa(fatia(k));
    if (d === null) { res.innerHTML = '<p>Não foi possível carregar o índice. Confira a internet e tente de novo.</p>'; return; }
    const hits = d[k] || [];
    if (!hits.length) {
      res.innerHTML = `<p><b>${esc(txt)}</b> não foi encontrado. Confira o código: a busca é pelo código completo da chave ou pelo ` +
        'número do poste. Transformadores e postes sem número no cadastro ainda não entram.</p>';
      return;
    }
    res.innerHTML = `<p>${hits.length === 1 ? '1 resultado' : hits.length + ' resultados'} para <b>${esc(txt)}</b>:</p><div class="grade">` +
      hits.map(([al, tipo, t, papel, lat, lon]) =>
        `<a class="card" href="alimentadores/${encodeURIComponent(al)}/?t=${encodeURIComponent(t)}&a=${encodeURIComponent(txt)}&ll=${lat},${lon}">` +
        `<b>${esc(t)} · ${esc(al)}</b><span>${esc(TIPO[tipo] || 'Chave ' + tipo)} ${esc(txt)}${se[al] ? ' · ' + esc(se[al]) : ''}</span>` +
        `<span>${tipo === 'poste' ? (papel ? 'Trechos ' + esc(papel) : 'Trecho ' + esc(t)) : esc(papel[0] ? papel[0].toUpperCase() + papel.slice(1) : '')}</span>` +
        '<span>Abrir no mapa →</span></a>').join('') + '</div>';
  });
})();
