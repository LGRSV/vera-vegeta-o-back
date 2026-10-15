// Divisas dos municípios no mapa do alimentador (roda depois de alimentador.js, com window.__map, e do municipios.js do
// alimentador, window.MUNICIPIOS, de scripts/gera_trechos.py): tracejado claro com contorno escuro, que se lê no satélite e
// no fundo escuro, por baixo da rede e sem clique (o toque segue para o trecho). O nome de cada município fica na parte
// dele que está na tela. A divisa do Tocantins (lados em `uf`) vem mais forte: traço mais grosso, traço-ponto.
// Sem a malha (MUNICIPIOS null), nada aparece.
// RASCUNHO: com window.TOCANTINS (dados/tocantins.js, scripts/divisas.py) o contorno do estado inteiro sai com o traço da
// divisa do TO, completo (não só o pedaço perto da rede); os lados `uf` dos municípios só evitam o tracejado repetido.
(function () {
  const MU = window.MUNICIPIOS, map = window.__map;
  if (!Array.isArray(MU) || !MU.length || !map || !window.L) return;

  const css = document.createElement('style');
  css.textContent = '.leaflet-divisas-pane{pointer-events:none}' +
    '.mun-nome{transform:translate(-50%,-50%);font:600 var(--t-xs)/1 var(--f-body);letter-spacing:.08em;text-transform:uppercase;' +
    'color:var(--vidro-fg);text-shadow:0 0 2px #000,0 0 4px rgb(0 0 0 / .9),0 1px 6px rgb(0 0 0 / .7);white-space:nowrap;opacity:.92;pointer-events:none}';
  document.head.append(css);

  // entre o satélite (200) e a rede (overlayPane, 400): a rede e o realce do trecho ficam sempre por cima
  map.createPane('divisas').style.zIndex = 350;
  const svg = L.svg({ pane: 'divisas', padding: 0.5 });
  const tok = (n, x) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || x;
  const claro = tok('--vidro-fg', '#f3f4f4'), escuro = tok('--mapbg', '#0f1417');

  // cada lado uma vez (a divisa de dois municípios vem nos dois) e sem os lados do corte (borda da área do arquivo)
  const [[s, w], [n, e]] = MU[0].corte;
  const doCorte = (p, q) => (p[0] === q[0] && (p[0] === s || p[0] === n)) || (p[1] === q[1] && (p[1] === w || p[1] === e));
  const chave = (p, q) => p < q ? p + '|' + q : q + '|' + p;
  const TO = Array.isArray(window.TOCANTINS) && window.TOCANTINS.length ? window.TOCANTINS : null;
  const feito = new Set(), tracos = [], limite = TO ? TO.slice() : [];
  MU.forEach(m => (m.uf || []).forEach(([a, de, ate]) => {   // divisa do TO primeiro: o tracejado do município não repete
    const pts = m.linhas[a].slice(de, ate + 1);
    if (!TO) limite.push(pts);
    for (let i = 1; i < pts.length; i++) feito.add(chave(pts[i - 1], pts[i]));
  }));
  MU.forEach(m => m.linhas.forEach(anel => {
    let atual = null;
    for (let i = 1; i < anel.length; i++) {
      const p = anel[i - 1], q = anel[i], k = chave(p, q);
      if (doCorte(p, q) || feito.has(k)) { atual = null; continue; }
      feito.add(k);
      if (!atual) tracos.push(atual = [p]);
      atual.push(q);
    }
  }));
  const op = { renderer: svg, pane: 'divisas', interactive: false, dashArray: '8 6', lineCap: 'butt', lineJoin: 'round' };
  L.layerGroup([
    L.polyline(tracos, Object.assign({}, op, { color: escuro, weight: 4.5, opacity: .6 })),
    L.polyline(tracos, Object.assign({}, op, { color: claro, weight: 2, opacity: 1 })),
    L.polyline(limite, Object.assign({}, op, { color: escuro, weight: 7, opacity: .65, dashArray: '16 5 3 5' })),
    L.polyline(limite, Object.assign({}, op, { color: claro, weight: 3.5, opacity: 1, dashArray: '16 5 3 5' }))
  ].filter(l => l.getLatLngs().length)).addTo(map);

  // nome: um ponto de uma grade na tela (longe das bordas) dentro do município, de preferência fora da rede, e o mais
  // perto do meio da parte dele que aparece; município fora da tela fica sem nome
  const dentro = (m, la, lo) => {
    let d = false;
    m.linhas.forEach(a => {
      for (let i = 1; i < a.length; i++) {
        const [y1, x1] = a[i - 1], [y2, x2] = a[i];
        if ((y1 > la) !== (y2 > la) && lo < x1 + (la - y1) * (x2 - x1) / (y2 - y1)) d = !d;
      }
    });
    return d;
  };
  const nomes = L.layerGroup().addTo(map);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = 12;                                          // px de cada célula da rede na tela
  const NOMES_DE = 9;                                    // zoom mínimo para escrever os nomes
  function ocupadas(b) {
    const oc = new Set(), bb = b.pad(.1);
    D.vaos.forEach(v => {
      if (!bb.contains([v[0], v[1]]) && !bb.contains([v[2], v[3]])) return;
      const a = map.latLngToContainerPoint([v[0], v[1]]), q = map.latLngToContainerPoint([v[2], v[3]]);
      const k = Math.max(1, Math.ceil(a.distanceTo(q) / (C / 2)));
      for (let i = 0; i <= k; i++) oc.add(Math.floor((a.x + (q.x - a.x) * i / k) / C) + ',' + Math.floor((a.y + (q.y - a.y) * i / k) / C));
    });
    return oc;
  }
  // o nome não fica embaixo dos cards do mapa (T1 T2 T3, camadas, legenda, tela cheia) nem dos rótulos dos trechos:
  // 0 livre, 1 fora da janela (a página rolou; só se não houver lugar livre), 2 coberto
  const caixaMapa = () => document.getElementById('map').getBoundingClientRect();
  const livre = (c, meio, r, rots) => {
    if (c.x - meio < 4 || c.x + meio > r.width - 4 || c.y < 12 || c.y > r.height - 12) return 2;   // cortado na borda do mapa
    const x = r.left + c.x, y = r.top + c.y;              // rótulos do mapa (alguns sem clique: o elementFromPoint não vê)
    if (rots.some(b => b.left < x + meio && b.right > x - meio && b.top < y + 8 && b.bottom > y - 8)) return 2;
    let pior = 0;
    for (let d = -meio; d <= meio + 1; d += Math.max(8, meio / 6)) for (const h of [-6, 0, 6]) {
      const el = document.elementFromPoint(r.left + c.x + Math.min(d, meio), r.top + c.y + h);
      const l = !el ? 1 : el.tagName === 'CANVAS' || el.id === 'map' || el.classList.contains('leaflet-pane') || el.closest('.leaflet-divisas-pane') ? 0 : 2;
      if (l === 2) return 2;
      pior = Math.max(pior, l);
    }
    return pior;
  };
  const largura = {};                                    // largura do nome na tela (medida uma vez)
  const meiaLargura = nome => {
    if (!largura[nome]) {
      const t = document.createElement('div');
      t.className = 'mun-nome';
      t.style.cssText = 'position:absolute;visibility:hidden;transform:none';
      t.textContent = nome;
      map.getContainer().append(t);
      largura[nome] = t.getBoundingClientRect().width || nome.length * 10;
      t.remove();
    }
    return largura[nome] / 2 + 4;
  };
  function poeNomes() {
    nomes.clearLayers();
    if (map.getZoom() < NOMES_DE) return;                // longe: os municípios ficam pequenos e os nomes se amontoam
    const postos = [];                                   // nomes já postos (px da tela): um não cobre o outro
    const b = map.getBounds(), dy = b.getNorth() - b.getSouth(), dx = b.getEast() - b.getWest();
    const S = Math.max(s, b.getSouth() + dy * .06), N = Math.min(n, b.getNorth() - dy * .06);
    const W = Math.max(w, b.getWest() + dx * .06), E = Math.min(e, b.getEast() - dx * .06);
    if (!(S < N && W < E)) return;
    const G = 16, pts = [], oc = ocupadas(b), r = caixaMapa();
    const rots = [...map.getPane('markerPane').children]     // o ícone sem tamanho: vale o que está dentro dele
      .map(el => (el.firstElementChild || el).getBoundingClientRect()).filter(b => b.width);
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) pts.push([S + (N - S) * i / G, W + (E - W) * j / G]);
    MU.forEach(m => {
      const meus = pts.filter(([la, lo]) => dentro(m, la, lo));
      if (!meus.length) return;
      const cy = meus.reduce((t, p) => t + p[0], 0) / meus.length, cx = meus.reduce((t, p) => t + p[1], 0) / meus.length;
      const meio = meiaLargura(m.nome), cel = Math.ceil(meio / C);   // meia largura do nome (px e células)
      const cand = meus.map(p => {                       // células da rede embaixo do nome; depois, distância ao meio
        const c = map.latLngToContainerPoint(p), x = Math.floor(c.x / C), y = Math.floor(c.y / C);
        let k = 0;
        for (let i = -cel; i <= cel; i++) for (let j = -1; j <= 1; j++) k += oc.has((x + i) + ',' + (y + j));
        return [k * 1e6 + (p[0] - cy) ** 2 / dy ** 2 + (p[1] - cx) ** 2 / dx ** 2, p, c];
      }).sort((a, z) => a[0] - z[0]);
      let ok = null;
      for (const x of cand) {
        if (postos.some(([px, py, pm]) => Math.abs(px - x[2].x) < pm + meio + 6 && Math.abs(py - x[2].y) < 18)) continue;
        const l = livre(x[2], meio, r, rots);
        if (!l) { ok = x; break; }
        if (l === 1 && !ok) ok = x;
      }
      if (ok) postos.push([ok[2].x, ok[2].y, meio]);
      if (ok) L.marker(ok[1], { pane: 'divisas', interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="mun-nome">${esc(m.nome)}</div>` }) }).addTo(nomes);
    });
  }
  // depois que o mapa para (e uma vez só para vários movimentos seguidos): não trava o arrasto
  let espera = null;
  map.on('moveend resize', () => { clearTimeout(espera); espera = setTimeout(() => requestAnimationFrame(poeNomes), 150); });
  // 1ª vez depois dos scripts seguintes (cards das camadas no canto do mapa) e de novo no load (rótulos da faixa)
  const primeira = () => requestAnimationFrame(poeNomes);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', primeira); else primeira();
  if (document.readyState !== 'complete') addEventListener('load', primeira);
})();
