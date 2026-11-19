// Mapa da página inicial: visão satélite do Tocantins (Ctrl+S, ⌘S no Mac), por cima de mapa-municipios.js e mapa-raiox.js
// (arquivo à parte para não mexer neles).
// - Ctrl+S abre e fecha de qualquer nível; Esc sobe um nível e, no Tocantins, fecha (o "Salvar página" do navegador não
//   abre). Na tela nova (central/) o atalho vale também com o foco fora do quadro do mapa (na casca), enquanto o mapa está
//   na tela.
// - Animação "dissolve + aproximação": o satélite nasce com a mesma área que o mapa dos municípios mostra (inclusive aproximado
//   num município; a altura corrigida para a projeção do mapa) e, enquanto o mapa se dissolve nele, voa suavemente até o
//   nível aberto. A volta é o inverso (o satélite vai até a área do mapa e se dissolve nele). Com prefers-reduced-motion,
//   sem animação.
// - O que mostra: a imagem de satélite (Esri World Imagery, ou a Google com a chave de assets/mapa-satelite.js), só o Tocantins
//   (fora do estado, a cor escura dos mapas, --mapbg) e o T1 e o T2 de todos os alimentadores (dados/vizinhos/estado.txt, o
//   mesmo da visão Tocantins do mapa do alimentador; os do índice que não estão nele, só alguns metros de rede no cadastro,
//   viram um ponto e também contam). Passar o mouse numa linha mostra o código do alimentador; clicar abre a página dele.
//   Arrastar e zoom livres, com o estado de limite.
// - A divisão do mapa dos municípios, nos mesmos níveis (pedido do usuário: "1- Regional, 2- Polo, 3- Municípios"):
//   Tocantins (o contorno das regionais, claro com sombra, e a bandeirinha de cada uma) › Regional (voo até ela; fora,
//   escurecido; cada polo com o contorno na cor dele, as mesmas do mapa dos municípios, e a bandeirinha) › Polo (as divisas
//   dos municípios e o nome de cada um) › Município (os alimentadores dele em destaque, os outros apagados; o nome, o
//   resumo, a lista e o link da página do município). Mouse numa área realça e mostra a dica; clique (ou toque) entra nela.
//   A trilha "Tocantins › Regional › Polo › Município" fica na barra da lupa, no lugar e no desenho da do mapa dos municípios.
//   As linhas de fora do nível ficam apagadas. Contornos convertidos uma vez (simplificados) e desenhados em canvas; no voo
//   entre níveis, num svg montado uma vez no começo do voo (a cada quadro só a escala e a mistura dos dois níveis).
// - Gestos livres leves (roda, arrasto, pinça, duplo clique, tela cheia): com o mapa em movimento, a máscara e os canvas da
//   divisão não são refeitos, só acompanham (o painel do mapa os leva no arrasto; no zoom, esticados pelo transform, como os
//   quadros do satélite) e são refeitos parados, um pouco depois (na roda seguida, só no último passo). As linhas T1/T2 são
//   desenhadas por um worker (o "pintor", OffscreenCanvas) a partir das partes que o Leaflet recorta aqui, e a imagem entra
//   num canvas "bitmaprenderer" de uma vez, enquanto a de antes fica esticada; depois de um arrasto que não sai da folga,
//   nada é refeito. O realce da linha embaixo do mouse vai num canvas pequeno à parte e o da área num svg: o mouse não faz
//   o navegador passar a limpo os canvas grandes. O mesmo desenho de antes, pixel a pixel, parado.
// - Sincronia com o mapa dos municípios: abre no nível que ele mostra (window.ARGOS_MAPA.nivel) e, ao fechar, ele vai direto
//   (sem voo, escondido embaixo do satélite) ao nível em que o satélite estava (ARGOS_MAPA.vai(…, semVoo)). Trocas de nível
//   feitas por fora com o satélite aberto (busca da barra, Voltar do navegador) o satélite acompanha.
// - Sem quadrados pretos: por baixo do satélite nítido, um fundo com os quadros de longe de todo o estado (um nível só,
//   baixado antes da animação começar); a animação também espera os quadros da vista de partida, e o voo entre níveis
//   já pede os quadros da chegada.
// - Leaflet (assets/leaflet/), o contorno do estado (dados/tocantins.js) e as linhas só são baixados no primeiro Ctrl+S: a
//   página inicial não fica mais pesada para abrir.
// - Raio-X (mapa-raiox.js, Ctrl+X) e satélite não ficam ligados juntos: Ctrl+S desliga o raio-X, e o raio-X ligado fecha o
//   satélite.
(function () {
  const M = window.MUN, alvo = document.getElementById('mapa-to'), eu = document.currentScript;
  const svg = alvo && alvo.querySelector('.mt-mapa svg'), caixa = svg && svg.parentNode;
  if (!M || !svg || !eu) return;
  const RAIZ = new URL('../', eu.src).href;              // a pasta do site (teste/)
  const calmo = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || alvo.classList.contains('mt-cheia');
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  // x = a·lon + b, y = c·lat + d: a projeção do mapa dos municípios (scripts/gera_trechos.py, PROJ_MUN)
  const PA = 112.8878, PB = 5722.7136, PC = -111.6377, PD = -574.6836;
  const COR = { T1: '#3b82f6', T2: '#22c55e' };          // as cores do T1 e do T2 da visão Tocantins do alimentador
  const DUR_ABRE = 1200, DUR_FECHA = 850;
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  const ATR = 'Imagem © Esri — Esri, Maxar, Earthstar Geographics';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const celular = () => caixa.clientWidth < 600;
  const barra = alvo.querySelector('.mt-barra');            // a barra da lupa (a trilha fica nela)

  // ---------- números e textos (os do mapa dos municípios) ----------
  const NF0 = new Intl.NumberFormat('pt-BR'), NF1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const porCod = Object.fromEntries(M.muns.map(m => [m.cod, m]));
  const kmTxt = m => NF1.format(m / 1000) + ' km';
  const kmMun = m => (m.als || []).reduce((s, a) => s + a.m, 0);
  const nAls = n => `${NF0.format(n)} alimentador${n === 1 ? '' : 'es'}`;
  // visão aberta no mapa dos municípios (NAE, Manutenção, Inspeção…): null é a NAE; recolhida a legenda, os números saem
  // (classe sem-nae no #mapa-to; aqui, o CSS esconde os selos)
  const vis = () => { try { return window.ARGOS_MAPA && window.ARGOS_MAPA.visao ? window.ARGOS_MAPA.visao() : null; } catch (e) { return null; } };
  const numGrupo = (ms, so) => { const v = vis(); if (v) return so ? v.num(v.grupo(ms.map(m => m.cod))) : v.txt(v.grupo(ms.map(m => m.cod))); const n = ms.reduce((s, m) => s + (m.nae || 0), 0); return so ? NF0.format(n) : NF0.format(n) + ' NAE'; };
  const valMun = m => { const v = vis(); return v ? v.mun(m.cod) || 0 : m.nae || 0; };
  const numMun = m => { const v = vis(); return v ? v.txt(v.mun(m.cod)) : NF0.format(m.nae || 0) + ' NAE'; };
  const numAl = (cod, m) => {                              // número do alimentador DENTRO do município (como na lista do mapa)
    const v = vis();
    if (v) return v.txt(v.al(cod, m.cod));
    const a = m.als.find(x => x.cod === cod);
    return a ? NF0.format(a.nm !== undefined ? a.nm || 0 : a.n || 0) + ' NAE' : '';
  };

  // ---------- carga sob demanda ----------
  const script = src => new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = falha;
    document.head.append(s);
  });
  const folha = href => new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = ok;
    document.head.append(l);
  });
  let libs = null, linhas = null;
  const carregaLibs = () => libs || (libs = Promise.all([
    window.L ? null : script(RAIZ + 'assets/leaflet/leaflet.js'),
    folha(RAIZ + 'assets/leaflet/leaflet.css'),
    Array.isArray(window.TOCANTINS) ? null : script(RAIZ + 'dados/tocantins.js'),
    window.ARGOS_SAT ? null : script(RAIZ + 'assets/mapa-satelite.js').catch(() => null),   // sem o arquivo: Esri
  ]).catch(e => { libs = null; throw e; }));
  // dados/vizinhos/estado.txt → [{cod, T1: [[lat, lon], ...] por linha, T2}] (o formato de visao-tocantins.js: por
  // alimentador, código, T1 e T2 separados por tabulação; cada classe, linhas separadas por espaço, com os pontos no
  // formato das polilinhas do Google, em 1e-4 grau, a diferença acumulando pelo arquivo inteiro)
  function decodifica(txt) {
    const out = [];
    let la = 0, lo = 0;
    for (const ln of txt.split('\n')) {
      if (!ln) continue;
      const cl = ln.split('\t'), r = { cod: cl[0], T1: [], T2: [] };
      ['T1', 'T2'].forEach((c, j) => {
        const s = cl[j + 1] || '', n = s.length;
        let i = 0, atual = [];
        const fecha = () => { if (atual.length > 1) r[c].push(atual); atual = []; };
        while (i < n) {
          if (s.charCodeAt(i) === 32) { fecha(); i++; continue; }
          let v = 0, sh = 0, b;
          do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
          la += v & 1 ? ~(v >> 1) : v >> 1;
          v = 0; sh = 0;
          do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32);
          lo += v & 1 ? ~(v >> 1) : v >> 1;
          atual.push([la / 1e4, lo / 1e4]);
        }
        fecha();
      });
      out.push(r);
    }
    return out;
  }
  // os alimentadores do índice sem linha no estado.txt (só alguns metros de rede no cadastro, abaixo do mínimo do gerador):
  // um ponto no centro da caixa deles (pt), para que todos apareçam e se contem
  const comPontos = (lista, als) => {
    if (!als) return lista;
    const tem = new Set(lista.map(a => a.cod));
    for (const [cod, v] of Object.entries(als)) {
      if (tem.has(cod) || !Array.isArray(v) || !(v.length >= 4) || v.slice(0, 4).some(x => typeof x !== 'number')) continue;
      lista.push({ cod, T1: [], T2: [], pt: [(v[0] + v[2]) / 2, (v[1] + v[3]) / 2] });
    }
    return lista;
  };
  const carregaLinhas = () => linhas || (linhas = fetch(RAIZ + 'dados/vizinhos/indice.json')
    .then(r => (r.ok ? r.json() : null))
    .then(j => (j && j.estado && j.estado[1] ? fetch(`${RAIZ}dados/vizinhos/estado.txt?v=${encodeURIComponent(j.estado[0])}`)
      .then(r => (r && r.ok ? r.text() : null)).then(t => comPontos(t ? decodifica(t) : [], j.als)) : []))
    .catch(() => []));

  // alimentadores do mapa (SE de cada um, para o balão), feito só no primeiro uso
  let als = null;
  const infoAl = cod => {
    if (!als) {
      als = new Map();
      M.muns.forEach(m => m.als.forEach(a => { if (!als.has(a.cod)) als.set(a.cod, { se: a.se }); }));
    }
    return als.get(cod) || {};
  };

  // ---------- estilo (entra no primeiro uso) ----------
  let comEstilo = false;
  function poeEstilo() {
    if (comEstilo) return;
    comEstilo = true;
    const css = document.createElement('style');
    css.textContent =
      '.mt-mapa>.st-sat{position:absolute;inset:0;z-index:4;overflow:hidden;border-radius:var(--r3,14px);background:var(--mapbg,#0f1417);' +
      'opacity:0;visibility:hidden;pointer-events:none;transition:none;transform-origin:50% 50%}' +
      '.sat-to .mt-mapa>.st-sat{visibility:visible;pointer-events:auto}' +
      '.st-sat .leaflet-container,.st-sat.leaflet-container{background:var(--mapbg,#0f1417);font:inherit;outline:0}' +
      // o nítido sem a soma de cores do Leaflet (plus-lighter): na emenda de dois quadros ela clareava uma linha; por baixo dele
      // há o fundo, então a emenda não fica escura
      '.st-sat .st-nitido img.leaflet-tile{mix-blend-mode:normal}' +
      // a lista do município aberto (busca-ativo.js) não fica por cima do satélite
      '.sat-to #ativo-res.lista-mun{visibility:hidden}' +
      '.st-sat .leaflet-control-attribution{background:var(--vidro,rgba(15,20,23,.82));color:var(--vidro-fg,#f3f4f4);font:11px/1.4 var(--f-body,sans-serif);border-top-left-radius:var(--r1,6px)}' +
      '.st-linhas{transition:opacity .45s var(--ease,ease)}' +
      // os outros elementos do mapa (nomes, bandeiras, cartões) saem como no raio-X; o Tela cheia e o "Abrindo…" ficam
      '.sat-to .mt-mapa>:not(svg):not(.mt-tc):not(.st-sat):not(.st-lado):not(.st-balao):not(.mt-abrindo){opacity:0;pointer-events:none}' +
      // com o satélite inteiro na tela, o mapa dos municípios embaixo dele não é pintado (nada de trabalho escondido)
      '.sat-to.st-cobre .mt-mapa>svg{visibility:hidden}' +
      // trilha: a do satélite no lugar da do mapa dos municípios (mesmo desenho); a legenda some no município, como lá
      '.sat-to .mt-barra .mt-polos:not(.st-trilha){display:none!important}#mapa-to:not(.sat-to) .st-trilha{display:none!important}' +
      'html #mapa-to.sat-to:not(.st-nmun) .mt-barra .mt-regs{display:block}html #mapa-to.sat-to.st-nmun .mt-barra .mt-regs{display:none}' +
      // fechando: o mapa dos municípios pula ao nível do satélite sem as transições dele (os polos não deslizam no dissolve)
      '.st-salto .mt-polo,.st-salto .mt-polo *,.st-salto .mt-regc,.st-salto .mt-nomes2,.st-salto .mt-nomes2 *,.st-salto .mt-selos,' +
      '.st-salto .mt-selos *,.st-salto .mt-bandeiras *{transition:none!important;animation:none!important}' +
      // coluna da esquerda: o aviso (legenda) e, no município, o cartão dele
      '.st-lado{position:absolute;left:12px;top:12px;z-index:7;display:grid;justify-items:start;gap:8px;max-width:calc(100% - 76px);pointer-events:none}' +
      '.st-lado[hidden]{display:none}.st-lado>*{pointer-events:auto}#mapa-to:not(.sat-to) .st-mun{display:none}' +
      '.st-aviso,.st-mun,.st-balao{color:var(--vidro-fg,#f3f4f4);background:var(--vidro,rgba(15,20,23,.82));' +
      'border:1px solid var(--vidro-borda,rgba(255,255,255,.12));box-shadow:var(--sh-vidro,0 2px 8px rgb(0 0 0 / .35));font:500 var(--t-sm,13px)/1.35 var(--f-body,sans-serif)}' +
      '.st-aviso{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;max-width:100%;padding:7px 12px;border-radius:var(--r2,10px)}' +
      '.st-aviso[hidden],.st-mun[hidden]{display:none}' +
      '.st-aviso b{font:700 var(--t-xs,12px)/1 var(--f-display,sans-serif);letter-spacing:.12em;text-transform:uppercase}' +
      '.st-aviso i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}' +
      '.st-aviso .st-tecla{color:var(--muted,#9aa4ab);font-size:var(--t-xs,12px)}' +
      // cartão do município aberto (o nome, o resumo, o link da página e a lista dos alimentadores)
      '.st-mun{display:grid;gap:5px;width:300px;max-width:100%;padding:11px 12px 12px;border-radius:var(--r2,10px)}' +
      '.st-mun-h{display:flex;align-items:center;gap:12px}.st-mun-h b{font:700 var(--t-xl,20px)/1.1 var(--f-display,sans-serif);letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.st-mun small{font:400 var(--t-xs,12px)/1.35 var(--f-body,sans-serif);color:var(--cartao-mute,#a9b2b8)}' +
      '.st-sel{margin-left:auto;flex:none;padding:2px 7px;border-radius:5px;background:var(--selo,#b8431f);color:#fff;font:700 var(--t-xs,12px)/1.2 var(--f-mono,monospace);font-style:normal;font-variant-numeric:tabular-nums}' +
      '.st-mun-x{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:3px}' +
      '.st-mun-a{display:inline-flex;align-items:center;min-height:32px;padding:0 11px;border-radius:var(--r1,6px);background:var(--selo,#b8431f);color:#fff;' +
      'font:600 var(--t-sm,13px)/1 var(--f-body,sans-serif);text-decoration:none;white-space:nowrap}.st-mun-a:hover{filter:brightness(1.12);text-decoration:none}' +
      '.st-mun-b{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 10px;border:1px solid var(--vidro-borda,rgba(255,255,255,.16));border-radius:var(--r1,6px);' +
      'background:transparent;color:var(--vidro-fg,#f3f4f4);font:500 var(--t-sm,13px)/1 var(--f-body,sans-serif);cursor:pointer}.st-mun-b:hover{background:var(--vidro-hover,rgba(255,255,255,.1))}' +
      '#mapa-to .st-mun-b svg{display:block;width:12px;height:12px;min-height:0;max-height:none;max-width:none;margin:0;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}' +
      '.st-mun-b[aria-expanded="true"] svg{transform:rotate(180deg)}' +
      '.st-mun-l{display:grid;gap:1px;max-height:min(260px,38svh);margin:2px -6px 0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.st-mun-l[hidden]{display:none}' +
      '.st-al{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1px 10px;width:100%;padding:6px;border:0;border-radius:var(--r1,6px);' +
      'background:none;color:var(--vidro-fg,#f3f4f4);text-align:left;font:inherit;cursor:pointer}.st-al:hover,.st-al:focus-visible,.st-al.on{background:var(--vidro-hover,rgba(255,255,255,.1))}' +
      '.st-al b{font:600 var(--t-sm,13px)/1.2 var(--f-mono,monospace)}.st-al em{grid-column:1;font:400 var(--t-xs,12px)/1.2 var(--f-body,sans-serif);font-style:normal;color:var(--cartao-mute,#a9b2b8)}' +
      '.st-al .st-sel{grid-row:span 2;grid-column:2}' +
      '.st-sat a:focus-visible,.st-lado :focus-visible{outline:2px solid var(--foco-mapa,#fde047);outline-offset:2px}' +
      // dica do mouse: o "cartão preto" do mapa dos municípios
      '.st-balao{position:absolute;z-index:8;display:grid;gap:1px;padding:8px 11px 9px;border-radius:var(--r1,6px);pointer-events:none;white-space:nowrap;' +
      'background:var(--cartao,#111314);color:var(--cartao-fg,#f2f3f2);border-color:var(--cartao-borda,rgba(255,255,255,.16));box-shadow:0 10px 24px -8px rgb(0 0 0 / .6)}' +
      '.st-balao[hidden]{display:none}.st-balao .h{display:flex;align-items:center;gap:12px}' +
      '.st-balao .h i{margin-left:auto;padding:2px 6px;border-radius:5px;background:var(--selo,#b8431f);color:#fff;font:700 var(--t-xs,12px)/1.2 var(--f-mono,monospace);font-style:normal;font-variant-numeric:tabular-nums}' +
      '.st-balao b{font:600 var(--t-md,14px)/1.2 var(--f-body,sans-serif)}.st-balao b.cod{font:600 var(--t-sm,13px)/1.2 var(--f-mono,monospace)}' +
      '.st-balao small{display:block;margin-top:3px;font:400 var(--t-xs,12px)/1.35 var(--f-body,sans-serif);color:var(--cartao-mute,#a9b2b8)}' +
      '.st-balao small.c{margin-top:6px;padding-top:6px;border-top:1px solid var(--cartao-borda,rgba(255,255,255,.16));color:var(--cartao-fg,#f2f3f2);opacity:.75}' +
      // bandeirinhas (regionais no Tocantins, polos na regional) e nomes dos municípios (polo): o desenho do mapa dos municípios
      '.st-mk{background:none;border:0}.st-band{position:absolute;left:0;top:0;width:0;height:0}' +
      '.st-card{position:absolute;display:grid;justify-items:center;gap:2px;margin:0;padding:5px 12px 6px;border:1px solid var(--cartao-borda,rgba(255,255,255,.16));' +
      'border-radius:var(--r2,10px);background:var(--cartao,#111314);color:var(--cartao-fg,#f2f3f2);box-shadow:0 8px 20px -8px rgb(0 0 0 / .55);font:inherit;' +
      'white-space:nowrap;cursor:pointer;pointer-events:auto;animation:mt-surge .3s ease-out}' +
      '.st-card b{font:700 var(--t-sm,13px)/1.1 var(--f-body,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--cartao-fg,#f2f3f2)}' +
      '.st-card i{font:700 var(--t-xs,12px)/1.2 var(--f-mono,monospace);font-style:normal;padding:2px 7px;border-radius:5px;background:var(--selo,#b8431f);color:#fff;font-variant-numeric:tabular-nums}' +
      '.st-card:hover{border-color:var(--selo,#b8431f);background:var(--cartao-2,#1c2124)}.st-card:focus-visible{outline:2px solid var(--foco-mapa,#fde047);outline-offset:2px}' +
      '.st-card.st-pc{gap:4px;padding:6px 12px 7px;box-shadow:inset 0 -3px 0 var(--c),0 8px 20px -8px rgb(0 0 0 / .55)}.st-card.st-pc:hover{border-color:var(--c)}' +
      '.st-sat .mt-fio,.st-sat .mt-pino,.st-sat .mt-mn{pointer-events:none}' +
      '@media (max-width:860px){.st-card{padding:4px 9px 5px;gap:3px}.st-card.st-pc{padding:4px 9px 5px;gap:3px}.st-card b{font-size:10.5px;letter-spacing:.06em}.st-card i{font-size:9.5px;padding:1px 5px}}' +
      '.sem-nae .st-card i,.sem-nae .st-sat .mt-mn i,.sem-nae .st-balao .h i,.sem-nae .st-lado .st-sel{display:none}' +
      // celular: o aviso em coluna, só o nome e as cores (sem teclado; o resto não cabe sem cobrir a ponta norte do estado);
      // nos níveis, numa linha só (a trilha já diz onde se está)
      '@media (max-width:640px){.st-lado{left:8px;top:8px;gap:6px;max-width:calc(100% - 64px)}.st-aviso{flex-direction:column;align-items:flex-start;gap:2px;padding:6px 10px}' +
      '.st-aviso .st-n,.st-aviso .st-tecla{display:none}.st-lado.st-niv .st-aviso{flex-direction:row;align-items:center;gap:4px 10px}' +
      '.st-mun{width:auto;padding:9px 10px 10px;gap:4px}.st-mun-h b{font-size:var(--t-lg,17px)}.st-mun-l{max-height:30svh}.st-mun .st-mun-pr{display:none}' +
      '.st-sat .leaflet-control-attribution{font-size:9px}}' +
      '@media (prefers-color-scheme:light){:root:not([data-theme="dark"]) .st-aviso .st-tecla{color:#b9c1c6}}' +
      ':root[data-theme="light"] .st-aviso .st-tecla{color:#b9c1c6}' +
      '@media (prefers-reduced-motion:reduce){.st-card,.st-sat .mt-mn,.st-sat .mt-fio,.st-sat .mt-pino{animation:none}.st-mun-b svg{transition:none}}';
    document.head.append(css);
  }

  // ---------- telas: coluna (aviso e município), balão e trilha ----------
  let lado = null, aviso = null, cartaoMun = null, balao = null, trilha = null;
  function poeLado() {
    if (lado) return;
    lado = document.createElement('div');
    lado.className = 'st-lado';
    lado.hidden = true;
    aviso = document.createElement('div');
    aviso.className = 'st-aviso';
    aviso.setAttribute('role', 'status');
    cartaoMun = document.createElement('div');
    cartaoMun.className = 'st-mun';
    cartaoMun.setAttribute('role', 'group');
    cartaoMun.hidden = true;
    lado.append(aviso, cartaoMun);
    caixa.append(lado);
  }
  function poeAviso(html) {
    poeLado();
    aviso.innerHTML = html;
    aviso.hidden = !html;
    lado.hidden = !html && cartaoMun.hidden;
  }
  const TECLA0 = `${MAC ? '⌘S' : 'Ctrl+S'} ou Esc volta`, TECLA1 = `Esc sobe um nível · ${MAC ? '⌘S' : 'Ctrl+S'} volta`;
  function legenda() {
    let n = '';
    if (!niv.reg) n = nLinhas ? `${nLinhas.toLocaleString('pt-BR')} alimentadores` : 'carregando as linhas…';
    else if (!niv.mun && escopo) n = `${nAls(escopo.size)} ${niv.pol ? 'no polo' : 'na regional'}`;
    return `<b>Satélite</b>${n ? `<span class="st-n">${n}</span>` : ''}` +
      `<span><i style="background:${COR.T1}"></i>T1</span><span><i style="background:${COR.T2}"></i>T2</span><span class="st-tecla">${niv.reg ? TECLA1 : TECLA0}</span>`;
  }

  // ---------- divisão: regionais, polos e municípios (window.MUN), feita uma vez no primeiro Ctrl+S ----------
  // cada área: anéis com os pontos do mapa dos municípios (s, inteiros, para saber o que está embaixo do mouse) e, para
  // desenhar, os mesmos simplificados (~110 m) e já projetados no Mercator do Leaflet no zoom 0 (w); a caixa (bx, nas
  // unidades do mapa dos municípios; b, em lat/lon); o ponto do nome (rot, lat/lon)
  let D = null;
  const setD = x => { D = x; };
  const svgLL = (x, y) => [(y - PD) / PC, (x - PB) / PA];
  const CORES = ['a', 'b', 'c', 'd'];
  function simplifica(p, tol) {                            // Douglas-Peucker (anel fechado: o 1º corte no ponto mais longe do 1º)
    const n = p.length;
    if (n < 6) return p;
    const t2 = tol * tol, fica = new Uint8Array(n), pilha = [[0, n - 1]];
    fica[0] = fica[n - 1] = 1;
    while (pilha.length) {
      const [a, b] = pilha.pop(), ax = p[a][0], ay = p[a][1], dx = p[b][0] - ax, dy = p[b][1] - ay, L2 = dx * dx + dy * dy;
      let mx = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const x = p[i][0] - ax, y = p[i][1] - ay, t = L2 ? Math.max(0, Math.min(1, (x * dx + y * dy) / L2)) : 0;
        const d2 = (x - t * dx) ** 2 + (y - t * dy) ** 2;
        if (d2 > mx) { mx = d2; mi = i; }
      }
      if (mx > t2) { fica[mi] = 1; pilha.push([a, mi], [mi, b]); }
    }
    return p.filter((_, i) => fica[i]);
  }
  // os contornos de M.regs e M.pols são trechos soltos (M x,y L x,y): encadeados, viram os anéis fechados de cada área
  function encadeia(d) {
    const segs = [], adj = new Map();
    for (const s of String(d || '').split('M')) { if (!s) continue; const p = s.split('L'); for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]); }
    segs.forEach((s, i) => s.forEach(k => { let a = adj.get(k); if (!a) adj.set(k, a = []); a.push(i); }));
    const usado = new Uint8Array(segs.length), out = [];
    for (let i = 0; i < segs.length; i++) {
      if (usado[i]) continue;
      usado[i] = 1;
      const anel = [segs[i][0], segs[i][1]];
      let cur = segs[i][1];
      while (cur !== anel[0]) {
        const j = (adj.get(cur) || []).find(x => !usado[x]);
        if (j === undefined) break;
        usado[j] = 1;
        cur = segs[j][0] === cur ? segs[j][1] : segs[j][0];
        anel.push(cur);
      }
      if (anel.length > 3) out.push(anel.map(k => k.split(',').map(Number)));
    }
    return out;
  }
  const aneisD = d => String(d || '').split('M').filter(Boolean).map(s => s.replace(/Z/g, '').split('L').map(k => k.split(',').map(Number))).filter(a => a.length > 2);
  function area(aneis) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const out = aneis.map(s => {
      s.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
      const q = simplifica(s, 0.12), w = new Float64Array(q.length * 2);
      q.forEach(([x, y], i) => { const pt = map.project(L.latLng(svgLL(x, y)), 0); w[2 * i] = pt.x; w[2 * i + 1] = pt.y; });
      return { s, w };
    });
    return { aneis: out, bx: [x0, y0, x1, y1], b: L.latLngBounds(svgLL(x0, y1), svgLL(x1, y0)) };
  }
  function dentro(a, x, y) {                               // ponto (unidades do mapa dos municípios) dentro da área (par/ímpar)
    const [x0, y0, x1, y1] = a.bx;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    let d = false;
    for (const { s: P } of a.aneis) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
    }
    return d;
  }
  function borda(a, x, y) {                                // distância até a borda (unidades do mapa)
    let m = Infinity;
    for (const { s: P } of a.aneis) for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
      m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return m;
  }
  function pontoDentro(a, c) {                             // o ponto sugerido, se cair dentro; senão o da grade mais longe da borda
    if (c && dentro(a, c[0], c[1])) return c;
    const [x0, y0, x1, y1] = a.bx, N = 16;
    let melhor = null, md = -1;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N;
      if (!dentro(a, x, y)) continue;
      const d = borda(a, x, y);
      if (d > md) { md = d; melhor = [x, y]; }
    }
    return melhor || [(x0 + x1) / 2, (y0 + y1) / 2];
  }
  const meio = ms => {                                     // município mais perto do meio do grupo (como no mapa dos municípios)
    const mx = ms.reduce((s, m) => s + m.c[0], 0) / ms.length, my = ms.reduce((s, m) => s + m.c[1], 0) / ms.length;
    return ms.reduce((a, b) => Math.hypot(b.c[0] - mx, b.c[1] - my) < Math.hypot(a.c[0] - mx, a.c[1] - my) ? b : a);
  };
  const alsDe = ms => new Set([].concat(...ms.map(m => (m.als || []).map(a => a.cod))));
  // o ponto do nome (rot), feito só quando alguém pede (nomes do polo, cartão sem lugar): no 1º Ctrl+S, a busca do ponto
  // de todas as áreas era trabalho à toa antes da animação
  const rotDe = (a, c) => { let r = null; Object.defineProperty(a, 'rot', { get: () => r || (r = svgLL(...pontoDentro(a, c()))), configurable: true }); };
  // (no 1º Ctrl+S, aos pedaços de ~8 ms: numa tarefa só, travava a página uns 100 ms no celular antes de o satélite aparecer)
  async function divisao() {
    if (!D) setD(await montaDivisao({ reg: {}, pol: {}, mun: {}, regs: [] }));
    return D;
  }
  async function montaDivisao(D) {                         // (D: a divisão em construção; a de fora só no fim)
    let t0 = performance.now();
    const respira = async () => { if (performance.now() - t0 > 8) { await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); } };
    for (const m of M.muns) {
      const a = area(aneisD(m.d));
      a.tipo = 'mun'; a.nome = m.nome; a.m = m; rotDe(a, () => m.c);
      D.mun[m.cod] = a;
      await respira();
    }
    const ordem = [];                                      // polos na ordem em que aparecem (a dos grupos de mapa-municipios.js)
    M.muns.forEach(m => { if (m.polo && !ordem.includes(m.polo)) ordem.push(m.polo); });
    for (const p of ordem) {
      await respira();
      const ms = M.muns.filter(m => m.polo === p), aneis = encadeia((M.pols || {})[p]);
      const a = area(aneis.length ? aneis : [].concat(...ms.map(m => D.mun[m.cod].aneis.map(x => x.s))));
      Object.assign(a, { tipo: 'pol', nome: p, reg: ms[0].reg, ms, als: alsDe(ms), cor: 'a' });
      rotDe(a, () => meio(ms).c);
      D.pol[p] = a;
    }
    for (const r of Object.keys(M.regs || {})) {
      await respira();
      const ms = M.muns.filter(m => m.reg === r);
      if (!ms.length) continue;
      const a = area(encadeia(M.regs[r]));
      // cor de cada polo como na regional aberta do mapa dos municípios (entra): os polos na ordem do mapa, de cima para baixo
      // ou da esquerda para a direita (o eixo em que eles mais se espalham), polo-a, -b, -c, -d
      const une = (u, b) => !u ? b.slice() : [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])];
      const ps = ordem.filter(p => D.pol[p].reg === r).map(p => {
        const b = D.pol[p].ms.reduce((u, m) => une(u, D.mun[m.cod].bx), null);
        return { p, cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 };
      });
      const vai = k => Math.max(...ps.map(q => q[k])) - Math.min(...ps.map(q => q[k]));
      const eixo = vai('cy') >= vai('cx') ? 'cy' : 'cx';
      ps.sort((x, y) => x[eixo] - y[eixo]);
      ps.forEach((q, i) => { D.pol[q.p].cor = CORES[i % CORES.length]; });
      Object.assign(a, { tipo: 'reg', nome: r, ms, als: alsDe(ms), polos: ps.map(q => q.p) });
      rotDe(a, () => meio(ms).c);
      D.reg[r] = a;
      D.regs.push(a);
    }
    return D;
  }
  const corPolo = p => getComputedStyle(caixa).getPropertyValue('--polo-' + ((D && D.pol[p] && D.pol[p].cor) || 'a')).trim() || '#3d8fe0';
  const corCss = p => `var(--polo-${(D && D.pol[p] && D.pol[p].cor) || 'a'})`;
  function munEm(ll) {                                     // município embaixo do ponto (lat/lon)
    const x = PA * ll.lng + PB, y = PC * ll.lat + PD;
    for (const m of M.muns) if (dentro(D.mun[m.cod], x, y)) return m;
    return null;
  }

  // ---------- nível aberto ----------
  const NIV0 = { reg: null, pol: null, mun: null };
  let niv = NIV0, nivAntes = NIV0, mistura = 1, voandoN = false, escopo = null;
  function valida(n) {                                     // {reg, pol, mun} coerente com os dados (o que não bate fica de fora)
    const m = n && n.mun && porCod[n.mun];
    if (m) return { reg: m.reg, pol: m.polo, mun: m.cod };
    const p = n && n.pol && D && D.pol[n.pol];
    if (p) return { reg: p.reg, pol: p.nome, mun: null };
    const r = n && n.reg && D && D.reg[n.reg];
    return r ? { reg: r.nome, pol: null, mun: null } : NIV0;
  }
  const igual = (a, b) => (a.reg || null) === (b.reg || null) && (a.pol || null) === (b.pol || null) && (a.mun || null) === (b.mun || null);
  const areaDe = n => !n.reg ? null : n.mun ? D.mun[n.mun] : n.pol ? D.pol[n.pol] : D.reg[n.reg];
  const sobeDe = n => n.mun ? { reg: n.reg, pol: n.pol } : n.pol ? { reg: n.reg } : NIV0;

  // ---------- o mapa de satélite (criado no primeiro Ctrl+S) ----------
  let L = null, map = null, caixaSat = null, fundo = null, nitido = null, mascara = null, desenho = null, rend = null, paneL = null;
  let TO = null, limTO = null, grupos = new Map(), nLinhas = 0, sobre = null, semRede = new Set();
  // a área que o mapa dos municípios mostra agora, no tamanho da caixa: centro, zoom (o mesmo px por grau de longitude) e a
  // correção da altura (o mapa dos municípios é proporcional em graus; o satélite, Mercator)
  function vistaDoSvg() {
    const ctm = svg.getScreenCTM(), r = caixa.getBoundingClientRect();
    if (!ctm || !r.width) return null;
    const p = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(ctm.inverse());
    const lat = (p.y - PD) / PC, lon = (p.x - PB) / PA;
    return { c: L.latLng(lat, lon), z: Math.log2(ctm.a * PA * 360 / 256), k: (-PC * Math.cos(lat * Math.PI / 180)) / PA };
  }
  const folga = () => (celular() ? 14 : 28);
  function vistaDoEstado() {
    const f = folga(), cz = map._getBoundsCenterZoom(limTO, { padding: L.point(f, f) });
    return { c: cz.center, z: cz.zoom, k: 1 };
  }
  // retângulos (px da caixa do satélite) do que fica por cima do mapa: a coluna da esquerda, o Tela cheia e os créditos
  function ocupados() {
    const c = caixa.getBoundingClientRect(), out = [];
    [aviso, cartaoMun, caixa.querySelector('.mt-tc'), map && map.attributionControl && map.attributionControl.getContainer()].forEach(e => {
      if (!e || e.hidden || !e.getClientRects().length) return;
      const q = e.getBoundingClientRect();
      if (q.width) out.push({ left: q.left - c.left, top: q.top - c.top, right: q.right - c.left, bottom: q.bottom - c.top });
    });
    return out;
  }
  // enquadramento do nível: a área com folga, livre da coluna da esquerda (de lado ou embaixo dela, o que der o zoom maior)
  // e, na regional, com espaço em cima para as bandeirinhas dos polos
  function vistaDoNivel(n) {
    const a = areaDe(n);
    if (!a) return vistaDoEstado();
    const f = folga(), cel = celular(), topo = n.reg && !n.pol ? (cel ? 30 : 44) : 0;
    const col = [aviso, cartaoMun].filter(e => e && !e.hidden && lado && !lado.hidden && e.getClientRects().length)
      .map(e => e.getBoundingClientRect()), c = caixa.getBoundingClientRect();
    const opc = [];
    if (col.length) {
      const dir = Math.max(...col.map(q => q.right)) - c.left, pe = Math.max(...col.map(q => q.bottom)) - c.top;
      opc.push([[Math.max(f, dir + 12), f + topo], [f, f]], [[f, Math.max(f + topo, pe + 10)], [f, f]]);
    } else opc.push([[f, f + topo], [f, f]]);
    // (o 1º que couber; o de baixo da coluna, centrado, a não ser que o do lado aproxime bem mais)
    const t = map.getSize();
    let best = null;
    opc.reverse().forEach(([tl, br], i) => {
      if (t.x - tl[0] - br[0] < 120 || t.y - tl[1] - br[1] < 120) return;
      const cz = map._getBoundsCenterZoom(a.b, { paddingTopLeft: L.point(tl), paddingBottomRight: L.point(br) });
      if (!isFinite(cz.zoom)) return;
      if (!best || cz.zoom > best.zoom + (i ? 0.3 : 0)) best = cz;
    });
    if (!best) best = map._getBoundsCenterZoom(a.b, { padding: L.point(f, f) });
    return { c: best.center, z: Math.max(vistaDoEstado().z, Math.min(13.5, best.zoom)), k: 1 };
  }
  // Esri: onde não há foto num zoom o servidor responde 404 (blankTile=false) e o quadro vira a foto do nível de cima ampliada
  // (como em mapa_trechos.html); quadro inteiro fora da caixa do estado nem é pedido
  function camadas(google) {
    const noTO = function (c) {
      const tb = this._tileCoordsToBounds(c);
      return L.TileLayer.prototype._isValidTile.call(this, c) && limTO.intersects(tb);
    };
    let Base;
    if (google) {
      Base = L.TileLayer.extend({ _isValidTile: noTO });
    } else {
      Base = L.TileLayer.extend({
        getTileUrl: c => `${SAT}${c.z}/${c.y}/${c.x}?blankTile=false`,
        _isValidTile: noTO,
        createTile(c, done) { const t = L.TileLayer.prototype.createTile.call(this, c, done); t._xyz = c; t._k = 0; return t; },
        _tileOnError(done, t, e) {
          const c = t._xyz, k = ++t._k;
          if (!c || k > 6 || c.z - k < 0) return L.TileLayer.prototype._tileOnError.call(this, done, t, e);
          const f = 2 ** k, n = 256 * f, x = (c.x % f) * 256, y = (c.y % f) * 256;
          Object.assign(t.style, { width: n + 'px', height: n + 'px', marginLeft: -x + 'px', marginTop: -y + 'px', mixBlendMode: 'normal',
            clipPath: `inset(${y}px ${n - x - 256}px ${n - y - 256}px ${x}px)` });
          t.src = `${SAT}${c.z - k}/${c.y >> k}/${c.x >> k}?blankTile=false`;
        },
      });
    }
    const url = google || SAT + '{z}/{y}/{x}';
    // nítido: quieto na animação (só os quadros do pouso, como o voo do Leaflet)
    const Nitido = Base.extend({ _onMoveEnd() { if (!this._quieto) L.TileLayer.prototype._onMoveEnd.call(this); } });
    // fundo: um nível só (o mais perto do zoom do estado), com todos os quadros do estado carregados, seja qual for a vista
    const zf = Math.max(5, Math.min(8, Math.round(vistaDoEstado().z + 0.2)));
    const Fundo = Base.extend({
      _getTiledPixelBounds() {
        const z = this._tileZoom;
        return L.bounds(this._map.project(limTO.getNorthWest(), z), this._map.project(limTO.getSouthEast(), z));
      },
    });
    const atr = google ? '' : ATR;
    fundo = new Fundo(url, { minNativeZoom: zf, maxNativeZoom: zf, maxZoom: 22, updateWhenZooming: false, keepBuffer: 0, attribution: atr }).addTo(map);
    nitido = new Nitido(url, { maxZoom: 22, maxNativeZoom: google ? 20 : 18, updateWhenZooming: false, attribution: atr, className: 'st-nitido' }).addTo(map);
    nitido._google = !!google;
  }
  // voo entre níveis: os quadros nítidos da chegada já começam a vir no começo do voo (o navegador guarda; no pouso o Leaflet
  // os acha prontos). Os mesmos quadros que o Leaflet pediria (o zoom inteiro mais perto, a vista da chegada), só os do estado
  const pedidos = new Set();
  function preBaixa(v) {
    if (!nitido || nitido._google) return;
    const tz = Math.min(18, Math.round(v.z)), s = Math.pow(2, tz - v.z), meio = map.project(v.c, tz), t = map.getSize().multiplyBy(s / 2);
    const a = meio.subtract(t).divideBy(256).floor(), b = meio.add(t).divideBy(256).ceil().subtract([1, 1]);
    let n = 0;
    for (let y = a.y; y <= b.y && n < 60; y++) for (let x = a.x; x <= b.x && n < 60; x++) {
      const c = L.point(x, y);
      c.z = tz;
      if (!limTO.intersects(nitido._tileCoordsToBounds(c))) continue;
      const u = `${SAT}${tz}/${y}/${x}?blankTile=false`;
      n++;
      if (pedidos.has(u)) continue;
      pedidos.add(u);
      const im = new Image();
      im.decoding = 'async';
      im.src = u;
    }
  }
  // Google (Map Tiles API) com a chave de assets/mapa-satelite.js, como na página Podas; sem chave ou com erro, a Esri
  async function urlGoogle() {
    const key = (window.ARGOS_SAT && window.ARGOS_SAT.google) || '';
    if (!key) return '';
    try {
      const K = 'argos-gtiles';
      let s = null;
      try { s = JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) { s = null; }
      if (!(s && s.key === key && s.expiry * 1000 > Date.now() + 36e5)) {
        const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(key), { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapType: 'satellite', language: 'pt-BR', region: 'BR' }) });
        if (!r.ok) throw new Error('sessão ' + r.status);
        const j = await r.json();
        s = { key, session: j.session, expiry: +j.expiry };
        try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) { /* sem armazenamento */ }
      }
      if (map) map.attributionControl.addAttribution('Imagem © Google');
      return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${s.session}&key=${encodeURIComponent(key)}`;
    } catch (e) { return ''; }
  }
  // a vista do mapa como texto (tamanho, zoom, origem dos pixels e posição do painel): o Leaflet dispara 'zoom' e 'move' no
  // mesmo passo; com a vista igual à do último desenho, não se desenha de novo
  const chaveVista = () => { const t = map.getSize(), po = map.getPixelOrigin(), pp = map._getMapPanePos(); return `${t.x},${t.y},${map.getZoom()},${po.x},${po.y},${pp.x},${pp.y}`; };
  // ---------- desenhos que andam com o mapa (máscara, véu e contornos) ----------
  // Cada um é feito para uma vista (v: o zoom z e o canto x, y em px do mundo nesse zoom, tamanho w × h, com folga em volta
  // da caixa) e, com o mapa em movimento (arrasto, pinça, fim do zoom animado, voo), só acompanha: no arrasto o painel do
  // mapa já o leva; com o zoom mudando, é esticado pelo transform (como os quadros do satélite e o canvas das linhas). Era o
  // que mais pesava nos gestos: a máscara e os dois canvas eram refeitos (e enviados de novo ao compositor) a cada quadro do
  // arrasto e da pinça. Refeito só quando a folga acaba (a caixa sairia do desenho) ou esticado demais (z), e parado: no
  // fim do movimento, um pouco depois (na roda seguida, só o do último passo), se o zoom mudou ou a folga ficou curta.
  // estica(v, els, f): devolve a escala e se o desenho cobre a caixa com folga f (fração da caixa)
  function estica(v, els, f = 0) {
    const s = map.getZoomScale(map.getZoom(), v.z), po = map.getPixelOrigin(), pp = map._getMapPanePos(), t = map.getSize();
    if (els) { const o = L.point(v.x * s - po.x, v.y * s - po.y); els.forEach(e => L.DomUtil.setTransform(e, o, s)); }
    const vx = po.x - pp.x, vy = po.y - pp.y, fx = t.x * f, fy = t.y * f;
    return { s, cobre: v.x * s <= vx - fx && v.y * s <= vy - fy && (v.x + v.w) * s >= vx + t.x + fx && (v.y + v.h) * s >= vy + t.y + fy };
  }
  const ESTICA = 1.6;                                     // (mais que isso, o traço engrossa e a borda borra: refaz)
  const parado = (v, f) => v.z === map.getZoom() && estica(v, null, f).cobre;
  // refaz um pouco depois do fim do movimento (cancelado por outro movimento)
  function adiado(faz) {
    let t = 0, q = 0;
    const cancela = () => { clearTimeout(t); cancelAnimationFrame(q); t = q = 0; };
    return { cancela, pendente: () => !!(t || q), agenda() { cancela(); t = setTimeout(() => { t = 0; q = requestAnimationFrame(() => { q = 0; if (map && !map._animatingZoom && estado !== 'off') faz(); }); }, 60); } };
  }
  // máscara: fora do Tocantins, a cor escura dos mapas. Um svg no tamanho da caixa com folga de meia caixa em volta (568
  // pontos, já projetados no zoom 0: cada ponto é uma conta; a cor lida só na abertura e na troca do tema, sem o estilo da
  // página recalculado a cada quadro); na animação do zoom do Leaflet, estica junto com os quadros (como as camadas de imagem)
  function criaMascara() {
    const pane = map.createPane('st-mascara');
    pane.style.zIndex = 250;                               // acima do satélite (200), abaixo das linhas (400)
    pane.style.pointerEvents = 'none';
    const NS = 'http://www.w3.org/2000/svg', el = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    el.setAttribute('class', 'leaflet-zoom-animated');
    el.style.cssText = 'display:block;margin:0;min-height:0;max-width:none;max-height:none;overflow:visible';   // (sem o .mt-mapa svg do site.css)
    path.setAttribute('fill-rule', 'evenodd');
    path.style.filter = 'drop-shadow(0 0 3px rgba(0,0,0,.55))';   // a borda: uma sombra leve, como na visão Tocantins do alimentador
    el.append(path);
    pane.append(el);
    let caixaM = null, chave = '', corM = '', vM = null;
    const cor = () => getComputedStyle(caixa).getPropertyValue('--mapbg').trim() || '#0f1417';
    const TO0 = TO.map(anel => anel.map(ll => map.project(ll, 0)));   // o contorno no zoom 0
    const depois = adiado(() => desenha());
    const desenha = forca => {                              // forca (true): mesmo com a vista igual (tema, abertura)
      if (!map || map._animatingZoom) return;
      const ch = chaveVista();
      if (forca !== true && ch === chave) return;
      chave = ch;
      depois.cancela();
      const t = map.getSize(), m = 0.5, x0 = -t.x * m, y0 = -t.y * m, w = t.x * (1 + 2 * m), h = t.y * (1 + 2 * m);
      caixaM = L.latLngBounds(map.containerPointToLatLng([x0, y0]), map.containerPointToLatLng([x0 + w, y0 + h]));
      L.DomUtil.setPosition(el, map.containerPointToLayerPoint([x0, y0]));
      el.setAttribute('width', w); el.setAttribute('height', h);
      el.style.width = w + 'px'; el.style.height = h + 'px';
      // (o ponto da tela como o do Leaflet, latLngToContainerPoint: o projetado arredondado, menos a origem, mais o painel)
      const k = Math.pow(2, map.getZoom()), po = map.getPixelOrigin(), pp = map._getMapPanePos(), dx = pp.x - po.x - x0, dy = pp.y - po.y - y0;
      let d = `M0,0H${w.toFixed(0)}V${h.toFixed(0)}H0Z`;
      for (const anel of TO0) d += 'M' + anel.map(p => (Math.round(p.x * k) + dx).toFixed(1) + ',' + (Math.round(p.y * k) + dy).toFixed(1)).join('L') + 'Z';
      path.setAttribute('d', d);
      if (forca === true || !corM) { corM = cor(); path.setAttribute('fill', corM); }
      vM = { z: map.getZoom(), x: x0 - pp.x + po.x, y: y0 - pp.y + po.y, w, h };
    };
    // em movimento, só acompanha; refaz se a caixa sair do desenho ou esticar demais
    map.on('zoom move', () => {
      if (!map || map._animatingZoom || !vM) return;
      const r = estica(vM, [el]);
      if (!r.cobre || r.s > ESTICA) desenha();
    });
    map.on('moveend', () => { if (vM && !parado(vM, 0.2)) depois.agenda(); });   // parado: o desenho da vista de agora
    map.on('viewreset resize', desenha);
    map.on('zoomanim', e => {
      if (!caixaM || !vM) return;
      depois.cancela();
      chave = '';                                           // (esticado: o próximo passo desenha de novo)
      const s = map.getZoomScale(e.zoom, vM.z), o = map._latLngBoundsToNewLayerBounds(caixaM, e.zoom, e.center).min;
      L.DomUtil.setTransform(el, o, s);
    });
    new MutationObserver(() => desenha(true)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => desenha(true)); } catch (e) { /* navegador antigo */ }
    return { desenha, pendente: depois.pendente };
  }
  // divisão desenhada em dois canvas no tamanho da caixa (com folga de um quarto em volta), refeitos a cada movimento (os
  // anéis já projetados no zoom 0: cada ponto é uma conta) e, na animação do zoom do Leaflet, esticados como os quadros:
  // - véu (abaixo das linhas): fora do nível aberto, a cor escura dos mapas, mais leve que fora do estado; e o realce da
  //   área embaixo do mouse;
  // - contornos (acima das linhas): regionais (claro, com sombra), polos (na cor de cada um, por dentro: dois polos vizinhos
  //   mostram as duas cores, com um fio claro entre elas), divisas dos municípios (finas) e o município aberto (claro e
  //   forte: as cores dos polos azuis lembram o T1).
  // Na troca de nível, o desenho de antes e o de depois se misturam ao longo do voo (mistura, de 0 a 1). No voo, em vez dos
  // canvas, dois svg com o mesmo desenho (os dois níveis, montados uma vez no começo do voo, em coordenadas do zoom 0): a
  // cada quadro só mudam a escala (traço da mesma largura: non-scaling-stroke) e a opacidade de cada nível. Redesenhar os
  // canvas a cada quadro (e o navegador enviar os dois a cada quadro) era o que mais pesava no voo; no pouso os canvas
  // voltam, desenhados uma vez.
  const VEU = 0.66;
  let realceA = null;                                       // área realçada (a que o clique abre)
  function criaDesenho() {
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (nome, z) => {
      const p = map.createPane(nome);
      p.style.zIndex = z;
      p.style.pointerEvents = 'none';
      const cv = L.DomUtil.create('canvas', 'leaflet-zoom-animated', p);
      cv.style.pointerEvents = 'none';
      const sv = document.createElementNS(NS, 'svg');      // o do voo (escondido parado)
      sv.style.cssText = 'position:absolute;left:0;top:0;display:none;margin:0;min-height:0;max-width:none;max-height:none;overflow:hidden;pointer-events:none';
      p.append(sv);
      return { cv, ctx: cv.getContext('2d'), tam: '', sv };
    };
    const veu = mk('st-veu', 240), cont = mk('st-cont', 450), cvs = [veu, cont];
    let caixaC = null, P = null;                            // P: zoom 0 → px da caixa (k, ox, oy)
    const traca = (ctx, a) => {
      const { k, ox, oy } = P;
      for (const { w } of a.aneis) {
        ctx.moveTo(w[0] * k + ox, w[1] * k + oy);
        for (let i = 2; i < w.length; i += 2) ctx.lineTo(w[i] * k + ox, w[i + 1] * k + oy);
        ctx.closePath();
      }
    };
    const linha = (ctx, as, cor, larg, halo) => {           // traço centrado no contorno, com sombra embaixo
      if (!as.length) return;
      ctx.beginPath();
      as.forEach(a => traca(ctx, a));
      if (halo) { ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = larg + halo; ctx.stroke(); }
      ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.stroke();
    };
    const porDentro = (ctx, a, cor, larg, halo) => {        // traço só do lado de dentro da área (larg px), com sombra por dentro
      ctx.save();
      ctx.beginPath();
      traca(ctx, a);
      ctx.clip('evenodd');
      ctx.beginPath();
      traca(ctx, a);
      if (halo) { ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2 * (larg + halo); ctx.stroke(); }
      ctx.strokeStyle = cor; ctx.lineWidth = 2 * larg; ctx.stroke();
      ctx.restore();
    };
    // pincel do canvas: op, a opacidade do nível (na mistura); al, a de cada traço
    const pincelCanvas = (op, vc, cc, x0, y0, w, h) => ({
      veu(a) { vc.fillStyle = cor(); vc.globalAlpha = op * VEU; vc.beginPath(); vc.rect(x0, y0, w, h); traca(vc, a); vc.fill('evenodd'); },
      linha(as, c, larg, halo, al) { cc.globalAlpha = op * al; linha(cc, as, c, larg, halo); },
      porDentro(a, c, larg, halo, al) { cc.globalAlpha = op * al; porDentro(cc, a, c, larg, halo); },
    });
    // pincel do svg do voo: os mesmos traços, em coordenadas do zoom 0 (relativas a O, vezes S: números pequenos, sem perder
    // precisão no float do svg); a escala de cada quadro fica no transform do grupo do nível, a opacidade dele também
    const O = map.project(limTO.getCenter(), 0), S = 1e4;
    const dDe = a => a.dS || (a.dS = a.aneis.map(({ w }) => {
      let d = '';
      for (let i = 0; i < w.length; i += 2) d += (i ? 'L' : 'M') + ((w[i] - O.x) * S).toFixed(1) + ' ' + ((w[i + 1] - O.y) * S).toFixed(1);
      return d + 'Z';
    }).join(''));
    const MUNDO = `M${-256 * S} ${-256 * S}H${256 * S}V${256 * S}H${-256 * S}Z`;   // o véu: tudo menos a área (evenodd)
    const el = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) if (at[k] != null) e.setAttribute(k, at[k]); return e; };
    const traco = (d, c, w, al) => el('path', { d, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke', opacity: al === 1 ? null : al });
    let nClip = 0;
    const defs = el('defs', {});
    cont.sv.append(defs);
    const clipDe = a => {                                   // o recorte da área (um por área, guardado)
      if (!a.clip) { a.clip = 'st-rec-' + (++nClip); const c = el('clipPath', { id: a.clip }); c.append(el('path', { d: dDe(a), 'clip-rule': 'evenodd' })); defs.append(c); }
      return a.clip;
    };
    const pincelSvg = (gv, gc) => ({
      veu(a) { gv.append(el('path', { d: MUNDO + dDe(a), fill: cor(), 'fill-rule': 'evenodd', opacity: VEU })); },
      linha(as, c, larg, halo, al) {
        if (!as.length) return;
        const d = as.map(dDe).join('');
        if (halo) gc.append(traco(d, 'rgba(0,0,0,.5)', larg + halo, al));
        gc.append(traco(d, c, larg, al));
      },
      porDentro(a, c, larg, halo, al) {
        const g = el('g', { 'clip-path': `url(#${clipDe(a)})` }), d = dDe(a);
        if (halo) g.append(traco(d, 'rgba(0,0,0,.5)', 2 * (larg + halo), al));
        g.append(traco(d, c, 2 * larg, al));
        gc.append(g);
      },
    });
    // ---- realce (a área embaixo do mouse ou do cartão): o véu claro por baixo das linhas e o contorno forte por cima ----
    // num svg à parte em cada pane, com o mesmo desenho que os canvas tinham: trocar o realce (o mouse passando de uma área
    // a outra) não refaz os dois canvas, que são 1,5 × a caixa (×4 na tela de alta densidade), só o desenho da área
    const rsv = cvs.map(c => {
      const e = document.createElementNS(NS, 'svg');
      e.style.cssText = 'position:absolute;left:0;top:0;display:none;margin:0;min-height:0;max-width:none;max-height:none;overflow:hidden;pointer-events:none';
      c.cv.parentNode.append(e);
      return e;
    });
    let rsA = null, rsG = [];
    function poeRealce() {
      const a = realceA && mistura >= 1 && !voandoN && !noVoo && map && !map._animatingZoom ? realceA : null;
      if (a !== rsA) {
        rsA = a;
        rsv.forEach(e => { e.textContent = ''; });
        rsG = [];
        if (a) {
          const pc = a.tipo === 'pol' ? corPolo(a.nome) : null, d = dDe(a), gv = el('g', {}), gc = el('g', {});
          gv.append(el('path', { d, fill: pc || '#ffffff', 'fill-rule': 'evenodd', opacity: pc ? 0.2 : 0.12 }));
          if (pc) {                                         // por dentro da área (o porDentro dos canvas), com a sombra
            const df = el('defs', {}), cp = el('clipPath', { id: 'st-rs-rec' }), g = el('g', { 'clip-path': 'url(#st-rs-rec)' });
            cp.append(el('path', { d, 'clip-rule': 'evenodd' }));
            df.append(cp);
            g.append(traco(d, 'rgba(0,0,0,.5)', 2 * (4 + 2), 1), traco(d, pc, 2 * 4, 1));
            gc.append(df, g);
          } else gc.append(traco(d, 'rgba(0,0,0,.5)', 2.6 + 3, 1), traco(d, '#ffffff', 2.6, 1));
          rsv[0].append(gv); rsv[1].append(gc);
          rsG = [gv, gc];
        }
      }
      rsv.forEach(e => { e.style.display = a ? '' : 'none'; });
      if (!a) return;
      const t = map.getSize(), k = Math.pow(2, map.getZoom()), po = map.getPixelOrigin(), pp = map._getMapPanePos(), lp = map.containerPointToLayerPoint([0, 0]);
      const tr = `matrix(${k / S} 0 0 ${k / S} ${O.x * k + pp.x - po.x} ${O.y * k + pp.y - po.y})`;
      rsG.forEach(g => g.setAttribute('transform', tr));
      rsv.forEach(e => {
        if (e._tam !== t.x + 'x' + t.y) { e._tam = t.x + 'x' + t.y; e.setAttribute('width', t.x); e.setAttribute('height', t.y); e.style.width = t.x + 'px'; e.style.height = t.y + 'px'; }
        L.DomUtil.setPosition(e, lp);
      });
    }
    const BR = 'rgba(255,255,255,.92)';
    function nivel(n, Pn) {                                 // o desenho de um nível com um pincel
      const a = areaDe(n);
      if (a) Pn.veu(a);                                     // véu fora do nível
      if (!n.reg) { Pn.linha(D.regs, BR, 1.8, 3, 1); return; }
      const r = D.reg[n.reg], fora = D.regs.filter(x => x !== r);
      Pn.linha(fora, 'rgba(255,255,255,.45)', 1, 0, 1);
      if (!n.pol) { r.polos.forEach(p => Pn.porDentro(D.pol[p], corPolo(p), 2.6, 2, 1)); Pn.linha(r.polos.map(p => D.pol[p]), BR, 1.1, 0, 1); return; }
      const p = D.pol[n.pol], ms = p.ms.map(m => D.mun[m.cod]);
      r.polos.forEach(q => { if (q !== n.pol) Pn.porDentro(D.pol[q], corPolo(q), 1.4, 0, 0.75); });
      if (!n.mun) {
        Pn.linha(ms, 'rgba(255,255,255,.78)', 1, 2.2, 1);
        Pn.porDentro(p, corPolo(p.nome), 2.6, 2, 1);
        Pn.linha([p], BR, 1.1, 0, 1);
        return;
      }
      Pn.linha(ms.filter(x => x.m.cod !== n.mun), 'rgba(255,255,255,.8)', 1, 0, 0.6);
      Pn.porDentro(p, corPolo(p.nome), 1.6, 0, 0.6);
      // o município aberto: contorno claro e forte (não se confunde com o T1 azul) e, por dentro, a cor do polo
      Pn.porDentro(D.mun[n.mun], corPolo(p.nome), 2.2, 0, 1);
      Pn.linha([D.mun[n.mun]], '#ffffff', 2.2, 3, 1);
    }
    const cor = () => getComputedStyle(caixa).getPropertyValue('--mapbg').trim() || '#0f1417';
    const chN = n => `${n.reg}/${n.pol}/${n.mun}`;
    // ---- voo: o svg ----
    let noVoo = false, vooCh = '', grupos2 = [], chaveSvg = '';   // grupos2: [{v, c}] do nível de antes e do de depois
    function poeVoo(refaz) {
      const ch = chN(nivAntes) + '>' + chN(niv);
      if (refaz || ch !== vooCh) {
        vooCh = ch;
        grupos2.forEach(g => { g.v.remove(); g.c.remove(); });
        grupos2 = [nivAntes, niv].map(n => {
          const g = { v: el('g', {}), c: el('g', {}) };
          nivel(n, pincelSvg(g.v, g.c));
          veu.sv.append(g.v); cont.sv.append(g.c);
          return g;
        });
      }
      const t = map.getSize(), k = Math.pow(2, map.getZoom()), po = map.getPixelOrigin(), pp = map._getMapPanePos();
      const tr = `matrix(${k / S} 0 0 ${k / S} ${O.x * k + pp.x - po.x} ${O.y * k + pp.y - po.y})`;
      const lp = map.containerPointToLayerPoint([0, 0]);
      for (const c of cvs) {
        if (!noVoo) { c.cv.style.display = 'none'; c.sv.style.display = ''; }
        if (c.svTam !== t.x + 'x' + t.y) { c.svTam = t.x + 'x' + t.y; c.sv.setAttribute('width', t.x); c.sv.setAttribute('height', t.y); c.sv.style.width = t.x + 'px'; c.sv.style.height = t.y + 'px'; }
        L.DomUtil.setPosition(c.sv, lp);
      }
      noVoo = true;
      chave = '';
      // no pouso (mistura 1) o svg já é o desenho do nível: fica na tela nos quadros do pouso (que não pagam o desenho e o
      // envio dos dois canvas) até fixa(), um quadro depois das bandeirinhas, ou até a vista, o nível ou o realce mudarem
      chaveSvg = mistura >= 1 ? chaveDe(niv, niv, 1, null) : '';
      grupos2.forEach((g, i) => {
        const op = i ? mistura : 1 - mistura, vis = op > 0.004 ? '' : 'none';
        for (const e of [g.v, g.c]) { e.setAttribute('transform', tr); e.setAttribute('opacity', op.toFixed(3)); e.style.display = vis; }
      });
    }
    function tiraVoo() {
      if (!noVoo) return;
      noVoo = false;
      for (const c of cvs) { c.sv.style.display = 'none'; c.cv.style.display = ''; }
    }
    // ---- parado: os canvas ----
    let chave = '', vC = null, ctC = '';                    // vC: a vista do desenho dos canvas; ctC: o que está desenhado neles
    const conteudo = (n, na, mi) => [window.devicePixelRatio, mi, chN(n), chN(na)].join('|');
    const chaveDe = (n, na, mi) => chaveVista() + '|' + conteudo(n, na, mi);
    const depois = adiado(() => desenha());
    function desenha(forca) {                               // forca (true): mesmo com tudo igual ao último desenho (tema, abertura)
      if (!map || !D || map._animatingZoom) return;
      if (voandoN) { poeVoo(forca === true); return; }
      // (um desenho por passo do mapa: 'zoom' e 'move' vêm juntos)
      const ch = chaveDe(niv, nivAntes, mistura);
      if (noVoo && forca !== true && ch === chaveSvg) return;   // pousado, com o svg do voo
      tiraVoo();
      if (forca !== true && ch === chave) return;
      chave = ch;
      depois.cancela();
      const t = map.getSize(), m = 0.25, x0 = -t.x * m, y0 = -t.y * m, w = t.x * (1 + 2 * m), h = t.y * (1 + 2 * m);
      const dpr = Math.min(2, window.devicePixelRatio || 1), tam = `${w}x${h}x${dpr}`;
      caixaC = L.latLngBounds(map.containerPointToLatLng([x0, y0]), map.containerPointToLatLng([x0 + w, y0 + h]));
      const po = map.getPixelOrigin(), pp = map._getMapPanePos();
      P = { k: Math.pow(2, map.getZoom()), ox: pp.x - po.x, oy: pp.y - po.y };
      // no Tocantins o véu não tem nada: fica escondido, sem limpar e passar a limpo um canvas vazio a cada desenho
      const veuVazio = !(mistura > 0.004 && areaDe(niv)) && !(mistura < 0.996 && areaDe(nivAntes));
      for (const c of cvs) {
        L.DomUtil.setPosition(c.cv, map.containerPointToLayerPoint([x0, y0]));
        const vazio = c === veu && veuVazio;
        if (vazio && c.vazio && c.tam === tam) continue;
        c.vazio = vazio;
        c.cv.style.visibility = vazio ? 'hidden' : '';
        if (c.tam !== tam) {
          c.tam = tam;
          c.cv.width = Math.round(w * dpr); c.cv.height = Math.round(h * dpr);
          c.cv.style.width = w + 'px'; c.cv.style.height = h + 'px';
        }
        c.ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
        c.ctx.clearRect(x0, y0, w, h);
        c.ctx.lineJoin = c.ctx.lineCap = 'round';
        c.ctx.globalAlpha = 1;
      }
      const vc = veu.ctx, cc = cont.ctx;
      if (mistura < 1 && 1 - mistura > 0.004) nivel(nivAntes, pincelCanvas(1 - mistura, vc, cc, x0, y0, w, h));
      if (mistura > 0.004) nivel(niv, pincelCanvas(mistura, vc, cc, x0, y0, w, h));
      vc.globalAlpha = cc.globalAlpha = 1;
      vC = { z: map.getZoom(), x: x0 - pp.x + po.x, y: y0 - pp.y + po.y, w, h };
      ctC = conteudo(niv, nivAntes, mistura);
      poeRealce();
    }
    // em movimento (fora do voo entre níveis, que tem o svg), os canvas só acompanham; refeitos se a caixa sair do desenho,
    // se esticarem demais ou se o que mostram mudou
    map.on('zoom move', () => {
      if (!map || !D || map._animatingZoom) return;
      if (voandoN || noVoo || !vC || conteudo(niv, nivAntes, mistura) !== ctC) { desenha(); return; }
      const r = estica(vC, cvs.map(c => c.cv));
      if (!r.cobre || r.s > ESTICA) desenha(); else if (rsA || realceA) poeRealce();
    });
    map.on('moveend', () => { if (vC && !voandoN && !noVoo && !parado(vC, 0.08)) depois.agenda(); });
    map.on('viewreset resize', desenha);
    map.on('zoomanim', e => {
      rsv.forEach(x => { x.style.display = 'none'; });       // (o realce volta no fim do zoom)
      rsA = null;
      if (!caixaC || !vC) return;
      depois.cancela();
      chave = '';
      const s = map.getZoomScale(e.zoom, vC.z), o = map._latLngBoundsToNewLayerBounds(caixaC, e.zoom, e.center).min;
      cvs.forEach(c => L.DomUtil.setTransform(c.cv, o, s));
    });
    new MutationObserver(() => desenha(true)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // parado depois do pouso: os canvas de volta no lugar do svg (o desenho parado é sempre o dos canvas)
    const fixa = () => { if (noVoo && !voandoN) { tiraVoo(); desenha(true); } };
    return { desenha, fixa, realce: poeRealce, pendente: depois.pendente };
  }
  function realceArea(a) {
    if (a === realceA) return;
    realceA = a;
    if (desenho) desenho.realce();
  }
  // linhas: o T1 e o T2 de cada alimentador (polilinhas do Leaflet num canvas, que já sabe o mouse em cima da linha).
  // Nos níveis, as de alimentadores de fora (escopo: os que têm rede na regional, no polo ou no município) ficam apagadas;
  // no município, as dele mais fortes
  const peso = (c, z) => (c === 'T1' ? 1.7 : 1.15) * (z < 8 ? 1 : z < 10 ? 1.4 : z < 12 ? 1.8 : 2.3);
  function estiloLinha(c, on, cod) {
    const fora = !!(escopo && cod && !escopo.has(cod)), forte = !!(niv.mun && escopo && !fora);
    if (c === 'PT') return on ? { radius: 6.5, color: '#ffffff', weight: 2, opacity: 1, fillColor: COR.T1, fillOpacity: 1 }
      : { radius: 4.5, color: '#ffffff', weight: 1.5, opacity: fora ? 0.3 : 0.95, fillColor: COR.T1, fillOpacity: fora ? 0.3 : 0.95 };
    const z = map.getZoom();
    return on ? { color: '#ffffff', weight: peso(c, z) + 2.4, opacity: 1 }
      : { color: COR[c], weight: peso(c, z) * (forte ? 1.3 : 1), opacity: fora ? (niv.mun ? 0.2 : 0.28) : forte ? 1 : 0.9 };
  }
  const estiloDe = (pl, on) => estiloLinha(pl._stCls, on, pl._stAl);
  // aplica: já muda o estilo das linhas (no voo entre níveis fica para o pouso, que redesenha as linhas de qualquer jeito:
  // um redesenho só, e não um no 1º quadro do voo e outro no pouso)
  function poeEscopo(aplica = true) {
    const a = areaDe(niv);
    escopo = !a ? null : a.tipo === 'mun' ? alsDe([a.m]) : a.als;
    if (aplica) estilizaLinhas();
  }
  // o estilo novo das linhas pede ao canvas um redesenho no próximo quadro (pede: o pedido feito antes do fim do movimento);
  // quando o fim do movimento (moveend) já as redesenhou todas com ele (o pedido foi consumido), esse segundo redesenho
  // inteiro é trabalho dobrado e sai
  function semRedesenhoDobrado(pede) {
    if (rend && pede && rend._redrawRequest !== pede) L.Util.cancelAnimFrame(pede);
  }
  function estilizaLinhas() {
    if (!map) return;
    grupos.forEach(g => g.forEach(pl => pl.setStyle(estiloDe(pl, false))));
    if (niv.mun && escopo) escopo.forEach(cod => { const g = grupos.get(cod); if (g) g.forEach(pl => pl.bringToFront()); });
  }
  // canvas das linhas, redesenhado no fim de cada movimento (o pouso do voo entre níveis, o fim do zoom da roda, da pinça, do
  // duplo clique) sem travar: o desenho novo é feito fora da tela enquanto o de antes fica nela, esticado como no zoom do
  // Leaflet, e entra de uma vez, pronto, com o mesmo desenho que o redesenho inteiro do Leaflet faria. Era o maior quadro de
  // cada passo (todas as linhas num quadro só, num canvas de 2× a caixa, ×2 na tela de alta densidade). Na roda seguida, o
  // passo seguinte larga o trabalho do anterior: só a vista em que o mapa para é desenhada. Depois de um arrasto (o mesmo
  // zoom), se o desenho de antes ainda cobre a caixa com folga, nada é refeito. Zoom e viewreset no meio largam o trabalho.
  // - Com OffscreenCanvas (o normal): o desenho vai para um worker, o "pintor". A página só recorta e simplifica as linhas
  //   (o Leaflet: as mesmas partes que o mouse e o clique usam) e manda as partes e os estilos; o pintor faz as operações do
  //   L.Canvas._draw, na mesma ordem (cada camada: o caminho e o traço com a opacidade, a largura e a cor dela; os pontos, o
  //   círculo com o preenchimento e o traço) e devolve a imagem (ImageBitmap), que entra num canvas "bitmaprenderer" sem
  //   cópia. O canvas do Leaflet fica por cima, transparente, só para o mouse. Um estilo mudado (o nível) pede outro desenho.
  // - Sem OffscreenCanvas: o desenho em partes aqui, num canvas à parte, um lote por quadro; um pedido de redesenho no meio
  //   termina o trabalho na hora.
  function pintaLinhas(tela, m) {
    const traco = (x, e) => { x.globalAlpha = e[2]; x.lineWidth = e[1]; x.strokeStyle = e[0]; x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke(); };
    const x = tela.getContext('2d'), Ls = m.L, P = m.P, C = m.C, E = m.E;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, m.W, m.H);
    x.setTransform(m.k, 0, 0, m.k, -m.bx * m.k, -m.by * m.k);
    x.save();
    let ip = 0, ic = 0;
    for (let i = 0; i < Ls.length; i += 3) {
      const e = E[Ls[i + 1]], n = Ls[i + 2];
      x.beginPath();
      if (Ls[i] === 1) {                                    // polilinha: n partes
        for (let k = 0; k < n; k++) {
          const q = P[ip++];
          for (let j = 0; j < q; j++, ic += 2) { if (j) x.lineTo(C[ic], C[ic + 1]); else x.moveTo(C[ic], C[ic + 1]); }
        }
        traco(x, e);
      } else {                                              // ponto: centro e raio
        x.arc(C[ic], C[ic + 1], C[ic + 2], 0, Math.PI * 2, false);
        ic += 3;
        x.globalAlpha = e[4]; x.fillStyle = e[3]; x.fill('evenodd');
        traco(x, e);
      }
    }
    x.restore();
    return tela.transferToImageBitmap();
  }
  // o worker: desenha o último pedido (os do meio, que chegam juntos, ficam de fora) e devolve a imagem
  function Pintor(posta) {
    let tela = null, pedido = null, vez = 0;
    const pinta = () => {
      vez = 0;
      const m = pedido;
      pedido = null;
      if (!m) return;
      if (m.solta) { tela = null; return; }
      const t0 = performance.now();
      if (!tela || tela.width !== m.W || tela.height !== m.H) tela = new OffscreenCanvas(m.W, m.H);
      const bm = pintaLinhas(tela, m);
      posta({ id: m.id, bm, ms: performance.now() - t0 }, [bm]);
    };
    return m => { pedido = m; if (!vez) vez = setTimeout(pinta, 0); };
  }
  // com OffscreenCanvas e o canvas "bitmaprenderer", a imagem das linhas sempre vem de pintaLinhas (no worker; sem ele, aqui)
  // e entra na tela sem cópia; sem eles, o canvas do Leaflet como sempre (o fim do movimento desenhado em partes)
  const temOC = (() => { try { const o = new OffscreenCanvas(1, 1); return !!(o.getContext('2d') && o.transferToImageBitmap && document.createElement('canvas').getContext('bitmaprenderer')) && !window.__satSemPintor; } catch (e) { return false; } })();
  let pintor = null, pintorFalhou = false, telaLocal = null;
  const pintaAqui = d => {
    if (!telaLocal || telaLocal.width !== d.W || telaLocal.height !== d.H) telaLocal = new OffscreenCanvas(d.W, d.H);
    return pintaLinhas(telaLocal, d);
  };
  const comPintor = () => {
    if (pintor || pintorFalhou) return pintor;
    try {
      if (!temOC || typeof Worker !== 'function') throw new Error('sem OffscreenCanvas');
      const u = URL.createObjectURL(new Blob([`'use strict';\nconst pintaLinhas = ${pintaLinhas};\nconst recebe = (${Pintor})((m, t) => postMessage(m, t || []));\nonmessage = e => recebe(e.data);\n`], { type: 'text/javascript' }));
      pintor = new Worker(u);
      URL.revokeObjectURL(u);
      pintor.onmessage = e => { if (rend) rend._pintado(e.data); else if (e.data.bm) e.data.bm.close(); };
      pintor.onerror = e => { e.preventDefault(); pintorFalhou = true; pintor = null; if (rend) rend._semPintor(); };
    } catch (e) { pintorFalhou = true; pintor = null; }
    return pintor;
  };
  let Tela = null, FORA = null;
  const telaLinhas = opc => new (Tela || (FORA = L.bounds([-1e9, -1e9], [-1e9, -1e9]), Tela = L.Canvas.extend({
    // modo imagem (com OffscreenCanvas): a tela das linhas é um canvas "bitmaprenderer" (a imagem do pintor entra sem
    // cópia); o canvas do Leaflet fica por cima, transparente e sem desenho (1 px), só para o mouse e o clique nas linhas
    _initContainer() {
      L.Canvas.prototype._initContainer.call(this);
      if (!temOC) return;
      const v = this._img = document.createElement('canvas');
      v.className = 'leaflet-zoom-animated st-img';
      v.style.pointerEvents = 'none';
      this._bmr = v.getContext('bitmaprenderer');
      this._container.style.opacity = '0';
    },
    onAdd() {
      L.Canvas.prototype.onAdd.call(this);
      if (this._img && this._img.parentNode !== this._container.parentNode) this._container.before(this._img);
    },
    _destroyContainer() { this._largaPartes(); if (this._img) this._img.remove(); return L.Canvas.prototype._destroyContainer.call(this); },
    // a imagem acompanha o canvas do Leaflet (posição e escala)
    _espelha() { if (this._img) this._img.style.transform = this._container.style.transform; },
    _updateTransform(c, z) { L.Canvas.prototype._updateTransform.call(this, c, z); this._espelha(); },
    // o canvas do Leaflet no lugar e no tamanho (CSS) do desenho b; no modo imagem, sem bitmap (só a área do mouse)
    _poeCaixa(b, k) {
      const e = this._container, sz = b.getSize();
      L.DomUtil.setPosition(e, b.min);
      if (this._img) { e.width = e.height = 1; }
      else {
        e.width = k * sz.x; e.height = k * sz.y;
        if (k === 2) this._ctx.scale(2, 2);
        this._ctx.translate(-b.min.x, -b.min.y);
      }
      e.style.width = sz.x + 'px'; e.style.height = sz.y + 'px';
      this._espelha();
    },
    _update() {
      const J = this._job, mp = this._map;
      if (J) this._largaPartes();
      if (mp._animatingZoom && this._bounds) return;        // (o fim da animação do zoom chama de novo)
      // arrasto: o desenho na tela (vis) é deste zoom e desta origem dos pixels e ainda cobre a caixa com 15% de folga
      const vis = this._vis, sujo = this._sujo;
      this._sujo = false;
      if (vis && !sujo && !this._semPartes && vis.z === mp.getZoom() && vis.po.equals(mp.getPixelOrigin())) {
        const t = mp.getSize(), a = mp.containerPointToLayerPoint([0, 0]), f = t.multiplyBy(0.15), b = vis.b;
        // (no lugar exato do desenho: o _onZoom de um voo que voltou à mesma vista o deixa com fração de pixel)
        if (a.x - f.x >= b.min.x && a.y - f.y >= b.min.y && a.x + t.x + f.x <= b.max.x && a.y + t.y + f.y <= b.max.y) {
          L.DomUtil.setPosition(this._container, b.min);
          this._espelha();
          return;
        }
      }
      if (!this._img && (!this._bounds || this._semPartes || !(this._partes || this._sempre))) {
        this._partes = false;
        L.Canvas.prototype._update.call(this);
        this._vis = { z: mp.getZoom(), po: mp.getPixelOrigin(), b: this._bounds };
        if (this._aoAtualizar) this._aoAtualizar();
        return;
      }
      this._partes = false;
      // os limites novos (os de L.Renderer._update); centro e zoom ficam os de antes até a troca: o transform do canvas
      // na tela segue o do conteúdo de antes
      const pd = this.options.padding, t = this._map.getSize(), min = this._map.containerPointToLayerPoint(t.multiplyBy(-pd)).round();
      const b = this._bounds = new L.Bounds(min, min.add(t.multiplyBy(1 + 2 * pd)).round()), sz = b.getSize(), m = L.Browser.retina ? 2 : 1;
      if (this._redrawRequest) { L.Util.cancelAnimFrame(this._redrawRequest); this._redrawRequest = null; }
      this._redrawBounds = null;
      const novo = { b, m, c: this._map.getCenter(), z: this._map.getZoom(), po: this._map.getPixelOrigin(), prontas: [] };
      if (!this._center) { this._center = novo.c; this._zoom = novo.z; this._poeCaixa(b, m); }   // (o 1º: a caixa já no lugar)
      if (this._img) this._prepara(b); else for (const id in this._layers) this._layers[id]._update();   // recorte e simplificação (o toque já vale)
      if (this._img) {
        const d = this._serializa(b, m), W = comPintor();
        if (W && !this._semPartes) {                        // no worker
          const job = this._job = Object.assign(novo, { id: (this._nPed = (this._nPed || 0) + 1), pintor: true });
          d.id = job.id;
          W.postMessage(d, [d.L.buffer, d.P.buffer, d.C.buffer]);
        } else this._troca(novo, pintaAqui(d));          // (sem worker, ou o viewreset: aqui mesmo)
        if (this._aoAtualizar) this._aoAtualizar();
        return;
      }
      // (o canvas à parte fica guardado enquanto o satélite está aberto: sem alocar 13 MB a cada pouso)
      const cv = this._cvPartes || (this._cvPartes = document.createElement('canvas'));
      if (cv.width !== m * sz.x || cv.height !== m * sz.y) { cv.width = m * sz.x; cv.height = m * sz.y; }
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(m, 0, 0, m, -b.min.x * m, -b.min.y * m);
      this._job = Object.assign(novo, { cv, ctx, no: this._drawFirst, raf: 0, lote: this._lote || 3000 });
      this._job.raf = L.Util.requestAnimFrame(this._passoPartes, this);
      if (this._aoAtualizar) this._aoAtualizar();
    },
    _passoPartes(tudo) {
      const J = this._job;
      if (!J) return;
      const ctx0 = this._ctx, t0 = performance.now();
      this._ctx = J.ctx;
      this._drawing = true;
      // um lote de pontos por quadro (o custo do desenho segue o número de pontos das linhas à vista), do tamanho que cabe em
      // ~25 ms medidos no lote anterior: no PC, poucos quadros; no celular lento, mais
      let pts = 0;
      for (; J.no && (tudo === true || pts < J.lote); J.no = J.no.next) {
        const l = J.no.layer;
        l._updatePath();
        if (l._parts) for (const pt of l._parts) pts += pt.length; else pts += 20;
      }
      this._drawing = false;
      this._ctx = ctx0;
      if (J.no) {
        J.ctx.getImageData(0, 0, 1, 1);                     // (o lote vira pixels neste quadro, sem acumular para a troca)
        J.lote = this._lote = Math.max(1000, Math.min(60000, Math.round(pts * 25 / Math.max(1, performance.now() - t0))));
        J.raf = L.Util.requestAnimFrame(this._passoPartes, this);
        return;
      }
      this._troca(J, J.cv);
    },
    // as camadas na ordem do desenho, para o pintor: L (tipo, estilo, nº de partes), P (pontos de cada parte), C (as
    // coordenadas, px da camada) e E (os estilos: cor, largura, opacidade, cor e opacidade do preenchimento)
    _serializa(b, k) {
      let nl = 0, np = 0, nc = 0;
      for (let o = this._drawFirst; o; o = o.next) {
        const l = o.layer;
        if (l._parts) { if (!l._parts.length) continue; nl++; np += l._parts.length; for (const q of l._parts) nc += 2 * q.length; }
        else if (l._point && !l._empty()) { nl++; nc += 3; }
      }
      const Ls = new Int32Array(nl * 3), P = new Int32Array(np), C = new Float64Array(nc), E = [], ie = new Map();
      let il = 0, ip = 0, ic = 0;
      const estilo = op => {
        const ch = `${op.color}|${op.weight}|${op.opacity}|${op.fillColor}|${op.fillOpacity}`;
        let i = ie.get(ch);
        if (i === undefined) { ie.set(ch, i = E.length); E.push([op.color, op.weight, op.opacity, op.fillColor || op.color, op.fillOpacity]); }
        return i;
      };
      for (let o = this._drawFirst; o; o = o.next) {
        const l = o.layer, op = l.options;
        if (l._parts) {
          if (!l._parts.length) continue;
          Ls[il++] = 1; Ls[il++] = estilo(op); Ls[il++] = l._parts.length;
          for (const q of l._parts) { P[ip++] = q.length; for (const pt of q) { C[ic++] = pt.x; C[ic++] = pt.y; } }
        } else if (l._point && !l._empty()) {
          Ls[il++] = 2; Ls[il++] = estilo(op); Ls[il++] = 1;
          C[ic++] = l._point.x; C[ic++] = l._point.y; C[ic++] = Math.max(Math.round(l._radius), 1);
        }
      }
      const sz = b.getSize();
      return { W: k * sz.x, H: k * sz.y, k, bx: b.min.x, by: b.min.y, L: Ls, P, C, E };
    },
    // a imagem do pintor: entra se ainda é a do pedido de agora
    _pintado(r) {
      const J = this._job;
      if (!J || !J.pintor || r.id !== J.id || !this._map) { if (r.bm) r.bm.close(); return; }
      this._troca(J, r.bm);
    },
    // a troca: o que L.Canvas._update faria, com o desenho já pronto (img: a imagem do pintor, ou o canvas à parte no modo
    // sem imagem, quando os estilos mudados no meio são redesenhados na área deles)
    _troca(J, img) {
      this._job = null;
      this._center = J.c; this._zoom = J.z;
      if (this._img) {
        const sz = J.b.getSize(), v = this._img;
        v.width = img.width; v.height = img.height;
        this._bmr.transferFromImageBitmap(img);
        v.style.width = sz.x + 'px'; v.style.height = sz.y + 'px';
        this._poeCaixa(J.b, J.m);
        this._redrawBounds = null;
        if (J.sujo) { this._sujo = true; this._pedeDesenho(); }   // (um estilo mudou enquanto o pintor desenhava)
      } else {
        this._poeCaixa(J.b, J.m);
        this._ctx.save(); this._ctx.setTransform(1, 0, 0, 1, 0, 0); this._ctx.drawImage(img, 0, 0); this._ctx.restore();
        if (img.close) img.close();
        if (this._redrawBounds) this._redraw();
      }
      this._vis = { z: J.z, po: J.po, b: J.b };
      J.prontas.forEach(f => f());
    },
    _semPintor() { const J = this._job; if (J && J.pintor) { this._job = null; this._sujo = true; this._update(); J.prontas.forEach(f => f()); } },
    _largaPartes() {                                        // larga o trabalho: o canvas segue com o desenho de antes
      const J = this._job;
      if (!J) return;
      if (!J.pintor) L.Util.cancelAnimFrame(J.raf);
      this._job = null;
      if (this._redrawBounds || J.sujo) this._sujo = true;   // (um estilo mudou no meio: o próximo fim de movimento redesenha)
      this._redrawBounds = null;
      J.prontas.forEach(f => f());
    },
    soltaPartes() {
      this._largaPartes();
      if (this._cvPartes) this._cvPartes.width = this._cvPartes.height = 0;
      this._cvPartes = null;
      telaLocal = null;
      if (pintor) pintor.postMessage({ solta: true });
    },
    // termina o trabalho agora (o desenho inteiro aqui)
    terminaPartes() {
      const J = this._job;
      if (!J) return;
      if (!J.pintor) { L.Util.cancelAnimFrame(J.raf); this._passoPartes(true); return; }
      this._troca(J, pintaAqui(this._serializa(J.b, J.m)));
    },
    // promessa do fim do trabalho (já resolvida sem trabalho)
    prontas() { const J = this._job; return J ? new Promise(ok => J.prontas.push(ok)) : Promise.resolve(); },
    // um estilo mudou (o nível, a espessura): no modo imagem, o desenho inteiro de novo no próximo quadro (no pintor); no
    // meio de um trabalho dele, um outro logo depois da troca
    _requestRedraw(l) {
      if (this._carregando || !this._map) return;           // (as linhas entrando: o desenho de todas no fim)
      const J = this._job;
      if (this._img) { if (J) J.sujo = true; else this._pedeDesenho(); return; }
      if (J && J.pintor) { this._extendRedrawBounds(l); return; }   // (na troca)
      if (J) this.terminaPartes();
      return L.Canvas.prototype._requestRedraw.call(this, l);
    },
    _pedeDesenho() {
      if (!this._pedido) this._pedido = L.Util.requestAnimFrame(() => { this._pedido = 0; if (this._map && !this._job) { this._sujo = true; this._update(); } });
    },
    _onZoom() { this._largaPartes(); return L.Canvas.prototype._onZoom.call(this); },
    _onAnimZoom(e) { this._largaPartes(); return L.Canvas.prototype._onAnimZoom.call(this, e); },
    // viewreset: a vista nova, desenhada já (as camadas reprojetadas antes)
    // modo imagem: as linhas à vista do desenho b (com 64 px de folga, mais que o toque e o traço) projetadas para a vista de
    // agora (se ainda não foram), recortadas e simplificadas; as de fora ficam sem partes e com a caixa longe (o mouse e o
    // clique passam por elas). No zoom de perto, a maioria nem é projetada
    _prepara(b) {
      const mp = this._map, k = Math.pow(2, mp.getZoom()), po = mp.getPixelOrigin(), ch = mp.getZoom() + '|' + po.x + '|' + po.y;
      const x0 = b.min.x - 64, y0 = b.min.y - 64, x1 = b.max.x + 64, y1 = b.max.y + 64;
      for (const id in this._layers) {
        const l = this._layers[id], z = l._z0box;
        if (z && (z[2] * k - po.x < x0 || z[0] * k - po.x > x1 || z[3] * k - po.y < y0 || z[1] * k - po.y > y1)) {
          l._parts = []; l._pxBounds = FORA; l._projCh = null;
          continue;
        }
        if (z && l._projCh !== ch) { l._project(); l._projCh = ch; }
        l._update();
      }
    },
    _onZoomEnd() { if (!this._img) return L.Canvas.prototype._onZoomEnd.call(this); },
    _reset() {
      this._largaPartes();
      if (!this._img) { this._semPartes = true; try { return L.Canvas.prototype._reset.call(this); } finally { this._semPartes = false; } }
      this._postponeUpdatePaths = false;
      this._sujo = true;
      this._update();                                       // (no pintor; a imagem de antes fica no lugar até a troca)
      if (this._center) this._updateTransform(this._center, this._zoom);
    },
  })))(opc);
  // polilinha com a projeção guardada: os pontos de cada linha projetados uma vez no zoom 0; em cada zoom, a mesma conta do
  // Leaflet (latLngToLayerPoint: o projetado no zoom, arredondado, menos a origem) sem refazer o Mercator de cada ponto (o
  // fim de cada voo e de cada zoom reprojeta todas as linhas)
  let Linha = null;
  // (_z0box: a caixa da linha no zoom 0, para o canvas das linhas saber, sem projetar, se ela está à vista; no modo imagem
  // o zoomend não projeta todas: o canvas projeta só as que estão à vista, no fim do movimento)
  const linhaZ0 = () => Linha || (Linha = L.Polyline.extend({
    getEvents() { return temOC ? { viewreset: this._reset } : L.Polyline.prototype.getEvents.call(this); },
    _projectLatlngs(lls, out, pb) {
      if (!(lls[0] instanceof L.LatLng)) { for (let i = 0; i < lls.length; i++) this._projectLatlngs(lls[i], out, pb); return; }
      const n = lls.length, m = this._map;
      let w = lls._z0;
      if (!w) {
        w = lls._z0 = new Float64Array(n * 2);
        const bx = this._z0box || (this._z0box = [Infinity, Infinity, -Infinity, -Infinity]);
        for (let i = 0; i < n; i++) {
          const p = m.project(lls[i], 0);
          w[2 * i] = p.x; w[2 * i + 1] = p.y;
          if (p.x < bx[0]) bx[0] = p.x; if (p.y < bx[1]) bx[1] = p.y; if (p.x > bx[2]) bx[2] = p.x; if (p.y > bx[3]) bx[3] = p.y;
        }
      }
      const k = Math.pow(2, m.getZoom()), po = m.getPixelOrigin(), anel = new Array(n);
      for (let i = 0; i < n; i++) { const p = anel[i] = new L.Point(Math.round(w[2 * i] * k) - po.x, Math.round(w[2 * i + 1] * k) - po.y); pb.extend(p); }
      out.push(anel);
    },
  }));
  // em lotes de ~10 ms (uma tarefa só travava a abertura no celular), sem desenhar nada no meio; no fim, o desenho de todas
  // de uma vez (no pintor)
  let pondo = false;
  function poeLinhas(lista) {
    if (!map || nLinhas || pondo) return;
    pondo = true;
    rend._carregando = true;
    let i = 0, n = 0;
    const lote = () => {
      if (!map) return;
      const t0 = performance.now();
      for (; i < lista.length && performance.now() - t0 < 10; i++) n += poeLinha(lista[i]);
      if (i < lista.length) { setTimeout(lote, 0); return; }
      nLinhas = n;
      pondo = false;
      rend._carregando = false;
      if (niv.mun) poeEscopo();
      rend._sujo = true;
      rend._update();
      if (estado === 'on') poeAviso(legenda());
    };
    lote();
  }
  function poeLinha(a) {
    {
      const g = [];
      if (a.pt) {                                        // sem rede no cadastro: um ponto (por cima das linhas: vem no fim da lista)
        const pt = L.circleMarker(a.pt, Object.assign({ pane: 'st-linhas', renderer: rend, interactive: true, bubblingMouseEvents: false }, estiloLinha('PT', false, a.cod)));
        pt._stCls = 'PT'; pt._stAl = a.cod;
        pt.on('mouseover', () => realca(a.cod)).on('mouseout', () => { if (sobre === a.cod) realca(null); }).on('click', e => cliqueLinha(a.cod, e));
        pt.addTo(map);
        g.push(pt); semRede.add(a.cod);
      }
      for (const c of ['T2', 'T1']) {                     // o tronco por cima
        if (!a[c].length) continue;
        const pl = new (linhaZ0())(a[c], Object.assign({ pane: 'st-linhas', renderer: rend, interactive: true, bubblingMouseEvents: false, smoothFactor: 1 }, estiloLinha(c, false, a.cod)));
        pl._stCls = c; pl._stAl = a.cod;
        pl.on('mouseover', () => realca(a.cod)).on('mouseout', () => { if (sobre === a.cod) realca(null); }).on('click', e => cliqueLinha(a.cod, e));
        pl.addTo(map);
        g.push(pl);
      }
      if (g.length) grupos.set(a.cod, g);
      return g.length ? 1 : 0;
    }
  }
  // realce do alimentador embaixo do mouse (ou do item da lista do município): num canvas à parte por cima das linhas (no
  // pane delas: a mesma opacidade), só do tamanho dele dentro da caixa, com o estilo "on" (branco e mais largo; o ponto,
  // maior) e as mesmas partes que o canvas das linhas usa, na ordem em que o realce as punha à frente (o tronco por cima).
  // O canvas das linhas não é mais tocado: redesenhar a área do alimentador nele fazia o navegador passar a limpo o canvas
  // inteiro (2× a caixa, ×4 na tela de alta densidade) a cada linha que o mouse cruzava
  let rlCv = null;
  function poeRealceLinha() {
    const g = sobre && grupos.get(sobre);
    if (!g || !map || !rend || !rend._bounds || map._animatingZoom) { if (rlCv) rlCv.style.display = 'none'; return; }
    if (!rlCv) { rlCv = document.createElement('canvas'); rlCv.className = 'st-realce'; rlCv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none'; }
    if (rlCv.parentNode !== paneL) paneL.append(rlCv);
    const t = map.getSize(), a = map.containerPointToLayerPoint([0, 0]), f = t.multiplyBy(0.1);
    const vb = L.bounds(a.subtract(f), a.add(t).add(f)), est = g.map(pl => estiloLinha(pl._stCls, true, pl._stAl));
    let b = null;
    g.forEach((pl, i) => {
      const e = est[i], w = (e.weight || 0) / 2 + 2;
      const q = pl._parts ? (pl._parts.length && pl._pxBounds) : pl._point && L.bounds(pl._point, pl._point);
      if (!q) return;
      const r = w + (pl._parts ? 0 : Math.max(Math.round(e.radius), 1));
      const qb = L.bounds(q.min.subtract([r, r]), q.max.add([r, r]));
      b = b ? b.extend(qb.min).extend(qb.max) : qb;
    });
    const bb = rend._bounds;
    if (b) b = L.bounds([Math.max(b.min.x, vb.min.x, bb.min.x), Math.max(b.min.y, vb.min.y, bb.min.y)], [Math.min(b.max.x, vb.max.x, bb.max.x), Math.min(b.max.y, vb.max.y, bb.max.y)]);
    if (!b || b.max.x <= b.min.x || b.max.y <= b.min.y) { rlCv.style.display = 'none'; return; }
    const m = L.Browser.retina ? 2 : 1, min = b.min.floor(), sz = b.max.ceil().subtract(min);
    rlCv.width = sz.x * m; rlCv.height = sz.y * m;
    rlCv.style.width = sz.x + 'px'; rlCv.style.height = sz.y + 'px';
    L.DomUtil.setPosition(rlCv, min);
    const x = rlCv.getContext('2d');
    x.setTransform(m, 0, 0, m, -min.x * m, -min.y * m);
    g.forEach((pl, i) => {                                  // (as operações do L.Canvas: _updatePoly / _updateCircle e _fillStroke)
      const e = est[i];
      if (pl._parts) {
        if (!pl._parts.length) return;
        x.beginPath();
        for (const q of pl._parts) for (let j = 0; j < q.length; j++) { if (j) x.lineTo(q[j].x, q[j].y); else x.moveTo(q[j].x, q[j].y); }
      } else {
        if (!pl._point) return;
        x.beginPath();
        x.arc(pl._point.x, pl._point.y, Math.max(Math.round(e.radius), 1), 0, Math.PI * 2, false);
        x.globalAlpha = e.fillOpacity; x.fillStyle = e.fillColor || e.color; x.fill('evenodd');
      }
      x.globalAlpha = e.opacity; x.lineWidth = e.weight; x.strokeStyle = e.color; x.lineCap = 'round'; x.lineJoin = 'round';
      x.stroke();
    });
    rlCv.style.display = '';
  }
  function realca(cod) {
    if (sobre === cod) return;
    sobre = cod;
    poeRealceLinha();
    if (cod && grupos.has(cod) && window.ARGOS_PAG && window.ARGOS_PAG.prepara) window.ARGOS_PAG.prepara(cod);   // a página dele começa a vir
    if (cartaoMun) cartaoMun.querySelectorAll('.st-al').forEach(b => b.classList.toggle('on', b.dataset.al === cod));
    if (!cod && balao) balao.hidden = true;
  }
  function abreAl(cod) {
    const p = `alimentadores/${encodeURIComponent(cod)}/`;
    if (window.ARGOS_PAG && window.ARGOS_PAG.abre) window.ARGOS_PAG.abre(p); else location.href = RAIZ + p;
  }
  // toque (dedo) acima do município: a linha embaixo do dedo é difícil de evitar no mapa inteiro, então o toque entra na área
  // (sem o balão do mouse, o dedo não saberia que ia abrir um alimentador); no município, o toque na linha abre a página dele
  let ponteiro = 'mouse';
  function cliqueLinha(cod, e) {
    const oe = e && e.originalEvent, tipo = (oe && oe.pointerType) || ponteiro;
    if (tipo === 'touch' && !niv.mun && e.latlng) { cliqueArea(e.latlng); return; }
    abreAl(cod);
  }
  // para onde o clique (ou o toque) num ponto leva: a área do nível de baixo, ou a vizinha (outra regional, outro polo,
  // outro município do polo); no próprio município aberto, nada (só as linhas)
  function destino(ll) {
    const m = munEm(ll);
    if (!m) return null;
    if (!niv.reg || m.reg !== niv.reg) return { reg: m.reg, pol: null, mun: null };
    if (!niv.pol || m.polo !== niv.pol) return { reg: m.reg, pol: m.polo, mun: null };
    if (niv.mun === m.cod) return null;
    return { reg: m.reg, pol: m.polo, mun: m.cod };
  }
  function cliqueArea(ll) {
    if (estado !== 'on' || voandoN) return;
    const n = destino(ll);
    if (n) vaiPara(n);
  }
  const cab = (nome, num) => `<span class="h"><b>${esc(nome)}</b><i>${esc(num)}</i></span>`;
  function dicaDe(n) {
    if (n.mun) {
      const m = porCod[n.mun];
      return cab(m.nome, numMun(m)) + `<small>Polo ${esc(m.polo)} · ${m.slug ? `${nAls(m.als.length)} · ${kmTxt(kmMun(m))}` : 'sem dados ainda'}</small>` +
        '<small class="c">Clique para ver os alimentadores</small>';
    }
    if (n.pol) {
      const p = D.pol[n.pol];
      return cab(p.nome, numGrupo(p.ms)) + `<small>Regional ${esc(p.reg)} · ${p.ms.length} municípios · ${nAls(p.als.size)}</small>` +
        `<small class="c">Clique para ver os municípios de ${esc(p.nome)}</small>`;
    }
    const r = D.reg[n.reg];
    return cab('Regional ' + r.nome, numGrupo(r.ms)) + `<small>${r.polos.length} polos · ${r.ms.length} municípios · ${nAls(r.als.size)}</small>` +
      `<small class="c">${niv.reg ? `Clique para ir à Regional ${esc(r.nome)}` : `Clique para ver os polos da Regional ${esc(r.nome)}`}</small>`;
  }
  function poeBalao(html, ev) {
    const r = caixa.getBoundingClientRect();
    balao.innerHTML = html;
    balao.hidden = false;
    const x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14, w = balao.offsetWidth, h = balao.offsetHeight;
    balao.style.left = Math.max(4, Math.min(x, r.width - w - 6)) + 'px';
    balao.style.top = Math.max(4, y + h > r.height - 4 ? ev.clientY - r.top - h - 12 : y) + 'px';
  }
  function aoMover(e) {
    if (estado !== 'on' || voandoN) { balao.hidden = true; return; }
    const ev = e.originalEvent;
    if (ev && ev.target && ev.target.closest && ev.target.closest('.st-card')) { balao.hidden = true; return; }   // em cima de um cartão: o realce é dele
    if (sobre) {
      realceArea(null);
      map.getContainer().style.cursor = '';
      const a = infoAl(sobre), m = niv.mun && porCod[niv.mun], am = m && m.als.find(x => x.cod === sobre);
      poeBalao(`<span class="h"><b class="cod">${esc(sobre)}</b>${am ? `<i>${esc(numAl(sobre, m))}</i>` : ''}</span>` +
        (a.se || am ? `<small>${esc(a.se || '')}${am ? `${a.se ? ' · ' : ''}${kmTxt(am.m)} em ${esc(m.nome)}` : ''}</small>` : '') +
        (semRede.has(sobre) ? '<small>Sem rede no cadastro (só o ponto)</small>' : '') +
        '<small class="c">Clique para abrir o painel do alimentador</small>', ev);
      return;
    }
    const n = destino(e.latlng);
    realceArea(n ? areaDe(n) : null);
    map.getContainer().style.cursor = n ? 'pointer' : '';
    if (!n) { balao.hidden = true; return; }
    poeBalao(dicaDe(n), ev);
  }

  // ---------- bandeirinhas, nomes e cartão do município (o desenho do mapa dos municípios) ----------
  // marcadores do Leaflet (andam com o mapa): no Tocantins, o cartão de cada regional; na regional, o de cada polo, cada um
  // logo acima do contorno, preso por um fio curto que sobe de um ponto do contorno (o lugar que não cobre o desenho nem
  // outro cartão, com o fio mais curto, como em mapa-municipios.js: bandeiras/planta); no polo, o nome e o número de cada
  // município, dentro dele (os que se cruzam: letra menor; senão, só na dica). Postos no pouso e depois do zoom
  let marcas = [];
  const tiraMarcas = () => { marcas.forEach(mk => mk.remove()); marcas = []; };
  function mascaraPx(as) {                                  // o que está desenhado (px da caixa, de 2 em 2 px)
    const t = map.getSize(), E = 2, W = Math.max(1, Math.ceil(t.x / E)), H = Math.max(1, Math.ceil(t.y / E));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.beginPath();
    as.forEach(a => a.aneis.forEach(({ w }) => {
      for (let i = 0; i < w.length; i += 2) {
        const p = map.layerPointToContainerPoint(L.point(w[i], w[i + 1]).multiplyBy(Math.pow(2, map.getZoom())).subtract(map.getPixelOrigin()));
        if (i) g.lineTo(p.x / E, p.y / E); else g.moveTo(p.x / E, p.y / E);
      }
      g.closePath();
    }));
    g.fill('evenodd');
    const px = g.getImageData(0, 0, W, H).data;
    return (x, y) => { const i = x / E | 0, j = y / E | 0; return i >= 0 && j >= 0 && i < W && j < H && px[(j * W + i) * 4 + 3] > 0; };
  }
  function contornoPx(a, n) {                               // n pontos espalhados por igual ao longo do maior anel (px da caixa)
    const anel = a.aneis.reduce((x, y) => (y.w.length > x.w.length ? y : x)), w = anel.w, k = Math.pow(2, map.getZoom()), po = map.getPixelOrigin(), pp = map._getMapPanePos();
    const pts = [];
    for (let i = 0; i < w.length; i += 2) pts.push([w[i] * k - po.x + pp.x, w[i + 1] * k - po.y + pp.y]);
    const seg = [];
    let L0 = 0;
    for (let i = 1; i < pts.length; i++) { const c = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(c); L0 += c; }
    const out = [];
    for (let i = 0, j = 0, ac = 0; i < n && L0; i++) {
      const alvoL = L0 * (i + .5) / n;
      while (j < seg.length - 1 && ac + seg[j] < alvoL) ac += seg[j++];
      const f = seg[j] ? Math.min(1, (alvoL - ac) / seg[j]) : 0;
      out.push({ x: pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, y: pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f });
    }
    return out;
  }
  function planta(pts, w, h, noMapa, obst, CW, CH) {        // como em mapa-municipios.js
    let melhor = null;
    for (const p of pts) for (const Lf of [14, 24, 40]) for (const al of [.5, .15, .85]) {
      const x = p.x - w * al, y = p.y - Lf - h;
      if (x < 2 || y < 2 || x + w > CW - 2 || y + h > CH - 2) continue;
      const R = { left: x, top: y, right: x + w, bottom: y + h };
      if (obst.some(o => R.left < o.right + 6 && R.right + 6 > o.left && R.top < o.bottom + 6 && R.bottom + 6 > o.top)) continue;
      let cobre = 0, corta = 0;
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) if (noMapa(x + w * i / 4, y + h * j / 2)) cobre++;
      for (let k = 1; k <= 3; k++) if (noMapa(p.x, p.y - 3 - (Lf - 3) * k / 3)) corta++;
      const nota = cobre * 100 + corta * 30 + Lf + Math.abs(al - .5) * 8;
      if (!melhor || nota < melhor.nota) melhor = { nota, x, y, ax: p.x, ay: p.y, R, al, L: Lf };
    }
    return melhor;
  }
  const fio = (Lf, cor) => `<i class="mt-fio" style="left:0;top:0;width:${Lf}px;transform:rotate(-1.5708rad)${cor ? ';--c:' + cor : ''}"></i>` +
    `<i class="mt-pino" style="left:0;top:0${cor ? ';--c:' + cor : ''}"></i>`;
  function marca(ll, el, z) {
    const mk = L.marker(ll, { icon: L.divIcon({ className: 'st-mk', html: el, iconSize: null }), interactive: false, keyboard: false, zIndexOffset: z || 0 });
    mk.addTo(map);
    marcas.push(mk);
    return mk;
  }
  function bandeiras(itens, desenhadas) {
    const t = map.getSize(), obst = ocupados(), noMapa = mascaraPx(desenhadas);
    const med = document.createElement('div');
    med.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    caixaSat.append(med);
    itens.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-card' + (it.cor ? ' st-pc' : '');
      if (it.cor) b.style.setProperty('--c', it.cor);
      b.innerHTML = `<b>${esc(it.nome)}</b><i>${esc(it.num)}</i>`;
      b.setAttribute('aria-label', it.rotulo);
      b.dataset.area = it.area.tipo + ':' + it.area.nome;
      med.append(b);
      it.e = b;
    });
    itens.forEach(it => { it.w = it.e.offsetWidth; it.h = it.e.offsetHeight; });
    itens.forEach(it => {
      const b = planta(contornoPx(it.area, 90), it.w, it.h, noMapa, obst, t.x, t.y), e = it.e, el = document.createElement('div');
      el.className = 'st-band';
      let ll;
      if (b) {
        el.innerHTML = fio(b.L, it.cor);
        e.style.left = (b.x - b.ax).toFixed(0) + 'px';
        e.style.top = (b.y - b.ay).toFixed(0) + 'px';
        ll = map.containerPointToLatLng([b.ax, b.ay]);
        obst.push(b.R, { left: b.ax - 2, right: b.ax + 2, top: b.y + it.h, bottom: b.ay });
      } else {                                              // sem lugar: no meio da área
        const p = map.latLngToContainerPoint(it.area.rot);
        e.style.left = (-it.w / 2).toFixed(0) + 'px';
        e.style.top = (-it.h / 2).toFixed(0) + 'px';
        ll = it.area.rot;
        obst.push({ left: p.x - it.w / 2, right: p.x + it.w / 2, top: p.y - it.h / 2, bottom: p.y + it.h / 2 });
      }
      el.append(e);
      L.DomEvent.disableClickPropagation(e);
      L.DomEvent.disableScrollPropagation(e);
      e.addEventListener('click', ev => vaiPara(it.ir, ev.detail === 0));   // pelo teclado, o foco segue no nível novo
      e.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') realceArea(it.area); });
      e.addEventListener('pointerleave', () => realceArea(null));
      e.addEventListener('focus', () => realceArea(it.area));
      e.addEventListener('blur', () => realceArea(null));
      marca(ll, el, 1000);
    });
    med.remove();
  }
  function nomes(p, quieto) {                               // nomes dos municípios do polo aberto (quieto: sem o esmaecer de entrada)
    const t = map.getSize(), obst = ocupados(), cel = celular(), folgaN = cel ? 4 : 6;
    const ms = p.ms.slice().sort((a, b) => valMun(b) - valMun(a) || kmMun(b) - kmMun(a));
    const med = document.createElement('div');
    med.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    caixaSat.append(med);
    const itens = ms.map(m => {
      const zero = valMun(m) ? '' : ' class="zero"';
      const es = [0, 1].map(nv => {
        const s = document.createElement('span');
        s.className = 'mt-mn';
        s.dataset.nv = nv;
        s.innerHTML = `<b>${esc(m.nome)}</b><i${zero}>${esc(numMun(m))}</i>`;
        med.append(s);
        return s;
      });
      return { m, es };
    });
    itens.forEach(it => { it.tam = it.es.map(s => [s.offsetWidth, s.offsetHeight]); });
    const feitos = [];
    const bate = R => R.left < 2 || R.top < 2 || R.right > t.x - 2 || R.bottom > t.y - 2 ||
      feitos.concat(obst).some(o => R.left < o.right + folgaN && R.right + folgaN > o.left && R.top < o.bottom + folgaN && R.bottom + folgaN > o.top);
    itens.forEach(it => {
      const ll = D.mun[it.m.cod].rot, p = map.latLngToContainerPoint(ll);
      for (let nv = cel ? 1 : 0; nv < 2; nv++) {
        const [w, h] = it.tam[nv], R = { left: p.x - w / 2, right: p.x + w / 2, top: p.y - h / 2, bottom: p.y + h / 2 };
        if (bate(R)) continue;
        feitos.push(R);
        const s = it.es[nv];
        s.style.cssText = quieto ? 'left:0;top:0;animation:none' : 'left:0;top:0';
        s.dataset.cod = it.m.cod;
        marca(ll, s, 0);
        return;
      }
    });
    med.remove();
  }
  function poeMarcas(quieto) {
    tiraMarcas();
    if (estado !== 'on' || voandoN || !D) return;
    if (!niv.reg) {
      bandeiras(D.regs.map(r => ({ area: r, nome: r.nome, num: numGrupo(r.ms), ir: { reg: r.nome },
        rotulo: `Abrir a Regional ${r.nome}, ${numGrupo(r.ms)}` })), D.regs);
    } else if (!niv.pol) {
      const r = D.reg[niv.reg];
      bandeiras(r.polos.map(p => ({ area: D.pol[p], nome: p, num: numGrupo(D.pol[p].ms), cor: corCss(p), ir: { reg: r.nome, pol: p },
        rotulo: `Abrir o polo ${p}, ${numGrupo(D.pol[p].ms)}` })), [r]);
    } else if (!niv.mun) nomes(D.pol[niv.pol], quieto);
  }
  // cartão do município aberto (na coluna da esquerda): nome e número, o resumo, o link da página do município (como o
  // "Abrir … →" do mapa dos municípios) e a lista dos alimentadores dele (mouse realça a linha; clique abre a página)
  function poeCartaoMun() {
    poeLado();
    const m = niv.mun && porCod[niv.mun];
    lado.classList.toggle('st-niv', !!niv.reg);
    if (!m) { cartaoMun.hidden = true; cartaoMun.innerHTML = ''; lado.hidden = aviso.hidden; return; }
    const lista = m.als.slice().sort((a, b) => b.m - a.m), pg = window.ARGOS_PAG, href = `municipios/${m.slug}/`;
    const url = pg && pg.url ? pg.url(href) : RAIZ + href, fora = pg && pg.alvo ? pg.alvo : '';
    cartaoMun.setAttribute('aria-label', `Município ${m.nome}`);
    cartaoMun.innerHTML = `<span class="st-mun-h"><b>${esc(m.nome)}</b><i class="st-sel">${esc(numMun(m))}</i></span>` +
      `<small>${m.slug ? `${nAls(m.als.length)} · ${kmTxt(kmMun(m))} de rede` : 'sem dados ainda'}</small><small class="st-mun-pr">Polo ${esc(m.polo)} · Regional ${esc(m.reg)}</small>` +
      `<span class="st-mun-x">${m.slug ? `<a class="st-mun-a" href="${esc(url)}"${fora}>Abrir ${esc(m.nome)} →</a>` : ''}` +
      (lista.length ? `<button type="button" class="st-mun-b" aria-expanded="false" aria-controls="st-mun-l">Alimentadores<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>` : '') +
      '</span><div class="st-mun-l" id="st-mun-l" hidden>' + lista.map(a => `<button type="button" class="st-al" data-al="${esc(a.cod)}" title="Clique para abrir o painel do alimentador">` +
        `<b>${esc(a.cod)}</b><i class="st-sel">${esc(numAl(a.cod, m))}</i><em>${kmTxt(a.m)} aqui${a.se ? ' · ' + esc(a.se) : ''}</em></button>`).join('') + '</div>';
    cartaoMun.hidden = false;
    lado.hidden = false;
  }
  function poeTrilha() {
    if (!trilha) {
      const ref = barra && barra.querySelector('.mt-polos');
      if (!barra) return;
      trilha = document.createElement('span');
      trilha.className = 'mt-polos st-trilha';
      trilha.setAttribute('role', 'group');
      trilha.hidden = true;
      if (ref) ref.after(trilha); else barra.append(trilha);
      trilha.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.polo) vaiPara({ reg: niv.reg, pol: b.dataset.polo }, e.detail === 0);
        else if (b.dataset.ir === 'estado') vaiPara(NIV0, e.detail === 0);
        else if (b.dataset.ir === 'regional') vaiPara({ reg: niv.reg }, e.detail === 0);
        else if (b.dataset.ir === 'polo') vaiPara({ reg: niv.reg, pol: niv.pol }, e.detail === 0);
      });
      trilha.addEventListener('pointerover', e => { const b = e.target.closest('[data-polo]'); if (e.pointerType === 'mouse') realceArea(b && D ? D.pol[b.dataset.polo] : null); });
      trilha.addEventListener('pointerleave', () => realceArea(null));
    }
    if (!niv.reg) { trilha.hidden = true; trilha.innerHTML = ''; return; }
    // o mesmo desenho (e as mesmas classes) da trilha de mapa-municipios.js
    const passo = (ir, txt) => `<button type="button" class="mt-passo" data-ir="${ir}">${txt}</button><span class="mt-sep" aria-hidden="true">›</span>`;
    const atual = txt => `<b class="mt-atual" aria-current="location">${txt}</b>`;
    let h;
    if (!niv.pol) {
      const r = D.reg[niv.reg];
      trilha.setAttribute('aria-label', `Polos da Regional ${niv.reg}`);
      h = passo('estado', 'Tocantins') + atual(esc(niv.reg)) + '<span class="mt-sep" aria-hidden="true">·</span>' + r.polos.map(p =>
        `<button type="button" class="mt-pchip" data-polo="${esc(p)}" style="--c:${corCss(p)}" aria-label="${esc(p)}, ${esc(numGrupo(D.pol[p].ms))}">` +
        `<b>${esc(p)}</b><i>${esc(numGrupo(D.pol[p].ms, true))}</i></button>`).join('');
    } else if (!niv.mun) {
      const p = D.pol[niv.pol];
      trilha.setAttribute('aria-label', `Polo ${p.nome}`);
      h = passo('estado', 'Tocantins') + passo('regional', esc(niv.reg)) +
        `<span class="mt-pchip mt-atual" style="--c:${corCss(p.nome)}" aria-current="location" aria-label="${esc(p.nome)}, ${esc(numGrupo(p.ms))}"><b>${esc(p.nome)}</b><i>${esc(numGrupo(p.ms, true))}</i></span>`;
    } else {
      trilha.setAttribute('aria-label', `Município ${porCod[niv.mun].nome}`);
      h = passo('estado', 'Tocantins') + passo('regional', esc(niv.reg)) + passo('polo', esc(niv.pol)) + atual(esc(porCod[niv.mun].nome));
    }
    trilha.innerHTML = h;
    trilha.hidden = false;
  }

  async function cria() {
    L = window.L;
    TO = (window.TOCANTINS || []).filter(a => Array.isArray(a) && a.length > 2);
    if (!TO.length) throw new Error('sem o contorno do estado');
    limTO = L.latLngBounds([].concat(...TO));
    caixaSat = document.createElement('div');
    caixaSat.className = 'st-sat';
    caixaSat.setAttribute('role', 'region');
    caixaSat.setAttribute('aria-label', 'Satélite do Tocantins com as regionais, os polos, os municípios e as linhas T1 e T2 dos alimentadores');
    caixa.append(caixaSat);
    map = L.map(caixaSat, { zoomControl: false, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, maxZoom: 19, minZoom: 0,
      fadeAnimation: true, maxBoundsViscosity: 1, worldCopyJump: false });
    map.attributionControl.setPrefix(false);
    const v0 = vistaDoSvg();
    map.setView(v0 ? v0.c : limTO.getCenter(), v0 ? v0.z : 7, { animate: false });
    await divisao();
    camadas(await urlGoogle());
    mascara = criaMascara();
    desenho = criaDesenho();
    paneL = map.createPane('st-linhas');
    paneL.classList.add('st-linhas');
    paneL.style.opacity = '0';
    rend = telaLinhas({ padding: 0.5, tolerance: 5, pane: 'st-linhas' });
    rend._sempre = true;                                  // (todo fim de movimento em partes)
    balao = document.createElement('div');
    balao.className = 'st-balao';
    balao.hidden = true;
    caixa.append(balao);
    poeLado();
    map.on('mousemove', aoMover);
    map.on('mouseout', () => { realca(null); realceArea(null); balao.hidden = true; });
    // (o mouse saindo pelo canvas das linhas não chega ao mouseout do mapa: o Leaflet entrega esse evento só à linha)
    caixaSat.addEventListener('pointerleave', () => { realca(null); realceArea(null); balao.hidden = true; map.getContainer().style.cursor = ''; });
    map.on('click', e => cliqueArea(e.latlng));
    caixaSat.addEventListener('pointerdown', e => { ponteiro = e.pointerType || 'mouse'; }, true);
    caixaSat.addEventListener('wheel', e => { if (voandoN) e.preventDefault(); }, { passive: false });   // no voo, a roda não rola a página
    // a espessura das linhas muda com o zoom: só as opções, sem pedir redesenho (o moveend que vem logo depois redesenha todas)
    map.on('zoomend', () => grupos.forEach(g => g.forEach(pl => { if (pl._stCls !== 'PT') L.setOptions(pl, estiloDe(pl, false)); })));
    // o realce da linha: some no zoom e volta com as partes da vista nova (no fim de cada movimento)
    map.on('zoomanim zoom', () => { if (rlCv) rlCv.style.display = 'none'; });
    rend._aoAtualizar = () => { if (sobre) poeRealceLinha(); };
    // depois de arrastar ou do zoom do usuário: os nomes do polo de novo (cabem outros); bandeirinhas seguem presas ao contorno
    map.on('moveend', () => { if (estado === 'on' && !voandoN && niv.pol && !niv.mun) poeMarcas(true); });
    // a caixa mudou de tamanho (tela cheia, janela): refaz o mapa e o limite do zoom; num nível, o enquadramento dele
    // (fechado, fica para o próximo Ctrl+S: abre() refaz o tamanho antes de tudo)
    let tamAntes = '';
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (!map || estado === 'off') return;
      const k = caixa.clientWidth + 'x' + caixa.clientHeight;
      if (k === tamAntes) return;
      tamAntes = k;
      map.invalidateSize({ pan: false });
      if (estado !== 'on' || voandoN) return;
      limites(true);
      if (niv.reg) { const v = vistaDoNivel(niv); poeVista(v.c, v.z); }
      poeMarcas();
    }).observe(caixa);
    carregaLinhas().then(poeLinhas);
  }
  function limites(liga) {
    if (liga) {
      map.options.minZoom = 0;                             // (o enquadramento do estado não fica preso ao limite de antes)
      const v = vistaDoEstado(), z = map.getZoom();
      // (pousado no estado, o zoom pode ficar um fio abaixo da conta feita agora: sem esse fio, nada de setZoom e de
      // viewreset, que redesenha as linhas e refaz os quadros)
      map.setMinZoom(z < v.z && z > v.z - 1e-6 ? z : v.z);
      // nos níveis, também a vista do enquadramento (o município da beira do estado, ou ao lado da coluna, não é empurrado)
      const lim = limTO.pad(0.06);
      map.setMaxBounds(niv.reg ? L.latLngBounds(lim.getSouthWest(), lim.getNorthEast()).extend(map.getBounds()) : lim);
    } else {
      map.setMaxBounds(null);
      map.setMinZoom(0);
    }
  }
  // no voo entre níveis o mapa não aceita arrastar nem zoom (o voo não briga com a mão)
  function interage(sim) {
    ['dragging', 'scrollWheelZoom', 'touchZoom', 'doubleClickZoom', 'boxZoom'].forEach(h => { if (map[h]) map[h][sim ? 'enable' : 'disable'](); });
  }
  // para o arrasto com inércia e o voo do Leaflet. Sem o map.stop(): com zoomSnap 0 ele faz setZoom (um 'moveend') e ainda um
  // viewreset, e cada um redesenha todas as linhas e refaz os quadros (o começo de cada voo travava); só no meio de uma
  // animação de zoom do Leaflet (a roda) o stop() inteiro, que a termina
  const para = () => (map._animatingZoom ? map.stop() : map._stop());
  // muda a vista sem o viewreset do setView (que joga fora todos os quadros, inclusive os do fundo): o nítido baixa os da
  // vista nova; o fundo, que já tem o estado inteiro, fica
  function poeVista(c, z) {
    para();
    map._moveStart(true, false);
    map._move(c, z)._moveEnd(true);
  }
  // espera a camada terminar de baixar os quadros (ou o tempo acabar)
  const pronta = (l, ms) => new Promise(ok => {
    if (!l || !l.isLoading()) { ok(); return; }
    const t = setTimeout(ok, ms);
    l.once('load', () => { clearTimeout(t); ok(); });
  });

  // ---------- animação ----------
  let estado = 'off', quadro = 0, vez = 0;              // off | carregando | abrindo | on | fechando
  let focoAntes = null;                                 // o foco de antes do satélite (volta para ele)
  const tempos = {};                                    // (medidas para os testes: pedido, começo e fim da animação)
  const suave = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const passo01 = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  // caminho do voo (o de flyTo/flyToBounds do Leaflet, van Wijk e Nuij): o zoom muda em ritmo constante e, se o destino
  // está longe, afasta um pouco no meio; e(0..1) → {p (px no zoom de partida), z}; S: o tamanho do caminho
  function caminho(from, to, z0, z1) {
    const t = map.getSize(), w0 = Math.max(t.x, t.y), w1 = w0 * map.getZoomScale(z0, z1), u1 = to.distanceTo(from) || 1, rho = 1.42, rho2 = rho * rho;
    const r = i => { const s1 = i ? -1 : 1, s2 = i ? w1 : w0, t1 = w1 * w1 - w0 * w0 + s1 * rho2 * rho2 * u1 * u1, b1 = 2 * s2 * rho2 * u1, b = t1 / b1, sq = Math.sqrt(b * b + 1) - b; return sq < 1e-9 ? -18 : Math.log(sq); };
    const sinh = n => (Math.exp(n) - Math.exp(-n)) / 2, cosh = n => (Math.exp(n) + Math.exp(-n)) / 2, tanh = n => sinh(n) / cosh(n);
    const r0 = r(0), S = (r(1) - r0) / rho;
    const w = s => w0 * (cosh(r0) / cosh(r0 + rho * s)), u = s => w0 * (cosh(r0) * tanh(r0 + rho * s) - sinh(r0)) / rho2;
    const f = e => (e >= 1 || !(S > 1e-6) ? { p: to, z: z1 } : { p: from.add(to.subtract(from).multiplyBy(u(e * S) / u1)), z: map.getScaleZoom(w0 / w(e * S), z0) });
    f.S = isFinite(S) ? Math.max(0, S) : 0;
    return f;
  }
  // leva o mapa da vista de agora até v (centro, zoom e a correção da altura), com a opacidade da caixa op(t) (t de 0 a 1),
  // quadro a quadro como o voo do Leaflet (_move com flyTo: o nítido fica quieto; os quadros do pouso vêm no fim); cada(e)
  // é chamado a cada quadro com o avanço (0..1); devolve uma promessa do fim (false se outra animação tomou o lugar)
  function anima(v, dur, op, cada) {
    cancelAnimationFrame(quadro);
    const minha = ++vez;
    const z0 = map.getZoom(), cam = caminho(map.project(map.getCenter(), z0), map.project(v.c, z0), z0, v.z);
    const kIni = +caixaSat.dataset.k || 1;
    nitido._quieto = true;
    para();
    map._moveStart(true, false);
    return new Promise(ok => {
      const t0 = performance.now();
      const fim = () => {
        nitido._quieto = false;
        if (cada) cada(1);
        const pede = rend && rend._redrawRequest;
        map._move(v.c, v.z)._moveEnd(true);
        semRedesenhoDobrado(pede);
        caixaSat.style.opacity = String(op(1));
        caixaSat.dataset.k = v.k;
        caixaSat.style.transform = v.k === 1 ? '' : `scaleY(${v.k})`;
        ok(true);
      };
      if (!dur) { fim(); return; }
      const f = agora => {
        if (minha !== vez) { nitido._quieto = false; ok(false); return; }
        const t = Math.min(1, Math.max(0, (agora - t0) / dur));
        if (t >= 1) { fim(); return; }
        const e = suave(t), q = cam(e);
        if (cada) cada(e);
        map._move(map.unproject(q.p, z0), q.z, { flyTo: true });
        const k = kIni + (v.k - kIni) * e;
        caixaSat.dataset.k = k;
        caixaSat.style.transform = Math.abs(k - 1) < 1e-4 ? '' : `scaleY(${k})`;
        caixaSat.style.opacity = String(op(t));
        quadro = requestAnimationFrame(f);
      };
      quadro = requestAnimationFrame(f);
    });
  }
  const duracao = v => { const z0 = map.getZoom(), S = caminho(map.project(map.getCenter(), z0), map.project(v.c, z0), z0, v.z).S; return Math.round(Math.min(1300, Math.max(700, 520 + 380 * S))); };
  // tudo o que depende do nível (fora o mapa): trilha, coluna, linhas, legenda
  function poeNivel(noPouso) {
    alvo.classList.toggle('st-nmun', !!niv.mun);
    poeEscopo(!noPouso);
    poeCartaoMun();
    poeAviso(legenda());
    poeTrilha();
  }
  // troca de nível com o satélite aberto: tudo o que é do nível muda já; o mapa voa até o enquadramento novo (o desenho de
  // antes se mistura no de depois) e, no pouso, entram as bandeirinhas ou os nomes. porTeclado: o foco vai ao 1º cartão
  async function vaiPara(n, porTeclado) {
    if (estado !== 'on' || !D) return;
    n = valida(n);
    nivAntes = niv;
    niv = n;
    mistura = 0;
    tiraMarcas();
    realca(null);
    realceArea(null);
    balao.hidden = true;
    poeNivel(true);
    tempos.nivel = performance.now();
    const v = vistaDoNivel(n);
    preBaixa(v);
    voandoN = true;
    desenho.desenha();                                    // (o svg do voo no lugar dos canvas, já com os dois níveis)
    paneL.style.opacity = '0.3';                          // as linhas esmaecem no voo e voltam nítidas no pouso
    limites(false);
    interage(false);
    const dur = calmo() ? 0 : duracao(v);
    tempos.durNivel = dur;
    // no pouso, as linhas com o estilo do nível novo e o redesenho delas em partes (telaLinhas)
    const ok = await anima(v, dur, () => 1, e => { mistura = e; if (e >= 1) { estilizaLinhas(); if (dur && rend._map) rend._partes = true; } });
    if (!ok) return;
    // o resto do pouso (limites, bandeirinhas ou nomes) depois das linhas, num quadro à parte: o do pouso já põe os quadros
    // nítidos do satélite, e cada quadro seguinte desenha um lote das linhas (tudo junto num quadro só travava)
    const minha = vez;
    if (dur) { await rend.prontas(); await new Promise(r => requestAnimationFrame(r)); }
    if (minha !== vez || estado !== 'on') return;
    voandoN = false;
    mistura = 1;
    nivAntes = niv;
    paneL.style.opacity = '1';
    interage(true);
    limites(true);
    desenho.desenha();
    poeMarcas();
    tempos.pouso = performance.now();
    if (dur) requestAnimationFrame(() => { if (minha === vez) desenho.fixa(); }); else desenho.fixa();
    if (porTeclado) {
      const alvoF = caixaSat.querySelector('.st-card') || (trilha && !trilha.hidden && trilha.querySelector('.mt-atual, button')) || caixaSat;
      alvoF.focus({ preventScroll: true });
    }
  }
  const sobe = () => vaiPara(sobeDe(niv), true);
  async function abre() {
    if (estado === 'on' || estado === 'abrindo' || estado === 'carregando') return;
    const raiox = alvo.classList.contains('raiox');
    if (raiox) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));   // desliga o raio-X
    const voltando = estado === 'fechando';
    estado = 'carregando';
    tempos.pedido = performance.now();
    const ae = document.activeElement;
    if (!voltando) focoAntes = ae && ae !== document.body && !(caixaSat && caixaSat.contains(ae)) ? ae : null;
    const minha = ++vez;
    poeEstilo();
    const tAviso = setTimeout(() => { if (estado === 'carregando') poeAviso('<b>Satélite</b><span>carregando…</span>'); }, 120);
    const recem = !map;
    try {
      await carregaLibs();
      if (!map) await cria();
      carregaLinhas().then(poeLinhas);
    } catch (e) {
      clearTimeout(tAviso);
      estado = 'off';
      poeAviso('<b>Satélite</b><span>não carregou (sem internet?)</span>');
      setTimeout(() => { if (estado === 'off' && aviso) { aviso.hidden = true; lado.hidden = true; } }, 3500);
      return;
    }
    if (minha !== vez || estado !== 'carregando') { clearTimeout(tAviso); return; }   // Ctrl+S de novo enquanto carregava
    map.invalidateSize({ pan: false });
    limites(false);
    interage(true);
    // o nível do mapa dos municípios (a regional, o polo ou o município aberto nele)
    if (!voltando) {
      const A = window.ARGOS_MAPA, s = A && A.nivel ? A.nivel() : null;
      niv = valida(s ? { reg: s.reg, pol: s.pol, mun: s.mun } : NIV0);
      nivAntes = niv;
      mistura = 1;
    }
    clearTimeout(tAviso);
    poeNivel();
    if (!voltando) {
      // nasce com a área do mapa dos municípios, invisível, e espera os quadros da partida e o fundo do estado
      const v0 = vistaDoSvg();
      if (v0 && !recem) poeVista(v0.c, v0.z);
      if (v0) { caixaSat.dataset.k = v0.k; caixaSat.style.transform = `scaleY(${v0.k})`; }
      caixaSat.style.opacity = '0';
      recolheLegenda();
      alvo.classList.add('sat-to');
      mascara.desenha(true);
      desenho.desenha(true);
      await Promise.all([pronta(fundo, 6000), pronta(nitido, 2500)]);
      if (minha !== vez || estado !== 'carregando') return;
    } else alvo.classList.add('sat-to');
    estado = 'abrindo';
    tempos.anim = performance.now();
    const v = vistaDoNivel(niv);
    preBaixa(v);
    const o0 = +caixaSat.style.opacity || 0;
    const ok = await anima(v, calmo() ? 0 : DUR_ABRE, t => o0 + (1 - o0) * passo01(0, 0.7, t), e => { if (e > 0.9) alvo.classList.add('st-cobre'); });
    if (!ok || estado !== 'abrindo') return;
    estado = 'on';
    tempos.on = performance.now();
    alvo.classList.add('st-cobre');
    limites(true);
    paneL.style.opacity = '1';
    poeAviso(legenda());
    // as bandeirinhas e o foco num quadro à parte: o do fim da animação já prepara as linhas e põe os quadros
    const v2 = vez;
    await new Promise(r => requestAnimationFrame(r));
    if (estado !== 'on' || v2 !== vez || voandoN) return;
    poeMarcas();
    caixaSat.focus({ preventScroll: true });
  }
  // fechando: o mapa dos municípios vai direto ao nível do satélite (escondido embaixo dele, sem as transições: classe
  // st-salto) e espera o pouso dele; só então o satélite voa até a área dele e se dissolve
  async function sincroniza() {
    const A = window.ARGOS_MAPA;
    if (!A || !A.vai || !A.nivel) return;
    const s = A.nivel();
    if (igual({ reg: s.reg, pol: s.pol, mun: s.mun }, niv)) return;
    caixa.classList.add('st-salto');
    const pousou = new Promise(ok => {
      const f = () => { document.removeEventListener('argos-pouso', f); clearTimeout(t); ok(); };
      const t = setTimeout(f, 900);
      document.addEventListener('argos-pouso', f);
    });
    meu = true;
    try { await A.vai(niv.mun ? { cod: niv.mun } : niv.pol ? { polo: niv.pol } : niv.reg ? { reg: niv.reg } : {}, true); } catch (e) { /* o mapa segue como estava */ }
    meu = false;
    if (A.voando && A.voando()) await pousou;
    await new Promise(ok => requestAnimationFrame(() => ok()));
  }
  let meu = false;                                      // a troca de nível do mapa dos municípios fui eu que pedi (ao fechar)
  // a legenda da NAE (a do mapa dos municípios) não vem aberta no satélite (pedido do usuário): ele abre com ela recolhida,
  // sem os números nos cartões; a orelhinha mostra de novo. Ao fechar, ela volta como estava (a escolha guardada não muda)
  let legAntes = null;
  function recolheLegenda() {
    const A = window.ARGOS_MAPA;
    if (!A || !A.legenda || !A.legendaAberta) return;
    legAntes = A.legendaAberta();
    if (legAntes) A.legenda(false);
  }
  function devolveLegenda() {
    const A = window.ARGOS_MAPA;
    if (legAntes && A && A.legenda) A.legenda(true);
    legAntes = null;
  }
  async function fecha() {
    if (estado === 'off' || estado === 'fechando') return;
    if (estado === 'carregando') {
      ++vez; estado = 'off'; alvo.classList.remove('sat-to', 'st-cobre', 'st-nmun');
      devolveLegenda();
      if (lado) lado.hidden = true;
      if (trilha) trilha.hidden = true;
      return;
    }
    estado = 'fechando';
    tempos.fecha = performance.now();
    cancelAnimationFrame(quadro);
    ++vez;                                                 // um voo entre níveis em andamento para aqui
    voandoN = false;
    mistura = 1;
    nivAntes = niv;
    realca(null);
    realceArea(null);
    tiraMarcas();
    if (balao) balao.hidden = true;
    if (lado) lado.hidden = true;
    paneL.style.opacity = '0';
    limites(false);
    interage(true);
    await sincroniza();
    if (estado !== 'fechando') { caixa.classList.remove('st-salto'); return; }   // Ctrl+S de novo no meio: abre() tomou o lugar
    alvo.classList.remove('sat-to', 'st-cobre', 'st-nmun');   // nomes e bandeiras do mapa voltam enquanto o satélite se dissolve
    devolveLegenda();
    caixaSat.style.visibility = 'visible';                 // (a classe saiu: fica visível até o fim)
    const v = vistaDoSvg() || vistaDoEstado(), o0 = caixaSat.style.opacity === '' ? 1 : +caixaSat.style.opacity;
    const ok = await anima(v, calmo() ? 0 : DUR_FECHA, t => o0 * (1 - passo01(0.25, 1, t)));
    caixaSat.style.visibility = '';
    caixa.classList.remove('st-salto');
    if (!ok || estado !== 'fechando') return;
    estado = 'off';
    tempos.off = performance.now();
    caixaSat.style.opacity = '0';
    rend.soltaPartes();                                    // (o canvas à parte das linhas sai da memória)
    // o foco sai do satélite: volta para onde estava (sem o anel de foco num elemento que ninguém escolheu)
    const ae = document.activeElement;
    if (ae && (caixaSat.contains(ae) || (lado && lado.contains(ae)) || (trilha && trilha.contains(ae)))) {
      if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true }); else ae.blur();
    }
  }
  const alterna = () => (estado === 'on' || estado === 'abrindo' || estado === 'carregando' ? fecha() : abre());

  // raio-X ligado (Ctrl+X, ou segurar o olho): o satélite fecha. Legenda recolhida ou mostrada (sem-nae): os cartões mudam
  // de tamanho (o número sai ou volta) e são postos de novo
  let rxAntes = alvo.classList.contains('raiox'), semNae = alvo.classList.contains('sem-nae');
  new MutationObserver(() => {
    const rx = alvo.classList.contains('raiox'), sn = alvo.classList.contains('sem-nae');
    if (rx && !rxAntes && estado !== 'off' && estado !== 'fechando') fecha();
    rxAntes = rx;
    if (sn !== semNae) { semNae = sn; if (estado === 'on' && !voandoN) poeMarcas(); }
  })
    .observe(alvo, { attributes: true, attributeFilter: ['class'] });
  // visão trocada na legenda (NAE, Manutenção…): os números do nível de novo
  document.addEventListener('argos-visao', () => { if (estado !== 'on' || !D) return; poeNivel(); if (!voandoN) poeMarcas(); });
  // o mapa dos municípios trocou de nível por fora com o satélite aberto (busca da barra, Voltar): o satélite acompanha
  document.addEventListener('argos-nivel', e => {
    if (meu || estado !== 'on' || !D) return;
    const d = e.detail || {}, n = valida({ reg: d.reg, pol: d.pol, mun: d.mun });
    if (!igual(n, niv)) vaiPara(n);
  });

  // ---------- teclado ----------
  const visivel = () => !!(alvo.offsetParent || cheia());
  function tecla(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      if (!visivel()) return;
      e.preventDefault();                                  // sem o "Salvar página" do navegador
      if (e.repeat) return;
      alterna();
    } else if (e.key === 'Escape' && estado !== 'off' && estado !== 'fechando' && !e.defaultPrevented) {
      const ab = caixa.querySelector('.mt-abrindo');
      if (ab && !ab.hidden) return;                         // Esc cancela antes o "Abrindo…" do alimentador
      const ao = document.activeElement;
      if (ao && ao.closest && ao.closest('#ativo, .mt-vis-menu')) return;   // Esc na busca ou no menu da legenda: é deles
      e.preventDefault();
      e.stopPropagation();                                  // o mapa não sobe de nível nem sai da tela cheia por este Esc
      if (estado === 'on' && niv.reg) sobe(); else fecha();
    }
  }
  window.addEventListener('keydown', tecla, true);
  // cartão do município: lista (abre e fecha), mouse num alimentador realça a linha dele, clique abre a página
  caixa.addEventListener('click', e => {
    if (!cartaoMun || !cartaoMun.contains(e.target)) return;
    const al = e.target.closest('.st-al');
    if (al) { abreAl(al.dataset.al); return; }
    const b = e.target.closest('.st-mun-b');
    if (!b) return;
    const l = cartaoMun.querySelector('.st-mun-l'), sim = l.hidden;
    l.hidden = !sim;
    b.setAttribute('aria-expanded', String(sim));
  });
  caixa.addEventListener('pointerover', e => {
    if (!cartaoMun || e.pointerType !== 'mouse' || !cartaoMun.contains(e.target)) return;
    const al = e.target.closest('.st-al');
    realca(al ? al.dataset.al : null);
  });
  caixa.addEventListener('focusin', e => { const al = cartaoMun && cartaoMun.contains(e.target) && e.target.closest('.st-al'); if (al) realca(al.dataset.al); });
  // tela nova (central/): o mapa fica num quadro; com o foco na casca (dock, topo), o atalho chega lá
  try {
    const P = window.parent, fr = window.frameElement;
    if (P && P !== window && fr && P.document) {
      const h = e => { if (fr.getClientRects().length) tecla(e); };
      const poe = v => { try { P[v ? 'addEventListener' : 'removeEventListener']('keydown', h, true); } catch (er) { /* casca já foi */ } };
      poe(true);
      addEventListener('pagehide', () => poe(false));
      addEventListener('pageshow', e => { if (e.persisted) poe(true); });   // de volta pelo Voltar (bfcache)
    }
  } catch (e) { /* quadro de outra origem */ }
  // para os testes (scripts/teste_sat_to_tela.js)
  const rectCaixa = e => { const c = caixaSat.getBoundingClientRect(), q = e.getBoundingClientRect(); return { x: q.left - c.left, y: q.top - c.top, w: q.width, h: q.height }; };
  window.__satTo = { estado: () => estado, mapa: () => map, alterna, abre, fecha, linhas: () => nLinhas, semRede: () => semRede.size, sobre: () => sobre,
    vistaSvg: () => (L ? vistaDoSvg() : null), tempos,
    // parado: sem linhas entrando, sem desenho das linhas em curso, sem desenho adiado da máscara e da divisão
    ocioso: () => !!map && !pondo && !(rend && rend._job) && !(mascara && mascara.pendente()) && !(desenho && desenho.pendente()),
    pintor: () => (pintor ? 'worker' : rend && rend._img ? 'pagina' : 'canvas'),
    forca: () => { if (mascara) mascara.desenha(true); if (desenho) desenho.desenha(true); },
    // o canvas das linhas como está (feito pelo pintor ou em partes) contra o redesenho inteiro do Leaflet nele mesmo:
    // quantos valores de pixel mudam (0: o mesmo desenho)
    confereLinhas: () => {
      rend.terminaPartes();
      const cv = rend._img || rend._container, W = cv.width, H = cv.height, bb = rend._vis.b, k = L.Browser.retina ? 2 : 1;
      const tira = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      const ca = tira(), xa = ca.getContext('2d', { willReadFrequently: true });
      xa.drawImage(cv, 0, 0);
      const a = xa.getImageData(0, 0, W, H).data;
      // o L.Canvas._draw (o redesenho inteiro do Leaflet) num canvas igual
      const cb = tira(), xb = cb.getContext('2d', { willReadFrequently: true }), ctx0 = rend._ctx;
      xb.scale(k, k); xb.translate(-bb.min.x, -bb.min.y);
      rend._ctx = xb; rend._redrawBounds = null;
      try { rend._draw(); } finally { rend._ctx = ctx0; }
      const b = xb.getImageData(0, 0, W, H).data;
      let n = 0, cheios = 0;
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) n++; if ((i & 3) === 3 && a[i]) cheios++; }
      return { dif: n, px: a.length / 4, cheios, modo: rend._img ? 'imagem' : 'canvas' };
    },
    nivel: () => Object.assign({}, niv), vai: n => vaiPara(n), sobe, voando: () => voandoN,
    ocupados: () => (map ? ocupados() : []),
    destino: (x, y) => (map ? destino(map.containerPointToLatLng([x, y])) : null),
    realce: () => (realceA ? realceA.tipo + ':' + realceA.nome : null),
    escopo: () => (escopo ? [...escopo] : null),
    cores: () => (D && niv.reg ? Object.fromEntries(D.reg[niv.reg].polos.map(p => [p, D.pol[p].cor])) : null),
    // cartões (bandeirinhas) e nomes na tela: retângulos na caixa do satélite
    marcas: () => [...caixaSat.querySelectorAll('.st-card, .mt-mn')].map(e => Object.assign({ tipo: e.classList.contains('st-card') ? 'cartao' : 'nome', txt: e.textContent, area: e.dataset.area || e.dataset.cod || '' }, rectCaixa(e))),
    // anéis (lat/lon) da área aberta, para medir o preto só onde não há véu
    foco: () => { const a = areaDe(niv); return a ? a.aneis.map(({ s }) => s.map(([x, y]) => svgLL(x, y))) : null; },
    focoAntes: () => { const a = voandoN && mistura < 1 ? areaDe(nivAntes) : null; return a ? a.aneis.map(({ s }) => s.map(([x, y]) => svgLL(x, y))) : null; },
    // um ponto (px da janela do quadro) dentro da área tipo:nome, sem linha a menos de r px nem cartão por cima, o mais
    // perto do ponto do nome dela
    pontoLivre: (tipo, nome, r = 9) => {
      rend.terminaPartes();                                 // (as linhas do pouso inteiras no canvas)
      const a = tipo === 'reg' ? D.reg[nome] : tipo === 'pol' ? D.pol[nome] : D.mun[nome];
      if (!a) return null;
      const t = map.getSize(), c = caixaSat.getBoundingClientRect(), obst = ocupados().concat([...caixaSat.querySelectorAll('.st-card, .mt-mn')].map(e => {
        const q = rectCaixa(e); return { left: q.x, top: q.y, right: q.x + q.w, bottom: q.y + q.h };
      }));
      const cv = rend._img || rend._container, b = (rend._vis && rend._vis.b) || rend._bounds, s = cv.width / Math.max(1, b.max.x - b.min.x);
      const cp = document.createElement('canvas');
      cp.width = cv.width; cp.height = cv.height;
      const cx2 = cp.getContext('2d', { willReadFrequently: true });
      cx2.drawImage(cv, 0, 0);
      const px = cx2.getImageData(0, 0, cv.width, cv.height).data;
      const linha = (x, y) => {
        const lp = map.containerPointToLayerPoint([x, y]), cx = Math.round((lp.x - b.min.x) * s), cy = Math.round((lp.y - b.min.y) * s), R = Math.ceil(r * s);
        for (let j = cy - R; j <= cy + R; j++) for (let i = cx - R; i <= cx + R; i++) {
          if (i < 0 || j < 0 || i >= cv.width || j >= cv.height) continue;
          if (px[(j * cv.width + i) * 4 + 3] > 8) return true;
        }
        return false;
      };
      const rot = map.latLngToContainerPoint(a.rot);
      let melhor = null;
      for (let y = 16; y < t.y - 16; y += 6) for (let x = 16; x < t.x - 16; x += 6) {
        const ll = map.containerPointToLatLng([x, y]);
        if (!dentro(a, PA * ll.lng + PB, PC * ll.lat + PD)) continue;
        if (obst.some(o => x > o.left - 10 && x < o.right + 10 && y > o.top - 10 && y < o.bottom + 10)) continue;
        const d = Math.hypot(x - rot.x, y - rot.y);
        if (melhor && d >= melhor.d) continue;
        if (linha(x, y)) continue;
        melhor = { x, y, d };
      }
      return melhor && { x: c.left + melhor.x, y: c.top + melhor.y };
    } };
})();
