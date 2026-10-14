// Página inicial: em que alimentador e trecho está uma chave ou um poste.
// O índice fica em dados/ativos/<fatia>.json (gerado por scripts/gera_trechos.py); baixa só o pedaço do código buscado.
// O resultado abre numa lista suspensa presa ao campo (não empurra o mapa); fecha com Esc ou clicando fora.
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
    q.focus();
  });
  document.addEventListener('pointerdown', e => { if (res.innerHTML && !form.contains(e.target)) res.innerHTML = ''; });
})();
