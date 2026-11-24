// Alimentadores selecionados no mapa do alimentador (roda depois de visao-tocantins.js, com window.__map, window.__al e o
// window.__alKit de alimentador.js): até 10 outros alimentadores além do aberto, mostrados como ele. A rede nas cores das
// classes e opaca, os nomes dos trechos e a NAE (o botão NAE vale para eles), DJ e religadores, fusíveis do zoom 12; tocar
// num trecho de um deles mostra no painel o mesmo detalhe do aberto, com "No alimentador LD… · Abrir". A rede com T1, T2
// e T3 em qualquer zoom (pedido do usuário); de longe, os nomes dos T3 só do 12 e o desenho com menos pontos. Camadas (Faixa, Inspeção…), lista de trechos, busca do olho, modo Limpeza de faixa,
// Downloads e croqui continuam só do aberto.
// Como entram: clique (ou toque) na linha de um vizinho (vizinhos.js) ou do estado (visao-tocantins.js): já seleciona, sem
// balão (seleciona); a linha fica realçada lá enquanto baixa e o menu mostra o novo; com 10, um aviso curto (avisoVisivel).
// Clique na linha de um já selecionado: o painel do trecho dele (como antes); tirar, só no chip dele no menu. O balão de equipamento
// de vizinho segue com "Selecionar" (botao). Ou o menu "Alimentadores" no alto do mapa, à direita: chips lado a lado (o
// aberto primeiro; tocar no chip de um selecionado o tira do mapa e da lista, no do aberto esconde e mostra), ↗ Abrir ao
// lado de cada um, busca pelo código, Ver todos (enquadra o aberto e os selecionados), Tirar todos.
// O endereço guarda a escolha (?sel=A,B: volta ao recarregar); "Abrir" um selecionado leva os outros junto, e o aberto de
// agora vira selecionado na página dele.
// "Abrir <município>" da página inicial (mapa-municipios.js, mapa-sat-to.js) chega com ?sel=…&mun=<código IBGE>&fora=N:
// o aberto é o de mais km no município e os selecionados os 10 seguintes; o mapa enquadra o município (window.MUNICIPIOS,
// de divisas.js; sem ele, o aberto e os selecionados) e, com N > 0, o menu avisa quantos do município ficaram de fora.
// O ?mun e o ?fora saem do endereço depois (o ?sel fica).
// O aberto também sai do mapa sem sair da página: o chip dele no menu (pedido do usuário: ver o mapa por baixo dele,
// mesmo com um alimentador só); o chip fica apagado e riscado, "escondido" (aria-pressed=false). O painel continua o dele e o endereço não guarda
// (recarregar mostra de novo). Como: "o aberto escondido", mais abaixo.
// Para não pesar (medido no celular com a CPU 4x mais lenta):
// - o dados.js de cada um (o mesmo arquivo e o mesmo cache da página dele) é lido e montado num worker ("dados"); nunca roda
//   como <script> (trocaria o window.D deste). A página recebe a geometria pronta em Float32 (Mercator relativo ao canto da
//   caixa), as cadeias de vãos (as mesmas do aberto: alimentador.js, cadeias), os vãos em colunas, os trechos, a NAE e os
//   fusíveis; ele sai quando a fila de downloads acaba (o lixo do JSON vai com ele);
// - a rede de todos é desenhada noutro worker ("pintor", OffscreenCanvas), numa imagem só por vista, num pane abaixo da
//   rede do aberto; no zoom e no arrasto a imagem só estica e anda (como o canvas da rede), e a nova chega quando o mapa
//   para. Sem worker, o mesmo código roda aqui; sem OffscreenCanvas, num canvas da página, um alimentador por vez;
// - os nomes (DOM) só os da tela, num pane próprio (fora do .leaflet-marker-pane: o filtro de município, a Queimadas e os
//   outros ganchos que procuram trecho pelo nome são do aberto; T1 e T2 existem em todos).
// Nada do selecionado passa pelos ganchos do aberto (__sel, __clique, __onSel, __selecao, __linhas, a lista): a chave é
// sempre o código e o nome. O aberto avisa a troca de trecho por 'al:sel' e a da NAE por 'al:nae' (document).
// Começa depois que a rede do aberto está inteira, o painel apareceu e a lista dele está feita (__al.rede, __al.pronto,
// __al.lista): a carga da página não muda, e sem nada selecionado não há worker, canvas nem arquivo a mais (o índice dos
// alimentadores é o que o vizinhos.js já leu).
(function () {
  const map = window.__map, L = window.L, K = window.__alKit, AL = window.__al || null, eu = document.currentScript;
  if (!map || !L || !K || !eu || !/\/assets\/selecionados\.js(\?|$)/.test(eu.src) || !document.documentElement.classList.contains('al-site')) return;
  const ALS = new URL('../alimentadores/', eu.src).href, VIZ = new URL('../dados/vizinhos/', eu.src).href, UCS = new URL('../dados/ucs/', eu.src).href;
  const EU = K.EU.al || (/\/alimentadores\/([^/]+)\//.exec(location.pathname) || [])[1] || '';
  const MOVEL = L.Browser.mobile || matchMedia('(pointer:coarse)').matches;
  const MAX = 10;                                        // além do aberto (pedido do usuário: até 11 no mapa)
  const PARALELO = MOVEL ? 2 : 3;                        // downloads ao mesmo tempo
  const R = L.Browser.retina && !MOVEL ? 2 : 1;          // resolução da imagem (a dos vizinhos)
  const MAXPX = MOVEL ? 1.5e6 : 4e6;                     // px da imagem no máximo (a resolução cai)
  const FOLGA = 0.15;                                    // em volta da vista (fração dela): o arrasto curto não pede imagem nova
  const Z_PERTO = 12, Z_T3 = 15.5;                        // de 12 igual ao aberto (nomes dos T3 com NAE, fusíveis); T3 da tela do 15,5
  const esc = K.esc;
  const ux = lon => (lon + 180) / 360, uy = lat => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
  const lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI, lon = x => x * 360 - 180;
  const visivel = c => !window.__visivel || window.__visivel[c] !== false;
  const faixa = () => !!(window.__faixa && window.__faixa.ativo && window.__faixa.ativo());   // modo Limpeza de faixa: só o aberto
  const classeDe = nome => nome.split('-')[0];
  const mc = map.getContainer(), box = mc.closest('.mapbox') || mc.parentElement;
  const med = { recebe: [], pinturas: [], longas: 0 };   // medidas (testes e scripts/mede_selecionados.js)
  const mede = t0 => { const d = performance.now() - t0; if (d > 50) med.longas++; return d; };

  // ---------- montagem da rede de um alimentador (no worker "dados"; sem worker, aqui): só usa o que recebe ----------
  // texto do dados.js (`window.D = {…};`) → geometria: p (Float32 [x, y, …], Mercator relativo ao canto x0, y0 da caixa),
  // ini (1º ponto de cada cadeia e o fim), cx (caixa de cada cadeia), ct (trecho de cada cadeia), cs (estilo: tipo·6 +
  // zona), cl (classe 1, 2, 3), tc (1ª cadeia e a seguinte à última de cada trecho), tb (caixa de cada trecho), sv (vão que
  // termina em cada ponto, -1 no 1º ponto de cada cadeia). As cadeias: os vãos de cada trecho na ordem, os seguidos (o fim
  // de um é o início do outro) numa linha só, como alimentador.js (cadeias). Vãos em colunas (código e postes em texto,
  // separados por \n; metros), fusíveis (pontos, cinza: SEC e FTR; nome, tipo e trecho em texto)
  function montaRede(txt) {
    const ux = lon => (lon + 180) / 360, uy = lat => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
    const D = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const V = D.vaos || [], T = D.trechos || [], nv = V.length, nt = T.length, F = D.fusiveis || [];
    const mx = new Float64Array(nv * 4);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < nv; i++) {
      const v = V[i], a = ux(v[1]), b = uy(v[0]), c = ux(v[3]), d = uy(v[2]);
      mx[4 * i] = a; mx[4 * i + 1] = b; mx[4 * i + 2] = c; mx[4 * i + 3] = d;
      if (a < x0) x0 = a; if (c < x0) x0 = c; if (a > x1) x1 = a; if (c > x1) x1 = c;
      if (b < y0) y0 = b; if (d < y0) y0 = d; if (b > y1) y1 = b; if (d > y1) y1 = d;
    }
    for (const f of F) { const a = ux(f.lon), b = uy(f.lat); if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; }
    if (!(x1 >= x0)) x0 = y0 = x1 = y1 = 0;
    // vãos de cada trecho, na ordem do arquivo
    const off = new Uint32Array(nt + 1), ord = new Uint32Array(nv), pos = new Uint32Array(nt + 1);
    for (let i = 0; i < nv; i++) off[V[i][4] + 1]++;
    for (let t = 0; t < nt; t++) off[t + 1] += off[t];
    pos.set(off);
    for (let i = 0; i < nv; i++) ord[pos[V[i][4]]++] = i;
    const p = new Float32Array(nv * 4), sv = new Int32Array(nv * 2), tc = new Uint32Array(nt * 2), tb = new Float32Array(nt * 4);
    const ini = [], cx = [], ct = [], cs = [], cl = [];
    let k = 0;
    for (let t = 0; t < nt; t++) {
      const tr = T[t], z = tr.zona, st = (tr.tipo === 'principal' ? 0 : tr.tipo === 'ramal' ? 6 : 12) + (z >= 1 && z <= 5 ? z - 1 : 5);
      const c3 = { T1: 1, T2: 2 }[String(tr.nome).split('-')[0]] || 3;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, cx0, cy0, cx1, cy1, aberta = false, la = NaN, lo = NaN;
      tc[2 * t] = ini.length;
      const ponto = (x, y, s) => {
        sv[k] = s; p[2 * k] = x; p[2 * k + 1] = y; k++;
        if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
      };
      const fecha = () => {
        cx.push(cx0, cy0, cx1, cy1);
        if (cx0 < bx0) bx0 = cx0; if (cx1 > bx1) bx1 = cx1; if (cy0 < by0) by0 = cy0; if (cy1 > by1) by1 = cy1;
      };
      for (let j = off[t]; j < off[t + 1]; j++) {
        const i = ord[j], v = V[i];
        if (aberta && v[0] === la && v[1] === lo) ponto(mx[4 * i + 2] - x0, mx[4 * i + 3] - y0, i);
        else {
          if (aberta) fecha();
          ini.push(k); ct.push(t); cs.push(st); cl.push(c3);
          cx0 = cy0 = Infinity; cx1 = cy1 = -Infinity; aberta = true;
          ponto(mx[4 * i] - x0, mx[4 * i + 1] - y0, -1);
          ponto(mx[4 * i + 2] - x0, mx[4 * i + 3] - y0, i);
        }
        la = v[2]; lo = v[3];
      }
      if (aberta) fecha();
      tc[2 * t + 1] = ini.length;
      if (bx1 >= bx0) { tb[4 * t] = bx0; tb[4 * t + 1] = by0; tb[4 * t + 2] = bx1; tb[4 * t + 3] = by1; }
    }
    ini.push(k);
    const nf = F.length, fp = new Float32Array(nf * 2), fg = new Uint8Array(nf), fcx = new Float32Array(4 * Math.ceil(nf / 32));
    F.forEach((f, i) => { fp[2 * i] = ux(f.lon) - x0; fp[2 * i + 1] = uy(f.lat) - y0; fg[i] = f.t === 'SEC' || f.t === 'FTR' ? 1 : 0; });
    for (let b = 0; b * 32 < nf; b++) {
      let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
      for (let i = b * 32, f = Math.min(nf, i + 32); i < f; i++) { const x = fp[2 * i], y = fp[2 * i + 1]; if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
      fcx[4 * b] = a0; fcx[4 * b + 1] = b0; fcx[4 * b + 2] = a1; fcx[4 * b + 3] = b1;
    }
    const m = new Float64Array(nv);
    for (let i = 0; i < nv; i++) m[i] = +V[i][8];
    const meta = D.meta || {};
    return {
      g: { x0, y0, x1, y1, p: p.slice(0, 2 * k), sv: sv.slice(0, k), ini: Uint32Array.from(ini), cx: Float32Array.from(cx), ct: Uint32Array.from(ct),
        cs: Uint8Array.from(cs), cl: Uint8Array.from(cl), tc, tb },
      vaos: { n: nv, id: V.map(v => v[5]).join('\n'), p1: V.map(v => String(v[6])).join('\n'), p2: V.map(v => String(v[7])).join('\n'), m },
      fus: { n: nf, p: fp, g: fg, cx: fcx, nome: F.map(f => f.nome).join('\n'), t: F.map(f => f.t).join('\n'), tr: F.map(f => f.trecho || '').join('\n') },
      D: { trechos: T, principais: D.principais || [], nae: D.nae || null, meta: { al: meta.al, resumo: meta.resumo, origem: meta.origem } }
    };
  }
  // os buffers que vão sem cópia, e a cópia do que o pintor usa
  const buffers = r => [r.g.p, r.g.sv, r.g.ini, r.g.cx, r.g.ct, r.g.cs, r.g.cl, r.g.tc, r.g.tb, r.vaos.m, r.fus.p, r.fus.g, r.fus.cx].map(a => a.buffer);
  // (mesma: na página, sem cópia)
  const paraPintor = (cod, r, mesma) => { const c = a => mesma ? a : a.slice(); return { t: 'geo', cod, x0: r.g.x0, y0: r.g.y0, x1: r.g.x1, y1: r.g.y1, p: c(r.g.p), ini: c(r.g.ini),
    cx: c(r.g.cx), cs: c(r.g.cs), cl: c(r.g.cl), fp: c(r.fus.p), fg: c(r.fus.g), fcx: c(r.fus.cx) }; };
  const buffersPintor = m => [m.p, m.ini, m.cx, m.cs, m.cl, m.fp, m.fg, m.fcx].map(a => a.buffer);

  // o worker "dados": baixa (cancelável), monta e manda a rede à página e a cópia ao pintor (porta)
  function Dados(posta) {
    const vindo = new Map();
    let porta = null;
    return (m, portas) => {
      if (m.t === 'porta') { porta = portas[0]; return; }
      if (m.t === 'cancela') { const c = vindo.get(m.cod); if (c) { c.abort(); vindo.delete(m.cod); } return; }
      if (m.t !== 'baixa') return;
      const ctrl = new AbortController(), t0 = performance.now();
      vindo.set(m.cod, ctrl);
      fetch(m.url, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(txt => {
          if (vindo.get(m.cod) !== ctrl) return;
          vindo.delete(m.cod);
          const t1 = performance.now(), r = montaRede(txt);
          r.cod = m.cod; r.tempo = { baixa: t1 - t0, monta: performance.now() - t1, bytes: txt.length };
          if (porta) { const q = paraPintor(m.cod, r); porta.postMessage(q, buffersPintor(q)); }
          posta({ t: 'rede', r, porta: !!porta }, buffers(r));
        })
        .catch(e => { if (vindo.get(m.cod) === ctrl) vindo.delete(m.cod); if (!e || e.name !== 'AbortError') posta({ t: 'erro', cod: m.cod, msg: String(e && e.message || e) }); });
    };
  }

  // ---------- desenho (no worker "pintor"; sem ele, aqui): só usa o que recebe ----------
  // estilo cs: tipo (principal 0, ramal 6, fusível 12) + zona (1 a 5 → 0 a 4; outra 5): as cores e os pesos do aberto
  const COR_ST = ['#3b82f6', '#22c55e', '#facc15', '#f97316', '#ef4444', '#d946ef'], PESO_ST = [6, 4.5, 3];
  // as cadeias do alimentador e (já num beginPath) do estilo st na região r (px absolutos do zoom r.z): nível de detalhe
  // (de perto pula ponto a menos de 0,6 px do anterior; de longe, a menos de 2 px; o T3 em qualquer zoom, como no aberto) e as
  // classes ligadas (op.vis[1..3])
  function tracaRede(ctx, e, lista, r, op) {
    const s = 256 * Math.pow(2, r.z), bx = e.x0 * s - r.x, by = e.y0 * s - r.y, W = r.w + 8, H = r.h + 8, p = e.p, ini = e.ini, cx = e.cx;
    const perto = r.z >= 12, sk = perto ? 0.6 : 2;
    let algo = false;
    for (let j = 0; j < lista.length; j++) {
      const l = lista[j], c = e.cl[l];
      if (!op.vis[c]) continue;
      const a0 = cx[4 * l] * s + bx, b0 = cx[4 * l + 1] * s + by, a1 = cx[4 * l + 2] * s + bx, b1 = cx[4 * l + 3] * s + by;
      if (a0 > W || a1 < -8 || b0 > H || b1 < -8) continue;
      const a = ini[l], b = ini[l + 1];
      let lx = p[2 * a] * s + bx, ly = p[2 * a + 1] * s + by;
      ctx.moveTo(lx, ly);
      for (let k = a + 1; k < b; k++) {
        const x = p[2 * k] * s + bx, y = p[2 * k + 1] * s + by;
        if (k < b - 1 && x - lx < sk && lx - x < sk && y - ly < sk && ly - y < sk) continue;
        ctx.lineTo(x, y); lx = x; ly = y;
      }
      algo = true;
    }
    return algo;
  }
  // um alimentador inteiro (as cadeias por estilo, na ordem principal → ramal → fusível), com a opacidade alfa
  function pintaAl(ctx, e, r, op, alfa) {
    if (!e.porSt) {                                      // as cadeias de cada estilo (uma vez)
      const n = {};
      for (let l = 0; l < e.cs.length; l++) (n[e.cs[l]] = n[e.cs[l]] || []).push(l);
      e.porSt = Object.keys(n).map(Number).sort((a, b) => a - b).map(st => [st, Uint32Array.from(n[st])]);
    }
    const s = 256 * Math.pow(2, r.z);
    if (e.x0 * s - r.x > r.w + 8 || e.x1 * s - r.x < -8 || e.y0 * s - r.y > r.h + 8 || e.y1 * s - r.y < -8) return;
    ctx.globalAlpha = alfa;
    for (const [st, lista] of e.porSt) {
      ctx.beginPath();
      if (!tracaRede(ctx, e, lista, r, op)) continue;
      ctx.strokeStyle = COR_ST[st % 6]; ctx.lineWidth = PESO_ST[(st / 6) | 0];
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // os fusíveis do alimentador (a imagem pronta sp: bolinha branca, ou cinza nos SEC e FTR) na região r
  function pintaFus(ctx, e, r, sp) {
    const s = 256 * Math.pow(2, r.z), bx = e.x0 * s - r.x, by = e.y0 * s - r.y, p = e.fp, cx = e.fcx, n = p.length / 2, W = r.w + 6, H = r.h + 6;
    for (let b = 0, nb = cx.length / 4; b < nb; b++) {
      if (cx[4 * b] * s + bx > W || cx[4 * b + 2] * s + bx < -6 || cx[4 * b + 1] * s + by > H || cx[4 * b + 3] * s + by < -6) continue;
      for (let i = b * 32, f = Math.min(n, i + 32); i < f; i++) {
        const x = p[2 * i] * s + bx, y = p[2 * i + 1] * s + by;
        if (x < -6 || y < -6 || x > W || y > H) continue;
        ctx.drawImage(sp[e.fg[i]], x - 6, y - 6, 12, 12);
      }
    }
  }
  // a bolinha do fusível (raio 4, contorno #111 de 1,5 px, como o circleMarker do aberto) em 12×12 px, na resolução k
  function bolinhas(k, novo) {
    return ['#fff', '#9ca3af'].map(cor => {
      const c = novo(Math.ceil(12 * k), Math.ceil(12 * k)), x = c.getContext('2d');
      x.scale(k, k); x.beginPath(); x.arc(6, 6, 4, 0, 2 * Math.PI);
      x.fillStyle = cor; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#111'; x.stroke();
      return c;
    });
  }
  // o pintor: guarda a geometria (chega pela porta, do worker "dados") e desenha o último pedido (os do meio, que chegam
  // juntos, ficam de fora): todos os alimentadores na ordem, depois os fusíveis; devolve a imagem (ImageBitmap). A de quem
  // já saiu da seleção (m.vivos: os selecionados de agora) é apagada a cada pedido: a porta e a página não andam juntas
  function Pintor(posta) {
    const als = new Map();
    let pedido = null, vez = 0, tela = null, sp = null, spk = 0;
    const pinta = () => {
      vez = 0;
      const m = pedido;
      pedido = null;
      if (!m) return;
      const t0 = performance.now(), r = m.r, W = Math.max(1, Math.ceil(r.w * r.k)), H = Math.max(1, Math.ceil(r.h * r.k));
      if (!tela || tela.width !== W || tela.height !== H) tela = new OffscreenCanvas(W, H);
      const ctx = tela.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.setTransform(r.k, 0, 0, r.k, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const cod of m.cods) { const e = als.get(cod); if (e) pintaAl(ctx, e, r, m, cod === m.apaga ? 0.28 : 1); }
      if (m.fus) {
        if (!sp || spk !== r.k) { sp = bolinhas(r.k, (w, h) => new OffscreenCanvas(w, h)); spk = r.k; }
        for (const cod of m.cods) { const e = als.get(cod); if (e) pintaFus(ctx, e, r, sp); }
      }
      const bm = tela.transferToImageBitmap();
      posta({ t: 'tela', id: m.id, r, bm, ms: performance.now() - t0 }, [bm]);
    };
    return m => {
      if (m.t === 'geo') als.set(m.cod, m);
      else if (m.t === 'tira') als.delete(m.cod);
      else if (m.t === 'pinta') {
        if (m.vivos) { const v = new Set(m.vivos); for (const cod of [...als.keys()]) if (!v.has(cod)) als.delete(cod); }
        pedido = m; if (!vez) vez = setTimeout(pinta, 0);
      }
    };
  }

  // ---------- modo: workers (dados e pintor), só na página (window.__alSelModo = 'pagina', medidas) ou sem OffscreenCanvas ----------
  // O worker "dados" só vive enquanto há download: parado (fila vazia por 1,5 s) ele sai, e com ele o lixo do JSON dos
  // arquivos (de 16 a 24 MB até a coleta, medido no celular); o próximo download o cria de novo, com uma porta nova ao pintor
  let MODO = null, PAGINA = false, W_DADOS = null, W_PINTOR = null, recebeDados = null, recebePintor = null, porta2 = null, tDorme = 0;
  const temOC = (() => { try { const o = window.OffscreenCanvas && new OffscreenCanvas(1, 1); return !!(o && o.getContext('2d') && o.transferToImageBitmap && window.createImageBitmap && document.createElement('canvas').getContext('bitmaprenderer')); } catch (e) { return false; } })();
  const fonte = corpo => URL.createObjectURL(new Blob([`'use strict';\n${corpo}`], { type: 'text/javascript' }));
  function sobe() {                                      // na 1ª seleção
    if (MODO) return;
    PAGINA = window.__alSelModo === 'pagina' || !window.Worker;
    if (temOC && !PAGINA) {
      try {
        const u = fonte(`const COR_ST = ${JSON.stringify(COR_ST)}, PESO_ST = ${JSON.stringify(PESO_ST)};\nconst tracaRede = ${tracaRede};\nconst pintaAl = ${pintaAl};\n` +
          `const pintaFus = ${pintaFus};\nconst bolinhas = ${bolinhas};\nconst recebe = (${Pintor})((m, t) => postMessage(m, t || []));\n` +
          `onmessage = e => { if (e.data && e.data.t === 'porta') e.ports[0].onmessage = x => recebe(x.data); else recebe(e.data); };\n`);
        W_PINTOR = new Worker(u); URL.revokeObjectURL(u);
        W_PINTOR.onmessage = e => imagem(e.data);
        MODO = 'worker';
      } catch (e) { W_PINTOR = null; }
    }
    if (!W_PINTOR) {
      MODO = temOC ? 'pagina' : '2d';
      if (temOC) recebePintor = Pintor(m => setTimeout(() => imagem(m), 0));
    }
  }
  // a porta entre o "dados" e quem desenha (o pintor no worker, ou a página): dá a ponta de lá a quem monta
  function liga(da) {
    const ch = new MessageChannel();
    da(ch.port1);
    if (porta2) { porta2.close(); porta2 = null; }
    if (W_PINTOR) W_PINTOR.postMessage({ t: 'porta' }, [ch.port2]);
    else { porta2 = ch.port2; porta2.onmessage = e => paraAqui(e.data); }
  }
  // o "dados" (no 1º download e de novo depois de parado): no worker; sem ele (ou se ele falha), o mesmo código aqui
  function criaDados() {
    clearTimeout(tDorme); tDorme = 0;
    if (W_DADOS || recebeDados) return;
    if (!PAGINA) {
      try {
        const u = fonte(`const montaRede = ${montaRede};\nconst buffers = ${buffers};\nconst paraPintor = ${paraPintor};\nconst buffersPintor = ${buffersPintor};\n` +
          `const recebe = (${Dados})((m, t) => postMessage(m, t || []));\nonmessage = e => recebe(e.data, e.ports);\n`);
        const w = W_DADOS = new Worker(u); URL.revokeObjectURL(u);
        w.onmessage = e => { if (w === W_DADOS) chegou(e.data); };
        w.onerror = () => { if (w === W_DADOS) caiDados(); };   // não carregou (blob bloqueado) ou quebrou: os pedidos vão para cá
        liga(p => w.postMessage({ t: 'porta' }, [p]));
        return;
      } catch (e) { W_DADOS = null; }
    }
    recebeDados = Dados(m => setTimeout(() => chegou(m), 0));
    if (W_PINTOR) liga(p => recebeDados({ t: 'porta' }, [p]));   // a geometria vai ao pintor do worker pela porta, como do worker
  }
  function caiDados() {
    if (W_DADOS) { W_DADOS.terminate(); W_DADOS = null; }
    PAGINA = true;                                       // daqui em diante na página
    sels.forEach(s => { if (s.estado === 'baixando') s.pedido = false; });
    bombeia();
  }
  // parado: sem download por 1,5 s, o worker sai (a geometria já foi ao pintor e à página)
  function dorme() {
    if (!W_DADOS || tDorme || [...sels.values()].some(s => s.estado === 'baixando')) return;
    tDorme = setTimeout(() => {
      tDorme = 0;
      if (!W_DADOS || [...sels.values()].some(s => s.estado === 'baixando')) return;
      W_DADOS.terminate(); W_DADOS = null;
      if (porta2) { porta2.close(); porta2 = null; }
    }, 1500);
  }
  // a geometria que vai ao pintor da página (ou ao desenho no canvas da página)
  const GEO = new Map();
  function paraAqui(m) { if (m.t === 'geo' && !sels.has(m.cod)) return; if (m.t === 'geo') GEO.set(m.cod, m); if (recebePintor) recebePintor(m); }
  const manda = m => {
    if (m.t === 'baixa') criaDados();
    if (W_DADOS) W_DADOS.postMessage(m); else if (recebeDados) recebeDados(m, []);
  };

  // ---------- estado ----------
  const sels = new Map();                                // código → alimentador selecionado, na ordem de entrada
  let IDX = null, CAIXA = null;                          // dados/vizinhos/indice.json: os códigos e as caixas (lat, lon)
  let ativo = null;                                      // {s: o selecionado, nomes, vao} do trecho escolhido nele
  let trava = false;                                     // o limpar() do aberto chamado daqui não solta o escolhido daqui
  let versao = 0;                                        // muda com o que está na imagem (entrou, saiu, chegou, escolhido, T1 T2 T3)
  const prontos = () => [...sels.values()].filter(s => s.estado === 'pronto');
  const caixaLL = s => s.g ? L.latLngBounds([lat(s.g.y1), lon(s.g.x0)], [lat(s.g.y0), lon(s.g.x1)])
    : CAIXA && CAIXA[s.cod] ? L.latLngBounds([CAIXA[s.cod][0], CAIXA[s.cod][1]], [CAIXA[s.cod][2], CAIXA[s.cod][3]]) : null;
  const caixaIdx = cod => CAIXA && CAIXA[cod] ? L.latLngBounds([CAIXA[cod][0], CAIXA[cod][1]], [CAIXA[cod][2], CAIXA[cod][3]]) : null;

  // ---------- panes e camadas no mapa (na 1ª seleção) ----------
  let rede = null, eqs = null, realce = null, renRealce = null, cods = null;
  function panes() {
    if (rede) return;
    const pane = (n, z, toque) => { const p = map.createPane(n); p.style.zIndex = z; if (!toque) p.style.pointerEvents = 'none'; return p; };
    pane('sel-rede', 390);                               // acima do estado da visão (330), dos vizinhos (340) e das divisas (350); abaixo da rede do aberto (400)
    pane('sel-eq', 395);                                 // transformadores, chaves e outros dos selecionados (vizinhos.js), por cima da rede deles
    pane('sel-realce', 405);                             // o trecho escolhido num selecionado e o do mouse, por cima de tudo da rede
    pane('sel-rotulos', 595, true);                      // nomes, DJ e religadores, pinos e NAE: abaixo do markerPane (600)
    pane('sel-cods', 610);                               // o código de cada um, de longe: acima dos nomes do aberto (600), abaixo do balão
    rede = new Rede().addTo(map);
    renRealce = L.canvas({ pane: 'sel-realce', padding: 0.1 });
    realce = L.layerGroup().addTo(map);
    eqs = new Eqs().addTo(map);
    cods = L.layerGroup().addTo(map);
    // as etiquetas de código só de longe (abaixo do Z_EQUIP), já no começo da animação do zoom
    const codLonge = z => mc.classList.toggle('sel-cod-longe', z < K.Z_EQUIP);
    codLonge(map.getZoom());
    map.on('zoomanim', e => codLonge(e.zoom)); map.on('zoomend', () => codLonge(map.getZoom()));
  }

  // A imagem da rede dos selecionados, presa ao mapa: a região que ela tem (_r: canto x, y em px absolutos do zoom z,
  // tamanho w, h e resolução k) é posta no lugar da vista a cada quadro do zoom (CSS: estica), e a nova é pedida no fim
  // de cada movimento, se a vista saiu da região ou o que está nela mudou. A que chega na animação do zoom espera o fim dela.
  // Com o pintor no worker o pedido sai já no começo da animação do zoom (a vista do fim dela) e no próprio fim do
  // movimento: a imagem vem enquanto a página ainda refaz a rede do aberto (sem worker, numa tarefa à parte, depois dela)
  const Rede = L.Layer.extend({
    onAdd() {
      this._c = L.DomUtil.create('canvas', 'sel-tela leaflet-zoom-animated', this.getPane());
      this._ctx = this._c.getContext(MODO === '2d' ? '2d' : 'bitmaprenderer');
      this._r = this._p = this._guarda = null; this._id = this._vis = 0; this._v = -1; this._ids = new Map();
    },
    onRemove() { L.DomUtil.remove(this._c); this._r = this._p = null; },
    getEvents() { return { zoom: this._zoom, zoomanim: this._anim, zoomend: this._zEnd, moveend: this._fim, resize: this._fim, move: this._mexe }; },
    options: { pane: 'sel-rede' },
    _zoom() { if (!map._animatingZoom) this.poe(map.getCenter(), map.getZoom()); },
    _anim(e) { this.poe(e.center, e.zoom); if (W_PINTOR) this.vista(e.center, e.zoom); },
    _zEnd() { const g = this._guarda; if (g) { this._guarda = null; this._chegou(...g); } },
    _fim() {
      if (W_PINTOR && !map._animatingZoom) { this.vista(); return; }
      if (!this._t) this._t = setTimeout(() => { this._t = 0; if (this._map && !map._animatingZoom) this.vista(); }, 0);
    },
    _mexe() { if (!map._animatingZoom && map.dragging && map.dragging.moving() && !this.cobre(this._p || this._r, 0)) this._fim(); },
    regiao(f, c = map.getCenter(), z = map.getZoom()) {
      const t = map.getSize(), p = map.project(c, z), w = t.x * (1 + 2 * f), h = t.y * (1 + 2 * f);
      return { x: p.x - w / 2, y: p.y - h / 2, w, h, z };
    },
    cobre(r, f, c, z = map.getZoom()) {
      if (!r || r.z !== z) return false;
      const v = this.regiao(f, c, z);
      return v.x >= r.x - 0.5 && v.y >= r.y - 0.5 && v.x + v.w <= r.x + r.w + 0.5 && v.y + v.h <= r.y + r.h + 0.5;
    },
    poe(c, z) {
      const r = this._r;
      if (!r) return;
      const s = Math.pow(2, z - r.z), o = map._getNewPixelOrigin(c, z);
      L.DomUtil.setTransform(this._c, L.point(r.x * s - o.x, r.y * s - o.y), s);
    },
    // a vista (a de agora, ou c, z: a do fim da animação do zoom): a imagem nova se a vista saiu da região ou o que está nela
    // mudou (versao)
    vista(c, z) {
      if (!prontos().length) { this.limpa(); return; }
      if (this._v === versao && this.cobre(this._p || this._r, 0, c, z)) return;
      const r = this.regiao(FOLGA, c, z), x = Math.floor(r.x), y = Math.floor(r.y);
      const reg = { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y, z: r.z };
      reg.k = Math.min(R, Math.sqrt(MAXPX / (reg.w * reg.h)));
      this._v = versao; this._p = reg;
      const id = ++this._id;
      const m = { t: 'pinta', id, r: reg, cods: prontos().map(s => s.cod), vivos: [...sels.keys()], vis: [false, visivel('T1'), visivel('T2'), visivel('T3')],
        fus: reg.z >= (K.Z_FUS || K.Z_EQUIP) && visivel('T3') && !!(window.__fusMarcas && map.hasLayer(window.__fusMarcas)), apaga: ativo ? ativo.s.cod : null };
      med.pinturas.push({ id, z: reg.z, t0: performance.now(), t1: 0, pag: 0, vis: m.vis.slice(1), fus: m.fus, apaga: m.apaga, cods: m.cods.length });
      if (med.pinturas.length > 60) med.pinturas.shift();
      this._ids.set(id, m.cods);
      if (W_PINTOR) W_PINTOR.postMessage(m);
      else if (recebePintor) recebePintor(m);
      else pinta2d(m);
    },
    limpa() {
      this._r = this._p = null; this._v = -1;
      if (this._guarda) { this._guarda[1].close && this._guarda[1].close(); this._guarda = null; }
      this._vis = this._id;
      this._c.width = this._c.height = 0;
    },
    _chegou(id, bm, r) {
      if (!this._map || id <= this._vis) { if (bm.close) bm.close(); return; }
      if (map._animatingZoom) { if (this._guarda && this._guarda[1].close) this._guarda[1].close(); this._guarda = [id, bm, r]; return; }
      const t0 = performance.now();
      this._vis = id;
      if (id === this._id) this._p = null;
      if (MODO === '2d') { this._c.width = bm.width; this._c.height = bm.height; this._ctx.drawImage(bm, 0, 0); }
      else this._ctx.transferFromImageBitmap(bm);
      this._c.style.width = r.w + 'px'; this._c.style.height = r.h + 'px';
      this._r = r;
      this.poe(map.getCenter(), map.getZoom());
      const cods = this._ids.get(id);
      for (const k of [...this._ids.keys()]) if (k <= id) this._ids.delete(k);
      if (cods) desenhou(cods);
      const q = med.pinturas.find(x => x.id === id);
      if (q) { q.t1 = performance.now(); q.pag += q.t1 - t0; }
    }
  });
  // Os que já estão na imagem: só então os vizinhos (vizinhos.js) e a visão (visao-tocantins.js) deixam de desenhar a rede
  // deles (antes disso, baixando ou com erro, ele segue lá, como vizinho: não some do mapa)
  function desenhou(cods) {
    let novo = false;
    cods.forEach(c => { const s = sels.get(c); if (s && s.estado === 'pronto' && !s.desenhado) novo = s.desenhado = true; });
    if (novo) outros();
  }
  function outros() {
    if (window.__vizinhos && window.__vizinhos.refaz) window.__vizinhos.refaz();
    if (window.__visaoTO && window.__visaoTO.refaz) window.__visaoTO.refaz();
    notaLg();
  }
  // Na coluna das legendas das camadas (extras.js), com alguma ligada (a Faixa vem ligada): os selecionados ainda só têm a
  // rede, nas cores das classes, que não são as cores de ano da Faixa e da Inspeção
  let nota = null;
  function notaLg() {
    const lgs = box.querySelector('.ctl-lgs');
    if (!lgs) return;
    if (!nota) {
      nota = document.createElement('p');
      nota.className = 'sel-lg'; nota.hidden = true;
      nota.innerHTML = '<span class="sel-lg-l">Outros alimentadores: só a rede (sem camadas)</span><span class="sel-lg-c">Outros: só a rede</span>';
      lgs.prepend(nota);
      new MutationObserver(notaLg).observe(lgs, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
    const quer = [...sels.values()].some(s => s.desenhado) && [...lgs.children].some(c => c !== nota && !c.hidden);
    if (nota.hidden === quer) nota.hidden = !quer;
  }
  // a imagem que chegou do pintor
  function imagem(m) {
    if (m.t !== 'tela' || !rede) { if (m.bm && m.bm.close) m.bm.close(); return; }
    const q = med.pinturas.find(x => x.id === m.id);
    if (q && MODO === 'pagina') q.pag += m.ms;
    rede._chegou(m.id, m.bm, m.r);
  }
  // sem OffscreenCanvas: o desenho num canvas da página, um alimentador por vez (fatias de __al), e a imagem pronta entra de uma vez
  let fila2d = 0;
  async function pinta2d(m) {
    const minha = ++fila2d, r = m.r, c = document.createElement('canvas');
    let pag = 0;
    c.width = Math.max(1, Math.ceil(r.w * r.k)); c.height = Math.max(1, Math.ceil(r.h * r.k));
    const ctx = c.getContext('2d');
    ctx.setTransform(r.k, 0, 0, r.k, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const cod of m.cods) {
      const e = GEO.get(cod);
      if (!e) continue;
      const a = performance.now();
      pintaAl(ctx, e, r, m, cod === m.apaga ? 0.28 : 1);
      pag += performance.now() - a;
      if (AL) await AL.cede();
      if (minha !== fila2d) return;
    }
    if (m.fus) {
      const sp = bolinhas(r.k, (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }));
      const a = performance.now();
      for (const cod of m.cods) { const e = GEO.get(cod); if (e) pintaFus(ctx, e, r, sp); }
      pag += performance.now() - a;
    }
    const q = med.pinturas.find(x => x.id === m.id);
    if (q) q.pag += pag;
    rede._chegou(m.id, c, r);
  }
  const pede = () => { versao++; if (rede && !map._animatingZoom) rede._fim(); };

  // Transformadores, chaves e outros equipamentos dos selecionados (os do vizinhos.js, que os baixa): por cima da rede deles,
  // fortes (os dos vizinhos ficam apagados no canvas deles, abaixo). Um canvas do Leaflet (move e estica com o mapa),
  // refeito quando o mapa para ou chega um arquivo deles
  const Eqs = L.Renderer.extend({
    options: { pane: 'sel-eq', padding: 0.1 },
    _initContainer() { this._container = L.DomUtil.create('canvas', 'sel-tela'); this._ctx = this._container.getContext('2d'); },
    _destroyContainer() { L.DomUtil.remove(this._container); delete this._ctx; },
    // (a pintura numa tarefa à parte, depois do fim do movimento do aberto e dos vizinhos)
    _update() {
      if (this._map._animatingZoom && this._bounds) return;
      L.Renderer.prototype._update.call(this);
      if (!this._t) this._t = setTimeout(() => { this._t = 0; if (this._map && !this._map._animatingZoom) this.pinta(); }, 0);
    },
    pinta() {
      const b = this._bounds, ctx = this._ctx, c = this._container, V = window.__vizinhos;
      if (!b || !ctx) return;
      const t = b.getSize(), o = this._map.getPixelOrigin(), z = this._map.getZoom();
      const quer = V && V.pintaEqDe && z >= 15 && prontos().length;
      const w = quer ? R * t.x : 0, h = quer ? R * t.y : 0;
      L.DomUtil.setPosition(c, b.min);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c.style.width = (quer ? t.x : 0) + 'px'; c.style.height = (quer ? t.y : 0) + 'px'; }
      else if (w) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); }
      if (!quer) return;
      const tela = { x: o.x + b.min.x, y: o.y + b.min.y, z, s: 256 * Math.pow(2, z), w: t.x, h: t.y };
      ctx.setTransform(R, 0, 0, R, 0, 0);
      for (const s of prontos()) V.pintaEqDe(ctx, tela, s.cod);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    }
  });

  // ---------- chegada da rede de um selecionado ----------
  function chegou(m) {
    if (m.t === 'erro') {
      const s = sels.get(m.cod);
      if (s && s.estado === 'baixando') { s.estado = 'erro'; aviso(`${m.cod} não carregou`); }
      bombeia(); menuLinhas(); dorme();
      return;
    }
    if (m.t !== 'rede') return;
    const t0 = performance.now(), r = m.r, s = sels.get(r.cod);
    if (!s) {                                            // saiu enquanto vinha: a geometria que já foi ao pintor sai também
      GEO.delete(r.cod);
      if (W_PINTOR) W_PINTOR.postMessage({ t: 'tira', cod: r.cod }); else if (recebePintor) recebePintor({ t: 'tira', cod: r.cod });
    }
    if (!s || s.estado !== 'baixando') { bombeia(); dorme(); return; }
    const D = r.D;
    K.prepara(D);
    const TR = {};
    for (const t of D.trechos) TR[t.nome] = t;
    Object.assign(s, { estado: 'pronto', g: r.g, vaos: r.vaos, fus: r.fus, D, TR, papel: K.papelDe(D), tempo: r.tempo });
    s.bb = caixaLL(s);                                   // a caixa (lat, lon) e a classe de cada trecho, uma vez
    s.cl = D.trechos.map(t => classeDe(t.nome));
    s.cx = { D, TR, NAE: D.nae || null, ROT_NAE: K.rotNae(D), al: s.cod, abre: nomes => abreUrl(s.cod, nomes),
      ucs: () => s.ucsP || (s.ucsP = fetch(`${UCS}${encodeURIComponent(s.cod)}.json`).then(x => x.ok ? x.json() : {}).catch(() => ({}))) };
    if (!m.porta) paraAqui(paraPintor(s.cod, r, true));   // sem porta (tudo aqui): a geometria vai direto
    const rec = { cod: s.cod, ms: mede(t0) };
    med.recebe.push(rec);
    // DJ, religadores e etiqueta numa tarefa à parte (a chegada fica curta no celular)
    setTimeout(() => { if (s.estado !== 'pronto') return; const t1 = performance.now(); poeMarcas(s); rec.ms = Math.max(rec.ms, mede(t1)); }, 0);
    bombeia(); dorme();
    pede();
    rotulos();
    menuLinhas();
    if (s.enquadra) { s.enquadra = false; const b = caixaLL(s); if (b && !map.getBounds().intersects(b)) map.fitBounds(b.pad(0.04)); }
    document.dispatchEvent(new CustomEvent('al:selecao', { detail: { motivo: 'pronto', al: s.cod } }));
  }
  // DJ e religadores (os do aberto: alimentador.js, principal), do zoom 12 em diante e só os da tela com folga (antes o CSS do
  // aberto os esconde: aqui nem ficam no mapa; com 10 selecionados seriam centenas de marcadores para o Leaflet pôr no
  // lugar a cada zoom), refeitos quando o mapa para
  function poeMarcas(s) {
    s.eqM = s.D.principais.map(a => K.principal(a, s.papel, { pane: 'sel-rotulos', keyboard: false }));
    s.eqp = L.layerGroup();
    const dj = s.D.principais.find(a => a.t === 'DJ') || s.D.trechos.find(t => t.tipo === 'principal');
    s.dj = dj ? L.latLng(dj.lat !== undefined ? [dj.lat, dj.lon] : [dj.inicio_lat, dj.inicio_lon]) : null;
    marcas();
  }
  function marcas() {
    const perto = map.getZoom() >= K.Z_EQUIP, b = perto ? map.getBounds().pad(0.3) : null;
    for (const s of prontos()) {
      if (!s.eqp) continue;
      if (!perto) { if (map.hasLayer(s.eqp)) s.eqp.remove(); continue; }
      const naTela = s.bb && b.intersects(s.bb);
      for (const m of s.eqM) {
        const quer = naTela && b.contains(m.getLatLng()), tem = s.eqp.hasLayer(m);
        if (quer && !tem) s.eqp.addLayer(m); else if (!quer && tem) s.eqp.removeLayer(m);
      }
      if (!map.hasLayer(s.eqp)) s.eqp.addTo(map);
    }
    etiquetas();
  }
  // O código de cada um, de longe (abaixo do zoom 12, como o DJ some), junto do DJ, num pane acima dos nomes do aberto. Os
  // da mesma subestação têm o DJ no mesmo poste: as etiquetas que cairiam umas sobre as outras viram uma só, um código por
  // linha (até 4; depois 3 e "+N")
  const ETQ_W = 96, ETQ_H = 18;
  function etiquetas() {
    if (!cods) return;
    const z = map.getZoom(), ps = z < K.Z_EQUIP ? prontos().filter(s => s.dj) : [];
    const chave = ps.length ? Math.round(z * 8) + '|' + ps.map(s => s.cod).join(',') : '';
    if (chave === cods._chave) { ajeita(); return; }
    cods._chave = chave;
    cods.clearLayers();
    const grupos = [];
    for (const s of ps) {
      const p = map.project(s.dj, z);
      // a caixa dele (uma linha acima do ponto) cruza a de um grupo (n linhas acima do ponto dele)?
      const g = grupos.find(g => Math.abs(g.p.x - p.x) < ETQ_W && p.y - ETQ_H < g.p.y && p.y > g.p.y - ETQ_H * (g.cods.length + 1));
      if (g) g.cods.push(s.cod); else grupos.push({ p, ll: s.dj, cods: [s.cod] });
    }
    for (const g of grupos) {
      const n = g.cods.length, vis = n > 4 ? g.cods.slice(0, 3) : g.cods;
      const html = `<div class="sel-cod">${vis.map(c => `<span>${esc(c)}</span>`).join('')}${n > 4 ? `<span class="sel-mais">+${n - 3}</span>` : ''}</div>`;
      cods.addLayer(L.marker(g.ll, { pane: 'sel-cods', interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: null, html }) }));
    }
    ajeita();
  }
  // O grupo não cobre os rótulos do aberto (nomes, as datas da Faixa e das outras camadas, NAE) nem os nomes dos selecionados: acima do DJ se estiver livre; senão abaixo, ao
  // lado ou um pouco mais longe; sem lugar livre, o que menos cobre. Refeito quando os rótulos do aberto mudam.
  const VAGAS = (w, h) => [[-w / 2, -h - 6], [-w / 2, 6], [8, -h / 2], [-w - 8, -h / 2], [8, 6], [-w - 8, 6], [8, -h - 6], [-w - 8, -h - 6]]
    .concat([1, 2, 3, 4].flatMap(k => [[-w / 2, -h - 6 - 22 * k], [-w / 2, 6 + 22 * k]]));
  let ajeitaPedido = 0;
  function ajeita() {
    if (ajeitaPedido) return;
    ajeitaPedido = requestAnimationFrame(() => { ajeitaPedido = 0; ajeitaJa(); });
  }
  function ajeitaJa() {
    if (!cods || map._animatingZoom) return;
    const els = [];
    cods.eachLayer(m => { const el = m.getElement() && m.getElement().firstElementChild; if (el) els.push([m, el]); });
    if (!els.length || !els[0][1].offsetWidth) return;
    const cx = map.getContainer().getBoundingClientRect(), M = 2;
    // (com o aberto escondido, do markerPane só o que ficou à vista: os incêndios da Queimadas)
    const de = n => map.getPane(n) ? [...map.getPane(n).querySelectorAll(oculto && n === 'markerPane' ? '.leaflet-marker-icon>.fo-inc' : '.leaflet-marker-icon>*')] : [];
    const ocup = ['markerPane', 'sel-rotulos'].flatMap(de).map(e => e.getBoundingClientRect()).filter(r => r.width && r.right > cx.left && r.left < cx.right && r.bottom > cx.top && r.top < cx.bottom)
      .map(r => [r.left - M, r.top - M, r.right + M, r.bottom + M]);
    const cobre = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    for (const [m, el] of els) {
      const p = map.latLngToContainerPoint(m.getLatLng()), x = cx.left + p.x, y = cx.top + p.y, w = el.offsetWidth, h = el.offsetHeight;
      let melhor = null, menos = Infinity;
      for (const [dx, dy] of VAGAS(w, h)) {
        const r = [x + dx, y + dy, x + dx + w, y + dy + h], c = ocup.reduce((t, o) => t + cobre(r, o), 0);
        if (c < menos) { menos = c; melhor = [dx, dy, r]; if (!c) break; }
      }
      el.style.transform = `translate(${Math.round(melhor[0])}px,${Math.round(melhor[1])}px)`;
      ocup.push(melhor[2]);
    }
  }

  // ---------- fila de downloads: 2 de cada vez no celular, 3 no PC; primeiro os da tela ----------
  function bombeia() {
    const vindo = [...sels.values()].filter(s => s.estado === 'baixando' && s.pedido).length;
    if (vindo >= PARALELO) return;
    const b = map.getBounds(), c = map.getCenter();
    const espera = [...sels.values()].filter(s => s.estado === 'baixando' && !s.pedido)
      .sort((a, x) => { const ba = caixaIdx(a.cod), bx = caixaIdx(x.cod), ta = ba && b.intersects(ba) ? 0 : 1, tx = bx && b.intersects(bx) ? 0 : 1;
        return ta - tx || (ba ? ba.getCenter().distanceTo(c) : 0) - (bx ? bx.getCenter().distanceTo(c) : 0); });
    for (const s of espera.slice(0, PARALELO - vindo)) { s.pedido = true; manda({ t: 'baixa', cod: s.cod, url: `${ALS}${encodeURIComponent(s.cod)}/dados.js` }); }
  }

  // ---------- entrar e sair ----------
  const valido = cod => !!(CAIXA && CAIXA[cod]) && cod !== EU;
  function poe(cod, enquadra) {
    if (sels.has(cod) || !valido(cod)) return false;
    if (sels.size >= MAX) { aviso(`Limite de ${MAX} alimentadores. Tire um para pôr outro.`); return false; }
    sobe(); panes();
    sels.set(cod, { cod, estado: 'baixando', pedido: false, enquadra: !!enquadra, rot: new Map() });
    bombeia();
    gravaUrl(); menu();
    if (enquadra) { const b = caixaIdx(cod); if (b && !map.getBounds().intersects(b)) map.fitBounds(b.pad(0.04)); }
    aviso(`${cod} no mapa`);
    document.dispatchEvent(new CustomEvent('al:selecao', { detail: { motivo: 'entra', al: cod } }));
    return true;
  }
  function tira(cod) {
    const s = sels.get(cod);
    if (!s) return false;
    if (s.estado === 'baixando' && s.pedido) manda({ t: 'cancela', cod });
    if (ativo && ativo.s === s) { travaLimpa(true); solta(); }   // o painel volta ao resumo do aberto
    sels.delete(cod);
    s.estado = 'fora';
    if (s.eqp) { s.eqp.remove(); s.eqp = s.eqM = null; }
    etiquetas();
    s.rot.forEach(m => m.remove()); s.rot.clear();
    GEO.delete(cod);
    if (W_PINTOR) W_PINTOR.postMessage({ t: 'tira', cod }); else if (recebePintor) recebePintor({ t: 'tira', cod });
    bombeia(); dorme(); pede(); if (eqs) eqs.pinta();
    gravaUrl(); menu();
    if (s.desenhado) outros();
    aviso(`${cod} saiu do mapa`);
    document.dispatchEvent(new CustomEvent('al:selecao', { detail: { motivo: 'sai', al: cod } }));
    return true;
  }
  const alterna = cod => (sels.has(cod) ? tira(cod) : poe(cod, false));
  function deNovo(cod) {                                 // "tentar de novo"
    const s = sels.get(cod);
    if (!s || s.estado !== 'erro') return;
    s.estado = 'baixando'; s.pedido = false;
    bombeia(); menuLinhas();
  }

  // ---------- endereço: ?sel=A,B (o resto do endereço fica) e o link "Abrir" (leva os outros junto) ----------
  function gravaUrl() {
    const ps = new URLSearchParams(location.search);
    ps.delete('sel'); ps.delete('mun'); ps.delete('fora');   // ?mun e ?fora valem só na chegada (enquadra e avisa uma vez)
    let q = ps.toString();
    if (sels.size) q += (q ? '&' : '') + 'sel=' + [...sels.keys()].join(',');
    try { history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* sem history: só não guarda */ }
  }
  function abreUrl(cod, nomes) {
    const outros = [EU, ...[...sels.keys()].filter(c => c !== cod)].filter(Boolean).slice(0, MAX);
    return `../${encodeURIComponent(cod)}/?` + (nomes && nomes.length ? `t=${encodeURIComponent(nomes[0])}&` : '') + 'sel=' + outros.join(',');
  }

  // ---------- toque e mouse: o trecho ou o fusível do selecionado no ponto (x, y) do mapa ----------
  const fusVisivel = z => z >= (K.Z_FUS || K.Z_EQUIP) && visivel('T3') && !!(window.__fusMarcas && map.hasLayer(window.__fusMarcas));
  function alvo(pt, tol) {
    if (!sels.size || map._animatingZoom) return null;
    const z = map.getZoom(), s = 256 * Math.pow(2, z), a = map.containerPointToLayerPoint(pt).add(map.getPixelOrigin());
    const fz = fusVisivel(z);
    const vis = [false, visivel('T1'), visivel('T2'), visivel('T3')];
    let melhor = null, dm = tol * tol;
    if (fz) {                                            // fusível a até 8 px (do centro), como o do aberto
      let df = 64;
      for (const e of prontos()) {
        const qx = a.x - e.g.x0 * s, qy = a.y - e.g.y0 * s, p = e.fus.p, cx = e.fus.cx, n = p.length / 2;
        if (qx < -8 || qy < -8 || qx > (e.g.x1 - e.g.x0) * s + 8 || qy > (e.g.y1 - e.g.y0) * s + 8) continue;
        for (let b = 0, nb = cx.length / 4; b < nb; b++) {
          if (qx < cx[4 * b] * s - 8 || qx > cx[4 * b + 2] * s + 8 || qy < cx[4 * b + 1] * s - 8 || qy > cx[4 * b + 3] * s + 8) continue;
          for (let i = b * 32, f = Math.min(n, i + 32); i < f; i++) {
            const d = (p[2 * i] * s - qx) ** 2 + (p[2 * i + 1] * s - qy) ** 2;
            if (d <= df) { df = d; melhor = { s: e, fi: i }; }
          }
        }
      }
      if (melhor) return fusAlvo(melhor);
    }
    for (const e of prontos()) {
      const g = e.g, qx = a.x - g.x0 * s, qy = a.y - g.y0 * s;
      if (qx < -tol || qy < -tol || qx > (g.x1 - g.x0) * s + tol || qy > (g.y1 - g.y0) * s + tol) continue;
      const p = g.p, ini = g.ini, cx = g.cx;
      for (let l = 0, nl = ini.length - 1; l < nl; l++) {
        const c = g.cl[l];
        if (!vis[c]) continue;
        const a0 = cx[4 * l] * s, b0 = cx[4 * l + 1] * s, a1 = cx[4 * l + 2] * s, b1 = cx[4 * l + 3] * s;
        if (qx < a0 - tol || qx > a1 + tol || qy < b0 - tol || qy > b1 + tol) continue;
        for (let k = ini[l]; k < ini[l + 1] - 1; k++) {
          const x1 = p[2 * k] * s, y1 = p[2 * k + 1] * s, dx = p[2 * k + 2] * s - x1, dy = p[2 * k + 3] * s - y1, l2 = dx * dx + dy * dy;
          const f = l2 ? Math.max(0, Math.min(1, ((qx - x1) * dx + (qy - y1) * dy) / l2)) : 0;
          const d = (x1 + f * dx - qx) ** 2 + (y1 + f * dy - qy) ** 2;
          if (d < dm) { dm = d; melhor = { s: e, l, k: k + 1 }; }
        }
      }
    }
    if (!melhor) return null;
    const e = melhor.s, ti = e.g.ct[melhor.l];
    return { s: e, nome: e.D.trechos[ti].nome, vi: e.g.sv[melhor.k] };
  }
  const linhas = (s, k) => s['_' + k] || (s['_' + k] = s.fus[k].split('\n'));   // colunas de texto, separadas no 1º uso
  function fusAlvo({ s, fi }) {
    const tr = linhas(s, 'tr')[fi];
    return { s, fi, nome: tr && s.TR[tr] ? tr : null, fus: { nome: linhas(s, 'nome')[fi], t: linhas(s, 't')[fi] } };
  }
  // o vão i no formato do aberto: [lat1, lon1, lat2, lon2, trecho, código, poste1, poste2, metros]
  function vaoDe(s, i) {
    if (i == null || i < 0) return null;
    const v = s.vaos, ids = v._id || (v._id = v.id.split('\n')), p1 = v._p1 || (v._p1 = v.p1.split('\n')), p2 = v._p2 || (v._p2 = v.p2.split('\n'));
    let k = -1;
    for (let j = 0; j < s.g.sv.length; j++) if (s.g.sv[j] === i) { k = j; break; }
    const g = s.g, pt = j => [lat(g.y0 + g.p[2 * j + 1]), lon(g.x0 + g.p[2 * j])];
    const [a, b] = k > 0 ? [pt(k - 1), pt(k)] : [[0, 0], [0, 0]];
    return [a[0], a[1], b[0], b[1], k > 0 ? g.ct[cadeiaDe(g, k)] : -1, ids[i], p1[i], p2[i], v.m[i]];
  }
  function cadeiaDe(g, k) { let a = 0, b = g.ini.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (g.ini[m] <= k) a = m; else b = m; } return a; }

  // ---------- escolher um trecho de um selecionado (mapa, rótulo, chip do detalhe, menu) ----------
  function travaLimpa(sempre) {
    if (!window.__limpar) return;
    if (!sempre && window.__selecao && !window.__selecao().length) return;   // nada escolhido no aberto: o detalhe daqui entra por cima
    trava = true;
    try { window.__limpar(); } finally { trava = false; }
  }
  function escolhe(s, nome, e, enquadrar, vi) {
    if (!s || s.estado !== 'pronto' || !s.TR[nome]) return;
    const ctrl = K.comCtrl(e);
    let nomes;
    if (ctrl && ativo && ativo.s === s) {                // Ctrl: põe ou tira, só no mesmo alimentador
      nomes = ativo.nomes.slice();
      const i = nomes.indexOf(nome);
      i < 0 ? nomes.push(nome) : nomes.splice(i, 1);
      if (!nomes.length) { travaLimpa(true); solta(); return; }
    } else {
      nomes = [nome];
      travaLimpa(ctrl);                                  // Ctrl noutro alimentador: começa uma escolha nova
    }
    const t0 = performance.now();
    ativo = { s, nomes, vao: nomes.length === 1 ? vaoDe(s, vi) : null };
    mostra(true);
    if (enquadrar) {
      const b = caixaTrechos(s, nomes);
      if (b) map.fitBounds(b.pad(0.12), { maxZoom: 17, paddingTopLeft: [24, 72], paddingBottomRight: [24, 64] });
    }
    K.mostraDet();
    mede(t0);
    document.dispatchEvent(new CustomEvent('al:selAtivo', { detail: { al: s.cod, nomes } }));
  }
  // o detalhe no painel, o realce, os pinos e a NAE do escolhido (det: refaz também o detalhe)
  let pinos = null, naeMk = null;
  function mostra(det) {
    if (!ativo) return;
    const { s, nomes, vao } = ativo;
    if (det) { if (nomes.length > 1) K.detalheVarios(nomes, s.cx); else K.detalhe(s.TR[nomes[0]], vao, s.cx); }
    const vis = nomes.filter(n => visivel(classeDe(n)));
    if (pinos) { pinos.remove(); pinos = null; }
    if (naeMk) { naeMk.remove(); naeMk = null; }
    realce.clearLayers();
    if (vis.length) {
      vis.forEach(n => {
        const t = s.TR[n], ls = latlngsDe(s, n);
        realce.addLayer(L.polyline(ls, { renderer: renRealce, color: '#fff', weight: t.peso + 6, opacity: 0.9, interactive: false }));
      });
      vis.forEach(n => { const t = s.TR[n]; realce.addLayer(L.polyline(latlngsDe(s, n), { renderer: renRealce, color: t.cor, weight: t.peso, opacity: 1, lineCap: 'round', interactive: false })); });
      pinos = K.pinosDe(vis, s.TR, { pane: 'sel-rotulos', keyboard: false }).addTo(map);
      if (s.cx.NAE && K.naeMapa()) naeMk = K.camadaNae(vis, s.cx.NAE, { pane: 'sel-rotulos' }).addTo(map);
    }
    pede();
    rotulos();
  }
  // solta o escolhido (o aberto já mostrou outra coisa no painel)
  function solta() {
    if (!ativo) return;
    ativo = null;
    if (pinos) { pinos.remove(); pinos = null; }
    if (naeMk) { naeMk.remove(); naeMk = null; }
    if (realce) realce.clearLayers();
    sob(null);
    pede();
    rotulos();
  }
  // as cadeias do trecho, em lat, lon (as mesmas do aberto)
  function latlngsDe(s, nome) {
    const g = s.g, ti = s.D.trechos.indexOf(s.TR[nome]), out = [];
    for (let l = g.tc[2 * ti]; l < g.tc[2 * ti + 1]; l++) {
      const c = [];
      for (let k = g.ini[l]; k < g.ini[l + 1]; k++) c.push([lat(g.y0 + g.p[2 * k + 1]), lon(g.x0 + g.p[2 * k])]);
      out.push(c);
    }
    return out;
  }
  function caixaTrechos(s, nomes) {
    const g = s.g;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    nomes.forEach(n => { const ti = s.D.trechos.indexOf(s.TR[n]); if (g.tb[4 * ti + 2] > 0 || g.tb[4 * ti] > 0) { a = Math.min(a, g.tb[4 * ti]); b = Math.min(b, g.tb[4 * ti + 1]); c = Math.max(c, g.tb[4 * ti + 2]); d = Math.max(d, g.tb[4 * ti + 3]); } });
    return c >= a ? L.latLngBounds([lat(g.y0 + d), lon(g.x0 + a)], [lat(g.y0 + b), lon(g.x0 + c)]) : null;
  }

  // ---------- mouse (PC): mãozinha, o nome ("T2-A · LD…") e o trecho mais grosso ----------
  const dica = L.DomUtil.create('div', 'leaflet-tooltip leaflet-tooltip-top viz-dica', mc);
  dica.hidden = true;
  dica.setAttribute('aria-hidden', 'true');
  let naMao = null, sobL = null;
  function sob(a) {
    const k = a ? a.s.cod + '|' + (a.fi != null ? 'f' + a.fi : a.nome) : null;
    if (k === naMao) return;
    naMao = k;
    if (sobL) { sobL.remove(); sobL = null; }
    if (a && a.nome && a.fi == null && realce) {
      const t = a.s.TR[a.nome];
      sobL = L.polyline(latlngsDe(a.s, a.nome), { renderer: renRealce, color: t.cor, weight: t.peso + 3, opacity: 1, lineCap: 'round', interactive: false }).addTo(map);
    }
  }
  const ren = map.options.renderer;
  function paira(ev) {
    let a = null, pt = null;
    const t = ev && ev.target;
    if (ev && sels.size && !faixa() && !map.dragging.moving() && t && (t === mc || t.tagName === 'CANVAS') && !t.classList.contains('leaflet-interactive') && !(ren && ren._hoveredLayer))
      a = alvo(pt = map.mouseEventToContainerPoint(ev), 10);
    if (a && window.__vizinhos && window.__vizinhos.eqEm && window.__vizinhos.eqEm(pt.x, pt.y)) a = null;   // equipamento por cima: a dica é a dele
    sob(a);
    mc.classList.toggle('sel-mao', !!a);
    const m = a && !(map._popup && map._popup._map && map._popup.options.className === 'viz-popup');
    if (m) {
      dica.textContent = a.fi != null ? `${a.fus.nome} · ${K.TIPO[a.fus.t] || a.fus.t} · ${a.s.cod}` : `${a.nome} · ${a.s.cod}`;
      dica.style.left = pt.x + 'px'; dica.style.top = pt.y + 'px';
    }
    dica.hidden = !m;
  }
  let mov = 0, ultimo = null;
  mc.addEventListener('mousemove', e => {
    if (MOVEL || !sels.size || e.buttons || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
    ultimo = e;
    if (!mov) mov = requestAnimationFrame(() => { mov = 0; paira(ultimo); });
  });
  mc.addEventListener('mouseleave', () => { if (sels.size) paira(null); });
  map.on('movestart zoomstart', () => { if (sels.size) paira(null); });

  // Clique: o aberto (linhas, fusíveis e marcadores não chegam ao mapa) e os equipamentos (vizinhos.js marca ev._viz) têm a
  // vez; o limpar() do aberto já rodou (o primeiro ouvinte do mapa). Depois do vizinhos.js e da visão, que olham este antes
  // de abrir o balão de uma linha deles
  map.on('click', ev => {
    if (ev._viz || !sels.size || faixa() || !ev.containerPoint) return;
    const oe = ev.originalEvent || {}, toque = oe.pointerType ? oe.pointerType !== 'mouse' : MOVEL;
    const t0 = performance.now(), a = alvo(ev.containerPoint, toque ? 16 : 10);
    if (!a || (!a.nome && a.fi == null)) return;
    mede(t0);
    if (a.nome) escolhe(a.s, a.nome, oe, false, a.vi);
    // fusível: também o balão com Maps e Earth, como o do aberto (Ctrl + clique só soma o trecho, sem balão)
    if (a.fi != null && window.__geo && !K.comCtrl(oe)) {
      const g = a.s.g, f = a.s.fus.p, t = a.fus.t, pp = a.s.papel ? a.s.papel(a.fus.nome) : '';
      window.__geo.balao([lat(g.y0 + f[2 * a.fi + 1]), lon(g.x0 + f[2 * a.fi])], a.fus.nome, `${K.TIPO[t] || t}${pp ? ' · ' + pp : ''} · ${a.s.cod}`);
    }
  });

  // ---------- nomes dos trechos (os do aberto: alimentador.js, htmlRotulo) ----------
  // T1 e T2 sempre (só os perto da tela); T3: o escolhido, os com NAE do zoom 12 em diante (NAE ligado) e todos os da tela do
  // 15,5. Com o NAE desligado só o escolhido (o CSS do aberto esconderia os outros). Fora do Tab (keyboard: false): seriam
  // centenas de paradas a mais
  let tRot = 0;
  function rotulos() {
    if (tRot) return;
    tRot = setTimeout(() => { tRot = 0; if (!map._animatingZoom) refazRotulos(); }, 0);
  }
  function refazRotulos() {
    const z = map.getZoom(), b = map.getBounds().pad(0.25), bt = map.getBounds().pad(0.2), perto = z >= Z_T3, comNae = K.naeMapa();
    let n = 0;
    for (const s of prontos()) {
      const esc_ = ativo && ativo.s === s ? ativo.nomes : [], quer = new Map();
      // só o escolhido (NAE desligado: o CSS do aberto esconderia os outros), ou os da tela (o selecionado longe dela: nenhum)
      const todos = comNae && s.bb && s.bb.intersects(b);
      if (!faixa() && (todos || esc_.length)) {
        const c = comNae && s.cx.NAE ? K.contagem(s.cx.NAE) : {}, T = s.D.trechos;
        for (let i = 0, nt = todos ? T.length : esc_.length; i < nt; i++) {
          const t = todos ? T[i] : s.TR[esc_[i]];
          if (!t || !t.rotulo || !visivel(todos ? s.cl[i] : classeDe(t.nome))) continue;
          const sel = esc_.includes(t.nome);
          const ver = sel || (t.tipo !== 'fusivel' ? b.contains(t.rotulo) : (z >= Z_PERTO && c[t.nome] && b.contains(t.rotulo)) || (perto && bt.contains(t.rotulo)));
          if (ver) quer.set(t.nome, K.htmlRotulo(t, c, '', sel, false));
        }
      }
      s.rot.forEach((m, nome) => { if (!quer.has(nome)) { m.remove(); s.rot.delete(nome); } });
      quer.forEach((html, nome) => {
        let m = s.rot.get(nome);
        if (m && m._html === html) return;
        const t = s.TR[nome];
        if (m) { m._html = html; const el = m.getElement(); if (el) el.innerHTML = html; m.setZIndexOffset(K.zRot(t, '')); return; }
        m = L.marker(t.rotulo, { pane: 'sel-rotulos', keyboard: false, zIndexOffset: K.zRot(t, ''), icon: L.divIcon({ className: '', iconSize: null, html }) })
          .bindTooltip(`${esc(t.inicio)} → ${esc(K.fimTxt(t))}`, { direction: 'top' })
          .on('click', e => { L.DomEvent.stopPropagation(e); escolhe(s, nome, e.originalEvent, false); })
          .addTo(map);
        m._html = html;
        s.rot.set(nome, m);
      });
      n += s.rot.size;
    }
    nRot = n;
  }
  let nRot = 0;

  // ---------- avisos do aberto e do mapa ----------
  document.addEventListener('al:sel', () => { if (!trava) solta(); });   // trecho escolhido no aberto, ou nenhum (✕, clique no vazio)
  document.addEventListener('al:nae', () => { if (!sels.size) return; mostra(true); if (!ativo) rotulos(); });   // meses, "Contar individuais", botão NAE
  const cls = document.getElementById('classes');
  // (naClasse: do começo do clique até aqui, depois do ouvinte de alimentador.js, que refaz o realce do trecho escolhido e
  // avisa 'al:sel' com os mesmos nomes; isso não é escolha de trecho e não mostra o aberto escondido)
  if (cls) cls.addEventListener('click', () => { naClasse = true; }, true);
  if (cls) cls.addEventListener('click', e => { naClasse = false; if (sels.size && e.target.closest('button')) { mostra(false); pede(); rotulos(); } });
  map.on('moveend', () => { if (sels.size) { rotulos(); bombeia(); marcas(); } });
  // os rótulos do aberto mudaram (camada, NAE, trecho escolhido): o grupo de códigos procura lugar de novo
  new MutationObserver(() => { if (cods && cods.getLayers().length) ajeita(); }).observe(map.getPane('markerPane'), { childList: true, subtree: true, characterData: true });
  if (window.__fusMarcas) window.__fusMarcas.on('add remove', () => { if (sels.size) pede(); });
  // modo Limpeza de faixa: só o aberto (o escolhido aqui sai; o CSS apaga a rede e tira os nomes e o menu; o aberto
  // escondido volta)
  let fx = false;
  new MutationObserver(() => {
    const agora = box.classList.contains('fx-modo');
    if (agora === fx) return;
    fx = agora;
    if (agora) esconde(false);
    if (agora && ativo) { if (document.getElementById('det').dataset.al) travaLimpa(true); solta(); }
    if (sels.size) rotulos();
  }).observe(box, { attributes: true, attributeFilter: ['class'] });

  // ---------- o aberto escondido no mapa (o chip dele no menu) ----------
  // Fica na página e o painel continua o dele. Somem do mapa a rede (o canvas da rede, no overlayPane, com o que as camadas
  // dele desenham nele: Faixa, Inspeção, Insp→manut, Manutenção, realce, fusíveis, ativos de perto), os nomes, a NAE, DJ,
  // religadores, número operativo, pinos e marcas das camadas (markerPane) e as chaves (pane delas, chaves.js). Satélite,
  // vizinhos, estado e selecionados ficam nos panes deles e aparecem por baixo. Só visibility (classe al-oculto no #map; o
  // focos.js refaz a conta dos rótulos com foco a cada troca dela, antes da pintura seguinte): nada é refeito nem tirado do
  // mapa, o canvas continua sendo desenhado (as fatias de alimentador.js) e os rótulos continuam no lugar; mostrar de novo é
  // o mesmo desenho, também depois de mover o mapa escondido. Escondido não tem toque nem mouse: o clique cai no mapa
  // (vizinhos, estado e selecionados o veem pelo ponto, como sempre: o da linha deles seleciona) e o canvas da rede não acha
  // nem realça linha dele, nem por evento mandado de JS (cerca). A Queimadas fica à vista: os incêndios (markerPane) pelo
  // CSS; os pontos dos focos estão no canvas da rede (focos.js) e, enquanto ele está escondido, vão copiados, na mesma ordem,
  // para um canvas próprio (sel-focos; o clique na cópia abre o balão do ponto de verdade). Volta: "mostrar" na linha, um
  // trecho dele escolhido no painel, na lista ou na busca ('al:sel' com nomes; o realce refeito pelos T1 T2 T3 não conta) e
  // o modo Limpeza de faixa (só o aberto). O endereço não guarda
  const renA = map.options.renderer;
  let oculto = false, naClasse = false, cercado = false, copias = null, renFocos = null;
  // os pontos da Queimadas no canvas da rede (focos.js: circleMarker sem bolha, contorno branco ou marrom, cor da idade)
  const ehFoco = l => l instanceof L.CircleMarker && l._renderer === renA && l.options.bubblingMouseEvents === false &&
    /^#(fff|7c2d12)$/.test(l.options.color) && /^#(dc2626|f97316|fde3c0)$/.test(l.options.fillColor || '');
  // o canvas da rede surdo enquanto o aberto está escondido (na 1ª vez): sem linha sob o mouse (realce, dica, mãozinha) e o
  // clique, mesmo o mandado ao canvas por JS, sai como clique no vazio (o mapa)
  function cerca() {
    if (cercado) return;
    cercado = true;
    const paira0 = renA._handleMouseHover, evento0 = renA._fireEvent;
    renA._handleMouseHover = function (e, p) { if (!oculto) return paira0.call(this, e, p); };
    renA._fireEvent = function (ls, e, t) { return evento0.call(this, oculto ? false : ls, e, t); };
  }
  function copia(l) {
    if (!renFocos) {
      const p = map.createPane('sel-focos');
      p.style.zIndex = 400;                              // onde estão na rede: acima dos selecionados (390, 395), abaixo do realce deles (405)
      renFocos = L.canvas({ pane: 'sel-focos', tolerance: renA.options.tolerance });
    }
    const c = L.circleMarker(l.getLatLng(), Object.assign({}, l.options, { renderer: renFocos })).on('click', e => l.fire('click', e));
    copias.set(l, c);
    c.addTo(map);
  }
  // focos.js refaz a camada (período, distância, liga e desliga): as cópias seguem
  function segueFocos(e) {
    const l = e.layer;
    if (e.type === 'layeradd') { if (!copias.has(l) && ehFoco(l)) copia(l); return; }
    const c = copias.get(l);
    if (c) { copias.delete(l); c.remove(); }
  }
  function focos(sim) {
    if (sim) {
      copias = new Map();
      for (let o = renA._drawFirst; o; o = o.next) if (ehFoco(o.layer)) copia(o.layer);   // na ordem do canvas da rede
      map.on('layeradd layerremove', segueFocos);
    } else if (copias) {
      map.off('layeradd layerremove', segueFocos);
      copias.forEach(c => c.remove());
      copias = null;
      if (renFocos && map.hasLayer(renFocos)) renFocos.remove();   // (o canvas vazio, com toque, ficaria por cima da rede)
    }
  }
  function esconde(sim) {
    sim = !!sim;
    if (!renA || sim === oculto || (sim && faixa())) return false;
    if (sim) {
      cerca();
      // o que está aberto dele sai antes: a linha sob o mouse volta ao traço e a dica dela fecha (mouseout de verdade), as
      // dicas dos marcadores (toque) e o balão das camadas
      if (renA._hoveredLayer) renA._handleMouseOut(new MouseEvent('mouseout'));
      const dicas = [];
      for (const id in map._layers) { const t = map._layers[id]; if (t instanceof L.Tooltip && t._source && !/^sel-/.test(t._source.options.pane || '')) dicas.push(t._source); }
      dicas.forEach(s => s.closeTooltip());
      if (map._popup && map._popup._map && map._popup.options.className === 'limp-popup') map.closePopup();
    }
    oculto = sim;
    mc.classList.toggle('al-oculto', sim);
    focos(sim);
    if (cods && cods.getLayers().length) ajeita();
    menu();
    aviso(sim ? `${EU} escondido no mapa` : `${EU} de volta no mapa`);
    return true;
  }
  document.addEventListener('al:sel', e => { if (oculto && !naClasse && e.detail && e.detail.length) esconde(false); });   // trecho dele escolhido

  // ---------- CSS ----------
  const css = document.createElement('style');
  css.textContent =
    '.sel-tela{position:absolute;left:0;top:0}.leaflet-container.sel-mao{cursor:pointer}' +
    // no voo da visão do Tocantins os nomes saem e voltam no pouso, como os do aberto
    '.vto-voando :is(.leaflet-sel-rotulos-pane,.leaflet-sel-cods-pane){display:none}.vto-pouso :is(.leaflet-sel-rotulos-pane,.leaflet-sel-cods-pane){animation:vto-aparece .22s var(--ease,ease) both}' +
    // modo Limpeza de faixa: a rede deles apagada, sem nomes, realce nem menu
    '.mapbox.fx-modo :is(.leaflet-sel-rede-pane,.leaflet-sel-eq-pane){opacity:.55}.mapbox.fx-modo :is(.leaflet-sel-rotulos-pane,.leaflet-sel-cods-pane,.leaflet-sel-realce-pane,.sel-canto,.sel-lg){display:none}' +
    // o aberto escondido: a rede (e as camadas no canvas dela), as chaves e o markerPane, menos os incêndios da Queimadas;
    // (html: mais forte que o visibility:visible!important dos rótulos com foco de longe, focos.css). A cópia dos focos
    // (sel-focos) só enquanto ele está escondido
    '#map.al-oculto :is(.leaflet-overlay-pane,.leaflet-chaves-pane){visibility:hidden}' +
    'html.al-site #map.al-oculto .leaflet-marker-pane>:not(.leaflet-marker-icon:has(>.fo-inc)){visibility:hidden!important}' +
    '#map:not(.al-oculto) .leaflet-sel-focos-pane{display:none}' +
    // o código do alimentador de longe, junto do DJ (abaixo do zoom 12, como o DJ some); os do mesmo lugar, um por linha
    '.sel-cod{display:grid;transform:translate(-50%,calc(-100% - 6px));padding:2px 6px;border-radius:var(--r1);background:var(--vidro);border:1px solid var(--vidro-borda);' +
    'color:var(--vidro-fg);font:600 11.5px/1.3 var(--f-mono);white-space:nowrap;box-shadow:var(--sh-vidro);pointer-events:none}#map:not(.sel-cod-longe) .sel-cod{display:none}' +
    '.sel-cod .sel-mais{font-family:var(--f-body);opacity:.8}' +
    // na coluna das legendas das camadas (extras.js), com alguma ligada: os selecionados ainda não têm camadas
    '.sel-lg{padding:var(--s1) var(--s2);background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);border:1px solid var(--vidro-borda);' +
    'border-radius:var(--r2);box-shadow:var(--sh-vidro);font:var(--t-xs)/1.3 var(--f-body);contain:inline-size}.sel-lg[hidden]{display:none}' +
    '.sel-lg-c{display:none}@media (max-width:640px){.sel-lg-l{display:none}.sel-lg-c{display:inline}}' +   // (a largura é a da coluna: não a alarga)
    // detalhe de um trecho de selecionado: de que alimentador é
    '.det-al{margin:calc(var(--s1) * -1) 0 0;font-size:var(--t-sm);color:var(--muted)}.det-al b{color:var(--fg)}' +
    '.det-al a{display:inline-flex;align-items:center;min-height:32px;font-weight:600}@media (pointer:coarse){.det-al a{min-height:40px}}' +
    // botão "Selecionar" nos balões (vizinhos.js e visao-tocantins.js), ao lado de "Abrir alimentador", como link
    '.viz-acoes{display:flex;flex-wrap:wrap;align-items:center;gap:0 var(--s4)}' +
    '.viz-sel{display:inline-flex;align-items:center;min-height:32px;padding:0;border:0;background:none;color:var(--accent);font:600 13px/1.45 var(--f-body);' +
    'text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px;cursor:pointer}.viz-sel:disabled{color:#5a636a;text-decoration:none;cursor:default}' +
    '@media (pointer:coarse){.viz-sel{min-height:40px}}' +
    // menu "Alimentadores": no alto à direita do mapa (o canto livre), no vidro dos controles do mapa
    '.sel-canto{position:absolute;top:12px;right:12px;z-index:1000;display:flex;flex-direction:column;align-items:flex-end}' +
    '.mapbox:has(>.sel-canto) .leaflet-top.leaflet-right{top:64px}' +
    '@media (min-width:701px) and (max-width:999px){body.tela-cheia.tc-gaveta .sel-canto{right:calc(min(420px,92vw) + 12px)}}' +
    // da altura do T1 T2 T3 ao lado (44 px; no celular a fileira das camadas começa logo abaixo)
    '.sel-canto>.ctl-card{padding:1px}.ctl-card .sel-bt{gap:var(--s2);min-height:40px;padding:0 var(--s2)}@media (min-width:861px){.ctl-card .sel-bt{padding:0 var(--s3) 0 var(--s2)}.sel-canto>.ctl-card{padding:0;height:40px;box-sizing:border-box}.sel-canto>.ctl-card>.sel-bt{margin:-1px}}' +
    '.sel-bt svg{flex:none;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}' +
    '.sel-bt svg circle{fill:currentColor;stroke:none}.sel-bt[aria-expanded=true]{background-color:var(--vidro-hover)}' +
    '.sel-n{min-width:22px;padding:1px 6px;border-radius:var(--rp);background:var(--accent);color:var(--on-accent);font:700 var(--t-xs)/1.4 var(--f-mono);text-align:center}' +
    '.sel-n.zero{background:none;color:var(--vidro-fg);padding:0;min-width:0;font-size:var(--t-lg);font-weight:600}' +
    '.sel-tx,.sel-seta{display:none}@media (min-width:861px){.sel-tx{display:inline}.sel-seta{display:inline;font-size:var(--t-xs);opacity:.8}}' +
    '.sel-lista{position:absolute;top:calc(100% + 6px);right:0;width:min(340px,calc(var(--sel-w,100vw) - 24px));overflow:auto;overscroll-behavior:contain;padding:var(--s1);' +
    'background:var(--paper);color:var(--fg);border:1px solid var(--line);border-radius:var(--r3);box-shadow:var(--sh2);font:var(--t-sm)/1.4 var(--f-body)}' +
    '.sel-t{margin:0;padding:var(--s2) var(--s3) 2px;font:700 var(--t-xs)/1.4 var(--f-body);letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}.sel-t:focus{outline:none}' +
    // os alimentadores no mapa numa fileira horizontal, presa à direita (no botão): o aberto junto do botão e cada novo
    // selecionado entra à esquerda, e a lista cresce para a esquerda (pedido do usuário: "lista suspensa na horizontal,
    // quanto mais eu seleciono mais à esquerda vai"); sem caber, rola de lado. Tocar num selecionado o tira do mapa; no
    // aberto, esconde e mostra (apagado e riscado, aria-pressed=false)
    '.sel-lista{width:max-content;min-width:min(300px,calc(var(--sel-w,100vw) - 24px));max-width:calc(var(--sel-w,100vw) - 24px)}' +
    '.sel-als{list-style:none;margin:0;padding:var(--s1) var(--s1) var(--s2);display:flex;flex-direction:row-reverse;flex-wrap:nowrap;justify-content:flex-start;gap:6px;' +
    'overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}' +
    '.sel-al{flex:none;display:flex;align-items:stretch;border:1px solid var(--line);border-radius:var(--r2);background:var(--paper)}' +
    '.sel-al .sel-c{border-radius:var(--r2)}' +
    '.sel-al.ab{border-color:var(--accent)}.sel-al.ab.oc{border-color:var(--line);border-style:dashed}' +
    '.sel-c{display:inline-flex;align-items:center;gap:5px;min-width:0;min-height:40px;padding:0 8px 0 10px;border:0;border-radius:var(--rp);background:none;color:var(--fg);' +
    'font:inherit;text-align:left;cursor:pointer}.sel-c:hover{background:var(--hover)}' +
    '.sel-c b{font:600 var(--t-sm)/1.2 var(--f-mono);white-space:nowrap}.sel-c small{font-size:var(--t-xs);color:var(--muted);white-space:nowrap}' +
    '.sel-c small.erro{color:var(--aviso)}' +
    '.sel-c svg{flex:none;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;color:var(--muted)}' +
    '.sel-c .sel-xi{flex:none;font-size:var(--t-base);line-height:1;color:var(--muted)}.sel-c:hover .sel-xi,.sel-c:hover svg{color:var(--fg)}' +
    '.sel-c[aria-pressed=false]{color:var(--muted)}.sel-c[aria-pressed=false] b{text-decoration:line-through}' +
    '.sel-c[aria-busy=true] small::before{content:"";display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:50%;border:1.5px solid currentColor;border-right-color:transparent;' +
    'vertical-align:-1px;animation:sel-gira .8s linear infinite}@keyframes sel-gira{to{transform:rotate(1turn)}}@media (prefers-reduced-motion:reduce){.sel-c[aria-busy=true] small::before{animation:none}}' +
    // o ↗ discreto, separado do chip (não tira); "tentar de novo" no lugar dele
    '.sel-ab{flex:none;display:grid;place-items:center;width:40px;min-height:40px;margin-left:-4px;padding:0;border:0;border-left:1px solid var(--line);border-radius:0 var(--r2) var(--r2) 0;' +
    'color:var(--muted);text-decoration:none}.sel-ab:hover{background:var(--hover);color:var(--fg)}' +
    '.sel-ab svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.sel-denovo{flex:none;min-height:40px;padding:0 var(--s3) 0 var(--s2);border:0;border-left:1px solid var(--line);border-radius:0 var(--rp) var(--rp) 0;background:none;color:var(--accent);' +
    'font:600 var(--t-xs) var(--f-body);text-decoration:underline;text-underline-offset:2px;cursor:pointer}.sel-denovo:hover{background:var(--hover)}' +
    '.sel-al :focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +
    '.sel-de{margin:var(--s1) var(--s2) 0;padding-top:var(--s2);border-top:1px solid var(--line)}' +
    '.sel-q{width:100%;min-height:40px;padding:0 var(--s3);border:1px solid var(--line-forte);border-radius:var(--r2);background:var(--paper);color:var(--fg);font:var(--t-base) var(--f-body)}' +
    '.sel-q:focus-visible{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}.sel-q:disabled{opacity:.6}' +
    '@media (max-width:980px){.sel-q{min-height:44px;font-size:16px}}' +
    '.sel-sug{display:grid;margin-top:var(--s1)}.sel-sug:empty{display:none}' +
    '.sel-op{display:flex;align-items:center;justify-content:space-between;gap:var(--s2);min-height:44px;padding:0 var(--s3);border:0;border-radius:var(--r1);background:none;color:var(--fg);font:inherit;text-align:left;cursor:pointer}' +
    '.sel-op b{font:600 var(--t-sm) var(--f-mono)}.sel-op small{color:var(--muted);font-size:var(--t-xs)}' +
    '.sel-op:hover,.sel-op[aria-selected=true]{background:var(--hover)}.sel-op[aria-selected=true]{box-shadow:inset 3px 0 0 var(--accent)}.sel-op:disabled{cursor:default;opacity:.7}' +
    '.sel-lim{margin:var(--s2) 0 0;font-size:var(--t-xs);color:var(--aviso)}' +
    // veio do "Abrir <município>": quantos do município ficaram de fora (limite de 11 no mapa)
    '.sel-mun{margin:2px var(--s2) var(--s1);padding:var(--s2) var(--s3);border-left:3px solid var(--aviso);border-radius:0 var(--r1) var(--r1) 0;background:var(--hover);' +
    'font:var(--t-xs)/1.4 var(--f-body);color:var(--fg)}.sel-mun b{font-weight:700}' +
    '.sel-pe{display:flex;gap:var(--s2);justify-content:space-between;margin:var(--s2) var(--s1) var(--s1)}' +
    '.sel-pe button{min-height:40px;padding:0 var(--s3);border:1px solid var(--line);border-radius:var(--r2);background:var(--paper);color:var(--fg);font:600 var(--t-sm) var(--f-body);cursor:pointer}' +
    '.sel-pe button:hover{background:var(--hover)}.sel-lista :focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +
    '.sel-vazio{margin:0;padding:var(--s1) var(--s3) var(--s2);color:var(--muted);font-size:var(--t-xs)}' +
    // o aviso do limite (clique no 11º): no vidro dos controles, abaixo do botão; some sozinho
    '.sel-aviso{position:absolute;top:calc(100% + 6px);right:0;pointer-events:none}' +
    '.sel-aviso-t{display:block;width:max-content;max-width:min(300px,calc(100vw - 48px));padding:var(--s2) var(--s3);background:var(--vidro);' +
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);border:1px solid var(--vidro-borda);border-left:3px solid var(--aviso);' +
    'border-radius:var(--r2);box-shadow:var(--sh-vidro);font:600 var(--t-sm)/1.35 var(--f-body);animation:sel-aviso-in .18s var(--ease,ease) both;transition:opacity .25s var(--ease,ease)}' +
    '.sel-aviso-t.sai{opacity:0}@keyframes sel-aviso-in{from{opacity:0;transform:translateY(-4px)}}@media (prefers-reduced-motion:reduce){.sel-aviso-t{animation:none;transition:none}}' +
    '.sel-lista:not([hidden])~.sel-aviso{display:none}';
  document.head.append(css);

  // ---------- menu "Alimentadores" ----------
  const ICONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h7M12 12l4-6h3M12 12l4 6h3M12 12h7"/><circle cx="4.5" cy="12" r="2.2"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="19.5" cy="12" r="1.8"/><circle cx="19.5" cy="18" r="1.8"/></svg>';
  const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M10 8h6v6"/></svg>';
  let canto = null, bt = null, lst = null, q = null, sug = null, falado = null, avisoEl = null, iSug = -1, tAviso = 0;
  const aviso = t => { if (falado) { falado.textContent = ''; setTimeout(() => { falado.textContent = t; }, 30); } };
  // aviso visível e falado (role=status), logo abaixo do botão do menu; some sozinho (a região fica na página, vazia)
  function avisoVisivel(t) {
    if (!avisoEl) return;
    clearTimeout(tAviso);
    avisoEl.innerHTML = '';
    const s = document.createElement('span');
    s.className = 'sel-aviso-t'; s.textContent = t;
    avisoEl.append(s);
    tAviso = setTimeout(() => { s.classList.add('sai'); tAviso = setTimeout(() => { if (s.isConnected) s.remove(); }, 260); }, 4500);
  }
  function criaMenu() {
    canto = document.createElement('div');
    canto.className = 'sel-canto';
    canto.innerHTML = `<div class="ctl-card"><button type="button" class="sel-bt" aria-expanded="false" aria-controls="sel-lista">${ICONE}<span class="sel-tx">Alimentadores</span>` +
      '<span class="sel-n zero" aria-hidden="true">+</span><span class="sel-seta" aria-hidden="true">▾</span></button></div>' +
      '<div class="sel-lista" id="sel-lista" role="group" aria-label="Alimentadores no mapa" hidden>' +
      '<p class="sel-t" tabindex="-1"></p><p class="sel-mun" hidden></p><ul class="sel-als"></ul>' +
      '<div class="sel-de"><label class="vh" for="sel-q">Adicionar alimentador pelo código</label>' +
      '<input class="sel-q" id="sel-q" type="search" placeholder="Código do alimentador" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-controls="sel-sug">' +
      '<div class="sel-sug" id="sel-sug" role="listbox" aria-label="Alimentadores encontrados"></div><p class="sel-lim" hidden></p></div>' +
      '<div class="sel-pe"><button type="button" data-todos>Ver todos</button><button type="button" data-tira>Tirar todos</button></div></div>' +
      // (fora da lista: escondida, ela calaria o aviso) o falado só para o leitor de tela; o visível, com o limite, some sozinho
      '<p class="vh" aria-live="polite"></p><div class="sel-aviso" role="status" aria-live="polite"></div>';
    box.append(canto);
    bt = canto.querySelector('.sel-bt'); lst = canto.querySelector('.sel-lista'); q = canto.querySelector('.sel-q'); sug = canto.querySelector('.sel-sug');
    falado = canto.querySelector('p.vh[aria-live]'); avisoEl = canto.querySelector('.sel-aviso');
    L.DomEvent.disableClickPropagation(canto);
    L.DomEvent.disableScrollPropagation(canto);
    canto.addEventListener('click', e => e.stopPropagation());   // o clique não chega ao mapa (que limparia a seleção)
    // no toque o foco vai ao título (o teclado do celular só sobe ao tocar na busca); pelo teclado e no mouse, à busca
    bt.addEventListener('click', e => abre(lst.hidden, e.detail && (MOVEL || (e.pointerType && e.pointerType !== 'mouse')) ? 'titulo' : true));
    bt.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && lst.hidden) { e.preventDefault(); abre(true, true); } });
    lst.addEventListener('click', e => {
      const x = e.target.closest('[data-x]'), o = e.target.closest('[data-poe]'), d = e.target.closest('[data-denovo]');
      // chip de um selecionado: sai do mapa e da lista; o foco vai ao chip seguinte (ou ao de antes, ou à busca)
      if (x) {
        const cod = x.dataset.x, li = x.closest('li'), viz = li && (li.nextElementSibling || li.previousElementSibling), vc = viz && (viz.querySelector('[data-x]') ? viz.querySelector('[data-x]').dataset.x : 'aberto');
        tira(cod);
        const f = vc && lst.querySelector(vc === 'aberto' ? '[data-aberto]' : `[data-x="${CSS.escape(vc)}"]`);
        (f || (q.disabled ? null : q) || bt).focus();
        return;
      }
      // chip do aberto: esconde e mostra (o foco fica nele)
      const oc = e.target.closest('[data-aberto]');
      if (oc) { esconde(oc.hasAttribute('data-oculta')); (lst.querySelector('[data-aberto]') || bt).focus(); return; }
      if (d) { deNovo(d.dataset.denovo); return; }
      if (o) { adiciona(o.dataset.poe); return; }
      if (e.target.closest('[data-todos]')) { verTodos(); return; }
      if (e.target.closest('[data-tira]')) { [...sels.keys()].forEach(tira); q.focus(); }
    });
    q.addEventListener('input', () => { iSug = -1; sugestoes(); });
    q.addEventListener('keydown', e => {
      const os = [...sug.querySelectorAll('.sel-op:not(:disabled)')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!os.length) return;
        e.preventDefault();
        iSug = Math.max(0, Math.min(os.length - 1, iSug + (e.key === 'ArrowDown' ? 1 : -1)));
        marcaSug(os);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const o = os[iSug >= 0 ? iSug : 0];
        if (o) adiciona(o.dataset.poe);
      }
    });
    // fecha: Esc (antes do Esc da tela cheia; o foco volta ao botão), clique fora ou o foco saindo do menu
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || lst.hidden) return;
      e.stopPropagation();
      if (q.value && document.activeElement === q) { q.value = ''; sugestoes(); return; }
      abre(false); bt.focus();
    }, true);
    document.addEventListener('pointerdown', e => { if (!lst.hidden && !canto.contains(e.target)) abre(false); }, true);
    canto.addEventListener('focusout', e => { if (e.relatedTarget && !canto.contains(e.relatedTarget)) abre(false); });
    menu();
  }
  function abre(sim, foco) {
    lst.hidden = !sim;
    bt.setAttribute('aria-expanded', String(sim));
    if (!sim) return;
    // a lista cabe no mapa (até o pé dele), com rolagem própria
    const m = box.getBoundingClientRect(), b = bt.getBoundingClientRect();
    // a largura que cabe à esquerda do botão (a fileira cresce para a esquerda; na tela cheia do tablet o botão fica à
    // esquerda da gaveta): do lado direito da lista até a borda esquerda do mapa
    box.style.setProperty('--sel-w', Math.max(200, Math.min(m.width, b.right - m.left)) + 'px');
    lst.style.maxHeight = Math.max(160, m.bottom - b.bottom - 18) + 'px';
    menu();
    if (foco === 'titulo') lst.querySelector('.sel-t').focus({ preventScroll: true });
    else if (foco) (q.disabled ? lst.querySelector('.sel-c') : q).focus();
  }
  function menu() {
    if (!canto) return;
    const n = sels.size, nb = bt.querySelector('.sel-n');
    nb.textContent = n ? String(n) : '+';
    nb.classList.toggle('zero', !n);
    const oc = oculto ? ` · ${EU} escondido` : '';
    bt.setAttribute('aria-label', `Alimentadores no mapa: ${n} de ${MAX}${oc}`);
    bt.title = (n ? `Alimentadores no mapa: ${n} de ${MAX}` : 'Pôr outros alimentadores no mapa') + oc;
    if (lst.hidden) return;
    lst.querySelector('.sel-t').textContent = `No mapa · ${n} de ${MAX}`;
    const nm = lst.querySelector('.sel-mun');
    nm.hidden = !munNota;
    if (munNota && nm.innerHTML !== munNota) nm.innerHTML = munNota;
    menuLinhas();
    const cheio = n >= MAX, lim = lst.querySelector('.sel-lim');
    q.disabled = cheio;
    lim.hidden = !cheio;
    lim.textContent = cheio ? `Limite de ${MAX} alimentadores. Tire um para pôr outro.` : '';
    lst.querySelector('.sel-pe').hidden = !n;
    sugestoes();
  }
  // o que o chip diz além do código (pronto: nada; trechos e extensão no title)
  function chipTxt(s) {
    if (s.estado === 'baixando') return { tx: '<small>baixando…</small>', fala: 'baixando', title: 'Baixando' };
    if (s.estado === 'erro') return { tx: '<small class="erro">não carregou</small>', fala: 'não carregou', title: 'Não carregou' };
    const r = (s.D.meta && s.D.meta.resumo) || {}, nt = r.trechos ?? s.D.trechos.length, m = r.extensao_m ?? s.D.trechos.reduce((a, t) => a + t.ext, 0);
    const t = `${nt.toLocaleString('pt-BR')} trecho${nt === 1 ? '' : 's'} · ${K.km(m)}`;
    return { tx: '', fala: t, title: t };
  }
  const OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  const OLHO_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><path d="M4 20 20 4"/></svg>';
  // os chips: o aberto (esconde e mostra) e os selecionados (tocar tira), com o ↗ Abrir (ou "tentar de novo") ao lado
  function menuLinhas() {
    if (!canto || lst.hidden) return;
    const ul = lst.querySelector('.sel-als'), foco = document.activeElement && ul.contains(document.activeElement) ? document.activeElement : null;
    const fk = foco && (foco.dataset.x ? `[data-x="${CSS.escape(foco.dataset.x)}"]` : foco.hasAttribute('data-aberto') ? '[data-aberto]'
      : foco.dataset.denovo ? `[data-denovo="${CSS.escape(foco.dataset.denovo)}"], [data-x="${CSS.escape(foco.dataset.denovo)}"]`
      : foco.dataset.cod ? `.sel-ab[data-cod="${CSS.escape(foco.dataset.cod)}"]` : null);
    const ab = !renA ? '' : `<li class="sel-al ab${oculto ? ' oc' : ''}"><button type="button" class="sel-c" data-aberto ${oculto ? 'data-mostra' : 'data-oculta'} aria-pressed="${!oculto}" ` +
      `title="${oculto ? 'Mostrar no mapa' : 'Esconder no mapa'}" aria-label="${esc(EU)}, aberto, no mapa">${oculto ? OLHO_X : OLHO}<b>${esc(EU)}</b><small${oculto ? '' : ' class="vh"'}>${oculto ? 'escondido' : 'aberto'}</small></button></li>`;
    ul.innerHTML = ab + [...sels.values()].map(s => {
      const c = esc(s.cod), t = chipTxt(s);
      return `<li class="sel-al"><button type="button" class="sel-c" data-x="${c}"${s.estado === 'baixando' ? ' aria-busy="true"' : ''} title="${esc(t.title)} · tocar tira do mapa" ` +
        `aria-label="Tirar ${c} do mapa (${esc(t.fala)})"><b>${c}</b>${t.tx}<span class="sel-xi" aria-hidden="true">✕</span></button>` +
        (s.estado === 'erro' ? `<button type="button" class="sel-denovo" data-denovo="${c}" aria-label="Tentar de novo ${c}">tentar de novo</button>`
          : `<a class="sel-ab" data-cod="${c}" href="${esc(abreUrl(s.cod))}" title="Abrir ${c}" aria-label="Abrir ${c}">${SETA}</a>`) + '</li>';
    }).join('');
    if (fk) { const el = ul.querySelector(fk); if (el) el.focus(); }
  }
  // sugestões: o pedaço digitado em qualquer parte do código, sem caixa; as da tela primeiro, depois as mais perto
  function sugestoes() {
    if (!canto || lst.hidden) return;
    const t = q.value.trim().toUpperCase().replace(/\s+/g, '');
    if (!t || !CAIXA) { sug.innerHTML = ''; return; }
    const b = map.getBounds(), c = map.getCenter();
    const dist = cod => { const x = caixaIdx(cod); if (!x) return Infinity; if (b.intersects(x)) return 0; const p = L.latLng(Math.max(x.getSouth(), Math.min(c.lat, x.getNorth())), Math.max(x.getWest(), Math.min(c.lng, x.getEast()))); return c.distanceTo(p); };
    const achados = Object.keys(CAIXA).filter(cod => cod.includes(t)).map(cod => [cod, dist(cod)]).sort((a, x) => a[1] - x[1] || (a[0] < x[0] ? -1 : 1)).slice(0, 8);
    if (!achados.length) { sug.innerHTML = '<p class="sel-vazio">Nenhum alimentador com esse código.</p>'; return; }
    const cheio = sels.size >= MAX;
    sug.innerHTML = achados.map(([cod, d], i) => {
      const ja = cod === EU ? 'aberto' : sels.has(cod) ? 'no mapa' : null;
      const onde = d === 0 ? 'na tela' : `a ${Math.max(1, Math.round(d / 1000)).toLocaleString('pt-BR')} km`;
      return `<button type="button" class="sel-op" role="option" id="sel-op-${i}" aria-selected="false" data-poe="${esc(cod)}"${ja || cheio ? ' disabled' : ''}><b>${esc(cod)}</b><small>${ja || onde}</small></button>`;
    }).join('');
    marcaSug([...sug.querySelectorAll('.sel-op:not(:disabled)')]);
  }
  function marcaSug(os) {
    os.forEach((o, i) => o.setAttribute('aria-selected', String(i === iSug)));
    const o = os[iSug];
    if (o) { q.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
  }
  function adiciona(cod) {
    if (!poe(cod, false)) return;                        // sem mexer no mapa (pedido do usuário: selecionar não reenquadra)
    q.value = ''; iSug = -1;
    menu();
    q.disabled ? bt.focus() : q.focus();
  }
  function verTodos() {
    let b = window.__caixaRede ? L.latLngBounds(window.__caixaRede.getSouthWest(), window.__caixaRede.getNorthEast()) : null;
    sels.forEach(s => { const x = caixaLL(s); if (x) b = b ? b.extend(x) : L.latLngBounds(x.getSouthWest(), x.getNorthEast()); });
    if (b) map.fitBounds(b.pad(0.04));
  }

  // ---------- clique na linha de um vizinho ou do estado (vizinhos.js, visao-tocantins.js): já seleciona ----------
  // 'entra' (selecionado agora), 'ja' (já estava: baixando ou com erro, que tenta de novo; o pronto o vizinhos.js nem
  // chama, a linha dele tem a vez), 'limite' (o aviso) ou '' (não é selecionável: o balão de antes)
  function seleciona(cod) {
    if (!cod || cod === EU || !valido(cod)) return '';
    if (sels.has(cod)) { deNovo(cod); return 'ja'; }
    if (sels.size >= MAX) { avisoVisivel(`Limite de ${MAX} alimentadores: tire um no menu Alimentadores`); return 'limite'; }
    return poe(cod, false) ? 'entra' : '';
  }
  // a 2ª linha da dica do mouse sobre a linha dele ('' sem seleção possível: só o código)
  function dicaDe(cod) {
    if (!cod || cod === EU || !valido(cod)) return '';
    const s = sels.get(cod);
    if (s) return s.estado === 'erro' ? 'Selecionado · não carregou: clique para tentar de novo' : 'Selecionado · carregando…';
    return sels.size >= MAX ? `Limite de ${MAX} alimentadores` : 'Clique para selecionar';
  }

  // ---------- balões de equipamento dos vizinhos (e sem o clique que seleciona): "Selecionar" ----------
  function botao(cod) {
    if (!cod || cod === EU || !valido(cod)) return '';
    if (sels.has(cod)) return `<button type="button" class="viz-sel" data-sel="${esc(cod)}">Tirar da seleção</button>`;
    if (sels.size >= MAX) return `<button type="button" class="viz-sel" disabled title="Tire um alimentador do mapa para pôr outro">Limite de ${MAX}</button>`;
    return `<button type="button" class="viz-sel" data-sel="${esc(cod)}">Selecionar</button>`;
  }
  mc.addEventListener('click', e => {
    const b = e.target.closest('.leaflet-popup .viz-sel[data-sel]');
    if (!b) return;
    map.closePopup();
    alterna(b.dataset.sel);
  });

  // ---------- ?mun=<código IBGE>&fora=N: chegou pelo "Abrir <município>" da página inicial ----------
  // O mapa enquadra o município (a caixa dele em window.MUNICIPIOS, de divisas.js, que roda depois deste: por isso no
  // DOMContentLoaded, antes da rede inteira, para não pular depois); sem ele lá, na chegada dos ?sel=, a caixa do aberto e
  // dos selecionados. Com N > 0: o aviso no menu (e um curto, visível, embaixo do botão).
  const PQ = new URLSearchParams(location.search), MUNQ = (PQ.get('mun') || '').trim(), FORA = Math.max(0, parseInt(PQ.get('fora'), 10) || 0);
  let munFeito = false, munNota = '';
  const munDe = cod => (Array.isArray(window.MUNICIPIOS) ? window.MUNICIPIOS : []).find(m => m && String(m.cod) === cod) || null;
  const munNome = cod => { const m = munDe(cod) || ((window.D && window.D.meta && window.D.meta.municipios) || []).find(x => String(x.cod) === cod); return m ? m.nome : ''; };
  function enquadraMun(cods) {
    if (munFeito || !MUNQ) return;
    const m = munDe(MUNQ);
    let b = null;
    if (m && Array.isArray(m.corte) && m.corte.length === 2) b = L.latLngBounds(m.corte);
    else if (cods) {                                     // sem a divisa do município: o aberto e os selecionados
      b = window.__caixaRede ? L.latLngBounds(window.__caixaRede.getSouthWest(), window.__caixaRede.getNorthEast()) : null;
      cods.forEach(cod => { const x = caixaIdx(cod); if (x) b = b ? b.extend(x) : x; });
    } else return;                                       // espera o índice (chegaMun)
    munFeito = true;
    if (b && b.isValid()) map.fitBounds(b.pad(0.03), { animate: false });
  }
  function chegaMun(cods) {
    enquadraMun(cods);
    if (!FORA) return;
    const nome = munNome(MUNQ);
    munNota = `<b>+${FORA.toLocaleString('pt-BR')}</b> alimentador${FORA === 1 ? '' : 'es'} ${nome ? 'de ' + esc(nome) : 'do município'} fora do mapa ` +
      `(no mapa, os ${MAX + 1} com mais rede nele). Para trocar, tire um e ponha outro pelo código.`;
    menu();
    avisoVisivel(`+${FORA.toLocaleString('pt-BR')} ${nome ? 'de ' + nome : 'do município'} fora do mapa; troque pelo menu Alimentadores`);
  }
  if (MUNQ) { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => enquadraMun(null), { once: true }); else enquadraMun(null); }

  // ---------- começo: depois da rede do aberto, do painel e da lista dele (al:lista: no celular os downloads e a montagem
  // dos ?sel= atrasariam a lista) ----------
  // o índice é o que o vizinhos.js já leu (o mesmo arquivo; sem ele, baixado aqui)
  const indice = () => (window.__vizinhos && window.__vizinhos.indice && window.__vizinhos.indice()) || fetch(VIZ + 'indice.json').then(r => r.ok ? r.json() : null);
  const comeca = () => Promise.resolve().then(indice)
    .then(j => {
      const als = j && j.als;
      if (!als) return;
      CAIXA = {};
      IDX = Object.keys(als);
      IDX.forEach(cod => { const [s, w, n, e] = als[cod]; CAIXA[cod] = [s, w, n, e]; });
      criaMenu();
      // ?sel=: os válidos (do índice), sem repetidos, sem o aberto, até 10; o endereço fica com eles
      const pedidos = (new URLSearchParams(location.search).get('sel') || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
      const vao = [...new Set(pedidos)].filter(valido).slice(0, MAX);
      if (MUNQ) chegaMun(vao);                         // antes de pôr: a fila de downloads começa pelos da tela
      vao.forEach(cod => poe(cod, false));
      if (pedidos.length || MUNQ) gravaUrl();
    })
    .catch(() => { /* sem o índice: sem menu */ });
  if (AL) Promise.all([AL.rede, AL.pronto, AL.lista]).then(comeca); else if (document.readyState === 'complete') comeca(); else addEventListener('load', comeca);

  // ---------- para o vizinhos.js, a visão, o alimentador.js (chips do detalhe), os testes e as medidas ----------
  window.__alSel = {
    tem: cod => sels.has(cod),
    lista: () => [...sels.keys()],
    // os que já estão na imagem daqui (os vizinhos e a visão deixam de desenhá-los)
    desenha: cod => { const s = sels.get(cod); return !!(s && s.desenhado); },
    desenhados: () => [...sels.values()].filter(s => s.desenhado).map(s => s.cod),
    botao,
    seleciona,
    dica: dicaDe,
    alterna,
    poe: cod => poe(cod, false),
    tira,
    em: (pt, tol) => !!alvo(pt, tol),
    alvo: (x, y, tol = 16) => { const a = alvo(L.point(x, y), tol); return a ? { al: a.s.cod, nome: a.nome, fusivel: a.fus ? a.fus.nome : null, vao: a.vi != null && a.vi >= 0 ? a.s.vaos.id.split('\n')[a.vi] : null } : null; },
    clique: (cod, nome, e, enquadrar) => escolhe(sels.get(cod), nome, e, enquadrar),
    escolhe: (cod, nome, e, enquadrar, vi) => escolhe(sels.get(cod), nome, e, enquadrar, vi),
    limpar: () => { travaLimpa(true); solta(); },
    eqMudou: cod => { if (eqs && sels.has(cod)) eqs.pinta(); },
    ativo: () => ativo ? { al: ativo.s.cod, nomes: ativo.nomes.slice() } : null,
    // o aberto escondido no mapa (chip do menu): esconde(true | false), oculto(), focos() (quantos pontos copiados)
    esconde: sim => esconde(sim),
    oculto: () => oculto,
    focos: () => copias ? copias.size : 0,
    ocioso: () => !tRot && ![...sels.values()].some(s => s.estado === 'baixando') && !(rede && (rede._t || rede._p || rede._guarda)),
    geo: cod => { const s = sels.get(cod); return s && s.g ? s.g : null; },
    latlngs: (cod, nome) => { const s = sels.get(cod); return s && s.g ? latlngsDe(s, nome) : null; },
    vao: (cod, i) => { const s = sels.get(cod); return s && s.g ? vaoDe(s, i) : null; },
    principais: cod => { const s = sels.get(cod); return s && s.D ? s.D.principais.map(a => [a.lat, a.lon, a.t]) : null; },
    estado: () => ({ cods: [...sels.keys()], prontos: prontos().length, estados: Object.fromEntries([...sels].map(([c, s]) => [c, s.estado])), modo: MODO, dadosVivo: !!W_DADOS,
      ativo: ativo ? { al: ativo.s.cod, nomes: ativo.nomes.slice() } : null, rotulos: nRot, med: { recebe: med.recebe.slice(), pinturas: med.pinturas.slice(), longas: med.longas },
      imagem: rede && rede._r ? { w: Math.ceil(rede._r.w * rede._r.k), h: Math.ceil(rede._r.h * rede._r.k), z: rede._r.z, k: rede._r.k } : null })
  };
})();
