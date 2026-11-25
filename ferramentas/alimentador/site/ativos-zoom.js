// Ativos da linha com o mapa de perto: transformadores e outros equipamentos a partir do zoom 16, postes a partir do 17,5
// e o código escrito ao lado a partir do 18,5. Fusíveis, religadores e DJ já estão no mapa (alimentador.js); as chaves
// 88/faca vêm do chaves.js. O clique (ou toque) num ponto abre o balão com Maps e Earth (window.__geo, alimentador.js).
// Os códigos escritos (.num-at) entram no arranjo dos números de alimentador.js (window.__numAtivos): nenhum some por cair
// em cima de outro; cada um procura um lado livre em volta do ponto dele e, sem nenhum, vai um pouco mais longe com uma
// linha até o ponto. Prioridade (data-np): trip saver 2 (no lugar de um fusível), chave 3, transformador 4, outros 5 e
// poste 6, depois de DJ (0) e religador (1).
// Para não pesar: o ativos.js do alimentador (scripts/ativos_js.py) só é baixado quando o mapa chega no zoom 16; os
// pontos são desenhados no canvas do mapa (o mesmo das linhas: nenhum elemento na página por ativo) e só os que estão
// na tela; os códigos escritos (elementos na página) são no máximo ROTULOS de uma vez. Os postes saem das pontas dos
// vãos do dados.js (já carregado), sem arquivo novo.
// Os alimentadores selecionados (selecionados.js) ganham o mesmo, nos mesmos zooms (pedido do usuário): ver abaixo.
(function () {
  const map = window.__map, D = window.D;
  if (!map || !window.L || !D) return;
  const Z_EQ = 16, Z_POSTE = 17.5, Z_COD = 18.5, ROTULOS = 80;
  const TIPO = { '02': 'chave 02', '40': 'trip saver 40', '41': 'trip saver 41', Capacitor: 'banco de capacitor', Regulador: 'regulador de tensão',
    Chave: 'chave', ChaveNA: 'chave NA' };
  const COR = { tr: '#a78bfa', eq: '#22d3ee', poste: '#f5f5f4' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = document.createElement('style');
  st.textContent = '.atv-cod{transform:translate(7px,-50%);font:600 10.5px/1 var(--f-mono,monospace);color:#1b2024;background:#fbfbf9e6;' +
    'border:1px solid #1b2024;border-radius:3px;padding:2px 4px;white-space:nowrap;pointer-events:none}' +
    '.atv-lg{background:#14181be6;color:#e7eaeb;border-radius:8px;padding:6px 9px;font:500 11.5px/1.5 var(--f-body,sans-serif);box-shadow:0 2px 8px #0006}' +
    '.atv-lg i{display:inline-block;width:9px;height:9px;border-radius:50%;border:1.5px solid #111;margin-right:5px;vertical-align:-1px}' +
    '.atv-lg span{display:block}.atv-lg[hidden]{display:none}';
  document.head.append(st);

  // ---------- dados ----------
  let A = null, pedindo = false, postes = null;
  // um pedido só, compartilhado com a busca (lupa-painel.js): quem chega primeiro baixa, o outro aproveita
  const carga = () => window.__ativosCarga || (window.__ativosCarga = new Promise(res => {
    if (window.ATIVOS) return res(window.ATIVOS);
    const s = document.createElement('script');
    s.src = 'ativos.js';
    s.onload = () => res(window.ATIVOS || { tr: [], eq: [] });
    s.onerror = () => res({ tr: [], eq: [] });          // sem o arquivo: só os postes
    document.head.append(s);
  }));
  function baixa() {                                        // ativos.js do alimentador, só na 1ª vez que chega perto
    if (A || pedindo) return;
    pedindo = true;
    carga().then(a => { A = a; atualiza(); });
  }
  function listaPostes() {                                  // pontas dos vãos com número de poste (os "N…" são nós sem poste)
    if (postes) return postes;
    const m = new Map();
    D.vaos.forEach(v => {
      const t = D.trechos[v[4]] ? D.trechos[v[4]].nome : '';
      if (v[6] && !/^N\d+$/.test(v[6]) && !m.has(v[6])) m.set(v[6], [v[6], v[0], v[1], t]);
      if (v[7] && !/^N\d+$/.test(v[7]) && !m.has(v[7])) m.set(v[7], [v[7], v[2], v[3], t]);
    });
    return (postes = [...m.values()]);
  }

  // ---------- selecionados (selecionados.js, window.__alSel: até 10 outros alimentadores no mapa) ----------
  // Os mesmos ativos, nos mesmos zooms, com o mesmo desenho e os códigos escritos no mesmo arranjo: postes das pontas dos
  // vãos deles (a geometria que selecionados.js já tem, __alSel.postes) e transformadores e outros equipamentos do ativos.js
  // de cada um (baixado como texto, sem trocar o window.ATIVOS deste, só quando o mapa chega no zoom 16 com ele na tela).
  // Pontos num canvas próprio (pane sel-atv, sem toque: o clique e o mouse são de selecionados.js, __ativosZoom.selEm; os
  // transformadores e outros que vizinhos.js também conhece continuam com o balão de lá), códigos no pane sel-rotulos
  // (fica à vista com o aberto escondido). Somem quando o selecionado sai.
  const SELS = () => window.__alSel && window.__alSel.prontos ? window.__alSel.prontos() : [];
  const faixa = () => !!(window.__faixa && window.__faixa.ativo && window.__faixa.ativo());
  const SEL = new Map();                                    // código → { A (ativos.js dele), ok, pedindo }
  const selDe = cod => SEL.get(cod) || (SEL.set(cod, { A: null, ok: false, pedindo: false }), SEL.get(cod));
  function baixaSel(cod, o) {
    if (o.A || o.pedindo || !window.__alSel.arquivo) return;
    o.pedindo = true;
    fetch(window.__alSel.arquivo(cod, 'ativos.js'))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(t => { const a = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); return { tr: a.tr || [], eq: a.eq || [], ok: true }; })
      .catch(() => ({ tr: [], eq: [], ok: false }))
      .then(a => {
        if (SEL.get(cod) !== o) return;                     // saiu enquanto vinha
        o.A = a; o.ok = a.ok;
        atualiza();
        if (o.ok && window.__alSel.eqMudou) window.__alSel.eqMudou(cod);   // o canvas de lá deixa os transformadores e outros para cá
      });
  }
  let renSel = null, pontosSel = null;
  function selPane() {
    if (renSel) return true;
    if (!map.getPane('sel-rotulos')) return false;          // (selecionados.js cria os panes deles na 1ª seleção)
    const pn = map.createPane('sel-atv');
    pn.style.zIndex = 396; pn.style.pointerEvents = 'none'; // por cima da rede e dos equipamentos deles (390, 395)
    renSel = L.canvas({ pane: 'sel-atv' });
    pontosSel = L.layerGroup().addTo(map);
    return true;
  }
  document.addEventListener('al:selecao', e => {
    const d = e.detail || {};
    if (d.motivo === 'sai' && d.al) SEL.delete(d.al);
    atualiza();
  });
  document.addEventListener('al:oculto', atualiza);

  // ---------- desenho ----------
  const ren = map.options.renderer || L.canvas();          // o canvas das linhas: um só, sem bloquear o toque nelas
  const pontos = L.layerGroup().addTo(map), rotulos = L.layerGroup().addTo(map);
  const vivos = new Map();                                  // chave -> circleMarker na tela
  const raio = (tipo, z) => tipo === 'poste' ? (z >= Z_COD ? 3.5 : 2.5) : 4.5;
  function ponto(k, tipo, lat, lon, txt, bal, sel) {
    const o = { radius: raio(tipo, map.getZoom()), color: '#111', weight: tipo === 'poste' ? 1 : 1.5, fillColor: COR[tipo], fillOpacity: 1 };
    if (sel) return L.circleMarker([lat, lon], Object.assign(o, { renderer: renSel, interactive: false }));   // (toque: selEm)
    return L.circleMarker([lat, lon], Object.assign(o, { renderer: ren, bubblingMouseEvents: false }))
      .bindTooltip(txt, { direction: 'top', offset: [0, -4] })
      .on('click', e => {
        L.DomEvent.stopPropagation(e);
        const G = window.__geo, [cod, sub] = bal();
        if (G) G.balao(e.target, cod, sub); else e.target.openTooltip();
      });
  }
  const txtTr = a => `Transformador ${esc(a[0])}${a[3] ? ' · trecho ' + esc(a[3]) : ''}`;
  const txtEq = a => `${esc(a[0])} · ${esc(TIPO[a[1]] || 'equipamento ' + a[1])}${a[4] ? ' · trecho ' + esc(a[4]) : ''}`;
  const txtPoste = a => `Poste ${esc(a[0])}${a[3] ? ' · trecho ' + esc(a[3]) : ''}`;
  // o balão (código e o que é, sem HTML: o balão escapa) e a prioridade do código escrito (data-np)
  const balTr = a => [a[0], `Transformador${a[3] ? ' · trecho ' + a[3] : ''}`];
  const balEq = a => [a[0], `${TIPO[a[1]] || 'equipamento ' + a[1]}${a[4] ? ' · trecho ' + a[4] : ''}`];
  const balPoste = a => [a[0], `Poste${a[3] ? ' · trecho ' + a[3] : ''}`];
  const prio = (tipo, a) => tipo === 'poste' ? 6 : tipo === 'tr' ? 4 : a[1] === '40' || a[1] === '41' ? 2 : /^(02|Chave|ChaveNA)$/.test(a[1]) ? 3 : 5;
  const ORD = { eq: 0, tr: 1, poste: 2 };                   // os códigos escritos: equipamentos, transformadores, postes
  let zAntes = null, pendente = false;
  function atualiza() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => { pendente = false; desenha(); });
  }
  function desenha() {
    const z = map.getZoom();
    if (z >= Z_EQ) baixa();
    // só o que está na tela (a caixa do mapa lida uma vez; a chave e o texto de cada ativo só para os que entram: são
    // milhares de postes olhados a cada parada do mapa)
    const b = map.getBounds().pad(0.15), quer = new Map(), sul = b.getSouth(), norte = b.getNorth(), oeste = b.getWest(), leste = b.getEast();
    let al = null;                                          // null: o aberto; o código: um selecionado
    const entra = (pre, tipo, a, lat, lon, txt, bal) => { if (lat >= sul && lat <= norte && lon >= oeste && lon <= leste) quer.set((al ? 's' + al + '|' : '') + pre + a[0], [tipo, lat, lon, () => txt(a), () => bal(a), a, al]); };
    if (z >= Z_POSTE) for (const a of listaPostes()) entra('p', 'poste', a, a[1], a[2], txtPoste, balPoste);
    if (z >= Z_EQ && A) {
      for (const a of A.tr) entra('t', 'tr', a, a[1], a[2], txtTr, balTr);
      for (const a of A.eq) entra('e', 'eq', a, a[2], a[3], txtEq, balEq);
    }
    const S = window.__alSel;
    if (z >= Z_EQ && S && !faixa() && SELS().length && selPane()) {
      for (const cod of SELS()) {
        const cx = S.caixa(cod);
        if (!cx || !b.intersects(cx)) continue;
        al = cod;
        const o = selDe(cod);
        baixaSel(cod, o);
        if (z >= Z_POSTE) for (const a of S.postes(cod) || []) entra('p', 'poste', a, a[1], a[2], txtPoste, balPoste);
        if (o.A) {
          for (const a of o.A.tr) entra('t', 'tr', a, a[1], a[2], txtTr, balTr);
          for (const a of o.A.eq) entra('e', 'eq', a, a[2], a[3], txtEq, balEq);
        }
      }
      al = null;
    }
    const mudouRaio = zAntes !== null && (zAntes >= Z_COD) !== (z >= Z_COD);
    zAntes = z;
    // (o raio dos postes mudou: todos saem e voltam na ordem, postes embaixo dos transformadores e equipamentos)
    vivos.forEach((m, k) => { if (!quer.has(k) || mudouRaio) { (m._sel ? pontosSel : pontos).removeLayer(m); vivos.delete(k); } });
    quer.forEach(([tipo, lat, lon, txt, bal, , sel], k) => {
      if (vivos.has(k)) return;
      const m = ponto(k, tipo, lat, lon, sel ? '' : txt(), bal, sel);
      m._tipo = tipo; m._sel = sel; m._q = quer.get(k);
      vivos.set(k, m); (sel ? pontosSel : pontos).addLayer(m);
    });
    if (lg) {                                               // a legenda antes dos códigos: ela também tampa o mapa
      lg.hidden = z < Z_EQ;
      lg.querySelector('.atv-p').hidden = z < Z_POSTE;
    }
    // códigos escritos: só bem de perto e no máximo ROTULOS (elementos na página): equipamentos e transformadores antes dos
    // postes (o trafo fica no poste: o número do poste não pode tomar o lugar do código do trafo) e, em cada tipo, os do meio
    // da tela antes. Nenhum fica de fora por cair em cima de outro ou de um controle do mapa: o arranjo dos números
    // (alimentador.js) põe cada um num lado livre, logo em seguida, no mesmo quadro. Os do aberto escondido (chip do menu
    // Alimentadores) não entram; os dos selecionados, no pane dos nomes deles
    rotulos.clearLayers();
    if (z >= Z_COD) {
      const tela = map.getSize(), cx = tela.x / 2, cy = tela.y / 2, l = [], oculto = !!(S && S.oculto && S.oculto());
      quer.forEach(([tipo, lat, lon, , , a, sel], k) => {
        if (!sel && oculto) return;
        const p = map.latLngToContainerPoint([lat, lon]);
        if (p.x < 0 || p.y < 0 || p.x > tela.x || p.y > tela.y) return;
        l.push([a[0], lat, lon, ORD[tipo], (p.x - cx) ** 2 + (p.y - cy) ** 2, prio(tipo, a), raio(tipo, z), sel]);
      });
      l.sort((x, y) => x[3] - y[3] || x[4] - y[4]).slice(0, ROTULOS).forEach(([cod, lat, lon, , , np, r, sel]) => {
        rotulos.addLayer(L.marker([lat, lon], { interactive: false, keyboard: false, pane: sel ? 'sel-rotulos' : 'markerPane',
          icon: L.divIcon({ className: '', iconSize: null, html: `<div class="atv-cod num-at" data-np="${np}" data-nr="${r + 1}"${sel ? ` data-al="${esc(sel)}"` : ''}>${esc(cod)}</div>` }) }));
      });
    }
    if (window.__numAtivos) window.__numAtivos.ja();     // o arranjo dos números já com os códigos novos (antes de pintar)
  }
  // o ativo de um selecionado no ponto pt do mapa (px do contêiner), a até tol px da borda dele: o mais perto; transformador
  // e equipamento antes do poste (o trafo fica no poste)
  function selEm(pt, tol) {
    if (!renSel || map._animatingZoom || !pt) return null;
    const q = map.containerPointToLayerPoint(pt);
    let melhor = null, dm = Infinity;
    vivos.forEach(m => {
      if (!m._sel || !m._point) return;
      const d = Math.hypot(m._point.x - q.x, m._point.y - q.y) - m.options.radius, pe = m._tipo === 'poste' ? 1 : 0;
      if (d <= tol && (pe < (melhor ? melhor._pe : 2) || (pe === melhor._pe && d < dm))) { melhor = m; melhor._pe = pe; dm = d; }
    });
    if (!melhor) return null;
    const [tipo, lat, lon, , bal, , al] = melhor._q, [cod, sub] = bal();
    return { al, tipo, cod, ll: [lat, lon], sub: `${sub} · ${al}`, dica: `${cod} · ${sub} · ${al}` };
  }

  // ---------- legenda (só de perto) ----------
  let lg = null;
  const Leg = L.Control.extend({ options: { position: 'topright' }, onAdd() {
    lg = L.DomUtil.create('div', 'atv-lg');
    lg.hidden = true;
    lg.innerHTML = `<span><i style="background:${COR.tr}"></i>Transformador</span><span><i style="background:${COR.eq}"></i>Outro equipamento</span>` +
      `<span class="atv-p"><i style="background:${COR.poste};width:7px;height:7px"></i>Poste</span>`;
    L.DomEvent.disableClickPropagation(lg);
    return lg;
  } });
  new Leg().addTo(map);
  map.on('zoomend moveend', atualiza);
  atualiza();
  // para teste; pendente e pontos: o arranjo dos números (alimentador.js) espera o desenho deste quadro e não põe código em
  // cima dos pontos (os que estão na tela, com o raio)
  // (selecionados: selEm o toque e o mouse; selTem: o ativos.js dele chegou; sel: o que está na tela de cada um)
  window.__ativosZoom = { vivos: () => vivos.size, rotulos: () => rotulos.getLayers().length, carregado: () => !!A, pendente: () => pendente,
    pontos: () => [...vivos.values()].map(m => { const l = m.getLatLng(); return [l.lat, l.lng, m.options.radius]; }),
    selEm: (pt, tol = 7) => selEm(pt, tol), selTem: cod => !!(SEL.get(cod) && SEL.get(cod).ok),
    sel: () => { const r = {}; vivos.forEach(m => { if (m._sel) { const o = r[m._sel] || (r[m._sel] = { poste: 0, tr: 0, eq: 0 }); o[m._tipo]++; } }); return r; },
    selPontos: cod => [...vivos.values()].filter(m => m._sel === cod).map(m => { const l = m.getLatLng(); return [l.lat, l.lng, m._tipo, m._q[5][0]]; }),
    selBaixados: () => [...SEL].filter(([, o]) => o.A).map(([c]) => c) };
})();
