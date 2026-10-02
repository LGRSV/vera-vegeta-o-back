// Acréscimos da página do alimentador no site por município (roda depois de alimentador.js, com window.D):
// caminho Município → Alimentador → Trecho, filtros por classe e município, resumo por classe, avisos, origem e KMZ.
(function () {
  const M = D.meta || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
  const muns = M.municipios || [];
  const mun = muns.find(x => x.slug === new URLSearchParams(location.search).get('m'));
  const css = document.createElement('style');
  css.textContent = '.migalhas{font-size:14px;margin-bottom:6px}.migalhas a{color:inherit}.filtros{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}' +
    '.filtros label{font-size:13px}.filtros select{font:inherit;max-width:100%}.aviso-dados{border-left:3px solid var(--alerta,#b91c1c);padding:6px 10px;margin:8px 0;font-size:13px}' +
    '.resumo-classe{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0}.resumo-classe td,.resumo-classe th{padding:2px 6px;text-align:left;border-bottom:1px solid var(--line,#ddd)}' +
    '.origem{font-size:12px;opacity:.8}';
  document.head.append(css);

  // caminho e volta para o município
  const nav = document.createElement('nav');
  nav.className = 'migalhas';
  nav.setAttribute('aria-label', 'Caminho');
  nav.innerHTML = '<a href="../../">Municípios</a> → ' +
    (mun ? `<a href="../../municipios/${esc(mun.slug)}/">${esc(mun.nome)}</a> → ` : '') +
    `<b>${esc(M.al)}</b><span id="mig-trecho"></span>`;
  document.querySelector('header').prepend(nav);

  // filtros por classe e município (a lista é refeita a cada busca: o filtro é reaplicado)
  const lista = document.getElementById('lista');
  const f = document.createElement('div');
  f.className = 'filtros';
  f.innerHTML = '<label>Classe <select id="f-classe"><option value="">Todas</option><option>T1</option><option>T2</option><option>T3</option></select></label>' +
    (muns.length > 1 ? `<label>Município <select id="f-mun"><option value="">Todos</option>${muns.map(x =>
      `<option value="${esc(x.cod)}"${mun && x.cod === mun.cod ? ' selected' : ''}>${esc(x.nome)} (${km(x.m)})</option>`).join('')}</select></label>` : '');
  document.getElementById('busca').after(f);
  const tm = M.trecho_mun || {};
  function aplica() {
    const c = document.getElementById('f-classe').value, fm = (document.getElementById('f-mun') || {}).value || '';
    lista.querySelectorAll('.row').forEach(r => {
      const t = r.dataset.t;
      r.hidden = !((!c || t.split('-')[0] === c) && (!fm || (tm[t] || []).includes(fm)));
    });
  }
  f.addEventListener('change', aplica);
  new MutationObserver(ms => {
    if (ms.some(m => m.type === 'childList')) aplica();
    const s = lista.querySelector('.row[aria-current="true"]');
    document.getElementById('mig-trecho').textContent = s ? ' → ' + s.dataset.t : '';
  }).observe(lista, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  aplica();

  // NAE só de vegetação: deixa isso escrito no seletor de mês
  const labMes = document.querySelector('label[for="mes"]');
  if (labMes && (M.origem || {}).nae_filtro === 'arvore') labMes.firstChild.textContent = 'NAE árvore/eucalipto em ';

  // resumo por classe, avisos de dados e origem
  const r = M.resumo || {};
  const v = M.validacao || { avisos: [] };
  const box = document.createElement('section');
  box.innerHTML = `<table class="resumo-classe"><tr><th>Classe</th><th>Trechos</th><th>Extensão</th></tr>` +
    ['T1', 'T2', 'T3'].map(k => `<tr><td>${k}</td><td>${(r[k] || {}).n ?? 0}</td><td>${km((r[k] || {}).m || 0)}</td></tr>`).join('') +
    `<tr><th>Total</th><th>${r.trechos ?? ''}</th><th>${km(r.extensao_m || 0)}</th></tr></table>` +
    `<p class="origem">Municípios: ${muns.map(x => `${esc(x.nome)} ${km(x.m)}`).join(' · ') || '—'}<br>` +
    `Continuidades estimadas: ${(M.continuidades_estimadas || []).length || ((M.origem || {}).observacao ? 'não contabilizadas (ver procedência)' : 'nenhuma (o processamento não cria ligações)')}</p>` +
    (v.avisos.length ? `<div class="aviso-dados"><b>Dados a conferir:</b><br>${v.avisos.map(esc).join('<br>')}</div>` : '') +
    `<p class="origem">Origem: ${esc((M.origem || {}).kml)} (${esc((M.origem || {}).data)})` +
    ((M.origem || {}).observacao ? `<br><b>Procedência:</b> ${esc(M.origem.observacao)}` : '') +
    `${(M.origem || {}).postes ? ' · postes ' + esc(M.origem.postes) : ''}${(M.origem || {}).critica ? ' · Crítica ' + esc(M.origem.critica.join(', ')) + (M.origem.nae_filtro === 'arvore' ? ' (só Meio Ambiente · Árvore/Eucalipto na rede)' : '') : ''}` +
    `${(M.origem || {}).malha ? ' · municípios: ' + esc(M.origem.malha) : ''}<br><a href="${esc(M.al)}-trechos.kmz">Baixar o KMZ (Google Earth)</a></p>`;
  document.querySelector('.panel').append(box);

  // abre enquadrado na parte do município escolhido
  if (mun && window.__map && window.L) {
    const pts = [];
    D.vaos.forEach(x => { if ((tm[D.trechos[x[4]].nome] || []).includes(mun.cod)) pts.push([x[0], x[1]], [x[2], x[3]]); });
    if (pts.length) window.__map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
  }
})();
