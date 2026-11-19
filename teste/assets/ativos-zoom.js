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

  // ---------- desenho ----------
  const ren = map.options.renderer || L.canvas();          // o canvas das linhas: um só, sem bloquear o toque nelas
  const pontos = L.layerGroup().addTo(map), rotulos = L.layerGroup().addTo(map);
  const vivos = new Map();                                  // chave -> circleMarker na tela
  function ponto(k, tipo, lat, lon, txt, bal) {
    const r = tipo === 'poste' ? (map.getZoom() >= Z_COD ? 3.5 : 2.5) : 4.5;
    return L.circleMarker([lat, lon], { renderer: ren, radius: r, color: '#111', weight: tipo === 'poste' ? 1 : 1.5,
      fillColor: COR[tipo], fillOpacity: 1, bubblingMouseEvents: false })
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
    const entra = (pre, tipo, a, lat, lon, txt, bal) => { if (lat >= sul && lat <= norte && lon >= oeste && lon <= leste) quer.set(pre + a[0], [tipo, lat, lon, () => txt(a), () => bal(a), a]); };
    if (z >= Z_POSTE) for (const a of listaPostes()) entra('p', 'poste', a, a[1], a[2], txtPoste, balPoste);
    if (z >= Z_EQ && A) {
      for (const a of A.tr) entra('t', 'tr', a, a[1], a[2], txtTr, balTr);
      for (const a of A.eq) entra('e', 'eq', a, a[2], a[3], txtEq, balEq);
    }
    const mudouRaio = zAntes !== null && (zAntes >= Z_COD) !== (z >= Z_COD);
    zAntes = z;
    vivos.forEach((m, k) => { if (!quer.has(k) || (mudouRaio && k[0] === 'p')) { pontos.removeLayer(m); vivos.delete(k); } });
    quer.forEach(([tipo, lat, lon, txt, bal], k) => { if (!vivos.has(k)) { const m = ponto(k, tipo, lat, lon, txt(), bal); vivos.set(k, m); pontos.addLayer(m); } });
    if (lg) {                                               // a legenda antes dos códigos: ela também tampa o mapa
      lg.hidden = z < Z_EQ;
      lg.querySelector('.atv-p').hidden = z < Z_POSTE;
    }
    // códigos escritos: só bem de perto e no máximo ROTULOS (elementos na página): equipamentos e transformadores antes dos
    // postes (o trafo fica no poste: o número do poste não pode tomar o lugar do código do trafo) e, em cada tipo, os do meio
    // da tela antes. Nenhum fica de fora por cair em cima de outro ou de um controle do mapa: o arranjo dos números
    // (alimentador.js) põe cada um num lado livre, logo em seguida, no mesmo quadro
    rotulos.clearLayers();
    if (z >= Z_COD) {
      const tela = map.getSize(), cx = tela.x / 2, cy = tela.y / 2, l = [];
      quer.forEach(([tipo, lat, lon, , , a], k) => {
        const p = map.latLngToContainerPoint([lat, lon]);
        if (p.x < 0 || p.y < 0 || p.x > tela.x || p.y > tela.y) return;
        l.push([k, lat, lon, 'etp'.indexOf(k[0]), (p.x - cx) ** 2 + (p.y - cy) ** 2, prio(tipo, a), tipo === 'poste' ? (z >= Z_COD ? 3.5 : 2.5) : 4.5]);
      });
      l.sort((x, y) => x[3] - y[3] || x[4] - y[4]).slice(0, ROTULOS).forEach(([k, lat, lon, , , np, r]) => {
        rotulos.addLayer(L.marker([lat, lon], { interactive: false, keyboard: false,
          icon: L.divIcon({ className: '', iconSize: null, html: `<div class="atv-cod num-at" data-np="${np}" data-nr="${r + 1}">${esc(k.slice(1))}</div>` }) }));
      });
    }
    if (window.__numAtivos) window.__numAtivos.ja();     // o arranjo dos números já com os códigos novos (antes de pintar)
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
  window.__ativosZoom = { vivos: () => vivos.size, rotulos: () => rotulos.getLayers().length, carregado: () => !!A, pendente: () => pendente,
    pontos: () => [...vivos.values()].map(m => { const l = m.getLatLng(); return [l.lat, l.lng, m.options.radius]; }) };
})();
