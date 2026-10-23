// RASCUNHO: modo "Limpeza de faixa" do painel do alimentador. Passo a passo (pedido do usuário):
//   1) o mapa fica na visualização normal dos trechos (T1 T2 T3 nas cores de sempre): as camadas ligadas (Faixa,
//      Inspeção…) são desligadas enquanto o modo está ligado e voltam ao sair;
//   2) Ctrl+M liga o modo: clicar nos trechos escolhe (contorno branco); clicar de novo tira;
//   3) com trecho escolhido aparece um painel mínimo: Leve / Pesada (ligar um e clicar no poste inicial e depois no final,
//      nos trechos escolhidos: marca todos os vãos do caminho mais curto entre os dois, mesmo passando de um trecho
//      escolhido para outro; o km de cada um aparece no botão) e, embaixo, "Baixar croqui" (o croqui de limpeza de faixa
//      do painel, croqui.js, já com os trechos escolhidos e os km marcados).
// O clique cai no poste (ponta de vão) mais perto, numa linha escolhida. O caminho marcado cobre a outra cor (o usuário
// escolheu os postes); Apagar tira a marca. Com a ferramenta ligada aparecem os postes (pontinhos), o anel no poste sob o
// mouse e, depois do inicial, a prévia tracejada do caminho com o km. Cada caminho marcado é uma alteração: o Ctrl+Z
// desfaz a última (ou o último trecho escolhido/tirado; com um poste inicial à espera, tira ele); Ctrl+Shift+Z ou Ctrl+Y refaz.
// Arrastar move o mapa normalmente (o clique que vem depois de arrastar não conta).
// Atalhos: Ctrl+M liga/desliga · L leve · P pesada · B apagar · Ctrl+Z desfaz · Esc tira o poste inicial (de novo: solta a
// ferramenta; de novo: sai). Abre em tela cheia (PC e celular) e só existe nela: sair da tela cheia sai do modo (o
// escolhido e o marcado ficam guardados). Celular: tocar no poste inicial e no final; 2 dedos dão zoom.
// Roda depois de alimentador.js (window.__map, window.D). Os km são a soma dos vãos (D.vaos[i][8], metros).
(function () {
  const map = window.__map, D = window.D, L = window.L, box = document.querySelector('.mapbox');
  if (!map || !L || !D || !Array.isArray(D.vaos) || !box) return;
  const mc = map.getContainer(), V = D.vaos, T = D.trechos;
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // cores que não se confundem com as dos trechos (T1 azul, T2 verde, T3 amarelo)
  const COR = { 1: '#22d3ee', 2: '#f43f5e' }, ALVO = { leve: 1, pesada: 2, apagar: 0 };

  // ---------- dados ----------
  const vaosDe = T.map(() => []); V.forEach((v, i) => vaosDe[v[4]].push(i));
  const extDe = vaosDe.map(l => l.reduce((s, i) => s + V[i][8], 0));
  let ativo = false, ferr = null, entrouTC = false, gavAberta = false, camadasDesligadas = [];
  // pedaços: o vão i tem np[i] pedaços iguais (de até PASSO m), guardados a partir de off[i] em marca (0 sem, 1 leve, 2 pesada)
  const PASSO = 5;
  const np = new Int32Array(V.length), off = new Int32Array(V.length + 1);
  V.forEach((v, i) => { np[i] = Math.max(1, Math.ceil(v[8] / PASSO)); off[i + 1] = off[i] + np[i]; });
  const sel = new Set(), marca = new Uint8Array(off[V.length]), undo = [], redo = [];
  let selV = [];
  // postes: as pontas dos vãos (D.vaos[i][6] e [7], com as coordenadas de cada ponta); G = postes dos vãos escolhidos e seus
  // vizinhos; ini = poste inicial à espera do final; arv = caminhos mais curtos a partir de ini; sob = poste sob o mouse
  const pos = new Map(); V.forEach(v => { pos.set(v[6], [v[0], v[1]]); pos.set(v[7], [v[2], v[3]]); });
  let G = null, ini = null, arv = null, sob = null;
  const toque = e => (e && e.pointerType) ? e.pointerType !== 'mouse' : matchMedia('(pointer:coarse)').matches;

  // ---------- projeção: pixels absolutos no zoom atual (não mudam ao arrastar o mapa) ----------
  const mx = (lon, s) => (lon + 180) / 360 * s;
  const my = (lat, s) => (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI)) * s;
  let todosP = null, selP = null;
  const projeta = lista => {
    const s = 256 * Math.pow(2, map.getZoom()), a = new Float64Array(lista.length * 4);
    for (let k = 0; k < lista.length; k++) { const v = V[lista[k]]; a[k * 4] = mx(v[1], s); a[k * 4 + 1] = my(v[0], s); a[k * 4 + 2] = mx(v[3], s); a[k * 4 + 3] = my(v[2], s); }
    return a;
  };
  const TODOS = V.map((_, i) => i);
  const abs = e => { const lp = map.containerPointToLayerPoint(map.mouseEventToContainerPoint(e)), o = map.getPixelOrigin(); return [lp.x + o.x, lp.y + o.y]; };
  const d2 = (px, py, a, k) => {
    const x1 = a[k * 4], y1 = a[k * 4 + 1], dx = a[k * 4 + 2] - x1, dy = a[k * 4 + 3] - y1, l = dx * dx + dy * dy;
    let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx - px, cy = y1 + t * dy - py; return cx * cx + cy * cy;
  };
  const fora = (a, k, px, py, R) => {
    const x1 = a[k * 4], x2 = a[k * 4 + 2]; if ((x1 < px - R && x2 < px - R) || (x1 > px + R && x2 > px + R)) return true;
    const y1 = a[k * 4 + 1], y2 = a[k * 4 + 3]; return (y1 < py - R && y2 < py - R) || (y1 > py + R && y2 > py + R);
  };
  const vaoPerto = (px, py, tol) => {
    const a = todosP || (todosP = projeta(TODOS)); let m = tol * tol, r = -1;
    for (let k = 0; k < V.length; k++) { if (fora(a, k, px, py, tol)) continue; const d = d2(px, py, a, k); if (d <= m) { m = d; r = k; } }
    return r;
  };
  map.on('zoomend', () => { todosP = null; selP = null; if (ativo && sel.size) ui(); });

  // ---------- desenho: por cima da rede, num canvas próprio ----------
  map.createPane('faixa').style.zIndex = 450;
  map.getPane('faixa').style.pointerEvents = 'none';
  const rend = L.canvas({ pane: 'faixa' });
  const base = { renderer: rend, pane: 'faixa', interactive: false, lineCap: 'round', lineJoin: 'round' };
  const lHover = L.polyline([], Object.assign({}, base, { color: '#fde047', weight: 14, opacity: .6 }));
  const lCas = L.polyline([], Object.assign({}, base, { color: '#ffffff', weight: 11, opacity: .95 }));
  const lSem = L.layerGroup();                                    // vãos sem marca: na cor do próprio trecho
  const lLeve = L.polyline([], Object.assign({}, base, { color: COR[1], weight: 6.5, opacity: 1 }));
  const lPes = L.polyline([], Object.assign({}, base, { color: COR[2], weight: 6.5, opacity: 1 }));
  // por cima das linhas: os pontinhos dos postes (canvas próprio, só com a ferramenta ligada) e, mais acima, a prévia do
  // caminho, o poste inicial e o anel do poste sob o mouse
  ['faixa-pt', 'faixa-p'].forEach((n, k) => { map.createPane(n).style.zIndex = 451 + k; map.getPane(n).style.pointerEvents = 'none'; });
  const Postes = L.Layer.extend({
    onAdd(m) { this.c = L.DomUtil.create('canvas', 'leaflet-zoom-hide', m.getPane('faixa-pt')); m.on('moveend zoomend resize viewreset', this.desenha, this); this.desenha(); },
    onRemove(m) { m.off('moveend zoomend resize viewreset', this.desenha, this); L.DomUtil.remove(this.c); },
    desenha() {
      const m = this._map; if (!m) return;
      const c = this.c, t = m.getSize(), F = 100, w = t.x + 2 * F, h = t.y + 2 * F, r = window.devicePixelRatio || 1;
      L.DomUtil.setPosition(c, m.containerPointToLayerPoint([-F, -F]));
      c.width = w * r; c.height = h * r; c.style.width = w + 'px'; c.style.height = h + 'px';
      const z = m.getZoom();
      if (!ativo || ferr === null || !sel.size || z < 13) return;   // longe demais: os postes viram uma linha só
      const g = c.getContext('2d'), s = 256 * Math.pow(2, z), o = m.getPixelBounds().min, R = z >= 17 ? 3.5 : z >= 15 ? 3 : 2.5, Q = 2 * R + 3, usado = new Set();
      g.setTransform(r, 0, 0, r, 0, 0); g.beginPath();
      for (const p of grafo().keys()) {                          // um ponto por célula de Q px: não empilha onde há muitos
        const [la, lo] = pos.get(p), x = mx(lo, s) - o.x + F, y = my(la, s) - o.y + F;
        if (x < -R || y < -R || x > w + R || y > h + R) continue;
        const k = Math.floor(x / Q) * 65536 + Math.floor(y / Q); if (usado.has(k)) continue; usado.add(k);
        g.moveTo(x + R, y); g.arc(x, y, R, 0, 2 * Math.PI);
      }
      g.fillStyle = '#0b1220'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();   // escuros: não confundem com as chaves/postes do mapa
    }
  });
  const lPostes = new Postes();
  const rend2 = L.canvas({ pane: 'faixa-p' }), cima = Object.assign({}, base, { renderer: rend2, pane: 'faixa-p' });
  const lPrevF = L.polyline([], Object.assign({}, cima, { color: '#0b1220', weight: 10, opacity: .8 }));
  const lPrev = L.polyline([], Object.assign({}, cima, { weight: 5, opacity: 1, dashArray: '9 7', lineCap: 'butt' }));
  const mIni = L.circleMarker([0, 0], Object.assign({}, cima, { radius: 8, color: '#fff', weight: 3, opacity: 0, fillOpacity: 0 }));
  const mSob = L.circleMarker([0, 0], Object.assign({}, cima, { radius: 10, color: '#fff', weight: 2.5, opacity: 0, fillOpacity: 0 }));
  const tIni = L.tooltip({ permanent: true, direction: 'top', offset: [0, -11], className: 'fx-ini-tt', interactive: false }).setContent('Início');
  const camadas = [lHover, lCas, lSem, lLeve, lPes, lPostes, lPrevF, lPrev, mIni, mSob];
  const corF = () => ferr === 'apagar' ? '#94a3b8' : COR[ALVO[ferr]] || '#fff';
  let quadro = 0;
  const agenda = () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenha(); ui(); }); };
  function desenha() {
    const todos = [], le = [], pe = [], porCor = new Map();
    const sem = c => { if (!porCor.has(c)) porCor.set(c, []); return porCor.get(c); };
    for (const i of selV) {
      const v = V[i], n = np[i], o = off[i], ponto = t => [v[0] + (v[2] - v[0]) * t, v[1] + (v[3] - v[1]) * t];
      todos.push([[v[0], v[1]], [v[2], v[3]]]);
      for (let j = 0; j < n;) {                                   // corridas de pedaços com a mesma marca
        const m = marca[o + j]; let k = j + 1; while (k < n && marca[o + k] === m) k++;
        const seg = [ponto(j / n), ponto(k / n)];
        (m === 1 ? le : m === 2 ? pe : sem(T[v[4]].cor)).push(seg);
        j = k;
      }
    }
    lCas.setLatLngs(todos); lLeve.setLatLngs(le); lPes.setLatLngs(pe);
    lSem.clearLayers(); porCor.forEach((ss, c) => lSem.addLayer(L.polyline(ss, Object.assign({}, base, { color: c, weight: 5.5, opacity: 1 }))));
    lPostes.desenha();
  }

  // ---------- escolha dos trechos ----------
  function muda() {
    selV = []; [...sel].sort((a, b) => a - b).forEach(t => vaosDe[t].forEach(i => selV.push(i))); selP = null;
    G = null; arv = null; if (ini !== null && !grafo().has(ini)) ini = null;   // o poste inicial saiu da escolha (desfazer)
    if (!sel.size) ferr = null;
    aplicaFerr(); agenda();
  }

  // ---------- caminho entre dois postes, só pelos vãos escolhidos ----------
  const grafo = () => {
    if (G) return G;
    G = new Map(); const ad = (a, b, i) => { let l = G.get(a); if (!l) G.set(a, l = []); l.push([b, i]); };
    for (const i of selV) { ad(V[i][6], V[i][7], i); ad(V[i][7], V[i][6], i); }
    return G;
  };
  // Dijkstra a partir do poste o (peso = metros do vão): distância e de onde veio (poste, vão) cada poste alcançado
  function arvoreDe(o) {
    const g = grafo(), dist = new Map([[o, 0]]), prev = new Map(), h = [[0, o]];
    const pop = () => {
      const top = h[0], fim = h.pop();
      if (h.length) { h[0] = fim; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m; } }
      return top;
    };
    const push = (d, p) => { h.push([d, p]); for (let i = h.length - 1; i;) { const j = (i - 1) >> 1; if (h[j][0] <= h[i][0]) break; [h[i], h[j]] = [h[j], h[i]]; i = j; } };
    while (h.length) {
      const [d, u] = pop(); if (d > dist.get(u)) continue;
      for (const [w, i] of g.get(u) || []) { const nd = d + V[i][8]; if (!(nd >= dist.get(w))) { dist.set(w, nd); prev.set(w, [u, i]); push(nd, w); } }
    }
    return { o, dist, prev };
  }
  // vãos do caminho de ini até p e o comprimento (m); null se não há caminho pelos trechos escolhidos
  function caminho(p) {
    if (ini === null) return null;
    if (!arv || arv.o !== ini) arv = arvoreDe(ini);
    if (!arv.dist.has(p)) return null;
    const vaos = []; for (let u = p; u !== ini;) { const [w, i] = arv.prev.get(u); vaos.push(i); u = w; }
    return { vaos, m: arv.dist.get(p) };
  }
  // marca o caminho inteiro com a ferramenta (cobre a outra cor): uma alteração só para o desfazer
  function marcaCaminho(vaos, alvo) {
    const rec = new Map();
    for (const i of vaos) for (let q = off[i]; q < off[i + 1]; q++) if (marca[q] !== alvo) { rec.set(q, marca[q]); marca[q] = alvo; }
    if (rec.size) { guarda({ m: rec }); agenda(); }
    return rec.size;
  }
  // desfazer: cada alteração é um item — um caminho marcado ({m: pedaço → marca de antes}) ou um trecho escolhido/tirado ({t})
  const guarda = a => { undo.push(a); if (undo.length > 500) undo.shift(); redo.length = 0; };
  function troca(de, para) {
    const a = de.pop(); if (!a) return false;
    if (a.m) { const volta = new Map(); a.m.forEach((antes, q) => { volta.set(q, marca[q]); marca[q] = antes; }); para.push({ m: volta }); agenda(); }
    else { sel.has(a.t) ? sel.delete(a.t) : sel.add(a.t); para.push(a); muda(); }   // escolher/tirar desfaz a si mesmo
    return true;
  }
  const desfaz = () => ini !== null ? (tiraIni(), true) : troca(undo, redo), refaz = () => troca(redo, undo);   // poste inicial à espera: desfazer tira só ele
  function totais() {
    let le = 0, pe = 0, s = 0;
    for (const i of selV) {
      const n = np[i], o = off[i], ml = V[i][8] / n;
      for (let j = 0; j < n; j++) { const m = marca[o + j]; if (m === 1) le += ml; else if (m === 2) pe += ml; else s += ml; }
    }
    return { leve: le, pesada: pe, falta: s };
  }

  // ---------- interface: aviso no alto (escolher trechos) e o painel mínimo (depois de escolher) ----------
  const css = document.createElement('style');
  css.textContent = `
.fx-pill{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1002;display:none;align-items:center;gap:10px;max-width:calc(100% - 140px);padding:6px 6px 6px 14px;border-radius:999px;background:var(--paper);color:var(--fg);border:1px solid var(--line);box-shadow:var(--sh2);font:600 13px var(--f-body);white-space:nowrap}
.fx-pill span{overflow:hidden;text-overflow:ellipsis}
.fx-pill button,.fx-dash button{font:inherit;color:inherit;cursor:pointer}
.fx-modo:not(.fx-tem) .fx-pill{display:flex}
.fx-dash{position:absolute;left:12px;bottom:28px;z-index:1002;width:min(320px,calc(100% - 24px));display:none;gap:8px;padding:10px;border-radius:16px;background:var(--paper);color:var(--fg);border:1px solid var(--line);box-shadow:var(--sh2);font:500 13px/1.3 var(--f-body)}
.fx-modo.fx-tem .fx-dash{display:grid}
.fx-modo .ctl-lgs,.fx-modo .tc-canto,.fx-modo .limp-chip{display:none!important}
.fx-cab{display:flex;align-items:center;gap:4px;min-width:0}
.fx-cab .fx-info{flex:1;min-width:0;padding-left:2px;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fx-cab .fx-info b{color:var(--fg);font-weight:700}
.fx-ic{flex:none;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:none}
.fx-ic:hover{background:var(--hover)}.fx-ic:disabled{opacity:.35;cursor:default}.fx-ic[aria-pressed=true]{background:var(--hover);color:var(--accent);box-shadow:inset 0 0 0 1.5px var(--accent)}
.fx-ic svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fx-x{font-size:17px}
.fx-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fx-t{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:8px;padding:9px 10px;border:1.5px solid var(--line);border-radius:12px;background:none;text-align:left}
.fx-t:hover{background:var(--hover)}
.fx-t i{grid-row:1/3;width:14px;height:14px;border-radius:50%;background:var(--c)}
.fx-t span{font-weight:700;font-size:13px}.fx-t b{font:700 16px var(--f-mono);font-variant-numeric:tabular-nums}.fx-t b small{font:500 11px var(--f-body);color:var(--muted)}
.fx-t[aria-pressed=true]{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
.fx-barra{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--hover)}.fx-barra span{display:block;height:100%}
.fx-dica-p{margin:0;font-size:11.5px;color:var(--muted);min-height:1.3em}
.fx-croqui{display:flex;align-items:center;justify-content:center;gap:8px;min-height:42px;border:0;border-radius:12px;background:var(--accent);color:var(--on-accent)!important;font-weight:700!important}
.fx-croqui:disabled{opacity:.6;cursor:default}
.fx-croqui svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.fx-ferr .leaflet-tooltip:not(.fx-ini-tt){display:none!important}
.fx-ferr .leaflet-interactive{cursor:inherit!important}
.leaflet-tooltip.fx-ini-tt{padding:1px 7px;border:0;border-radius:6px;background:var(--c,#fff);color:#0b1220;font:700 11px var(--f-body);box-shadow:0 1px 4px #0009}
.leaflet-tooltip.fx-ini-tt:before{border-top-color:var(--c,#fff)}
.fx-dica{position:absolute;z-index:1001;pointer-events:none;display:none;padding:4px 8px;border-radius:6px;background:#000d;color:#fff;font:600 12px var(--f-body);white-space:nowrap}
.fx-entrada{position:absolute;top:64px;left:12px;z-index:900;display:none;place-items:center;width:48px;height:44px;border:1px solid var(--vidro-borda);border-radius:999px;background:var(--vidro);color:var(--vidro-fg);box-shadow:var(--sh-vidro)}
.fx-entrada svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@media (pointer:coarse){.fx-entrada{display:grid}}.fx-modo .fx-entrada{display:none!important}
.fx-croqui-km{margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--hover);font-size:13px}.fx-croqui-km b{font-family:var(--f-mono)}
`;
  document.head.append(css);

  const SVG = {
    desfaz: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    apagar: '<svg viewBox="0 0 24 24"><path d="M4 16l9-10 7 6-6 7H8zM10 19h10"/></svg>',
    baixa: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
  };
  const pill = document.createElement('div');
  pill.className = 'fx-pill'; pill.setAttribute('role', 'status');
  pill.innerHTML = `<span>${matchMedia('(pointer:coarse)').matches ? 'Toque' : 'Clique'} nos trechos da limpeza de faixa</span><button type="button" class="fx-ic fx-x" title="Sair (Esc)" aria-label="Sair do modo limpeza de faixa">✕</button>`;
  const dash = document.createElement('div');
  dash.className = 'fx-dash'; dash.setAttribute('role', 'region'); dash.setAttribute('aria-label', 'Limpeza de faixa');
  dash.innerHTML = `<div class="fx-cab"><span class="fx-info" id="fx-info"></span>
  <button type="button" class="fx-ic" id="fx-apagar" aria-pressed="false" title="Apagar marca (B)" aria-label="Apagar marca">${SVG.apagar}</button>
  <button type="button" class="fx-ic" id="fx-desfaz" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">${SVG.desfaz}</button>
  <button type="button" class="fx-ic fx-x" title="Sair (Esc)" aria-label="Sair do modo limpeza de faixa">✕</button></div>
<div class="fx-tools">
  <button type="button" class="fx-t" data-f="leve" aria-pressed="false" style="--c:${COR[1]}" title="Leve (L): ligue e clique no poste inicial e no final"><i></i><span>Leve</span><b id="fx-L">0,00 <small>km</small></b></button>
  <button type="button" class="fx-t" data-f="pesada" aria-pressed="false" style="--c:${COR[2]}" title="Pesada (P): ligue e clique no poste inicial e no final"><i></i><span>Pesada</span><b id="fx-P">0,00 <small>km</small></b></button>
</div>
<div class="fx-barra" id="fx-barra" aria-hidden="true"></div>
<p class="fx-dica-p" id="fx-dica-p"></p>
<button type="button" class="fx-croqui" id="fx-croqui">${SVG.baixa}Baixar croqui</button>`;
  // sem teclado (celular) não há Ctrl+M: um botão pequeno, embaixo do olho, só em tela de toque
  const entrada = document.createElement('button');
  entrada.type = 'button'; entrada.className = 'fx-entrada';
  entrada.title = 'Limpeza de faixa'; entrada.setAttribute('aria-label', 'Limpeza de faixa: escolher trechos e marcar leve e pesada');
  entrada.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l3-1 11-11-2-2L5 17zM14 6l2 2"/></svg>';
  box.append(pill, dash, entrada);
  const $ = id => dash.querySelector('#' + id);
  const bDica = L.DomUtil.create('div', 'fx-dica', box);

  let tAviso = 0;
  function ui() {
    const t = totais(), tot = t.leve + t.pesada + t.falta, n = sel.size;
    box.classList.toggle('fx-tem', ativo && n > 0);
    if (!n) return;
    $('fx-info').innerHTML = `<b>${n} trecho${n > 1 ? 's' : ''}</b> · ${km(tot)} km · falta ${km(t.falta)} km`;
    $('fx-L').innerHTML = `${km(t.leve)} <small>km</small>`; $('fx-P').innerHTML = `${km(t.pesada)} <small>km</small>`;
    $('fx-barra').innerHTML = tot ? `<span style="width:${t.leve / tot * 100}%;background:${COR[1]}"></span><span style="width:${t.pesada / tot * 100}%;background:${COR[2]}"></span>` : '';
    $('fx-desfaz').disabled = !undo.length && ini === null;
    dash.querySelectorAll('.fx-t').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === ferr)));
    $('fx-apagar').setAttribute('aria-pressed', String(ferr === 'apagar'));
    if (tAviso) return;
    const cq = toque() ? 'Toque' : 'Clique';
    $('fx-dica-p').textContent = ferr ? (ini === null ? `${cq} no poste inicial e depois no final.` :
      `Agora ${cq.toLowerCase()} no poste final${toque() ? ' (no inicial de novo cancela).' : '. Esc cancela o inicial.'}`) +
      (map.getZoom() < 15 ? ' Aproxime para acertar o poste.' : '') : `${cq} em outro trecho para somar, ou ligue Leve ou Pesada.`;
  }
  function aviso(t, cor) {
    const p = $('fx-dica-p'); p.textContent = t; p.style.color = cor || '#f59e0b';
    clearTimeout(tAviso); tAviso = setTimeout(() => { tAviso = 0; p.style.color = ''; ui(); }, 2800);
  }
  const calaAviso = () => { if (tAviso) { clearTimeout(tAviso); tAviso = 0; $('fx-dica-p').style.color = ''; } };   // o aviso velho sai na ação seguinte

  // ---------- ferramentas ----------
  function aplicaFerr() {
    if (!ferr) ini = null;                                         // soltar a ferramenta tira o poste inicial
    calaAviso();
    box.classList.toggle('fx-ferr', ativo && !!ferr);
    mc.style.cursor = ativo && !ferr ? 'pointer' : '';
    sob = null; bDica.style.display = 'none'; lHover.setLatLngs([]);
    ponta(); ui(); agenda();
  }
  const setFerr = f => { ferr = ferr === f ? null : f; aplicaFerr(); };   // tocar de novo solta: volta a escolher trechos

  // com Leve/Pesada/Apagar ligado: o clique cai no poste mais perto, numa linha escolhida (até TOL px dela); o 1º é o
  // inicial, o 2º o final (marca o caminho entre os dois); clicar de novo no inicial o tira. Arrastar move o mapa.
  const TOL = e => toque(e) ? 24 : 14;
  function posteEm(px, py, tol) {                                 // a ponta mais perto, entre os vãos escolhidos perto do ponto
    const a = selP || (selP = projeta(selV)), t2 = tol * tol; let r = null, m = Infinity;
    for (let k = 0; k < selV.length; k++) {
      if (fora(a, k, px, py, tol) || d2(px, py, a, k) > t2) continue;
      for (let j = 0; j < 2; j++) { const d = (a[k * 4 + 2 * j] - px) ** 2 + (a[k * 4 + 2 * j + 1] - py) ** 2; if (d < m) { m = d; r = V[selV[k]][6 + j]; } }
    }
    return r;
  }
  const metros = m => m < 1000 ? `${Math.round(m)} m` : `${km(m)} km`;
  const nomeF = () => ({ leve: 'Leve', pesada: 'Pesada' })[ferr];
  // desenha o poste inicial, o anel do poste sob o mouse e a prévia do caminho entre eles; devolve esse caminho
  function ponta() {
    const on = ativo && ferr !== null, c = corF(), some = { opacity: 0, fillOpacity: 0 };
    if (on && ini !== null) {
      mIni.setLatLng(pos.get(ini)).setStyle({ opacity: 1, fillOpacity: 1, fillColor: c });
      tIni.setLatLng(pos.get(ini)); if (!map.hasLayer(tIni)) tIni.addTo(map);
      tIni.getElement().style.setProperty('--c', c);
    } else { mIni.setStyle(some); tIni.remove(); }
    const s = on ? sob : null, k = s !== null && s !== ini ? caminho(s) : null;
    if (s !== null) mSob.setLatLng(pos.get(s)).setStyle({ opacity: 1, fillOpacity: .5, fillColor: c }); else mSob.setStyle(some);
    const segs = k ? k.vaos.map(i => [[V[i][0], V[i][1]], [V[i][2], V[i][3]]]) : [];
    lPrevF.setLatLngs(segs); lPrev.setStyle({ color: c }).setLatLngs(segs);
    return k;
  }
  function tiraIni() { ini = null; calaAviso(); ponta(); ui(); }
  function clicaPoste(e) {
    calaAviso();
    const [x, y] = abs(e), p = posteEm(x, y, TOL(e));
    if (p === null) {                                             // fora das linhas escolhidas: nada (num trecho não escolhido, avisa)
      if (vaoPerto(x, y, TOL(e)) >= 0) aviso(`Trecho não escolhido. Solte a ferramenta (${toque(e) ? 'toque nela de novo' : 'Esc'}) para escolher mais trechos.`);
      return;
    }
    if (ini === null) ini = p;
    else if (p === ini) ini = null;
    else {
      const k = caminho(p);
      if (!k) { aviso('Não há caminho entre esses postes pelos trechos escolhidos.'); return; }
      const n = marcaCaminho(k.vaos, ALVO[ferr]); ini = null;
      aviso(!n ? 'Esse caminho já estava assim.' : nomeF() ? `${nomeF()}: ${metros(k.m)} marcados.` : `Apagado: ${metros(k.m)}.`, 'var(--fg)');
    }
    ponta(); ui(); if (!toque(e)) paira(e);
  }
  // mouse com a ferramenta ligada: o anel no poste onde o clique vai cair; com o inicial marcado, a prévia até ele e o km
  function paira(e) {
    if (!ativo || !ferr) return;
    const [x, y] = abs(e); sob = posteEm(x, y, 14);
    const k = ponta(), f = nomeF(); mc.style.cursor = sob === null ? '' : 'pointer';
    if (sob === null) { bDica.style.display = 'none'; return; }
    const r = box.getBoundingClientRect();
    bDica.textContent = ini === null ? `Poste inicial · ${f || 'Apagar'}` : sob === ini ? 'Clique de novo para tirar o inicial' :
      k ? `${metros(k.m)} · clique para ${f ? 'marcar ' + f : 'apagar'}` : 'Sem caminho pelos trechos escolhidos';
    bDica.style.cssText = `display:block;left:${Math.min(e.clientX - r.left + 14, r.width - 230)}px;top:${e.clientY - r.top + 16}px`;
  }
  let pm = 0;
  mc.addEventListener('pointermove', e => {
    if (!ativo || !ferr || e.pointerType !== 'mouse' || pm) return;
    if (e.buttons) { if (sob !== null) { sob = null; ponta(); bDica.style.display = 'none'; } return; }   // arrastando o mapa
    pm = requestAnimationFrame(() => { pm = 0; paira(e); });
  });
  map.on('movestart zoomstart', () => { if (sob !== null) { sob = null; ponta(); bDica.style.display = 'none'; } });

  // escolher trechos (e, com a ferramenta, os postes): o clique é tomado antes do Leaflet (que selecionaria o trecho do
  // jeito normal do painel); depois de arrastar o mapa não conta
  let down = null;
  mc.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; }, true);
  mc.addEventListener('click', e => {
    if (!ativo || e.target.closest('.leaflet-control, .leaflet-popup')) return;
    e.stopPropagation();
    if (map.dragging.moved() || (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)) return;
    if (ferr) return clicaPoste(e);
    const [x, y] = abs(e), k = vaoPerto(x, y, toque(e) ? 22 : 12);
    if (k < 0) return;
    const ti = V[k][4]; sel.has(ti) ? sel.delete(ti) : sel.add(ti);
    guarda({ t: ti });
    muda(); lHover.setLatLngs([]); bDica.style.display = 'none';
  }, true);
  mc.addEventListener('dblclick', e => { if (ativo) e.stopPropagation(); }, true);
  let mov = 0;
  mc.addEventListener('mousemove', e => {                         // passar o mouse: o trecho acende, com nome e km
    if (!ativo || ferr || mov) return;
    mov = requestAnimationFrame(() => {
      mov = 0;
      const [x, y] = abs(e), k = vaoPerto(x, y, 12);
      if (k < 0) { lHover.setLatLngs([]); bDica.style.display = 'none'; return; }
      const ti = V[k][4], r = box.getBoundingClientRect();
      lHover.setLatLngs(vaosDe[ti].map(i => [[V[i][0], V[i][1]], [V[i][2], V[i][3]]]));
      bDica.textContent = `${T[ti].nome} · ${km(extDe[ti])} km${sel.has(ti) ? ' · clique para tirar' : ''}`;
      bDica.style.cssText = `display:block;left:${Math.min(e.clientX - r.left + 14, r.width - 200)}px;top:${e.clientY - r.top + 16}px`;
    });
  });
  mc.addEventListener('mouseleave', () => { lHover.setLatLngs([]); bDica.style.display = 'none'; if (sob !== null) { sob = null; ponta(); } });

  // ---------- botões ----------
  pill.addEventListener('click', e => { if (e.target.closest('.fx-x')) desliga(); });
  dash.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('fx-x')) return desliga();
    if (b.dataset.f) return setFerr(b.dataset.f);
    if (b.id === 'fx-apagar') return setFerr('apagar');
    if (b.id === 'fx-desfaz') return desfaz();
    if (b.id === 'fx-croqui') return croqui();
  });
  // croqui: o do painel com os trechos escolhidos e o marcado no mapa no mesmo croqui (Leve = Expedita, Pesada =
  // Convencional; croqui-rascunho.js, que nas páginas de rascunho entra no lugar do croqui.js)
  async function croqui() {
    if (!window.__croqui) { aviso('O croqui não está disponível nesta página.'); return; }
    const t = totais();
    if (!t.leve && !t.pesada) { aviso('Marque Leve ou Pesada antes de baixar o croqui.'); return; }
    const nomes = [...sel].sort((a, b) => a - b).map(i => T[i].nome);
    const bt = $('fx-croqui'); bt.disabled = true;
    try { await window.__croqui(nomes, { leve: t.leve / 1000, pesada: t.pesada / 1000 }); } finally { bt.disabled = false; }
  }

  // ---------- ligar e desligar ----------
  const kb = navigator.keyboard;
  // o foco estava num botão que some (Tela cheia, lápis, ✕ do painel mínimo): vai para o mapa, não se perde
  const resgata = () => requestAnimationFrame(() => { const a = document.activeElement; if (!a || a === document.body || !a.getClientRects().length) mc.focus({ preventScroll: true }); });
  entrada.addEventListener('click', () => liga());
  function liga() {
    if (ativo) return;
    ativo = true;
    // 1) visualização normal dos trechos: desliga as camadas (Faixa, Inspeção…) e guarda quais eram, para religar ao sair
    camadasDesligadas = [...document.querySelectorAll('#ctl-camadas .ctl-card > button')].filter(b => b.getAttribute('aria-pressed') === 'true');
    camadasDesligadas.forEach(b => b.click());
    map.closePopup();
    if (window.__limpar) window.__limpar();                      // sem o trecho escolhido do jeito normal por baixo
    // 2) sempre em tela cheia (o fx-modo vai antes: com ele a tela cheia não abre o painel lateral sozinha); se o
    //    painel lateral estava aberto, fecha e guarda, para reabrir ao sair (se ainda em tela cheia)
    box.classList.add('fx-modo');
    if (window.__telaCheia && !document.body.classList.contains('tela-cheia')) { window.__telaCheia(); entrouTC = true; }
    gavAberta = document.body.classList.contains('tc-gaveta');
    if (gavAberta && window.__gaveta) window.__gaveta(false);
    // na tela cheia do navegador o Esc é dele (sairia da tela cheia e do modo): com o Esc preso ele vem para cá (tira o poste
    // inicial, solta a ferramenta, sai do modo) e segurar o Esc sai da tela cheia (Chrome/Edge; nos outros o Esc sai do modo)
    if (kb && kb.lock) kb.lock(['Escape']).catch(() => {});
    camadas.forEach(l => l.addTo(map));
    map.doubleClickZoom.disable();
    ferr = null; ini = null;
    selV = []; [...sel].sort((a, b) => a - b).forEach(t => vaosDe[t].forEach(i => selV.push(i))); selP = null;
    desenha(); aplicaFerr(); resgata();
  }
  function desliga() {
    if (!ativo) return;
    ativo = false; ferr = null; ini = null; sob = null;
    box.classList.remove('fx-modo', 'fx-tem', 'fx-ferr'); mc.style.cursor = '';
    camadas.forEach(l => l.remove()); tIni.remove();
    if (kb && kb.unlock) kb.unlock();
    map.dragging.enable(); map.doubleClickZoom.enable();
    bDica.style.display = 'none';
    camadasDesligadas.forEach(b => { if (b.getAttribute('aria-pressed') !== 'true') b.click(); }); camadasDesligadas = [];
    const tc = document.body.classList.contains('tela-cheia');
    if (entrouTC) { entrouTC = false; if (tc && window.__telaCheia) window.__telaCheia(); }
    else if (gavAberta && tc && !document.body.classList.contains('tc-gaveta')) {   // já estava em tela cheia: o painel lateral volta
      if (window.__gaveta) window.__gaveta(true);
    }
    gavAberta = false; resgata();
  }
  // o modo só existe em tela cheia: saiu dela (botão Tela cheia, Esc do navegador…) com o modo ligado, sai do modo também
  new MutationObserver(ms => {
    if (!ativo || document.body.classList.contains('tela-cheia') || !ms.some(m => /\btela-cheia\b/.test(m.oldValue || ''))) return;
    entrouTC = false; gavAberta = false; desliga();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  // ---------- teclado ----------
  const editavel = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.key === 'm' || e.key === 'M')) {
      if (document.querySelector('dialog[open]')) return;          // com uma caixa aberta (menu, croqui) o modo não liga por baixo dela
      e.preventDefault(); e.stopPropagation(); ativo ? desliga() : liga(); return;
    }
    if (!ativo || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      if (e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // segurar o Esc não corre a fila toda
      // o que está aberto por cima fecha antes: a barra/listas do olho (lupa-painel.js cuida) e o painel lateral
      if (document.querySelector('.mapbox>.barra-busca:not(.lp-fechada)') || [...document.querySelectorAll('.lp-drop,.lp-fdrop,.lp-sug,#mes-lista')].some(x => !x.hidden && x.getClientRects().length)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (document.body.classList.contains('tc-gaveta') && window.__gaveta) window.__gaveta(false);
      else if (ini !== null) tiraIni(); else if (ferr) { ferr = null; aplicaFerr(); } else desliga();
      return;
    }
    if (editavel(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {   // Ctrl+Z desfaz a última alteração; Ctrl+Shift+Z / Ctrl+Y refaz
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'KeyY' || e.shiftKey) refaz(); else desfaz();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const f = { l: 'leve', p: 'pesada', b: 'apagar' }[e.key.toLowerCase()];
    if (f && sel.size) { e.preventDefault(); setFerr(f); }
  }, true);

  // entrada pelo menu ☰ (Croqui de limpeza de faixa, menu.js): a página faixa-rascunho.html?modo=faixa já abre no modo;
  // o botão do aviso no alto da página ([data-faixa-abre]) também liga. Sem gesto do usuário a tela cheia do navegador é
  // recusada e o mapa cobre a janela (telacheia.js), com o mesmo modo.
  document.querySelectorAll('[data-faixa-abre]').forEach(b => b.addEventListener('click', () => liga()));
  if (/[?&]modo=faixa(&|$)/.test(location.search)) {
    const vai = () => setTimeout(() => { if (!ativo) liga(); }, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vai); else vai();
  }

  window.__faixa = { liga, desliga, ativo: () => ativo, sel: () => [...sel].map(i => T[i].nome), totais, marca, np, off, ferr: () => ferr, desfeitos: () => undo.length, inicio: () => ini };
})();
