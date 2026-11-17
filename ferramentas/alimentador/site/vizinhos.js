// Alimentadores vizinhos no mapa do alimentador (roda logo depois de alimentador.js, com window.__map e window.__al): a
// rede dos outros alimentadores que aparecem na tela, por baixo da rede deste. Só as linhas, nas cores das classes e mais
// apagadas (sem rótulos, NAE, chaves nem marcadores); painel, NAE, seleção, camadas e modo de faixa continuam só deste.
// Carrega sozinho: ao afastar ou arrastar o mapa entram os que aparecem na tela (com folga) e saem os que ficaram longe.
// Aos poucos: de longe só T1 e T2; do zoom 13 (celular: 14) entra o T3; de perto (15; celular: 16) o fino. Os botões
// T1 T2 T3 do mapa valem também aqui. Aparecem aos poucos (no celular, de uma vez). Passar o mouse mostra o código; tocar
// num vizinho (fora da rede deste) abre um balão com "Abrir alimentador".
// Dados: dados/vizinhos/ (scripts/gera_trechos.py, vizinhos_mapa): indice.json com a caixa de cada alimentador e, por
// alimentador, T1 e T2 grosso (<AL>.1.txt), T3 grosso (.2) e o fino de perto (.3), em polyline. Sem o índice (mapa fora do
// site), não faz nada.
// Para não pesar: um canvas próprio, num pane abaixo da rede e das divisas, desenhado de uma vez (um traço por classe para
// todos os vizinhos, não milhares de L.Polyline); no zoom e no arrasto o navegador só estica e move a imagem (como o canvas
// da rede) e o desenho é refeito quando o mapa para; o que chega no meio do gesto espera ele acabar. Entram todos os que
// têm rede na tela, até um limite de bytes (não de alimentadores: o limite por número deixava buracos onde há muitos
// alimentadores pequenos, porque um rural grande com a caixa sobre o meio da tela levava a vaga). Downloads numa fila
// (3 de cada vez; 2 no celular), primeiro os que têm mais rede à vista (contando duas vezes a do meio da tela), cancelando
// o que saiu dela; memória com limite (saem os menos usados). Começa depois que a rede deste está inteira no mapa
// (__al.rede): a carga da página não muda.
(function () {
  const map = window.__map, L = window.L, D = window.D, AL = window.__al || null, eu = document.currentScript;
  if (!map || !L || !D || !eu || !/\/assets\/vizinhos\.js(\?|$)/.test(eu.src) || !document.documentElement.classList.contains('al-site')) return;
  const BASE = new URL('../dados/vizinhos/', eu.src).href;
  const EU = (D.meta && D.meta.al) || (/\/alimentadores\/([^/]+)\//.exec(location.pathname) || [])[1] || '';
  const MOVEL = L.Browser.mobile || matchMedia('(pointer:coarse)').matches;
  // mais longe que isso, nada (a rede do estado inteiro vira mancha); o alimentador que abre mais longe (grande, no
  // celular) baixa até o zoom em que abre (no mínimo 8), para a vista inicial não ficar sem vizinhos
  let zMin = 9;
  const Z_T3 = MOVEL ? 14 : 13;                          // o T3 entra daqui em diante (na tela pequena, mais perto)
  const Z_FINO = MOVEL ? 16 : 15;                        // o desenho fino (antes dele, o grosso: 10 m)
  // bytes na tela de uma vez (dos arquivos de cada nível, baixados ou não): o grosso (T1 e T2, e o T3 do zoom 13/14) e o
  // fino. Passou do fino: o alimentador fica no grosso. No celular, o fino de um alimentador grande que só passa pela
  // tela também fica no grosso (mais que DESPERDICIO bytes de rede fora dela), até o zoom 17
  const ORC_GROSSO = MOVEL ? 600e3 : 3e6, ORC_FINO = MOVEL ? 400e3 : 1.5e6, DESPERDICIO = MOVEL ? 32e3 : Infinity;
  const FICA = MOVEL ? 8 : 24;                           // os que saíram da tela e ficam (até FOLGA_SAI), os mais perto
  const PARALELO = MOVEL ? 2 : 3;                        // downloads ao mesmo tempo
  const LIMITE = MOVEL ? 300000 : 900000;                // pontos guardados na memória (os menos usados saem)
  const FOLGA = 0.25, FOLGA_SAI = 1;                     // em volta da tela (fração dela): entra / sai
  // ms para aparecer aos poucos. No celular aparece de uma vez: o 2º canvas da tela inteira (que faz o efeito) custava ~20%
  // mais de trabalho no arrasto (medido com a CPU 4× mais lenta)
  const ALFA = 0.55, ESMAECE = MOVEL || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
  const CL = ['T1', 'T2', 'T3'];
  const corBt = c => { const b = document.querySelector(`#classes button[data-c="${c}"]`); return b && b.style.getPropertyValue('--c').trim(); };
  const COR = { T1: corBt('T1') || '#3b82f6', T2: corBt('T2') || '#22c55e', T3: corBt('T3') || '#facc15' };   // as do card T1 T2 T3
  const larg = (c, z) => (c === 'T1' ? 2.4 : c === 'T2' ? 1.9 : 1.2) * (z >= 16 ? 1.35 : z >= 14 ? 1.15 : 1);   // a rede deste: 6, 4,5 e 3
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const marca = n => { try { performance.mark(n); } catch (e) { /* sem marcas */ } };

  const css = document.createElement('style');
  css.textContent = '.leaflet-container.viz-mao{cursor:pointer}.viz-cam canvas{position:absolute;left:0;top:0}' +
    '.viz-dica{z-index:650;transform:translate(-50%,calc(-100% - 14px));font:600 var(--t-xs) var(--f-mono)}' +
    '.viz-popup .leaflet-popup-content{margin:10px 12px;font:13px/1.45 var(--f-body)}' +
    '.viz-pop{display:grid;gap:2px}.viz-pop b{font:600 15px var(--f-mono)}.viz-pop small{color:#5a636a;font-size:12px}' +
    '.viz-pop a{display:inline-flex;align-items:center;min-height:32px;font-weight:600}@media (pointer:coarse){.viz-pop a{min-height:40px}}';
  document.head.append(css);

  // Mercator em unidades (0 a 1; x = pixel / (256·2^zoom)): a conta do Leaflet (EPSG:3857), sem o zoom
  const ux = lon => (lon + 180) / 360;
  const uy = lat => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);

  // índice: {cod, x0, y0, x1, y1 (caixa em unidades), v (versão), b (bytes de .1 .2 .3), d (níveis baixados), ...}
  let IDX = null, fim = false, tick = 0, pontos = 0, bytes = 0;
  const voando = new Map();                              // downloads: chave "cod.k" → AbortController
  let fila = [], desenhados = [], entram = 0, sob = null;   // desenhados: os que entram (na tela, com folga) e depois os que ficam
  let gasto = { grosso: 0, fino: 0 };                    // bytes dos que entram (para os testes)

  // ---------- texto do arquivo → linhas em unidades de Mercator, relativas ao canto da caixa do alimentador ----------
  // Cada classe vira {p: Float32Array [x, y, ...], ini: Uint32Array (1º ponto de cada linha, e o fim), cx: Float32Array
  // (caixa de cada linha: x0, y0, x1, y1)}. Float32 relativo ao canto: precisão de centésimos de pixel no zoom 19.
  function decodifica(txt, e) {
    const sec = txt.split('\n'), r = { pts: 0 };
    let la = 0, lo = 0;
    for (let c = 0; c < 3; c++) {
      const s = sec[c] || '', n = s.length;
      if (!n) { r[CL[c]] = null; continue; }
      const p = new Float32Array(n), ini = [0], cx = [];
      let k = 0, i = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const fecha = () => { ini.push(k / 2); cx.push(x0, y0, x1, y1); x0 = y0 = Infinity; x1 = y1 = -Infinity; };
      while (i < n) {
        if (s.charCodeAt(i) === 32) { fecha(); i++; continue; }
        let v = 0, sh = 0, b;
        do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
        la += v & 1 ? ~(v >> 1) : v >> 1;
        v = 0; sh = 0;
        do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
        lo += v & 1 ? ~(v >> 1) : v >> 1;
        const x = ux(lo / 1e5) - e.x0, y = uy(la / 1e5) - e.y0;
        p[k++] = x; p[k++] = y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      fecha();
      r[CL[c]] = { p: p.slice(0, k), ini: Uint32Array.from(ini), cx: Float32Array.from(cx) };
      r.pts += k / 2;
    }
    return r;
  }

  // ---------- o que desenhar: zoom, classes (botões T1 T2 T3) e o nível que já chegou ----------
  const visivel = c => !window.__visivel || window.__visivel[c] !== false;
  const comT3 = z => z >= Z_T3 && visivel('T3');
  // classe c do alimentador e no zoom z: o fino de perto; senão o grosso; senão o que houver
  function geoDe(e, c, z) {
    if (c === 'T3' && !comT3(z)) return null;
    const g = c === 'T3' ? e.d[2] : e.d[1];
    if (z >= Z_FINO && e.d[3]) return e.d[3][c];
    return g ? g[c] : e.d[3] ? e.d[3][c] : null;
  }
  // níveis que faltam no zoom z (fino: se cabe no orçamento do fino)
  function falta(e, z, fino) {
    if (e.d[3]) return [];
    if (fino && z >= Z_FINO && !e.erro[3]) return [3];
    const k = [];
    if (!e.d[1] && !e.erro[1]) k.push(1);
    if (comT3(z) && !e.d[2] && !e.erro[2]) k.push(2);
    return k;
  }

  // ---------- o canvas: um L.Renderer (move e estica no zoom e no arrasto como o da rede; refeito quando o mapa para) ----------
  // Dois canvas, um sobre o outro: o de baixo com os vizinhos já na tela; o de cima só com os que estão chegando, que
  // aparecem aos poucos pela transparência do próprio canvas (CSS: o navegador anima sem redesenhar nada). No fim, eles
  // passam para o de baixo, numa pintura só. Assim cada leva custa dois desenhos, não um por quadro. Fora da leva o de
  // cima fica sem tamanho e escondido (não ocupa memória nem entra na composição da tela a cada quadro do arrasto).
  map.createPane('vizinhos').style.zIndex = 340;         // abaixo das divisas (350) e da rede (overlayPane, 400)
  map.getPane('vizinhos').style.pointerEvents = 'none';  // o clique e o mouse são vistos no mapa (ver mais abaixo)
  // a resolução do canvas da rede no PC; no celular, simples: são linhas apagadas de fundo e a pintura em 2× engasgava
  // o fim de cada arrasto (medido com a CPU 4× mais lenta: 9 quadros lentos em 4 arrastos no zoom 11, 0 em 1×)
  const R = L.Browser.retina && !MOVEL ? 2 : 1;
  let tela = null, vez = 0;                              // tela: {x, y: canto do canvas em pixels absolutos; s: 256·2^zoom; z; w, h}
  const Camada = L.Renderer.extend({
    options: { pane: 'vizinhos', padding: 0.1 },
    _initContainer() {
      const d = this._container = L.DomUtil.create('div', 'viz-cam');
      this._ctx = L.DomUtil.create('canvas', '', d).getContext('2d');
      this._ctxN = L.DomUtil.create('canvas', 'viz-novos', d).getContext('2d');
    },
    _destroyContainer() { L.DomUtil.remove(this._container); delete this._ctx; delete this._ctxN; },
    // a vista nova é desenhada numa tarefa separada, logo depois da do mapa (a da rede deste, no fim do arrasto ou do zoom,
    // não fica mais longa); até lá a imagem de antes continua no lugar certo, levada e esticada junto com o mapa
    _update() {
      if (this._map._animatingZoom && this._bounds) return;
      if (!this._bounds) return this._agora();
      if (!vez) vez = setTimeout(() => { vez = 0; if (this._map && !this._map._animatingZoom) this._agora(); }, 0);
    },
    _agora() {
      L.Renderer.prototype._update.call(this);
      const b = this._bounds, t = b.getSize(), o = this._map.getPixelOrigin();
      L.DomUtil.setPosition(this._container, b.min);
      tela = { x: o.x + b.min.x, y: o.y + b.min.y, z: this._zoom, s: 256 * Math.pow(2, this._zoom), w: t.x, h: t.y };
      mede(this._ctx.canvas, true);
      mede(this._ctxN.canvas, leva);
      planeja();                                         // quem entra e quem sai com a vista nova, e depois o desenho
      desenha();
      if (chegou.length) setTimeout(depoisDoGesto, 0);
    }
  });
  // canvas do tamanho da área do renderer (com = false: zera, para o de cima fora da leva)
  function mede(c, com) {
    const t = tela, w = com ? R * t.w : 0, h = com ? R * t.h : 0;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c.style.width = (com ? t.w : 0) + 'px'; c.style.height = (com ? t.h : 0) + 'px'; }
    if (c.classList.contains('viz-novos')) c.hidden = !com;
  }
  const cam = new Camada();

  // traça as linhas da classe (já em beginPath): as que estão no canvas; pontos a menos de 0,6 px do anterior ficam de fora
  function traca(ctx, e, g, t) {
    const s = t.s, bx = e.x0 * s - t.x, by = e.y0 * s - t.y, p = g.p, ini = g.ini, cx = g.cx, W = t.w + 8, H = t.h + 8;
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
  // e.vis[classe]: 0 fora da tela, 1 esperando a próxima leva, 2 aparecendo (canvas de cima), 3 na tela (canvas de baixo).
  // Cada pintura de um canvas custa a cópia dele inteiro para a tela: o de baixo só é pintado quando o que está nele muda
  // (vista nova, fim de leva, o fino no lugar do grosso, mouse, botões T1 T2 T3), não a cada arquivo que chega.
  let primeiro = false, leva = false, proxLeva = 0;
  // a fase de cada classe dos vizinhos na tela, pelo que já chegou; devolve true se algum espera a leva
  function fases(z) {
    let espera = false;
    for (const e of desenhados) for (const c of CL) {
      if (!visivel(c)) continue;
      if (!geoDe(e, c, z)) e.vis[c] = 0;
      else if (!e.vis[c]) e.vis[c] = ESMAECE ? 1 : 3;  // chegou agora (ou voltou à tela, ou o T3 entrou): aparece aos poucos
      if (e.vis[c] === 1) espera = true;
    }
    return espera;
  }
  // pinta no canvas ctx as classes dos vizinhos que estão na fase `fase` (o que está sob o mouse, mais forte)
  function pinta(ctx, t, fase) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!IDX || t.z < zMin || !desenhados.length) return;
    ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const c of ['T3', 'T2', 'T1']) {                // o tronco por cima
      if (!visivel(c)) continue;
      const w = larg(c, t.z);
      let algo = false, forte = null;
      ctx.strokeStyle = COR[c]; ctx.lineWidth = w; ctx.globalAlpha = ALFA;
      ctx.beginPath();
      for (const e of desenhados) {
        if (e.vis[c] !== fase) continue;
        const g = geoDe(e, c, t.z);
        if (!g) continue;
        if (e === sob) { forte = g; continue; }
        traca(ctx, e, g, t); algo = true;
      }
      if (algo) ctx.stroke();
      if (forte) { ctx.beginPath(); traca(ctx, sob, forte, t); ctx.globalAlpha = 1; ctx.lineWidth = w + 1; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  // os dois canvas inteiros (vista nova ou o que está no de baixo mudou)
  function desenha() {
    const t = tela;
    if (!cam._ctx || !t) return;
    const espera = fases(t.z);
    pinta(cam._ctx, t, 3);
    if (leva) pinta(cam._ctxN, t, 2);
    if (espera) levaLogo();
  }
  const levaLogo = () => { if (!leva && !proxLeva) proxLeva = setTimeout(esmaece, 90); };   // junta o que chega quase junto
  // leva: os que esperam vão para o canvas de cima, que vai de transparente a opaco; no fim, passam para o de baixo
  function esmaece() {
    proxLeva = 0;
    const t = tela;
    if (!t || leva) return;
    let n = 0;
    desenhados.forEach(e => CL.forEach(c => { if (e.vis[c] === 1) { e.vis[c] = 2; n++; } }));
    if (!n) return;
    leva = true;
    const cn = cam._ctxN.canvas;
    mede(cn, true);
    pinta(cam._ctxN, t, 2);
    cn.style.transition = 'none'; cn.style.opacity = '0';
    cn.getBoundingClientRect();                          // o 0 vale antes da transição começar
    cn.style.transition = `opacity ${ESMAECE}ms ease-out`; cn.style.opacity = '1';
    setTimeout(() => {
      leva = false;
      desenhados.forEach(e => CL.forEach(c => { if (e.vis[c] === 2) e.vis[c] = 3; }));
      if (tela) mede(cn, false);
      if (!map._animatingZoom) desenha(); else redesenha();
    }, ESMAECE + 20);
  }
  let pedido = 0, junta = 0;
  const redesenha = () => { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; if (!map._animatingZoom) desenha(); }); };
  const redesenhaJunto = () => { if (!junta) junta = setTimeout(() => { junta = 0; redesenha(); }, 120); };   // vários arquivos, uma pintura

  // ---------- quem entra e quem sai; o que baixar ----------
  // quanto da rede (T1 e T2) do alimentador cai no retângulo r ([x0, y0, x1, y1] em unidades), de 0 a 1: pelos pontos das
  // linhas que cruzam r, se algum nível já chegou; senão pela parte da caixa dentro de r
  const parte = (a0, a1, b0, b1) => a1 - a0 < 1e-12 ? (a0 >= b0 && a0 <= b1 ? 1 : 0) : Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / (a1 - a0);
  function fracEm(e, r) {
    const fonte = e.d[3] || e.d[1];
    if (fonte) {
      let n = 0, d = 0;
      const rx0 = r[0] - e.x0, ry0 = r[1] - e.y0, rx1 = r[2] - e.x0, ry1 = r[3] - e.y0;   // r relativo ao canto da caixa
      for (const c of ['T1', 'T2']) {
        const g = fonte[c];
        if (!g) continue;
        const ini = g.ini, cx = g.cx;
        for (let l = 0, nl = ini.length - 1; l < nl; l++) {
          const m = ini[l + 1] - ini[l];
          d += m;
          if (cx[4 * l] <= rx1 && cx[4 * l + 2] >= rx0 && cx[4 * l + 1] <= ry1 && cx[4 * l + 3] >= ry0) n += m;
        }
      }
      if (d) return n / d;
    }
    return parte(e.x0, e.x1, r[0], r[2]) * parte(e.y0, e.y1, r[1], r[3]);
  }
  function planeja() {
    if (!IDX) return;
    const z = map.getZoom(), b = map.getBounds(), s = 256 * Math.pow(2, z);
    const x0 = ux(b.getWest()), x1 = ux(b.getEast()), y0 = uy(b.getNorth()), y1 = uy(b.getSouth());
    const w = x1 - x0, h = y1 - y0, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const cruza = (e, f) => e.x0 <= x1 + f * w && e.x1 >= x0 - f * w && e.y0 <= y1 + f * h && e.y1 >= y0 - f * h;
    const dist = e => Math.hypot(Math.max(e.x0 - mx, 0, mx - e.x1), Math.max(e.y0 - my, 0, my - e.y1));
    const naTela = [x0, y0, x1, y1], meio = [mx - w / 4, my - h / 4, mx + w / 4, my + h / 4];
    tick++;
    let entra = [];
    const quer = new Map();
    if (z >= zMin) {
      // os que cruzam a tela (com folga), pela rede à vista (a do meio conta duas vezes): o tamanho do grosso × a parte
      // dele na tela. Entram até o orçamento de bytes; o fino, até o dele
      const t3 = comT3(z), cand = IDX.filter(e => cruza(e, FOLGA) && Math.max(e.x1 - e.x0, e.y1 - e.y0) * s >= 3);   // menor que 3 px: nem aparece
      cand.forEach(e => { e.fr = fracEm(e, naTela); e.sc = (e.b[0] + (t3 ? e.b[1] : 0)) * (e.fr + fracEm(e, meio)); });
      cand.sort((a, b) => b.sc - a.sc || dist(a) - dist(b) || (a.cod < b.cod ? -1 : 1));
      let bg = 0, bf = 0;
      for (const e of cand) {
        let fino = false;
        e.fi = false;
        if (z >= Z_FINO && !e.erro[3]) {
          // de perto (zoom 17 em diante) a tela é pequena e o fino de um rural grande cabe no orçamento: vale o fino
          fino = !!e.d[3] || (bf + e.b[2] <= ORC_FINO && (z >= 17 || e.b[2] * (1 - e.fr) <= DESPERDICIO));
          if (fino) bf += e.b[2];
        }
        if (!fino) {
          const g = e.b[0] + (t3 ? e.b[1] : 0);
          if (bg + g > ORC_GROSSO) continue;               // não cabe (os seguintes, menores, ainda podem caber)
          bg += g;
        }
        e.fi = fino;
        entra.push(e);
        falta(e, z, fino).forEach(k => quer.set(e.cod + '.' + k, { e, k }));
      }
      gasto = { grosso: bg, fino: bf };
    } else gasto = { grosso: 0, fino: 0 };
    const fica = z >= zMin ? desenhados.filter(e => !entra.includes(e) && cruza(e, FOLGA_SAI)) : [];
    const novos = entra.concat(fica.sort((a, b) => dist(a) - dist(b)).slice(0, FICA));
    desenhados.forEach(e => { if (!novos.includes(e)) e.vis = { T1: 0, T2: 0, T3: 0 }; });   // saiu: se voltar, aparece aos poucos de novo
    desenhados = novos;
    entram = entra.length;
    desenhados.forEach(e => { e.uso = tick; });
    // fila: os níveis que faltam, na ordem acima; o que saiu da tela é cancelado. O que já chegou no meio do gesto (e
    // espera o mapa parar em `chegou`) não é pedido de novo
    voando.forEach((ctrl, key) => { if (!quer.has(key)) { ctrl.abort(); voando.delete(key); } });
    const esperam = new Set(chegou.map(([e, k]) => e.cod + '.' + k));
    fila = [...quer.entries()].filter(([key]) => !voando.has(key) && !esperam.has(key));
    bombeia();
    pronto();
  }
  function bombeia() {
    while (voando.size < PARALELO && fila.length) {
      const [key, { e, k }] = fila.shift(), ctrl = new AbortController();
      voando.set(key, ctrl);
      fetch(`${BASE}${encodeURIComponent(e.cod)}.${k}.txt?v=${e.v}`, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(txt => {
          if (voando.get(key) !== ctrl) return;
          if (map.dragging.moving() || map._animatingZoom) chegou.push([e, k, txt]);   // no meio do gesto: quando o mapa parar
          else recebe(e, k, txt);
        })
        .catch(err => { if (err && err.name !== 'AbortError') e.erro[k] = true; })   // não tenta de novo nesta visita
        .finally(() => {
          if (voando.get(key) === ctrl) voando.delete(key);
          bombeia();
          pronto();
        });
    }
  }
  const pronto = () => { if (!primeiro && !voando.size && !fila.length) { primeiro = true; marca('viz:pronto'); } };
  // arquivo que chegou: decodificado e guardado. Já no canvas de baixo e o desenho mudou (o fino chegou): pinta de novo;
  // senão só entra na próxima leva
  const chegou = [];                                     // os que chegaram durante o arrasto ou o zoom
  function recebe(e, k, txt) {
    if (e.d[k]) return;                                  // já tinha chegado (não decodifica nem conta de novo)
    const z = tela ? tela.z : map.getZoom(), antes = CL.map(c => e.vis[c] === 3 && geoDe(e, c, z));
    e.d[k] = decodifica(txt, e);
    pontos += e.d[k].pts; bytes += txt.length;
    poda();
    if (!ESMAECE || CL.some((c, i) => antes[i] && geoDe(e, c, z) !== antes[i])) redesenhaJunto();
    else if (tela && fases(tela.z)) levaLogo();
  }
  // o mapa parou: os que chegaram no meio do gesto, um por vez (sem uma tarefa longa logo no fim do arrasto)
  function depoisDoGesto() {
    if (!chegou.length || map.dragging.moving() || map._animatingZoom) return;
    recebe(...chegou.shift());
    if (chegou.length) setTimeout(depoisDoGesto, 0);
  }
  // memória: passando do limite, saem os níveis dos menos usados que não estão na tela
  function poda() {
    if (pontos <= LIMITE) return;
    const fora = IDX.filter(e => e.uso < tick && (e.d[1] || e.d[2] || e.d[3])).sort((a, b) => a.uso - b.uso);
    for (const e of fora) {
      for (const k of [3, 2, 1]) if (e.d[k]) { pontos -= e.d[k].pts; e.d[k] = null; }
      if (pontos <= LIMITE * 0.8) return;
    }
  }

  // ---------- mouse e toque: o vizinho mais perto do ponto (a rede deste e as camadas têm a vez) ----------
  function vizinhoEm(pt, tol) {
    const t = tela;
    if (!t || !IDX || t.z < zMin || map._animatingZoom) return null;
    const a = map.containerPointToLayerPoint(pt).add(map.getPixelOrigin()), s = 256 * Math.pow(2, map.getZoom());   // o mapa de agora
    let melhor = null, dm = tol * tol;
    for (const e of desenhados) {
      const qx = a.x - e.x0 * s, qy = a.y - e.y0 * s;
      if (qx < -tol || qy < -tol || qx > (e.x1 - e.x0) * s + tol || qy > (e.y1 - e.y0) * s + tol) continue;
      for (const c of CL) {
        const g = visivel(c) && geoDe(e, c, t.z);
        if (!g) continue;
        const p = g.p, ini = g.ini, cx = g.cx;
        for (let l = 0, nl = ini.length - 1; l < nl; l++) {
          if (qx < cx[4 * l] * s - tol || qx > cx[4 * l + 2] * s + tol || qy < cx[4 * l + 1] * s - tol || qy > cx[4 * l + 3] * s + tol) continue;
          for (let k = ini[l]; k < ini[l + 1] - 1; k++) {
            const x1 = p[2 * k] * s, y1 = p[2 * k + 1] * s, dx = p[2 * k + 2] * s - x1, dy = p[2 * k + 3] * s - y1, l2 = dx * dx + dy * dy;
            const f = l2 ? Math.max(0, Math.min(1, ((qx - x1) * dx + (qy - y1) * dy) / l2)) : 0;
            const d = (x1 + f * dx - qx) ** 2 + (y1 + f * dy - qy) ** 2;
            if (d < dm) { dm = d; melhor = e; }
          }
        }
      }
    }
    return melhor;
  }
  const faixa = () => !!(window.__faixa && window.__faixa.ativo && window.__faixa.ativo());   // modo Limpeza de faixa: só a rede deste
  const mc = map.getContainer(), ren = map.options.renderer;
  // o código sob o mouse: no estilo do balão das linhas da rede (leaflet-tooltip), mas um elemento só, fora das camadas do
  // Leaflet (camada nova no mapa faz outras camadas se rearrumarem, e isso a cada vizinho que o mouse cruzasse)
  const dica = L.DomUtil.create('div', 'leaflet-tooltip leaflet-tooltip-top viz-dica', mc);
  dica.hidden = true;
  dica.setAttribute('aria-hidden', 'true');
  // com o balão de vizinho aberto, sem o código (ele ficaria por cima do balão)
  const comBalao = () => !!(map._popup && map._popup._map && map._popup.options.className === 'viz-popup');
  function paira(e) {
    let v = null, pt = null;
    const alvo = e && e.target;
    if (e && !faixa() && !map.dragging.moving() && alvo && (alvo === mc || alvo.tagName === 'CANVAS') && !alvo.classList.contains('leaflet-interactive')
      && !(ren && ren._hoveredLayer)) v = vizinhoEm(pt = map.mouseEventToContainerPoint(e), 7);
    if (v !== sob) { sob = v; mc.classList.toggle('viz-mao', !!v); redesenha(); }
    const mostra = v && !comBalao();
    if (mostra) { dica.textContent = v.cod; dica.style.left = pt.x + 'px'; dica.style.top = pt.y + 'px'; }
    dica.hidden = !mostra;
  }
  let mov = 0, ultimo = null;
  mc.addEventListener('mousemove', e => {
    if (MOVEL || e.buttons || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
    ultimo = e;
    if (!mov) mov = requestAnimationFrame(() => { mov = 0; paira(ultimo); });
  });
  mc.addEventListener('mouseleave', () => paira(null));
  map.on('movestart zoomstart', () => paira(null));
  // clique fora da rede deste (o da rede e o das camadas não chegam ao mapa): o balão do vizinho; o limpar segue igual
  map.on('click', e => {
    if (faixa() || !e.containerPoint) return;
    const oe = e.originalEvent || {}, toque = oe.pointerType ? oe.pointerType !== 'mouse' : MOVEL;
    const v = vizinhoEm(e.containerPoint, toque ? 14 : 7);
    if (!v) return;
    paira(null);
    const cod = esc(v.cod), url = '../' + encodeURIComponent(v.cod) + '/';
    L.popup({ className: 'viz-popup', maxWidth: 260, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] })
      .setLatLng(e.latlng).setContent(`<div class="viz-pop"><b>${cod}</b><small>Alimentador vizinho</small><a href="${url}">Abrir alimentador</a></div>`).openOn(map);
  });
  // botões T1 T2 T3 (o ouvinte de alimentador.js, registrado antes deste, já trocou o __visivel)
  const cls = document.getElementById('classes');
  if (cls) cls.addEventListener('click', e => { if (e.target.closest('button')) { planeja(); redesenha(); } });

  // para os testes e as medidas: fila vazia? o que está na tela? qual vizinho está no ponto (x, y) do mapa?
  window.__vizinhos = {
    ocioso: () => fim && !vez && !voando.size && !fila.length && !chegou.length && !leva && !proxLeva && !junta && !pedido,
    em: (x, y) => { const v = vizinhoEm(L.point(x, y), 7); return v ? v.cod : null; },
    estado: () => ({ indice: IDX ? IDX.length : 0, desenhados: desenhados.map(e => e.cod), entram, niveis: desenhados.map(e => [1, 2, 3].filter(k => e.d[k]).join('')),
      fino: desenhados.map(e => !!e.fi), gasto, limite: { grosso: ORC_GROSSO, fino: ORC_FINO, desperdicio: DESPERDICIO }, zMin,
      pontos, guardados: IDX ? IDX.reduce((t, e) => t + [1, 2, 3].reduce((u, k) => u + (e.d[k] ? e.d[k].pts : 0), 0), 0) : 0,
      bytes, voando: voando.size, fila: fila.length, zoom: tela && tela.z })
  };

  // ---------- começo: depois da rede deste inteira no mapa (até lá, nem o canvas existe) ----------
  const comeca = () => fetch(BASE + 'indice.json')
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      const als = j && j.als;
      if (!als) return;
      IDX = Object.keys(als).filter(cod => cod !== EU).map(cod => {
        const [s, w, n, e, v, ...b] = als[cod];
        return { cod, x0: ux(w), x1: ux(e), y0: uy(n), y1: uy(s), v, b, d: [null, null, null, null], erro: {}, vis: { T1: 0, T2: 0, T3: 0 }, uso: 0 };
      });
      zMin = Math.max(8, Math.min(zMin, map.getZoom()));   // abriu mais longe que o zoom 9: os vizinhos também aparecem
      cam.addTo(map);                                    // o canvas; daqui em diante, a cada vista nova (_update): planeja e desenha
    })
    .catch(() => { /* sem o índice: nada aparece */ })
    .finally(() => { fim = true; if (!IDX) primeiro = true; });
  if (AL) Promise.all([AL.rede, AL.pronto]).then(comeca); else if (document.readyState === 'complete') comeca(); else addEventListener('load', comeca);
})();
