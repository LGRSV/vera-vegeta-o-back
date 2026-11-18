// Mapa da página inicial: visão satélite do Tocantins (Ctrl+S, ⌘S no Mac), por cima de mapa-municipios.js e mapa-raiox.js
// (arquivo à parte para não mexer neles).
// - Ctrl+S abre, Ctrl+S de novo ou Esc volta (o "Salvar página" do navegador não abre). Na tela nova (central/) o atalho vale
//   também com o foco fora do quadro do mapa (na casca), enquanto o mapa está na tela.
// - Animação "dissolve + aproximação": o satélite nasce com a mesma área que o mapa dos municípios mostra (inclusive aproximado
//   num município; a altura corrigida para a projeção do mapa) e, enquanto o mapa se dissolve nele, o zoom vai suavemente até o
//   estado inteiro. A volta é o inverso (o satélite vai até a área do mapa e se dissolve nele). Com prefers-reduced-motion,
//   sem animação.
// - O que mostra: a imagem de satélite (Esri World Imagery, ou a Google com a chave de assets/mapa-satelite.js), só o Tocantins
//   (fora do estado, a cor escura dos mapas, --mapbg; sem divisas de municípios) e o T1 e o T2 de todos os alimentadores
//   (dados/vizinhos/estado.txt, o mesmo da visão Tocantins do mapa do alimentador). Passar o mouse numa linha mostra o código
//   do alimentador; clicar abre a página dele. Arrastar e zoom livres, com o estado de limite.
// - Sem quadrados pretos: por baixo do satélite nítido, um fundo com os quadros de longe de todo o estado (um nível só,
//   baixado antes da animação começar); a animação também espera os quadros da vista de partida.
// - Leaflet (assets/leaflet/), o contorno do estado (dados/tocantins.js) e as linhas só são baixados no primeiro Ctrl+S: a
//   página inicial não fica mais pesada para abrir.
// - Raio-X (mapa-raiox.js, Ctrl+X) e satélite não ficam ligados juntos: Ctrl+S desliga o raio-X, e o raio-X ligado fecha o
//   satélite.
(function () {
  const M = window.MUN, alvo = document.getElementById('mapa-to'), eu = document.currentScript;
  const svg = alvo && alvo.querySelector('.mt-mapa svg'), caixa = svg && svg.parentNode;
  if (!M || !svg || !eu) return;
  const RAIZ = new URL('../', eu.src).href;              // a pasta do site (teste/)
  const calmo = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || alvo.classList.contains('mt-cheia');
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  // x = a·lon + b, y = c·lat + d: a projeção do mapa dos municípios (scripts/gera_trechos.py, PROJ_MUN)
  const PA = 112.8878, PB = 5722.7136, PC = -111.6377, PD = -574.6836;
  const COR = { T1: '#3b82f6', T2: '#22c55e' };          // as cores do T1 e do T2 da visão Tocantins do alimentador
  const DUR_ABRE = 1200, DUR_FECHA = 850;
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  const ATR = 'Imagem © Esri — Esri, Maxar, Earthstar Geographics';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- carga sob demanda ----------
  const script = src => new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = falha;
    document.head.append(s);
  });
  const folha = href => new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = ok;
    document.head.append(l);
  });
  let libs = null, linhas = null;
  const carregaLibs = () => libs || (libs = Promise.all([
    window.L ? null : script(RAIZ + 'assets/leaflet/leaflet.js'),
    folha(RAIZ + 'assets/leaflet/leaflet.css'),
    Array.isArray(window.TOCANTINS) ? null : script(RAIZ + 'dados/tocantins.js'),
    window.ARGOS_SAT ? null : script(RAIZ + 'assets/mapa-satelite.js').catch(() => null),   // sem o arquivo: Esri
  ]).catch(e => { libs = null; throw e; }));
  // dados/vizinhos/estado.txt → [{cod, T1: [[lat, lon], ...] por linha, T2}] (o formato de visao-tocantins.js: por
  // alimentador, código, T1 e T2 separados por tabulação; cada classe, linhas separadas por espaço, com os pontos no
  // formato das polilinhas do Google, em 1e-4 grau, a diferença acumulando pelo arquivo inteiro)
  function decodifica(txt) {
    const out = [];
    let la = 0, lo = 0;
    for (const ln of txt.split('\n')) {
      if (!ln) continue;
      const cl = ln.split('\t'), r = { cod: cl[0], T1: [], T2: [] };
      ['T1', 'T2'].forEach((c, j) => {
        const s = cl[j + 1] || '', n = s.length;
        let i = 0, atual = [];
        const fecha = () => { if (atual.length > 1) r[c].push(atual); atual = []; };
        while (i < n) {
          if (s.charCodeAt(i) === 32) { fecha(); i++; continue; }
          let v = 0, sh = 0, b;
          do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
          la += v & 1 ? ~(v >> 1) : v >> 1;
          v = 0; sh = 0;
          do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
          lo += v & 1 ? ~(v >> 1) : v >> 1;
          atual.push([la / 1e4, lo / 1e4]);
        }
        fecha();
      });
      out.push(r);
    }
    return out;
  }
  const carregaLinhas = () => linhas || (linhas = fetch(RAIZ + 'dados/vizinhos/indice.json')
    .then(r => (r.ok ? r.json() : null))
    .then(j => (j && j.estado && j.estado[1] ? fetch(`${RAIZ}dados/vizinhos/estado.txt?v=${encodeURIComponent(j.estado[0])}`) : null))
    .then(r => (r && r.ok ? r.text() : null))
    .then(t => (t ? decodifica(t) : []))
    .catch(() => []));

  // alimentadores do mapa (SE de cada um, para o balão), feito só no primeiro uso
  let als = null;
  const infoAl = cod => {
    if (!als) {
      als = new Map();
      M.muns.forEach(m => m.als.forEach(a => { if (!als.has(a.cod)) als.set(a.cod, { se: a.se }); }));
    }
    return als.get(cod) || {};
  };

  // ---------- estilo (entra no primeiro uso) ----------
  let comEstilo = false;
  function poeEstilo() {
    if (comEstilo) return;
    comEstilo = true;
    const css = document.createElement('style');
    css.textContent =
      '.mt-mapa>.st-sat{position:absolute;inset:0;z-index:4;overflow:hidden;border-radius:var(--r3,14px);background:var(--mapbg,#0f1417);' +
      'opacity:0;visibility:hidden;pointer-events:none;transition:none;transform-origin:50% 50%}' +
      '.sat-to .mt-mapa>.st-sat{visibility:visible;pointer-events:auto}' +
      '.st-sat .leaflet-container,.st-sat.leaflet-container{background:var(--mapbg,#0f1417);font:inherit;outline:0}' +
      // o nítido sem a soma de cores do Leaflet (plus-lighter): na emenda de dois quadros ela clareava uma linha; por baixo dele
      // há o fundo, então a emenda não fica escura
      '.st-sat .st-nitido img.leaflet-tile{mix-blend-mode:normal}' +
      // a lista do município aberto (busca-ativo.js) não fica por cima do satélite
      '.sat-to #ativo-res.lista-mun{visibility:hidden}' +
      '.st-sat .leaflet-control-attribution{background:var(--vidro,rgba(15,20,23,.82));color:var(--vidro-fg,#f3f4f4);font:11px/1.4 var(--f-body,sans-serif);border-top-left-radius:var(--r1,6px)}' +
      '.st-linhas{transition:opacity .45s var(--ease,ease)}' +
      // os outros elementos do mapa (nomes, bandeiras, cartões) saem como no raio-X; o Tela cheia e o "Abrindo…" ficam
      '.sat-to .mt-mapa>:not(svg):not(.mt-tc):not(.st-sat):not(.st-aviso):not(.st-balao):not(.mt-abrindo){opacity:0;pointer-events:none}' +
      '.st-aviso,.st-balao{position:absolute;z-index:7;color:var(--vidro-fg,#f3f4f4);background:var(--vidro,rgba(15,20,23,.82));' +
      'border:1px solid var(--vidro-borda,rgba(255,255,255,.12));box-shadow:var(--sh-vidro,0 2px 8px rgb(0 0 0 / .35));font:500 var(--t-sm,13px)/1.35 var(--f-body,sans-serif)}' +
      '.st-aviso{left:12px;top:12px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;max-width:calc(100% - 76px);padding:7px 12px;border-radius:var(--r2,10px)}' +
      '.st-aviso b{font:700 var(--t-xs,12px)/1 var(--f-display,sans-serif);letter-spacing:.12em;text-transform:uppercase}' +
      '.st-aviso i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}' +
      '.st-aviso .st-tecla{color:var(--muted,#9aa4ab);font-size:var(--t-xs,12px)}' +
      '.st-balao{display:grid;gap:1px;padding:6px 10px;border-radius:var(--r1,6px);pointer-events:none;white-space:nowrap}' +
      '.st-balao b{font:600 var(--t-sm,13px)/1.2 var(--f-mono,monospace)}.st-balao span{font-size:var(--t-xs,12px);opacity:.8}' +
      // celular: o aviso em coluna, só o nome e as cores (sem teclado; o resto não cabe sem cobrir a ponta norte do estado)
      '@media (max-width:640px){.st-aviso{flex-direction:column;align-items:flex-start;gap:2px;padding:6px 10px}.st-aviso .st-n,.st-aviso .st-tecla{display:none}' +
      '.st-sat .leaflet-control-attribution{font-size:9px}}' +
      '@media (prefers-color-scheme:light){:root:not([data-theme="dark"]) .st-aviso .st-tecla{color:#b9c1c6}}' +
      ':root[data-theme="light"] .st-aviso .st-tecla{color:#b9c1c6}';
    document.head.append(css);
  }

  // ---------- telas: aviso (carregando / legenda) e balão ----------
  let aviso = null, balao = null;
  function poeAviso(html) {
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'st-aviso';
      aviso.setAttribute('role', 'status');
      caixa.append(aviso);
    }
    aviso.innerHTML = html;
    aviso.hidden = !html;
  }
  const TECLA = `${MAC ? '⌘S' : 'Ctrl+S'} ou Esc volta`;
  const legenda = n => `<b>Satélite</b><span class="st-n">${n ? `${n.toLocaleString('pt-BR')} alimentadores` : 'carregando as linhas…'}</span>` +
    `<span><i style="background:${COR.T1}"></i>T1</span><span><i style="background:${COR.T2}"></i>T2</span><span class="st-tecla">${TECLA}</span>`;

  // ---------- o mapa de satélite (criado no primeiro Ctrl+S) ----------
  let L = null, map = null, caixaSat = null, fundo = null, nitido = null, mascara = null, rend = null, paneL = null;
  let TO = null, limTO = null, grupos = new Map(), nLinhas = 0, sobre = null;
  // a área que o mapa dos municípios mostra agora, no tamanho da caixa: centro, zoom (o mesmo px por grau de longitude) e a
  // correção da altura (o mapa dos municípios é proporcional em graus; o satélite, Mercator)
  function vistaDoSvg() {
    const ctm = svg.getScreenCTM(), r = caixa.getBoundingClientRect();
    if (!ctm || !r.width) return null;
    const p = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(ctm.inverse());
    const lat = (p.y - PD) / PC, lon = (p.x - PB) / PA;
    return { c: L.latLng(lat, lon), z: Math.log2(ctm.a * PA * 360 / 256), k: (-PC * Math.cos(lat * Math.PI / 180)) / PA };
  }
  const folga = () => (caixa.clientWidth < 600 ? 14 : 28);
  function vistaDoEstado() {
    const f = folga(), cz = map._getBoundsCenterZoom(limTO, { padding: L.point(f, f) });
    return { c: cz.center, z: cz.zoom, k: 1 };
  }
  // Esri: onde não há foto num zoom o servidor responde 404 (blankTile=false) e o quadro vira a foto do nível de cima ampliada
  // (como em mapa_trechos.html); quadro inteiro fora da caixa do estado nem é pedido
  function camadas(google) {
    const noTO = function (c) {
      const tb = this._tileCoordsToBounds(c);
      return L.TileLayer.prototype._isValidTile.call(this, c) && limTO.intersects(tb);
    };
    let Base;
    if (google) {
      Base = L.TileLayer.extend({ _isValidTile: noTO });
    } else {
      Base = L.TileLayer.extend({
        getTileUrl: c => `${SAT}${c.z}/${c.y}/${c.x}?blankTile=false`,
        _isValidTile: noTO,
        createTile(c, done) { const t = L.TileLayer.prototype.createTile.call(this, c, done); t._xyz = c; t._k = 0; return t; },
        _tileOnError(done, t, e) {
          const c = t._xyz, k = ++t._k;
          if (!c || k > 6 || c.z - k < 0) return L.TileLayer.prototype._tileOnError.call(this, done, t, e);
          const f = 2 ** k, n = 256 * f, x = (c.x % f) * 256, y = (c.y % f) * 256;
          Object.assign(t.style, { width: n + 'px', height: n + 'px', marginLeft: -x + 'px', marginTop: -y + 'px', mixBlendMode: 'normal',
            clipPath: `inset(${y}px ${n - x - 256}px ${n - y - 256}px ${x}px)` });
          t.src = `${SAT}${c.z - k}/${c.y >> k}/${c.x >> k}?blankTile=false`;
        },
      });
    }
    const url = google || SAT + '{z}/{y}/{x}';
    // nítido: quieto na animação (só os quadros do pouso, como o voo do Leaflet)
    const Nitido = Base.extend({ _onMoveEnd() { if (!this._quieto) L.TileLayer.prototype._onMoveEnd.call(this); } });
    // fundo: um nível só (o mais perto do zoom do estado), com todos os quadros do estado carregados, seja qual for a vista
    const zf = Math.max(5, Math.min(8, Math.round(vistaDoEstado().z + 0.2)));
    const Fundo = Base.extend({
      _getTiledPixelBounds() {
        const z = this._tileZoom;
        return L.bounds(this._map.project(limTO.getNorthWest(), z), this._map.project(limTO.getSouthEast(), z));
      },
    });
    const atr = google ? '' : ATR;
    fundo = new Fundo(url, { minNativeZoom: zf, maxNativeZoom: zf, maxZoom: 22, updateWhenZooming: false, keepBuffer: 0, attribution: atr }).addTo(map);
    nitido = new Nitido(url, { maxZoom: 22, maxNativeZoom: google ? 20 : 18, updateWhenZooming: false, attribution: atr, className: 'st-nitido' }).addTo(map);
  }
  // Google (Map Tiles API) com a chave de assets/mapa-satelite.js, como na página Podas; sem chave ou com erro, a Esri
  async function urlGoogle() {
    const key = (window.ARGOS_SAT && window.ARGOS_SAT.google) || '';
    if (!key) return '';
    try {
      const K = 'argos-gtiles';
      let s = null;
      try { s = JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { s = null; }
      if (!(s && s.key === key && s.expiry * 1000 > Date.now() + 36e5)) {
        const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(key), { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapType: 'satellite', language: 'pt-BR', region: 'BR' }) });
        if (!r.ok) throw new Error('sessão ' + r.status);
        const j = await r.json();
        s = { key, session: j.session, expiry: +j.expiry };
        try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) { /* sem armazenamento */ }
      }
      if (map) map.attributionControl.addAttribution('Imagem © Google');
      return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${s.session}&key=${encodeURIComponent(key)}`;
    } catch (e) { return ''; }
  }
  // máscara: fora do Tocantins, a cor escura dos mapas. Um svg no tamanho da caixa com folga de meia caixa em volta, refeito a
  // cada movimento (568 pontos); na animação do zoom do Leaflet, estica junto com os quadros (como as camadas de imagem)
  function criaMascara() {
    const pane = map.createPane('st-mascara');
    pane.style.zIndex = 250;                               // acima do satélite (200), abaixo das linhas (400)
    pane.style.pointerEvents = 'none';
    const NS = 'http://www.w3.org/2000/svg', el = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    el.setAttribute('class', 'leaflet-zoom-animated');
    el.style.cssText = 'display:block;margin:0;min-height:0;max-width:none;max-height:none;overflow:visible';   // (sem o .mt-mapa svg do site.css)
    path.setAttribute('fill-rule', 'evenodd');
    path.style.filter = 'drop-shadow(0 0 3px rgba(0,0,0,.55))';   // a borda: uma sombra leve, como na visão Tocantins do alimentador
    el.append(path);
    pane.append(el);
    let caixaM = null;
    const cor = () => getComputedStyle(caixa).getPropertyValue('--mapbg').trim() || '#0f1417';
    const desenha = () => {
      if (!map || map._animatingZoom) return;
      const t = map.getSize(), m = 0.5, x0 = -t.x * m, y0 = -t.y * m, w = t.x * (1 + 2 * m), h = t.y * (1 + 2 * m);
      caixaM = L.latLngBounds(map.containerPointToLatLng([x0, y0]), map.containerPointToLatLng([x0 + w, y0 + h]));
      L.DomUtil.setPosition(el, map.containerPointToLayerPoint([x0, y0]));
      el.setAttribute('width', w); el.setAttribute('height', h);
      el.style.width = w + 'px'; el.style.height = h + 'px';
      let d = `M0,0H${w.toFixed(0)}V${h.toFixed(0)}H0Z`;
      for (const anel of TO) {
        d += 'M' + anel.map(([la, lo]) => { const p = map.latLngToContainerPoint([la, lo]); return (p.x - x0).toFixed(1) + ',' + (p.y - y0).toFixed(1); }).join('L') + 'Z';
      }
      path.setAttribute('d', d);
      path.setAttribute('fill', cor());
    };
    map.on('zoom move viewreset resize', desenha);
    map.on('zoomanim', e => {
      if (!caixaM) return;
      const s = map.getZoomScale(e.zoom), o = map._latLngBoundsToNewLayerBounds(caixaM, e.zoom, e.center).min;
      L.DomUtil.setTransform(el, o, s);
    });
    new MutationObserver(desenha).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return { desenha };
  }
  // linhas: o T1 e o T2 de cada alimentador (polilinhas do Leaflet num canvas, que já sabe o mouse em cima da linha)
  const peso = (c, z) => (c === 'T1' ? 1.7 : 1.15) * (z < 8 ? 1 : z < 10 ? 1.4 : z < 12 ? 1.8 : 2.3);
  function estiloLinha(c, on) {
    const z = map.getZoom();
    return on ? { color: '#ffffff', weight: peso(c, z) + 2.4, opacity: 1 } : { color: COR[c], weight: peso(c, z), opacity: 0.9 };
  }
  function poeLinhas(lista) {
    if (!map || nLinhas) return;
    for (const a of lista) {
      const g = [];
      for (const c of ['T2', 'T1']) {                     // o tronco por cima
        if (!a[c].length) continue;
        const pl = L.polyline(a[c], Object.assign({ pane: 'st-linhas', renderer: rend, interactive: true, bubblingMouseEvents: false, smoothFactor: 1 }, estiloLinha(c)));
        pl._stCls = c; pl._stAl = a.cod;
        pl.on('mouseover', () => realca(a.cod)).on('mouseout', () => { if (sobre === a.cod) realca(null); }).on('click', () => abreAl(a.cod));
        pl.addTo(map);
        g.push(pl);
      }
      if (g.length) { grupos.set(a.cod, g); nLinhas++; }
    }
    if (estado === 'on') poeAviso(legenda(nLinhas));
  }
  function realca(cod) {
    if (sobre === cod) return;
    if (sobre && grupos.has(sobre)) grupos.get(sobre).forEach(pl => pl.setStyle(estiloLinha(pl._stCls)));
    sobre = cod;
    if (cod && grupos.has(cod)) {
      grupos.get(cod).forEach(pl => { pl.setStyle(estiloLinha(pl._stCls, true)); pl.bringToFront(); });
      if (window.ARGOS_PAG && window.ARGOS_PAG.prepara) window.ARGOS_PAG.prepara(cod);   // a página dele começa a vir
    }
    if (!cod) balao.hidden = true;
  }
  function abreAl(cod) {
    const p = `alimentadores/${encodeURIComponent(cod)}/`;
    if (window.ARGOS_PAG && window.ARGOS_PAG.abre) window.ARGOS_PAG.abre(p); else location.href = RAIZ + p;
  }
  function mostraBalao(e) {
    if (!sobre || estado !== 'on') { balao.hidden = true; return; }
    const a = infoAl(sobre), r = caixa.getBoundingClientRect(), ev = e.originalEvent;
    balao.innerHTML = `<b>${esc(sobre)}</b>${a.se ? `<span>${esc(a.se)}</span>` : ''}<span>Clique para abrir</span>`;
    const x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    balao.style.left = Math.min(x, r.width - balao.offsetWidth - 6) + 'px';
    balao.style.top = Math.min(y, r.height - 64) + 'px';
    balao.hidden = false;
  }
  async function cria() {
    L = window.L;
    TO = (window.TOCANTINS || []).filter(a => Array.isArray(a) && a.length > 2);
    if (!TO.length) throw new Error('sem o contorno do estado');
    limTO = L.latLngBounds([].concat(...TO));
    caixaSat = document.createElement('div');
    caixaSat.className = 'st-sat';
    caixaSat.setAttribute('role', 'region');
    caixaSat.setAttribute('aria-label', 'Satélite do Tocantins com as linhas T1 e T2 dos alimentadores');
    caixa.append(caixaSat);
    map = L.map(caixaSat, { zoomControl: false, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, maxZoom: 19, minZoom: 0,
      fadeAnimation: true, maxBoundsViscosity: 1, worldCopyJump: false });
    map.attributionControl.setPrefix(false);
    const v0 = vistaDoSvg();
    map.setView(v0 ? v0.c : limTO.getCenter(), v0 ? v0.z : 7, { animate: false });
    camadas(await urlGoogle());
    mascara = criaMascara();
    paneL = map.createPane('st-linhas');
    paneL.classList.add('st-linhas');
    paneL.style.opacity = '0';
    rend = L.canvas({ padding: 0.5, tolerance: 5, pane: 'st-linhas' });
    balao = document.createElement('div');
    balao.className = 'st-balao';
    balao.hidden = true;
    caixa.append(balao);
    map.on('mousemove', mostraBalao);
    map.on('mouseout', () => realca(null));
    map.on('zoomend', () => grupos.forEach(g => g.forEach(pl => pl.setStyle(estiloLinha(pl._stCls, pl._stAl === sobre)))));
    // a caixa mudou de tamanho (tela cheia, janela): refaz o mapa e o limite do zoom
    // (fechado, fica para o próximo Ctrl+S: abre() refaz o tamanho antes de tudo)
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (!map || estado === 'off') return;
      map.invalidateSize({ pan: false });
      if (estado === 'on') limites(true);
    }).observe(caixa);
    carregaLinhas().then(poeLinhas);
  }
  function limites(liga) {
    if (liga) {
      map.options.minZoom = 0;                             // (o enquadramento do estado não fica preso ao limite de antes)
      const v = vistaDoEstado();
      map.setMinZoom(v.z);
      map.setMaxBounds(limTO.pad(0.06));
    } else {
      map.setMaxBounds(null);
      map.setMinZoom(0);
    }
  }
  // muda a vista sem o viewreset do setView (que joga fora todos os quadros, inclusive os do fundo): o nítido baixa os da
  // vista nova; o fundo, que já tem o estado inteiro, fica
  function poeVista(c, z) {
    map.stop();
    map._moveStart(true, false);
    map._move(c, z)._moveEnd(true);
  }
  // espera a camada terminar de baixar os quadros (ou o tempo acabar)
  const pronta = (l, ms) => new Promise(ok => {
    if (!l || !l.isLoading()) { ok(); return; }
    const t = setTimeout(ok, ms);
    l.once('load', () => { clearTimeout(t); ok(); });
  });

  // ---------- animação ----------
  let estado = 'off', quadro = 0, vez = 0;              // off | carregando | abrindo | on | fechando
  let focoAntes = null;                                 // o foco de antes do satélite (volta para ele)
  const tempos = {};                                    // (medidas para os testes: pedido, começo e fim da animação)
  const suave = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const passo01 = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  // leva o mapa da vista de agora até v (centro, zoom e a correção da altura), com a opacidade da caixa op(t) (t de 0 a 1),
  // quadro a quadro como o voo do Leaflet (_move com flyTo: o nítido fica quieto; os quadros do pouso vêm no fim); devolve
  // uma promessa do fim (false se outra animação tomou o lugar)
  function anima(v, dur, op) {
    cancelAnimationFrame(quadro);
    const minha = ++vez;
    const z0 = map.getZoom(), p0 = map.project(map.getCenter(), z0), p1 = map.project(v.c, z0), z1 = v.z;
    const kIni = +caixaSat.dataset.k || 1;
    nitido._quieto = true;
    map.stop();
    map._moveStart(true, false);
    return new Promise(ok => {
      const t0 = performance.now();
      const fim = () => {
        nitido._quieto = false;
        map._move(v.c, z1)._moveEnd(true);
        caixaSat.style.opacity = String(op(1));
        caixaSat.dataset.k = v.k;
        caixaSat.style.transform = v.k === 1 ? '' : `scaleY(${v.k})`;
        ok(true);
      };
      if (!dur) { fim(); return; }
      const f = agora => {
        if (minha !== vez) { nitido._quieto = false; ok(false); return; }
        const t = Math.min(1, Math.max(0, (agora - t0) / dur));
        if (t >= 1) { fim(); return; }
        const e = suave(t), z = z0 + (z1 - z0) * e;
        map._move(map.unproject(p0.add(p1.subtract(p0).multiplyBy(e)), z0), z, { flyTo: true });
        const k = kIni + (v.k - kIni) * e;
        caixaSat.dataset.k = k;
        caixaSat.style.transform = Math.abs(k - 1) < 1e-4 ? '' : `scaleY(${k})`;
        caixaSat.style.opacity = String(op(t));
        quadro = requestAnimationFrame(f);
      };
      quadro = requestAnimationFrame(f);
    });
  }
  async function abre() {
    if (estado === 'on' || estado === 'abrindo' || estado === 'carregando') return;
    const raiox = alvo.classList.contains('raiox');
    if (raiox) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));   // desliga o raio-X
    const voltando = estado === 'fechando';
    estado = 'carregando';
    tempos.pedido = performance.now();
    const ae = document.activeElement;
    if (!voltando) focoAntes = ae && ae !== document.body && !(caixaSat && caixaSat.contains(ae)) ? ae : null;
    const minha = ++vez;
    poeEstilo();
    const tAviso = setTimeout(() => { if (estado === 'carregando') poeAviso('<b>Satélite</b><span>carregando…</span>'); }, 120);
    const recem = !map;
    try {
      await carregaLibs();
      if (!map) await cria();
      carregaLinhas().then(poeLinhas);
    } catch (e) {
      clearTimeout(tAviso);
      estado = 'off';
      poeAviso('<b>Satélite</b><span>não carregou (sem internet?)</span>');
      setTimeout(() => { if (estado === 'off' && aviso) aviso.hidden = true; }, 3500);
      return;
    }
    if (minha !== vez || estado !== 'carregando') { clearTimeout(tAviso); return; }   // Ctrl+S de novo enquanto carregava
    map.invalidateSize({ pan: false });
    limites(false);
    if (!voltando) {
      // nasce com a área do mapa dos municípios, invisível, e espera os quadros da partida e o fundo do estado
      const v0 = vistaDoSvg();
      if (v0 && !recem) poeVista(v0.c, v0.z);
      if (v0) { caixaSat.dataset.k = v0.k; caixaSat.style.transform = `scaleY(${v0.k})`; }
      caixaSat.style.opacity = '0';
      alvo.classList.add('sat-to');
      mascara.desenha();
      await Promise.all([pronta(fundo, 6000), pronta(nitido, 2500)]);
      if (minha !== vez || estado !== 'carregando') { clearTimeout(tAviso); return; }
    } else alvo.classList.add('sat-to');
    clearTimeout(tAviso);
    estado = 'abrindo';
    tempos.anim = performance.now();
    poeAviso(legenda(nLinhas));
    const o0 = +caixaSat.style.opacity || 0;
    const ok = await anima(vistaDoEstado(), calmo() ? 0 : DUR_ABRE, t => o0 + (1 - o0) * passo01(0, 0.7, t));
    if (!ok || estado !== 'abrindo') return;
    estado = 'on';
    tempos.on = performance.now();
    limites(true);
    paneL.style.opacity = '1';
    poeAviso(legenda(nLinhas));
    caixaSat.focus({ preventScroll: true });
  }
  async function fecha() {
    if (estado === 'off' || estado === 'fechando') return;
    if (estado === 'carregando') { ++vez; estado = 'off'; alvo.classList.remove('sat-to'); if (aviso) aviso.hidden = true; return; }
    estado = 'fechando';
    tempos.fecha = performance.now();
    realca(null);
    if (balao) balao.hidden = true;
    if (aviso) aviso.hidden = true;
    paneL.style.opacity = '0';
    limites(false);
    alvo.classList.remove('sat-to');                       // nomes e bandeiras do mapa voltam enquanto o satélite se dissolve
    caixaSat.style.visibility = 'visible';                 // (a classe saiu: fica visível até o fim)
    const v = vistaDoSvg() || vistaDoEstado(), o0 = caixaSat.style.opacity === '' ? 1 : +caixaSat.style.opacity;
    const ok = await anima(v, calmo() ? 0 : DUR_FECHA, t => o0 * (1 - passo01(0.25, 1, t)));
    caixaSat.style.visibility = '';
    if (!ok || estado !== 'fechando') return;
    estado = 'off';
    tempos.off = performance.now();
    caixaSat.style.opacity = '0';
    // o foco sai do satélite: volta para onde estava (sem o anel de foco num elemento que ninguém escolheu)
    const ae = document.activeElement;
    if (ae && caixaSat.contains(ae)) {
      if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); else ae.blur();
    }
  }
  const alterna = () => (estado === 'on' || estado === 'abrindo' || estado === 'carregando' ? fecha() : abre());

  // raio-X ligado (Ctrl+X, ou segurar o olho): o satélite fecha
  let rxAntes = alvo.classList.contains('raiox');
  new MutationObserver(() => {
    const rx = alvo.classList.contains('raiox');
    if (rx && !rxAntes && estado !== 'off' && estado !== 'fechando') fecha();
    rxAntes = rx;
  })
    .observe(alvo, { attributes: true, attributeFilter: ['class'] });

  // ---------- teclado ----------
  const visivel = () => !!(alvo.offsetParent || cheia());
  function tecla(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      if (!visivel()) return;
      e.preventDefault();                                  // sem o "Salvar página" do navegador
      if (e.repeat) return;
      alterna();
    } else if (e.key === 'Escape' && estado !== 'off' && estado !== 'fechando' && !e.defaultPrevented) {
      const ab = caixa.querySelector('.mt-abrindo');
      if (ab && !ab.hidden) return;                         // Esc cancela antes o "Abrindo…" do alimentador
      e.preventDefault();
      e.stopPropagation();                                  // o mapa não sobe de nível nem sai da tela cheia por este Esc
      fecha();
    }
  }
  window.addEventListener('keydown', tecla, true);
  // tela nova (central/): o mapa fica num quadro; com o foco na casca (dock, topo), o atalho chega lá
  try {
    const P = window.parent, fr = window.frameElement;
    if (P && P !== window && fr && P.document) {
      const h = e => { if (fr.getClientRects().length) tecla(e); };
      const poe = v => { try { P[v ? 'addEventListener' : 'removeEventListener']('keydown', h, true); } catch (er) { /* casca já foi */ } };
      poe(true);
      addEventListener('pagehide', () => poe(false));
      addEventListener('pageshow', e => { if (e.persisted) poe(true); });   // de volta pelo Voltar (bfcache)
    }
  } catch (e) { /* quadro de outra origem */ }
  // para os testes (scripts/teste_sat_to_tela.js)
  window.__satTo = { estado: () => estado, mapa: () => map, alterna, abre, fecha, linhas: () => nLinhas, sobre: () => sobre,
    vistaSvg: () => (L ? vistaDoSvg() : null), tempos };
})();
