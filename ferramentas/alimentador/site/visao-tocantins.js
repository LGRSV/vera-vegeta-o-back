// O Tocantins inteiro no mapa do alimentador (roda logo depois de vizinhos.js, com window.__map, window.__al e o contorno do
// estado, window.TOCANTINS de dados/tocantins.js, que a página carrega antes do mapa).
// - De longe (abaixo do zoom em que os vizinhos entram: window.__vizinhos.estado().zMin), o T1 e o T2 de todos os
//   alimentadores (dados/vizinhos/estado.txt, de scripts/gera_trechos.py, estado_txt: ~70 KB, simplificado em 150 m),
//   apagados e nas cores das classes como os vizinhos, sem rótulos, num canvas próprio abaixo dos vizinhos e da rede deste
//   (que fica inteira por cima). Dos vizinhos em diante ele fica até eles estarem na tela e então sai aos poucos: sem buraco
//   nem piscar. Tocar (ou clicar) numa linha de outro alimentador: o balão dos vizinhos (código e "Abrir alimentador").
// - Só o Tocantins: fora do estado, a cor de fundo do mapa. É uma máscara (o retângulo da vista com o furo do TO) num canvas
//   acima do satélite e abaixo dos vizinhos, das divisas e da rede, desenhada uma vez por vista (os quadros do satélite não
//   são recortados um a um); a borda é o próprio recorte, com uma sombra leve para dentro. O satélite nem pede os quadros
//   inteiros de fora do estado (alimentador.js: window.__quadroNoTO). Só de longe (abaixo do zoom 10, onde municipios.js
//   tira as divisas e o traço-ponto do estado): o contorno do estado (568 pontos) erra até ~750 m na borda, o que de perto
//   apareceria; dali em diante o mapa fica como antes (o satélite inteiro e o traço-ponto da divisa do TO).
// - Sem quadrados escuros: por baixo do satélite nítido, um fundo com os quadros do zoom 8 da mesma imagem (só os do TO,
//   uns 25, montados numa imagem só), e os do 6 e do 7 (os da vista do estado), baixados aos poucos com o mapa parado
//   (ficam só na memória e no cache do navegador). No voo e no zoom sempre há imagem (borrada) por baixo enquanto a nítida
//   chega e entra aos poucos; parado (e no arrasto) de perto ou no estado inteiro, o fundo se esconde.
// - Botão "Tocantins" (canto de baixo à direita, acima do Tela cheia; escondido no modo Limpeza de faixa): voa até o estado
//   inteiro e vira "Voltar ao alimentador", que voa de volta à vista com que o alimentador abre. Afastar com o dedo ou a
//   roda chega na mesma visão: o zoom mínimo do mapa é o do estado inteiro, e ao chegar nele o mapa centra o estado.
//   O voo é o da página inicial (mapa-municipios.js): a escala muda em progressão geométrica, numa curva suave (sem
//   animação com prefers-reduced-motion). No voo os canvas só esticam (a rede é refeita no pouso, como no zoom), o satélite
//   nítido espera o pouso e o fundo cobre o caminho; a camada do estado entra aos poucos no fim da ida e, na volta, é
//   refeita umas poucas vezes (quando já esticou 3×), na vista daquele quadro; a máscara, quando esticou 2,5×.
// Sem o contorno do estado ou fora do site, não faz nada.
(function () {
  const map = window.__map, L = window.L, D = window.D, AL = window.__al || null, eu = document.currentScript;
  const TO = Array.isArray(window.TOCANTINS) && window.TOCANTINS[0];
  if (!map || !L || !TO || TO.length < 3 || !eu || !/\/assets\/visao-tocantins\.js(\?|$)/.test(eu.src) ||
    !document.documentElement.classList.contains('al-site')) return;
  const BASE = new URL('../dados/vizinhos/', eu.src).href;
  const EU = (D && D.meta && D.meta.al) || (/\/alimentadores\/([^/]+)\//.exec(location.pathname) || [])[1] || '';
  const MOVEL = L.Browser.mobile || matchMedia('(pointer:coarse)').matches;
  const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = L.Browser.retina && !MOVEL ? 2 : 1;          // resolução do canvas das linhas (a dos vizinhos)
  const ALFA = 0.55;                                     // apagadas como as dos vizinhos
  const COR = { T1: '#3b82f6', T2: '#22c55e' };
  const larg = (c, z) => (c === 'T1' ? 2.4 : 1.9) * (z < 8 ? 0.7 : 1);   // as dos vizinhos; mais finas na visão do estado
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const visivel = c => !window.__visivel || window.__visivel[c] !== false;   // botões T1 T2 T3 do mapa
  const faixa = () => !!(window.__faixa && window.__faixa.ativo && window.__faixa.ativo());   // modo Limpeza de faixa
  const ux = lon => (lon + 180) / 360, uy = lat => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
  const PTO = TO.map(([la, lo]) => [ux(lo), uy(la)]);    // o contorno em unidades de Mercator (0 a 1)
  const caixaTO = L.latLngBounds(TO);
  const noTO = window.__quadroNoTO || null;              // alimentador.js: .borda(r) e .dentro(x, y) do contorno
  const mc = map.getContainer(), box = mc.closest('.mapbox') || mc.parentElement;

  const css = document.createElement('style');
  css.textContent = '.leaflet-mascara-to-pane,.leaflet-estado-to-pane,.leaflet-fundo-to-pane{pointer-events:none}.leaflet-fundo-to-pane img{max-width:none!important;max-height:none!important}.vto-tela{position:absolute;left:0;top:0}' +
    '.leaflet-estado-to-pane{transition:opacity .32s var(--ease,ease)}.leaflet-container.vto-mao{cursor:pointer}' +
    // acima do card Tela cheia (telacheia.js: 28 px do pé e 50 de altura), alinhado à direita com ele
    '.vto-canto{position:absolute;right:12px;bottom:86px;z-index:810}.mapbox.fx-modo .vto-canto{display:none}' +
    // no voo os rótulos e marcadores (DOM) saem e voltam no pouso, já no lugar (como os nomes no voo da página inicial):
    // fora da página, eles não pesam em cada quadro
    '.vto-voando :is(.leaflet-marker-pane,.leaflet-tooltip-pane,.leaflet-chaves-pane){display:none}' +
    '@keyframes vto-aparece{from{opacity:0}}.vto-pouso :is(.leaflet-marker-pane,.leaflet-tooltip-pane,.leaflet-chaves-pane){animation:vto-aparece .22s var(--ease,ease) both}' +
    '@media (min-width:701px) and (max-width:999px){body.tela-cheia.tc-gaveta .vto-canto{right:calc(min(420px,92vw) + 12px)}}' +
    // tela estreita: "Voltar ao alimentador" em duas linhas (a coluna das legendas, à esquerda, fica livre)
    '@media (max-width:480px){.ctl-card .vto-bt{max-width:116px;white-space:normal;text-align:left;line-height:1.15;padding:4px var(--s3)}}';
  document.head.append(css);
  map.createPane('mascara-to').style.zIndex = 250;      // acima do satélite (200); abaixo dos vizinhos (340), divisas (350) e rede (400)
  const paneE = map.createPane('estado-to');
  paneE.style.zIndex = 330;                              // abaixo dos vizinhos

  // ---------- canvas preso ao mapa ----------
  // Como os canvas do Leaflet (move com o arrasto, estica no zoom), mas sabendo a região que tem desenhada: canto de cima
  // à esquerda em pixels absolutos do zoom z (x, y), tamanho (w, h, px desse zoom) e resolução k (px do canvas por px da
  // tela). A cada quadro do zoom (pinça, voo) e no começo da animação do zoom só a transformação (CSS) muda; quem desenha
  // é a camada filha, quando ela quer (vista: no fim de cada movimento; quadro: a cada quadro do zoom; mexe: no arrasto)
  const Tela = L.Layer.extend({
    onAdd() {
      this._c = L.DomUtil.create('canvas', 'vto-tela leaflet-zoom-animated', this.getPane());
      this._ctx = this._c.getContext('2d');
      this._r = null;
      this.vista();
    },
    onRemove() { L.DomUtil.remove(this._c); this._r = null; },
    getEvents() { return { zoom: this._zoom, move: this.mexe, zoomanim: this._anim, moveend: this._fim, resize: this._fim }; },
    _zoom() { this.poe(map.getCenter(), map.getZoom()); this.quadro(); },
    _anim(e) { this.antesDaAnim(e); this.poe(e.center, e.zoom); },
    // o desenho da vista nova numa tarefa separada, logo depois da do fim do movimento (a da rede e das camadas não fica
    // mais longa: era o que fazia o quadro lento no fim de cada passo do zoom); até lá fica a imagem de antes, esticada
    _fim() { if (!this._t) this._t = setTimeout(() => { this._t = 0; if (this._map && !map._animatingZoom) this.vista(); }, 0); },
    vista() {}, quadro() {}, mexe() {}, antesDaAnim() {},
    // região da vista (centro c, zoom z) com a folga f (fração da tela de cada lado), em pixels absolutos do zoom zr
    regiao(c, z, f, zr = z) {
      const t = map.getSize(), k = Math.pow(2, zr - z), p = map.project(c, zr), w = t.x * (1 + 2 * f) * k, h = t.y * (1 + 2 * f) * k;
      return { x: p.x - w / 2, y: p.y - h / 2, w, h, z: zr };
    },
    // de longe: o estado inteiro e m telas em volta (e a vista), se couber em maxpx px do canvas com a resolução k; senão,
    // null. Com ela, o arrasto e os passos curtos do zoom na visão do estado não pedem desenho novo (a região já tem tudo)
    regiaoTO(c, z, k, maxpx, m = 0.5) {
      const t = map.getSize(), a = map.project(caixaTO.getNorthWest(), z), b = map.project(caixaTO.getSouthEast(), z), v = this.regiao(c, z, 0.1);
      const x = Math.min(a.x - t.x * m, v.x), y = Math.min(a.y - t.y * m, v.y), w = Math.max(b.x + t.x * m, v.x + v.w) - x, h = Math.max(b.y + t.y * m, v.y + v.h) - y;
      return w * h * k * k <= maxpx ? { x, y, w, h, z } : null;
    },
    // a região desenhada cobre a vista (c, z) com a folga f?
    cobre(c, z, f) {
      const r = this._r;
      if (!r) return false;
      const v = this.regiao(c, z, f, r.z);
      return v.x >= r.x - 0.5 && v.y >= r.y - 0.5 && v.x + v.w <= r.x + r.w + 0.5 && v.y + v.h <= r.y + r.h + 0.5;
    },
    // transformação (CSS) para a vista (c, z): a região desenhada no lugar dela, esticada pela razão dos zooms
    poe(c, z) {
      const r = this._r;
      if (!r) return;
      const s = Math.pow(2, z - r.z), o = map._getNewPixelOrigin(c, z);
      L.DomUtil.setTransform(this._c, L.point(r.x * s - o.x, r.y * s - o.y), s);
    },
    // desenha a região r (arredondada) com f(ctx, r) e põe o canvas no lugar (k: resolução). O canvas só muda de tamanho
    // quando a região não cabe nele (ou sobra demais): a região usa o canto de cima à esquerda e o resto fica vazio. Mudar o
    // tamanho a cada vista custava caro (o navegador refaz o canvas inteiro na 1ª pintura: medido no zoom pela roda)
    pinta(r, k, f) {
      const x = Math.floor(r.x), y = Math.floor(r.y);
      r = { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y, z: r.z, k };
      const c = this._c, W = Math.max(1, Math.ceil(r.w * k)), H = Math.max(1, Math.ceil(r.h * k));
      if (c.width < W || c.height < H || c.width * c.height > 2.5 * W * H) { c.width = W; c.height = H; } else this._ctx.clearRect(0, 0, c.width, c.height);
      c.style.width = c.width / k + 'px'; c.style.height = c.height / k + 'px';
      this._r = r;
      const ctx = this._ctx;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      f(ctx, r);
      this.poe(map.getCenter(), map.getZoom());
    }
  });

  // ---------- máscara: fora do Tocantins, a cor de fundo do mapa ----------
  const FOLGA_M = 0.25, MAXPX = MOVEL ? 1.2e6 : 3e6;    // folga em volta da vista; px do canvas no máximo (a resolução cai)
  const MAXPX_ANIM = MOVEL ? 0.8e6 : 1.5e6;              // no começo da animação do zoom (refeita no fim dela, com a resolução certa)
  const MASCARA_ATE = 10;                                // a máscara só abaixo deste zoom (o satélite recorta até o quadro do 9)
  let fundoCor = null;
  const corFundo = () => fundoCor || (fundoCor = getComputedStyle(mc).backgroundColor || '#0f1417');
  // o contorno no canvas da região r: recortado num retângulo um pouco maior que ela (de perto, o estado tem milhões de px)
  function caminhoTO(ctx, r) {
    const S = 256 * Math.pow(2, r.z), m = 24;
    const pts = L.PolyUtil.clipPolygon(PTO.map(([x, y]) => L.point(x * S - r.x, y * S - r.y)), L.bounds([-m, -m], [r.w + m, r.h + m]));
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    return pts.length;
  }
  const Mascara = Tela.extend({
    options: { pane: 'mascara-to' },
    vista() {
      const c = map.getCenter(), z = map.getZoom();
      if (!this._r || this._r.z !== z || !this.cobre(c, z, 0.08)) this.faz(this.vistaM(c, z));
    },
    // parado e de longe: o estado inteiro e uma tela em volta (o arrasto não sai dela), com menos resolução se preciso
    // (só um preenchimento e a borda); senão, a vista com folga
    vistaM(c, z) { return (z < MASCARA_ATE && this.regiaoTO(c, z, 0.6, MAXPX, 1)) || this.regiao(c, z, FOLGA_M); },
    // pinça e voo: se a vista sai da região desenhada (afastando) ou ela esticou demais (a borda borra), refaz neste quadro
    quadro() {
      if (map._animatingZoom) return;
      const c = map.getCenter(), z = map.getZoom();
      // (no voo, também quando esticou demais; na pinça a borda pode borrar até o fim do gesto, como a rede)
      if (!this._r || (voo && Math.pow(2, z - this._r.z) > 2.5) || !this.cobre(c, z, 0) || (this._c.hidden && z < MASCARA_ATE && this._r.z >= MASCARA_ATE))
        this.faz(this.regiao(c, z, FOLGA_M));            // no meio do gesto, só a vista (menos para pintar neste quadro)
    },
    mexe() { if (!map._animatingZoom && !this.cobre(map.getCenter(), map.getZoom(), 0)) this.faz(this.vistaM(map.getCenter(), map.getZoom())); },
    // animação do zoom (roda, duplo clique, fim da pinça): afastando além da região, refaz antes dela começar com a região
    // da vista de agora e a do fim juntas (com menos resolução se ficar grande), já no lugar, sem a transição do CSS
    antesDaAnim(e) {
      if (this.cobre(e.center, e.zoom, 0) && !(this._c.hidden && e.zoom < MASCARA_ATE)) return;
      const c = map.getCenter(), z = map.getZoom(), a = this.regiao(c, z, FOLGA_M), b = this.regiao(e.center, e.zoom, 0.05, z);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), r = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, z };
      this._c.style.transition = 'none';
      this.faz(r, e.zoom, MAXPX_ANIM);
      void getComputedStyle(this._c).transform;           // aplica a posição nova sem transição
      this._c.style.transition = '';
    },
    // (zv: o zoom que vale para mostrar ou não a máscara; na animação do zoom, o do fim dela)
    faz(r, zv = map.getZoom(), maxpx = MAXPX) {
      const S = 256 * Math.pow(2, r.z), q = [r.x / S, r.y / S, (r.x + r.w) / S, (r.y + r.h) / S];
      const perto = zv >= MASCARA_ATE, corta = !perto && (noTO ? noTO.borda(q) : true);
      const dentro = perto || (!corta && noTO.dentro((q[0] + q[2]) / 2, (q[1] + q[3]) / 2));
      this._c.hidden = dentro;                           // de perto, ou a região toda dentro do estado: nada a cobrir
      if (dentro) { this._r = Object.assign({}, r, { k: 0 }); return; }
      const k = Math.min(1, Math.sqrt(maxpx / (r.w * r.h)));
      this.pinta(r, k, (ctx, r) => {
        ctx.fillStyle = corFundo();
        ctx.beginPath();
        ctx.rect(0, 0, r.w, r.h);
        if (corta && caminhoTO(ctx, r)) {
          ctx.fill('evenodd');
          // a borda: sombra leve para dentro do estado e um fio claro no recorte
          ctx.beginPath();
          caminhoTO(ctx, r);
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 9; ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 4; ctx.stroke();
          ctx.strokeStyle = 'rgba(243,244,244,.32)'; ctx.lineWidth = 1.2; ctx.stroke();
        } else if (!noTO || !noTO.dentro((q[0] + q[2]) / 2, (q[1] + q[3]) / 2)) ctx.fill();   // toda fora (ou o contorno só encosta)
      });
    }
  });
  const mascara = new Mascara().addTo(map);
  // tema trocado (Night shift do menu): a cor de fundo muda
  new MutationObserver(() => { fundoCor = null; mascara.faz(mascara.vistaM(map.getCenter(), map.getZoom())); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- dados: estado.txt → por classe, as linhas em unidades de Mercator ----------
  // {cods: [código], T1/T2: {p: Float32Array [x, y, ...], ini: Uint32Array (1º ponto de cada linha, e o fim), cx:
  // Float32Array (caixa de cada linha), al: Uint16Array (índice do alimentador de cada linha)}}; o deste fica de fora
  let dados = null, carga = null;
  function decodifica(txt) {
    const cods = [], g = { T1: { p: [], ini: [0], cx: [], al: [] }, T2: { p: [], ini: [0], cx: [], al: [] } };
    let la = 0, lo = 0;
    for (const ln of txt.split('\n')) {
      if (!ln) continue;
      const cl = ln.split('\t'), meu = cl[0] === EU, ia = cods.length;
      if (!meu) cods.push(cl[0]);
      ['T1', 'T2'].forEach((c, j) => {
        const s = cl[j + 1] || '', n = s.length, o = g[c];
        let i = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const fecha = () => { if (!meu) { o.ini.push(o.p.length / 2); o.cx.push(x0, y0, x1, y1); o.al.push(ia); } x0 = y0 = Infinity; x1 = y1 = -Infinity; };
        while (i < n) {
          if (s.charCodeAt(i) === 32) { fecha(); i++; continue; }
          let v = 0, sh = 0, b;
          do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
          la += v & 1 ? ~(v >> 1) : v >> 1;
          v = 0; sh = 0;
          do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
          lo += v & 1 ? ~(v >> 1) : v >> 1;
          if (meu) continue;
          const x = ux(lo / 1e4), y = uy(la / 1e4);
          o.p.push(x, y);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (n) fecha();
      });
    }
    const r = { cods, pts: 0 };
    for (const c of ['T1', 'T2']) {
      const o = g[c];
      r[c] = { p: Float32Array.from(o.p), ini: Uint32Array.from(o.ini), cx: Float32Array.from(o.cx), al: Uint16Array.from(o.al) };
      r.pts += o.p.length / 2;
    }
    return r;
  }
  function carrega() {
    if (carga) return carga;
    return (carga = fetch(BASE + 'indice.json').then(r => r.ok ? r.json() : null)
      .then(j => j && j.estado && j.estado[1] ? fetch(`${BASE}estado.txt?v=${encodeURIComponent(j.estado[0])}`).then(r => r.ok ? r.text() : null) : null)
      .then(t => { if (t) { dados = decodifica(t); estado.vista(true); } })
      .catch(() => { /* sem o arquivo: o estado fica só com a rede deste */ }));
  }

  // ---------- camada do estado ----------
  const FOLGA_E = 0.1, MAXPX_E = MOVEL ? 1.2e6 : 3e6;    // folga; parado, o estado inteiro de uma vez se couber nisso (px do canvas)
  let zm = 9;                                            // zoom em que os vizinhos entram (o deles, quando começam)
  const leZm = () => { const v = window.__vizinhos; if (v && v.estado) zm = v.estado().zMin; return zm; };
  let mostra = false, esperaViz = 0, voo = null;
  // opacidade da camada (no pane): de uma vez (aparecer, no voo) ou aos poucos (sair, quando os vizinhos estão na tela)
  function opacidade(v, suave) {
    const anima = suave && !calmo() && mostra && !v;     // só a saída é aos poucos
    mostra = v > 0;
    paneE.style.transition = anima ? '' : 'none';
    paneE.style.opacity = String(v);
    paneE.hidden = !mostra && !anima;
  }
  paneE.addEventListener('transitionend', () => { if (!mostra) paneE.hidden = true; });
  opacidade(0, false);
  // traça as linhas da classe que passam pela região r (já em beginPath); pontos a menos de 0,6 px do anterior ficam de fora
  function traca(ctx, g, r) {
    const s = 256 * Math.pow(2, r.z), bx = -r.x, by = -r.y, p = g.p, ini = g.ini, cx = g.cx, W = r.w + 8, H = r.h + 8;
    for (let l = 0, nl = ini.length - 1; l < nl; l++) {
      if (cx[4 * l] * s + bx > W || cx[4 * l + 2] * s + bx < -8 || cx[4 * l + 1] * s + by > H || cx[4 * l + 3] * s + by < -8) continue;
      const a = ini[l], b = ini[l + 1];
      let lx = p[2 * a] * s + bx, ly = p[2 * a + 1] * s + by;
      ctx.moveTo(lx, ly);
      for (let k = a + 1; k < b; k++) {
        const x = p[2 * k] * s + bx, y = p[2 * k + 1] * s + by;
        if (k < b - 1 && x - lx < 0.6 && lx - x < 0.6 && y - ly < 0.6 && ly - y < 0.6) continue;
        ctx.lineTo(x, y); lx = x; ly = y;
      }
    }
  }
  const Estado = Tela.extend({
    options: { pane: 'estado-to' },
    // fim de cada movimento: abaixo dos vizinhos, o estado inteiro (já, sem esmaecer: os vizinhos saem no mesmo quadro);
    // dos vizinhos em diante, se ainda estava na tela, fica (na vista nova) até eles estarem desenhados, e sai aos poucos
    vista(forca) {
      if (voo) return;
      const z = map.getZoom();
      clearTimeout(esperaViz);
      if (z < leZm()) { if (dados) { this.desenha(map.getCenter(), z, forca); opacidade(1, false); } return; }
      if (!mostra) return;
      this.desenha(map.getCenter(), z, forca);
      const confere = () => {
        const v = window.__vizinhos;
        if (voo || map.getZoom() < zm) return;
        if (!v || v.ocioso()) opacidade(0, true); else esperaViz = setTimeout(confere, 150);
      };
      esperaViz = setTimeout(confere, 0);                // depois do fim de movimento dos vizinhos (que pede o desenho deles)
    },
    // no voo: na ida (a camada entrando), só a opacidade; na volta (ou já na tela), refeita quando esticou demais
    quadro() {
      if (!voo || !dados || !this._r) return;
      const z = map.getZoom();
      if (voo.entra) opacidade(Math.max(0, Math.min(1, (2.6 - Math.pow(2, z - voo.z)) / 1.6)), false);
      else if (mostra && (Math.pow(2, z - this._r.z) > 3 || !this.cobre(map.getCenter(), z, 0))) this.desenha(map.getCenter(), z, true, true);
    },
    // (soVista: no voo, só a vista daquele quadro, menos para pintar nele; parado, o estado inteiro se couber)
    desenha(c, z, forca, soVista) {
      if (!dados) return;
      if (!forca && this._r && this._r.z === z && this.cobre(c, z, 0.04)) return;   // a mesma vista (o pouso do voo): já está
      this.pinta((!soVista && this.regiaoTO(c, z, R, MAXPX_E)) || this.regiao(c, z, FOLGA_E), R, (ctx, r) => {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = ALFA;
        for (const cl of ['T2', 'T1']) {                 // o tronco por cima
          if (!visivel(cl)) continue;
          ctx.strokeStyle = COR[cl]; ctx.lineWidth = larg(cl, r.z);
          ctx.beginPath(); traca(ctx, dados[cl], r); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    }
  });
  const estado = new Estado().addTo(map);
  const corBt = c => { const b = document.querySelector(`#classes button[data-c="${c}"]`); return b && b.style.getPropertyValue('--c').trim(); };
  const cls = document.getElementById('classes');
  if (cls) {
    COR.T1 = corBt('T1') || COR.T1; COR.T2 = corBt('T2') || COR.T2;
    cls.addEventListener('click', e => { if (e.target.closest('button') && mostra) estado.desenha(map.getCenter(), map.getZoom(), true); });
  }

  // ---------- linha de outro alimentador sob o ponto (x, y) do mapa ----------
  function alvoEm(pt, tol) {
    if (!dados || !mostra) return null;
    const z = map.getZoom(), s = 256 * Math.pow(2, z), q = map.containerPointToLayerPoint(pt).add(map.getPixelOrigin());
    const px = q.x / s, py = q.y / s, t = tol / s;
    let best = t * t, al = -1;
    for (const c of ['T1', 'T2']) {
      if (!visivel(c)) continue;
      const g = dados[c], p = g.p, ini = g.ini, cx = g.cx;
      for (let l = 0, nl = ini.length - 1; l < nl; l++) {
        if (cx[4 * l] - t > px || cx[4 * l + 2] + t < px || cx[4 * l + 1] - t > py || cx[4 * l + 3] + t < py) continue;
        for (let k = ini[l]; k < ini[l + 1] - 1; k++) {
          const ax = p[2 * k], ay = p[2 * k + 1], dx = p[2 * k + 2] - ax, dy = p[2 * k + 3] - ay, l2 = dx * dx + dy * dy;
          const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
          const d = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2;
          if (d <= best) { best = d; al = g.al[l]; }
        }
      }
    }
    return al < 0 ? null : dados.cods[al];
  }
  const pode = () => mostra && !voo && !faixa() && map.getZoom() < zm;
  // o balão dos vizinhos (vizinhos.js): o código e "Abrir alimentador"
  const balao = cod => `<div class="viz-pop"><b>${esc(cod)}</b><small>Alimentador vizinho</small><a href="../${encodeURIComponent(cod)}/">Abrir alimentador</a></div>`;
  map.on('click', ev => {
    if (!pode() || !ev.containerPoint) return;
    const oe = ev.originalEvent || {}, toque = oe.pointerType ? oe.pointerType !== 'mouse' : MOVEL;
    const cod = alvoEm(ev.containerPoint, toque ? 14 : 7);
    if (!cod) return;
    paira(null);
    L.popup({ className: 'viz-popup', maxWidth: 260, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] })
      .setLatLng(ev.latlng).setContent(balao(cod)).openOn(map);
  });
  // mouse: o código sob ele (a dica dos vizinhos) e a mãozinha
  const dica = L.DomUtil.create('div', 'leaflet-tooltip leaflet-tooltip-top viz-dica', mc);
  dica.hidden = true;
  dica.setAttribute('aria-hidden', 'true');
  const ren = map.options.renderer;
  function paira(ev) {
    let cod = null, pt = null;
    const alvo = ev && ev.target;
    if (ev && pode() && !map.dragging.moving() && alvo && (alvo === mc || alvo.tagName === 'CANVAS') && !(ren && ren._hoveredLayer))
      cod = alvoEm(pt = map.mouseEventToContainerPoint(ev), 7);
    mc.classList.toggle('vto-mao', !!cod);
    const mostraDica = cod && !(map._popup && map._popup._map && map._popup.options.className === 'viz-popup');
    if (mostraDica) { dica.textContent = cod; dica.style.left = pt.x + 'px'; dica.style.top = pt.y + 'px'; }
    dica.hidden = !mostraDica;
  }
  let mov = 0, ultimo = null;
  mc.addEventListener('mousemove', e => {
    if (MOVEL || e.buttons || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) || (!mostra && dica.hidden)) return;
    ultimo = e;
    if (!mov) mov = requestAnimationFrame(() => { mov = 0; paira(ultimo); });
  });
  mc.addEventListener('mouseleave', () => paira(null));
  map.on('movestart zoomstart', () => paira(null));

  // ---------- fundo do satélite: os quadros do zoom 8 do TO numa imagem só, por baixo ----------
  // Os quadros do zoom 8 que tocam o estado (uns 25, 256 px cada) juntados uma vez numa imagem só, quando estão todos
  // baixados, presa ao mapa como os canvas daqui (no zoom e no voo só estica). Medido no zoom pela roda e pela pinça: uma
  // camada de quadros do Leaflet (25 imagens esticadas até 1.000×) dava quadros lentos a mais no PC, e um canvas, no
  // celular; a imagem só, nenhum dos dois. Num painel abaixo do satélite (que, nítido, entra por cima aos poucos)
  const sat = window.__satelite;
  const Z_FUNDO = 8;
  let fundo = null;
  if (sat && noTO) {
    map.createPane('fundo-to').style.zIndex = 150;      // abaixo do satélite (tilePane, 200)
    const Fundo = Tela.extend({
      options: { pane: 'fundo-to' },
      // uma <img> (não o canvas: ver acima), montada uma vez num canvas fora da página com os quadros
      onAdd() { this._c = L.DomUtil.create('img', 'vto-tela leaflet-zoom-animated', this.getPane()); this._c.alt = ''; this._c.draggable = false; this._r = null; },
      vista() { if (this._r) this.poe(map.getCenter(), map.getZoom()); },
      // ims: [[x, y, ImageBitmap ou Image], ...] do zoom 8; a imagem cobre a caixa deles
      desenha(ims) {
        const xa = Math.min(...ims.map(q => q[0])), ya = Math.min(...ims.map(q => q[1]));
        const xb = Math.max(...ims.map(q => q[0])), yb = Math.max(...ims.map(q => q[1]));
        const r = { x: xa * 256, y: ya * 256, w: (xb - xa + 1) * 256, h: (yb - ya + 1) * 256, z: Z_FUNDO, k: 1 };
        const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), q = [];
        cv.width = r.w; cv.height = r.h;
        for (const [x, y, im] of ims) { ctx.drawImage(im, (x - xa) * 256, (y - ya) * 256, 256, 256); q.push([(x - xa) * 256, (y - ya) * 256]); if (im.close) im.close(); }
        cv.toBlob(b => {
          if (!b || !this._c) return;
          this._c.onload = () => { URL.revokeObjectURL(this._c.src); this._quadros = q; this._r = r; this._c.style.width = r.w + 'px'; this._c.style.height = r.h + 'px'; this.poe(map.getCenter(), map.getZoom()); };
          this._c.src = URL.createObjectURL(b);
        }, 'image/jpeg', 0.9);
      }
    });
    fundo = new Fundo();
    // Parado (e no arrasto) com o estado inteiro na tela ou de perto (zoom 12 em diante), o fundo não faz falta: o satélite
    // nítido cobre a tela (de longe ele guarda o nível de antes até o novo chegar; de perto, como sempre foi). Fica
    // escondido, uma camada a menos para o navegador juntar a cada quadro (só depois de os quadros nítidos da vista
    // chegarem e entrarem: no pouso do voo eles ainda estão chegando). Volta a cada zoom (roda, pinça, voo), quando
    // faltariam quadros nas bordas
    const Z_FUNDO_ATE = 12;
    const sobra = () => map.getZoom() >= Z_FUNDO_ATE || map.getBounds().contains(caixaTO);
    let tVis = 0;
    const vis = () => {
      if (!fundo._c) return;
      clearTimeout(tVis);
      if (!sobra()) { fundo._c.style.visibility = ''; return; }
      const esconde = () => { clearTimeout(tVis); tVis = setTimeout(() => { if (fundo._c && sobra() && sat._noTilesToLoad()) fundo._c.style.visibility = 'hidden'; }, 400); };
      if (sat._noTilesToLoad()) esconde(); else sat.once('load', esconde);
    };
    fundo.on('add', vis);
    map.on('moveend', vis);
    map.on('zoomstart', () => { if (fundo._c) { clearTimeout(tVis); fundo._c.style.visibility = ''; } });
  }
  // os quadros do fundo (zoom 8; ele entra no mapa quando estão todos baixados) e os da vista do estado (6 e 7), dois de
  // cada vez, com o mapa parado; as imagens ficam na memória enquanto a página está aberta (o cache normal do navegador;
  // nada é guardado no site). Os do fundo com CORS (o servidor da Esri permite): o canvas onde são juntados pode virar
  // imagem
  function preCarrega() {
    if (!sat || !noTO) return;
    const fila = [], guarda = [], q8 = [];
    let n8 = 0;
    for (const z of [Z_FUNDO, 7, 6]) {
      const n = Math.pow(2, z), xa = Math.floor(ux(caixaTO.getWest()) * n), xb = Math.floor(ux(caixaTO.getEast()) * n);
      const ya = Math.floor(uy(caixaTO.getNorth()) * n), yb = Math.floor(uy(caixaTO.getSouth()) * n);
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (noTO({ x, y, z })) { fila.push([x, y, z]); if (z === Z_FUNDO) n8++; }
    }
    let ativos = 0, parado = true;
    const vez = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 50));
    // (decodificados fora da vez da página, createImageBitmap: desenhar os 25 JPEG direto decodificava todos de uma vez, uma
    // tarefa de ~140 ms no celular com a CPU 4× mais lenta, medido)
    const pronto8 = () => {
      const ok = q8.filter(q => q[2].naturalWidth);
      if (!fundo || !ok.length) return;
      const bm = window.createImageBitmap ? Promise.all(ok.map(([x, y, im]) => createImageBitmap(im).then(b => [x, y, b], () => [x, y, im]))) : Promise.resolve(ok);
      bm.then(qs => { fundo.addTo(map); fundo.desenha(qs); });
    };
    const bomba = () => {
      while (parado && ativos < 2 && fila.length) {
        const [x, y, z] = fila.shift(), im = new Image();
        ativos++;
        if (z === Z_FUNDO) { im.crossOrigin = 'anonymous'; q8.push([x, y, im]); }
        im.onload = im.onerror = () => { ativos--; if (z === Z_FUNDO && !--n8) pronto8(); vez(bomba); };
        im.src = sat.getTileUrl({ x, y, z });
        guarda.push(im);
      }
    };
    map.on('movestart', () => { parado = false; });
    map.on('moveend', () => { parado = true; setTimeout(() => vez(bomba), 400); });
    vez(bomba);
  }

  // ---------- vistas: o estado inteiro e a do alimentador ----------
  // o estado inteiro: com folga de 16 px e, em cima, a dos controles que ficam por cima do mapa (busca, T1 T2 T3, camadas)
  function folgaTopo() {
    const m = mc.getBoundingClientRect();
    let b = 0;
    box.querySelectorAll(':scope>.barra-busca,:scope>.lp-cams,#classes,.ctl-cam').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.top < m.top + m.height / 3) b = Math.max(b, r.bottom - m.top);
    });
    return Math.round(Math.min(m.height / 3, Math.max(16, b + 8)));
  }
  const vistaEstado = () => map._getBoundsCenterZoom(caixaTO, { paddingTopLeft: [16, folgaTopo()], paddingBottomRight: [16, 16] });
  const caixaAl = () => {
    if (window.__caixaRede) return window.__caixaRede;
    let s = 90, w = 180, n = -90, e = -180;
    (D && D.vaos || []).forEach(v => { s = Math.min(s, v[0], v[2]); n = Math.max(n, v[0], v[2]); w = Math.min(w, v[1], v[3]); e = Math.max(e, v[1], v[3]); });
    return L.latLngBounds([s, w], [n, e]);
  };
  const vistaAl = () => map._getBoundsCenterZoom(caixaAl().pad(0.04), {});
  let zEst = null;
  // o zoom mínimo do mapa é o do estado inteiro (afastar com a roda ou o dedo para nele); muda com o tamanho do mapa
  function minimo() {
    const t = map.getSize();
    if (t.x < 50 || t.y < 50) return;
    zEst = vistaEstado().zoom;
    if (isFinite(zEst) && map.getMinZoom() !== zEst) map.setMinZoom(zEst);
  }
  minimo();
  const noEstado = () => zEst !== null && map.getZoom() <= zEst + 0.5;
  // afastar com a roda (e o + e − do teclado) até o zoom do estado: o mapa vai para a mesma visão do botão (o estado no meio)
  const limita0 = map._limitCenter;
  map._limitCenter = function (c, z, b) { return zEst !== null && z <= zEst + 1e-6 && !voo ? vistaEstado().center : limita0.call(this, c, z, b); };

  // ---------- voo ----------
  // cubic-bezier como no CSS (a mesma da página inicial: .45, 0, .55, 1)
  const bezier = (x1, y1, x2, y2) => {
    const c = (a, b, t) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
    const dc = (a, b, t) => (3 - 9 * b + 9 * a) * t * t + (6 * b - 12 * a) * t + 3 * a;
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = c(x1, x2, t) - x, d = dc(x1, x2, t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
      if (!(t >= 0 && t <= 1) || Math.abs(c(x1, x2, t) - x) > 1e-4) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 40; i++) { t = (lo + hi) / 2; if (c(x1, x2, t) < x) lo = t; else hi = t; }
      }
      return c(y1, y2, t);
    };
  };
  const curva = bezier(.45, 0, .55, 1);
  let fimVoo = null;
  // a rede deste no voo de volta: o canvas dela (do Leaflet, no overlayPane) só estica até o pouso, e de longe ela tem
  // poucos pixels; esticada demais vira um borrão. Some aos poucos quando passa de 2× e volta no pouso, já refeita
  const paneRede = map.getPane('overlayPane'), renRede = map.options.renderer;
  function redeNoVoo(z) {
    const s = renRede && renRede._zoom !== undefined ? Math.pow(2, z - renRede._zoom) : 1;
    const v = s <= 2 ? '' : String(Math.max(0, (3.5 - s) / 1.5));
    if (paneRede.style.opacity !== v) { paneRede.style.transition = 'none'; paneRede.style.opacity = v; }
  }
  // fim do voo (pouso ou interrompido): o satélite volta a carregar e os rótulos voltam, aparecendo aos poucos
  let tPouso = 0;
  function solta() {
    if (sat) { sat._quieto = false; sat.options.updateWhenZooming = true; }
    mc.classList.remove('vto-voando');
    mc.classList.add('vto-pouso');
    clearTimeout(tPouso);
    tPouso = setTimeout(() => mc.classList.remove('vto-pouso'), 300);
  }
  function redeVolta() {
    if (paneRede.style.opacity === '') return;
    paneRede.style.transition = calmo() ? 'none' : 'opacity .24s var(--ease,ease)';
    paneRede.style.opacity = '';
  }
  // quem interrompe o voo (arrasto, roda, pinça, outra vista) passa pelo map._stop(): o voo acaba ali, sem pouso
  const para0 = map._stop;
  map._stop = function () {
    if (voo && this._flyToFrame) { const f = fimVoo; voo = null; fimVoo = null; solta(); redeVolta(); f(); }
    return para0.apply(this, arguments);
  };
  // voa até (alvo, zAlvo): a escala muda em progressão geométrica (o zoom anda no mesmo ritmo) e o canto da vista anda
  // junto, de modo que o ponto fixo do zoom fica parado na tela; o tempo segue a curva. Promessa: resolve no pouso
  function voa(alvo, zAlvo) {
    map._stop();
    if (calmo()) { map.setView(alvo, zAlvo, { animate: false }); return Promise.resolve(); }
    return new Promise(res => {
      const z0 = map.getZoom(), t = map.getSize(), p0 = map.project(map.getCenter(), 0), p1 = map.project(alvo, 0);
      const w0 = t.x / Math.pow(2, z0), h0 = t.y / Math.pow(2, z0), w1 = t.x / Math.pow(2, zAlvo), h1 = t.y / Math.pow(2, zAlvo);
      const x0 = p0.x - w0 / 2, y0 = p0.y - h0 / 2, x1 = p1.x - w1 / 2, y1 = p1.y - h1 / 2, r = w1 / w0, lr = Math.log(r), reto = Math.abs(r - 1) < 1e-3;
      const em = e => {
        const s = reto ? 1 : Math.exp(lr * e), f = reto ? e : (s - 1) / (r - 1);
        return [map.unproject(L.point(x0 + (x1 - x0) * f + w0 * s / 2, y0 + (y1 - y0) * f + h0 * s / 2), 0), z0 + (zAlvo - z0) * e];
      };
      const dur = Math.min(1800, Math.max(1200, 900 + 150 * Math.abs(zAlvo - z0)));
      leZm();
      voo = { z: zAlvo, entra: zAlvo < zm && !mostra && !!dados };
      fimVoo = res;
      if (sat) { sat._quieto = true; sat.options.updateWhenZooming = false; }   // o satélite nítido espera o pouso; o fundo cobre o caminho
      mc.classList.add('vto-voando');
      clearTimeout(esperaViz);
      if (voo.entra) { estado.desenha(alvo, zAlvo, true, true); opacidade(0, false); paneE.hidden = false; }   // a ida: pronta na vista do pouso
      rotulo(zAlvo);
      map._moveStart(true, false);
      let t0 = 0;
      const passo = agora => {
        if (!voo) return;
        if (!t0) t0 = agora;
        const tt = Math.min(1, (agora - t0) / dur);
        if (tt < 1) {
          map._flyToFrame = requestAnimationFrame(passo);
          const [c, z] = em(curva(tt));
          map._move(c, z, { flyTo: true });
          redeNoVoo(z);
        } else {
          map._flyToFrame = null;
          voo = null; fimVoo = null;
          solta();
          map._move(alvo, zAlvo)._moveEnd(true);
          redeVolta();
          res();
        }
      };
      map._flyToFrame = requestAnimationFrame(passo);
    });
  }
  function alterna() {
    minimo();
    const v = noEstado() ? vistaAl() : vistaEstado();
    if (!dados) carrega();
    return voa(v.center, v.zoom);
  }

  // ---------- botão ----------
  const canto = document.createElement('div');
  canto.className = 'vto-canto ctl-card';
  canto.innerHTML = '<button type="button" class="vto-bt"></button>';
  const bt = canto.firstChild;
  box.append(canto);
  L.DomEvent.disableClickPropagation(canto);
  canto.addEventListener('click', e => e.stopPropagation());   // o clique não chega ao mapa (que limparia a seleção)
  bt.addEventListener('click', () => { alterna(); });
  function rotulo(z) {
    const est = zEst !== null && (z === undefined ? map.getZoom() : z) <= zEst + 0.5;
    const txt = est ? 'Voltar ao alimentador' : 'Tocantins';
    if (bt.textContent === txt) return;
    bt.textContent = txt;
    bt.title = est ? `Voltar à vista do alimentador ${EU}` : 'Ver o Tocantins inteiro';
  }
  rotulo();
  map.on('moveend', () => { if (!voo) rotulo(); });
  map.on('resize', () => { minimo(); rotulo(); });
  // afastou até o estado inteiro com o dedo (a pinça não passa pelo _limitCenter): a mesma visão do botão
  map.on('zoomend', () => {
    if (voo || zEst === null || map.getZoom() > zEst + 1e-6 || map.getBounds().contains(caixaTO)) return;
    map.panTo(vistaEstado().center, { animate: !calmo(), duration: 0.45 });
  });

  // ---------- começo: depois da rede deste inteira no mapa e do painel (a carga da página não muda) ----------
  const depois = AL ? Promise.all([AL.rede, AL.pronto]) : Promise.resolve();
  depois.then(() => {
    leZm();
    minimo();                                            // com os controles de cima do mapa já no lugar (folga da vista do estado)
    rotulo();
    const vez = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 200));
    vez(() => { carrega().then(() => vez(() => { leZm(); estado.vista(true); })); });
    setTimeout(() => vez(preCarrega), 1200);
  });

  // para os testes e as medidas
  window.__visaoTO = {
    alterna, noEstado, voando: () => !!voo, zAbre: () => vistaAl().zoom, zEstado: () => zEst, em: (x, y) => alvoEm(L.point(x, y), 7),
    estado: () => ({ dados: !!dados, linhas: dados ? dados.T1.ini.length + dados.T2.ini.length - 2 : 0, pontos: dados ? dados.pts : 0, mostra,
      opacidade: +paneE.style.opacity, zMin: zm, zEstado: zEst, mascara: mascara._r && !mascara._c.hidden ? { k: mascara._r.k, w: mascara._r.w, h: mascara._r.h } : null,
      fundo: !!(fundo && fundo._map && fundo._r), botao: bt.textContent }),
    // a imagem do fundo e os quadros dela (canto de cada um, px da imagem, 256 px): a conta da área sem imagem nos testes
    fundo: () => fundo && fundo._map && fundo._r ? { el: fundo._c, quadros: fundo._quadros } : null
  };
})();
