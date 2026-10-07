// Acréscimos da página do alimentador no site por município (roda depois de alimentador.js, com window.D):
// caminho Município › Alimentador › Trecho, filtros por classe e município, resumo por classe, avisos, origem e KMZ.
(function () {
  const M = D.meta || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
  const mil = x => x === '' || x == null ? '' : Number(x).toLocaleString('pt-BR');
  const muns = M.municipios || [];
  const mun = muns.find(x => x.slug === new URLSearchParams(location.search).get('m'));
  const css = document.createElement('style');
  // (o caminho .migalhas tem o CSS no alimentador.css: aparece já na 1ª pintura)
  css.textContent = '.ie.ativo{transform:translate(-50%,9px)}.ie.ativo em{background:#1d4ed8}' +
    '.dados>*+*{margin-top:var(--s3)}.dados>summary+*{margin-top:var(--s2)}.dados>summary .selo{margin-left:var(--s1);font:400 var(--t-xs) var(--f-body);font-style:normal;color:var(--muted);' +
    'border:1px solid var(--line);border-radius:var(--rp);padding:1px var(--s2);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}' +
    '.dados>summary .selo::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--aviso)}' +
    '.aviso-dados{display:grid;gap:2px;border-left:2px solid var(--aviso);padding:var(--s2) var(--s3);font-size:var(--t-sm)}' +
    '.resumo-classe{width:100%;border-collapse:collapse;font-size:var(--t-sm)}' +
    '.resumo-classe td,.resumo-classe th{padding:6px 8px;text-align:left;border-bottom:1px solid var(--line)}' +
    '.resumo-classe tr:first-child th{font:500 var(--t-xs) var(--f-body);color:var(--muted)}' +
    '.resumo-classe td+td,.resumo-classe th+th{text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums}' +
    '.resumo-classe td:first-child{font:600 var(--t-sm) var(--f-mono)}' +
    '.origem{font-size:var(--t-xs);color:var(--muted);overflow-wrap:anywhere}.dados .foot{overflow-wrap:anywhere}' +
    '.ativo-hit:empty{display:none}.ativo-hit{display:grid;gap:var(--s1);margin:var(--s2) 0}' +
    '.ativo-hit button{display:grid;gap:2px;text-align:left;width:100%;min-height:var(--alvo);padding:var(--s2) var(--s3);border:1px solid var(--line-forte);' +
    'border-radius:var(--r2);background:var(--paper);color:var(--fg);font:var(--t-sm) var(--f-body);cursor:pointer}' +
    '.ativo-hit button span{color:var(--muted);font-size:var(--t-xs)}.ativo-hit .ir{color:var(--accent)}' +
    '.ativo-hit button:hover{border-color:var(--accent)}.ativo-hit button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}';
  document.head.append(css);

  // título: o código do alimentador; a SE fica no sobretítulo. O HTML da página já sai assim (script no cabeçalho do modelo);
  // aqui só se completa o que faltar.
  const h1 = document.querySelector('h1'), eyebrow = document.querySelector('.eyebrow');
  if (M.al && h1 && h1.textContent !== M.al) {
    h1.textContent = M.al;
    if (eyebrow) eyebrow.textContent = eyebrow.textContent.replace(/\s*·\s*Alimentador\s+\S+\s*$/i, '');
    if (!h1.nextElementSibling?.classList.contains('sub')) h1.insertAdjacentHTML('afterend', '<p class="sub">Trechos por ativo</p>');
  }

  // caminho e volta para o município (o município só se sabe com os dados: entra no lugar reservado)
  const sep = '<span aria-hidden="true">›</span>';
  const linkMun = mun ? `<a href="../../municipios/${esc(mun.slug)}/">${esc(mun.nome)}</a>${sep}` : '';
  let nav = document.querySelector('header .migalhas');
  if (nav) { const lugar = nav.querySelector('.mig-mun'); if (lugar) lugar.innerHTML = linkMun; }
  else {
    nav = document.createElement('nav');
    nav.className = 'migalhas';
    nav.setAttribute('aria-label', 'Caminho');
    nav.innerHTML = `<a href="../../">Municípios</a>${sep}${linkMun}` +
      `<span aria-current="page">${esc(M.al)}</span><span class="mig-t" id="mig-trecho"></span>`;
    document.querySelector('header').prepend(nav);
  }

  // filtros por classe (segmentado curto) e município (select na largura toda); a lista é refeita a cada busca: o filtro é reaplicado
  const lista = document.getElementById('lista');
  const f = document.createElement('div');
  f.className = 'filtros';
  const COR = { T1: '#3b82f6', T2: '#22c55e', T3: '#facc15' };   // as cores das classes no mapa
  let classe = '';
  f.innerHTML = '<div class="f-classe" role="group" aria-label="Classe do trecho">' + ['', 'T1', 'T2', 'T3'].map(c =>
    `<button type="button" data-c="${c}" aria-pressed="${c === classe}">${c ? `<i style="--c:${COR[c]}" aria-hidden="true"></i>${c}` : 'Todas'}</button>`).join('') + '</div>' +
    (muns.length > 1 ? `<label>Município <select id="f-mun"><option value="">Todos</option>${muns.map(x =>
      `<option value="${esc(x.cod)}"${mun && x.cod === mun.cod ? ' selected' : ''}>${esc(x.nome)} (${km(x.m)})</option>`).join('')}</select></label>` : '');
  const ferr = document.getElementById('ferramentas');
  ferr ? ferr.prepend(f) : document.getElementById('busca').after(f);
  const tm = M.trecho_mun || {};
  function aplica(mexeu) {
    const c = classe, fm = (document.getElementById('f-mun') || {}).value || '';
    let grp = null, n = 0;                               // título de grupo: conta só as linhas à vista; sem nenhuma, some junto
    const fechaGrp = () => {
      if (!grp) return;
      grp.hidden = !n;
      const tit = grp.dataset.tit ?? (grp.dataset.tit = grp.textContent.replace(/ · [\d.]+$/, ''));
      const txt = `${tit} · ${mil(n)}`;
      if (grp.textContent !== txt) grp.textContent = txt;
    };
    [...lista.children].forEach(r => {
      if (r.classList.contains('grp')) { fechaGrp(); grp = r; n = 0; return; }
      if (!r.classList.contains('row')) return;
      const t = r.dataset.t;
      r.hidden = !((!c || t.split('-')[0] === c) && (!fm || (tm[t] || []).includes(fm)));
      n += r.hidden ? 0 : 1;
    });
    fechaGrp();
    if (window.__tabLista) window.__tabLista();          // a parada do Tab na lista passa para uma linha à vista
    const m = mexeu === true && lista.querySelector('.row[aria-current="true"]:not([hidden])');
    if (m) {                                             // filtro trocado: o trecho escolhido continua à vista na lista
      const q = lista.getBoundingClientRect(), r = m.getBoundingClientRect();
      if (r.top < q.top + 32 || r.bottom > q.bottom) lista.scrollTop += r.top - q.top - 40;
    }
  }
  f.addEventListener('change', () => aplica(true));
  f.addEventListener('click', e => {
    const b = e.target.closest('.f-classe button');
    if (!b || b.dataset.c === classe) return;
    classe = b.dataset.c;
    f.querySelectorAll('.f-classe button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    aplica(true);
  });
  new MutationObserver(ms => {
    if (ms.some(m => m.type === 'childList' && m.target === lista)) aplica();   // lista refeita (não a contagem dos títulos)
    const s = [...lista.querySelectorAll('.row[aria-current="true"]')].map(b => b.dataset.t);
    document.getElementById('mig-trecho').innerHTML = s.length ? sep + esc(s.join(' + ')) : '';
  }).observe(lista, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  aplica();

  // NAE só de vegetação: deixa isso escrito no seletor de mês
  const labMes = document.querySelector('label[for="mes"]');
  if (labMes && (M.origem || {}).nae_filtro === 'arvore') labMes.firstChild.textContent = 'NAE árvore/eucalipto em ';

  // resumo por classe, avisos de dados e origem: tudo em "Dados e procedência", fechado
  const r = M.resumo || {};
  const v = M.validacao || { avisos: [] };
  const o = M.origem || {};
  const box = document.createElement('details');
  box.className = 'dados';
  box.innerHTML = `<summary>Dados e procedência${v.avisos.length ? '<em class="selo">com avisos</em>' : ''}</summary>` +
    `<table class="resumo-classe"><tr><th>Classe</th><th>Trechos</th><th>Extensão</th></tr>` +
    ['T1', 'T2', 'T3'].map(k => `<tr><td>${k}</td><td>${mil((r[k] || {}).n ?? 0)}</td><td>${km((r[k] || {}).m || 0)}</td></tr>`).join('') +
    `<tr><th>Total</th><th>${mil(r.trechos ?? '')}</th><th>${km(r.extensao_m || 0)}</th></tr></table>` +
    `<p class="origem">Municípios: ${muns.map(x => `${esc(x.nome)} ${km(x.m)}`).join(' · ') || '—'}</p>` +
    `<p class="origem">Continuidades estimadas: ${(M.continuidades_estimadas || []).length || (o.observacao ? 'não contabilizadas (ver procedência)' : 'nenhuma (o processamento não cria ligações)')}</p>` +
    (v.avisos.length ? `<div class="aviso-dados"><b>Dados a conferir:</b>${v.avisos.map(a => `<span>${esc(a)}</span>`).join('')}</div>` : '') +
    `<p class="origem">Origem: ${esc(o.kml)} (${esc(o.data)})` +
    (o.observacao ? `</p><p class="origem"><b>Procedência:</b> ${esc(M.origem.observacao)}` : '') +
    `${o.postes ? ' · postes ' + esc(M.origem.postes) : ''}${o.critica ? ' · Crítica ' + esc(M.origem.critica.join(', ')) + (M.origem.nae_filtro === 'arvore' ? ' (só Meio Ambiente · Árvore/Eucalipto na rede)' : '') : ''}` +
    `${o.malha ? ' · municípios: ' + esc(M.origem.malha) : ''}</p><p class="origem"><a href="${esc(M.al)}-trechos.kmz">Baixar o KMZ (Google Earth)</a></p>`;
  document.querySelector('.panel').append(box);
  const kmz = document.createElement('p');
  kmz.className = 'origem kmz';
  kmz.innerHTML = `<a href="${esc(M.al)}-trechos.kmz" download>Baixar o KMZ (Google Earth)</a>`;
  box.before(kmz);
  const foot = document.querySelector('.foot');
  if (foot) box.append(foot);

  // abre enquadrado na parte do município escolhido
  if (mun && window.__map && window.L) {
    const pts = [];
    D.vaos.forEach(x => { if ((tm[D.trechos[x[4]].nome] || []).includes(mun.cod)) pts.push([x[0], x[1]], [x[2], x[3]]); });
    if (pts.length) window.__map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
  }

  // marcador de um ativo no mapa (busca da página inicial ou da lista): um só por vez
  let marcaAtivo = null;
  function poeAtivo(ll, cod) {
    const map = window.__map;
    if (!map || !window.L) return;
    if (marcaAtivo) marcaAtivo.remove();
    marcaAtivo = L.marker(ll, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: null,
      html: `<div class="ie ativo"><em>ATIVO</em>${esc(cod)}</div>` }) }).addTo(map);
    map.setView(ll, Math.max(map.getZoom(), 16), { animate: false });
  }

  // busca da lista: código de transformador ou de chave que não abre nem fecha trecho (índice dados/ativos, o mesmo da
  // busca da página inicial; baixa só o pedaço do código). Achados deste alimentador aparecem acima da lista.
  const campo = document.getElementById('busca');
  if (campo && lista) {
    const TIPO = { DJ: 'Disjuntor', '79': 'Religador', '03': 'Fusível 03', '33': 'Fusível 33', '02': 'Chave 02', '88': 'Chave faca 88',
      '40': 'Trip saver 40', '41': 'Trip saver 41', SEC: 'Fusível (seccionamento)', FTR: 'Fusível no tronco', TR: 'Transformador',
      ET: 'Transformador', EP: 'Transformador particular', Capacitor: 'Banco de capacitor', Regulador: 'Regulador de tensão',
      Chave: 'Chave', ChaveNA: 'Chave NA' };
    const chave = s => { const k = String(s).toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^\d+$/.test(k) ? (k.replace(/^0+/, '') || '0') : k; };
    const fatia = k => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) >>> 0; return (h % 256).toString(16).padStart(2, '0'); };
    const cache = {};
    const baixa = x => cache[x] || (cache[x] = fetch(`../../dados/ativos/${x}.json`).then(r => r.ok ? r.json() : {}).catch(() => { delete cache[x]; return {}; }));
    const box = document.createElement('div');
    box.className = 'ativo-hit';
    box.setAttribute('aria-live', 'polite');
    lista.before(box);
    let pedido = 0, espera = null;
    campo.addEventListener('input', () => {
      clearTimeout(espera);
      box.innerHTML = '';
      const txt = campo.value.trim(), k = chave(txt), meu = ++pedido;
      if (k.length < 4) return;
      espera = setTimeout(async () => {
        const d = await baixa(fatia(k));
        if (meu !== pedido) return;                      // o texto mudou enquanto baixava
        const hits = (d[k] || []).filter(h => h[0] === M.al && h[1] !== 'poste');   // poste: a própria lista já acha
        box.innerHTML = hits.map(([, tipo, t, papel, lat, lon]) =>
          `<button type="button" data-t="${esc(t)}" data-ll="${lat},${lon}" data-a="${esc(txt)}"><b>${esc(TIPO[tipo] || 'Chave ' + tipo)} ${esc(txt)}</b>` +
          `<span>${esc(papel)}</span><span class="ir">${t ? 'Ver ' + esc(t) + ' no mapa' : 'Ver no mapa'} →</span></button>`).join('');
      }, 250);
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.t && window.__sel) window.__sel(b.dataset.t, false);
      poeAtivo(b.dataset.ll.split(',').map(Number), b.dataset.a);
    });
  }

  // vindo da busca de ativo da página inicial (?t=trecho&a=código&ll=lat,lon): seleciona o trecho e marca o ativo.
  // Espera o load para a limpeza de faixa (scripts seguintes) também pintar a seleção.
  const pq = new URLSearchParams(location.search), tq = pq.get('t'), ll = (pq.get('ll') || '').split(',').map(Number);
  const temT = tq && window.__sel && D.trechos.some(t => t.nome === tq), temLL = ll.length === 2 && ll.every(Number.isFinite);
  if (temT || temLL) addEventListener('load', () => {    // ativo longe da rede: só o marcador
    if (temT) window.__sel(tq, !temLL);                  // com o ponto do ativo, o mapa vai até ele (sem animar até o trecho)
    if (temLL) poeAtivo(ll, pq.get('a') || '');
  });
})();
