// Ativos da linha com o mapa de perto: transformadores e outros equipamentos a partir do zoom 16, postes a partir do 17,5
// e o código escrito ao lado a partir do 18,5. Fusíveis, religadores e DJ já estão no mapa (alimentador.js); as chaves
// 88/faca vêm do chaves.js.
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
  function baixa() {                                        // ativos.js do alimentador, só na 1ª vez que chega perto
    if (A || pedindo) return;
    pedindo = true;
    const s = document.createElement('script');
    s.src = 'ativos.js';
    s.onload = () => { A = window.ATIVOS || { tr: [], eq: [] }; atualiza(); };
    s.onerror = () => { A = { tr: [], eq: [] }; };       // sem o arquivo: só os postes
    document.head.append(s);
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
  function ponto(k, tipo, lat, lon, txt) {
    const r = tipo === 'poste' ? (map.getZoom() >= Z_COD ? 3.5 : 2.5) : 4.5;
    return L.circleMarker([lat, lon], { renderer: ren, radius: r, color: '#111', weight: tipo === 'poste' ? 1 : 1.5,
      fillColor: COR[tipo], fillOpacity: 1, bubblingMouseEvents: false })
      .bindTooltip(txt, { direction: 'top', offset: [0, -4] })
      .on('click', e => { L.DomEvent.stopPropagation(e); e.target.openTooltip(); });
  }
  const txtTr = a => `Transformador ${esc(a[0])}${a[3] ? ' · trecho ' + esc(a[3]) : ''}`;
  const txtEq = a => `${esc(a[0])} · ${esc(TIPO[a[1]] || 'equipamento ' + a[1])}${a[4] ? ' · trecho ' + esc(a[4]) : ''}`;
  const txtPoste = a => `Poste ${esc(a[0])}${a[3] ? ' · trecho ' + esc(a[3]) : ''}`;
  let zAntes = null, pendente = false;
  function atualiza() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => { pendente = false; desenha(); });
  }
  function desenha() {
    const z = map.getZoom();
    if (z >= Z_EQ) baixa();
    const b = map.getBounds().pad(0.15), quer = new Map();
    const entra = (k, tipo, lat, lon, txt) => { if (lat >= b.getSouth() && lat <= b.getNorth() && lon >= b.getWest() && lon <= b.getEast()) quer.set(k, [tipo, lat, lon, txt]); };
    if (z >= Z_POSTE) listaPostes().forEach(a => entra('p' + a[0], 'poste', a[1], a[2], () => txtPoste(a)));
    if (z >= Z_EQ && A) {
      A.tr.forEach(a => entra('t' + a[0], 'tr', a[1], a[2], () => txtTr(a)));
      A.eq.forEach(a => entra('e' + a[0], 'eq', a[2], a[3], () => txtEq(a)));
    }
    const mudouRaio = zAntes !== null && (zAntes >= Z_COD) !== (z >= Z_COD);
    zAntes = z;
    vivos.forEach((m, k) => { if (!quer.has(k) || (mudouRaio && k[0] === 'p')) { pontos.removeLayer(m); vivos.delete(k); } });
    quer.forEach(([tipo, lat, lon, txt], k) => { if (!vivos.has(k)) { const m = ponto(k, tipo, lat, lon, txt()); vivos.set(k, m); pontos.addLayer(m); } });
    // códigos escritos: só bem de perto, no máximo ROTULOS e sem um cobrir o outro (equipamentos e trafos antes dos
    // postes: o trafo fica no poste, e o número do poste não pode esconder o código do trafo)
    rotulos.clearLayers();
    if (z >= Z_COD) {
      const caixas = [], tela = map.getSize();
      [...quer.keys()].sort((x, y) => 'etp'.indexOf(x[0]) - 'etp'.indexOf(y[0])).forEach(k => {
        if (caixas.length >= ROTULOS) return;
        const [, lat, lon] = quer.get(k), p = map.latLngToContainerPoint([lat, lon]);
        if (p.x < 0 || p.y < 0 || p.x > tela.x || p.y > tela.y) return;
        const c = [p.x + 5, p.y - 9, p.x + 5 + 7 * (k.length - 1) + 12, p.y + 9];      // onde o código fica escrito
        if (caixas.some(o => c[0] < o[2] && o[0] < c[2] && c[1] < o[3] && o[1] < c[3])) return;
        caixas.push(c);
        rotulos.addLayer(L.marker([lat, lon], { interactive: false, keyboard: false,
          icon: L.divIcon({ className: '', iconSize: null, html: `<div class="atv-cod">${esc(k.slice(1))}</div>` }) }));
      });
    }
    if (lg) {
      lg.hidden = z < Z_EQ;
      lg.querySelector('.atv-p').hidden = z < Z_POSTE;
    }
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
  window.__ativosZoom = { vivos: () => vivos.size, rotulos: () => rotulos.getLayers().length, carregado: () => !!A };   // para teste
})();
