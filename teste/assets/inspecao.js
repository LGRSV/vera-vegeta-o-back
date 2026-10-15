// Inspeção visual de MT (roda depois de limpeza.js, com window.D e window.INSPECAO de scripts/inspecao.py).
// "Inspeção" no menu Camadas do mapa, com a "Faixa": pinta a rede inspecionada com a cor do ano da execução; o resto fica
// cinza-claro. Com a Faixa também ligada, a inspeção vira uma borda larga na cor do ano em volta da linha da Faixa (o
// cinza e o toque na rede ficam com a Faixa, cujo balão mostra também as inspeções do vão) e a legenda fica ao lado da dela.
// No painel: uma linha por ano (liga/desliga no mapa; abre as inspeções do ano embaixo dela); tocar numa inspeção enquadra no mapa o bloco dela.
// Posição: o BLOCO do ELEMENTO da OS, da chave dele descendo pela rede até as próximas chaves (scripts/inspecao.py).
// Pontos vermelhos: o início do bloco (ELEMENTO) e as chaves onde ele termina, um ponto por lugar (a chave que fecha um
// bloco costuma abrir o seguinte); tocar mostra as inspeções que começam e terminam nele.
// Usa o visual do cartão da limpeza (classes limp-* do limpeza.js) com botões próprios (insp-os-b).
(function () {
  const IN = window.INSPECAO;
  if (!IN || !window.D) return;
  const map = window.__map;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const nf = n => n.toLocaleString('pt-BR');
  const guarda = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };
  const celular = () => matchMedia('(max-width:980px)').matches;
  const telaCheia = () => document.body.classList.contains('tela-cheia');
  const classeDe = nome => nome.split('-')[0];
  // classe à vista (T1/T2/T3) e, com o filtro de município (lupa-painel.js: __munFora), só os trechos do município
  const vis = v => (!window.__visivel || window.__visivel[classeDe(D.trechos[v[4]].nome)]) && !(window.__munFora && window.__munFora(D.trechos[v[4]].nome));

  // cores por ano, diferentes das da limpeza (para não confundir as duas camadas)
  const COR_ANO = { 2024: '#c084fc', 2025: '#818cf8', 2026: '#2dd4bf', 2027: '#a3e635' };
  const corAno = a => COR_ANO[a] || (a < 2024 ? '#e879f9' : '#bef264');
  const SEMCOR = '#cbd5e1';
  const VERMELHO = '#dc2626';

  // ---------- dados ----------
  const vaoPorId = Object.fromEntries(D.vaos.map(v => [v[5], v]));
  const vaosDaOs = IN.os.map(() => []);
  Object.entries(IN.vaos).forEach(([id, ks]) => ks.forEach(k => vaoPorId[id] && vaosDaOs[k].push(vaoPorId[id])));
  const porVao = {};
  D.vaos.forEach(v => {
    const ks = IN.vaos[v[5]] || [];
    const ds = ks.map(k => IN.os[k].data).filter(Boolean).sort();
    porVao[v[5]] = { ks, ult: ds[ds.length - 1] || null };
  });
  const anoDe = o => o.data ? +o.data.slice(0, 4) : null;
  const ANOS = [...new Set(IN.os.map(anoDe).filter(Boolean))].sort((a, b) => b - a);
  const OS_ANO = Object.fromEntries(ANOS.map(a => [a, IN.os.map((o, k) => k).filter(k => anoDe(IN.os[k]) === a)
    .sort((x, y) => IN.os[y].data.localeCompare(IN.os[x].data))]));
  const uniao = ks => { const s = new Set(); ks.forEach(k => vaosDaOs[k].forEach(v => s.add(v))); return [...s]; };
  const somaM = vs => vs.reduce((m, v) => m + v[8], 0);
  const VAOS_ANO = Object.fromEntries(ANOS.map(a => [a, uniao(OS_ANO[a])]));
  const KM_ANO = Object.fromEntries(ANOS.map(a => [a, somaM(VAOS_ANO[a])]));
  const KM_INSP = somaM(uniao(IN.os.map((o, k) => k)));
  const KM_REDE = somaM(D.vaos);
  const ext = m => m < 1000 ? Math.round(m) + ' m' : km(m);   // caminho curto (equipamentos vizinhos) em metros
  const onde = k => vaosDaOs[k].length ? ext(IN.os[k].m) : IN.os[k].pt ? 'só o ponto' : 'sem posição';
  // ativos de início e fim no mapa, um ponto por lugar, com as inspeções que começam (ini) e terminam (fim) nele
  const PONTOS = [];
  {
    const por = new Map();
    const poe = (ll, cod, k, papel) => {
      if (!ll) return;
      const ch = ll[0].toFixed(6) + ',' + ll[1].toFixed(6);
      let p = por.get(ch);
      if (!p) { p = { ll, cods: [], ini: [], fim: [] }; por.set(ch, p); PONTOS.push(p); }
      if (cod && !p.cods.includes(cod)) p.cods.push(cod);
      p[papel].push(k);
    };
    IN.os.forEach((o, k) => { poe(o.pe, o.elem, k, 'ini'); (o.fins || []).forEach(f => poe([f[0], f[1]], f[2], k, 'fim')); });
  }
  const vaosDoTrecho = {};
  D.vaos.forEach(v => (vaosDoTrecho[D.trechos[v[4]].nome] = vaosDoTrecho[D.trechos[v[4]].nome] || []).push(v));

  // ---------- estado ----------
  const st = {
    ligado: guarda('insp-ligado') === '1',
    anos: new Set(ANOS),
    foco: null,
    grupos: new Set(),       // anos abertos, com as inspeções embaixo
    sel: null,
  };

  const css = document.createElement('style');
  css.textContent = `
.ctl-card .ctl-insp{background-image:linear-gradient(90deg,#818cf8,#2dd4bf);background-repeat:no-repeat;background-size:100% 3px;background-position:0 100%}
.ctl-card .ctl-insp[aria-pressed=false]{opacity:.6;text-decoration:line-through;background-image:none;box-shadow:inset 0 -3px 0 #5a636a}
.insp-os-b{display:grid;gap:2px;text-align:left;width:100%;min-height:var(--alvo);padding:var(--s2) var(--s3);border:0;border-left:3px solid var(--c);border-radius:0 var(--r1) var(--r1) 0;
  background:color-mix(in srgb,var(--fg) 4%,transparent);color:var(--fg);cursor:pointer;font:var(--t-sm) var(--f-body)}
.insp-os-b:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.insp-os-b[aria-pressed=true]{background:var(--sel)}
.insp-os-b:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.insp-os-b .q{font:600 var(--t-xs) var(--f-mono);font-variant-numeric:tabular-nums}
.insp-os-b .s{color:var(--muted);font-size:var(--t-xs)}
.insp-os-b.sem{border-left-style:dotted}
.insp-pop .t{font:700 15px var(--f-display);margin-bottom:4px}
.insp-pop .t small{font:500 12px var(--f-body);color:#5a636a;margin-left:4px}
.insp-pop .lb-l{border-left:5px solid var(--c);padding:2px 0 2px 7px;margin:3px 0}
.insp-pop .lb-l b{font-family:var(--f-mono);font-size:12.5px}
.insp-pop .nada{color:#5a636a;font-style:italic}
.insp-pt{position:relative;width:16px;height:16px;border-radius:50%;background:${VERMELHO};border:3px solid #fff;box-shadow:0 0 0 2px #0b0f14,0 2px 6px #0008;transform:translate(-50%,-50%)}
.insp-pt span{position:absolute;left:18px;top:50%;transform:translateY(-50%);white-space:nowrap;padding:3px 7px;border-radius:6px;
  background:var(--vidro);color:var(--vidro-fg);border:1px solid var(--vidro-borda);font:600 11.5px/1.2 var(--f-mono);box-shadow:var(--sh-vidro)}
.insp-pt span b{font-family:var(--f-body);font-weight:700;margin-right:4px}
.insp-pt.fim{width:13px;height:13px;border-width:2px}
.insp-pt.ref{background:#9ca3af}
.insp-junto{margin-top:8px;padding-top:6px;border-top:1px solid #0002}
.insp-junto .t{font-size:13.5px}
.limp-maplg i.insp-dot{width:10px;height:10px;border-radius:50%;background:${VERMELHO};box-shadow:0 0 0 2px #fff}
body.insp-on #legenda{display:none}
body.insp-on .classes button{box-shadow:inset 0 -3px 0 #9ca3af}
body.insp-on .lb{border-left-color:#9ca3af}
body.insp-on #map.longe .lb:not(.sel),body.insp-on #map.longe .at{display:none}
body.insp-on #map.longe .leaflet-marker-icon:has(>.at,>.lb:not(.sel)){visibility:hidden}
@media (prefers-reduced-motion:no-preference){.insp-os-b{transition:background-color var(--dur) var(--ease)}}`;
  document.head.append(css);

  // ---------- mapa ----------
  const seg = v => [[v[0], v[1]], [v[2], v[3]]];
  let camada = null, realce = null, selL = null, fundoCache = null, pontosL = [];
  let comFaixa = false, bordas = [], arruma = 0;     // Faixa também ligada: bordas largas por baixo dela
  const raio = () => map.getZoom() < 13 ? 3.5 : map.getZoom() < 16 ? 5 : 6.5;
  function linhaDupla(vs, cor, peso, opacidade, extra) {
    // contorno escuro por baixo: a cor aparece igual sobre mata escura ou solo claro
    return [L.polyline(vs.map(seg), { color: '#0b0f14', weight: peso + 4, opacity: .75 * opacidade, interactive: false, lineCap: 'round' }),
      L.polyline(vs.map(seg), Object.assign({ color: cor, weight: peso, opacity: opacidade, interactive: false, lineCap: 'round' }, extra))];
  }
  function fundo() {
    const chave = JSON.stringify(window.__visivel || {}) + (window.__munSel || '');
    if (!fundoCache || fundoCache.chave !== chave) {
      const vs = D.vaos.filter(vis);
      fundoCache = { chave, ls: clicavel(linhaDupla(vs, SEMCOR, 2.5, .9), vs) };
    }
    return fundoCache.ls;
  }
  function maisPerto(vs, ll) {
    const k = Math.cos(ll.lat * Math.PI / 180);
    let melhor = null, dmin = Infinity;
    vs.forEach(v => {
      const ax = v[1] * k, ay = v[0], bx = v[3] * k, by = v[2], px = ll.lng * k, py = ll.lat;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2;
      if (d < dmin) { dmin = d; melhor = v; }
    });
    return melhor;
  }
  // inspeções de um vão, da mais recente para a mais antiga (balão da Inspeção e, com a Faixa ligada, o balão dela)
  function linhasVao(v) {
    const ks = porVao[v[5]].ks.slice().sort((a, b) => (IN.os[b].data || '').localeCompare(IN.os[a].data || ''));
    return ks.length ? ks.map((k, i) => {
      const o = IN.os[k], rot = !i ? 'Inspecionado em' : o.data === IN.os[ks[0]].data ? 'Também em' : 'Antes:';
      return `<div class="lb-l" style="--c:${corAno(anoDe(o))}"><b>${rot} ${br(o.data)}</b> · <a href="#" data-k="${k}">OS ${esc(o.os)}</a> · ${esc(o.eq)}</div>`;
    }).join('') : '<div class="nada">Sem inspeção executada registrada aqui</div>';
  }
  window.__balaoInsp = v => st.ligado && porVao[v[5]] ? `<div class="insp-pop insp-junto"><div class="t">Inspeção visual</div>${linhasVao(v)}</div>` : '';
  // balão ao tocar na rede: trecho + inspeções daquele vão
  function balao(e, vs) {
    L.DomEvent.stopPropagation(e);
    const v = maisPerto(vs, e.latlng);
    if (!v) return;
    const nome = D.trechos[v[4]].nome;
    const oe = e.originalEvent || {};
    if ((oe.ctrlKey || oe.metaKey) && window.__clique) return window.__clique(nome, oe, false);   // Ctrl + clique: soma trechos
    if (window.__sel) window.__sel(nome, false);
    const html = `<div class="insp-pop"><div class="t">Trecho ${esc(nome)} <small>inspeção visual</small></div>${linhasVao(v)}</div>`;
    L.popup({ className: 'limp-popup', maxWidth: 300, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] }).setLatLng(e.latlng).setContent(html).openOn(map);
  }
  if (map) map.getContainer().addEventListener('click', e => {
    const a = e.target.closest('.insp-pop a[data-k]');
    if (a) { e.preventDefault(); map.closePopup(); focar(+a.dataset.k, false); }
  });
  function clicavel(ls, vs) { const l = ls[ls.length - 1]; l.options.interactive = true; l.on('click', e => balao(e, vs)); return ls; }

  function desenha() {
    if (!map) return;
    if (camada) camada.remove();
    camada = null;
    document.body.classList.toggle('insp-on', st.ligado);
    comFaixa = document.body.classList.contains('limp-on');
    bordas = [];
    if (st.ligado) {
      const op = st.foco === null ? 1 : .35;
      const ls = comFaixa ? [] : [...fundo()];
      ANOS.slice().reverse().filter(a => st.anos.has(a)).forEach(a => {   // o ano mais recente fica por cima
        const vs = VAOS_ANO[a].filter(vis);
        if (!vs.length) return;
        // com a Faixa: borda larga por baixo de tudo (a linha da Faixa, com o contorno escuro, fica no meio dela)
        if (comFaixa) bordas.push(L.polyline(vs.map(seg), { color: corAno(a), weight: 15, opacity: .9 * op, interactive: false, lineCap: 'round' }));
        else ls.push(...clicavel(linhaDupla(vs, corAno(a), 5, op), vs));
      });
      pontosL = pontos(op);
      camada = L.layerGroup(ls.concat(bordas, pontosL)).addTo(map);
      bordas.slice().reverse().forEach(l => l.bringToBack());   // a mais recente fica por cima das mais antigas
    } else pontosL = [];
    [selL, realce].forEach(g => g && g.eachLayer(l => l.bringToFront && l.bringToFront()));
    pontosL.forEach(l => l.bringToFront());          // os pontos ficam por cima do contorno do trecho escolhido
  }
  // a Faixa redesenha por cima (ao ligar, trocar de ano…): os pontos voltam para cima dela; ligar/desligar a Faixa troca o jeito
  if (map) map.on('layeradd layerremove', () => {
    if (!st.ligado || arruma) return;
    arruma = requestAnimationFrame(() => {
      arruma = 0;
      if (comFaixa !== document.body.classList.contains('limp-on')) return desenha();
      [selL, realce].forEach(g => g && g.eachLayer(l => l.bringToFront && l.bringToFront()));
      pontosL.forEach(l => l.bringToFront());
    });
  });
  // pontos vermelhos dos ativos de início e fim (só das inspeções dos anos ligados)
  function pontos(op) {
    const ano = k => st.anos.has(anoDe(IN.os[k]));
    return PONTOS.filter(p => p.ini.some(ano) || p.fim.some(ano)).map(p => {
      const ni = p.ini.filter(ano).length, nfim = p.fim.filter(ano).length;
      const papel = [ni && `início de ${ni} inspeç${ni === 1 ? 'ão' : 'ões'}`, nfim && `fim de ${nfim}`].filter(Boolean).join(' · ');
      return L.circleMarker(p.ll, { radius: raio(), color: '#fff', weight: 2, fillColor: VERMELHO, fillOpacity: op, opacity: op })
        .bindTooltip(`<b>${esc(p.cods.join(' / ') || 'ativo')}</b><br>${papel}`, { direction: 'top', offset: [0, -6] })
        .on('click', e => balaoPonto(e, p));
    });
  }
  function balaoPonto(e, p) {
    L.DomEvent.stopPropagation(e);
    const linha = (k, rot) => { const o = IN.os[k]; return `<div class="lb-l" style="--c:${corAno(anoDe(o))}"><b>${rot} ${br(o.data)}</b> · <a href="#" data-k="${k}">OS ${esc(o.os)}</a> · ${esc(o.eq)}</div>`; };
    const ord = ks => ks.slice().sort((a, b) => (IN.os[b].data || '').localeCompare(IN.os[a].data || ''));
    const html = `<div class="insp-pop"><div class="t">${esc(p.cods.join(' / ') || 'Ativo')} <small>início e fim de inspeção</small></div>` +
      ord(p.ini).map(k => linha(k, 'Início ·')).join('') + ord(p.fim).map(k => linha(k, 'Fim ·')).join('') + '</div>';
    L.popup({ className: 'limp-popup', maxWidth: 300, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] }).setLatLng(p.ll).setContent(html).openOn(map);
  }
  if (map) map.on('zoomend', () => { const r = raio(); pontosL.forEach(l => l.setRadius(r)); });
  // trecho escolhido: contorno amarelo por cima da camada (a limpeza faz o mesmo quando ela está ligada)
  const onSelAntes = window.__onSel;
  window.__onSel = nome => {
    if (onSelAntes) onSelAntes(nome);
    st.sel = nome;
    if (selL) { selL.remove(); selL = null; }
    const nomes = Array.isArray(nome) ? nome : nome ? [nome] : [];
    if (map && nomes.length && st.ligado) {
      selL = L.layerGroup(linhaDupla(nomes.flatMap(n => vaosDoTrecho[n] || []), '#fde047', 4, 1)).addTo(map);
      if (realce) realce.eachLayer(l => l.bringToFront && l.bringToFront());
    }
  };
  const onClassesAntes = window.__onClasses;
  window.__onClasses = () => { if (onClassesAntes) onClassesAntes(); desenha(); };

  function enquadra(lls, zoomPonto) {
    if (!map || !lls.length) return;
    const mb = document.querySelector('.mapbox');      // mapa fixo no alto (sticky): já está à vista, a página não pula
    if (celular() && !telaCheia() && getComputedStyle(mb).position !== 'sticky') mb.scrollIntoView({ block: 'start' });
    map.invalidateSize();
    if (zoomPonto) map.setView(lls[0], Math.max(map.getZoom(), 16));
    else map.fitBounds(L.latLngBounds(lls).pad(0.15), { maxZoom: 16 });
  }
  function focar(k, enquadrar, doPainel) {
    st.foco = st.foco === k ? null : k;
    if (realce) { realce.remove(); realce = null; }
    if (st.foco !== null) {
      const o = IN.os[k], vs = vaosDaOs[k], cor = corAno(anoDe(o));
      if (!st.ligado) liga(true);
      // início e fins do bloco da inspeção em foco: ponto vermelho maior; com muitos fins, só os pontos (o nome no toque)
      const marca = (ll, rot, cod, cls = '') => L.marker(ll, { interactive: false, keyboard: false, zIndexOffset: 2000,
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="insp-pt ${cls}">${rot ? `<span><b>${rot}</b>${esc(cod || '')}</span>` : ''}</div>` }) });
      const fins = o.fins || [];
      const marcas = [o.pe && marca(o.pe, 'Início', o.elem),
        ...fins.map(f => marca([f[0], f[1]], fins.length <= 6 ? 'Fim' : '', f[2], 'fim'))].filter(Boolean);
      if (!marcas.length && o.pa) marcas.push(marca(o.pa, 'Abrangência (a montante)', o.abr, 'ref'));
      if (map && vs.length) {
        realce = L.layerGroup([
          L.polyline(vs.map(seg), { color: '#fff', weight: 14, opacity: 1, interactive: false, lineCap: 'round' }),
          L.polyline(vs.map(seg), { color: cor, weight: 8, opacity: 1, interactive: false, lineCap: 'round' }),
          ...marcas,
        ]).addTo(map);
        if (enquadrar) enquadra(vs.flatMap(seg));
      } else if (map && (o.pt || marcas.length)) {
        realce = L.layerGroup(marcas.length ? marcas : [marca(o.pt, 'Ponto', '')]).addTo(map);
        if (enquadrar) enquadra([o.pe || o.pt || o.pa], true);
      }
      st.grupos.add(String(anoDe(o)));
    }
    desenha();
    pinta();
    if (!doPainel && window.__rolaPainel) window.__rolaPainel(card, st.foco);
  }
  function liga(on) {
    st.ligado = on; guarda('insp-ligado', on ? '1' : '0');
    if (!on && realce) { realce.remove(); realce = null; st.foco = null; }
    window.__onSel(st.sel);
    desenha(); pinta();
  }
  // outra camada (Manutenção) mostra a inspeção que gerou uma OS: liga a Inspeção e foca nela (soVer: só diz se ela
  // está no mapa deste alimentador)
  window.__focaInspecao = (num, soVer) => {
    const k = IN.os.findIndex(o => o.os_completa === num);
    if (k < 0 || !(vaosDaOs[k].length || IN.os[k].pt || IN.os[k].pe)) return false;
    if (soVer) return true;
    if (!st.ligado) liga(true);
    if (st.foco !== k) focar(k, true);
    return true;
  };

  // legenda dos anos sobre o mapa (o mesmo vidro da legenda da limpeza; extras.js a põe na coluna embaixo do menu Camadas)
  let maplg = null;
  if (map && window.L) {
    maplg = document.createElement('div');
    maplg.className = 'limp-maplg insp-lg';
    maplg.setAttribute('role', 'group');
    maplg.setAttribute('aria-label', 'Anos de inspeção no mapa');
    document.querySelector('.mapbox').append(maplg);
    L.DomEvent.disableClickPropagation(maplg); L.DomEvent.disableScrollPropagation(maplg); L.DomEvent.on(maplg, 'click', L.DomEvent.stopPropagation);
    maplg.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b) alternaAno(+b.dataset.a); });
  }
  function alternaAno(a) { st.anos.has(a) ? st.anos.delete(a) : st.anos.add(a); desenha(); pinta(); }

  // botão "Inspeção" no menu Camadas do mapa (extras.js), com o "Faixa"
  const l2 = map && window.__ctlMapa ? window.__ctlMapa() : null;
  let btn = null;
  if (l2) {
    const c = document.createElement('div');
    c.className = 'ctl-card';
    c.innerHTML = '<button type="button" class="ctl-insp" aria-pressed="false" title="Mostrar ou esconder a rede inspecionada (inspeção visual de MT)">Inspeção</button>';
    l2.append(c);
    btn = c.querySelector('button');
    btn.addEventListener('click', () => liga(!st.ligado));
  }

  // ---------- cartão no painel ----------
  const card = document.createElement('section');
  card.className = 'limp-card insp-card';
  card.setAttribute('aria-label', 'Inspeção visual');
  const depois = document.querySelector('.limp-card') || $('det');
  if (depois) depois.after(card); else document.querySelector('.panel').append(card);

  const focoHtml = k => {
    const o = IN.os[k];
    const ts = [...new Set(vaosDaOs[k].map(v => D.trechos[v[4]].nome))];
    return `<div class="limp-foco"><span class="q">OS ${esc(o.os_completa)} · executada ${br(o.data)}${o.crit ? ' · criticidade ' + esc(o.crit) : ''}</span>
      <span class="limp-nota">Bloco do ELEMENTO ${esc(o.elem || '—')} · a montante: ABRANGÊNCIA ${esc(o.abr || '—')}${o.mont ? ' e ' + esc(o.mont) : ''}</span>
      ${(o.fins || []).length ? `<span class="limp-nota">Fim do bloco: ${o.fins.slice(0, 12).map(f => esc(f[2])).join(', ')}${o.fins.length > 12 ? ` e mais ${o.fins.length - 12}` : ''}</span>` : ''}
      ${o.desc ? `<span>${esc(o.desc)}</span>` : ''}
      <span class="limp-nota">No mapa: ${onde(k)} · ${esc(o.metodo)}</span>
      ${ts.length ? `<span class="limp-nota">Trechos: ${ts.slice(0, 30).map(esc).join(', ')}${ts.length > 30 ? ` e mais ${ts.length - 30}` : ''}</span>` : ''}</div>`;
  };
  const osBtn = (k, comFoco) => {
    const o = IN.os[k], posto = vaosDaOs[k].length || o.pt;
    return `<button type="button" class="insp-os-b${posto ? '' : ' sem'}" data-k="${k}" style="--c:${corAno(anoDe(o))}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${br(o.data)} · OS ${esc(o.os)} · ${onde(k)}</span><span class="s">${esc(o.eq)} · bloco do ${esc(o.elem || '—')}</span></button>` +
      (comFoco && st.foco === k ? focoHtml(k) : '');
  };
  // linha de um ano (o mesmo visual da Faixa): a cor liga/desliga no mapa, o resto abre as inspeções logo abaixo
  // (montadas só com o ano aberto), "só" deixa só aquele ano no mapa
  function linha(a) {
    const g = String(a), ks = OS_ANO[a], aberto = st.grupos.has(g), id = 'insp-g-' + g, on = st.anos.has(a);
    const i = `<i style="--c:${corAno(a)}"></i>`;
    return `<div class="limp-ano-l${st.ligado && !on ? ' off' : ''}">` +
      (st.ligado ? `<button type="button" class="liga" data-a="${a}" data-foco="a${a}" aria-pressed="${on}" aria-label="${a} no mapa" title="Mostrar/esconder ${a} no mapa">${i}</button>`
        : `<span class="cor" aria-hidden="true">${i}</span>`) +
      `<button type="button" class="abre" data-g="${g}" data-foco="g${g}" aria-expanded="${aberto}" aria-controls="${id}"><span><b>${a}</b> · ${ks.length} OS</span><em>${ext(KM_ANO[a])}</em></button>` +
      `</div><div class="limp-oss" id="${id}" role="group" aria-label="Inspeções de ${a}"${aberto ? '' : ' hidden'}>${aberto ? ks.map(k => osBtn(k, true)).join('') : ''}</div>`;
  }

  function pinta() {
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;
    const n = IN.os.length;
    const sub = n ? `${nf(n)} inspeç${n === 1 ? 'ão executada' : 'ões executadas'} · ${ext(KM_INSP)} de ${km(KM_REDE)}` : 'Nenhuma inspeção executada';
    const resto = ANOS.length ? `<div class="limp-anos">${ANOS.map(linha).join('')}</div>` +
      (st.ligado && st.anos.size < ANOS.length ? '<button type="button" class="limp-todos" data-acao="todos" data-foco="todos">Mostrar todos os anos</button>' : '') : '';
    card.hidden = !st.ligado && !!btn;                    // bloco da Inspeção só com ela ligada no mapa
    card.innerHTML = `<div class="limp-top"><h2>Inspeção visual<small>${sub}</small></h2></div>
      ${resto}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });
    if (btn) btn.setAttribute('aria-pressed', String(st.ligado));
    if (maplg) {
      maplg.hidden = !st.ligado;
      maplg.innerHTML = `<span class="lg-cab"><b>Inspeção</b></span>` +
        ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${a}"><i style="--c:${corAno(a)}"></i><b>${a}</b></button>`).join('') +
        (PONTOS.length ? '<span class="lg-info"><i class="insp-dot"></i>início / fim</span>' : '') +
        `<span class="lg-info"><i style="--c:${SEMCOR};box-shadow:0 0 0 1px #000"></i>sem inspeção</span>`;
    }
    if (det) det.querySelectorAll('.insp-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true, true);
    if (b.classList.contains('abre')) { const g = b.dataset.g; st.grupos.has(g) ? st.grupos.delete(g) : st.grupos.add(g); return pinta(); }
    if (b.classList.contains('liga') && b.dataset.a) return alternaAno(+b.dataset.a);
    if (b.dataset.acao === 'todos') { st.anos = new Set(ANOS); desenha(); pinta(); }
  });

  // ---------- detalhe do trecho: inspeções que passaram por ele ----------
  const det = $('det');
  function secTrecho(nome) {
    const ks = new Set();
    (vaosDoTrecho[nome] || []).forEach(v => porVao[v[5]].ks.forEach(k => ks.add(k)));
    const lst = [...ks].sort((a, b) => (IN.os[b].data || '').localeCompare(IN.os[a].data || ''));
    const tot = somaM(vaosDoTrecho[nome] || []), feito = somaM((vaosDoTrecho[nome] || []).filter(v => porVao[v[5]].ks.length));
    return `<section class="limp-sec insp-sec" aria-live="off"><h3>Inspeção visual</h3>
      <dl><dt>Última</dt><dd>${lst.length ? br(IN.os[lst[0]].data) + ` · ${ext(feito)} de ${ext(tot)} do trecho inspecionados` : 'nenhuma inspeção executada passou por este trecho'}</dd></dl>
      ${lst.map(k => osBtn(k, false)).join('')}</section>`;
  }
  function poeDetalhe() {
    if (!det || det.querySelector('.insp-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (vaosDoTrecho[nome]) det.insertAdjacentHTML('beforeend', secTrecho(nome));
  }
  if (det) {
    new MutationObserver(poeDetalhe).observe(det, { childList: true });
    det.addEventListener('click', e => { const b = e.target.closest('.insp-os-b'); if (b) focar(+b.dataset.k, true); });
  }

  // ---------- Downloads (em "Dados", extras.js): todas as inspeções do alimentador ----------
  if (window.__baixar && window.__csv && IN.os.length) {
    const C = window.__csv;
    window.__baixar.botao('insp', 'Inspeções (Excel)', () => {
      const ks = IN.os.map((o, k) => k).sort((a, b) => (IN.os[b].data || '').localeCompare(IN.os[a].data || ''));
      C(`Inspecoes_${C.al}.csv`,
        ['Alimentador', 'OS', 'Equipe', 'Execução', 'Criticidade', 'ELEMENTO', 'ABRANGÊNCIA', 'Montante da ABRANGÊNCIA', 'Trechos',
          'Extensão no mapa (km)', 'Chaves de fim do bloco', 'Latitude', 'Longitude', 'Posição no mapa', 'Descrição'],
        ks.map(k => {
          const o = IN.os[k], ll = o.pe || o.pt || o.pa;
          return [D.meta.al, o.os_completa || o.os, o.eq, C.data(o.data), o.crit, o.elem, o.abr, o.mont, C.trechos(vaosDaOs[k].map(v => v[5])),
            vaosDaOs[k].length ? C.num(o.m / 1000, 2) : '', (o.fins || []).map(f => f[2]).join(', '),
            ll ? C.num(ll[0]) : '', ll ? C.num(ll[1]) : '', o.metodo, o.desc];
        }));
    }, `Planilha (CSV para o Excel) com as ${IN.os.length} inspeções`);
  }

  poeDetalhe();
  desenha();
  pinta();
})();
