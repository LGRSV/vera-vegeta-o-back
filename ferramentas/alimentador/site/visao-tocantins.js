// O Tocantins inteiro no mapa do alimentador (roda logo depois de vizinhos.js, com window.__map, window.__al e o contorno do
// estado, window.TOCANTINS de dados/tocantins.js, que a página carrega antes do mapa).
// - De longe (abaixo do zoom em que os vizinhos entram: window.__vizinhos.estado().zMin), o T1 e o T2 de todos os
//   alimentadores (dados/vizinhos/estado.txt, de scripts/gera_trechos.py, estado_txt: ~110 KB, simplificado em 150 m),
//   apagados e nas cores das classes como os vizinhos, sem rótulos, num canvas próprio abaixo dos vizinhos e da rede deste
//   (que fica inteira por cima). Dos vizinhos em diante ele fica até eles estarem na tela e então sai aos poucos: sem buraco
//   nem piscar. Tocar (ou clicar) numa linha de outro alimentador já o seleciona (selecionados.js), sem balão; o mouse
//   mostra o código e "Clique para selecionar". Sem selecionados.js: o balão dos vizinhos (código e "Abrir alimentador").
// - Só o Tocantins: fora do estado, a cor de fundo do mapa. É uma máscara (o retângulo da vista com o furo do TO) num canvas
//   acima do satélite e abaixo dos vizinhos, das divisas e da rede, desenhada uma vez por vista (os quadros do satélite não
//   são recortados um a um); a borda é o próprio recorte, com uma sombra leve para dentro. O satélite nem pede os quadros
//   inteiros de fora do estado (alimentador.js: window.__quadroNoTO). Só de longe (abaixo do zoom 10, onde municipios.js
//   tira as divisas e o traço-ponto do estado): o contorno do estado (568 pontos) erra até ~750 m na borda, o que de perto
//   apareceria; dali em diante o mapa fica como antes (o satélite inteiro e o traço-ponto da divisa do TO).
// - As linhas do estado e a máscara são desenhadas num worker (OffscreenCanvas), e a página só troca a imagem pronta.
//   Medido no celular com a CPU 4× mais lenta: no canvas da página o JS custava pouco (5 a 17 ms), mas o navegador
//   rasterizava as linhas na pintura seguinte, na thread principal (60 a 95 ms: o tranco no fim de cada passo da pinça e
//   no meio do voo); no worker a troca custa ~0 ms. Sem worker, desenha na página como antes.
// - Sem quadrados escuros: por baixo do satélite nítido, um fundo com os quadros de longe da mesma imagem (primeiro os do
//   zoom 6 do TO, uns 6; depois os do 8, uns 25), montados numa imagem só pelo worker, que baixa também os do zoom da visão
//   do estado, se for outro (o 7 numa tela grande); começa assim que o alimentador fica pronto (ficam só na memória e no
//   cache do navegador). No voo e no zoom sempre há imagem (borrada) por baixo enquanto a nítida chega e entra aos poucos;
//   parado (e no arrasto) de perto ou no estado inteiro, e no zoom para perto com o satélite já carregado, o fundo se
//   esconde.
// - Botão "Tocantins" (canto de baixo à direita, acima do Tela cheia; só o ícone no celular e com a gaveta da tela cheia;
//   escondido no modo Limpeza de faixa): voa até o estado inteiro e vira "Voltar ao alimentador", que voa de volta à vista
//   com que o alimentador abre. Afastar com o dedo ou a roda chega na mesma visão: o zoom mínimo do mapa é o do estado
//   inteiro (refeito quando o mapa ou os controles mudam de tamanho), e ao chegar nele o mapa centra o estado. A vista do
//   estado desconta os controles de cima e não deixa o botão, o Tela cheia e as legendas cobrirem o estado (o estado vai
//   para o lado, ou fica um pouco menor). O voo é o da página inicial (mapa-municipios.js): a escala muda em progressão
//   geométrica, numa curva suave (sem animação com prefers-reduced-motion). No voo a rede deste só estica (é refeita no
//   pouso, como no zoom), o satélite nítido espera o pouso (se o fundo já chegou; senão carrega como no voo do Leaflet), e
//   o worker desenha a máscara e as linhas do estado do trecho seguinte do voo antes de ele chegar.
// Alimentadores selecionados (selecionados.js, window.__alSel): ficam fora das linhas do estado (lá eles são desenhados
// fortes), a linha deles no ponto tem a vez sobre a do estado e, no voo, o canvas deles some e volta como o dos vizinhos.
// Enquanto um recém-selecionado baixa, as linhas dele aqui ficam realçadas (opacas, com um contorno claro: forte, no
// desenho do estado), até selecionados.js desenhá-lo; com 10, o clique não seleciona (o aviso é de lá).
// Camadas nos outros (Faixa, Inspeção, Manutenção e Insp→manut ligadas no aberto): o T1 e o T2 dos outros alimentadores,
// do estado aos vizinhos, com a pintura delas (dados/redes/, lidos no worker; ver "camadas dos outros alimentadores" abaixo).
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
  const PTOf = Float64Array.from([].concat(...PTO));     // (o mesmo, em sequência: para o worker)
  const caixaTO = L.latLngBounds(TO);
  const noTO = window.__quadroNoTO || null;              // alimentador.js: .borda(r) e .dentro(x, y) do contorno
  const mc = map.getContainer(), box = mc.closest('.mapbox') || mc.parentElement;

  const css = document.createElement('style');
  css.textContent = '.leaflet-mascara-to-pane,.leaflet-estado-to-pane,.leaflet-fundo-to-pane{pointer-events:none}.leaflet-fundo-to-pane img{max-width:none!important;max-height:none!important}.vto-tela{position:absolute;left:0;top:0}' +
    '.leaflet-estado-to-pane{transition:opacity .32s var(--ease,ease)}.leaflet-container.vto-mao{cursor:pointer}' +
    // acima do card Tela cheia (telacheia.js: 28 px do pé e 50 de altura), alinhado à direita com ele
    '.vto-canto{position:absolute;right:12px;bottom:86px;z-index:810}.mapbox.fx-modo .vto-canto{display:none}' +
    // o ícone (o contorno do estado; na volta, o alvo) e o nome, como o botão Menu das camadas (extras.js)
    '.ctl-card .vto-bt{gap:var(--s2);padding:0 var(--s3) 0 var(--s2)}' +
    '.vto-bt svg{flex:none;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}' +
    '.vto-bt .vto-uf path{fill:currentColor;fill-opacity:.22}.vto-bt .vto-alvo circle+circle{fill:currentColor}' +
    '.vto-bt.volta .vto-uf,.vto-bt:not(.volta) .vto-alvo{display:none}' +
    // no voo os rótulos e marcadores (DOM) saem e voltam no pouso, já no lugar (como os nomes no voo da página inicial):
    // fora da página, eles não pesam em cada quadro
    '.vto-voando :is(.leaflet-marker-pane,.leaflet-tooltip-pane,.leaflet-chaves-pane){display:none}' +
    '@keyframes vto-aparece{from{opacity:0}}.vto-pouso :is(.leaflet-marker-pane,.leaflet-tooltip-pane,.leaflet-chaves-pane){animation:vto-aparece .22s var(--ease,ease) both}' +
    '@media (min-width:701px) and (max-width:999px){body.tela-cheia.tc-gaveta .vto-canto{right:calc(min(420px,92vw) + 12px)}}' +
    // celular e gaveta da tela cheia por cima do mapa: só o ícone, num card do tamanho do Tela cheia (o nome fica no title e
    // no aria-label), e a coluna das legendas, à esquerda, não passa por baixo dele
    '@media (max-width:640px){.ctl-card .vto-bt{width:40px;padding:0;justify-content:center}.vto-tx{display:none}' +
    '.mapbox:has(>.vto-canto)>.ctl-lgs{max-width:calc(100% - 32px - var(--vto-w,50px))}}' +
    '@media (min-width:701px) and (max-width:999px){body.tela-cheia.tc-gaveta .ctl-card .vto-bt{width:40px;padding:0;justify-content:center}body.tela-cheia.tc-gaveta .vto-tx{display:none}' +
    'body.tela-cheia.tc-gaveta .mapbox:has(>.vto-canto)>.ctl-lgs{max-width:calc(100% - min(420px,92vw) - 32px - var(--vto-w,50px))}}';
  document.head.append(css);
  map.createPane('mascara-to').style.zIndex = 250;      // acima do satélite (200); abaixo dos vizinhos (340), divisas (350) e rede (400)
  const paneE = map.createPane('estado-to');
  paneE.style.zIndex = 330;                              // abaixo dos vizinhos

  // ---------- desenho (aqui e no worker: estas funções só usam o que recebem; o worker recebe o código delas) ----------
  // as linhas da classe g ({p: [x, y, ...] de Mercator, ini: 1º ponto de cada linha e o fim, cx: caixa de cada linha}) que
  // passam pela região r (px absolutos do zoom r.z, canto x, y), já num beginPath; pontos a menos de 0,6 px do anterior
  // ficam de fora; as dos alimentadores em fora (índices em g.al: os selecionados) também
  function tracaLinhas(ctx, g, r, fora, so) {
    const s = 256 * Math.pow(2, r.z), bx = -r.x, by = -r.y, p = g.p, ini = g.ini, cx = g.cx, W = r.w + 8, H = r.h + 8;
    for (let l = 0, nl = ini.length - 1; l < nl; l++) {
      if ((so && !so.has(g.al[l])) || (fora && fora.has(g.al[l])) || cx[4 * l] * s + bx > W || cx[4 * l + 2] * s + bx < -8 || cx[4 * l + 1] * s + by > H || cx[4 * l + 3] * s + by < -8) continue;
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
  // as linhas do estado (D: {T1, T2}) na região r; op: k (px do canvas por px do mapa), alfa, as classes [{c, cor, larg}]
  // na ordem de desenho (o tronco por cima), os alimentadores que ficam de fora (fora: índices) e os realçados por cima
  // (forte: índices; os selecionados que ainda baixam)
  function pintaEstado(ctx, r, D, op) {
    const fora = op.fora && op.fora.length ? new Set(op.fora) : null;
    ctx.setTransform(op.k, 0, 0, op.k, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = op.alfa;
    for (const cl of op.cls) {
      ctx.strokeStyle = cl.cor; ctx.lineWidth = cl.larg;
      ctx.beginPath(); tracaLinhas(ctx, D[cl.c], r, fora); ctx.stroke();
    }
    if (op.forte && op.forte.length) {
      const so = new Set(op.forte);
      ctx.globalAlpha = 1;
      for (const cl of op.cls) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = cl.larg + 4;
        ctx.beginPath(); tracaLinhas(ctx, D[cl.c], r, fora, so); ctx.stroke();
      }
      for (const cl of op.cls) {
        ctx.strokeStyle = cl.cor; ctx.lineWidth = cl.larg + 1.5;
        ctx.beginPath(); tracaLinhas(ctx, D[cl.c], r, fora, so); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  // o contorno P ([x, y, x, y, ...] de Mercator) em px da região r, recortado num retângulo m px maior que ela
  // (Sutherland–Hodgman: de perto o estado tem milhões de px)
  function recorta(P, r, m) {
    const S = 256 * Math.pow(2, r.z);
    let pts = [];
    for (let i = 0; i < P.length; i += 2) pts.push([P[i] * S - r.x, P[i + 1] * S - r.y]);
    for (const [e, v, l] of [[0, -m, -1], [0, r.w + m, 1], [1, -m, -1], [1, r.h + m, 1]]) {   // lado de dentro: l·(p[e] − v) ≤ 0
      const q = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i ? i - 1 : pts.length - 1], b = pts[i], da = l * (a[e] - v) <= 0, db = l * (b[e] - v) <= 0;
        if (da !== db) { const t = (v - a[e]) / (b[e] - a[e]); q.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
        if (db) q.push(b);
      }
      pts = q;
      if (!pts.length) break;
    }
    return pts;
  }
  // a máscara na região r: a cor de fundo (op.cor) fora do contorno P, a borda com uma sombra leve para dentro do estado e
  // um fio claro no recorte (op.corta: o contorno passa pela região; op.cheia: a região toda fora do estado)
  function pintaMascara(ctx, r, P, op) {
    ctx.setTransform(op.k, 0, 0, op.k, 0, 0);
    ctx.fillStyle = op.cor;
    ctx.beginPath();
    ctx.rect(0, 0, r.w, r.h);
    const pts = op.corta ? recorta(P, r, 24) : [];
    const contorno = () => { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
    if (pts.length > 2) {
      contorno();
      ctx.fill('evenodd');
      ctx.beginPath(); contorno();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(243,244,244,.32)'; ctx.lineWidth = 1.2; ctx.stroke();
    } else if (op.cheia) ctx.fill();
  }
  // ---------- camadas dos outros alimentadores (Faixa, Inspeção, Manutenção, Insp→manut) ----------
  // Arquivos de dados/redes/ (scripts/gera_trechos.py: faixa_txt, o mesmo do satélite da página inicial, e camadas_txt), lidos
  // aqui (no worker): por alimentador (A), menos o aberto (eu). Polyline com a diferença acumulando pelo arquivo inteiro (as
  // linhas do aberto e as T do faixa.txt também são lidas). Devolvem {cods, ...} com os índices dos alimentadores em al.
  //   faixa:    as linhas dos pedaços (P) do T1 e do T2, com a classe e a situação do trecho (T), a chave dos anos (ak, em
  //             anos: a lista dos anos, o mais recente primeiro) e as marcas (mk: 1 criada, 2 pendente); as etiquetas (O)
  //   inspecao: as linhas (I) com a chave dos anos; executadas: os ativos (E) e os serviços de cada um por ano (de ini[i] a
  //   ini[i+1] em ys e ns; -1 NAE DEOP, 0 sem data); manutencao: os postes (M) e as OS de cada um por situação (n, 4 por poste)
  function decodificaCam(tipo, txt, eu) {
    const ux = lon => (lon + 180) / 360, uy = lat => 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
    const esc = tipo === 'executadas' || tipo === 'manutencao' ? 1e5 : 1e4;
    const p = [], ini = [0], cx = [], al = [], cl = [], sit = [], ak = [], mk = [], cods = [], chaves = new Map(), anos = [], os = [];
    const px = [], py = [], pal = [], ys = [], ns = [], ip = [0];
    let la = 0, lo = 0, ia = -1, meu = true, tcl = 0, tsit = 3, hoje = '';
    // os pontos do texto s (guarda: em p, como uma linha; senão só acumula, ou devolve a lista se lista)
    const le = (s, guarda, a, m, lista) => {
      const n = s.length, n0 = p.length, out = lista ? [] : null;
      let i = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      while (i < n) {
        let v = 0, sh = 0, b;
        do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
        la += v & 1 ? ~(v >> 1) : v >> 1;
        v = 0; sh = 0;
        do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
        lo += v & 1 ? ~(v >> 1) : v >> 1;
        if (out) { out.push(ux(lo / esc), uy(la / esc)); continue; }
        if (!guarda) continue;
        const x = ux(lo / esc), y = uy(la / esc);
        p.push(x, y);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (out) return out;
      if (!guarda) return;
      if (p.length - n0 < 4) { p.length = n0; return; }
      ini.push(p.length / 2); cx.push(x0, y0, x1, y1); al.push(ia); cl.push(tcl); sit.push(tsit); ak.push(a); mk.push(m);
    };
    const chave = k => { let a = chaves.get(k); if (a === undefined) { chaves.set(k, a = anos.length); anos.push(k ? k.split(',').map(Number) : []); } return a; };
    for (const ln of txt.split('\n')) {
      if (!ln) continue;
      if (ln[0] === '#') { try { hoje = JSON.parse(ln.slice(1)).hoje || ''; } catch (e) { /* cabeçalho estranho */ } continue; }
      const c = ln.split('\t');
      if (c[0] === 'A') { meu = c[1] === eu; if (!meu) { ia = cods.length; cods.push(c[1]); } }
      else if (c[0] === 'T') {
        tcl = c[2] === 'T1' ? 0 : c[2] === 'T3' ? 2 : 1; tsit = +c[3] || 0;   // (T3: só nos arquivos dos selecionados, dados/redes/sel/)
        const g = c[7] || '';
        if (g[0] === '!') le(g.slice(1), false);
        else for (const x of g.split(' ')) if (x) le(x, false);
      } else if (c[0] === 'P' || c[0] === 'I') {
        if (c[0] === 'I') tcl = c[4] === 'T1' ? 0 : c[4] === 'T2' ? 1 : c[4] === 'T3' ? 2 : 255;   // (a classe: só nos dos selecionados; 255 sem ela)
        const a = chave(c[1] || ''), m = c[0] === 'P' ? (/c/.test(c[2] || '') ? 1 : 0) | (/p/.test(c[2] || '') ? 2 : 0) : 0;
        for (const x of ((c[0] === 'P' ? c[4] : c[3]) || '').split(' ')) if (x) le(x, !meu, a, m);
      } else if (c[0] === 'O' && !meu) {
        os.push({ x: ux(+c[2]), y: uy(+c[1]), ano: +c[4], datas: (c[6] || c[3] || '').split(','), tr: c[7] || '', al: ia });
      } else if ((c[0] === 'E' || c[0] === 'M') && esc === 1e5) {   // (no faixa.txt, M é a linha dos metros do município: sem pontos)
        const q = le(c[1] || '', false, 0, 0, true);
        if (meu) continue;
        const cs = (c[2] || '').split(' ');
        for (let i = 0; i < q.length / 2; i++) {
          px.push(q[2 * i]); py.push(q[2 * i + 1]); pal.push(ia);
          if (c[0] === 'M') { const n = (cs[i] || '').split(',').map(Number); for (let j = 0; j < 4; j++) ns.push(n[j] || 0); continue; }
          for (const t of (cs[i] || '').split(',')) {
            if (!t) continue;
            const [y, n] = t.split(':');
            ys.push(y === 'd' ? -1 : y === 'z' ? 0 : 2000 + +y); ns.push(n ? +n : 1);
          }
          ip.push(ys.length);
        }
      }
    }
    if (tipo === 'executadas' || tipo === 'manutencao')
      return { cods, x: Float64Array.from(px), y: Float64Array.from(py), al: Uint16Array.from(pal), ini: Uint32Array.from(ip), ys: Int16Array.from(ys), ns: Uint16Array.from(ns), pontos: px.length };
    os.sort((a, b) => (b.datas[0] || '').localeCompare(a.datas[0] || ''));   // a mais recente tem a vez
    return { p: Float64Array.from(p), ini: Uint32Array.from(ini), cx: Float64Array.from(cx), al: Uint16Array.from(al), cl: Uint8Array.from(cl),
      sit: Uint8Array.from(sit), ak: Uint16Array.from(ak), mk: Uint8Array.from(mk), cods, anos, os, hoje, linhas: ini.length - 1, pontos: p.length / 2 };
  }
  // As camadas dos outros na região r (Dd: os dados lidos de cada uma; op: k, z, fora (códigos que ficam de fora: os
  // selecionados) e, das camadas ligadas: faixa, inspecao, executadas, manutencao). De baixo para cima: a Inspeção como borda
  // larga (com a Faixa, como no aberto), as linhas da Faixa, a Inspeção como linha (sem a Faixa), as criadas e pendentes, os
  // losangos da Manutenção e os do Insp→manut e as etiquetas das OS da Faixa. Devolve o que desenhou (testes)
  function pintaOutros(ctx, r, Dd, op) {
    const s = 256 * Math.pow(2, r.z), bx = -r.x, by = -r.y, W = r.w + 8, H = r.h + 8, info = {};
    const foraDe = G => { if (!op.fora || !op.fora.length) return null; const f = new Set(); op.fora.forEach(c => { const i = G.cods.indexOf(c); if (i >= 0) f.add(i); }); return f; };
    ctx.setTransform(op.k, 0, 0, op.k, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // a cor (índice em cores) de cada linha de G na região (cor(l): -1 fica de fora)
    const corDas = (G, cor, fora) => {
      const n = G.ini.length - 1, ci = new Int16Array(n), cx = G.cx;
      for (let l = 0; l < n; l++) {
        ci[l] = (fora && fora.has(G.al[l])) || cx[4 * l] * s + bx > W || cx[4 * l + 2] * s + bx < -8 || cx[4 * l + 1] * s + by > H || cx[4 * l + 3] * s + by < -8 ? -1 : cor(l);
      }
      return ci;
    };
    const traca = (G, q) => {
      const p = G.p;
      ctx.beginPath();
      for (let l = 0, n = G.ini.length - 1; l < n; l++) {
        if (!q(l)) continue;
        const a = G.ini[l], b = G.ini[l + 1];
        let lx = p[2 * a] * s + bx, ly = p[2 * a + 1] * s + by;
        ctx.moveTo(lx, ly);
        for (let k = a + 1; k < b; k++) {
          const x = p[2 * k] * s + bx, y = p[2 * k + 1] * s + by;
          if (k < b - 1 && x - lx < 0.6 && lx - x < 0.6 && y - ly < 0.6 && ly - y < 0.6) continue;
          ctx.lineTo(x, y); lx = x; ly = y;
        }
      }
      ctx.stroke();
    };
    // cada cor, de baixo para cima: o contorno escuro (se pedido) e a linha; conta as linhas de cada cor
    const linhas = (G, ci, o, contorno) => {
      const conta = o.cores.map(() => 0);
      for (let l = 0; l < ci.length; l++) if (ci[l] >= 0) conta[ci[l]]++;
      o.cores.forEach((cor, c) => {
        if (!conta[c]) return;
        if (contorno) { ctx.globalAlpha = 0.75 * o.alfa; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = o.larg[c] + 3; traca(G, l => ci[l] === c); }
        ctx.globalAlpha = o.alfa; ctx.strokeStyle = cor; ctx.lineWidth = o.larg[c]; traca(G, l => ci[l] === c);
      });
      return Object.fromEntries(o.cores.map((c, i) => [c, conta[i]]));
    };
    const F = op.faixa && Dd.faixa, I = op.inspecao && Dd.inspecao;
    const fF = F && foraDe(F), fI = I && foraDe(I);
    const ciF = F && corDas(F, l => !op.faixa.cls[F.cl[l]] ? -1 : op.faixa.vista === 'sit' ? op.faixa.corS[F.sit[l]] : op.faixa.corK[F.ak[l]], fF);
    const ciI = I && corDas(I, l => (op.inspecao.cls && op.inspecao.cls[I.cl[l]] === false ? -1 : op.inspecao.corK[I.ak[l]]), fI);
    if (I && op.inspecao.borda) info.inspecao = linhas(I, ciI, op.inspecao, false);
    if (F) info.cores = linhas(F, ciF, op.faixa, op.faixa.contorno);
    if (I && !op.inspecao.borda) info.inspecao = linhas(I, ciI, op.inspecao, op.inspecao.contorno);
    if (F && op.faixa.vista === 'ano' && op.faixa.nexe) {   // criadas tracejado branco; pendentes pontilhado branco com borda
      const w = op.faixa.larg[op.faixa.larg.length - 1];
      if (op.faixa.nexe.c) { ctx.globalAlpha = op.faixa.alfa; ctx.setLineDash([6, 7]); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, w * 0.8); traca(F, l => ciF[l] >= 0 && (F.mk[l] & 1)); }
      if (op.faixa.nexe.p) {
        ctx.setLineDash([1, 11]);
        ctx.globalAlpha = 0.8 * op.faixa.alfa; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = w + 3; traca(F, l => ciF[l] >= 0 && (F.mk[l] & 2));
        ctx.globalAlpha = op.faixa.alfa; ctx.strokeStyle = '#fff'; ctx.lineWidth = w + 1; traca(F, l => ciF[l] >= 0 && (F.mk[l] & 2));
      }
      ctx.setLineDash([]);
    }
    // losangos (Manutenção e Insp→manut): os pontos da região juntos numa célula de o.celula px (o do aberto: 44 px), no
    // meio deles; a cor e o número (o.numeros: de perto) como no aberto. G: os pontos; val(i): [cor (índice em o.cores), n]
    // ou null; a da célula: a de maior índice (o.maior) ou a de menor
    const losangos = (G, o, val, dx) => {
      const fora = foraDe(G), cel = new Map(), lado = o.lado;
      let m = 0;
      for (let i = 0, n = G.x.length; i < n; i++) {
        if (fora && fora.has(G.al[i])) continue;
        const x = G.x[i] * s + bx, y = G.y[i] * s + by;
        if (x < -30 || y < -30 || x > r.w + 30 || y > r.h + 30) continue;
        const v = val(i);
        if (!v) continue;
        const k = o.celula ? Math.floor((G.x[i] * s) / o.celula) + ',' + Math.floor((G.y[i] * s) / o.celula) : i;
        let c = cel.get(k);
        if (!c) cel.set(k, c = { x: 0, y: 0, q: 0, n: 0, cor: v[0], i0: i });
        c.x += x; c.y += y; c.q++; c.n += v[1];
        if (o.maior ? v[0] > c.cor : v[0] < c.cor) c.cor = v[0];   // (Manutenção: o ano mais recente; Insp→manut: a pior situação)
      }
      ctx.globalAlpha = 1;
      const quadrado = (x, y, h, cor) => {
        ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y); ctx.closePath();
        ctx.lineWidth = lado > 5 ? 4.5 : 3; ctx.strokeStyle = '#0b0f14'; ctx.stroke();
        ctx.lineWidth = lado > 5 ? 2 : 1.3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = cor; ctx.fill();
      };
      const lista = [...cel.values()];
      for (const c of lista) {
        const x = c.x / c.q + dx, y = c.y / c.q + dx, h = c.q > 1 ? lado * 1.25 : lado;
        if (c.q > 1) quadrado(x + 3, y + 3, h, '#fff');      // grupo: losango empilhado
        quadrado(x, y, h, o.cores[c.cor]);
        m++;
      }
      if (o.numeros) {
        ctx.font = '700 10px ui-monospace,Menlo,Consolas,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const c of lista) {
          if (c.n < 2) continue;
          const t = String(c.n), w = Math.max(16, ctx.measureText(t).width + 8), x = c.x / c.q + dx + (c.q > 1 ? 8 : 6), y = c.y / c.q + dx - (c.q > 1 ? 21 : 18);
          ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.arcTo(x + w, y, x + w, y + 16, 8); ctx.arcTo(x + w, y + 16, x, y + 16, 8); ctx.arcTo(x, y + 16, x, y, 8); ctx.arcTo(x, y, x + w, y, 8); ctx.closePath();
          ctx.fillStyle = '#0b0f14'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(t, x + w / 2, y + 8.5);
        }
        ctx.textAlign = 'start';
      }
      // (amostra para os testes: o losango e o 1º ponto dele, com o alimentador)
      return { losangos: m, amostra: lista.slice(0, 12).map(c => ({ x: (c.x / c.q - bx) / s, y: (c.y / c.q - by) / s, cor: o.cores[c.cor], n: c.n, q: c.q, al: G.cods[G.al[c.i0]], px: G.x[c.i0], py: G.y[c.i0] })) };
    };
    const E = op.executadas && Dd.executadas, M = op.manutencao && Dd.manutencao;
    if (E) {
      const o = op.executadas, on = o.on;                  // on: ano → índice da cor (os anos ligados)
      info.executadas = losangos(E, o, i => {
        let n = 0, ano = -Infinity;
        for (let j = E.ini[i]; j < E.ini[i + 1]; j++) if (E.ys[j] in on) { n += E.ns[j]; if (E.ys[j] > ano) ano = E.ys[j]; }
        return n ? [on[ano], n] : null;
      }, M ? 7 : 0);
    }
    if (M) {
      const o = op.manutencao;                             // sits: as situações ligadas (0 venc … 3 exec), da pior
      info.manutencao = losangos(M, o, i => {
        let n = 0, pior = -1;
        for (const j of o.sits) { const v = M.ns[4 * i + j]; if (v) { n += v; if (pior < 0) pior = j; } }
        return n ? [pior, n] : null;
      }, 0);
    }
    if (F) Object.assign(info, rotulosFaixa(ctx, r, F, op.faixa, fF, ciF, s, bx, by));
    ctx.globalAlpha = 1;
    return info;
  }
  // etiquetas das OS da Faixa (de perto): a cor do ano, o alimentador e o trecho num fundo escuro e as datas; as que batem
  // numa do aberto (op.evita: caixas em Mercator) ou numa já posta ficam de fora (a mais recente tem a vez). E a amostra
  // para os testes: até 24 linhas desenhadas (o ponto do meio de cada uma, a cor e o alimentador)
  function rotulosFaixa(ctx, r, F, op, fora, ci, s, bx, by) {
    const rots = [], p = F.p, n = F.ini.length - 1;
    if (op.rot) {
      const caixas = (op.evita || []).map(b => [b[0] * s + bx, b[1] * s + by, b[2] * s + bx, b[3] * s + by]);
      const bate = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      const F1 = '700 10px system-ui,-apple-system,"Segoe UI",sans-serif', F2 = '700 11px ui-monospace,Menlo,Consolas,monospace';
      for (const o of F.os) {
        const cor = op.rot[o.ano];
        if (!cor || (fora && fora.has(o.al)) || rots.length >= 80) continue;
        // (só as dos trechos das classes à vista, como as do aberto: "T1 / T2-G" fica se o T1 ou o T2 está ligado)
        if (op.cls && o.tr && !o.tr.split('/').some(t => { const k = t.trim().split('-')[0]; return !['T1', 'T2', 'T3'].includes(k) || op.cls[['T1', 'T2', 'T3'].indexOf(k)]; })) continue;
        const x = o.x * s + bx, y = o.y * s + by;
        if (x < -60 || y < -40 || x > r.w + 60 || y > r.h + 40) continue;
        const em = F.cods[o.al] + (o.tr ? ' ' + o.tr : ''), dt = o.datas.map(d => d.split('-').reverse().join('/')).join(' · ');
        ctx.font = F1; const we = ctx.measureText(em).width;
        ctx.font = F2; const wd = ctx.measureText(dt).width;
        const w = we + wd + 18, h = 19, l = x - w / 2, t = y - h - 8, cx2 = [l - 2, t - 2, l + w + 2, y + 2];
        if (caixas.some(b => bate(cx2, b)) || rots.some(b => bate(cx2, b))) continue;
        rots.push(cx2);
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = cor; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(l + 4, t); ctx.arcTo(l + w, t, l + w, t + h, 4); ctx.arcTo(l + w, t + h, l, t + h, 4);
        ctx.lineTo(x + 5, t + h); ctx.lineTo(x, t + h + 6); ctx.lineTo(x - 5, t + h);
        ctx.arcTo(l, t + h, l, t, 4); ctx.arcTo(l, t, l + w, t, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0b0f14'; ctx.fillRect(l + 3, t + 3, we + 6, h - 6);
        ctx.textBaseline = 'middle';
        ctx.font = F1; ctx.fillStyle = '#fff'; ctx.fillText(em, l + 6, t + h / 2 + 0.5);
        ctx.font = F2; ctx.fillStyle = '#111'; ctx.fillText(dt, l + we + 12, t + h / 2 + 0.5);
      }
    }
    const cands = [];                                    // (espalhada pelas linhas desenhadas da região)
    for (let l = 0; l < n; l++) {
      if (ci[l] < 0 || F.ini[l + 1] - F.ini[l] < 3) continue;
      const k = (F.ini[l] + F.ini[l + 1]) >> 1, x = p[2 * k] * s + bx, y = p[2 * k + 1] * s + by;
      if (x >= 40 && y >= 40 && x <= r.w - 40 && y <= r.h - 40) cands.push([l, k]);
    }
    const amostra = [];                                  // (16 das cores de cima: as do fundo são finas)
    for (const [q, m] of [[cands.filter(([l]) => ci[l] > 0), 16], [cands.filter(([l]) => ci[l] === 0), 8]]) {
      for (let i = 0, passo = Math.max(1, q.length / m), j = 0; i < q.length && j < m; i += passo, j++) {
        const [l, k] = q[Math.floor(i)];
        amostra.push({ x: p[2 * k], y: p[2 * k + 1], cor: op.cores[ci[l]], al: F.cods[F.al[l]], l });
      }
    }
    return { rotulos: rots.length, amostra };
  }
  // o pintor: desenha os pedidos das camadas (só o último de cada uma, se chegarem vários juntos) e devolve a imagem
  // (ImageBitmap); baixa os quadros do fundo do satélite (grupos: os de cada zoom; junta: montar a imagem do fundo, senão só
  // para o cache do navegador), parando enquanto o mapa mexe (menos com pressa: o botão foi tocado antes do fundo chegar)
  function Pintor(posta) {
    const CAM = {};                                      // as camadas dos outros, lidas (decodificaCam)
    const SEL = {};                                      // as dos selecionados (dados/redes/sel/): tipo → código → lida
    let D = null, P = null, vez = 0, pausa = false, pressa = false, ativos = 0;
    const pedidos = new Map(), telas = new Map(), fila = [];
    const pinta = () => {
      vez = 0;
      for (const m of pedidos.values()) {
        const W = Math.max(1, Math.ceil(m.r.w * m.r.k)), H = Math.max(1, Math.ceil(m.r.h * m.r.k));
        let oc = telas.get(m.camada);
        if (!oc || oc.width !== W || oc.height !== H) telas.set(m.camada, oc = new OffscreenCanvas(W, H));
        const ctx = oc.getContext('2d');
        let info = null;
        if (m.t === 'estado') { if (D) pintaEstado(ctx, m.r, D, m.op); } else if (m.t === 'outros') info = pintaOutros(ctx, m.r, CAM, m.op);
        else if (m.t === 'sel') {                       // cada selecionado com as camadas dele (o mesmo desenho dos outros)
          for (const [cod, op] of Object.entries(m.op.porAl)) {
            const Dd = {};
            for (const tipo of ['faixa', 'inspecao', 'executadas', 'manutencao']) { const G = SEL[tipo] && SEL[tipo].get(cod); if (G) Dd[tipo] = G; }
            pintaOutros(ctx, m.r, Dd, Object.assign({ k: m.op.k }, op));
          }
        } else if (P) pintaMascara(ctx, m.r, P, m.op);
        const bm = oc.transferToImageBitmap();
        posta({ t: 'tela', camada: m.camada, id: m.id, r: m.r, bm, info }, [bm]);
      }
      pedidos.clear();
    };
    const junta = g => {
      const q = g.bms;
      if (g.falhou || !q.length) { q.forEach(x => x[2].close()); posta({ t: 'fundo', z: g.z, falhou: true }); return; }
      const xa = Math.min(...q.map(x => x[0])), ya = Math.min(...q.map(x => x[1])), xb = Math.max(...q.map(x => x[0])), yb = Math.max(...q.map(x => x[1]));
      const w = (xb - xa + 1) * 256, h = (yb - ya + 1) * 256, oc = new OffscreenCanvas(w, h), ctx = oc.getContext('2d'), quadros = [];
      ctx.fillStyle = g.cor || '#0f1417'; ctx.fillRect(0, 0, w, h);   // onde não há quadro: a cor do mapa (o JPEG não tem transparência)
      for (const [x, y, bm] of q) { ctx.drawImage(bm, (x - xa) * 256, (y - ya) * 256, 256, 256); quadros.push([(x - xa) * 256, (y - ya) * 256]); bm.close(); }
      oc.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
        .then(blob => posta({ t: 'fundo', z: g.z, blob, quadros, r: { x: xa * 256, y: ya * 256, w, h, z: g.z, k: 1 } }), () => posta({ t: 'fundo', z: g.z, falhou: true }));
    };
    const bomba = () => {
      while (fila.length && ativos < (pressa ? 6 : 3) && (!pausa || fila[0][0].pressa)) {   // (os do zoom 6 não param com o mapa mexendo)
        const [g, q] = fila.shift();
        ativos++;
        fetch(q[2], { mode: 'cors', credentials: 'omit' })
          .then(r => { if (!r.ok) throw new Error(r.status); return g.junta ? r.blob().then(b => createImageBitmap(b)) : r.arrayBuffer().then(() => null); })
          .then(bm => { if (bm) g.bms.push([q[0], q[1], bm]); }, () => { g.falhou = true; })
          .then(() => { ativos--; if (!--g.falta && g.junta) junta(g); bomba(); });
      }
    };
    return m => {
      if (m.t === 'dados') D = m.D;
      else if (m.t === 'camurl') {                       // um arquivo das camadas dos outros: baixado e lido aqui (no worker, fora da
        // linha principal: nem o texto passa por ela); devolve o resumo. Executadas: os anos do arquivo vêm do cabeçalho
        fetch(m.url, { cache: 'no-cache' })              // (sem ?v=: confere a versão com o servidor)
          .then(r => (r.ok ? r.text() : null))
          .then(txt => {
            if (!txt) return;
            const G = CAM[m.tipo] = decodificaCam(m.tipo, txt, m.eu);
            let anos = G.anos || null;
            if (m.tipo === 'executadas') { try { anos = JSON.parse(txt.slice(1, txt.indexOf('\n'))).anos || []; } catch (e) { anos = []; } }
            posta({ t: 'cam', tipo: m.tipo, cods: G.cods, anos, linhas: G.linhas || 0, pontos: G.pontos, os: G.os ? G.os.length : 0, hoje: G.hoje || '' });
          })
          .catch(() => { /* sem o arquivo: os outros ficam como estão */ });
      }
      else if (m.t === 'selurl') {                       // um arquivo das camadas de um selecionado (como o camurl, só dele)
        fetch(m.url)
          .then(r => (r.ok ? r.text() : null))
          .then(txt => {
            if (!txt) throw new Error('vazio');
            const G = decodificaCam(m.tipo, txt, '');
            (SEL[m.tipo] = SEL[m.tipo] || new Map()).set(m.cod, G);
            let anos = G.anos || null;
            if (m.tipo === 'executadas') { try { anos = JSON.parse(txt.slice(1, txt.indexOf('\n'))).anos || []; } catch (e) { anos = []; } }
            posta({ t: 'selcam', tipo: m.tipo, cod: m.cod, anos, linhas: G.linhas || 0, pontos: G.pontos });
          })
          .catch(() => posta({ t: 'selcam', tipo: m.tipo, cod: m.cod, falhou: true }));
      } else if (m.t === 'selvivos') {                   // os que saíram da seleção: a memória deles sai
        const vivo = new Set(m.cods);
        for (const g of Object.values(SEL)) for (const c of [...g.keys()]) if (!vivo.has(c)) g.delete(c);
      }
      else if (m.t === 'contorno') P = m.P;
      else if (m.t === 'quadros') {
        for (const g of m.grupos) { const o = { z: g.z, junta: g.junta, pressa: g.pressa, cor: m.cor, bms: [], falta: g.itens.length, falhou: false }; g.itens.forEach(q => fila.push([o, q])); }
        bomba();
      } else if (m.t === 'pausa') { pausa = m.v; bomba(); }
      else if (m.t === 'pressa') { pressa = true; fila.sort((a, b) => (b[0].pressa ? 1 : 0) - (a[0].pressa ? 1 : 0)); bomba(); }
      else { pedidos.set(m.camada, m); if (!vez) vez = setTimeout(pinta, 0); }
    };
  }
  // MODO: 'worker' (o pintor num worker), 'pagina' (sem worker: o pintor aqui, com OffscreenCanvas) ou null (navegador sem
  // OffscreenCanvas: as camadas desenham no canvas da página, na hora, e não há fundo do satélite)
  const camadas = new Map();                             // id da camada → camada (as imagens que o pintor devolve)
  let fundoChegou = () => {};
  let camChegou = () => {}, selChegou = () => {};
  const chega = m => {
    if (m.t === 'tela') { const l = camadas.get(m.camada); if (l) { if (m.info) l._info = m.info; l._chegou(m.id, m.bm, m.r); } else m.bm.close(); }
    else if (m.t === 'cam') camChegou(m);
    else if (m.t === 'selcam') selChegou(m);
    else if (m.t === 'fundo') fundoChegou(m);
  };
  let MODO = null, PINTOR = null;
  try {
    const oc = window.OffscreenCanvas && new OffscreenCanvas(1, 1);
    if (oc && oc.getContext('2d') && oc.transferToImageBitmap && window.createImageBitmap && document.createElement('canvas').getContext('bitmaprenderer')) {
      MODO = 'pagina';
      if (window.Worker) {
        try {
          const fonte = `'use strict';\nconst tracaLinhas = ${tracaLinhas};\nconst pintaEstado = ${pintaEstado};\nconst recorta = ${recorta};\n` +
            `const pintaMascara = ${pintaMascara};\nconst decodificaCam = ${decodificaCam};\nconst pintaOutros = ${pintaOutros};\nconst rotulosFaixa = ${rotulosFaixa};\nconst recebe = (${Pintor})((m, t) => postMessage(m, t || []));\nonmessage = e => recebe(e.data);\n`;
          const url = URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }));
          PINTOR = new Worker(url);
          URL.revokeObjectURL(url);
          PINTOR.onmessage = e => chega(e.data);
          // (worker que não sobe: as camadas desenham aqui, na hora; o fundo do satélite fica de fora)
          PINTOR.onerror = () => { PINTOR = null; camadas.forEach(l => l.esquece()); };
          MODO = 'worker';
        } catch (e) { PINTOR = null; }
      }
      if (!PINTOR) { const recebe = Pintor(m => setTimeout(() => chega(m), 0)); PINTOR = { postMessage: m => setTimeout(() => recebe(m), 0) }; }
      PINTOR.postMessage({ t: 'contorno', P: PTOf });
    }
  } catch (e) { MODO = null; PINTOR = null; }
  // desenho na hora, aqui (antes da animação do zoom; worker que caiu)
  function pintaAqui(m) {
    const oc = new OffscreenCanvas(Math.max(1, Math.ceil(m.r.w * m.r.k)), Math.max(1, Math.ceil(m.r.h * m.r.k))), ctx = oc.getContext('2d');
    if (m.t === 'estado') { if (dados) pintaEstado(ctx, m.r, dados, m.op); } else if (m.t !== 'outros') pintaMascara(ctx, m.r, PTOf, m.op);   // (as camadas dos outros só no pintor)
    return oc.transferToImageBitmap();
  }

  // ---------- canvas preso ao mapa ----------
  // Como os canvas do Leaflet (move com o arrasto, estica no zoom), mas sabendo a região que tem desenhada (_r): canto de
  // cima à esquerda em pixels absolutos do zoom z (x, y), tamanho (w, h, px desse zoom) e resolução k (px do canvas por px
  // do mapa). A cada quadro do zoom (pinça, voo) e no começo da animação do zoom só a transformação (CSS) muda; quem
  // desenha é a camada filha, quando ela quer (vista: no fim de cada movimento; quadro: a cada quadro do zoom; mexe: no
  // arrasto). O desenho é pedido ao pintor (_p: a região pedida) e entra quando a imagem chega, já no lugar; uma imagem que
  // chega na animação do zoom espera o fim dela
  const Tela = L.Layer.extend({
    onAdd() {
      this._c = L.DomUtil.create('canvas', 'vto-tela leaflet-zoom-animated', this.getPane());
      this._ctx = this._c.getContext(MODO ? 'bitmaprenderer' : '2d');
      this._r = this._p = this._guarda = null;
      this._id = this._vis = 0;
      camadas.set(L.stamp(this), this);
      this.vista();
    },
    onRemove() { L.DomUtil.remove(this._c); this._r = this._p = null; camadas.delete(L.stamp(this)); },
    getEvents() { return { zoom: this._zoom, move: this.mexe, zoomanim: this._anim, zoomend: this._zEnd, moveend: this._fim, resize: this._fim }; },
    _zoom() { this.poe(map.getCenter(), map.getZoom()); this.quadro(); },
    _anim(e) { this.antesDaAnim(e); this.poe(e.center, e.zoom); },
    _zEnd() { const g = this._guarda; if (g) { this._guarda = null; this._chegou(...g); } },
    // o pedido da vista nova numa tarefa separada, logo depois da do fim do movimento (a da rede e das camadas não fica
    // mais longa); até a imagem nova chegar fica a de antes, esticada
    _fim() { if (!this._t) this._t = setTimeout(() => { this._t = 0; if (this._map && !map._animatingZoom) this.vista(); }, 0); },
    vista() {}, quadro() {}, mexe() {}, antesDaAnim() {}, _mostrou() {},
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
    // a região r cobre a vista (c, z) com a folga f? (cobre: a desenhada; cobreP: a pedida, se houver, senão a desenhada)
    cobreR(r, c, z, f) {
      if (!r) return false;
      const v = this.regiao(c, z, f, r.z);
      return v.x >= r.x - 0.5 && v.y >= r.y - 0.5 && v.x + v.w <= r.x + r.w + 0.5 && v.y + v.h <= r.y + r.h + 0.5;
    },
    cobre(c, z, f) { return this.cobreR(this._r, c, z, f); },
    cobreP(c, z, f) { return this.cobreR(this._p || this._r, c, z, f); },
    // transformação (CSS) para a vista (c, z): a região desenhada no lugar dela, esticada pela razão dos zooms
    poe(c, z) {
      const r = this._r;
      if (!r) return;
      const s = Math.pow(2, z - r.z), o = map._getNewPixelOrigin(c, z);
      L.DomUtil.setTransform(this._c, L.point(r.x * s - o.x, r.y * s - o.y), s);
    },
    // pede o desenho (tipo 'estado' ou 'mascara', com op) da região r (arredondada) com a resolução k: ao pintor (a imagem
    // chega depois) ou, com ja, na hora (antes da animação do zoom: tem que estar no lugar quando ela começa)
    pinta(r, k, tipo, op, ja) {
      const x = Math.floor(r.x), y = Math.floor(r.y);
      r = { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y, z: r.z, k, alfa: op && op.alfa };   // (alfa: a do estado, para o prepara)
      const id = ++this._id, m = { t: tipo, camada: L.stamp(this), id, r, op: Object.assign({ k }, op) };
      if (!MODO) { this._pinta2d(m); return; }
      if (ja || !PINTOR) { this._chegou(id, pintaAqui(m), r, ja); return; }
      this._p = r;
      PINTOR.postMessage(m);
    },
    // a imagem do pedido id chegou: entra se for mais nova que a da tela (a que chega na animação do zoom espera o fim dela)
    // (ja: pintada na hora, antes da animação do zoom: entra já, senão ficaria escondida a animação inteira)
    _chegou(id, bm, r, ja) {
      if (!this._map || id <= this._vis) { bm.close(); return; }
      if (map._animatingZoom && !ja) { if (this._guarda) this._guarda[1].close(); this._guarda = [id, bm, r]; return; }
      this._vis = id;
      if (id === this._id) this._p = null;
      const w = bm.width, h = bm.height;
      this._ctx.transferFromImageBitmap(bm);
      this._c.style.width = w / r.k + 'px'; this._c.style.height = h / r.k + 'px';
      this._r = r;
      this._mostrou();
      this.poe(map.getCenter(), map.getZoom());
    },
    // sem OffscreenCanvas: no canvas da página, na hora. O canvas só muda de tamanho quando a região não cabe nele (ou sobra
    // demais): mudar o tamanho a cada vista custava caro (o navegador refaz o canvas inteiro na 1ª pintura)
    _pinta2d(m) {
      const c = this._c, r = m.r, W = Math.max(1, Math.ceil(r.w * r.k)), H = Math.max(1, Math.ceil(r.h * r.k)), ctx = this._ctx;
      if (c.width < W || c.height < H || c.width * c.height > 2.5 * W * H) { c.width = W; c.height = H; }
      else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); }
      c.style.width = c.width / r.k + 'px'; c.style.height = c.height / r.k + 'px';
      if (m.t === 'estado') { if (dados) pintaEstado(ctx, r, dados, m.op); } else pintaMascara(ctx, r, PTOf, m.op);
      this._vis = this._id = m.id; this._p = null; this._r = r;
      this._mostrou();
      this.poe(map.getCenter(), map.getZoom());
    },
    // esquece o pedido que está no pintor (a imagem dele, quando chegar, não entra)
    esquece() { this._vis = this._id; this._p = null; if (this._guarda) { this._guarda[1].close(); this._guarda = null; } },
    // escondida por um tempo: solta a imagem (a memória dela); a próxima vista pede de novo
    soltaDepois(escondida) {
      clearTimeout(this._tSolta);
      this._tSolta = setTimeout(() => {
        if (!this._map || !escondida() || !this._r) return;
        this.esquece();
        if (MODO) { const o = new OffscreenCanvas(1, 1); o.getContext('2d'); this._ctx.transferFromImageBitmap(o.transferToImageBitmap()); }
        else this._c.width = this._c.height = 0;
        this._r = null;
      }, 8000);
    },
    // no voo, a cada quadro: a região desenhada (ou a pedida) tem que cobrir a vista deste quadro e a de daqui a 0,1 s, sem
    // esticar nem encolher demais nelas; senão, a região a pedir: esta vista e a de ~1,2 níveis de zoom adiante juntas, no
    // zoom do meio delas (fica nítida em todo o trecho). null: a que tem serve
    trechoDoVoo() {
      const c = map.getCenter(), z = map.getZoom(), [c1, z1] = voo.adiante(0.1), r = this._p || this._r;
      const bom = zz => { const f = Math.pow(2, zz - r.z); return !r.k || (f >= 0.6 && f <= 1.7 && r.k / f >= 0.45); };
      if (r && this.cobreR(r, c, z, 0) && this.cobreR(r, c1, z1, 0) && bom(z) && bom(z1)) return null;
      const [c2, z2] = voo.passo(1.2), zr = (z + z2) / 2, a = this.regiao(c, z, 0.04, zr), b = this.regiao(c2, z2, 0.04, zr);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, z: zr, zMin: Math.min(z, z2) };
    }
  });

  // ---------- máscara: fora do Tocantins, a cor de fundo do mapa ----------
  const FOLGA_M = 0.25, MAXPX = MOVEL ? 1.2e6 : 2.2e6;  // folga em volta da vista; px do canvas no máximo (a resolução cai)
  const MAXPX_ANIM = MOVEL ? 0.8e6 : 2e6;                // no voo, na pinça e no começo da animação do zoom
  const MASCARA_ATE = 10;                                // a máscara só abaixo deste zoom (o satélite recorta até o 9,99)
  let fundoCor = null;
  const corFundo = () => fundoCor || (fundoCor = getComputedStyle(mc).backgroundColor || '#0f1417');
  const Mascara = Tela.extend({
    options: { pane: 'mascara-to' },
    vista() {
      const c = map.getCenter(), z = map.getZoom(), r = this._p || this._r;
      if (!r || r.z !== z || !this.cobreR(r, c, z, 0.08)) this.faz(this.vistaM(c, z));
    },
    // parado e de longe: o estado inteiro e uma tela em volta (o arrasto não sai dela), com menos resolução se preciso
    // (só um preenchimento e a borda); senão, a vista com folga
    vistaM(c, z) { return (z < MASCARA_ATE && this.regiaoTO(c, z, 0.5, MAXPX, 1)) || this.regiao(c, z, FOLGA_M); },
    // voo: a região do trecho seguinte; pinça: se a vista sai da região (afastando), a vista com folga grande
    quadro() {
      if (map._animatingZoom) return;
      const c = map.getCenter(), z = map.getZoom();
      if (voo) { const r = this.trechoDoVoo(); if (r) this.faz(r, r.zMin, MAXPX_ANIM, this._c.hidden || !this.cobre(c, z, 0)); return; }   // (na hora se a vista já saiu da região)
      if (!this.cobreP(c, z, 0) || (this._c.hidden && z < MASCARA_ATE && (this._p || this._r).z >= MASCARA_ATE))
        this.faz(this.regiao(c, z, 0.5), z, MAXPX_ANIM);
    },
    mexe() { if (!map._animatingZoom && !voo && !this.cobreP(map.getCenter(), map.getZoom(), 0)) this.faz(this.vistaM(map.getCenter(), map.getZoom())); },
    // animação do zoom (roda, duplo clique, fim da pinça): afastando além da região desenhada, refaz na hora, antes dela
    // começar, com a região da vista de agora e a do fim juntas (com menos resolução se ficar grande), já no lugar, sem a
    // transição do CSS
    antesDaAnim(e) {
      if (this.cobre(e.center, e.zoom, 0) && !(this._c.hidden && e.zoom < MASCARA_ATE)) return;
      const c = map.getCenter(), z = map.getZoom(), a = this.regiao(c, z, FOLGA_M), b = this.regiao(e.center, e.zoom, 0.05, z);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), r = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, z };
      this._c.style.transition = 'none';
      this.faz(r, e.zoom, MAXPX_ANIM, true);
      void getComputedStyle(this._c).transform;           // aplica a posição nova sem transição
      this._c.style.transition = '';
    },
    // (zv: o zoom que vale para mostrar ou não a máscara; na animação do zoom, o do fim dela; no voo, o menor do trecho)
    faz(r, zv = map.getZoom(), maxpx = MAXPX, ja = false) {
      const S = 256 * Math.pow(2, r.z), q = [r.x / S, r.y / S, (r.x + r.w) / S, (r.y + r.h) / S];
      const perto = zv >= MASCARA_ATE && !this._segura(), corta = !perto && (noTO ? noTO.borda(q) : true);
      const dentro = perto || (!corta && noTO.dentro((q[0] + q[2]) / 2, (q[1] + q[3]) / 2));
      if (dentro) {                                      // de perto, ou a região toda dentro do estado: nada a cobrir
        this.esquece();
        this._r = { x: r.x, y: r.y, w: r.w, h: r.h, z: r.z, k: 0 };
        if (!this._c.hidden) { this._c.hidden = true; this.soltaDepois(() => this._c.hidden); }
        return;
      }
      const k = Math.min(1, Math.sqrt(maxpx / (r.w * r.h)));
      this.pinta(r, k, 'mascara', { cor: corFundo(), corta, cheia: !corta && !(noTO && noTO.dentro((q[0] + q[2]) / 2, (q[1] + q[3]) / 2)) }, ja);
    },
    // de perto a máscara sai só quando o satélite de fora da vista chegou e entrou (fora do TO não há nível de cima que
    // segure a imagem: sem isso, ao passar do zoom 10 na divisa, o lado de fora ficava escuro até os quadros chegarem).
    // No máximo 4 s; map._flyToFrame e não o voo daqui (o let voo vem depois do addTo da máscara)
    _segura() {
      const s = window.__satelite;
      if (this._c.hidden || !s || !s._map) return false;
      const ocupado = map._flyToFrame || map._animatingZoom || Object.values(s._tiles).some(t => t.current && !t.active);
      if (!ocupado) { this._t0s = 0; return false; }
      if (!this._t0s) this._t0s = performance.now();
      if (performance.now() - this._t0s > 4000) { this._t0s = 0; return false; }
      clearTimeout(this._tSeg);
      this._tSeg = setTimeout(() => { if (this._map && !this._c.hidden && map.getZoom() >= MASCARA_ATE) this.faz(this.vistaM(map.getCenter(), map.getZoom())); }, 150);
      return true;
    },
    _mostrou() { this._c.hidden = false; }
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
      .then(t => {
        if (!t) return;
        dados = decodifica(t);
        if (PINTOR) PINTOR.postMessage({ t: 'dados', D: { T1: dados.T1, T2: dados.T2 } });
        estado.vista(true);
      })
      .catch(() => { /* sem o arquivo: o estado fica só com a rede deste */ }));
  }

  // ---------- camada do estado ----------
  const FOLGA_E = 0.1, MAXPX_E = MOVEL ? 1.2e6 : 2e6;   // folga; parado, o estado inteiro de uma vez se couber nisso (px do canvas)
  const MAXPX_E_ANIM = MOVEL ? 0.8e6 : 2e6;              // no voo
  let zm = 9;                                            // zoom em que os vizinhos entram (o deles, quando começam)
  const leZm = () => { const v = window.__vizinhos; if (v && v.estado) zm = v.estado().zMin; return zm; };
  let mostra = false, esperaViz = 0, voo = null, estado = null;
  // opacidade da camada (no pane): de uma vez (aparecer, no voo) ou aos poucos (sair, quando os vizinhos estão na tela)
  function opacidade(v, suave) {
    const anima = suave && !calmo() && mostra && !v;     // só a saída é aos poucos
    mostra = v > 0;
    paneE.style.transition = anima ? '' : 'none';
    paneE.style.opacity = String(v);
    paneE.hidden = !mostra && !anima;
    if (!mostra && !anima && estado) estado.guarda();
  }
  paneE.addEventListener('transitionend', () => { if (!mostra) { paneE.hidden = true; if (estado) estado.guarda(); } });
  paneE.style.opacity = '0'; paneE.hidden = true;
  // no voo: a camada aparece abaixo do zoom em que os vizinhos entram (de 1 nível acima dele até ele), como fora do voo; de
  // perto (onde, parado, ficam os vizinhos) o estado simplificado em 150 m já sairia do lugar
  const opVoo = z => Math.max(0, Math.min(1, zm + 1 - z));
  // os selecionados já desenhados lá (selecionados.js), pelo índice nas linhas do estado: ficam de fora (lá eles são fortes;
  // baixando ou com erro, seguem aqui)
  const foraSel = () => { const S = window.__alSel, l = S && dados ? (S.desenhados ? S.desenhados() : S.lista()) : []; return l.length ? l.map(c => dados.cods.indexOf(c)).filter(i => i >= 0) : []; };
  // os selecionados que ainda não estão lá (baixando ou com erro): realçados aqui
  const forteSel = () => { const S = window.__alSel; if (!S || !dados) return []; const d = S.desenhados ? S.desenhados() : []; return S.lista().filter(c => !d.includes(c)).map(c => dados.cods.indexOf(c)).filter(i => i >= 0); };
  let forteVisto = '';                                   // os realçados do último desenho pedido
  // do estado inteiro as linhas fortes, como no satélite da página inicial (pedido do usuário: "aquela visão satélite
  // original"); de perto, apagadas como as dos vizinhos. Sem degrau: a opacidade desce aos poucos de ALFA_ESTADO (até
  // um zoom antes de Z_FORTE) a ALFA (de Z_FORTE em diante); zA: o zoom em que a imagem vai ser vista, quando não é o
  // da pintura (a guardada do prepara, pintada no zoom zm - 1 e esticada na pinça e na roda)
  const ALFA_ESTADO = 0.9, Z_FORTE = 8;
  const alfaZ = z => ALFA + (ALFA_ESTADO - ALFA) * Math.max(0, Math.min(1, Z_FORTE - z));
  const opEstado = (z, zA = z) => { const forte = forteSel(); forteVisto = forte.join(); return { alfa: alfaZ(zA), cls: ['T2', 'T1'].filter(visivel).map(c => ({ c, cor: COR[c], larg: larg(c, z) })), fora: foraSel(), forte }; };   // o tronco por cima
  const Estado = Tela.extend({
    options: { pane: 'estado-to' },
    // fim de cada movimento: abaixo dos vizinhos, o estado inteiro (sem esmaecer: os vizinhos saem no mesmo quadro; se a
    // imagem da vista ainda não chegou, aparece quando ela chegar); dos vizinhos em diante, se ainda estava na tela, fica
    // (na vista nova) até eles estarem desenhados, e sai aos poucos
    vista(forca) {
      if (voo) return;
      const z = map.getZoom(), c = map.getCenter();
      clearTimeout(esperaViz);
      this._quer = false;
      if (z < leZm()) {
        if (!dados) return;
        this.desenha(c, z, forca);
        if (this.cobre(c, z, 0)) opacidade(1, false); else this._quer = true;
        return;
      }
      if (!mostra) { this.guarda(); return; }
      this.desenha(c, z, forca);
      const confere = () => {
        const v = window.__vizinhos;
        if (voo || map.getZoom() < zm) return;
        if (!v || v.ocioso()) opacidade(0, true); else esperaViz = setTimeout(confere, 150);
      };
      esperaViz = setTimeout(confere, 0);                // depois do fim de movimento dos vizinhos (que pede o desenho deles)
    },
    _mostrou() { if (this._quer && !voo && map.getZoom() < zm) opacidade(1, false); this._quer = false; },
    // fora da tela: perto do zoom dos vizinhos, a região para o zoom para longe (prepara); mais perto, a imagem é solta
    // depois de um tempo (a memória dela)
    guarda() {
      if (voo) return;
      const z = map.getZoom();
      if (z < zm + 1.5) this.prepara(map.getCenter(), z);
      else if (this._r) this.soltaDepois(() => !mostra && map.getZoom() >= zm + 1.5);
    },
    // dos vizinhos em diante, perto do zoom deles e com a camada fora da tela: a região da vista de 1 nível abaixo, com
    // folga, desenhada pelo pintor e guardada escondida. O zoom para longe (roda ou pinça) que passa para baixo dos vizinhos
    // só a mostra, já no começo (antes, as linhas do resto da vista surgiam de uma vez no fim do zoom); no fim do zoom a
    // vista é refeita, nítida
    prepara(c, z) {
      if (!dados || !MODO || z >= zm + 1.5) return;
      const zr = zm - 1, r = this._p || this._r, zA = Math.min(z, zr), aA = alfaZ(zA);
      if (r && r.z === zr && Math.abs((r.alfa || 0) - aA) < 0.06 && this.cobreR(r, c, zr, 0.1)) return;
      const g = this.regiao(c, zr, 0.35);
      this.pinta(g, Math.min(R, Math.sqrt(MAXPX_E_ANIM / (g.w * g.h))), 'estado', opEstado(zr, zA));
    },
    // a guardada cobre a vista (c, z) abaixo dos vizinhos: entra (sem esmaecer; o canvas dos vizinhos ainda está por cima)
    entra(c, z) {
      if (mostra || voo || !dados || z >= zm || !this._r || !this._r.k || !this.cobre(c, z, 0)) return false;
      opacidade(1, false);
      return true;
    },
    // começo da animação do zoom (roda, duplo clique, fim da pinça): a camada aparece antes de o canvas andar (com a
    // posição de agora aplicada, para a transição do CSS levá-lo até a do fim)
    antesDaAnim(e) { if (this.entra(e.center, e.zoom)) void getComputedStyle(this._c).transform; },
    // no voo: a opacidade pelo zoom e, enquanto ela vale, a região do trecho seguinte; na pinça, a guardada (prepara)
    quadro() {
      if (!voo) { this.entra(map.getCenter(), map.getZoom()); return; }
      if (!dados) return;
      const z = map.getZoom(), o = opVoo(z);
      if (o !== +paneE.style.opacity || paneE.hidden !== !o) { mostra = o > 0; paneE.style.transition = 'none'; paneE.style.opacity = String(o); paneE.hidden = !o; }
      if (o > 0 || opVoo(voo.adiante(0.1)[1]) > 0) {
        const r = this.trechoDoVoo();
        if (r) this.pinta(r, Math.min(R, Math.sqrt(MAXPX_E_ANIM / (r.w * r.h))), 'estado', opEstado(r.z));
      }
    },
    // parado: o estado inteiro se couber; senão a vista com folga
    desenha(c, z, forca) {
      if (!dados) return;
      const r = this._p || this._r;
      if (!forca && r && r.z === z && r.k >= R && this.cobreR(r, c, z, 0.04)) return;   // a mesma vista (o pouso do voo): já está ou vem
      this.pinta(this.regiaoTO(c, z, R, MAXPX_E, 0.25) || this.regiao(c, z, FOLGA_E), R, 'estado', opEstado(z));
    }
  });
  estado = new Estado().addTo(map);

  // ---------- camadas dos outros alimentadores: Faixa, Inspeção, Manutenção e Insp→manut ----------
  // Com uma dessas camadas ligada no aberto (limpeza.js, inspecao.js, executadas.js, manutencao.js: window.__faixaCam,
  // __inspCam, __exeCam, __mntCam e os avisos al:faixa e al:camada), o T1 e o T2 dos outros alimentadores, do estado
  // inteiro aos vizinhos de perto, ganham a pintura dela, com o filtro do aberto (anos, situações; o ano que o aberto não
  // tem fica sempre ligado):
  //   Faixa: Por ano, a cor do ano da limpeza mais recente entre os ligados, o vão sem OS neutro e, ligadas no aberto, as
  //          criadas e as pendentes por cima; Vencimento, a situação do trecho. Do zoom 11 (parado, Por ano), as etiquetas
  //          das OS, mais leves que as do aberto e fora de cima delas
  //   Inspeção: os vãos inspecionados na cor do ano (com a Faixa, a borda larga em volta dela, como no aberto)
  //   Manutenção e Insp→manut: os losangos (a cor do ano mais recente / da pior situação), juntos numa célula de 44 px
  //          como os da Manutenção do aberto, com o número só do zoom 11
  // Os dados vêm de dados/redes/ (faixa.txt, o do satélite da página inicial; inspecao.txt, executadas.txt e manutencao.txt:
  // scripts/gera_trechos.py, faixa_txt e camadas_txt), cada um baixado só com a camada dele ligada e lido no worker (a
  // página não passa pelos arquivos). Um canvas só, acima dos vizinhos e abaixo das divisas e da rede deste, desenhado pelo
  // pintor como o do estado (no zoom e no arrasto ele só estica e move; refeito no fim do movimento, se a vista sai da
  // região, e quando uma camada muda). Os selecionados ficam de fora (as camadas deles: mais abaixo). Sem OffscreenCanvas: nada.
  // Só depois da carga (a rede, o painel e a lista de trechos inteira, e o navegador à toa: o começo, no fim): antes
  // disso os avisos das camadas (al:faixa, al:camada, que saem já na montagem delas) e os fins de movimento não baixam
  // nem desenham nada (medido no celular: o faixa.txt baixado e desenhado no meio da carga atrasava o painel e a lista)
  let comecouF = false;
  const paneF = map.createPane('camadas-outros');
  paneF.style.zIndex = 345;                              // acima dos vizinhos (340); abaixo das divisas (350) e da rede (400)
  paneF.style.pointerEvents = 'none';
  paneF.hidden = true;
  const FX_COR_ANO = { 2021: '#a78bfa', 2022: '#60a5fa', 2023: '#22d3ee', 2024: '#4ade80', 2025: '#facc15', 2026: '#fb923c', 2027: '#f87171', 2028: '#f472b6' };
  const fxCorAno = a => FX_COR_ANO[a] || (a < 2021 ? '#c4b5fd' : '#fb7185');   // as de limpeza.js (e executadas.js)
  const exCorAno = a => (a === -1 ? '#9ca3af' : fxCorAno(a));   // executadas.js: NAE DEOP (data padrão) cinza
  const IN_COR_ANO = { 2024: '#c084fc', 2025: '#818cf8', 2026: '#2dd4bf', 2027: '#a3e635' };
  const inCorAno = a => IN_COR_ANO[a] || (a < 2024 ? '#e879f9' : '#bef264');   // as de inspecao.js
  const FX_FUNDO = '#cbd5e1', FX_SIT = ['#22c55e', '#facc15', '#ef4444', '#d946ef'];   // dia, vence, vencida, sem (limpeza.js)
  const FX_SIT_ORDEM = [3, 0, 1, 2];                     // de baixo para cima: sem registro, em dia, vence, vencida
  const MN_SIT = ['venc', 'pend', 'fora', 'exec'], MN_COR = ['#ef4444', '#f59e0b', '#0ea5e9', '#22c55e'];   // manutencao.js, da pior
  const Z_FX_CONTORNO = 10, Z_FX_ROT = 11, Z_NUM = 11, FOLGA_F = 0.15;
  const fxLarg = z => z < 8 ? 1.5 : z < 10 ? 2.2 : z < 12 ? 3 : z < 14 ? 3.8 : 4.4;   // (o aberto: 5)
  // cada camada: o estado dela no aberto, o arquivo e o que o worker devolveu ao lê-lo
  const CAMS = {
    faixa: { cam: () => window.__faixaCam, arq: 'faixa.txt' },
    inspecao: { cam: () => window.__inspCam, arq: 'inspecao.txt' },
    executadas: { cam: () => window.__exeCam, arq: 'executadas.txt' },
    manutencao: { cam: () => window.__mntCam, arq: 'manutencao.txt' }
  };
  const camDe = n => { const f = CAMS[n].cam(); return f ? f() : null; };
  const ligada = n => { const c = camDe(n); return !!(c && c.ligado && MODO && PINTOR); };
  const ligadas = () => Object.keys(CAMS).filter(ligada);
  const prontas = () => ligadas().filter(n => CAMS[n].dados);
  let foraVisto = '';
  const foraF = () => { const S = window.__alSel; return S ? (S.desenhados ? S.desenhados() : S.lista()) : []; };
  let foraOutros = foraF;                                // (as camadas dos selecionados, mais abaixo: só os que já têm a camada lida)
  // as etiquetas da Faixa do aberto (as caixas na tela, em Mercator): as dos outros não ficam em cima delas
  function evitaF() {
    const m = mc.getBoundingClientRect(), z = map.getZoom(), s = 256 * Math.pow(2, z), o = map.getPixelOrigin(), out = [];
    for (const el of mc.querySelectorAll('.leaflet-marker-pane .limp-tag')) {
      const b = el.getBoundingClientRect();
      if (!b.width) continue;
      const a = map.containerPointToLayerPoint([b.left - m.left - 4, b.top - m.top - 4]).add(o), c = map.containerPointToLayerPoint([b.right - m.left + 4, b.bottom - m.top + 12]).add(o);
      out.push([a.x / s, a.y / s, c.x / s, c.y / s]);
    }
    return out;
  }
  // ano ligado no aberto c (o que o aberto não tem fica ligado)
  const anoOn = c => { const todos = new Set(c.todos), lig = new Set(c.anos); return a => !todos.has(a) || lig.has(a); };
  // cores de chaves de anos (a do ano mais recente ligado; sem nenhum: fundo, ou -1 se não há fundo), de baixo para cima
  function porChave(chaves, on, corDo, fundo) {
    const rank = new Map(), por = chaves.map(anos => {
      const a = anos.find(on), cor = a === undefined ? fundo : corDo(a);
      if (cor && (!rank.has(cor) || rank.get(cor) > (a === undefined ? -Infinity : a))) rank.set(cor, a === undefined ? -Infinity : a);
      return cor;
    });
    const cores = [...rank.keys()].sort((a, b) => rank.get(a) - rank.get(b));
    return { cores, corK: por.map(cor => (cor ? cores.indexOf(cor) : -1)) };
  }
  function opOutros(z, comRot) {
    const fora = foraOutros();
    foraVisto = fora.join();
    return opCams(z, comRot, n => CAMS[n].dados, fora);
  }
  // as opções do desenho das camadas ligadas com os dados de dadosDe(tipo) (os resumos: anos, ...): as dos outros, ou as de
  // um selecionado (fora: nenhum; o T3 também, com o botão dele)
  function opCams(z, comRot, dadosDe, fora) {
    const op = { z, fora }, w = fxLarg(z), num = z >= Z_NUM;
    const fxOn = ligada('faixa') && !!dadosDe('faixa');
    for (const n of ligadas().filter(dadosDe)) {
      const c = camDe(n), G = dadosDe(n);
      if (n === 'faixa') {
        const o = op.faixa = { vista: c.vista === 'sit' ? 'sit' : 'ano', cls: [visivel('T1'), visivel('T2'), visivel('T3')], contorno: z >= Z_FX_CONTORNO, alfa: 0.9, corS: [], corK: [] };
        if (o.vista === 'sit') {
          o.cores = FX_SIT_ORDEM.map(i => FX_SIT[i]);
          o.larg = FX_SIT_ORDEM.map(i => (i === 3 ? 0.8 : 1) * w);
          o.corS = [0, 1, 2, 3].map(i => FX_SIT_ORDEM.indexOf(i));
        } else {
          const on = anoOn(c);
          Object.assign(o, porChave(G.anos, on, fxCorAno, FX_FUNDO));
          o.larg = o.cores.map(cor => (cor === FX_FUNDO ? 0.55 : 1) * w);
          o.nexe = { c: c.nexe.includes('cri'), p: c.nexe.includes('pend') };
          if (comRot) {
            o.rot = {};
            for (const as of G.anos) for (const a of as) if (on(a)) o.rot[a] = fxCorAno(a);
            o.evita = evitaF();
          }
        }
      } else if (n === 'inspecao') {
        const o = op.inspecao = Object.assign({ borda: fxOn, contorno: z >= Z_FX_CONTORNO, alfa: 0.9, cls: [visivel('T1'), visivel('T2'), visivel('T3')] }, porChave(G.anos, anoOn(c), inCorAno, null));
        o.larg = o.cores.map(() => (fxOn ? 3 : 1) * w);  // (o aberto: borda de 15 em volta da Faixa de 5; sem ela, 5)
      } else if (n === 'executadas') {
        const on = anoOn(c), anos = [...new Set([...c.todos, ...G.anos])].filter(on).sort((a, b) => a - b);
        op.executadas = { cores: anos.map(exCorAno), on: Object.fromEntries(anos.map((a, i) => [a, i])), maior: true, celula: z < 17 ? 44 : 0, lado: z < 9 ? 4 : z < 12 ? 5.5 : 6.5, numeros: num };
      } else {
        const sits = MN_SIT.map((s, i) => i).filter(i => c.sits.includes(MN_SIT[i]));
        op.manutencao = { cores: MN_COR, sits, maior: false, celula: z < 15 ? 44 : 0, lado: z < 9 ? 4 : z < 12 ? 5.5 : 6.5, numeros: num };
      }
    }
    return op;
  }
  // os anos de cada arquivo (Inspeção, Manutenção) vêm no cabeçalho; os da Faixa nas chaves dos pedaços
  // O arquivo é baixado e lido pelo pintor (no worker: o texto não passa pela linha principal)
  function carregaCam(n) {
    const C = CAMS[n];
    if (C.carga || !PINTOR) return;
    C.carga = true;
    PINTOR.postMessage({ t: 'camurl', tipo: n, url: new URL('../dados/redes/' + C.arq, eu.src).href, eu: EU });
  }
  camChegou = m => {
    const C = CAMS[m.tipo];
    C.dados = Object.assign(m, { anos: m.anos || [] });
    outros.vista(true);
  };
  const Outros = Tela.extend({
    options: { pane: 'camadas-outros' },
    vista(forca) {
      if (voo || !comecouF) return;
      const ls = ligadas();
      ls.forEach(n => { if (!CAMS[n].dados) carregaCam(n); });
      if (!ls.some(n => CAMS[n].dados)) { this.apaga(); return; }
      const c = map.getCenter(), z = map.getZoom(), r = this._p || this._r;
      if (!forca && r && r.z === z && r.k >= R && this.cobreR(r, c, z, 0.04)) return;
      const perto = z >= Z_NUM;                          // (etiquetas e números: a região da vista, no zoom dela)
      this.pinta((!perto && this.regiaoTO(c, z, R, MAXPX_E, 0.25)) || this.regiao(c, z, FOLGA_F), R, 'outros', opOutros(z, z >= Z_FX_ROT));
    },
    // no arrasto, se a vista sai da região (de perto): a vista de agora, com folga
    mexe() { if (!paneF.hidden && !map._animatingZoom && !voo && !this.cobreP(map.getCenter(), map.getZoom(), 0)) this.vista(true); },
    // no voo: a região do trecho seguinte (sem etiquetas nem números)
    quadro() {
      if (!voo || !prontas().length) return;
      const r = this.trechoDoVoo();
      if (!r) return;
      const op = opOutros(r.z, false);
      ['executadas', 'manutencao'].forEach(n => { if (op[n]) op[n].numeros = false; });
      this.pinta(r, Math.min(R, Math.sqrt(MAXPX_E_ANIM / (r.w * r.h))), 'outros', op);
    },
    _mostrou() { paneF.hidden = !prontas().length; },
    apaga() { this.esquece(); if (!paneF.hidden) { paneF.hidden = true; this.soltaDepois(() => paneF.hidden); } }
  });
  const outros = new Outros().addTo(map);
  function refazF() { outros.esquece(); outros.vista(true); }
  const avisoF = () => { clearTimeout(refazF.t); refazF.t = setTimeout(refazF, 0); };   // (vários avisos juntos: um desenho)
  document.addEventListener('al:faixa', avisoF);
  document.addEventListener('al:camada', avisoF);

  // ---------- as camadas dos selecionados (pedido do usuário: o selecionado pintado pela camada ligada, como o aberto) ----------
  // Cada selecionado já desenhado (selecionados.js: os mesmos que ficam fora das camadas dos outros, foraF: nenhum fica de
  // fora nem é desenhado duas vezes) com as camadas ligadas, do arquivo dele em dados/redes/sel/ (scripts/gera_trechos.py,
  // sel_mapa: o mesmo formato e a mesma conta dos outros, com o T3), baixado e lido no pintor só quando a camada está
  // ligada e ele selecionado. O desenho é o dos outros (pintaOutros), num canvas acima da rede dos selecionados (390) e
  // abaixo dos equipamentos deles (395) e da rede do aberto (400). Com a Faixa ou a Inspeção dele no mapa, a rede do
  // selecionado fica neutra embaixo (selecionados.js, selLinhas): as cores das zonas não se misturam com as da camada.
  const paneS = map.createPane('sel-camadas');
  paneS.style.zIndex = 392;
  paneS.style.pointerEvents = 'none';
  paneS.hidden = true;
  const SELD = {};                                       // tipo → código → { anos, ... } (o resumo do pintor) ou 'vindo' / 'falhou'
  let selIndice = null, selIndiceP = null;
  const carregaIndiceSel = () => selIndiceP || (selIndiceP = fetch(new URL('../dados/redes/sel/indice.json', eu.src).href, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(j => { selIndice = j || {}; selCams.vista(true); if (foraMudou()) refazF(); }));
  const selDados = (cod, n) => { const x = SELD[n] && SELD[n][cod]; return x && typeof x === 'object' ? x : null; };
  // os selecionados que a camada dos outros deixa de fora: os já desenhados cuja camada (as ligadas que ele tem) já está
  // lida ou falhou; enquanto o arquivo dele baixa, a dos outros continua com ele (não fica um instante só com a rede)
  const selPronto = c => ligadas().every(n => { if (!selIndice) return false; if (!(selIndice[n] && selIndice[n][c])) return true; const x = SELD[n] && SELD[n][c]; return !!x && x !== 'vindo'; });
  foraOutros = () => { const f = foraF(); return MODO && PINTOR ? f.filter(selPronto) : f; };
  // algum selecionado sem a camada (o arquivo dele não veio): selecionados.js mostra o aviso "só a rede"
  const selFalhou = () => foraF().some(c => ligadas().some(n => SELD[n] && SELD[n][c] === 'falhou'));
  let selVivosVisto = '';
  function selPede(cods) {
    if (cods.join() !== selVivosVisto) { selVivosVisto = cods.join(); PINTOR.postMessage({ t: 'selvivos', cods }); for (const g of Object.values(SELD)) for (const c of Object.keys(g)) if (!cods.includes(c)) delete g[c]; }
    const ls = ligadas();
    if (!ls.length || !cods.length) return;
    if (!selIndice) { carregaIndiceSel(); return; }
    for (const n of ls) for (const cod of cods) {
      const v = selIndice[n] && selIndice[n][cod], g = SELD[n] = SELD[n] || {};
      if (!v || g[cod]) continue;
      g[cod] = 'vindo';
      PINTOR.postMessage({ t: 'selurl', tipo: n, cod, url: new URL(`../dados/redes/sel/${encodeURIComponent(cod)}.${n}.txt?v=${v}`, eu.src).href });
    }
  }
  selChegou = m => {
    const g = SELD[m.tipo] = SELD[m.tipo] || {};
    if (!foraF().includes(m.cod)) { delete g[m.cod]; return; }   // (saiu da seleção enquanto baixava)
    g[m.cod] = m.falhou ? 'falhou' : Object.assign(m, { anos: m.anos || [] });
    selCams.vista(true);
    if (foraMudou()) refazF();                           // (agora a camada dos outros o deixa de fora)
    avisaSel();
  };
  // os selecionados com linhas de camada (Faixa, Inspeção) no mapa: selecionados.js deixa a rede deles neutra
  const selLinhas = () => { if (!MODO || !PINTOR || paneS.hidden) return []; return foraF().filter(c => ['faixa', 'inspecao'].some(n => ligada(n) && selDados(c, n))); };
  let selLinhasVisto = '';
  function avisaSel() { const v = selLinhas().join(); if (v !== selLinhasVisto) { selLinhasVisto = v; document.dispatchEvent(new CustomEvent('al:selcam')); } }
  function opSel(z, comRot) {
    const porAl = {};
    for (const cod of foraF()) {
      const op = opCams(z, comRot, n => selDados(cod, n), []);
      if (op.faixa || op.inspecao || op.executadas || op.manutencao) {
        for (const n of ['faixa', 'inspecao']) if (op[n]) op[n].alfa = 1;   // (o selecionado é forte, como a rede dele)
        porAl[cod] = op;
      }
    }
    return { porAl, n: Object.keys(porAl).length };
  }
  const SelCams = Tela.extend({
    options: { pane: 'sel-camadas' },
    vista(forca) {
      if (voo || !comecouF || !MODO || !PINTOR) return;
      const cods = foraF();
      selPede(cods);
      const op = cods.length && ligadas().length ? opSel(map.getZoom(), map.getZoom() >= Z_FX_ROT) : null;
      if (!op || !op.n) { this.apaga(); return; }
      const c = map.getCenter(), z = map.getZoom(), r = this._p || this._r;
      if (!forca && r && r.z === z && r.k >= R && this.cobreR(r, c, z, 0.04)) return;
      this.pinta(this.regiao(c, z, FOLGA_F), R, 'sel', op);
    },
    mexe() { if (!paneS.hidden && !map._animatingZoom && !voo && !this.cobreP(map.getCenter(), map.getZoom(), 0)) this.vista(true); },
    quadro() {
      if (!voo || paneS.hidden) return;
      const r = this.trechoDoVoo();
      if (!r) return;
      const op = opSel(r.z, false);
      for (const o of Object.values(op.porAl)) ['executadas', 'manutencao'].forEach(n => { if (o[n]) o[n].numeros = false; });
      if (op.n) this.pinta(r, Math.min(R, Math.sqrt(MAXPX_E_ANIM / (r.w * r.h))), 'sel', op);
    },
    _mostrou() { paneS.hidden = false; avisaSel(); },
    apaga() { this.esquece(); if (!paneS.hidden) { paneS.hidden = true; this.soltaDepois(() => paneS.hidden); avisaSel(); } }
  });
  const selCams = new SelCams().addTo(map);
  function refazS() { selCams.esquece(); selCams.vista(true); }
  const avisoS = () => { clearTimeout(refazS.t); refazS.t = setTimeout(refazS, 0); };
  document.addEventListener('al:faixa', avisoS);
  document.addEventListener('al:camada', avisoS);
  // (sem olhar se o canvas está à vista: uma imagem pedida antes, ainda a caminho, pode ter saído com a lista velha)
  const foraMudou = () => ligadas().length > 0 && foraOutros().join() !== foraVisto;
  const corBt = c => { const b = document.querySelector(`#classes button[data-c="${c}"]`); return b && b.style.getPropertyValue('--c').trim(); };
  const cls = document.getElementById('classes');
  if (cls) {
    COR.T1 = corBt('T1') || COR.T1; COR.T2 = corBt('T2') || COR.T2;
    // T1 ou T2 ligado ou desligado: a imagem guardada não vale mais
    cls.addEventListener('click', e => { if (!e.target.closest('button')) return; refaz(); refazF(); refazS(); });
  }
  // (também quando a seleção muda: selecionados.js, e o al:selecao: o realce de quem entra ou sai enquanto baixa)
  function refaz() { estado.esquece(); if (mostra) estado.desenha(map.getCenter(), map.getZoom(), true); else estado._r = null; if (foraMudou()) refazF(); avisoS(); }
  document.addEventListener('al:selecao', () => {
    if (foraMudou()) refazF();
    avisoS();
    if (dados && forteSel().join() !== forteVisto) refaz();
    if (cod0 && !dica.hidden) poeDica(cod0);
  });

  // ---------- linha de outro alimentador sob o ponto (x, y) do mapa ----------
  function alvoEm(pt, tol) {
    if (!dados || !mostra) return null;
    const z = map.getZoom(), s = 256 * Math.pow(2, z), q = map.containerPointToLayerPoint(pt).add(map.getPixelOrigin());
    const px = q.x / s, py = q.y / s, t = tol / s, f = foraSel(), fora = f.length ? new Set(f) : null;
    let best = t * t, al = -1;
    for (const c of ['T1', 'T2']) {
      if (!visivel(c)) continue;
      const g = dados[c], p = g.p, ini = g.ini, cx = g.cx;
      for (let l = 0, nl = ini.length - 1; l < nl; l++) {
        if ((fora && fora.has(g.al[l])) || cx[4 * l] - t > px || cx[4 * l + 2] + t < px || cx[4 * l + 1] - t > py || cx[4 * l + 3] + t < py) continue;
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
  // o balão dos vizinhos (vizinhos.js): o código e "Abrir alimentador" (aqui pode ser de qualquer lugar do estado). Só sem
  // a seleção (ou fora do índice dela): com ela, o clique já seleciona
  const balao = cod => {
    const a = `<a href="../${encodeURIComponent(cod)}/">Abrir alimentador</a>`, bt = window.__alSel ? window.__alSel.botao(cod) : '';   // "Selecionar" (selecionados.js)
    return `<div class="viz-pop"><b>${esc(cod)}</b><small>Outro alimentador</small>${bt ? `<span class="viz-acoes">${a}${bt}</span>` : a}</div>`;
  };
  map.on('click', ev => {
    if (!pode() || !ev.containerPoint) return;
    const oe = ev.originalEvent || {}, toque = oe.pointerType ? oe.pointerType !== 'mouse' : MOVEL;
    const cod = alvoEm(ev.containerPoint, toque ? 14 : 7);
    if (!cod) return;
    const S = window.__alSel;
    if (S && S.em(ev.containerPoint, toque ? 16 : 10)) return;   // a linha de um selecionado tem a vez
    if (S && S.seleciona && S.seleciona(cod)) { map.closePopup(); return; }   // (o realce vem pelo al:selecao)
    paira(null);
    L.popup({ className: 'viz-popup', maxWidth: 260, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] })
      .setLatLng(ev.latlng).setContent(balao(cod)).openOn(map);
  });
  // mouse: o código sob ele (a dica dos vizinhos) e a mãozinha
  const dica = L.DomUtil.create('div', 'leaflet-tooltip leaflet-tooltip-top viz-dica', mc);
  dica.hidden = true;
  dica.setAttribute('aria-hidden', 'true');
  const ren = map.options.renderer;
  let cod0 = null;                                       // o código que a dica mostra
  // o código e, com a seleção, embaixo "Clique para selecionar" (ou o que __alSel.dica disser)
  function poeDica(cod) {
    const S = window.__alSel, d = S && S.dica ? S.dica(cod) : '';
    if (d) dica.innerHTML = `<b>${esc(cod)}</b><small>${esc(d)}</small>`; else dica.textContent = cod;
  }
  function paira(ev) {
    let cod = null, pt = null;
    const alvo = ev && ev.target;
    if (ev && pode() && !map.dragging.moving() && alvo && (alvo === mc || alvo.tagName === 'CANVAS') && !(ren && ren._hoveredLayer))
      cod = alvoEm(pt = map.mouseEventToContainerPoint(ev), 7);
    if (cod && window.__alSel && window.__alSel.em(pt, 10)) cod = null;   // a linha de um selecionado tem a vez
    mc.classList.toggle('vto-mao', !!cod);
    const mostraDica = cod && !(map._popup && map._popup._map && map._popup.options.className === 'viz-popup');
    if (mostraDica) { if (cod !== cod0 || dica.hidden) poeDica(cod); dica.style.left = pt.x + 'px'; dica.style.top = pt.y + 'px'; }
    cod0 = mostraDica ? cod : null;
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

  // ---------- fundo do satélite: os quadros de longe do TO numa imagem só, por baixo ----------
  // Os quadros do zoom 6 (e depois os do 8) que tocam o estado, juntados pelo pintor numa imagem só (JPEG), presa ao mapa
  // como os canvas daqui (no zoom e no voo só estica). Medido no zoom pela roda e pela pinça: uma camada de quadros do
  // Leaflet (25 imagens esticadas até 1.000×) dava quadros lentos a mais no PC, e um canvas, no celular; a imagem só,
  // nenhum dos dois. Num painel abaixo do satélite (que, nítido, entra por cima aos poucos)
  const sat = window.__satelite;
  let fundo = null, vis = () => {};
  if (sat && noTO && PINTOR) {
    map.createPane('fundo-to').style.zIndex = 150;      // abaixo do satélite (tilePane, 200)
    const Fundo = Tela.extend({
      options: { pane: 'fundo-to' },
      onAdd() { this._c = null; this._r = null; },
      onRemove() { if (this._c) L.DomUtil.remove(this._c); this._c = this._r = null; },
      vista() { if (this._r) this.poe(map.getCenter(), map.getZoom()); },
      // a imagem nova (já decodificada) no lugar da de antes, com a região r e os quadros (canto de cada um, px da imagem)
      troca(im, r, quadros) {
        if (map._animatingZoom) { map.once('zoomend', () => this.troca(im, r, quadros)); return; }
        if (!this._map || (this._r && this._r.z > r.z)) return;   // (a do zoom 8 já entrou: a do 6 não volta)
        im.className = 'vto-tela leaflet-zoom-animated';
        im.style.width = r.w + 'px'; im.style.height = r.h + 'px';
        if (this._c) { im.style.visibility = this._c.style.visibility; this._c.replaceWith(im); } else this.getPane().append(im);
        this._c = im; this._r = r; this._quadros = quadros;
        this.poe(map.getCenter(), map.getZoom());
        vis();
      }
    });
    fundo = new Fundo().addTo(map);
    fundoChegou = m => {
      if (!m.blob) return;
      const im = new Image(), url = URL.createObjectURL(m.blob);
      im.alt = ''; im.draggable = false; im.decoding = 'async';
      im.src = url;
      (im.decode ? im.decode() : new Promise((ok, erro) => { im.onload = ok; im.onerror = erro; }))
        .then(() => fundo.troca(im, m.r, m.quadros), () => {}).then(() => URL.revokeObjectURL(url));
    };
    // Parado (e no arrasto) com o estado inteiro na tela ou de perto (zoom 12 em diante), o fundo não faz falta: o satélite
    // nítido cobre a tela (de longe ele guarda o nível de antes até o novo chegar; de perto, como sempre foi). Fica
    // escondido, uma camada a menos para o navegador juntar a cada quadro (só depois de os quadros nítidos da vista
    // chegarem e entrarem: no pouso do voo eles ainda estão chegando). Volta a cada zoom para longe (roda, pinça, voo),
    // quando faltariam quadros nas bordas; no zoom para perto pela roda, com o nível de agora inteiro, o nível de agora
    // ampliado cobre a tela até o novo chegar: o fundo fica escondido
    const Z_FUNDO_ATE = 12;
    const sobra = () => map.getZoom() >= Z_FUNDO_ATE || map.getBounds().contains(caixaTO);
    let tVis = 0;
    vis = () => {
      if (!fundo._c) return;
      clearTimeout(tVis);
      if (!sobra()) { fundo._c.style.visibility = ''; return; }
      const esconde = () => { clearTimeout(tVis); tVis = setTimeout(() => { if (!voo && fundo._c && sobra() && sat._noTilesToLoad()) fundo._c.style.visibility = 'hidden'; }, 400); };
      if (sat._noTilesToLoad()) esconde(); else sat.once('load', esconde);
    };
    map.on('moveend', vis);
    map.on('zoomstart', () => { if (fundo._c) { clearTimeout(tVis); fundo._c.style.visibility = ''; } });
  }
  // os quadros do fundo (zoom 6, depois o 8) e, se for outro, os do zoom que o satélite usa na visão do estado (o 7 numa
  // tela grande, o 5 no celular deitado; só para o cache), baixados pelo pintor assim que o alimentador fica pronto,
  // parando enquanto o mapa mexe; as imagens ficam na memória enquanto a página está aberta (o cache normal do navegador;
  // nada é guardado no site). Com CORS (o servidor da Esri permite): a imagem do fundo é montada com eles
  let preCarregou = false;
  function preCarrega() {
    if (!fundo || preCarregou || !PINTOR) return;
    preCarregou = true;
    const itens = z => {
      const n = Math.pow(2, z), xa = Math.floor(ux(caixaTO.getWest()) * n), xb = Math.floor(ux(caixaTO.getEast()) * n);
      const ya = Math.floor(uy(caixaTO.getNorth()) * n), yb = Math.floor(uy(caixaTO.getSouth()) * n), q = [];
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (noTO({ x, y, z })) q.push([x, y, sat.getTileUrl({ x, y, z })]);
      return q;
    };
    const grupos = [{ z: 6, junta: true, pressa: true, itens: itens(6) }, { z: 8, junta: true, itens: itens(8) }], zv = zEst === null ? 6 : Math.round(zEst);
    if (zv >= 4 && zv <= 9 && zv !== 6 && zv !== 8) grupos.push({ z: zv, junta: false, itens: itens(zv) });
    PINTOR.postMessage({ t: 'quadros', grupos, cor: corFundo() });   // (a cor do mapa onde falta quadro, não o preto do JPEG)
    let tPausa = 0;
    map.on('movestart', () => { clearTimeout(tPausa); if (PINTOR) PINTOR.postMessage({ t: 'pausa', v: true }); });
    map.on('moveend', () => { clearTimeout(tPausa); tPausa = setTimeout(() => PINTOR && PINTOR.postMessage({ t: 'pausa', v: false }), 300); });
  }
  const fundoPronto = () => !!(fundo && fundo._c && fundo._r);

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
  // os controles de baixo, por cima do mapa (este botão, o Tela cheia e a coluna das legendas), em px do mapa, com 6 de folga
  function controles() {
    const m = mc.getBoundingClientRect(), out = [];
    box.querySelectorAll(':scope>.vto-canto,:scope>.tc-canto,:scope>.ctl-lgs').forEach(el => {
      if (getComputedStyle(el).display === 'none') return;
      const r = el.getBoundingClientRect(), w = el === canto ? larguraVolta() : r.width;
      if (r.width && r.height && r.bottom > m.top && r.top < m.bottom) out.push([r.right - w - m.left - 6, r.top - m.top - 6, r.right - m.left + 6, r.bottom - m.top + 6]);
    });
    return out;
  }
  // a largura do botão com o nome da volta (o que ele mostra na visão do estado), medida trocando o nome por um instante
  function larguraVolta() {
    if (bt.classList.contains('volta')) return canto.offsetWidth;
    const t = btTx.textContent;
    btTx.textContent = 'Voltar ao alimentador'; bt.classList.add('volta');
    const w = canto.offsetWidth;
    btTx.textContent = t; bt.classList.remove('volta');
    return w;
  }
  // o lado (a, b) passa pelo retângulo q? (Liang–Barsky)
  const ladoNoRet = (a, b, q) => {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1], ps = [-dx, dx, -dy, dy], qs = [a[0] - q[0], q[2] - a[0], a[1] - q[1], q[3] - a[1]];
    for (let i = 0; i < 4; i++) {
      const p = ps[i], v = qs[i];
      if (!p) { if (v < 0) return false; continue; }
      const t = v / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  };
  // na vista (centro c, zoom z), o contorno do estado passa por baixo de algum dos retângulos rs (px do mapa)?
  function cobreControle(c, z, rs) {
    const t = map.getSize(), S = 256 * Math.pow(2, z), o = map.project(c, z), ox = o.x - t.x / 2, oy = o.y - t.y / 2;
    const P = PTO.map(([x, y]) => [x * S - ox, y * S - oy]);
    const dentro = (x, y) => { let d = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i]; if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) d = !d; } return d; };
    return rs.some(q => dentro((q[0] + q[2]) / 2, (q[1] + q[3]) / 2) || P.some((b, i) => ladoNoRet(P[i ? i - 1 : P.length - 1], b, q)));
  }
  // o zoom e o centro da visão do estado: a conta do Leaflet sem o limite do zoom mínimo de agora (ele pode descer: o mapa
  // ficou menor) e, se o botão, o Tela cheia ou as legendas cobrirem o estado, o estado mais para um lado (se sobrar
  // largura) ou até 2 passos de zoom menor; se nada servir, no meio. Guardada até o mapa ou os controles mudarem
  let vEst = null;
  function calculaEstado() {
    const t = map.getSize();
    if (t.x < 50 || t.y < 50) return null;
    const tl = L.point(16, folgaTopo()), br = L.point(16, 16), m0 = map.options.minZoom;
    map.options.minZoom = 0;
    const v0 = map._getBoundsCenterZoom(caixaTO, { paddingTopLeft: tl, paddingBottomRight: br });
    map.options.minZoom = m0;
    if (!isFinite(v0.zoom)) return null;
    let v = v0;
    const rs = controles(), passo = map.options.zoomSnap || 0.25;
    if (rs.length && cobreControle(v0.center, v0.zoom, rs)) {
      busca: for (let i = 0; i <= 2; i++) {
        const z = v0.zoom - i * passo, sw = map.project(caixaTO.getSouthWest(), z), ne = map.project(caixaTO.getNorthEast(), z);
        const meio = sw.add(ne).divideBy(2).add(br.subtract(tl).divideBy(2)), sobra = Math.max(0, t.x - tl.x - br.x - (ne.x - sw.x)) / 2;
        for (const dx of [0, sobra, -sobra, sobra / 2, -sobra / 2]) {
          const c = map.unproject(meio.subtract([dx, 0]), z);
          if (!cobreControle(c, z, rs)) { v = { center: c, zoom: z }; break busca; }
        }
      }
    }
    return (vEst = v);
  }
  const vistaEstado = () => vEst || calculaEstado() || map._getBoundsCenterZoom(caixaTO, {});
  const caixaAl = () => {
    if (window.__caixaRede) return window.__caixaRede;
    let s = 90, w = 180, n = -90, e = -180;
    (D && D.vaos || []).forEach(v => { s = Math.min(s, v[0], v[2]); n = Math.max(n, v[0], v[2]); w = Math.min(w, v[1], v[3]); e = Math.max(e, v[1], v[3]); });
    return L.latLngBounds([s, w], [n, e]);
  };
  const vistaAl = () => map._getBoundsCenterZoom(caixaAl().pad(0.04), {});
  let zEst = null;
  // o zoom mínimo do mapa é o do estado inteiro (afastar com a roda ou o dedo para nele); muda com o tamanho do mapa e dos
  // controles, para cima ou para baixo. Quem estava na visão do estado (girou o celular, saiu da tela cheia) continua nela
  function minimo() {
    if (voo) return;
    vEst = null;
    const ant = zEst, v = calculaEstado();
    if (!v) return;
    zEst = v.zoom;
    if (ant !== null && zEst !== ant && Math.abs(map.getZoom() - ant) < 1e-6 && !map._animatingZoom) {
      map.options.minZoom = Math.min(zEst, map.getZoom());
      map.setView(v.center, zEst, { animate: false });
    }
    if (map.getMinZoom() !== zEst) map.setMinZoom(zEst);
  }
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
  // o satélite nítido espera o pouso (o fundo cobre o caminho); sem o fundo, carrega como no voo do Leaflet
  const quietaSat = v => { if (sat) { sat._quieto = v; sat.options.updateWhenZooming = !v; } };
  // no voo, o que tem a nitidez de um nível só e fica preso num retângulo (o nível do satélite de antes do voo, o canvas
  // dos vizinhos e o das divisas e nomes) sai aos poucos quando encolhe a menos da metade (na ida: era um recorte nítido
  // encolhendo no meio do fundo borrado); o nível do satélite sai também quando fica mais borrado que o fundo (na volta, o
  // do estado inteiro esticado). Por baixo fica o fundo, inteiro. Voltam no pouso
  // (os panes de agora, no começo de cada voo: os dos selecionados, selecionados.js, entram depois da carga)
  const paneSat = map.getPane('tilePane'), idaDe = () => ['vizinhos', 'divisas', 'sel-rede', 'sel-eq', 'sel-realce'].map(n => map.getPane(n)).filter(Boolean);
  let panesIda = idaDe();
  const opPane = (p, o) => { const v = o >= 1 ? '' : String(Math.max(0, o)); if (p.style.opacity !== v) { p.style.transition = 'none'; p.style.opacity = v; } };
  function apagaNoVoo(z) {
    const ida = Math.max(0, Math.min(1, (Math.pow(2, z - voo.z0) - 0.3) / 0.3));
    let o = 1;
    if (sat && sat._quieto && fundoPronto() && sat._tileZoom !== undefined) {
      o = Math.max(0, Math.min(1, (Math.pow(2, z - sat._tileZoom) - 0.3) / 0.3));
      if (sat._tileZoom < fundo._r.z) o = Math.min(o, Math.max(0, Math.min(1, 1 - (z - sat._tileZoom - 0.3) / 0.5)));
    }
    opPane(paneSat, o);
    panesIda.forEach(p => opPane(p, ida));
  }
  // fim do voo (pouso ou interrompido): o satélite volta a carregar (antes do fim do movimento: ele pede os quadros da
  // vista nova) e os rótulos voltam, aparecendo aos poucos, numa tarefa depois (o quadro do pouso fica mais leve)
  let tPouso = 0;
  function soltaRotulos() {
    panesIda.forEach(p => opPane(p, 1));
    mc.classList.remove('vto-voando');
    mc.classList.add('vto-pouso');
    clearTimeout(tPouso);
    tPouso = setTimeout(() => mc.classList.remove('vto-pouso'), 300);
  }
  // (o canvas da rede é desenhado em fatias, alimentador.js: ela volta quando a vista do pouso está nele, não esticada)
  function redeVolta() {
    const volta = () => {
      if (paneRede.style.opacity === '' || voo) return;
      paneRede.style.transition = calmo() ? 'none' : 'opacity .24s var(--ease,ease)';
      paneRede.style.opacity = '';
    };
    if (renRede && renRede._alQuando) renRede._alQuando(volta); else volta();
  }
  // quem interrompe o voo (arrasto, roda, pinça, outra vista) passa pelo map._stop(): o voo acaba ali, sem pouso
  const para0 = map._stop;
  map._stop = function () {
    if (voo && this._flyToFrame) { const f = fimVoo; voo = null; fimVoo = null; quietaSat(false); opPane(paneSat, 1); soltaRotulos(); redeVolta(); f(); }
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
      const dur = Math.min(1800, Math.max(1200, 900 + 150 * Math.abs(zAlvo - z0))), t0 = performance.now();
      const fr = dt => Math.max(0, Math.min(1, (performance.now() + dt - t0) / dur));
      leZm();
      voo = {
        z: zAlvo, z0, paraEstado: zEst !== null && zAlvo <= zEst + 0.5, solto: false,
        // a vista (centro, zoom) daqui a s segundos; e a primeira, adiante, a dz níveis de zoom da de agora (ou a do pouso)
        adiante: s => em(curva(fr(s * 1000))),
        passo: dz => { const z = map.getZoom(), a = fr(0); for (let i = 1; i <= 40; i++) { const u = Math.min(1, a + i * 0.025), v = em(curva(u)); if (u >= 1 || Math.abs(v[1] - z) >= dz) return v; } return em(1); }
      };
      fimVoo = res;
      panesIda = idaDe();
      if (fundoPronto()) quietaSat(true); else if (PINTOR) PINTOR.postMessage({ t: 'pressa' });
      mc.classList.add('vto-voando');
      clearTimeout(esperaViz);
      rotulo(zAlvo);
      map._moveStart(true, false);
      const passo = agora => {
        if (!voo) return;
        const tt = Math.max(0, Math.min(1, (agora - t0) / dur));
        if (tt < 1) {
          map._flyToFrame = requestAnimationFrame(passo);
          const [c, z] = em(curva(tt));
          if (sat && !voo.solto) {
            // o fundo chegou no meio do voo: o satélite espera; na volta, a 0,6 nível do pouso ele volta a carregar (os
            // quadros da vista de pouso estão no cache: o pouso já chega nítido, e não um borrão do fundo esticado)
            if (zAlvo > z0 && z >= zAlvo - 0.6) { voo.solto = true; quietaSat(false); }
            else if (!sat._quieto && fundoPronto()) quietaSat(true);
          }
          map._move(c, z, { flyTo: true });
          redeNoVoo(z);
          apagaNoVoo(z);
        } else {
          map._flyToFrame = null;
          voo = null; fimVoo = null;
          quietaSat(false);
          opPane(paneSat, 1);
          map._move(alvo, zAlvo)._moveEnd(true);
          redeVolta();
          setTimeout(soltaRotulos, 0);
          res();
        }
      };
      map._flyToFrame = requestAnimationFrame(passo);
    });
  }
  // no meio do voo, o botão já diz o destino contrário (rotulo): o toque segue o que ele diz
  function alterna() {
    let v;
    if (voo) v = voo.paraEstado ? vistaAl() : vistaEstado();
    else { minimo(); v = noEstado() ? vistaAl() : vistaEstado(); }
    if (!dados) carrega();
    return voa(v.center, v.zoom);
  }

  // ---------- botão ----------
  // ícones: o contorno do estado (dos pontos de TOCANTINS) e, na volta, um alvo
  const icone = (() => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    PTO.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const s = 19 / Math.max(x1 - x0, y1 - y0), ox = 12 - (x0 + x1) / 2 * s, oy = 12 - (y0 + y1) / 2 * s, n = Math.max(1, Math.round(PTO.length / 56));
    return 'M' + PTO.filter((p, i) => i % n === 0).map(([x, y]) => (x * s + ox).toFixed(1) + ' ' + (y * s + oy).toFixed(1)).join('L') + 'Z';
  })();
  const canto = document.createElement('div');
  canto.className = 'vto-canto ctl-card';
  canto.innerHTML = `<button type="button" class="vto-bt"><svg class="vto-uf" viewBox="0 0 24 24" aria-hidden="true"><path d="${icone}"/></svg>` +
    '<svg class="vto-alvo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg><span class="vto-tx"></span></button>';
  const bt = canto.firstChild, btTx = bt.querySelector('.vto-tx');
  box.append(canto);
  L.DomEvent.disableClickPropagation(canto);
  canto.addEventListener('click', e => e.stopPropagation());   // o clique não chega ao mapa (que limparia a seleção)
  bt.addEventListener('click', () => { alterna(); });
  // (sem z: no voo, o destino dele; parado, o zoom de agora)
  function rotulo(z) {
    const est = zEst !== null && (z === undefined ? (voo ? voo.z : map.getZoom()) : z) <= zEst + 0.5;
    const txt = est ? 'Voltar ao alimentador' : 'Tocantins';
    if (btTx.textContent === txt) return;
    btTx.textContent = txt;
    bt.classList.toggle('volta', est);
    bt.title = est ? `Voltar à vista do alimentador ${EU}` : 'Ver o Tocantins inteiro';
    bt.setAttribute('aria-label', est ? `Voltar ao alimentador ${EU}` : 'Ver o Tocantins inteiro');
  }
  minimo();
  rotulo();
  map.on('moveend', () => { if (!voo) rotulo(); });
  map.on('resize', () => { minimo(); rotulo(); });
  // afastou até o estado inteiro com o dedo (a pinça não passa pelo _limitCenter): a mesma visão do botão
  map.on('zoomend', () => {
    if (voo || zEst === null || map.getZoom() > zEst + 1e-6) return;
    const c = vistaEstado().center;
    if (map.latLngToContainerPoint(c).distanceTo(map.latLngToContainerPoint(map.getCenter())) < 8) return;
    map.panTo(c, { animate: !calmo(), duration: 0.45 });
  });

  // ---------- começo: depois da rede deste inteira no mapa, do painel e da lista de trechos inteira (a carga da página
  // não muda: medido no celular com a CPU 4× mais lenta, o começo daqui no meio da lista a atrasava; a lista que não
  // termina em 10 s não segura mais) ----------
  const depois = AL ? Promise.all([AL.rede, AL.pronto]).then(() => Promise.race([AL.lista, new Promise(r => setTimeout(r, 10000))])) : Promise.resolve();
  depois.then(() => {
    leZm();
    minimo();                                            // com os controles do mapa já no lugar (as folgas da vista do estado)
    rotulo();
    preCarrega();
    // os controles mudam de tamanho (camadas ligadas: as legendas; a barra de camadas que se arruma depois): a vista do
    // estado e o zoom mínimo de novo, uma vez por quadro
    if (window.ResizeObserver) {
      let q = 0;
      const ro = new ResizeObserver(() => {
        box.style.setProperty('--vto-w', canto.offsetWidth + 'px');
        if (!q) q = requestAnimationFrame(() => { q = 0; minimo(); rotulo(); });
      });
      box.querySelectorAll(':scope>.vto-canto,:scope>.tc-canto,:scope>.ctl-lgs,:scope>.barra-busca,:scope>.lp-cams,#classes,.ctl-cam').forEach(el => ro.observe(el));
    }
    const vez = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 200));
    vez(() => { carrega().then(() => vez(() => { leZm(); estado.vista(true); })); });
    vez(() => { comecouF = true; outros.vista(true); selCams.vista(true); });   // as camadas nos outros (as ligadas: baixa o arquivo de cada uma)
  });

  // para os testes e as medidas
  window.__visaoTO = {
    selLinhas: () => selLinhas(), selPode: () => !!(MODO && PINTOR) && !selFalhou(),
    // as camadas dos selecionados: os lidos de cada tipo, na tela, o canvas e a região
    sel: () => ({ dados: Object.fromEntries(Object.entries(SELD).map(([n, g]) => [n, Object.fromEntries(Object.entries(g).map(([c, x]) => [c, typeof x === 'object' ? { linhas: x.linhas, pontos: x.pontos, anos: x.anos.length } : x]))])),
      naTela: !paneS.hidden && !!selCams._r, r: selCams._r, linhas: selLinhas() }),
    alterna, noEstado, refaz, folgaTopo, controles, voando: () => !!voo, zAbre: () => vistaAl().zoom, zEstado: () => zEst, em: (x, y) => alvoEm(L.point(x, y), 7),
    estado: () => ({ dados: !!dados, linhas: dados ? dados.T1.ini.length + dados.T2.ini.length - 2 : 0, pontos: dados ? dados.pts : 0, mostra,
      opacidade: +paneE.style.opacity, forte: forteVisto, zMin: zm, zEstado: zEst, mascara: mascara._r && !mascara._c.hidden ? { k: mascara._r.k, w: mascara._r.w, h: mascara._r.h } : null,
      fundo: fundoPronto(), zFundo: fundoPronto() ? fundo._r.z : null, botao: btTx.textContent, modo: MODO }),
    // a imagem do fundo e os quadros dela (canto de cada um, px da imagem, 256 px): a conta da área sem imagem nos testes
    fundo: () => fundoPronto() ? { el: fundo._c, quadros: fundo._quadros } : null,
    // a visão do estado e os controles que ela evita (px do mapa)
    vistaEstado: () => { const v = vistaEstado(); return { c: [v.center.lat, v.center.lng], z: v.zoom, controles: controles() }; },
    // as camadas (medidas)
    // a Faixa nos outros: ligada, lida (o resumo do worker), na tela e o último desenho (cores, etiquetas, amostra)
    // as camadas nos outros: as ligadas, as lidas (o resumo do worker), na tela e o último desenho (cores, etiquetas,
    // losangos, amostras); faixa(): o mesmo, com o resumo da Faixa (o teste da fase 1)
    outros: () => ({ ligadas: ligadas(), fora: foraVisto, dados: Object.fromEntries(Object.entries(CAMS).filter(([, C]) => C.dados).map(([n, C]) => [n, { als: C.dados.cods.length, linhas: C.dados.linhas, pontos: C.dados.pontos, os: C.dados.os }])),
      naTela: !paneF.hidden && !!outros._r, r: outros._r, ultimo: outros._info || null }),
    faixa: () => { const d = CAMS.faixa.dados; return { ligada: ligada('faixa'), dados: d ? { als: d.cods.length, linhas: d.linhas, pontos: d.pontos, os: d.os, hoje: d.hoje } : null,
      naTela: ligada('faixa') && !!d && !paneF.hidden && !!outros._r, r: outros._r, ultimo: outros._info && outros._info.cores ? outros._info : null }; },
    _camadas: { estado, mascara, fundo, outros }
  };
})();
