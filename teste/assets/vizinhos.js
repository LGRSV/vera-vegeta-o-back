// Alimentadores vizinhos no mapa do alimentador (roda logo depois de alimentador.js, com window.__map e window.__al): a
// rede dos outros alimentadores que aparecem na tela, por baixo da rede deste. Só as linhas, nas cores das classes e mais
// apagadas (sem rótulos, NAE, chaves nem marcadores); painel, NAE, seleção, camadas e modo de faixa continuam só deste.
// Carrega sozinho: ao afastar ou arrastar o mapa entram os que aparecem na tela (com folga) e saem os que ficaram longe.
// Aos poucos: de longe só T1 e T2; do zoom 13 (celular: 14) entra o T3; de perto (15; celular: 16) o fino. Os botões
// T1 T2 T3 do mapa valem também aqui. Aparecem aos poucos (no celular, de uma vez). Passar o mouse mostra o código (e,
// com a seleção, "Clique para selecionar"); clicar ou tocar num vizinho (fora da rede deste) já o seleciona (abaixo); sem
// selecionados.js (mapa avulso), abre um balão com "Abrir alimentador".
// De perto, os equipamentos deles, os mesmos símbolos do alimentador aberto, menores e apagados como a rede, sem códigos
// escritos: DJ, religador, fusível e chave do zoom 15 em diante; transformador e os outros do 16. Os fusíveis somem com o
// T3 (como neste). Mouse ou toque num deles: o tipo, o código e o alimentador (o código vem de um arquivo à parte, baixado
// só nessa hora).
// Dados: dados/vizinhos/ (scripts/gera_trechos.py, vizinhos_mapa): indice.json com a caixa de cada alimentador e, por
// alimentador, T1 e T2 grosso (<AL>.1.txt), T3 grosso (.2) e o fino de perto (.3), em polyline; os equipamentos do zoom 15
// (.4) e do 16 (.5), também em polyline, e o tipo e o código deles (.6). Sem o índice (mapa fora do site), não faz nada.
// Para não pesar: um canvas próprio, num pane abaixo da rede e das divisas, desenhado de uma vez (um traço por classe para
// todos os vizinhos, não milhares de L.Polyline); no zoom e no arrasto o navegador só estica e move a imagem (como o canvas
// da rede) e o desenho é refeito quando o mapa para; o que chega no meio do gesto espera ele acabar. Entram todos os que
// têm rede na tela, até um limite de bytes (não de alimentadores: o limite por número deixava buracos onde há muitos
// alimentadores pequenos, porque um rural grande com a caixa sobre o meio da tela levava a vaga). Downloads numa fila
// (3 de cada vez; 2 no celular), primeiro os que têm mais rede à vista (contando duas vezes a do meio da tela), cancelando
// o que saiu dela (o que já começou a chegar termina e fica guardado); memória com limite (saem os menos usados). Os
// equipamentos só dos que entram, só no zoom em que aparecem e até um limite de bytes deles, depois da rede na fila;
// desenhados no mesmo canvas, por cima da rede dos vizinhos (cada símbolo uma imagem pronta, copiada no lugar), só os da
// tela; os que chegam entram juntos e de uma vez, por cima do que já está no canvas (sem refazê-lo). O vizinho sob o
// mouse fica mais forte num canvas à parte (mudar o realce não refaz o de baixo). Começa depois que a rede deste está
// inteira no mapa (__al.rede): a carga da página não muda.
// Alimentadores selecionados (selecionados.js, window.__alSel): a rede, o DJ, os religadores e os fusíveis deles são
// desenhados lá, fortes; depois que a rede deles está lá (__alSel.desenha: baixando ou com erro, seguem aqui como vizinhos) eles ficam fora do orçamento e não baixam a rede (.1 .2 .3), só os equipamentos (.4 e .5,
// primeiro), que selecionados.js pinta por cima da rede deles (pintaEqDe) e que o toque daqui ainda acha (transformador,
// chave e outro). Clique na linha de um vizinho: __alSel.seleciona, sem balão (com 10, o aviso de lá); enquanto ele baixa,
// a linha dele fica realçada aqui (no canvas de cima, como o vizinho sob o mouse, com um contorno claro), até selecionados.js
// desenhá-lo. Abrir: no menu Alimentadores (↗) ou no painel do trecho dele. O balão de equipamento ganha "Selecionar" (ou
// "Tirar da seleção"); a linha de um selecionado no ponto tem a vez sobre a linha de um vizinho.
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
  // equipamentos: .4 (DJ, religador, fusível, chave) do zoom 15 em diante e .5 (transformador e outros) do 16, como no
  // alimentador aberto; bytes deles na tela de uma vez (dos que entram). Cada arquivo, uma linha por grupo (GRUPOS)
  const Z_EQ = { 4: 15, 5: 16 }, ORC_EQ = MOVEL ? 100e3 : 400e3;
  const GRUPOS = { 4: 'DRfgc', 5: 'te' };                // D DJ, R religador, f fusível, g fusível SEC/FTR, c chave; t transformador, e outro
  const NIVEL = { D: 4, R: 4, f: 4, g: 4, c: 4, t: 5, e: 5 };
  const BLOCO = 32;                                      // pontos seguidos (na ordem do arquivo, perto uns dos outros) por caixa
  const CAM = ['T1', 'T2', 'T3', 'E4', 'E5'];            // o que aparece aos poucos: as classes e os equipamentos de cada nível
  const semVis = () => ({ T1: 0, T2: 0, T3: 0, E4: 0, E5: 0 });
  const corBt = c => { const b = document.querySelector(`#classes button[data-c="${c}"]`); return b && b.style.getPropertyValue('--c').trim(); };
  const COR = { T1: corBt('T1') || '#3b82f6', T2: corBt('T2') || '#22c55e', T3: corBt('T3') || '#facc15' };   // as do card T1 T2 T3
  const larg = (c, z) => (c === 'T1' ? 2.4 : c === 'T2' ? 1.9 : 1.2) * (z >= 16 ? 1.35 : z >= 14 ? 1.15 : 1);   // a rede deste: 6, 4,5 e 3
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const marca = n => { try { performance.mark(n); } catch (e) { /* sem marcas */ } };

  const css = document.createElement('style');
  css.textContent = '.leaflet-container.viz-mao{cursor:pointer}.viz-cam canvas{position:absolute;left:0;top:0}' +
    // (acima dos controles do mapa, z 1000 e 1001: perto do alto, a dica não fica atrás da fileira das camadas)
    '.viz-dica{z-index:1002;transform:translate(-50%,calc(-100% - 14px));font:600 var(--t-xs) var(--f-mono)}' +
    '.viz-dica b{display:block;font:inherit;text-align:center}.viz-dica small{display:block;font:500 11px/1.35 var(--f-body);opacity:.85;text-align:center}' +
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
  let gasto = { grosso: 0, fino: 0, eq: 0 };             // bytes dos que entram (para os testes)

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

  // equipamentos (.4 e .5) → por grupo, {p: Float32Array [x, y, ...] relativo ao canto da caixa, cx: Float32Array (caixa de
  // cada BLOCO pontos: x0, y0, x1, y1)}, na ordem do arquivo (a mesma do .6, dos códigos)
  function decodificaEq(txt, e, k) {
    const sec = txt.split('\n'), r = { pts: 0, g: {} };
    let la = 0, lo = 0;
    [...GRUPOS[k]].forEach((gr, j) => {
      const s = sec[j] || '', n = s.length;
      if (!n) return;
      const p = new Float32Array(n);
      let k2 = 0, i = 0;
      while (i < n) {
        let v = 0, sh = 0, b;
        do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
        la += v & 1 ? ~(v >> 1) : v >> 1;
        v = 0; sh = 0;
        do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
        lo += v & 1 ? ~(v >> 1) : v >> 1;
        p[k2++] = ux(lo / 1e5) - e.x0; p[k2++] = uy(la / 1e5) - e.y0;
      }
      const m = k2 / 2, cx = new Float32Array(4 * Math.ceil(m / BLOCO));
      for (let b = 0; b * BLOCO < m; b++) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let q = b * BLOCO, f = Math.min(m, q + BLOCO); q < f; q++) {
          const x = p[2 * q], y = p[2 * q + 1];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        cx[4 * b] = x0; cx[4 * b + 1] = y0; cx[4 * b + 2] = x1; cx[4 * b + 3] = y1;
      }
      r.g[gr] = { p: p.slice(0, k2), cx };
      r.pts += m;
    });
    return r;
  }

  // ---------- o que desenhar: zoom, classes (botões T1 T2 T3) e o nível que já chegou ----------
  const visivel = c => !window.__visivel || window.__visivel[c] !== false;
  const comT3 = z => z >= Z_T3 && visivel('T3');
  // classe c do alimentador e no zoom z: o fino de perto; senão o grosso; senão o que houver
  function geoDe(e, c, z) {
    if (e.sel || (c === 'T3' && !comT3(z))) return null;   // (a rede de um selecionado é desenhada em selecionados.js)
    const g = c === 'T3' ? e.d[2] : e.d[1];
    if (z >= Z_FINO && e.d[3]) return e.d[3][c];
    return g ? g[c] : e.d[3] ? e.d[3][c] : null;
  }
  // equipamentos do nível k (4 ou 5) no zoom z, se já chegaram; geo: o de cada item de CAM (classe ou nível de equipamento)
  const eqDe = (e, k, z) => z >= Z_EQ[k] ? e.d[k] : null;
  const geo = (e, c, z) => c[0] === 'E' ? eqDe(e, +c[1], z) : geoDe(e, c, z);
  // níveis que faltam no zoom z (fino: se cabe no orçamento do fino)
  function falta(e, z, fino) {
    if (e.d[3] || e.sel) return [];
    if (fino && z >= Z_FINO && !e.erro[3]) return [3];
    const k = [];
    if (!e.d[1] && !e.erro[1]) k.push(1);
    if (comT3(z) && !e.d[2] && !e.erro[2]) k.push(2);
    return k;
  }

  // ---------- o canvas: um L.Renderer (move e estica no zoom e no arrasto como o da rede; refeito quando o mapa para) ----------
  // Três canvas, um sobre o outro: o de baixo com os vizinhos já na tela; o do meio só com os que estão chegando, que
  // aparecem aos poucos pela transparência do próprio canvas (CSS: o navegador anima sem redesenhar nada). No fim, eles
  // passam para o de baixo, numa pintura só. Assim cada leva custa dois desenhos, não um por quadro. Fora da leva o do
  // meio fica sem tamanho e escondido (não ocupa memória nem entra na composição da tela a cada quadro do arrasto). O de
  // cima só tem o vizinho sob o mouse, mais forte: escondido sem ele, e sem tamanho a cada vista nova sem ele.
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
      this._ctxS = L.DomUtil.create('canvas', 'viz-sob', d).getContext('2d');
    },
    _destroyContainer() { L.DomUtil.remove(this._container); delete this._ctx; delete this._ctxN; delete this._ctxS; },
    // a imagem no lugar pela região em que foi desenhada (tela: canto em px absolutos e zoom), e não pelo tamanho de agora
    // do mapa (o do Leaflet: com o mapa de outro tamanho e a imagem de antes ainda no lugar, ela ia para fora dele); no
    // viewreset, a imagem de antes na vista nova (o Leaflet a punha pelo centro dela: parada na tela até o desenho novo)
    _updateTransform(c, z) {
      const t = tela;
      if (!t) return L.Renderer.prototype._updateTransform.call(this, c, z);
      const s = Math.pow(2, z - t.z), o = this._map._getNewPixelOrigin(c, z), p = L.point(t.x * s - o.x, t.y * s - o.y);
      if (L.Browser.any3d) L.DomUtil.setTransform(this._container, p, s); else L.DomUtil.setPosition(this._container, p);
    },
    _reset() { this._update(); this._updateTransform(this._map.getCenter(), this._map.getZoom()); },
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
      mede(this._ctxS.canvas, !!sob || pendentes().length > 0);
      planeja();                                         // quem entra e quem sai com a vista nova, e depois o desenho
      desenha();
      if (chegou.length) setTimeout(depoisDoGesto, 0);
    }
  });
  // canvas do tamanho da área do renderer (com = false: zera e esconde, para o do meio fora da leva e o de cima sem realce)
  function mede(c, com) {
    const t = tela, w = com ? R * t.w : 0, h = com ? R * t.h : 0;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c.style.width = (com ? t.w : 0) + 'px'; c.style.height = (com ? t.h : 0) + 'px'; }
    c.hidden = !com;
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
  // e.vis[classe]: 0 fora da tela, 1 esperando a próxima leva, 2 aparecendo (canvas do meio), 3 na tela (canvas de baixo);
  // os equipamentos (E4, E5) só 0 ou 3.
  // Cada pintura de um canvas custa a cópia dele inteiro para a tela: o de baixo só é pintado inteiro quando o que está
  // nele muda (vista nova, fim de leva, o fino no lugar do grosso, botões T1 T2 T3), não a cada arquivo que chega.
  let primeiro = false, leva = false, proxLeva = 0;
  const pinturas = { cheia: 0, eq: 0, sob: 0 };         // quantas de cada (para os testes e as medidas)
  // a fase de cada classe dos vizinhos na tela, pelo que já chegou; devolve true se algum espera a leva. Os equipamentos
  // não esperam leva: entram no canvas de baixo na próxima pintura dele (cheia: esta, que pinta tudo)
  function fases(z, cheia) {
    let espera = false;
    for (const e of desenhados) for (const c of CAM) {
      if (!visivel(c)) continue;
      if (!geo(e, c, z)) e.vis[c] = 0;
      else if (!e.vis[c]) {                              // chegou agora (ou voltou à tela, ou o T3 entrou): a rede aparece aos poucos
        if (c[0] !== 'E') e.vis[c] = ESMAECE ? 1 : 3;
        else if (cheia) e.vis[c] = 3;
      }
      if (e.vis[c] === 1) espera = true;
    }
    return espera;
  }
  // pinta no canvas ctx as classes dos vizinhos que estão na fase `fase`
  function pinta(ctx, t, fase) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!IDX || t.z < zMin || !desenhados.length) { if (ctx === cam._ctx) naTelaEq = {}; return; }
    ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const c of ['T3', 'T2', 'T1']) {                // o tronco por cima
      if (!visivel(c)) continue;
      let algo = false;
      ctx.strokeStyle = COR[c]; ctx.lineWidth = larg(c, t.z); ctx.globalAlpha = ALFA;
      ctx.beginPath();
      for (const e of desenhados) {
        if (e.vis[c] !== fase) continue;
        const g = geoDe(e, c, t.z);
        if (g) { traca(ctx, e, g, t); algo = true; }
      }
      if (algo) ctx.stroke();
    }
    pintaEq(ctx, t, fase);
    ctx.globalAlpha = 1;
  }
  // os selecionados que ainda não estão na imagem de selecionados.js (baixando, ou com erro): realçados aqui, já no clique
  const pendentes = () => { const S = window.__alSel; return S && S.tem ? desenhados.filter(e => !e.sel && S.tem(e.cod)) : []; };
  // o vizinho sob o mouse, mais forte (linhas mais largas e opacas, e os equipamentos dele), no canvas de cima: entrar ou
  // sair do realce só pinta esse canvas (um alimentador), não refaz o de baixo. Também os pendentes (acima), com um
  // contorno claro por baixo: o retorno do clique que seleciona
  function pintaSob() {
    const ctx = cam._ctxS, t = tela;
    if (!ctx || !t) return;
    const cv = ctx.canvas, pend = t.z < zMin ? [] : pendentes(), s = sob && t.z >= zMin && desenhados.includes(sob) && !pend.includes(sob) ? sob : null;
    if (!cv.hidden) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }
    if (!s && !pend.length) { cv.hidden = true; return; }
    mede(cv, true);
    ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 1;
    const linhas = (e, cor, mais) => {
      for (const c of ['T3', 'T2', 'T1']) {
        const g = visivel(c) && e.vis[c] >= 2 && geoDe(e, c, t.z);   // os que já estão num dos canvas
        if (!g) continue;
        ctx.strokeStyle = cor || COR[c]; ctx.lineWidth = larg(c, t.z) + mais;
        ctx.beginPath(); traca(ctx, e, g, t); ctx.stroke();
      }
    };
    for (const e of pend) { linhas(e, 'rgba(255,255,255,.85)', 4); linhas(e, null, 1.5); }
    if (s) linhas(s, null, 1);
    pintaEq(ctx, t, 3, e => e === s || pend.includes(e), 1);
    ctx.globalAlpha = 1;
    pinturas.sob++;
  }

  // ---------- os equipamentos: cada símbolo uma imagem pronta (na resolução do canvas), copiada em cada ponto da tela ----------
  // Os do alimentador aberto (alimentador.js e mapa_trechos.html, chaves.js, ativos-zoom.js), uns 3/4 do tamanho: fusível
  // (branco; SEC e FTR cinza), transformador (lilás), outro equipamento (ciano), chave (quadradinho âmbar) e o DJ e o
  // religador (a caixa com DJ ou 79, com o canto de cima à esquerda no ponto, como lá), sem os códigos escritos.
  // De baixo para cima, também como lá: fusíveis, transformadores e outros, chaves, DJ e religadores
  const ORDEM = 'fgtecDR';
  let SIMB = null;
  // w, h: tamanho; ax, ay: onde fica o ponto; d(dx, dy): px do ponto (dx, dy relativos a ele) até o símbolo (0: em cima)
  function simbolos() {
    if (SIMB) return SIMB;
    const mono = (getComputedStyle(document.documentElement).getPropertyValue('--f-mono') || '').trim() || 'monospace';
    const faz = (w, h, ax, ay, d, f) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * R); c.height = Math.ceil(h * R);
      const x = c.getContext('2d');
      x.scale(R, R);
      f(x);
      return { c, w, h, ax, ay, d };
    };
    const bola = (r, cor) => {
      const w = 2 * r + 3;
      return faz(w, w, w / 2, w / 2, (dx, dy) => Math.max(0, Math.hypot(dx, dy) - r - 0.6), x => {
        x.beginPath(); x.arc(w / 2, w / 2, r, 0, 2 * Math.PI);
        x.fillStyle = cor; x.fill(); x.lineWidth = 1.2; x.strokeStyle = '#111'; x.stroke();
      });
    };
    // retângulo de cantos redondos (o roundRect do canvas não existe nos navegadores mais velhos)
    const cantos = (x, l, t, w, h, r) => {
      x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
      x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
    };
    const caixa = txt => faz(23, 17, 1, 1, (dx, dy) => Math.hypot(Math.max(0, -dx, dx - 21), Math.max(0, -dy, dy - 15)), x => {
      cantos(x, 1.75, 1.75, 19.5, 13.5, 2.5);
      x.fillStyle = '#fbfbf9'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#1b2024'; x.stroke();
      x.fillStyle = '#1b2024'; x.font = `600 8.5px ${mono}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, 11.5, 9);
    });
    SIMB = {
      f: bola(3.2, '#fff'), g: bola(3.2, '#9ca3af'), t: bola(3.6, '#a78bfa'), e: bola(3.6, '#22d3ee'),
      c: faz(11, 11, 5.5, 5.5, (dx, dy) => Math.max(0, Math.abs(dx) - 4.6, Math.abs(dy) - 4.6), x => {
        cantos(x, 1.5, 1.5, 8, 8, 1.5);
        x.fillStyle = '#f59e0b'; x.fill(); x.lineWidth = 1.2; x.strokeStyle = '#111'; x.stroke();
      }),
      D: caixa('DJ'), R: caixa('79')
    };
    return SIMB;
  }
  const ehFusivel = gr => gr === 'f' || gr === 'g';      // somem com o T3, como os do alimentador aberto
  let naTelaEq = {};                                     // o que o canvas de baixo tem: alimentador → grupo → quantos (testes)
  // os equipamentos dos vizinhos na fase `fase` (quais(e, k): só esses, se dado), com a transparência alfa
  function pintaEq(ctx, t, fase, quais = null, alfa = ALFA) {
    const base = ctx === cam._ctx;
    if (base && !quais) naTelaEq = {};
    if (t.z < Z_EQ[4]) return;
    const S = simbolos(), s = t.s, W = t.w, H = t.h;
    ctx.globalAlpha = alfa;
    for (const gr of ORDEM) {
      if (ehFusivel(gr) && !visivel('T3')) continue;
      const k = NIVEL[gr], sp = S[gr];
      for (const e of desenhados) {
        if (e.sel || e.vis['E' + k] !== fase || (quais && !quais(e, k))) continue;   // (os de um selecionado: pintaEqDe)
        const dd = eqDe(e, k, t.z), g = dd && dd.g[gr];
        if (!g) continue;
        const bx = e.x0 * s - t.x, by = e.y0 * s - t.y, p = g.p, cx = g.cx, n = p.length / 2;
        let m = 0;
        for (let b = 0, nb = cx.length / 4; b < nb; b++) {
          if (cx[4 * b] * s + bx > W + 2 || cx[4 * b + 2] * s + bx < -24 || cx[4 * b + 1] * s + by > H + 2 || cx[4 * b + 3] * s + by < -18) continue;
          for (let i = b * BLOCO, f = Math.min(n, i + BLOCO); i < f; i++) {
            const x = p[2 * i] * s + bx - sp.ax, y = p[2 * i + 1] * s + by - sp.ay;
            if (x > W || y > H || x + sp.w < 0 || y + sp.h < 0) continue;
            ctx.drawImage(sp.c, Math.round(x * R) / R, Math.round(y * R) / R, sp.w, sp.h);
            m++;
          }
        }
        if (base && m) (naTelaEq[e.cod] = naTelaEq[e.cod] || {})[gr] = m;
      }
    }
  }
  // os transformadores, chaves e outros do selecionado cod, fortes, no canvas ctx de selecionados.js (já na resolução R; t:
  // a região dele, como a tela daqui). DJ, religadores e fusíveis ficam com selecionados.js
  function pintaEqDe(ctx, t, cod) {
    const e = IDX && IDX.find(x => x.cod === cod);
    if (!e || t.z < Z_EQ[4]) return;
    const S = simbolos(), s = t.s, W = t.w, H = t.h, bx = e.x0 * s - t.x, by = e.y0 * s - t.y;
    ctx.globalAlpha = 1;
    for (const gr of 'tec') {                            // na ordem de ORDEM
      const sp = S[gr], dd = eqDe(e, NIVEL[gr], t.z), g = dd && dd.g[gr];
      if (!g) continue;
      const p = g.p, cx = g.cx, n = p.length / 2;
      for (let b = 0, nb = cx.length / 4; b < nb; b++) {
        if (cx[4 * b] * s + bx > W + 2 || cx[4 * b + 2] * s + bx < -24 || cx[4 * b + 1] * s + by > H + 2 || cx[4 * b + 3] * s + by < -18) continue;
        for (let i = b * BLOCO, f = Math.min(n, i + BLOCO); i < f; i++) {
          const x = p[2 * i] * s + bx - sp.ax, y = p[2 * i + 1] * s + by - sp.ay;
          if (x > W || y > H || x + sp.w < 0 || y + sp.h < 0) continue;
          ctx.drawImage(sp.c, Math.round(x * R) / R, Math.round(y * R) / R, sp.w, sp.h);
        }
      }
    }
  }
  // os canvas inteiros (vista nova ou o que está no de baixo mudou)
  function desenha() {
    const t = tela;
    if (!cam._ctx || !t) return;
    const espera = fases(t.z, true);
    pinta(cam._ctx, t, 3);
    if (leva) pinta(cam._ctxN, t, 2);
    pintaSob();
    pinturas.cheia++;
    if (espera) levaLogo();
  }
  const levaLogo = () => { if (!leva && !proxLeva) proxLeva = setTimeout(esmaece, 90); };   // junta o que chega quase junto
  // leva: os que esperam vão para o canvas de cima, que vai de transparente a opaco; no fim, passam para o de baixo
  function esmaece() {
    proxLeva = 0;
    const t = tela;
    if (!t || leva) return;
    let n = 0;
    desenhados.forEach(e => CAM.forEach(c => { if (e.vis[c] === 1) { e.vis[c] = 2; n++; } }));
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
      desenhados.forEach(e => CAM.forEach(c => { if (e.vis[c] === 2) e.vis[c] = 3; }));
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
    const quer = new Map(), S = window.__alSel;
    IDX.forEach(e => { e.sel = !!(S && (S.desenha ? S.desenha(e.cod) : S.tem(e.cod))); });   // (baixando ou com erro: segue como vizinho)
    if (z >= zMin) {
      // os que cruzam a tela (com folga), pela rede à vista (a do meio conta duas vezes): o tamanho do grosso × a parte
      // dele na tela. Entram até o orçamento de bytes; o fino, até o dele. Os selecionados entram antes, sem a rede (só os
      // equipamentos) e fora do orçamento dela
      entra = IDX.filter(e => e.sel && cruza(e, FOLGA));
      entra.forEach(e => { e.fi = false; });
      const t3 = comT3(z), cand = IDX.filter(e => !e.sel && cruza(e, FOLGA) && Math.max(e.x1 - e.x0, e.y1 - e.y0) * s >= 3);   // menor que 3 px: nem aparece
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
      // de perto, os equipamentos dos que entram (na mesma ordem, depois da rede na fila), até o orçamento deles
      let be = 0;
      if (z >= Z_EQ[4]) for (const e of entra) for (const k of [4, 5]) {
        const n = e.be[k - 4];
        if (!n || z < Z_EQ[k] || e.erro[k] || (!e.d[k] && be + n > ORC_EQ)) continue;
        be += n;
        if (!e.d[k]) quer.set(e.cod + '.' + k, { e, k });
      }
      gasto = { grosso: bg, fino: bf, eq: be };
    } else gasto = { grosso: 0, fino: 0, eq: 0 };
    const fica = z >= zMin ? desenhados.filter(e => !entra.includes(e) && cruza(e, FOLGA_SAI)) : [];
    const novos = entra.concat(fica.sort((a, b) => dist(a) - dist(b)).slice(0, FICA));
    desenhados.forEach(e => { if (!novos.includes(e)) e.vis = semVis(); });   // saiu: se voltar, aparece aos poucos de novo
    desenhados = novos;
    entram = entra.length;
    desenhados.forEach(e => { e.uso = tick; });
    // fila: os níveis que faltam, na ordem acima; o que saiu da tela é cancelado, menos o que já começou a chegar (termina
    // e fica guardado: cancelado, seria baixado de novo se voltasse, como o fino que entra e sai no arrasto). O que já
    // chegou no meio do gesto (e espera o mapa parar em `chegou`) não é pedido de novo
    voando.forEach((ctrl, key) => { if (!quer.has(key) && !ctrl.chega) { ctrl.abort(); voando.delete(key); } });
    const esperam = new Set(chegou.map(([e, k]) => e.cod + '.' + k));
    fila = [...quer.entries()].filter(([key]) => !voando.has(key) && !esperam.has(key));
    bombeia();
    pronto();
  }
  function bombeia() {
    while (voando.size < PARALELO && fila.length) {
      const [key, { e, k }] = fila.shift(), ctrl = new AbortController();
      voando.set(key, ctrl);
      fetch(`${BASE}${encodeURIComponent(e.cod)}.${k}.txt?v=${k >= 4 ? e.ve : e.v}`, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(r.status); ctrl.chega = true; return r.text(); })
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
          if (eqVez) agendaEq();                         // o último dos equipamentos que vinham: entram agora
        });
    }
  }
  const pronto = () => { if (!primeiro && !voando.size && !fila.length) { primeiro = true; marca('viz:pronto'); } };
  // arquivo que chegou: decodificado e guardado. Rede já no canvas de baixo e o desenho mudou (o fino chegou): pinta de
  // novo; senão só entra na próxima leva. Equipamentos: entram juntos por cima do canvas (agendaEq)
  const chegou = [];                                     // os que chegaram durante o arrasto ou o zoom
  function recebe(e, k, txt) {
    if (e.d[k]) return;                                  // já tinha chegado (não decodifica nem conta de novo)
    const z = tela ? tela.z : map.getZoom(), antes = CAM.map(c => e.vis[c] === 3 && geo(e, c, z));
    e.d[k] = k >= 4 ? decodificaEq(txt, e, k) : decodifica(txt, e);
    pontos += e.d[k].pts; bytes += txt.length;
    poda();
    if (k >= 4) { agendaEq(); if (e.sel && window.__alSel && window.__alSel.eqMudou) window.__alSel.eqMudou(e.cod); }
    else if (!ESMAECE || CAM.some((c, i) => antes[i] && geo(e, c, z) !== antes[i])) redesenhaJunto();
    else if (tela && fases(tela.z)) levaLogo();
  }
  // Equipamentos que chegaram e ainda não estão no canvas: cada arquivo não refaz o canvas (eram uma pintura inteira por
  // arquivo, e eles vêm em muitos arquivos pequenos). Esperam os outros equipamentos que estão vindo (até EQ_JUNTA ms) e
  // entram juntos, de uma vez (sem leva), por cima do que já está no canvas de baixo: a rede dos vizinhos fica toda
  // embaixo deles. Só quando o vizinho já tem no canvas os do outro nível ele é refeito inteiro (para a ordem dos
  // símbolos: fusíveis, transformadores e outros, chaves, DJ e religadores); aí esperam mais (até EQ_ORDEM ms), para
  // os transformadores do zoom 16 que vêm aos poucos na rede lenta não refazerem o canvas várias vezes
  const EQ_JUNTA = 400, EQ_ORDEM = 1200;
  let eqVez = 0, eqDesde = 0;
  const ehEq = key => /\.[45]$/.test(key);
  const eqVindo = () => [...voando.keys()].some(ehEq) || fila.some(([key]) => ehEq(key)) || chegou.some(c => c[1] >= 4);
  const eqNovo = (e, k, z) => e.vis['E' + k] === 0 && !!eqDe(e, k, z);
  const eqRefaz = e => e.vis.E4 === 3 || e.vis.E5 === 3;   // novo nesse vizinho: o canvas é refeito inteiro
  function agendaEq() {
    const t = tela;
    clearTimeout(eqVez); eqVez = 0;
    let novo = false, refaz = false;
    if (t) for (const e of desenhados) if (eqNovo(e, 4, t.z) || eqNovo(e, 5, t.z)) { novo = true; if (eqRefaz(e)) { refaz = true; break; } }
    if (!novo) { eqDesde = 0; return; }
    const agora = performance.now();
    if (!eqDesde) eqDesde = agora;
    eqVez = setTimeout(juntaEq, eqVindo() ? Math.max(0, eqDesde + (refaz ? EQ_ORDEM : EQ_JUNTA) - agora) : 0);
  }
  function juntaEq() {
    eqVez = 0; eqDesde = 0;
    const t = tela, ctx = cam._ctx;
    // no meio de um gesto ou com uma pintura inteira a caminho: ela os põe
    if (!t || !ctx || vez || pedido || junta || leva || map._animatingZoom || map.dragging.moving()) return;
    const novo = [];
    for (const e of desenhados) for (const k of [4, 5]) if (eqNovo(e, k, t.z)) novo.push([e, k]);
    if (!novo.length) return;
    if (novo.some(([e]) => eqRefaz(e))) { redesenha(); return; }
    const ids = new Set(novo.map(([e, k]) => e.cod + '.' + k));
    novo.forEach(([e, k]) => { e.vis['E' + k] = 3; });
    ctx.setTransform(R, 0, 0, R, 0, 0);
    pintaEq(ctx, t, 3, (e, k) => ids.has(e.cod + '.' + k));
    ctx.globalAlpha = 1;
    pinturas.eq++;
    if (sob && novo.some(([e]) => e === sob)) pintaSob();
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
    const fora = IDX.filter(e => e.uso < tick && e.d.some(Boolean)).sort((a, b) => a.uso - b.uso);
    for (const e of fora) {
      for (const k of [5, 4, 3, 2, 1]) if (e.d[k]) { pontos -= e.d[k].pts; e.d[k] = null; }
      e.cods = e.codsV = null;
      if (pontos <= LIMITE * 0.8) return;
    }
  }

  // ---------- mouse e toque: o equipamento ou o vizinho mais perto do ponto (a rede deste e as camadas têm a vez) ----------
  // {e: o vizinho, q: o equipamento ({k, gr, i}: nível, grupo e posição no arquivo) ou null (a linha)}
  function alvoEm(pt, tol) {
    const t = tela;
    if (!t || !IDX || t.z < zMin || map._animatingZoom) return null;
    const a = map.containerPointToLayerPoint(pt).add(map.getPixelOrigin()), s = 256 * Math.pow(2, map.getZoom());   // o mapa de agora
    return eqEm(a, s, t.z, Math.max(3, tol - 4)) || linhaEm(a, s, t.z, tol);
  }
  // o equipamento a até tol px (do símbolo); em cima de dois, o de cima (ORDEM, de trás para a frente)
  function eqEm(a, s, z, tol) {
    if (z < Z_EQ[4]) return null;
    const S = simbolos();
    let melhor = null, dm = tol + 1e-9;
    for (let o = ORDEM.length - 1; o >= 0; o--) {
      const gr = ORDEM[o], k = NIVEL[gr], sp = S[gr];
      if (ehFusivel(gr) && !visivel('T3')) continue;
      for (const e of desenhados) {
        if (e.sel && 'DRfg'.includes(gr)) continue;      // (os de um selecionado são de selecionados.js)
        const dd = eqDe(e, k, z), g = dd && dd.g[gr];
        if (!g) continue;
        const qx = a.x - e.x0 * s, qy = a.y - e.y0 * s, p = g.p, cx = g.cx, n = p.length / 2, M = 24 + tol;
        for (let b = 0, nb = cx.length / 4; b < nb; b++) {
          if (qx < cx[4 * b] * s - M || qx > cx[4 * b + 2] * s + M || qy < cx[4 * b + 1] * s - M || qy > cx[4 * b + 3] * s + M) continue;
          for (let i = b * BLOCO, f = Math.min(n, i + BLOCO); i < f; i++) {
            const d = sp.d(qx - p[2 * i] * s, qy - p[2 * i + 1] * s);
            if (d < dm) { dm = d; melhor = { e, q: { k, gr, i } }; }
          }
        }
      }
    }
    return melhor;
  }
  // a linha de vizinho a até tol px
  function linhaEm(a, s, z, tol) {
    let melhor = null, dm = tol * tol;
    for (const e of desenhados) {
      const qx = a.x - e.x0 * s, qy = a.y - e.y0 * s;
      if (qx < -tol || qy < -tol || qx > (e.x1 - e.x0) * s + tol || qy > (e.y1 - e.y0) * s + tol) continue;
      for (const c of CL) {
        const g = visivel(c) && geoDe(e, c, z);
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
    return melhor && { e: melhor, q: null };
  }

  // ---------- tipo e código do equipamento: o .6 do vizinho, baixado na 1ª vez que o mouse ou o toque chega num dele ----------
  // os nomes do alimentador aberto: TIPO de alimentador.js (fusíveis), NOME de chaves.js e TIPO de ativos-zoom.js
  const FUS = { '03': 'fusível 03', '33': 'fusível 33', '02': 'chave 02', '40': 'trip saver 40', '41': 'trip saver 41', SEC: 'seccionamento',
    FTR: 'fusível no tronco (não abre T3)' };
  const CHAVE = { '80': 'chave faca', '88': 'chave 88', '90': 'chave de passagem', '31': 'chave de passagem', '68': 'chave de passagem' };
  const OUTRO = { '02': 'chave 02', '40': 'trip saver 40', '41': 'trip saver 41', Capacitor: 'banco de capacitor', Regulador: 'regulador de tensão',
    Chave: 'chave', ChaveNA: 'chave NA' };
  const GERAL = { D: 'disjuntor', R: 'religador', f: 'fusível', g: 'fusível', c: 'chave', t: 'transformador', e: 'equipamento' };
  const nomeEq = (gr, tp) => gr === 'f' || gr === 'g' ? FUS[tp] || tp : gr === 'c' ? CHAVE[tp] || 'chave ' + tp : gr === 'e' ? OUTRO[tp] || 'equipamento ' + tp : GERAL[gr];
  const LINHA6 = 'DRfgcte';                              // linhas do .6: as do .4 e depois as do .5
  const codigos = e => e.cods || (e.cods = fetch(`${BASE}${encodeURIComponent(e.cod)}.6.txt?v=${e.ve}`)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(txt => (e.codsV = txt.split('\n').map(l => l ? l.split('\t') : [])))
    .catch(() => null));                                 // sem o arquivo: só o tipo (não tenta de novo nesta visita)
  // {nome, cod} do equipamento q do vizinho e (cod: null enquanto o .6 não chegou)
  function sobre(e, q) {
    const x = e.codsV && e.codsV[LINHA6.indexOf(q.gr)] && e.codsV[LINHA6.indexOf(q.gr)][q.i];
    if (x == null) return { nome: GERAL[q.gr], cod: null };
    if ('DRt'.includes(q.gr)) return { nome: GERAL[q.gr], cod: x };
    const sp = x.indexOf(' ');
    return { nome: nomeEq(q.gr, sp < 0 ? x : x.slice(0, sp)), cod: sp < 0 ? '' : x.slice(sp + 1) };
  }
  const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);
  const mesmo = (a, b) => !!a && !!b && a.e === b.e && (a.q === b.q || (!!a.q && !!b.q && a.q.k === b.q.k && a.q.gr === b.q.gr && a.q.i === b.q.i));

  const faixa = () => !!(window.__faixa && window.__faixa.ativo && window.__faixa.ativo());   // modo Limpeza de faixa: só a rede deste
  const mc = map.getContainer(), ren = map.options.renderer;
  // o código sob o mouse: no estilo do balão das linhas da rede (leaflet-tooltip), mas um elemento só, fora das camadas do
  // Leaflet (camada nova no mapa faz outras camadas se rearrumarem, e isso a cada vizinho que o mouse cruzasse)
  const dica = L.DomUtil.create('div', 'leaflet-tooltip leaflet-tooltip-top viz-dica', mc);
  dica.hidden = true;
  dica.setAttribute('aria-hidden', 'true');
  // com o balão de vizinho aberto, sem o código (ele ficaria por cima do balão)
  const comBalao = () => !!(map._popup && map._popup._map && map._popup.options.className === 'viz-popup');
  let naDica = null;                                     // o alvo que a dica mostra
  // texto da dica: o código do vizinho (com a seleção, e embaixo "Clique para selecionar", ou o que __alSel.dica disser);
  // no equipamento, "código · tipo · vizinho" (sem o .6 ainda: "Tipo · vizinho")
  function textoDica(a) {
    if (!a.q) return a.e.cod;
    const x = sobre(a.e, a.q);
    return x.cod ? `${x.cod} · ${x.nome} · ${a.e.cod}` : `${maiuscula(x.nome)} · ${a.e.cod}`;
  }
  function poeDica(a) {
    const S = window.__alSel, d = !a.q && S && S.dica ? S.dica(a.e.cod) : '';
    if (d) dica.innerHTML = `<b>${esc(a.e.cod)}</b><small>${esc(d)}</small>`; else dica.textContent = textoDica(a);
  }
  function paira(ev) {
    let a = null, pt = null;
    const alvo = ev && ev.target;
    if (ev && !faixa() && !map.dragging.moving() && alvo && (alvo === mc || alvo.tagName === 'CANVAS') && !alvo.classList.contains('leaflet-interactive')
      && !(ren && ren._hoveredLayer)) a = alvoEm(pt = map.mouseEventToContainerPoint(ev), 7);
    if (a && !a.q && window.__alSel && window.__alSel.em(pt, 10)) a = null;   // a linha de um selecionado tem a vez
    const v = a && a.e;
    if (v !== sob) { sob = v; mc.classList.toggle('viz-mao', !!v); pintaSob(); }
    const mostra = a && !comBalao();
    naDica = mostra ? a : null;
    if (mostra) {
      poeDica(a); dica.style.left = pt.x + 'px'; dica.style.top = pt.y + 'px';
      if (a.q && !a.e.codsV) codigos(a.e).then(() => { if (mesmo(naDica, a) && !dica.hidden) dica.textContent = textoDica(a); });
    }
    dica.hidden = !mostra;
  }
  let mov = 0, ultimo = null;
  // a seleção mudou (o clique daqui, o menu, o ✕): o realce dos pendentes e a dica sob o mouse
  document.addEventListener('al:selecao', () => { pintaSob(); if (naDica && !naDica.q && !dica.hidden) poeDica(naDica); });
  mc.addEventListener('mousemove', e => {
    if (MOVEL || e.buttons || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
    ultimo = e;
    if (!mov) mov = requestAnimationFrame(() => { mov = 0; paira(ultimo); });
  });
  mc.addEventListener('mouseleave', () => paira(null));
  map.on('movestart zoomstart', () => paira(null));
  // o ponto do equipamento (Mercator de volta para lat, lon)
  const ondeEq = (e, q) => {
    const g = e.d[q.k].g[q.gr], x = g.p[2 * q.i] + e.x0, y = g.p[2 * q.i + 1] + e.y0;
    return L.latLng(Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI, x * 360 - 180);
  };
  // balão: o vizinho (código e "Abrir alimentador"); no equipamento, o código dele, o tipo e o vizinho (ou "selecionado",
  // se ele está na seleção: selecionados.js), e embaixo Maps e Earth com a coordenada dele (window.__geo, alimentador.js)
  function conteudo(a) {
    const al = esc(a.e.cod), url = '../' + encodeURIComponent(a.e.cod) + '/', S = window.__alSel, bt = S ? S.botao(a.e.cod) : '';
    const abre = bt ? `<span class="viz-acoes"><a href="${url}">Abrir alimentador</a>${bt}</span>` : `<a href="${url}">Abrir alimentador</a>`;
    const papel = S && S.tem(a.e.cod) ? 'selecionado' : 'vizinho';
    if (!a.q) return `<div class="viz-pop"><b>${al}</b><small>Alimentador ${papel}</small>${abre}</div>`;
    const x = sobre(a.e, a.q), ll = ondeEq(a.e, a.q), geo = window.__geo ? window.__geo.botoes(ll.lat, ll.lng) : '';
    return x.cod ? `<div class="viz-pop"><b>${esc(x.cod)}</b><small>${esc(maiuscula(x.nome))} · alimentador ${papel} ${al}</small>${abre}${geo}</div>`
      : `<div class="viz-pop"><b>${esc(maiuscula(x.nome))}</b><small>Alimentador ${papel} ${al}</small>${abre}${geo}</div>`;
  }
  // clique fora da rede deste (o da rede e o das camadas não chegam ao mapa): na linha do vizinho, já o seleciona (sem
  // __alSel ou fora do índice dela: o balão); no equipamento, o balão dele. O limpar segue igual
  map.on('click', ev => {
    if (faixa() || !ev.containerPoint) return;
    const oe = ev.originalEvent || {}, toque = oe.pointerType ? oe.pointerType !== 'mouse' : MOVEL, S = window.__alSel;
    const a = alvoEm(ev.containerPoint, toque ? 14 : 7);
    if (!a) return;
    if (!a.q && S && S.em(ev.containerPoint, toque ? 16 : 10)) return;   // a linha de um selecionado tem a vez
    if (a.q) ev._viz = 1;                                // equipamento: o balão dele (a seleção não escolhe a linha embaixo)
    if (!a.q && S && S.seleciona && S.seleciona(a.e.cod)) { map.closePopup(); return; }   // (o realce vem pelo al:selecao)
    paira(null);
    const pop = L.popup({ className: 'viz-popup', maxWidth: 260, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] })
      .setLatLng(a.q ? ondeEq(a.e, a.q) : ev.latlng).setContent(conteudo(a)).openOn(map);
    if (a.q && !a.e.codsV) codigos(a.e).then(() => { if (pop._map && pop._viz === a) pop.setContent(conteudo(a)); });
    pop._viz = a;
  });
  // botões T1 T2 T3 (o ouvinte de alimentador.js, registrado antes deste, já trocou o __visivel)
  const cls = document.getElementById('classes');
  if (cls) cls.addEventListener('click', e => { if (e.target.closest('button')) { planeja(); redesenha(); } });

  // para os testes e as medidas: fila vazia? o que está na tela? qual vizinho (ou equipamento) está no ponto (x, y) do mapa?
  const NIVEIS = [1, 2, 3, 4, 5];
  window.__vizinhos = {
    ocioso: () => fim && !vez && !voando.size && !fila.length && !chegou.length && !leva && !proxLeva && !junta && !pedido && !eqVez,
    em: (x, y) => { const a = alvoEm(L.point(x, y), 7); return a ? a.e.cod : null; },
    eqEm: (x, y, tol = 7) => { const a = alvoEm(L.point(x, y), tol), l = a && a.q && ondeEq(a.e, a.q); return l ? { al: a.e.cod, gr: a.q.gr, i: a.q.i, ll: [l.lat, l.lng] } : null; },
    // os equipamentos de um vizinho já baixados: grupo → [[lat, lon], ...]
    equip: cod => {
      const e = IDX && IDX.find(x => x.cod === cod), r = {};
      if (e) for (const k of [4, 5]) if (e.d[k]) for (const gr in e.d[k].g) r[gr] = Array.from({ length: e.d[k].g[gr].p.length / 2 }, (_, i) => { const l = ondeEq(e, { k, gr, i }); return [l.lat, l.lng]; });
      return r;
    },
    naTelaEq: () => naTelaEq,
    pintaEqDe,
    refaz: () => { if (IDX && cam._map) { planeja(); redesenha(); } },   // a seleção mudou (selecionados.js)
    indice: () => idxP,                                  // o indice.json lido (promessa; null antes de começar)
    estado: () => ({ indice: IDX ? IDX.length : 0, desenhados: desenhados.map(e => e.cod), entram, selecionados: IDX ? IDX.filter(e => e.sel).map(e => e.cod) : [], niveis: desenhados.map(e => NIVEIS.filter(k => e.d[k]).join('')),
      fino: desenhados.map(e => !!e.fi), gasto, limite: { grosso: ORC_GROSSO, fino: ORC_FINO, desperdicio: DESPERDICIO, eq: ORC_EQ }, zMin,
      pontos, guardados: IDX ? IDX.reduce((t, e) => t + NIVEIS.reduce((u, k) => u + (e.d[k] ? e.d[k].pts : 0), 0), 0) : 0,
      bytes, voando: voando.size, fila: fila.length, zoom: tela && tela.z, pinturas: { ...pinturas }, pendentes: pendentes().map(e => e.cod),
      chegando: [...voando].filter(([, c]) => c.chega).map(([key]) => key) })
  };

  // ---------- começo: depois da rede deste inteira no mapa (até lá, nem o canvas existe) ----------
  // (o índice lido fica em idxP: selecionados.js usa o mesmo, sem baixá-lo de novo)
  let idxP = null;
  const comeca = () => (idxP = fetch(BASE + 'indice.json').then(r => r.ok ? r.json() : null).catch(() => null))
    .then(j => {
      const als = j && j.als;
      if (!als) return;
      IDX = Object.keys(als).filter(cod => cod !== EU).map(cod => {
        const [s, w, n, e, v, b1, b2, b3, ve, b4, b5] = als[cod];   // ve, b4, b5: os equipamentos (sem eles, '' e 0)
        return { cod, x0: ux(w), x1: ux(e), y0: uy(n), y1: uy(s), v, b: [b1, b2, b3], ve: ve || '', be: [ve && b4 || 0, ve && b5 || 0],
          d: [null, null, null, null, null, null], erro: {}, vis: semVis(), uso: 0 };
      });
      zMin = Math.max(8, Math.min(zMin, map.getZoom()));   // abriu mais longe que o zoom 9: os vizinhos também aparecem
      cam.addTo(map);                                    // o canvas; daqui em diante, a cada vista nova (_update): planeja e desenha
    })
    .catch(() => { /* sem o índice: nada aparece */ })
    .finally(() => { fim = true; if (!IDX) primeiro = true; });
  if (AL) Promise.all([AL.rede, AL.pronto]).then(comeca); else if (document.readyState === 'complete') comeca(); else addEventListener('load', comeca);
})();
