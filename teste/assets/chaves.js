// Chaves que não dividem trecho (88, faca 80, de passagem…): destaque no mapa só de perto (zoom 15,5 ou mais), como um
// quadradinho âmbar (não losango: losango é a Manutenção); com o zoom 17 ou mais, o código da chave ao lado.
// Os dados vêm do chaves.js do alimentador (window.CHAVES = [[nome, tipo, lat, lon], ...], gera_trechos.chaves_js); sem ele (ou vazio), nada aparece.
(function () {
  const CS = window.CHAVES, map = window.__map;
  if (!CS || !CS.length || !map || !window.L) return;
  const PERTO = 15.5, CODIGO = 17;
  const NOME = { '80': 'chave faca', '88': 'chave 88', '90': 'chave de passagem', '31': 'chave de passagem', '68': 'chave de passagem' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const s = document.createElement('style');
  s.textContent = '.ch-m{display:flex;align-items:center;gap:4px;transform:translate(-5px,-5px);pointer-events:auto}' +
    '.ch-m i{flex:none;width:10px;height:10px;box-sizing:border-box;background:#f59e0b;border:1.5px solid #111;border-radius:2px}' +
    '.ch-m b{display:none;font:600 10.5px/1 var(--f-mono,monospace);color:#1b2024;background:#fbfbf9;border:1px solid #1b2024;border-radius:3px;padding:2px 4px;white-space:nowrap}' +
    '#map.ch-cod .ch-m b{display:block}';
  document.head.append(s);
  const pane = map.createPane('chaves');
  pane.style.zIndex = 590;                                  // acima das linhas e dos fusíveis, abaixo dos rótulos e balões
  const grupo = L.layerGroup();
  const marcas = CS.map(([nome, tipo, lat, lon]) => L.marker([lat, lon], {
    pane: 'chaves', keyboard: false,
    icon: L.divIcon({ className: '', iconSize: null, html: `<div class="ch-m"><i></i><b>${esc(nome)}</b></div>` }),
  }).bindTooltip(`${esc(nome)} · ${esc(NOME[tipo] || 'chave ' + tipo)} · não divide trecho`, { direction: 'top', offset: [0, -6] }));
  const atualiza = () => {
    const z = map.getZoom(), b = map.getBounds().pad(0.2);
    document.getElementById('map').classList.toggle('ch-cod', z >= CODIGO);
    if (z < PERTO) { if (map.hasLayer(grupo)) grupo.remove(); return; }
    marcas.forEach(m => { const ver = b.contains(m.getLatLng()); if (ver && !grupo.hasLayer(m)) grupo.addLayer(m); else if (!ver && grupo.hasLayer(m)) grupo.removeLayer(m); });
    if (!map.hasLayer(grupo)) grupo.addTo(map);
  };
  map.on('zoomend moveend', atualiza);
  atualiza();
})();
