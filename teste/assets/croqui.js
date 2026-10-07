// Croqui de limpeza de faixa: do trecho selecionado (ou de vários, com Ctrl+clique) sai o Excel do modelo da Energisa
// já preenchido — chave inicial e final, coordenadas UTM (SIRGAS 2000, fuso do ponto), alimentador, extensão,
// município — e as duas figuras do trecho (satélite e esquema da rede) desenhadas aqui.
// O modelo vem de assets/croqui-modelo.js (scripts/croqui_modelo.py), carregado só quando o croqui é pedido.
(function () {
  const D = window.D, M = (D && D.meta) || {};
  const det = document.getElementById('det'), lista = document.getElementById('lista');
  if (!D || !det) return;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TR = Object.fromEntries(D.trechos.map((t, i) => [t.nome, Object.assign(t, { i })]));
  const nf = (n, d) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- UTM (SIRGAS 2000 ≈ GRS80; série de Krüger, erro < 1 mm) ----------
  function utm(lat, lon, fusoFixo) {                      // fusoFixo: as duas pontas do croqui no mesmo fuso
    const fuso = fusoFixo || Math.floor((lon + 180) / 6) + 1, a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
    const n = f / (2 - f), A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
    const al = [0, n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
    const phi = lat * Math.PI / 180, dl = (lon - (-183 + 6 * fuso)) * Math.PI / 180, r = 2 * Math.sqrt(n) / (1 + n);
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - r * Math.atanh(r * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    let E = eta, N = xi;
    for (let j = 1; j <= 3; j++) { E += al[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
    return { e: Math.round(500000 + k0 * A * E), n: Math.round((lat < 0 ? 10000000 : 0) + k0 * A * N), z: fuso, fuso: fuso + (lat < 0 ? 'S' : 'N') };
  }
  const dist = (a, b) => { const k = Math.cos(a[0] * Math.PI / 180); return Math.hypot(a[0] - b[0], (a[1] - b[1]) * k) * 111320; };

  // ---------- o que está selecionado no mapa ----------
  function selecionados() {
    if (window.__selecao) return window.__selecao().filter(n => TR[n]);
    const varios = [...det.querySelectorAll('.varios [data-t]')].map(b => b.dataset.t);
    if (varios.length) return varios.filter(n => TR[n]);
    const h2 = det.querySelector('h2');
    const nome = h2 ? [...h2.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim() : '';
    return TR[nome] ? [nome] : [];
  }

  // dados do croqui a partir dos trechos
  function dados(nomes) {
    const ts = nomes.map(n => TR[n]);
    const inicios = ts.map(t => ({ cod: t.inicio, ll: [t.inicio_lat, t.inicio_lon], d: t.dist_inicio ?? 0, t: t.nome }));
    const deles = new Set(ts.map(t => t.inicio));
    let fins = ts.flatMap(t => t.fim.map((f, j) => ({ cod: f, ll: t.fim_pts[j], t: t.nome })));
    if (fins.some(f => !deles.has(f.cod))) fins = fins.filter(f => !deles.has(f.cod));   // fim que é início de outro escolhido é interno
    const ini = inicios.slice().sort((a, b) => a.d - b.d)[0];
    fins.sort((a, b) => dist(b.ll, ini.ll) - dist(a.ll, ini.ll));                          // o mais longe do início primeiro
    const nomeMun = Object.fromEntries((M.municipios || []).map(m => [m.cod, m.nome]));
    const ordem = Object.fromEntries((M.municipios || []).map((m, i) => [m.cod, -(m.m || 0)]));
    const muns = [...new Set(ts.flatMap(t => (M.trecho_mun || {})[t.nome] || []))].sort((a, b) => (ordem[a] || 0) - (ordem[b] || 0)).map(c => nomeMun[c] || c);
    const ext = ts.reduce((s, t) => s + t.ext, 0);
    return { ts, inicios: inicios.sort((a, b) => a.d - b.d), fins, ext, muns };
  }
  // comprimento (m) do caminho pela rede, só nos vãos dos trechos escolhidos, da chave inicial até a final
  function caminho(nomes, ini, fim) {
    const idx = new Set(nomes.map(n => TR[n].i)), viz = new Map(), pts = new Map();
    const chave = (la, lo) => la.toFixed(6) + ',' + lo.toFixed(6);
    const liga = (a, b, m) => { if (!viz.has(a)) viz.set(a, []); viz.get(a).push([b, m]); };
    D.vaos.forEach(v => {
      if (!idx.has(v[4])) return;
      const a = chave(v[0], v[1]), b = chave(v[2], v[3]);
      pts.set(a, [v[0], v[1]]); pts.set(b, [v[2], v[3]]); liga(a, b, v[8]); liga(b, a, v[8]);
    });
    const perto = ll => { let melhor = null, dm = Infinity; pts.forEach((p, k) => { const x = dist(p, ll); if (x < dm) { dm = x; melhor = k; } }); return dm < 60 ? melhor : null; };
    const s = perto(ini.ll), t = perto(fim.ll);
    if (!s || !t) return null;
    const dd = new Map([[s, 0]]), feito = new Set();
    for (;;) {
      let u = null, du = Infinity;
      dd.forEach((v, k) => { if (!feito.has(k) && v < du) { du = v; u = k; } });
      if (u === null) return null;
      if (u === t) return du;
      feito.add(u);
      (viz.get(u) || []).forEach(([w, m]) => { if (du + m < (dd.get(w) ?? Infinity)) dd.set(w, du + m); });
    }
  }
  const textoFim = c => {                                   // 'fim de linha · poste 123' → 'FIM DE LINHA (POSTE 123)'; poste N… é sem número
    if (!/^fim de linha/i.test(c)) return c;
    const p = (c.match(/poste\s+(\S+)/i) || [])[1];
    return 'FIM DE LINHA' + (p && !/^N\d+$/i.test(p) ? ` (POSTE ${p})` : '');
  };
  const listaMun = l => l.length < 2 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
  const munCroqui = l => l.length <= 2 ? listaMun(l).replace(' e ', ' E ') : `${l[0]}, ${l[1]} E OUTROS`;   // a descrição tem espaço para pouco

  // ---------- figuras do trecho (canvas) ----------
  const TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  const mx = lon => (lon + 180) / 360 * 256, my = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256; };
  function enquadra(nomes, W, H, pad) {
    const idx = new Set(nomes.map(n => TR[n].i));
    const meus = D.vaos.filter(v => idx.has(v[4]));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    meus.forEach(v => [[v[0], v[1]], [v[2], v[3]]].forEach(([la, lo]) => { const x = mx(lo), y = my(la); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    const uw = W * (1 - pad.l - pad.r), uh = H * (1 - pad.t - pad.b);
    const z = Math.min(18, Math.log2(Math.min(uw / Math.max(x1 - x0, 1e-9), uh / Math.max(y1 - y0, 1e-9))));
    const k = 2 ** z, cx = (x0 + x1) / 2 * k, cy = (y0 + y1) / 2 * k;
    const ox = cx - (pad.l * W + uw / 2), oy = cy - (pad.t * H + uh / 2);
    return { z, k, ox, oy, idx, p: (la, lo) => [mx(lo) * k - ox, my(la) * k - oy] };
  }
  function satelite(ctx, W, H, q) {
    const zt = Math.min(18, Math.ceil(q.z)), s = 2 ** (q.z - zt), tam = 256 * s;
    const tx0 = Math.floor(q.ox / tam), ty0 = Math.floor(q.oy / tam), tx1 = Math.floor((q.ox + W) / tam), ty1 = Math.floor((q.oy + H) / tam);
    const pedidos = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
      pedidos.push(new Promise((ok, erro) => {
        const im = new Image(); im.crossOrigin = 'anonymous';
        const t = setTimeout(() => erro(new Error('tempo')), 12000);
        im.onload = () => { clearTimeout(t); ok([im, x, y]); }; im.onerror = () => { clearTimeout(t); erro(new Error('tile')); };
        im.src = `${TILE}${zt}/${y}/${x}`;
      }));
    }
    return Promise.all(pedidos).then(ims => {
      ims.forEach(([im, x, y]) => ctx.drawImage(im, x * tam - q.ox, y * tam - q.oy, tam + 0.5, tam + 0.5));
      ctx.getImageData(0, 0, 1, 1);                                          // falha aqui se a imagem não puder ser usada (CORS)
      return true;
    });
  }
  function linhas(ctx, q, filtro, estilo) {
    ctx.beginPath();
    D.vaos.forEach(v => { if (!filtro(v)) return; const a = q.p(v[0], v[1]), b = q.p(v[2], v[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
    Object.assign(ctx, estilo); ctx.stroke(); ctx.setLineDash([]);
  }
  function pino(ctx, x, y, rotulo, cor) {
    ctx.save();
    ctx.fillStyle = cor; ctx.strokeStyle = '#1b2024'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 22, 10, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b2024'; ctx.beginPath(); ctx.arc(x, y - 22, 3.5, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '600 22px Arial, sans-serif'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(rotulo).width, lx = x + w + 30 > ctx.canvas.width ? x - w - 18 : x + 16;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(rotulo, lx, y - 22);
    ctx.fillStyle = '#fff'; ctx.fillText(rotulo, lx, y - 22);
    ctx.restore();
  }
  function moldura(ctx, W, H, q, fundoEscuro) {
    // escala gráfica (m por pixel na latitude do centro); o norte já está no modelo, ao lado das figuras
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (q.oy + H / 2) / q.k / 256))) * 180 / Math.PI;
    const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / q.k;
    const alvo = mpp * W * 0.22, ordem = 10 ** Math.floor(Math.log10(alvo));
    const m = [1, 2, 5, 10].map(x => x * ordem).filter(x => x <= alvo).pop(), px = m / mpp;
    const cor = fundoEscuro ? '#fff' : '#1b2024', sombra = fundoEscuro ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)';
    ctx.save(); ctx.font = '600 18px Arial, sans-serif'; ctx.lineWidth = 4;
    const x0 = 24, y0 = H - 28;
    ctx.strokeStyle = sombra; ctx.strokeRect(x0, y0, px, 8); ctx.fillStyle = cor; ctx.fillRect(x0, y0, px, 8);
    const txt = m >= 1000 ? nf(m / 1000, m % 1000 ? 1 : 0) + ' km' : m + ' m';
    ctx.strokeText(txt, x0, y0 - 10); ctx.fillText(txt, x0, y0 - 10);
    ctx.restore();
  }
  async function figura(nomes, ini, fim, tipo, prop) {      // prop: largura/altura da caixa da figura no modelo
    const W = tipo === 'sat' ? 1100 : 900, H = Math.round(W / (prop || (tipo === 'sat' ? 1100 / 996 : 900 / 866)));
    // no satélite, o trecho fica na faixa do meio: as etiquetas do Excel ficam em cima e embaixo da figura
    const pad = tipo === 'sat' ? { l: .12, r: .12, t: .27, b: .24 } : { l: .15, r: .15, t: .15, b: .15 };
    const novo = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    let cv = novo(), ctx = cv.getContext('2d'), comSat = false;
    const q = enquadra(nomes, W, H, pad);
    if (tipo === 'sat') {
      try { comSat = await satelite(ctx, W, H, q); } catch (e) { comSat = false; }
      if (!comSat) { cv = novo(); ctx = cv.getContext('2d'); ctx.fillStyle = '#e8ece4'; ctx.fillRect(0, 0, W, H); }
      linhas(ctx, q, v => !q.idx.has(v[4]), { strokeStyle: comSat ? 'rgba(255,255,255,.55)' : 'rgba(60,70,80,.45)', lineWidth: 2 });
      linhas(ctx, q, v => q.idx.has(v[4]), { strokeStyle: comSat ? 'rgba(255,255,255,.9)' : '#fff', lineWidth: 8, lineCap: 'round', lineJoin: 'round' });
      linhas(ctx, q, v => q.idx.has(v[4]), { strokeStyle: '#1d3cf5', lineWidth: 4.5, lineCap: 'round', lineJoin: 'round' });
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.setLineDash([6, 5]); linhas(ctx, q, v => !q.idx.has(v[4]), { strokeStyle: '#22c55e', lineWidth: 1.6, lineCap: 'butt' });
      linhas(ctx, q, v => q.idx.has(v[4]), { strokeStyle: '#7dd3fc', lineWidth: 7, lineCap: 'round', lineJoin: 'round' });
      linhas(ctx, q, v => q.idx.has(v[4]), { strokeStyle: '#fff', lineWidth: 3.5, lineCap: 'round', lineJoin: 'round' });
      [...(D.fusiveis || []), ...(D.principais || [])].forEach(a => {
        const [x, y] = q.p(a.lat, a.lon); if (x < 0 || y < 0 || x > W || y > H) return;
        ctx.fillStyle = '#22d3ee'; ctx.fillRect(x - 4, y - 4, 8, 8);
      });
    }
    const pi = q.p(ini.ll[0], ini.ll[1]), pf = q.p(fim.ll[0], fim.ll[1]);
    pino(ctx, pi[0], pi[1], ini.cod, '#facc15');
    pino(ctx, pf[0], pf[1], textoFim(fim.cod), '#facc15');
    moldura(ctx, W, H, q, tipo !== 'sat' || comSat);
    if (comSat) { ctx.font = '13px Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'right'; ctx.fillText('Imagem © Esri, Maxar, Earthstar Geographics', W - 10, H - 10); }
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    return { blob, W, H, pi, pf, comSat };
  }

  // ---------- Excel: modelo + células + figuras ----------
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  function celula(sheet, ref, valor) {                      // valor: número, texto ou vazio (mantém o estilo)
    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    if (!re.test(sheet)) throw new Error('modelo sem a célula ' + ref);
    return sheet.replace(re, (m, at) => {
      const s = (at.match(/\ss="\d+"/) || [''])[0];
      if (valor === null || valor === undefined || valor === '') return `<c r="${ref}"${s}/>`;
      if (typeof valor === 'number') return `<c r="${ref}"${s}><v>${valor}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
    });
  }
  function cache(sheet, ref, valor, troca) {                // resultado guardado de uma fórmula (o Excel recalcula ao abrir)
    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
    const m0 = sheet.match(re);
    if (!m0 || !/<f[\s>\/]/.test(m0[2] || '')) throw new Error('modelo sem a fórmula em ' + ref);
    return sheet.replace(re, (m, at, corpo) => {
      let f = (corpo.match(/<f[^>]*>[\s\S]*?<\/f>|<f[^>]*\/>/) || [''])[0];
      if (troca) f = troca(f);
      const a = at.replace(/\st="[^"]*"/, '') + (typeof valor === 'string' ? ' t="str"' : '');
      return `<c r="${ref}"${a}>${f}<v>${typeof valor === 'string' ? xml(valor) : valor}</v></c>`;
    });
  }
  const numCel = (sheet, ref) => {
    const m = sheet.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`));
    return +(((m && m[1]) || '').match(/<v>([^<]*)<\/v>/) || [])[1] || 0;
  };
  const br = n => String(Math.round(n * 1000) / 1000).replace('.', ',');

  function planilha(sheet, c) {
    const conv = c.tipo === 'Convencional', exp = c.tipo === 'Expedita';
    const g43 = c.desloc || 0, g44 = c.km, g45 = g43 + g44;
    const val = { U2: c.os, U3: c.ini, U4: c.iniU.e, U5: c.iniU.n, U6: c.fim, U7: c.fimU.e, U8: c.fimU.n, U9: c.al, U10: c.obra,
      U11: c.km, U12: c.desloc === null ? null : c.desloc, U13: c.tipo };
    const cod = v => /^[1-9]\d{0,14}$/.test(String(v)) ? +v : String(v);   // 0300… fica texto para não perder o zero
    val.U3 = cod(c.ini); val.U6 = cod(c.fim);
    const fz = ` (UTM ${c.iniU.fuso} SIRGAS 2000)`;           // o modelo diz Longitude/Latitude, mas os valores são E/N em UTM
    Object.assign(val, { T4: 'Longitude Ativo Inicial' + fz, T5: 'Latitude Ativo Inicial' + fz, T7: 'Longitude Ativo Final' + fz, T8: 'Latitude Ativo Final' + fz });
    Object.entries(val).forEach(([r, v]) => { sheet = celula(sheet, r, typeof v === 'number' || v === null ? v : String(v)); });
    const t = x => x === null || x === undefined ? '' : String(x);
    sheet = cache(sheet, 'Y2', `ATIVO INICIAL: ${c.ini}\nLONGITUDE:  ${c.iniU.e}\nLATITUDE: ${c.iniU.n}`);
    sheet = cache(sheet, 'Y3', `ATIVO FINAL: ${c.fim}\nLONGITUDE:  ${c.fimU.e}\nLATITUDE: ${c.fimU.n}`);
    sheet = cache(sheet, 'L41', `OS: ${t(c.os)}\nChave Referência: ${c.ini}\nAlimentador: ${c.al}\nObra: ${t(c.obra)}`);
    const mun = c.mun.toUpperCase().replace(/"/g, '""');
    sheet = cache(sheet, 'I42', `Faixa de aproximadamente ${br(g44)}km/MT. Chave inicial  ${c.ini} até a chave ${c.fim} no alimentador ${c.al}, trecho localizado em ${c.mun.toUpperCase()} conforme indicação e coordenadas.`,
      f => f.replace(/localizado em [^"&]*? conforme/, `localizado em ${xml(mun)} conforme`));
    sheet = cache(sheet, 'G43', g43); sheet = cache(sheet, 'G44', g44); sheet = cache(sheet, 'G45', g45); sheet = cache(sheet, 'G46', g43 + g44 + g45);
    sheet = cache(sheet, 'T17', conv ? 'LIMPEZA (M²) PREVISTO 25501' : 'LIMPEZA EXPEDITA (M) 13602');
    sheet = cache(sheet, 'U17', conv ? 'ABERTURA (M²) PREVISTO 25502' : '');
    sheet = cache(sheet, 'T18', exp ? g44 * 1000 : g44 ? g44 * 15000 * 0.8 : '');
    sheet = cache(sheet, 'U18', exp ? '' : g44 ? g44 * 15000 * 0.2 : '');
    const r43 = conv ? numCel(sheet, 'X22') : exp ? numCel(sheet, 'X25') : 0, r44 = conv ? numCel(sheet, 'X23') : exp ? numCel(sheet, 'X24') : 0;
    sheet = cache(sheet, 'R43', r43); sheet = cache(sheet, 'R44', r44); sheet = cache(sheet, 'R45', r43 + r44);
    return sheet;
  }
  // posição na planilha (EMU) a partir das âncoras de célula — é assim que o Excel e o LibreOffice posicionam
  function grade(sheet) {
    const mdw = 7, px = w => Math.trunc(((256 * w + Math.trunc(128 / mdw)) / 256) * mdw);   // Calibri 11: dígito de 7 px
    const larguraPadrao = +((sheet.match(/<sheetFormatPr[^>]*defaultColWidth="([\d.]+)"/) || [])[1] || 8.43);
    const alturaPadrao = +((sheet.match(/<sheetFormatPr[^>]*defaultRowHeight="([\d.]+)"/) || [])[1] || 15);
    const cols = [...sheet.matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g)].map(m => [+m[1], +m[2], +m[3]]);
    const alturas = {};
    for (const m of sheet.matchAll(/<row r="(\d+)"[^>]*?\sht="([\d.]+)"/g)) alturas[+m[1] - 1] = +m[2];
    const larg = c => { const k = cols.find(([a, b]) => c + 1 >= a && c + 1 <= b); return px(k ? k[2] : larguraPadrao) * 9525; };
    const alt = r => (alturas[r] ?? alturaPadrao) * 12700;
    const soma = (n, f) => { let t = 0; for (let i = 0; i < n; i++) t += f(i); return t; };
    return (a) => {                                         // âncora (twoCellAnchor) → [x, y, largura, altura]
      const p = tag => (a.match(new RegExp(`<xdr:${tag}><xdr:col>(\\d+)</xdr:col><xdr:colOff>(-?\\d+)</xdr:colOff><xdr:row>(\\d+)</xdr:row><xdr:rowOff>(-?\\d+)</xdr:rowOff></xdr:${tag}>`)) || []).slice(1).map(Number);
      const f = p('from'), t = p('to');
      if (f.length < 4 || t.length < 4) return null;
      const x0 = soma(f[0], larg) + f[1], y0 = soma(f[2], alt) + f[3];
      return [x0, y0, soma(t[0], larg) + t[1] - x0, soma(t[2], alt) + t[3] - y0];
    };
  }
  function proporcoes() {                                  // { sat, gis }: largura/altura das caixas das figuras no modelo
    try {
      const P = window.CROQUI_MODELO.partes, caixa = grade(P.find(p => p[0] === 'xl/worksheets/sheet1.xml')[2]);
      const anc = (P.find(p => p[0] === 'xl/drawings/drawing1.xml')[2].match(/<xdr:twoCellAnchor[^>]*>[\s\S]*?<\/xdr:twoCellAnchor>/g) || []);
      const pr = id => { const a = anc.find(x => new RegExp(`r:embed="${id}"`).test(x)), r = a && caixa(a); return r && r[3] > 0 ? r[2] / r[3] : null; };
      return { sat: pr('rId1'), gis: pr('rId4') };
    } catch (e) { return {}; }
  }
  // etiquetas ATIVO INICIAL / FINAL (ligadas a Y2 e Y3): texto novo e a linha apontando para o pino da figura
  function desenho(dr, c, fig, sheet) {
    const caixa = grade(sheet);
    const ancoras = (dr.match(/<xdr:twoCellAnchor[^>]*>[\s\S]*?<\/xdr:twoCellAnchor>/g) || []);
    const aPic = ancoras.find(a => /r:embed="rId1"/.test(a));
    let aIni = ancoras.find(a => /textlink="\$Y\$2"/.test(a)), aFim = ancoras.find(a => /textlink="\$Y\$3"/.test(a));
    if (!aPic || !aIni || !aFim) throw new Error('modelo sem as etiquetas ATIVO INICIAL/FINAL');
    const velhoIni = aIni, velhoFim = aFim;
    if (fig.pi[1] > fig.pf[1]) {                             // início embaixo: troca as caixas de lugar (as linhas não se cruzam)
      const pos = a => a.match(/<xdr:from>[\s\S]*?<\/xdr:to>/)[0], xf = a => a.match(/<a:off [^>]*\/><a:ext [^>]*\/>/)[0];
      [aIni, aFim] = [aIni.replace(pos(aIni), () => pos(velhoFim)).replace(xf(aIni), () => xf(velhoFim)),
                      aFim.replace(pos(aFim), () => pos(velhoIni)).replace(xf(aFim), () => xf(velhoIni))];
    }
    const R = caixa(aPic);
    const ponto = p => [R[0] + p[0] / fig.W * R[2], R[1] + p[1] / fig.H * R[3]];
    const ajusta = (a, txt, alvo) => {
      a = a.replace(/<a:t>[\s\S]*?<\/a:t>/, () => `<a:t>${xml(txt)}</a:t>`);
      const box = caixa(a);
      if (!box) return a;                                    // borderCallout1: adj1/adj2 = ponta (y, x); adj3/adj4 = onde a linha sai da caixa
      const y = Math.round((alvo[1] - box[1]) / box[3] * 100000), x = Math.round((alvo[0] - box[0]) / box[2] * 100000);
      const dx = x < 0 ? -x : x > 100000 ? x - 100000 : 0, dy = y < 0 ? -y : y > 100000 ? y - 100000 : 0;
      const [sy, sx] = dx * box[2] >= dy * box[3] ? [50000, x < 50000 ? 0 : 100000] : [y < 50000 ? 0 : 100000, 50000];
      [[1, y], [2, x], [3, sy], [4, sx]].forEach(([k, v]) => { a = a.replace(new RegExp(`(<a:gd name="adj${k}" fmla="val )-?\\d+`), `$1${v}`); });
      return a;
    };
    aIni = ajusta(aIni, `ATIVO INICIAL: ${c.ini}\nLONGITUDE:  ${c.iniU.e}\nLATITUDE: ${c.iniU.n}`, ponto(fig.pi));
    aFim = ajusta(aFim, `ATIVO FINAL: ${c.fim}\nLONGITUDE:  ${c.fimU.e}\nLATITUDE: ${c.fimU.n}`, ponto(fig.pf));
    return dr.replace(velhoIni, () => aIni).replace(velhoFim, () => aFim);
  }
  // zip sem compressão (o Excel abre normalmente)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(arqs) {
    const enc = new TextEncoder(), partes = [], central = [];
    let pos = 0;
    const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    arqs.forEach(([nome, dado]) => {
      const n = enc.encode(nome), crc = crc32(dado), h = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, hora, 2], [12, data, 2], [14, crc, 4], [18, dado.length, 4], [22, dado.length, 4], [26, n.length, 2], [28, 0, 2]]
        .forEach(([o, v, t]) => t === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
      const c = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, hora, 2], [14, data, 2], [16, crc, 4], [20, dado.length, 4], [24, dado.length, 4],
       [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, pos, 4]]
        .forEach(([o, v, t]) => t === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
      partes.push(new Uint8Array(h.buffer), n, dado); central.push(new Uint8Array(c.buffer), n);
      pos += 30 + n.length + dado.length;
    });
    const tam = central.reduce((s, u) => s + u.length, 0), fimz = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, arqs.length, 2], [10, arqs.length, 2], [12, tam, 4], [16, pos, 4], [20, 0, 2]]
      .forEach(([o, v, t]) => t === 4 ? fimz.setUint32(o, v, true) : fimz.setUint16(o, v, true));
    return new Blob([...partes, ...central, new Uint8Array(fimz.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  async function excel(c, figSat, figGis) {
    const enc = new TextEncoder(), arqs = [];
    const sheetModelo = window.CROQUI_MODELO.partes.find(p => p[0] === 'xl/worksheets/sheet1.xml')[2];
    for (const [nome, tipo, conteudo] of window.CROQUI_MODELO.partes) {
      let dado;
      if (nome === 'xl/worksheets/sheet1.xml') dado = enc.encode(planilha(conteudo, c));
      else if (nome === 'xl/drawings/drawing1.xml') dado = enc.encode(desenho(conteudo, c, figSat, sheetModelo));
      else if (nome === 'xl/workbook.xml') dado = enc.encode(conteudo.replace(/<calcPr([^>]*?)\/>/, (m, a) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`));
      else if (nome === 'xl/media/image1.png') dado = new Uint8Array(await figSat.blob.arrayBuffer());
      else if (nome === 'xl/media/image4.png') dado = new Uint8Array(await figGis.blob.arrayBuffer());
      else dado = tipo === 't' ? enc.encode(conteudo) : b64(conteudo);
      arqs.push([nome, dado]);
    }
    return zip(arqs);
  }
  function carregaModelo() {
    if (window.CROQUI_MODELO) return Promise.resolve();
    return new Promise((ok, erro) => {
      const s = document.createElement('script'); s.src = '../../assets/croqui-modelo.js';
      s.onload = () => window.CROQUI_MODELO ? ok() : erro(new Error('modelo')); s.onerror = () => erro(new Error('modelo'));
      document.head.append(s);
    });
  }

  // ---------- janela ----------
  const css = document.createElement('style');
  css.textContent = `.croqui-btn{font:600 var(--t-sm,13px)/1 var(--f-body,system-ui);padding:0 var(--s3,12px);min-height:var(--alvo,40px);border:1px solid var(--line-forte,var(--line));border-radius:var(--r2,10px);background:var(--paper);color:var(--fg);cursor:pointer;display:inline-flex;gap:var(--s2,8px);align-items:center;margin:var(--s1,4px) 0 var(--s3,12px);transition:border-color var(--dur,160ms) var(--ease,ease),background var(--dur,160ms) var(--ease,ease)}
.croqui-btn:hover{border-color:var(--accent);background:var(--hover,transparent)}.croqui-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
dialog.croqui{border:1px solid var(--line);border-radius:var(--r3,14px);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px);background:var(--paper);color:var(--fg);box-shadow:var(--sh2,0 20px 60px rgba(0,0,0,.35))}
dialog.croqui::backdrop{background:rgb(10 14 17 / .5)}
@media (prefers-reduced-motion:no-preference){dialog.croqui[open]{animation:croqui-entra var(--dur-l,220ms) var(--ease,ease)}}
@keyframes croqui-entra{from{opacity:0;transform:translateY(6px)}}
.croqui form{display:grid;gap:var(--s4,16px);padding:var(--s5,24px) var(--s5,24px) 0}
.croqui .topo{display:flex;align-items:center;justify-content:space-between;gap:var(--s3,12px)}
.croqui .fecha{flex:none;width:var(--alvo,40px);height:var(--alvo,40px);border:0;border-radius:var(--r2,10px);background:transparent;color:var(--muted);font-size:18px;cursor:pointer}
.croqui .fecha:hover{background:var(--hover,transparent);color:var(--fg)}.croqui .fecha:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.croqui h2{margin:0;font:600 var(--t-xl,20px)/1.2 var(--f-display,var(--f-body,system-ui))}
.croqui p{margin:0;font-size:var(--t-sm,13px);color:var(--muted)}
.croqui dl{display:grid;grid-template-columns:auto 1fr;gap:var(--s1,4px) var(--s3,12px);margin:0;font-size:var(--t-sm,13px)}.croqui dt{color:var(--muted)}
.croqui dd{margin:0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.croqui .campos{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3,12px)}.croqui label{display:grid;gap:var(--s1,4px);font-size:var(--t-xs,12px);color:var(--muted)}
.croqui input,.croqui select{font:var(--t-base,15px) var(--f-body,system-ui);color:var(--fg);background:var(--paper);border:1px solid var(--line-forte,var(--line));border-radius:var(--r2,10px);padding:0 var(--s3,12px);min-height:var(--alvo,40px);min-width:0;width:100%}
.croqui input:focus-visible,.croqui select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.croqui .fig{width:100%;height:clamp(140px,26svh,260px);border-radius:var(--r2,10px);background:var(--bg) center/cover no-repeat}
.croqui .acoes{position:sticky;bottom:0;display:flex;gap:var(--s2,8px);justify-content:flex-end;flex-wrap:wrap;margin:0 calc(-1 * var(--s5,24px));padding:var(--s3,12px) var(--s5,24px) var(--s4,16px);background:var(--paper);border-top:1px solid var(--line)}
.croqui .acoes button{font:600 var(--t-md,14px) var(--f-body,system-ui);padding:0 var(--s4,16px);min-height:var(--alvo,40px);border-radius:var(--r2,10px);cursor:pointer;border:1px solid var(--line-forte,var(--line));background:var(--paper);color:var(--fg)}
.croqui .acoes button[value=baixar]{background:var(--accent);border-color:var(--accent);color:var(--on-accent,#fff)}.croqui .acoes button:disabled{opacity:.6;cursor:progress}
@media (max-width:520px){.croqui .campos{grid-template-columns:1fr}.croqui form{padding:var(--s4,16px) var(--s4,16px) 0}.croqui .acoes{margin:0 calc(-1 * var(--s4,16px));padding:var(--s3,12px) var(--s4,16px)}.croqui input,.croqui select{font-size:16px;min-height:44px}}`;
  document.head.append(css);

  let municipiosDoTrecho = null;                          // { trecho: { cod: metros } } do JSON canônico (só quando precisa)
  async function rede() {
    if (municipiosDoTrecho) return municipiosDoTrecho;
    try {
      const r = await fetch(`../../dados/alimentadores/${encodeURIComponent(M.al)}.json`);
      const c = await r.json();
      municipiosDoTrecho = Object.fromEntries(c.trechos.map(t => [t.nome, t.municipios || {}]));
    } catch (e) { municipiosDoTrecho = {}; }
    return municipiosDoTrecho;
  }
  async function abre() {
    const nomes = selecionados();
    if (!nomes.length) return;
    const d = dados(nomes);
    let prop = {};
    try { await carregaModelo(); prop = proporcoes(); } catch (e) { /* sem o modelo, a janela abre e o erro aparece ao baixar */ }
    const mt = await rede(), soma = {};
    nomes.forEach(n => Object.entries(mt[n] || {}).forEach(([cod, m]) => { if (cod !== 'None') soma[cod] = (soma[cod] || 0) + m; }));
    if (Object.keys(soma).length) {                          // município onde o trecho tem mais rede primeiro
      const nomeMun = Object.fromEntries((M.municipios || []).map(m => [m.cod, m.nome]));
      d.muns = Object.keys(soma).sort((a, b) => soma[b] - soma[a]).map(c => nomeMun[c] || c);
    }
    const dlg = document.createElement('dialog'); dlg.className = 'croqui';
    const opt = (l, f) => l.map((x, i) => `<option value="${i}">${esc(f(x))}</option>`).join('');
    dlg.innerHTML = `<form method="dialog">
      <div class="topo"><h2>Croqui de limpeza de faixa</h2><button type="button" class="fecha" aria-label="Fechar">✕</button></div>
      <p>Preenchido a partir do mapa. Confira e complete OS, obra e deslocamento se quiser (dá para completar depois no Excel).</p>
      <div class="fig" role="img" aria-label="Figura do trecho no croqui"></div>
      <dl><dt>Alimentador</dt><dd>${esc(M.al)} · ${esc(M.se_nome || M.se || '')}</dd>
        <dt>Trecho${nomes.length > 1 ? 's' : ''}</dt><dd>${esc(nomes.join(', '))}</dd>
        <dt>Extensão</dt><dd class="u-ext">${nf(d.ext / 1000, 2)} km</dd>
        <dt>Município</dt><dd>${esc(listaMun(d.muns)) || '—'}</dd>
        <dt>Início</dt><dd class="u-ini"></dd><dt>Fim</dt><dd class="u-fim"></dd></dl>
      <div class="campos">
        <label>Chave inicial<select name="ini">${opt(d.inicios, x => x.cod + (nomes.length > 1 ? ' · ' + x.t : ''))}</select></label>
        <label>Chave final<select name="fim">${opt(d.fins, x => textoFim(x.cod) + (nomes.length > 1 ? ' · ' + x.t : ''))}</select></label>
        <label>Faixa a limpar<select name="base"><option value="total">Trecho inteiro</option><option value="caminho">Só entre as chaves</option></select></label>
        <label>Tamanho da faixa (km)<input name="km" type="number" step="0.01" min="0" value="${(Math.round(d.ext / 10) / 100).toFixed(2)}"></label>
        <label>Tipo<select name="tipo"><option>Convencional</option><option>Expedita</option></select></label>
        <label>OS<input name="os" autocomplete="off" placeholder="ETO-RD-.. 00000/2026"></label>
        <label>Obra<input name="obra" autocomplete="off"></label>
        <label>Deslocamento até o ponto inicial (km)<input name="desloc" type="number" step="1" min="0" inputmode="numeric"></label>
      </div>
      <div class="acoes"><button type="button" class="cancela">Cancelar</button><button value="baixar">Baixar croqui (Excel)</button></div>
    </form>`;
    document.body.append(dlg);
    const f = dlg.querySelector('form'), fig = dlg.querySelector('.fig');
    dlg.querySelectorAll('.fecha, .cancela').forEach(b => b.addEventListener('click', () => dlg.close()));
    const escolha = () => ({ ini: d.inicios[+f.ini.value], fim: d.fins[+f.fim.value] });
    const coords = () => {
      const { ini, fim } = escolha(), a = utm(ini.ll[0], ini.ll[1]), b = utm(fim.ll[0], fim.ll[1], a.z);
      const nb = x => String(x).replace(/ /g, '\u00a0');      // E/N e o número não se separam na quebra de linha
      dlg.querySelector('.u-ini').textContent = `${ini.cod} · ${nb('E ' + a.e)} · ${nb('N ' + a.n)} ${nb('(UTM ' + a.fuso + ')')}`;
      dlg.querySelector('.u-fim').textContent = `${textoFim(fim.cod)} · ${nb('E ' + b.e)} · ${nb('N ' + b.n)} ${nb('(UTM ' + b.fuso + ')')}`;
      return { a, b };
    };
    let gerando = null;
    const desenha = () => {
      const { ini, fim } = escolha();
      fig.style.backgroundImage = '';
      gerando = Promise.all([figura(nomes, ini, fim, 'sat', prop.sat), figura(nomes, ini, fim, 'gis', prop.gis)]).then(r => {
        fig.style.backgroundImage = `url(${URL.createObjectURL(r[0].blob)})`; return r;
      });
      return gerando;
    };
    // tamanho da faixa: trecho inteiro (com os ramais curtos dentro dele) ou só o caminho de uma chave à outra
    const km2 = m => (Math.round(m / 10) / 100).toFixed(2);
    let entre = null, kmDigitado = false;
    f.km.addEventListener('input', () => { kmDigitado = true; });
    const tamanho = (escolheuBase) => {
      if (escolheuBase === true) kmDigitado = false;
      const { ini, fim } = escolha();
      entre = caminho(nomes, ini, fim);
      f.base.options[0].textContent = `Trecho inteiro (${nf(d.ext / 1000, 2)} km)`;
      f.base.options[1].textContent = entre === null ? 'Só entre as chaves (sem ligação)' : `Só entre as chaves (${nf(entre / 1000, 2)} km)`;
      f.base.options[1].disabled = entre === null;
      if (entre === null && f.base.value === 'caminho') f.base.value = 'total';
      if (!kmDigitado) f.km.value = km2(f.base.value === 'caminho' ? entre : d.ext);   // o que a pessoa digitou fica
      dlg.querySelector('.u-ext').textContent = `${nf(d.ext / 1000, 2)} km` + (entre !== null ? ` · entre as chaves ${nf(entre / 1000, 2)} km` : '');
    };
    coords(); tamanho(); desenha();
    f.ini.addEventListener('change', () => { coords(); tamanho(); desenha(); });
    f.fim.addEventListener('change', () => { coords(); tamanho(); desenha(); });
    f.base.addEventListener('change', () => tamanho(true));
    dlg.addEventListener('close', () => dlg.remove());
    f.addEventListener('submit', async e => {                // Enter num campo também baixa
      e.preventDefault();
      const bt = f.querySelector('button[value=baixar]'); bt.disabled = true; bt.textContent = 'Gerando…';
      try {
        await carregaModelo();
        if (!prop.sat) { prop = proporcoes(); desenha(); }   // o modelo não tinha carregado ao abrir
        const [sat, gis] = await gerando;
        const { ini, fim } = escolha(), { a, b } = coords();
        const km = Math.max(0, +f.km.value || 0), desloc = f.desloc.value === '' ? null : Math.max(0, +f.desloc.value);
        const c = { ini: ini.cod, fim: textoFim(fim.cod), iniU: a, fimU: b, al: M.al, km, desloc, tipo: f.tipo.value,
          os: f.os.value.trim(), obra: f.obra.value.trim(), mun: munCroqui(d.muns) };
        const blob = await excel(c, sat, gis);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = `CROQUI_CH_${String(ini.cod).replace(/[^\w.-]+/g, '_')}.xlsx`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 30000);
        dlg.close();
      } catch (err) {
        bt.disabled = false; bt.textContent = 'Baixar croqui (Excel)';
        alert('Não foi possível gerar o croqui: ' + err.message);
      }
    });
    dlg.showModal();
  }
  window.__croqui = abre;

  // botão no detalhe do trecho (o detalhe é refeito a cada seleção)
  function poeBotao() {
    if (det.querySelector('.croqui-btn') || !selecionados().length) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'croqui-btn';
    b.innerHTML = '<span aria-hidden="true">⬇</span> Croqui da faixa';
    b.title = 'Gerar o croqui de limpeza de faixa (Excel) já preenchido com os dados deste trecho';
    b.addEventListener('click', abre);
    const h2 = det.querySelector('h2');
    h2 ? h2.after(b) : det.prepend(b);
  }
  new MutationObserver(poeBotao).observe(det, { childList: true });
  if (lista) new MutationObserver(poeBotao).observe(lista, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  poeBotao();
})();
