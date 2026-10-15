// Divisas dos municípios no mapa do alimentador (roda depois de alimentador.js, com window.__map, e do municipios.js do
// alimentador, window.MUNICIPIOS, de scripts/gera_trechos.py): tracejado claro com contorno escuro, que se lê no satélite e
// no fundo escuro, por baixo da rede e sem clique (o toque segue para o trecho). O nome de cada município fica na parte
// dele que está na tela. A divisa do Tocantins (lados em `uf`) vem mais forte: traço mais grosso, traço-ponto.
// Sem a malha (MUNICIPIOS null), nada aparece.
// Com window.TOCANTINS (dados/tocantins.js, scripts/divisas.py) o contorno do estado inteiro sai com o traço da divisa do
// TO, completo (não só o pedaço perto da rede); os lados `uf` dos municípios só evitam o tracejado repetido.
// Para não pesar no zoom e no arrasto (era o que mais travava o mapa): as divisas vão num canvas próprio (no zoom o
// navegador só estica a imagem; o SVG tracejado era redesenhado a cada quadro); os nomes só são calculados depois que o
// mapa para, em pedaços pequenos (um município por vez, cancelados se o mapa voltar a mexer), com o teste de dentro do
// município feito por linha da grade e a rede embaixo deles achada pelos vãos já projetados.
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
  const tela = L.canvas({ pane: 'divisas' });           // canvas próprio, por baixo do da rede (mesma folga do da rede)
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
  const op = { renderer: tela, pane: 'divisas', interactive: false, dashArray: '8 6', lineCap: 'butt', lineJoin: 'round' };
  L.layerGroup([
    L.polyline(tracos, Object.assign({}, op, { color: escuro, weight: 4.5, opacity: .6 })),
    L.polyline(tracos, Object.assign({}, op, { color: claro, weight: 2, opacity: 1 })),
    L.polyline(limite, Object.assign({}, op, { color: escuro, weight: 7, opacity: .65, dashArray: '16 5 3 5' })),
    L.polyline(limite, Object.assign({}, op, { color: claro, weight: 3.5, opacity: 1, dashArray: '16 5 3 5' }))
  ].filter(l => l.getLatLngs().length)).addTo(map);

  // nome: um ponto de uma grade na tela (longe das bordas) dentro do município, de preferência fora da rede, e o mais
  // perto do meio da parte dele que aparece; município fora da tela fica sem nome
  // pontos da grade dentro do município, uma linha da grade por vez: os cruzamentos da linha com o contorno são achados
  // uma vez por linha (e não um teste do contorno inteiro para cada ponto); fora do retângulo do município, nem olha
  const caixaDeM = new Map();
  MU.forEach(m => {
    let s0 = 90, n0 = -90, w0 = 180, e0 = -180;
    m.linhas.forEach(a => a.forEach(([la, lo]) => { s0 = Math.min(s0, la); n0 = Math.max(n0, la); w0 = Math.min(w0, lo); e0 = Math.max(e0, lo); }));
    caixaDeM.set(m, [s0, n0, w0, e0]);
  });
  function naGrade(m, lats, lons) {
    const bb = caixaDeM.get(m), sai = [];
    if (lats[lats.length - 1] < bb[0] || lats[0] > bb[1] || lons[lons.length - 1] < bb[2] || lons[0] > bb[3]) return sai;
    for (const la of lats) {
      if (la < bb[0] || la > bb[1]) continue;
      const xs = [];
      for (const a of m.linhas) for (let i = 1; i < a.length; i++) {
        const p = a[i - 1], q = a[i];
        if ((p[0] > la) !== (q[0] > la)) xs.push(p[1] + (la - p[0]) * (q[1] - p[1]) / (q[0] - p[0]));
      }
      if (!xs.length) continue;
      xs.sort((x, y) => x - y);
      let k = 0;
      for (const lo of lons) {                           // dentro: um número ímpar de cruzamentos à direita do ponto
        while (k < xs.length && xs[k] <= lo) k++;
        if ((xs.length - k) % 2) sai.push([la, lo]);
      }
    }
    return sai;
  }
  const nomes = L.layerGroup().addTo(map);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const C = 12;                                          // px de cada célula da rede na tela
  const NOMES_DE = 9;                                    // zoom mínimo para escrever os nomes
  // células (C px) com a rede embaixo, pelos vãos do alimentador (dados.js), sem ler a imagem do mapa (ler o canvas da
  // rede faz o navegador desenhá-lo sem a placa de vídeo): as pontas dos vãos são projetadas uma vez (zoom 0) e, em cada
  // zoom, só escaladas e deslocadas para a tela
  let P0 = null;
  function ocupadas() {
    const tam = map.getSize(), GW = Math.ceil(tam.x / C) + 1, GH = Math.ceil(tam.y / C) + 1, g = new Uint8Array(GW * GH);
    const marca = (x, y) => { if (x >= 0 && y >= 0 && x < GW && y < GH) g[y * GW + x] = 1; };
    const oc = { has: (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && g[y * GW + x] === 1 };
    const V = window.D && window.D.vaos;
    if (!Array.isArray(V)) return oc;
    if (!P0) {
      const crs = map.options.crs;
      P0 = new Float64Array(V.length * 4);
      V.forEach((v, i) => {
        const a = crs.latLngToPoint(L.latLng(v[0], v[1]), 0), q = crs.latLngToPoint(L.latLng(v[2], v[3]), 0);
        P0[i * 4] = a.x; P0[i * 4 + 1] = a.y; P0[i * 4 + 2] = q.x; P0[i * 4 + 3] = q.y;
      });
    }
    const k = map.getZoomScale(map.getZoom(), 0), o = map.getPixelOrigin(), t = map.containerPointToLayerPoint([0, 0]);
    const dx = -o.x - t.x, dy = -o.y - t.y, X = tam.x, Y = tam.y;
    for (let i = 0; i < P0.length; i += 4) {
      const ax = P0[i] * k + dx, ay = P0[i + 1] * k + dy, qx = P0[i + 2] * k + dx, qy = P0[i + 3] * k + dy;
      if ((ax < 0 && qx < 0) || (ay < 0 && qy < 0) || (ax > X && qx > X) || (ay > Y && qy > Y)) continue;   // fora da tela
      const n = Math.max(1, Math.ceil(Math.hypot(qx - ax, qy - ay) / (C / 2)));
      for (let j = 0; j <= n; j++) marca(Math.floor((ax + (qx - ax) * j / n) / C), Math.floor((ay + (qy - ay) * j / n) / C));
    }
    return oc;
  }
  // o nome não fica embaixo dos cards do mapa (T1 T2 T3, camadas, legenda, tela cheia) nem dos rótulos dos trechos:
  // 0 livre, 1 fora da janela (a página rolou; só se não houver lugar livre), 2 coberto
  const caixaMapa = () => document.getElementById('map').getBoundingClientRect();
  // primeiro as caixas já conhecidas (rótulos dos trechos, controles do mapa e o que fica por cima dele na página: olho,
  // legendas, tela cheia), só conta; depois a sondagem do que mais estiver na tela
  const caixas = () => {
    const mc = map.getContainer(), els = [...map.getPane('markerPane').children].map(el => el.firstElementChild || el)
      .concat([...mc.querySelectorAll('.leaflet-control')]);
    if (mc.parentElement) for (const el of mc.parentElement.children) if (el !== mc) els.push(el, ...el.children);
    return els.map(el => el.getBoundingClientRect()).filter(b => b.width && b.height);
  };
  const coberto = (c, meio, r, rots) => {
    if (c.x - meio < 4 || c.x + meio > r.width - 4 || c.y < 12 || c.y > r.height - 12) return true;   // cortado na borda do mapa
    const x = r.left + c.x, y = r.top + c.y;
    return rots.some(b => b.left < x + meio && b.right > x - meio && b.top < y + 8 && b.bottom > y - 8);
  };
  const livre = (c, meio, r) => {
    let pior = 0;
    for (let d = -meio; d <= meio + 1; d += Math.max(10, meio / 4)) for (const h of [-5, 5]) {
      const el = document.elementFromPoint(r.left + c.x + Math.min(d, meio), r.top + c.y + h);
      const l = !el ? 1 : el.tagName === 'CANVAS' || el.id === 'map' || el.classList.contains('leaflet-pane') || el.closest('.leaflet-divisas-pane') ? 0 : 2;
      if (l === 2) return 2;
      pior = Math.max(pior, l);
    }
    return pior;
  };
  const largura = {};                                    // largura de cada nome na tela: medidas uma vez, todas juntas
  const mede = () => {
    const els = MU.filter(m => !largura[m.nome]).map(m => {
      const t = document.createElement('div');
      t.className = 'mun-nome';
      t.style.cssText = 'position:absolute;visibility:hidden;transform:none';
      t.textContent = m.nome;
      map.getContainer().append(t);
      return [m.nome, t];
    });
    els.forEach(([nome, t]) => { largura[nome] = t.getBoundingClientRect().width || nome.length * 10; });
    els.forEach(([, t]) => t.remove());
  };
  const meiaLargura = nome => largura[nome] / 2 + 4;
  let rodada = 0;                                        // cada movimento do mapa cancela a rodada de nomes em andamento
  map.on('movestart zoomstart', () => { rodada++; });
  // os nomes novos são escolhidos com os antigos ainda no mapa (sem clique: não atrapalham a sondagem) e trocados todos
  // juntos no fim: nada muda na página no meio da conta, e a sondagem não força o navegador a recalcular a página a cada nome
  function poeNomes() {
    const eu = ++rodada;
    if (map.getZoom() < NOMES_DE) { nomes.clearLayers(); return; }   // longe: os municípios ficam pequenos e os nomes se amontoam
    const postos = [], novos = [];                       // nomes já escolhidos (px da tela): um não cobre o outro
    const b = map.getBounds(), dy = b.getNorth() - b.getSouth(), dx = b.getEast() - b.getWest();
    const S = Math.max(s, b.getSouth() + dy * .06), N = Math.min(n, b.getNorth() - dy * .06);
    const W = Math.max(w, b.getWest() + dx * .06), E = Math.min(e, b.getEast() - dx * .06);
    if (!(S < N && W < E)) { nomes.clearLayers(); return; }
    mede();
    const G = 16, oc = ocupadas(), r = caixaMapa();
    const rots = caixas();                               // (o ícone dos rótulos não tem tamanho: vale o que está dentro dele)
    const lats = [], lons = [];
    for (let i = 0; i <= G; i++) { lats.push(S + (N - S) * i / G); lons.push(W + (E - W) * i / G); }
    const um = m => {
      const meus = naGrade(m, lats, lons);
      if (!meus.length) return;
      const cy = meus.reduce((t, p) => t + p[0], 0) / meus.length, cx = meus.reduce((t, p) => t + p[1], 0) / meus.length;
      const meio = meiaLargura(m.nome), cel = Math.ceil(meio / C);   // meia largura do nome (px e células)
      const cand = meus.map(p => {                       // células da rede embaixo do nome; depois, distância ao meio
        const c = map.latLngToContainerPoint(p), x = Math.floor(c.x / C), y = Math.floor(c.y / C);
        let k = 0;
        for (let i = -cel; i <= cel; i++) for (let j = -1; j <= 1; j++) k += oc.has(x + i, y + j);
        return [k * 1e6 + (p[0] - cy) ** 2 / dy ** 2 + (p[1] - cx) ** 2 / dx ** 2, p, c];
      }).sort((a, z) => a[0] - z[0]);
      let ok = null, vistos = 0;
      for (const x of cand) {
        if (postos.some(([px, py, pm]) => Math.abs(px - x[2].x) < pm + meio + 6 && Math.abs(py - x[2].y) < 18)) continue;
        if (coberto(x[2], meio, r, rots)) continue;
        if (++vistos > 12) break;                        // os melhores lugares primeiro: não precisa sondar todos
        const l = livre(x[2], meio, r);
        if (!l) { ok = x; break; }
        if (l === 1 && !ok) ok = x;
      }
      if (ok) { postos.push([ok[2].x, ok[2].y, meio]); novos.push([ok[1], m.nome]); }
    };
    const fila = MU.slice();
    const passo = () => {                                // um pouco por vez (sem tarefa longa); o mapa mexeu: para
      if (eu !== rodada) return;
      const t0 = performance.now();
      while (fila.length && performance.now() - t0 < 8) um(fila.shift());
      if (fila.length) { setTimeout(passo, 0); return; }
      nomes.clearLayers();
      novos.forEach(([p, nome]) => L.marker(p, { pane: 'divisas', interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="mun-nome">${esc(nome)}</div>` }) }).addTo(nomes));
    };
    setTimeout(passo, 0);                                // a conta começa na tarefa seguinte, depois do preparo acima
  }
  // depois que o mapa para (e uma vez só para vários movimentos seguidos): não trava o arrasto
  let espera = null;
  map.on('moveend resize', () => { clearTimeout(espera); espera = setTimeout(() => requestAnimationFrame(poeNomes), 150); });
  // 1ª vez depois dos scripts seguintes (cards das camadas no canto do mapa) e de novo no load (rótulos da faixa)
  const primeira = () => requestAnimationFrame(poeNomes);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', primeira); else primeira();
  if (document.readyState !== 'complete') addEventListener('load', primeira);
})();
