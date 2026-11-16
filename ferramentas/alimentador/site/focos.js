// Queimadas: focos de calor perto da rede de MT (INPE e NASA FIRMS) e incêndios da Crítica.
// - Mapa principal (index.html, antes de mapa-municipios.js): a visão "Queimadas" no seletor de visão (o mesmo da NAE),
//   com o mapa de calor por município (rampa de 6 classes, cortes redondos pelos quantis de cada período e distância),
//   período (24 h · 7 dias · 30 dias · 12 meses), distância (sob a rede · até 1 km · até 5 km), a hora da última leitura
//   das fontes, a caixa do canto (atraso do satélite, foco mais novo, "Histórico e filtros"), os pontos ao vivo a partir da
//   regional (cor pela idade) e o cartão de cada foco.
// - Mapa do alimentador (depois de executadas.js, antes de lupa-painel.js): a camada "Queimadas" com Faixa/Inspeção/
//   Insp→manut/Manutenção: bolinha laranja com a chama e os focos do período nos rótulos dos trechos, pontos (ao vivo e do
//   histórico), o incêndio da Crítica no equipamento que abriu, legenda e o bloco no painel com o gráfico por dia.
// Dados (dados/focos/, scripts/focos.py e scripts/focos_historico.py; formatos nas docstrings deles):
//   agora.json   ao vivo (84 h, todos os satélites). Lido do site (cópia de hora em hora) e, quando a cópia traz "ramo"
//                (a rotina já grava o ramo de dados), também do ramo "focos" (raw.githubusercontent.com, a cada 10 min); fica
//                o de "gerado" mais novo. Sem o raw (rede bloqueada), segue com o do site. Sem o campo, nem pede o raw (o
//                ramo ainda não existe e o pedido deixaria um 404 no console).
//   resumo.json  contagens por mês (12 meses) e por dia (35 dias), por alimentador e por município: o mapa do estado não
//                baixa os arquivos al/ nos períodos prontos.
//   al/<AL>.json pontos de 12 meses (até historico_ate, que é o agora_somado_ate do resumo: o CSV mensal e, depois dele, os
//                VIIRS e MODIS do agora.json usado na rodada até o "gerado" dele − 12 h, margem para o foco que o
//                satélite entrega atrasado) e incêndios da Crítica: só no mapa do alimentador, no
//                município aberto (alimentador que passa por mais de um município) e no Histórico. Por cima, do agora.json
//                atual: VIIRS e MODIS depois desse corte (o mesmo das contagens do resumo) e os outros satélites todos.
// Contagens só com VIIRS (NOAA-20, NOAA-21) e MODIS (Aqua, Terra), como o histórico; GOES, METOP e MSG aparecem só como
// ponto ao vivo. Faixas exclusivas no dado (sob, 1km = 200/500 m a 1 km, 5km = 1 a 5 km); o filtro de distância soma as de
// dentro. Horas na hora do Tocantins (UTC−3). Nada de dado pessoal: a Crítica entra sem texto livre, UC ou nome.
(function () {
  'use strict';
  const eu = document.currentScript;
  const BASE = new URL('../dados/focos/', (eu && eu.src) || location.href).href;
  const RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegeta-o-back/focos/agora.json';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF0 = new Intl.NumberFormat('pt-BR'), NF1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf = n => NF0.format(n || 0);
  const focosTxt = n => `${nf(n)} foco${n === 1 ? '' : 's'}`;
  const guarda = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };

  // ---------------------------------------------------------------- sensores, faixas, períodos
  const CONTA = new Set(['NOAA-20', 'NOAA-21', 'AQUA', 'TERRA']);       // entram nas contagens (os do histórico)
  const classe = s => /^(NOAA-2\d|SUOMI|NPP)/.test(s) ? 'VIIRS' : /^(AQUA|TERRA)$/.test(s) ? 'MODIS' : /^(GOES|MSG)/.test(s) ? 'GEO' : 'AVHRR';
  const SENSOR = { VIIRS: 'VIIRS, pixel de 375 m', MODIS: 'MODIS, pixel de 1 km', AVHRR: 'AVHRR, pixel de 1,1 km', GEO: 'geoestacionário, pixel de 2 a 4 km' };
  const SOB_M = { VIIRS: 200, MODIS: 500, AVHRR: 500, GEO: 1000 };
  const FX = ['sob', '1km', '5km'];
  const FX_TXT = { sob: 'Sob a rede', '1km': 'Até 1 km', '5km': 'De 1 a 5 km' };
  const DIST = { sob: ['sob'], '1km': ['sob', '1km'], '5km': FX };
  const DIST_TXT = { sob: 'Sob a rede', '1km': 'Até 1 km', '5km': 'Até 5 km' };
  const PERS = ['24h', '7d', '30d', '12m'];
  const PER_TXT = { '24h': '24 h', '7d': '7 dias', '30d': '30 dias', '12m': '12 meses', int: 'Intervalo' };
  const ATRASO = 'o foco chega 20 min (GOES) a até 4 h (VIIRS e MODIS) depois da passagem do satélite';
  const IDADE_TXT = ['menos de 6 h', '6 a 24 h', 'mais de 24 h'];
  const idadeDe = t => { const h = (Date.now() - t) / 36e5; return h < 6 ? 0 : h < 24 ? 1 : 2; };
  const CHAMA = '<svg class="fo-chama" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.6 1c.3 2.3 3.7 3.8 3.7 7.6A4.3 4.3 0 0 1 8 13a4.3 4.3 0 0 1-4.3-4.3c0-2 1.1-3.3 2.1-4.2.1 1.4.7 2.3 1.6 2.7C7.3 4.9 7.6 2.8 8.6 1z"/></svg>';

  // ---------------------------------------------------------------- hora (Tocantins, UTC−3, sem horário de verão)
  const FUSO = 3 * 36e5;
  const tLoc = s => Date.parse(`${s.slice(0, 10)}T${s.slice(11, 16) || '00:00'}:00-03:00`);
  const isoL = t => new Date(t - FUSO).toISOString();
  const diaDe = t => isoL(t).slice(0, 10), mesDe = t => isoL(t).slice(0, 7);
  const dm = t => { const s = isoL(t); return `${s.slice(8, 10)}/${s.slice(5, 7)}`; };
  const hm = t => isoL(t).slice(11, 16);
  const quando = t => `${dm(t)} às ${hm(t)}`;
  const dma = d => d ? d.split('-').reverse().join('/') : '';
  const ha = t => { const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); return m < 60 ? `há ${m} min` : m < 2880 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} dias`; };
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesTxt = m => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
  const diaMais = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const mesMais = (m, n) => { const k = +m.slice(0, 4) * 12 + +m.slice(5, 7) - 1 + n; return `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`; };
  const distTxt = d => d < 1000 ? `${nf(Math.round(d))} m` : `${NF1.format(d / 1000)} km`;

  // ---------------------------------------------------------------- dados
  const F = { agora: null, resumo: null, semAgora: false, semResumo: false, pResumo: null, pAgora: null, als: new Map(), dadosAl: new Map() };
  const ouvintes = new Set();
  let avisoId = 0;
  const avisa = () => { clearTimeout(avisoId); avisoId = setTimeout(() => ouvintes.forEach(f => f()), 30); };
  const pega = (u, op) => fetch(u, op).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const valido = a => a && typeof a.gerado === 'string' && Array.isArray(a.focos);
  const comDia = f => { const s = isoL(f.t); f.dia = s.slice(0, 10); f.mes = s.slice(0, 7); return f; };
  function poeAgora(a, origem) {
    if (!valido(a) || (F.agora && F.agora.gerado >= a.gerado)) return false;
    F.agora = { gerado: a.gerado, t: Date.parse(a.gerado), janela: (a.janela_h || 84) * 36e5, fontes: a.fontes || {}, origem,
      focos: a.focos.map(f => comDia({ lat: +f[0], lon: +f[1], t: Date.parse(f[2]), sat: String(f[3] || ''), fonte: f[4], d: +f[5] || 0, al: f[6] || '',
        tr: f[7] || '', fx: f[8], frp: f[9] == null ? null : +f[9], mun: f[10] || '', vivo: true })).filter(f => isFinite(f.t) && DIST['5km'].includes(f.fx)) };
    F.semAgora = false;
    return true;
  }
  // primeiro a cópia do site; o raw só quando ela diz que o ramo existe ("ramo") ou quando ela não veio. Cada leitura entra
  // quando chega e fica a de "gerado" mais novo
  let temRamo = false;
  function lerAgora() {
    const site = pega(BASE + 'agora.json', { cache: 'no-cache' }).then(a => { if (a && a.ramo) temRamo = true; if (poeAgora(a, 'site')) avisa(); return a; });
    const raw = site.then(a => {
      if (a && !temRamo) return null;
      const ctl = window.AbortController ? new AbortController() : null, prazo = setTimeout(() => ctl && ctl.abort(), 15000);
      return pega(RAW, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined }).then(b => { clearTimeout(prazo); if (poeAgora(b, 'ramo focos')) avisa(); });
    });
    Promise.all([site, raw]).then(() => { if (!F.agora) { F.semAgora = true; avisa(); } });
    // pronto com a cópia do site (não espera o raw, que pode demorar ou estar bloqueado); sem ela, espera o raw
    return (F.pAgora = site.then(() => (F.agora ? null : raw)).then(() => F.agora));
  }
  function lerResumo() {
    return F.pResumo || (F.pResumo = pega(BASE + 'resumo.json', { cache: 'no-cache' }).then(r => {
      if (r && Array.isArray(r.meses) && r.mun && r.al) F.resumo = r; else F.semResumo = true;
      avisa();
      return F.resumo;
    }));
  }
  // al/<AL>.json: pontos do histórico (até historico_ate = agora_somado_ate) e incêndios. Sem arquivo: nenhum foco nem
  // incêndio no período
  function lerAl(al) {
    if (!F.als.has(al)) F.als.set(al, pega(BASE + 'al/' + encodeURIComponent(al) + '.json').then(j => {
      const d = { ate: j && j.historico_ate ? Date.parse(j.historico_ate) : 0,
        focos: ((j && j.focos) || []).map(f => comDia({ lat: +f[0], lon: +f[1], t: tLoc(f[2]), sat: String(f[3] || ''), d: +f[4] || 0, al, tr: f[5] || '', fx: f[6], mun: f[7] || '', vivo: false })),
        inc: ((j && j.incendios) || []).map(x => comDia({ t: tLoc(x[0]), ativo: x[1] || '', tr: x[2] || '', cons: +x[3] || 0, dur: +x[4] || 0, tipo: x[5], causa: x[6] || '',
          mun: x[7] || '', comp: x[8] || '', lat: x[9] == null ? null : +x[9], lon: x[10] == null ? null : +x[10], al })) };
      F.dadosAl.set(al, d);
      return d;
    }));
    return F.als.get(al);
  }
  // em lotes de 6 (o Histórico de uma regional pede dezenas)
  function lerAls(als, cada) {
    const fila = als.slice();
    const um = () => { const al = fila.shift(); return al ? lerAl(al).then(d => { if (cada) cada(al, d); return um(); }) : Promise.resolve(); };
    return Promise.all(Array.from({ length: Math.min(6, fila.length) }, um));
  }
  // pontos de um alimentador: os do histórico e, do agora.json atual, VIIRS e MODIS depois do corte dele (o mesmo corte das
  // contagens do resumo: o mapa do estado e o painel do alimentador dão o mesmo número) e os outros satélites todos (só
  // pontos ao vivo, nunca no histórico)
  function pontosDe(al) {
    const d = F.dadosAl.get(al), lim = d && d.ate ? d.ate : somado() || histAte();
    const a = F.agora ? F.agora.focos.filter(f => f.al === al && (!CONTA.has(f.sat) || f.t > lim)) : [];
    return (d ? d.focos : []).concat(a);
  }
  // al/<AL>.json só existe para quem tem foco ou incêndio nos 12 meses (o resumo traz todos, com zeros): sem ele, nem pede
  const temArq = al => { const R = F.resumo, x = R && R.al[al]; return !R || (!!x && ['sob', '1km', '5km', 'inc'].some(k => (x[k] || []).some(n => n))); };
  const somado = () => (F.resumo && F.resumo.agora_somado_ate ? Date.parse(F.resumo.agora_somado_ate) : 0);
  const histAte = () => (F.resumo && F.resumo.historico_ate ? Date.parse(F.resumo.historico_ate) : 0);
  const ref = () => Math.max(F.agora ? F.agora.t : 0, somado());

  // ---------------------------------------------------------------- período (janela) e contagens
  // passo: 'h' (24 h, por hora), 'd' (por dia), 'm' (por mês). int: {de, ate} em 'AAAA-MM-DD'
  function janela(per, int) {
    const r = ref() || Date.now();
    if (per === '24h') {
      const ate = F.agora ? F.agora.t : r, de = ate - 864e5, horas = [];
      for (let t = Math.ceil(de / 36e5) * 36e5; t <= Math.ceil(ate / 36e5) * 36e5; t += 36e5) horas.push(t);   // fim de cada hora
      return { per, passo: 'h', de, ate, horas };
    }
    if (per === '12m') {
      const m1 = mesDe(r), meses = [];
      for (let i = 11; i >= 0; i--) meses.push(mesMais(m1, -i));
      return { per, passo: 'm', meses, set: new Set(meses), de: tLoc(meses[0] + '-01 00:00'), ate: r };
    }
    let d0, d1;
    if (per === 'int' && int && int.de && int.ate) { d0 = int.de <= int.ate ? int.de : int.ate; d1 = int.de <= int.ate ? int.ate : int.de; }
    else { d1 = diaDe(r); d0 = diaMais(d1, -(per === '30d' ? 29 : 6)); }
    const dias = [];
    for (let d = d0; d <= d1 && dias.length < 800; d = diaMais(d, 1)) dias.push(d);
    const J = { per, passo: 'd', dias, set: new Set(dias), de: tLoc(d0 + ' 00:00'), ate: Math.min(tLoc(d1 + ' 00:00') + 864e5 - 1, Math.max(r, tLoc(d1 + ' 00:00'))) };
    if (per === 'int' && dias.length > 62) {                 // intervalo longo: o gráfico vai por mês
      const meses = [...new Set(dias.map(d => d.slice(0, 7)))];
      Object.assign(J, { passoG: 'm', mesesG: meses });
    }
    return J;
  }
  const naJanela = (J, f) => J.passo === 'h' ? f.t > J.de && f.t <= J.ate : J.passo === 'm' ? J.set.has(f.mes) : J.set.has(f.dia);
  // o resumo cobre a janela? (12 meses e os dias dos últimos 35; o que vier depois do resumo sai do agora.json)
  function cobre(J) {
    const R = F.resumo;
    if (!R || J.passo === 'h') return false;
    if (J.passo === 'm') return J.meses.every(m => R.meses.includes(m) || m > R.meses[R.meses.length - 1]);
    const ds = R.dias || [];
    return !!ds.length && J.dias[0] >= ds[0];
  }
  const somaFx = (v, fx, idx) => { let n = 0; fx.forEach(f => { const a = v && v[f]; if (a) idx.forEach(i => { n += a[i] || 0; }); }); return n; };
  // índices da janela na tabela do resumo (dias ou meses)
  const idxDe = J => { const R = F.resumo, lista = J.passo === 'm' ? R.meses : R.dias || [], ch = J.passo === 'm' ? J.meses : J.dias; return ch.map(k => lista.indexOf(k)).filter(i => i >= 0); };
  // contagem do mapa do estado: por município e por alimentador (e por par alimentador|município quando sai dos pontos)
  function contaMapa(per, dist) {
    const fx = DIST[dist], J = janela(per), mun = {}, al = {}, par = {}, A = F.agora;
    const soma = (o, k, n) => { if (n) o[k] = (o[k] || 0) + n; };
    const poe = f => { soma(mun, f.mun, 1); soma(al, f.al, 1); soma(par, f.al + '|' + f.mun, 1); };
    if (J.passo === 'h') {
      if (A) A.focos.forEach(f => { if (CONTA.has(f.sat) && fx.includes(f.fx) && naJanela(J, f)) poe(f); });
      return { J, mun, al, par, exato: true };
    }
    if (F.resumo) {
      const idx = idxDe(J), R = F.resumo, tm = J.passo === 'm' ? R.mun : R.mun_dias || {}, ta = J.passo === 'm' ? R.al : R.al_dias || {};
      Object.entries(tm).forEach(([k, v]) => soma(mun, k, somaFx(v, fx, idx)));
      Object.entries(ta).forEach(([k, v]) => soma(al, k, somaFx(v, fx, idx)));
    }
    const s = somado();
    if (A) A.focos.forEach(f => { if (CONTA.has(f.sat) && fx.includes(f.fx) && f.t > s && naJanela(J, f)) poe(f); });
    return { J, mun, al, par, exato: false };
  }
  // faixas da legenda: 0 = sem; depois 5, pelos quintis dos municípios com foco, em números redondos (como as visões do
  // mapa, scripts/gera_visoes.js: 1; 1,5; 2; 2,5; 3; 4; 5; 7,5 × 10^k, só inteiros), o limite + 1 ("1–10", "11–30")
  const REDONDOS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const cands = x => { const b = 10 ** Math.floor(Math.log10(x)); return REDONDOS.map(f => f * b).filter(v => Number.isInteger(v)); };
  const redondo = x => (!(x > 0) ? 1 : cands(x).reduce((m, v) => (Math.abs(Math.log(v / x)) < Math.abs(Math.log(m / x)) ? v : m)));
  const proximo = v => cands(v).find(f => f > v * 1.0001) || v * 2;
  function faixasDe(vs) {
    vs = vs.filter(v => v > 0).sort((a, b) => a - b);
    const q = p => (vs.length ? vs[Math.min(vs.length - 1, Math.floor(p * (vs.length - 1) + 0.5))] : 1);
    const lim = [];
    [0.2, 0.4, 0.6, 0.8].forEach(p => {
      let v = Math.max(redondo(q(p)), 1);
      if (lim.length && v <= lim[lim.length - 1]) v = proximo(lim[lim.length - 1]);
      lim.push(v);
    });
    return [0, 1, ...lim.map(v => v + 1)];
  }
  // série por hora, dia ou mês de um conjunto de pontos (cada ponto: t, dia, mes, fx), só os sensores das contagens
  function seriePontos(J, pts, fx) {
    const passo = J.passoG || J.passo, ch = passo === 'h' ? J.horas : passo === 'm' ? J.mesesG || J.meses : J.dias;
    const pos = new Map(ch.map((k, i) => [k, i])), v = ch.map(() => [0, 0, 0]);
    pts.forEach(f => {
      if (!CONTA.has(f.sat) || !fx.includes(f.fx) || !naJanela(J, f)) return;
      const k = passo === 'h' ? Math.ceil(f.t / 36e5) * 36e5 : passo === 'm' ? f.mes : f.dia, i = pos.get(k);
      if (i !== undefined) v[i][FX.indexOf(f.fx)]++;
    });
    return { passo, ch, v };
  }

  // ---------------------------------------------------------------- gráfico (barras empilhadas por faixa)
  // sob a rede embaixo (a base, o que mais importa), depois até 1 km e de 1 a 5 km; 2 px de vão entre as partes, ponta
  // de cima arredondada; eixo com números redondos; o rótulo de baixo só onde cabe. Ao passar o mouse (ou tocar), o
  // número de cada parte; a tabela fica para o leitor de tela.
  const rotX = (passo, k) => passo === 'h' ? hm(k - 36e5).slice(0, 2) + 'h' : passo === 'm' ? mesTxt(k) : dm(tLoc(k + ' 12:00'));
  const rotTip = (passo, k) => passo === 'h' ? `${dm(k - 36e5)}, ${hm(k - 36e5)} às ${hm(k)}` : passo === 'm' ? mesTxt(k) : dma(k);
  const passoEixo = m => { const b = 10 ** Math.floor(Math.log10(Math.max(1, m / 3))); return [1, 2, 2.5, 5, 10].map(f => f * b).find(s => s * 3 >= m && Number.isInteger(s)) || b * 10; };
  function grafico(S, fx, largura) {
    const W = Math.max(260, Math.round(largura || 340)), H = 168, L = 34, R = 6, T = 10, B = 24, n = S.ch.length;
    const tot = S.v.map(x => fx.reduce((s, f) => s + x[FX.indexOf(f)], 0)), max = Math.max(1, ...tot);
    const st = passoEixo(max), topo = Math.ceil(max / st) * st, y = v => T + (H - T - B) * (1 - v / topo);
    const slot = (W - L - R) / Math.max(1, n), bw = Math.max(2, Math.min(24, slot * 0.72));
    let g = '';
    for (let v = 0; v <= topo + 1e-9; v += st) g += `<line class="fo-g-l" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="fo-g-t" x="${L - 5}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${nf(v)}</text>`;
    const cada = Math.max(1, Math.ceil(n / Math.floor((W - L - R) / (S.passo === 'm' ? 44 : 38))));
    S.ch.forEach((k, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      let base = y(0), partes = '';
      const ord = fx.slice();
      const vis = ord.filter(f => S.v[i][FX.indexOf(f)] > 0);
      vis.forEach((f, j) => {
        const v = S.v[i][FX.indexOf(f)], h = (H - T - B) * v / topo, gap = j ? 2 : 0, alto = Math.max(1, h - gap), y1 = base - gap - alto;
        const r = j === vis.length - 1 ? Math.min(4, bw / 2, alto) : 0;
        partes += r ? `<path class="fo-g-${f}" d="M${x.toFixed(1)},${(base - gap).toFixed(1)}V${(y1 + r).toFixed(1)}q0,-${r} ${r},-${r}h${(bw - 2 * r).toFixed(1)}q${r},0 ${r},${r}V${(base - gap).toFixed(1)}z"/>`
          : `<rect class="fo-g-${f}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${alto.toFixed(1)}"/>`;
        base = y1;
      });
      const tip = `${rotTip(S.passo, k)}: ${focosTxt(tot[i])}` + (tot[i] ? ' (' + fx.map(f => `${FX_TXT[f].toLowerCase()} ${nf(S.v[i][FX.indexOf(f)])}`).join(' · ') + ')' : '');
      g += `<g class="fo-g-b" data-tip="${esc(tip)}"><rect class="fo-g-h" x="${(L + slot * i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H - T - B}"/>${partes}</g>`;
      if (i % cada === 0) g += `<text class="fo-g-t" x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(rotX(S.passo, k))}</text>`;
    });
    g += `<line class="fo-g-0" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    const titulo = S.passo === 'h' ? 'Focos por hora' : S.passo === 'm' ? 'Focos por mês' : 'Focos por dia';
    const tab = `<table class="vh"><caption>${titulo}</caption><tr><th>${S.passo === 'h' ? 'Hora' : S.passo === 'm' ? 'Mês' : 'Dia'}</th>${fx.map(f => `<th>${FX_TXT[f]}</th>`).join('')}</tr>` +
      S.ch.map((k, i) => `<tr><td>${esc(rotTip(S.passo, k))}</td>${fx.map(f => `<td>${S.v[i][FX.indexOf(f)]}</td>`).join('')}</tr>`).join('') + '</table>';
    return `<div class="fo-g"><div class="fo-g-cab"><b>${titulo}</b><span class="fo-g-leg">${fx.map(f => `<span><i class="fo-g-${f}"></i>${FX_TXT[f]}</span>`).join('')}</span></div>` +
      `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${titulo}: ${focosTxt(tot.reduce((a, b) => a + b, 0))} no período">${g}</svg>${tab}<div class="fo-g-tip" hidden></div></div>`;
  }
  // dica do gráfico (mouse ou toque numa barra)
  document.addEventListener('pointerover', e => {
    const b = e.target.closest && e.target.closest('.fo-g-b');
    const box = b && b.closest('.fo-g'), tip = box && box.querySelector('.fo-g-tip');
    document.querySelectorAll('.fo-g-b.on').forEach(x => { if (x !== b) x.classList.remove('on'); });
    document.querySelectorAll('.fo-g-tip:not([hidden])').forEach(x => { if (x !== tip) x.hidden = true; });
    if (!b || !tip) return;
    b.classList.add('on');
    tip.textContent = b.dataset.tip;
    tip.hidden = false;
    const r = box.getBoundingClientRect(), rb = b.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, rb.left - r.left + rb.width / 2 - tip.offsetWidth / 2)) + 'px';
  });

  // seletores (período, distância) no jeito do segmentado do ARGOS
  const seg = (nome, vals, txt, atual, rotulo) => `<div class="fo-seg" role="group" aria-label="${rotulo}">` +
    vals.map(v => `<button type="button" data-fo-${nome}="${v}" aria-pressed="${v === atual}">${txt[v]}</button>`).join('') + '</div>';
  const linhaPer = (J, ate) => {
    const fim = ate ? ` até ${quando(ate)}` : '';
    if (J.per === '24h') return `Últimas 24 h${fim} · VIIRS e MODIS`;
    if (J.per === '12m') return `Últimos 12 meses (${mesTxt(J.meses[0])} a ${mesTxt(J.meses[11])})${fim} · VIIRS e MODIS`;
    if (J.per === 'int') return `De ${dma(J.dias[0])} a ${dma(J.dias[J.dias.length - 1])} · VIIRS e MODIS`;
    return `Últimos ${J.per === '7d' ? '7' : '30'} dias${fim} · VIIRS e MODIS`;
  };
  // selo da leitura: a cor pela idade da última leitura das fontes (verde até 30 min, âmbar até 3 h, vermelho depois)
  function selo() {
    const A = F.agora;
    if (!A) return F.semAgora ? '<span class="fo-ponto parado"></span>Sem a leitura ao vivo agora (agora.json não veio)' : '<span class="fo-ponto"></span>Lendo INPE e FIRMS…';
    const i = A.fontes.inpe || {}, f = A.fontes.firms || {}, idade = (Date.now() - A.t) / 6e4;
    const cor = idade <= 30 ? 'ok' : idade <= 180 ? 'velho' : 'parado';
    const ti = i.ultimo_arquivo ? Date.parse(i.ultimo_arquivo) : null, tf = f.ultimo_foco ? Date.parse(f.ultimo_foco) : null;
    return `<span class="fo-ponto ${cor}" title="Leitura de ${quando(A.t)} (${ha(A.t)}), ${A.origem === 'site' ? 'cópia do site' : 'rotina de 10 min'}"></span>` +
      (ti ? `INPE às ${hm(ti)} (${ha(ti)})` : 'INPE fora') + ' · ' + (tf ? `FIRMS às ${hm(tf)}` : 'FIRMS fora') +
      (i.erro || f.erro ? ' · uma fonte falhou' : '');
  }
  const fonteTxt = f => !f.vivo ? 'INPE (histórico mensal)' : f.fonte === 'IF' ? 'INPE e FIRMS' : f.fonte === 'F' ? 'FIRMS (NASA)' : 'INPE';
  function cartaoHtml(f, nomeMun) {
    const c = classe(f.sat);
    return `<b class="fo-c-t">${CHAMA}Foco de calor · ${esc(f.sat)}</b>` +
      `<span>${esc(SENSOR[c])}</span>` +
      `<span>${quando(f.t)} · ${ha(f.t)}</span>` +
      `<span><i class="fo-fx fo-g-${esc(f.fx)}"></i>${f.fx === 'sob' ? `Sob a rede (o pixel cobre a rede: até ${nf(SOB_M[c])} m)` : f.fx === '1km' ? 'Até 1 km da rede' : 'De 1 a 5 km da rede'} · ${distTxt(f.d)}</span>` +
      `<span>${esc(f.al)}${f.tr ? ' · trecho ' + esc(f.tr) : ''}${nomeMun ? ' · ' + esc(nomeMun) : ''}</span>` +
      `<span>Fonte: ${fonteTxt(f)}${f.frp != null && isFinite(f.frp) ? ` · potência ${NF1.format(f.frp)} MW (FRP)` : ''}</span>` +
      (!CONTA.has(f.sat) ? '<span class="fo-c-n">Só como ponto ao vivo: as contagens usam VIIRS e MODIS.</span>' : '');
  }
  function incHtml(x) {
    const quem = x.tipo === 'HO' ? 'Causada por terceiros · Incêndio' : `registrada como ${esc((x.causa || 'outra causa').toLowerCase())}; o texto cita fogo`;
    return `<b class="fo-c-t"><span class="fo-inc-i" aria-hidden="true">${CHAMA}</span>Incêndio na Crítica</b>` +
      `<span>${quando(x.t)} · ${esc(x.al)}${x.tr ? ' · trecho ' + esc(x.tr) : ''}</span>` +
      `<span>Abriu: ${esc(x.ativo)} · ${nf(x.cons)} consumidor${x.cons === 1 ? '' : 'es'} · ${x.dur >= 120 ? NF1.format(x.dur / 60) + ' h' : nf(x.dur) + ' min'}</span>` +
      `<span>${quem}</span><span class="fo-c-n">O ponto é o equipamento que abriu: o fogo pode estar a jusante.</span>`;
  }
  // Crítica coberta (resumo): "mai a nov/2026, até 09/11"
  const criticaTxt = () => {
    const c = F.resumo && F.resumo.fontes && F.resumo.fontes.critica;
    if (!c || !c.meses || !c.meses.length) return 'Crítica: período não informado';
    const a = c.meses[0], b = c.meses[c.meses.length - 1];
    return `Crítica de ${MES[+a.slice(5, 7) - 1]}${a.slice(0, 4) !== b.slice(0, 4) ? '/' + a.slice(0, 4) : ''} a ${MES[+b.slice(5, 7) - 1]}/${b.slice(0, 4)}` +
      (c.ultima_abertura ? ` (até ${dm(tLoc(c.ultima_abertura))})` : '');
  };

  if (document.getElementById('mapa-to')) principal();
  else if (window.D && window.D.meta && window.D.meta.al) alimentador();

  // ================================================================ mapa principal
  function principal() {
    const MUN = window.MUN || { muns: [] };
    const porCod = Object.fromEntries((MUN.muns || []).map(m => [m.cod, m]));
    const alMuns = {};
    (MUN.muns || []).forEach(m => (m.als || []).forEach(a => { alMuns[a.cod] = (alMuns[a.cod] || 0) + 1; }));
    const st = { per: guarda('fo-per') || '7d', dist: guarda('fo-dist') || '5km' };
    if (!PERS.includes(st.per)) st.per = '7d';
    if (!DIST[st.dist]) st.dist = '5km';
    let C = null, ativo = false, montado = false;
    const pares = new Map();                       // "per|dist|AL|cod" → focos do alimentador no município (dos pontos)
    const mapa = () => window.ARGOS_MAPA;
    const VIS = {
      id: 'queimadas', nome: 'Queimadas', curto: 'Queimadas', un: 'focos', un1: 'foco', mais: 'focos', sem: 'Sem focos',
      o: 'focos de calor perto da rede (INPE e FIRMS)', faixas: [0, 1, 2, 3, 4, 5], ordenaAls: true,
      per: () => F.semResumo && F.semAgora ? 'Sem dados de focos agora (os arquivos não vieram): tente mais tarde' : !C ? 'Carregando os focos…' :
        linhaPer(C.J, C.J.passo === 'h' ? C.J.ate : ref()) + (F.semResumo && C.J.passo !== 'h' ? ' · sem o histórico (resumo.json não veio)' : ''),
      mun: m => (C ? C.mun[m.cod] || 0 : 0),
      al: (m, a) => valorAl(m.cod, a.cod),
      quemAl: (m, a) => (!C || C.exato || (alMuns[a.cod] || 0) <= 1 || pares.has(chave(a.cod, m.cod)) || !C.al[a.cod] ? '' : 'no alimentador todo'),
      leg: () => seg('per', PERS, PER_TXT, st.per, 'Período') + seg('dist', ['sob', '1km', '5km'], DIST_TXT, st.dist, 'Distância da rede') + `<p class="fo-selo">${selo()}</p>`,
      liga: sim => { ativo = sim; if (sim) { monta(); carrega(); } mostra(); },
    };
    (window.ARGOS_VIS_EXTRA = window.ARGOS_VIS_EXTRA || []).push(VIS);
    const chave = (al, cod) => `${st.per}|${st.dist}|${al}|${cod}`;
    function valorAl(cod, al) {
      if (!C) return 0;
      if (C.exato) return C.par[al + '|' + cod] || 0;
      if ((alMuns[al] || 0) <= 1) return C.al[al] || 0;
      const p = pares.get(chave(al, cod));
      return p != null ? p : C.al[al] || 0;          // até o arquivo dele chegar: o do alimentador todo (a lista diz)
    }
    let carregou = false;
    function carrega() {
      if (carregou) return;
      carregou = true;
      lerResumo();
      lerAgora();
      ouvintes.add(recalcula);
      setInterval(() => { if (ativo && !document.hidden) lerAgora(); }, 10 * 6e4);     // a rotina grava a cada 10 min
      setInterval(() => { if (ativo && !document.hidden) { poeSelo(); poeCaixa(); } }, 6e4);
    }
    function recalcula() {
      if (!F.resumo && !F.agora && !(F.semResumo && F.semAgora)) return;
      C = contaMapa(st.per, st.dist);
      VIS.faixas = faixasDe((MUN.muns || []).map(m => C.mun[m.cod] || 0));
      if (ativo && mapa() && mapa().refaz) mapa().refaz();
      desenhaPontos();
      poeCaixa();
      paresMun();
      if (hist && !hist.hidden) pintaHist();
    }
    function poeSelo() { const s = document.querySelector('#mapa-to .fo-selo'); if (s) s.innerHTML = selo(); }
    // ---------- seletores na legenda ----------
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('#mapa-to .mt-leg-x [data-fo-per], #mapa-to .mt-leg-x [data-fo-dist], .fo-caixa [data-fo-per], .fo-caixa [data-fo-dist]');
      if (!b) return;
      e.stopPropagation();
      const teclado = e.detail === 0, qual = b.dataset.foPer ? 'per' : 'dist', v = b.dataset.foPer || b.dataset.foDist;
      if (st[qual] === v) return;
      st[qual] = v;
      guarda('fo-' + qual, v);
      fechaCartao();
      recalcula();
      const de = b.closest('.fo-caixa') ? '.fo-caixa' : '#mapa-to .mt-leg-x';
      if (teclado) { const n = document.querySelector(`${de} [data-fo-${qual}="${v}"]`); if (n) n.focus({ preventScroll: true }); }
    });
    // ---------- caixa do canto, pontos ao vivo e cartão ----------
    let caixaFo = null, ptsG = null, cartao = null, hist = null, vis = [];
    function monta() {
      if (montado || !mapa()) return;
      montado = true;
      const M = mapa();
      caixaFo = document.createElement('div');
      caixaFo.className = 'fo-caixa mt-ocupa';
      caixaFo.setAttribute('role', 'region');
      caixaFo.setAttribute('aria-label', 'Queimadas: atraso e foco mais novo');
      M.caixa.append(caixaFo);
      caixaFo.addEventListener('click', e => { if (e.target.closest('.fo-hist-b')) abreHist(); });
      ptsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      ptsG.setAttribute('class', 'fo-pts');
      ptsG.addEventListener('click', e => {
        const p = e.target.closest('[data-i]');
        if (!p) return;
        e.stopPropagation();
        abreCartao(vis[+p.dataset.i], e);
      });
      document.addEventListener('argos-pouso', () => { desenhaPontos(); poeCaixa(); paresMun(); });
      document.addEventListener('argos-nivel', () => { fechaCartao(); vis = []; if (ptsG) ptsG.innerHTML = ''; poeCaixa(); });   // a caixa já no tamanho do nível novo (os nomes desviam dela no pouso)
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && cartao) { e.preventDefault(); fechaCartao(); } }, true);
    }
    function mostra() {
      if (caixaFo) caixaFo.hidden = !ativo;
      if (ptsG) ptsG.style.display = ativo ? '' : 'none';
      if (!ativo) { fechaCartao(); if (hist) fechaHist(); } else { desenhaPontos(); poeCaixa(); }
    }
    function novo() {                                    // o mais novo perto da rede (até 5 km), de qualquer satélite
      if (!F.agora || !F.agora.focos.length) return null;
      return F.agora.focos.reduce((a, b) => (b.t > a.t ? b : a));
    }
    function poeCaixa() {
      if (!caixaFo || !ativo) return;
      const nv = mapa().nivel(), n = novo();
      const aqui = nv.reg ? vis.length : 0;
      // no estado, o texto inteiro; aproximado, só a idade dos pontos e quantos há (a caixa cobre menos o mapa)
      caixaFo.classList.toggle('curta', !!nv.reg);
      caixaFo.innerHTML = (!nv.reg ? `<p><b>Atraso do satélite:</b> ${ATRASO}.</p>` +
        (n ? `<p><b>Mais novo perto da rede:</b> ${esc(n.sat)}, ${quando(n.t)} (${ha(n.t)})${porCod[n.mun] ? ', ' + esc(porCod[n.mun].nome) : ''}</p>` :
          F.semAgora ? `<p><b>Sem a leitura ao vivo agora.</b> ${F.semResumo ? 'Sem o histórico também: tente mais tarde.' : 'As contagens seguem pelo histórico.'}</p>` : F.agora ? '<p>Nenhum foco ao vivo perto da rede.</p>' : '<p>Lendo os focos ao vivo…</p>') :
        `<p title="${ATRASO}"><b>Atraso:</b> 20 min (GOES) a 4 h (VIIRS e MODIS)</p>`) +
        (!nv.reg ? '<p class="fo-dica">Aproxime numa regional para ver os focos ao vivo.</p>' :
          `<p class="fo-idades" aria-label="Idade do foco">${IDADE_TXT.map((t, i) => `<span><i class="fo-a${i}"></i>${t}</span>`).join('')}</p>` +
          `<p class="fo-dica">${aqui ? `${focosTxt(aqui)} ao vivo aqui (${DIST_TXT[st.dist].toLowerCase()}, ${Math.round((F.agora ? F.agora.janela : 3024e5) / 36e5)} h, todos os satélites)` : F.agora ? `Nenhum foco ao vivo aqui ${DIST_TXT[st.dist].toLowerCase()}` : F.semAgora ? 'Sem a leitura ao vivo agora' : 'Lendo os focos ao vivo…'}</p>`) +
        (nv.mun ? `<div class="fo-caixa-f">${seg('per', PERS, PER_TXT, st.per, 'Período')}${seg('dist', ['sob', '1km', '5km'], DIST_TXT, st.dist, 'Distância da rede')}</div>` : '') +
        '<button type="button" class="fo-hist-b">Histórico e filtros</button>';
    }
    function desenhaPontos() {
      vis = [];
      if (!ptsG) return;
      const M = mapa(), nv = M.nivel();
      ptsG.innerHTML = '';
      if (!ativo || !F.agora || !nv.reg || M.voando()) return;
      const fx = DIST[st.dist];
      let h = '';
      F.agora.focos.filter(f => fx.includes(f.fx)).sort((a, b) => a.t - b.t).forEach(f => {
        const p = M.projeta(f.lat, f.lon, f.mun);
        if (!p) return;
        const d = `M${p[0].toFixed(3)},${p[1].toFixed(3)}l.001,0`, i = vis.push(f) - 1;
        h += `<path class="fo-anel" d="${d}" data-i="${i}"/><path class="fo-p fo-a${idadeDe(f.t)}" d="${d}" data-i="${i}"/>`;
      });
      ptsG.innerHTML = h;
      if (ptsG.parentNode !== M.svg || M.svg.lastChild !== ptsG) M.svg.append(ptsG);
    }
    function fechaCartao() {
      if (!cartao) return;
      const tinha = cartao.contains(document.activeElement);
      cartao.remove();
      cartao = null;
      if (tinha && ptsG) mapa().svg.focus({ preventScroll: true });
    }
    function abreCartao(f, ev) {
      fechaCartao();
      if (!f) return;
      const M = mapa(), m = porCod[f.mun];
      cartao = document.createElement('div');
      cartao.className = 'fo-cartao';
      cartao.setAttribute('role', 'dialog');
      cartao.setAttribute('aria-label', `Foco de calor ${f.sat} de ${quando(f.t)}`);
      cartao.tabIndex = -1;
      const url = `alimentadores/${encodeURIComponent(f.al)}/?fogo=${f.lat},${f.lon}&per=${st.per}&dist=${st.dist}`;
      cartao.innerHTML = cartaoHtml(f, m && m.nome) +
        (f.al ? `<a class="fo-c-a" href="${esc(window.ARGOS_PAG ? window.ARGOS_PAG.url(url) : url)}">Ver no mapa do alimentador →</a>` : '') +
        '<button type="button" class="fo-x" aria-label="Fechar o cartão do foco" title="Fechar">×</button>';
      M.caixa.append(cartao);
      cartao.querySelector('.fo-x').addEventListener('click', fechaCartao);
      const a = cartao.querySelector('.fo-c-a');
      if (a && window.ARGOS_PAG) a.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); window.ARGOS_PAG.abre(url); });
      // perto do ponto no computador (sem cobrir o ponto); no celular, em cima do mapa
      const r = M.caixa.getBoundingClientRect(), w = cartao.offsetWidth, h = cartao.offsetHeight;
      if (!matchMedia('(max-width:860px)').matches && ev && ev.clientX) {
        const x = ev.clientX - r.left, y = ev.clientY - r.top;
        let left = x + 16, top = y - h / 2;
        if (left + w > r.width - 8) left = x - 16 - w;
        top = Math.max(8, Math.min(r.height - h - 8, top));
        cartao.style.left = Math.max(8, left) + 'px'; cartao.style.top = top + 'px';
      } else cartao.classList.add('topo');
      cartao.focus({ preventScroll: true });
    }
    // alimentador que passa por mais de um município: o número dele NO município aberto sai dos pontos (al/<AL>.json); só
    // os que têm foco no período, e só com o município aberto (o estado nunca baixa os arquivos al/)
    function paresMun() {
      if (!ativo || !C || C.exato || !mapa()) return;
      const cod = mapa().nivel().mun, m = porCod[cod];
      if (!m) return;
      const fx = DIST[st.dist], J = C.J, falta = (m.als || []).filter(a => (alMuns[a.cod] || 0) > 1 && C.al[a.cod] && !pares.has(chave(a.cod, cod)));
      if (!falta.length) return;
      const k0 = st.per + '|' + st.dist;
      const conta = al => { if (k0 === st.per + '|' + st.dist) pares.set(chave(al, cod), pontosDe(al).filter(f => f.mun === cod && CONTA.has(f.sat) && fx.includes(f.fx) && naJanela(J, f)).length); };
      falta.filter(a => !temArq(a.cod)).forEach(a => conta(a.cod));    // só focos ao vivo: sem arquivo
      lerAls(falta.filter(a => temArq(a.cod)).map(a => a.cod), conta)
        .then(() => { if (k0 === st.per + '|' + st.dist && ativo && mapa().nivel().mun === cod) mapa().refaz(); });
    }

    // ---------- Histórico e filtros ----------
    const H = { per: null, int: null, dist: null, reg: '', polo: '', mun: '', al: '', pedido: 0 };
    const regs = Object.keys(MUN.regs || {});
    function abreHist() {
      if (!hist) {
        hist = document.createElement('div');
        hist.className = 'fo-hist';
        hist.setAttribute('role', 'dialog');
        hist.setAttribute('aria-label', 'Histórico e filtros das queimadas');
        hist.hidden = true;
        document.body.append(hist);
        hist.addEventListener('click', cliqueHist);
        hist.addEventListener('change', mudaHist);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && hist && !hist.hidden) { e.preventDefault(); e.stopPropagation(); fechaHist(); } }, true);
        addEventListener('resize', () => { if (hist && !hist.hidden) pintaHist(); });
      }
      if (H.per === null) {                              // abre no período, distância e lugar do mapa
        const nv = mapa().nivel(), m = porCod[nv.mun];
        Object.assign(H, { per: st.per, dist: st.dist, reg: nv.reg || '', polo: nv.pol || '', mun: m ? m.cod : '', al: nv.al || '' });
      }
      hist.hidden = false;
      document.documentElement.classList.add('fo-hist-aberto');
      pintaHist();
      const x = hist.querySelector('.fo-x');
      if (x) x.focus({ preventScroll: true });
    }
    function fechaHist() {
      if (!hist || hist.hidden) return;
      hist.hidden = true;
      document.documentElement.classList.remove('fo-hist-aberto');
      const b = caixaFo && caixaFo.querySelector('.fo-hist-b');
      if (b) b.focus({ preventScroll: true });
    }
    function cliqueHist(e) {
      if (e.target.closest('.fo-x')) return fechaHist();
      const b = e.target.closest('[data-fo-hper], [data-fo-hdist], [data-fo-al]');
      if (!b) return;
      if (b.dataset.foAl) { const url = `alimentadores/${encodeURIComponent(b.dataset.foAl)}/?fogo=1&per=${H.per === 'int' ? '30d' : H.per}&dist=${H.dist}`; window.ARGOS_PAG ? window.ARGOS_PAG.abre(url) : (location.href = url); return; }
      if (b.dataset.foHper) {
        H.per = b.dataset.foHper;
        if (H.per === 'int' && !H.int) { const J = janela('30d'); H.int = { de: J.dias[0], ate: J.dias[J.dias.length - 1] }; }
      }
      if (b.dataset.foHdist) H.dist = b.dataset.foHdist;
      const foco = b.dataset.foHper ? `[data-fo-hper="${H.per}"]` : `[data-fo-hdist="${H.dist}"]`;
      pintaHist();
      const n = hist.querySelector(foco);
      if (n) n.focus({ preventScroll: true });
    }
    function mudaHist(e) {
      const t = e.target, k = t.name;
      if (k === 'reg') Object.assign(H, { reg: t.value, polo: '', mun: '', al: '' });
      else if (k === 'polo') Object.assign(H, { polo: t.value, mun: '', al: '' });
      else if (k === 'mun') Object.assign(H, { mun: t.value, al: '' });
      else if (k === 'al') H.al = t.value;
      else if (k === 'de' || k === 'ate') { H.int = Object.assign({}, H.int, { [k]: t.value }); }
      else return;
      pintaHist();
      const n = hist.querySelector(`[name="${k}"]`);
      if (n) n.focus({ preventScroll: true });
    }
    // municípios e alimentadores do lugar escolhido
    function lugar() {
      const ms = (MUN.muns || []).filter(m => (!H.reg || m.reg === H.reg) && (!H.polo || m.polo === H.polo) && (!H.mun || m.cod === H.mun));
      const nome = H.al ? `Alimentador ${H.al}` : H.mun ? (porCod[H.mun] || {}).nome : H.polo ? `Polo ${H.polo}` : H.reg ? `Regional ${H.reg}` : 'Tocantins';
      return { ms, cods: new Set(ms.map(m => m.cod)), als: [...new Set(ms.flatMap(m => (m.als || []).map(a => a.cod)))], nome, todo: !H.reg && !H.polo && !H.mun && !H.al };
    }
    const opcoes = (vals, atual, todos) => `<option value="">${todos}</option>` + vals.map(([v, t]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(t)}</option>`).join('');
    function pintaHist() {
      if (!hist || hist.hidden) return;
      const meu = ++H.pedido, Lg = lugar(), fx = DIST[H.dist], J = janela(H.per, H.int);
      const ms0 = (MUN.muns || []).filter(m => m.slug);
      const polos = [...new Set(ms0.filter(m => !H.reg || m.reg === H.reg).map(m => m.polo))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const munsOp = ms0.filter(m => (!H.reg || m.reg === H.reg) && (!H.polo || m.polo === H.polo)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const alsOp = H.mun ? ((porCod[H.mun] || {}).als || []).map(a => a.cod).sort() : [];
      const r = ref(), d1 = r ? diaDe(r) : '', d0 = F.resumo ? F.resumo.meses[0] + '-01' : '';
      const sc = hist.querySelector('.fo-h-c'), topo = sc ? sc.scrollTop : 0;
      hist.innerHTML = `<div class="fo-h-cab"><h2>Queimadas<small>Histórico e filtros · ${esc(Lg.nome)}</small></h2>` +
        '<button type="button" class="fo-x" aria-label="Fechar o histórico" title="Fechar (Esc)">×</button></div><div class="fo-h-c">' +
        `<div class="fo-h-f"><span class="fo-h-r">Período</span>${seg('hper', [...PERS, 'int'], PER_TXT, H.per, 'Período')}` +
        (H.per === 'int' ? `<div class="fo-int"><label>De <input type="date" name="de" value="${esc(H.int.de)}" min="${d0}" max="${d1}"></label>` +
          `<label>Até <input type="date" name="ate" value="${esc(H.int.ate)}" min="${d0}" max="${d1}"></label></div>` : '') +
        `<span class="fo-h-r">Local</span><div class="fo-h-sel">` +
        `<label><span>Regional</span><select name="reg">${opcoes(regs.map(x => [x, x]), H.reg, 'Todas')}</select></label>` +
        `<label><span>Polo</span><select name="polo">${opcoes(polos.map(x => [x, x]), H.polo, 'Todos')}</select></label>` +
        `<label><span>Município</span><select name="mun">${opcoes(munsOp.map(m => [m.cod, m.nome]), H.mun, 'Todos')}</select></label>` +
        `<label><span>Alimentador</span><select name="al"${H.mun ? '' : ' disabled title="Escolha um município"'}>${opcoes(alsOp.map(a => [a, a]), H.al, 'Todos')}</select></label></div>` +
        `<span class="fo-h-r">Distância</span>${seg('hdist', ['sob', '1km', '5km'], DIST_TXT, H.dist, 'Distância da rede')}</div>` +
        `<p class="fo-per">${esc(linhaPer(J, J.passo === 'h' ? J.ate : r))}</p><div class="fo-h-res"><p class="fo-carrega">Contando…</p></div></div>`;
      const nc = hist.querySelector('.fo-h-c');
      if (nc) nc.scrollTop = topo;
      calculaHist(J, Lg, fx).then(res => { if (meu === H.pedido && hist && !hist.hidden) pintaRes(res, J, Lg, fx); });
    }
    // números do histórico: dos pontos quando o período sai do resumo (intervalo antes dos últimos 35 dias), do
    // alimentador escolhido ou de 24 h; senão das contagens do resumo. Incêndios: dos arquivos dos alimentadores do lugar
    // que têm incêndio nos meses do período (resumo "inc")
    async function calculaHist(J, Lg, fx) {
      await Promise.all([lerResumo(), F.pAgora || lerAgora()]);
      const R = F.resumo, out = { fx3: [0, 0, 0], top: [], inc: null, serie: null, nota: '' };
      const noLugar = f => (H.al ? f.al === H.al : Lg.todo ? true : Lg.cods.has(f.mun));
      const mesesJ = J.passo === 'm' ? J.meses : [...new Set((J.dias || [diaDe(J.de), diaDe(J.ate)]).map(d => d.slice(0, 7)))];
      const idxM = R ? mesesJ.map(m => R.meses.indexOf(m)).filter(i => i >= 0) : [];
      const comFoco = al => temArq(al) && (!R || FX.some(f => idxM.some(i => (R.al[al][f] || [])[i])));
      const alsLugar = H.al ? [H.al] : Lg.todo ? Object.keys((R && R.al) || {}) : Lg.als;
      const pelosPontos = H.al || J.passo === 'h' ? !!H.al : !cobre(J) || !!J.passoG;
      let pts = [];
      if (J.passo === 'h' && !H.al) {
        pts = F.agora ? F.agora.focos.filter(noLugar) : [];
      } else if (pelosPontos) {
        const quais = alsLugar.filter(comFoco);
        const msg = hist.querySelector('.fo-carrega');
        if (msg && quais.length > 3) msg.textContent = `Lendo os pontos de ${quais.length} alimentadores…`;
        await lerAls(quais);
        quais.forEach(al => { pts = pts.concat(pontosDe(al).filter(noLugar)); });
        out.nota = H.al ? '' : 'Contado ponto a ponto nos arquivos dos alimentadores.';
      }
      if (J.passo === 'h' || pelosPontos) {
        const S = seriePontos(J, pts, FX);
        out.serie = S;
        S.v.forEach(x => x.forEach((n, i) => { out.fx3[i] += n; }));
        const porAl = {};
        pts.forEach(f => { if (CONTA.has(f.sat) && fx.includes(f.fx) && naJanela(J, f)) porAl[f.al] = (porAl[f.al] || 0) + 1; });
        out.top = Object.entries(porAl).sort((a, b) => b[1] - a[1]).slice(0, 10);
        out.topTodo = false;
        out.trechos = H.al ? Object.entries(pts.reduce((o, f) => { if (CONTA.has(f.sat) && fx.includes(f.fx) && naJanela(J, f) && f.tr) o[f.tr] = (o[f.tr] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10) : null;
      } else {                                            // resumo (+ o agora.json depois dele)
        const idx = idxDe(J), tab = J.passo === 'm' ? R.mun : R.mun_dias || {}, ch = J.passo === 'm' ? J.meses : J.dias;
        const lista = J.passo === 'm' ? R.meses : R.dias || [];
        const v = ch.map(() => [0, 0, 0]);
        Object.entries(tab).forEach(([cod, x]) => {
          if (!Lg.todo && !Lg.cods.has(cod)) return;
          ch.forEach((k, j) => { const i = lista.indexOf(k); if (i >= 0) FX.forEach((f, q) => { v[j][q] += ((x[f] || [])[i]) || 0; }); });
        });
        const s = somado(), pos = new Map(ch.map((k, j) => [k, j]));
        if (F.agora) F.agora.focos.forEach(f => {
          if (!CONTA.has(f.sat) || f.t <= s || !noLugar(f) || !naJanela(J, f)) return;
          const j = pos.get(J.passo === 'm' ? f.mes : f.dia);
          if (j !== undefined) v[j][FX.indexOf(f.fx)]++;
        });
        out.serie = { passo: J.passo, ch, v };
        v.forEach(x => x.forEach((n, i) => { out.fx3[i] += n; }));
        const ta = J.passo === 'm' ? R.al : R.al_dias || {};
        const porAl = {};
        alsLugar.forEach(al => { const n = somaFx(ta[al], fx, idx); if (n) porAl[al] = n; });
        if (F.agora) F.agora.focos.forEach(f => { if (CONTA.has(f.sat) && fx.includes(f.fx) && f.t > s && naJanela(J, f) && alsLugar.includes(f.al)) porAl[f.al] = (porAl[f.al] || 0) + 1; });
        out.top = Object.entries(porAl).sort((a, b) => b[1] - a[1]).slice(0, 10);
        out.topTodo = !Lg.todo;
      }
      // incêndios da Crítica no período e no lugar
      if (R) {
        const comInc = alsLugar.filter(al => R.al[al] && (R.al[al].inc || []).some((n, i) => n && (mesesJ.includes(R.meses[i]) || mesesJ.includes(mesMais(R.meses[i], 1)) || mesesJ.includes(mesMais(R.meses[i], -1)))));
        await lerAls(comInc);
        const inc = [];
        comInc.forEach(al => (F.dadosAl.get(al) || { inc: [] }).inc.forEach(x => {
          if ((H.al ? x.al === H.al : Lg.todo || Lg.cods.has(x.mun)) && x.t >= J.de && x.t <= J.ate) inc.push(x);
        }));
        out.inc = inc.sort((a, b) => b.t - a.t);
      }
      return out;
    }
    function pintaRes(res, J, Lg, fx) {
      const caixaR = hist.querySelector('.fo-h-res');
      if (!caixaR) return;
      const [nS, n1, n5] = res.fx3, ate5 = nS + n1 + n5;
      const larg = caixaR.clientWidth || 340;
      caixaR.innerHTML = `<div class="fo-nums">` +
        `<div><b>${nf(ate5)}</b><span>focos até 5 km</span></div>` +
        `<div><b>${nf(nS + n1)}</b><span>até 1 km</span></div>` +
        `<div><b>${nf(nS)}</b><span>sob a rede</span></div>` +
        `<div><b>${res.inc ? nf(res.inc.length) : '—'}</b><span>incêndios na Crítica</span></div></div>` +
        (res.serie ? grafico(res.serie, fx, larg) : '') +
        (res.trechos ? `<h3>Trechos com mais focos</h3>${res.trechos.length ? `<ol class="fo-top">${res.trechos.map(([t, n]) => `<li><span>${esc(t)}</span><b>${focosTxt(n)}</b></li>`).join('')}</ol>` : '<p class="fo-nota">Nenhum foco no período.</p>'}` :
          `<h3>Alimentadores com mais focos${res.topTodo ? ' <small>(alimentador inteiro)</small>' : ''}</h3>` +
          (res.top.length ? `<ol class="fo-top">${res.top.map(([al, n]) => `<li><button type="button" data-fo-al="${esc(al)}" title="Abrir o mapa do alimentador com as queimadas">${esc(al)}</button><b>${focosTxt(n)}</b></li>`).join('')}</ol>` : '<p class="fo-nota">Nenhum foco no período.</p>')) +
        `<h3>Incêndios na Crítica</h3>` +
        (res.inc === null ? '<p class="fo-nota">Sem o histórico (resumo.json não veio).</p>' : res.inc.length ?
          `<ul class="fo-inc-l">${res.inc.slice(0, 60).map(x => `<li><b>${dma(x.dia)} ${hm(x.t)} · ${esc(x.al)}${x.tr ? ' · ' + esc(x.tr) : ''}</b><span>${esc(x.ativo)} · ${nf(x.cons)} cons. · ${x.dur >= 120 ? NF1.format(x.dur / 60) + ' h' : nf(x.dur) + ' min'} · ${x.tipo === 'HO' ? 'Causada por terceiros · Incêndio' : `registrada como ${esc((x.causa || 'outra causa').toLowerCase())}; o texto cita fogo`}</span></li>`).join('')}</ul>` +
          (res.inc.length > 60 ? `<p class="fo-nota">E mais ${nf(res.inc.length - 60)}.</p>` : '') : '<p class="fo-nota">Nenhum incêndio na Crítica no período.</p>') +
        `<p class="fo-nota">${esc(criticaTxt())}: subcausa Incêndio e os achados pelo texto livre (marcados “o texto cita fogo”). O ponto do incêndio é o equipamento que abriu: o fogo pode estar a jusante. ` +
        `Focos: INPE e FIRMS, só VIIRS e MODIS nas contagens. Atraso: ${ATRASO}.${res.nota ? ' ' + esc(res.nota) : ''}</p>`;
    }
  }

  // ================================================================ mapa do alimentador
  function alimentador() {
    const D = window.D, AL = D.meta.al, map = window.__map;
    if (!map || !window.L) return;
    const $ = id => document.getElementById(id);
    const q = new URLSearchParams(location.search), fogo = q.get('fogo');
    const st = { ligado: !!fogo || guarda('fo-ligado') === '1', per: q.get('per') || guarda('fo-per-al') || '7d', dist: q.get('dist') || guarda('fo-dist') || '5km', int: null, sel: null };
    if (![...PERS, 'int'].includes(st.per)) st.per = '7d';
    if (st.per === 'int') st.per = '7d';
    if (!DIST[st.dist]) st.dist = '5km';
    let pronto = false, porTr = {}, J = null, pts = [], incs = [];
    const celular = () => matchMedia('(max-width:980px)').matches;

    // ---------- rótulo do trecho: bolinha laranja com a chama e os focos do período ----------
    // de longe (zoom baixo) só os T3 com mais focos (os TOPO_LONGE primeiros); de perto, todos
    const TOPO_LONGE = 12;
    let longe = new Set();
    window.__rotuloExtra = n => (st.ligado && porTr[n] ? `<span class="fo-n" title="${focosTxt(porTr[n])} ${DIST_TXT[st.dist].toLowerCase()} no período"${longe.has(n) ? ' data-longe' : ''} data-z="${Math.min(500, porTr[n])}">${CHAMA}${nf(porTr[n])}</span>` : '');
    const refazRot = () => { if (window.__refazRotulos) window.__refazRotulos(); colisao(); };
    // rótulos de T3 com foco que se cobrem (12 meses, muitos trechos perto): fica o de mais focos e o outro some até o zoom
    // separar. Só T3 some; T1, T2, o escolhido e o que tem NAE ficam sempre (e contam como obstáculo)
    let pedidoCol = 0;
    function colisao() {
      cancelAnimationFrame(pedidoCol);
      pedidoCol = requestAnimationFrame(() => {
        const todos = [...map.getContainer().querySelectorAll('.leaflet-marker-icon > .lb')];
        todos.forEach(e => e.classList.remove('fo-sob'));
        if (!st.ligado) return;
        const n = e => +((e.querySelector('.fo-n') || {}).dataset || {}).z || 0;
        const fixo = e => !e.classList.contains('fus') || e.classList.contains('sel') || e.classList.contains('oc');
        const vis = todos.filter(e => e.querySelector('.fo-n') && e.offsetWidth && getComputedStyle(e.parentNode).visibility !== 'hidden')
          .sort((a, b) => fixo(b) - fixo(a) || n(b) - n(a));
        const ficam = [];
        vis.forEach(e => {
          const r = e.getBoundingClientRect();
          if (!fixo(e) && ficam.some(q => r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom)) e.classList.add('fo-sob');
          else ficam.push(r);
        });
      });
    }
    map.on('zoomend moveend', colisao);
    addEventListener('resize', colisao);
    // a Faixa e a Inspeção escondem rótulos de longe pela classe do body (limp-on, insp-on) e o zoom pela do mapa (longe)
    const obs = new MutationObserver(colisao);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    obs.observe(map.getContainer(), { attributes: true, attributeFilter: ['class'] });

    // ---------- botão no menu Camadas (e na fileira do alto, lupa-painel.js) ----------
    const l2 = window.__ctlMapa ? window.__ctlMapa() : null;
    let btn = null;
    if (l2) {
      const c = document.createElement('div');
      c.className = 'ctl-card';
      c.innerHTML = '<button type="button" class="ctl-fogo" aria-pressed="false" title="Mostrar ou esconder os focos de calor e os incêndios da Crítica">Queimadas</button>';
      l2.append(c);
      btn = c.querySelector('button');
      btn.addEventListener('click', () => liga(!st.ligado));
    }

    // ---------- bloco no painel ----------
    const card = document.createElement('section');
    card.className = 'limp-card fo-card';
    card.setAttribute('aria-label', 'Queimadas');
    card.hidden = true;
    const depois = document.querySelector('.exe-card') || document.querySelector('.mnt-card') || document.querySelector('.insp-card') || document.querySelector('.limp-card') || $('det');
    if (depois) depois.after(card); else (document.querySelector('.panel') || document.body).append(card);
    card.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.foPer) { st.per = b.dataset.foPer; if (st.per === 'int' && !st.int) { const j = janela('30d'); st.int = { de: j.dias[0], ate: j.dias[j.dias.length - 1] }; } if (st.per !== 'int') guarda('fo-per-al', st.per); return atualiza(`[data-fo-per="${st.per}"]`); }
      if (b.dataset.foDist) { st.dist = b.dataset.foDist; guarda('fo-dist', st.dist); return atualiza(`[data-fo-dist="${st.dist}"]`); }
      if (b.dataset.foTr) { if (window.__sel) window.__sel(b.dataset.foTr, true); return; }
      if (b.dataset.foInc) { const x = incs[+b.dataset.foInc]; if (x && x.lat != null) { enquadra([x.lat, x.lon]); abreInc(x); } }
    });
    card.addEventListener('change', e => {
      const t = e.target;
      if (t.name !== 'de' && t.name !== 'ate') return;
      st.int = Object.assign({}, st.int, { [t.name]: t.value });
      atualiza(`[name="${t.name}"]`);
    });

    // ---------- legenda compacta no mapa (vai para a coluna das legendas: extras.js .ctl-lgs) ----------
    const lg = document.createElement('div');
    lg.className = 'fo-lg';
    lg.setAttribute('role', 'group');
    lg.setAttribute('aria-label', 'Queimadas no mapa');
    lg.hidden = true;
    lg.innerHTML = `<b>Queimadas</b>${IDADE_TXT.map((t, i) => `<span><i class="fo-a${i}"></i><em>${t.replace('menos de ', '< ').replace('mais de ', '> ').replace(' a ', '–')}</em></span>`).join('')}` +
      `<span><i class="fo-inc-i">${CHAMA}</i><em>Incêndio</em></span>`;
    L.DomEvent.disableClickPropagation(lg);
    const mb = document.querySelector('.mapbox');
    if (mb) mb.append(lg);
    addEventListener('DOMContentLoaded', () => { const box = document.querySelector('.mapbox > .ctl-lgs'); if (box) box.append(lg); });

    // ---------- mapa ----------
    let camada = null, camInc = null;
    // no mesmo canvas da rede (o do mapa): um canvas a mais por cima pegaria o toque nos trechos
    const corIdade = ['#dc2626', '#f97316', '#fde3c0'];
    function desenha() {
      if (camada) { camada.remove(); camada = null; }
      if (camInc) { camInc.remove(); camInc = null; }
      if (!st.ligado || !pronto) return;
      const fx = DIST[st.dist];
      const ms = pts.filter(f => fx.includes(f.fx) && naJanela(J, f)).sort((a, b) => a.t - b.t).map(f => {
        const k = idadeDe(f.t);
        return L.circleMarker([f.lat, f.lon], { radius: k === 2 ? 5 : 6.5, weight: 2, color: k === 2 ? '#7c2d12' : '#fff', fillColor: corIdade[k], fillOpacity: 1, bubblingMouseEvents: false })
          .on('click', e => { L.DomEvent.stopPropagation(e); balao(f); });
      });
      camada = L.layerGroup(ms).addTo(map);
      // um marcador por equipamento (o mesmo ativo pode ter aberto mais de uma vez), com o número quando passa de um
      const grupos = new Map();
      incs.forEach(x => { if (x.lat == null) return; const k = x.lat.toFixed(5) + ',' + x.lon.toFixed(5); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); });
      camInc = L.layerGroup([...grupos.values()].map(xs => L.marker([xs[0].lat, xs[0].lon], { zIndexOffset: 2500, keyboard: true,   // acima dos rótulos
        title: `Incêndio na Crítica: ${xs.map(x => quando(x.t)).join(', ')}`,
        icon: L.divIcon({ className: '', iconSize: null, html: `<div class="fo-inc">${CHAMA}${xs.length > 1 ? `<b>${xs.length}</b>` : ''}</div>` }) })
        .on('click', e => { L.DomEvent.stopPropagation(e); abreInc(xs[0], xs); }))).addTo(map);
    }
    const pop = html => L.popup({ className: 'fo-pop', maxWidth: 300, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] }).setContent(html);
    function balao(f) {
      pop(`<div class="fo-c">${cartaoHtml(f, '')}${f.tr && D.trechos.some(t => t.nome === f.tr) ? `<button type="button" class="fo-c-a" data-fo-tr="${esc(f.tr)}">Ver o trecho ${esc(f.tr)}</button>` : ''}</div>`).setLatLng([f.lat, f.lon]).openOn(map);
    }
    function abreInc(x, xs) {
      if (x.lat == null) return;
      xs = xs || incs.filter(y => y.lat === x.lat && y.lon === x.lon);
      pop(xs.map(y => `<div class="fo-c">${incHtml(y)}</div>`).join('<hr class="fo-hr">')).setLatLng([x.lat, x.lon]).openOn(map);
    }
    map.getContainer().addEventListener('click', e => { const b = e.target.closest('.fo-pop [data-fo-tr]'); if (b && window.__sel) { map.closePopup(); window.__sel(b.dataset.foTr, true); } });
    function enquadra(ll) {
      const box = document.querySelector('.mapbox');
      if (celular() && box && !document.body.classList.contains('tela-cheia') && getComputedStyle(box).position !== 'sticky') box.scrollIntoView({ block: 'start' });
      map.invalidateSize();
      map.setView(ll, Math.max(map.getZoom(), 15));
    }

    // ---------- liga, carrega, conta ----------
    function liga(on) {
      st.ligado = on;
      guarda('fo-ligado', on ? '1' : '0');
      if (on) carrega();
      if (!on) map.closePopup();
      atualiza();
    }
    let carregou = false;
    function carrega() {
      if (carregou) return;
      carregou = true;
      ouvintes.add(() => { if (pronto) atualiza(); });   // agora.json novo (a cada 10 min)
      Promise.all([lerAgora(), lerResumo().then(() => (temArq(AL) ? lerAl(AL) : null))]).then(() => { pronto = true; atualiza(); if (fogo) vaiAoFoco(); });
      setInterval(() => { if (st.ligado && !document.hidden) lerAgora(); }, 10 * 6e4);
    }
    function vaiAoFoco() {
      const ll = fogo.split(',').map(Number);
      if (ll.length !== 2 || !ll.every(isFinite)) return;
      const f = pts.reduce((m, p) => { const d = Math.hypot(p.lat - ll[0], p.lon - ll[1]); return d < m.d ? { d, p } : m; }, { d: 1e-3, p: null }).p;
      const ir = () => { map.setView(ll, Math.max(map.getZoom(), 14)); if (f) balao(f); };
      if (window.__alPronto && window.__alPronto.then) window.__alPronto.then(() => setTimeout(ir, 50)); else ir();
    }
    function atualiza(focoSel) {
      if (btn) btn.setAttribute('aria-pressed', String(st.ligado));
      card.hidden = !st.ligado;
      lg.hidden = !st.ligado;
      if (st.ligado && pronto) {
        J = janela(st.per, st.int);
        pts = pontosDe(AL);
        const d = F.dadosAl.get(AL);
        incs = d ? d.inc.filter(x => x.t >= J.de && x.t <= J.ate).sort((a, b) => b.t - a.t) : [];
        const fx = DIST[st.dist];
        porTr = {};
        pts.forEach(f => { if (f.tr && CONTA.has(f.sat) && fx.includes(f.fx) && naJanela(J, f)) porTr[f.tr] = (porTr[f.tr] || 0) + 1; });
        longe = new Set(Object.entries(porTr).sort((a, b) => b[1] - a[1]).slice(0, TOPO_LONGE).map(([t]) => t));
      } else porTr = {};
      refazRot();
      desenha();
      pinta(focoSel);
    }
    function pinta(focoSel) {
      if (!st.ligado) { card.innerHTML = ''; return; }
      const sc = card.closest('.panel'), topo = sc ? sc.scrollTop : 0;
      const r = ref(), d1 = r ? diaDe(r) : '', d0 = F.resumo ? F.resumo.meses[0] + '-01' : '';
      let corpo;
      if (!pronto && !F.semResumo) corpo = '<p class="fo-carrega">Carregando os focos…</p>';
      else if (F.semResumo && F.semAgora) corpo = '<p class="fo-nota">Sem dados de focos agora (os arquivos não vieram): tente mais tarde.</p>';
      else {
        const fx = DIST[st.dist], S = seriePontos(J, pts, FX), t3 = [0, 0, 0];
        S.v.forEach(x => x.forEach((n, i) => { t3[i] += n; }));
        const trs = Object.entries(porTr).sort((a, b) => b[1] - a[1]);
        corpo = `<p class="fo-per">${esc(linhaPer(J, J.passo === 'h' ? J.ate : r))}${F.semResumo ? ' · sem o histórico' : ''}</p>` +
          `<div class="fo-nums"><div><b>${nf(t3[0] + t3[1] + t3[2])}</b><span>focos até 5 km</span></div><div><b>${nf(t3[0])}</b><span>sob a rede</span></div>` +
          `<div><b>${nf(trs.length)}</b><span>trechos com foco <small>(${DIST_TXT[st.dist].toLowerCase()})</small></span></div><div><b>${nf(incs.length)}</b><span>incêndios na Crítica</span></div></div>` +
          grafico(S, fx, (card.clientWidth || 340)) +
          (trs.length ? `<h3>Trechos com mais focos</h3><ol class="fo-top">${trs.slice(0, 8).map(([t, n]) => `<li><button type="button" data-fo-tr="${esc(t)}" title="Escolher o trecho no mapa">${esc(t)}</button><b>${focosTxt(n)}</b></li>`).join('')}</ol>` : '') +
          (incs.length ? `<h3>Incêndios na Crítica</h3><ul class="fo-inc-l">${incs.map((x, i) => `<li><button type="button" data-fo-inc="${i}"${x.lat == null ? ' disabled title="Sem ponto no mapa"' : ''}><b>${dma(x.dia)} ${hm(x.t)}${x.tr ? ' · ' + esc(x.tr) : ''}</b>` +
            `<span>${esc(x.ativo)} · ${nf(x.cons)} cons. · ${x.dur >= 120 ? NF1.format(x.dur / 60) + ' h' : nf(x.dur) + ' min'} · ${x.tipo === 'HO' ? 'Causada por terceiros · Incêndio' : `registrada como ${esc((x.causa || 'outra causa').toLowerCase())}; o texto cita fogo`}</span></button></li>`).join('')}</ul>` : '') +
          `<p class="fo-nota">Pontos ao vivo pela idade (${IDADE_TXT.join(', ')}); GOES, METOP e MSG só como ponto ao vivo. Atraso: ${ATRASO}. ` +
          `${esc(criticaTxt())}; o ponto do incêndio é o equipamento que abriu: o fogo pode estar a jusante.</p>`;
      }
      card.innerHTML = `<div class="fo-top-c"><h2>Queimadas<small>Focos de calor perto da rede (INPE e FIRMS) e incêndios da Crítica</small></h2></div>` +
        seg('per', [...PERS, 'int'], PER_TXT, st.per, 'Período') +
        (st.per === 'int' && st.int ? `<div class="fo-int"><label>De <input type="date" name="de" value="${esc(st.int.de)}" min="${d0}" max="${d1}"></label><label>Até <input type="date" name="ate" value="${esc(st.int.ate)}" min="${d0}" max="${d1}"></label></div>` : '') +
        seg('dist', ['sob', '1km', '5km'], DIST_TXT, st.dist, 'Distância da rede') + `<p class="fo-selo">${selo()}</p>` + corpo;
      if (sc) sc.scrollTop = topo;
      if (focoSel) { const n = card.querySelector(focoSel); if (n) n.focus({ preventScroll: true }); }
    }
    addEventListener('resize', () => { if (st.ligado && pronto) pinta(); });
    if (st.ligado) carrega();
    atualiza();
  }
})();
