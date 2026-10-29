// Priorização de limpeza de faixa e poda (/teste/priorizacao/): motor e tela do Artifact "VERA Priorização de Faixa".
// Dados: window.DADOS (priorizacao-dados.js).
// Nota de 0 a 100 = soma de pontos, como numa prova: cada critério dá os pontos da faixa de valor em que o trecho está
// (NAE, DEC e FEC por 100 km, clientes por evento, hierarquia T1/T2/T3, cliente Grupo A e situação da limpeza de faixa).
// A tabela de pontos de cada perfil soma 100.
'use strict';
/* Motor de priorização VERA (teste). Funções puras: recebem dados + tabela de pontos + parâmetros e devolvem o ranking com
   os pontos de cada critério, regras e justificativa. É o mesmo código que iria para o serviço de score do backend. */
const VERA = (() => {
  const DIA = 864e5;
  // lim: onde começa cada faixa de valor depois da primeira (o limite já é da faixa de cima; valor 0 não pontua);
  // passo: menor diferença mostrada, para a faixa terminar antes do limite seguinte ("20 a 39,9", "1.000 a 9.999");
  // rot: nome das faixas sem valor numérico. A tabela de pontos do perfil tem um número por faixa; zero: o que não pontua.
  const CRIT = [
    { k: 'nae', b: 'his', nome: 'NAE por 100 km', curto: 'NAE', lim: [20, 40, 60], passo: 0.1, zero: 'nenhuma' },
    { k: 'dec', b: 'his', nome: 'DEC por 100 km', curto: 'DEC', lim: [1000, 10000], passo: 1, zero: 'nenhum' },
    { k: 'fec', b: 'his', nome: 'FEC por 100 km', curto: 'FEC', lim: [100, 1000, 10000], passo: 1, zero: 'nenhum' },
    { k: 'cli', b: 'imp', nome: 'Clientes (UCs ligadas)', curto: 'Clientes', lim: [10, 100, 1000], passo: 1, inteiro: true },
    { k: 'hier', b: 'imp', nome: 'Hierarquia do trecho', curto: 'Hierarquia', rot: ['T1', 'T2', 'T3'] },
    { k: 'ga', b: 'imp', nome: 'Cliente Grupo A', curto: 'Grupo A', rot: ['tem'], zero: 'não tem ou sem dado' },
    { k: 'limp', b: 'man', nome: 'Limpeza de faixa', curto: 'Limpeza', rot: ['vencida', 'vence em breve'], zero: 'em dia' },
  ];
  const BLOCOS = [
    { k: 'imp', nome: 'Impacto', cor: 'var(--c-imp)' },
    { k: 'his', nome: 'Histórico', cor: 'var(--c-his)' },
    { k: 'man', nome: 'Limpeza de faixa', cor: 'var(--c-man)' },
  ];
  // pontos por faixa (inteiros), na ordem das faixas de CRIT; cada perfil soma 100 nos máximos
  const PERFIS = {
    padrao: { nome: 'Padrão', t: { nae: [5, 10, 15, 20], dec: [5, 10, 15], fec: [3, 5, 8, 10], cli: [5, 10, 15, 20], hier: [10, 5, 3], ga: [5], limp: [20, 10] } },
    prechuva: { nome: 'Pré-chuva (set–nov)', t: { nae: [5, 10, 15, 20], dec: [3, 5, 10], fec: [3, 5, 8, 10], cli: [3, 5, 10, 15], hier: [10, 5, 3], ga: [5], limp: [30, 15] } },
    clima: { nome: 'Plano climático', t: { nae: [5, 10, 15, 25], dec: [5, 10, 20], fec: [3, 5, 8, 10], cli: [3, 5, 10, 15], hier: [10, 5, 3], ga: [5], limp: [15, 8] } },
  };

  function parametrosPadrao() {
    return {
      ref: '2026-10-29', janela: 12, cobEfetiva: 0.5, cobBloqueio: 0.8,
      carencia: { 1: 6, 2: 9, 3: 12 }, ciclo: { 1: 3, 2: 4, 3: 5 }, aVencer: 3,
      lim: { p1: 70, p2: 50, p3: 30 }, planoPolos: [], bonus: 8, pisoKm: 5,
    };
  }

  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfP = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const nfD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmtN = (x) => nf0.format(x);
  const fmt1 = (x) => nf1.format(x);
  const fmtP = (x) => nfP.format(x);   // pontos e nota: 0,25 · 1,5 · 7
  const fmtD = (x) => nfD.format(x);
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKm = (x) => (x < 1 ? nf2.format(x) : nf1.format(x));
  const pct = (x) => nf0.format(Math.round(x * 100)) + '%';
  const qtd = (n, um, muitos) => fmtN(n) + ' ' + (n === 1 ? um : muitos);
  // medida por 100 km como aparece no extrato: cortada (não arredondada) na casa mostrada, para bater com a faixa
  const corta = (x, casas) => Math.floor(x * 10 ** casas + 1e-9) / 10 ** casas;
  const mostra = (x) => (x >= 100 ? fmtN(corta(x, 0)) : x >= 1 ? fmtD(corta(x, 1)) : x >= 0.01 ? fmtP(corta(x, 2)) : 'menos de 0,01');
  const meses = (n) => n + (n === 1 ? ' mês' : ' meses');
  const bruto = (x) => (x < 0.01 ? 'menos de 0,01' : x < 100 ? fmtP(x) : fmtD(x));

  function quantil(arr, q) {
    if (!arr.length) return 0;
    const a = Float64Array.from(arr).sort();
    const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }

  // faixa do valor x no critério c (índice na tabela de pontos); -1 = valor 0, não pontua
  function faixaDe(c, x) {
    if (!(x > 0)) return -1;
    let j = 0;
    while (j < c.lim.length && x + 1e-9 >= c.lim[j]) j++;   // 1e-9: conta de ponto flutuante que dá 39,999… vale 40
    return j;
  }
  // nome da faixa j: "menos de 20", "20 a 39,9", "60 ou mais"; contagem inteira: "1 a 9", "10 a 99", "1.000 ou mais"
  function rotFaixa(c, j, P) {
    if (c.k === 'limp' && j === 1) return 'vence em até ' + meses(P.aVencer);
    if (c.rot) return c.rot[j];
    const L = c.lim, f = (x) => (c.passo < 1 ? fmtD(x) : fmtN(x));
    if (j === 0) return c.inteiro ? '1 a ' + f(L[0] - 1) : 'menos de ' + f(L[0]);
    if (j < L.length) return f(L[j - 1]) + ' a ' + f(Math.round((L[j] - c.passo) * 10) / 10);
    return f(L[j - 1]) + ' ou mais';
  }
  const maxDe = (T, k) => Math.max(0, ...T[k]);
  const notaMax = (T) => CRIT.reduce((s, c) => s + maxDe(T, c.k), 0);
  // desempate entre notas iguais: mais ocorrências por 100 km, depois mais consumidor·hora por 100 km, depois o trecho mais longo
  const cmpNota = (a, b) => b.score - a.score || b.f.n100 - a.f.n100 || b.f.chi100 - a.f.chi100 || b.t.km - a.t.km;

  function preparar(D) {
    const d0 = Date.parse(D.d0 + 'T00:00:00Z');
    const ctx = { D, d0, alims: D.alims, muns: D.muns, ucs: (typeof window !== 'undefined' && window.UCS_TRECHOS && window.UCS_TRECHOS.al) || (typeof UCS_TRECHOS !== 'undefined' && UCS_TRECHOS.al) || null };
    ctx.osInicio = Math.round((Date.parse(D.os_inicio + 'T00:00:00Z') - d0) / DIA);
    ctx.kmClasse = { 1: D.estat.km_T1, 2: D.estat.km_T2, 3: D.estat.km_T3 };
    ctx.trechos = D.trechos.map((t, i) => {
      const a = D.alims[t.a];
      return Object.assign(t, {
        i, al: a[0], se: a[2], polo: a[3] || 'Sem polo', equipe: a[4] || '',
        mun: t.mu >= 0 ? D.muns[t.mu] : '—', id: a[0] + ' · ' + t.n,
      });
    });
    return ctx;
  }
  const diaDe = (ctx, iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - ctx.d0) / DIA);
  const dataDe = (ctx, n) => {
    const s = new Date(ctx.d0 + n * DIA).toISOString();
    return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
  };
  const mesDe = (ctx, n) => {
    const d = new Date(ctx.d0 + n * DIA);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };

  function avaliar(ctx, T, P, flags) {
    const ref = diaDe(ctx, P.ref), janela = P.janela * 30.44;
    const plano = new Set(P.planoPolos);
    const ga = flags.ga, noPlano = flags.plano;

    // 1. fatos por trecho na data de referência
    const F = ctx.trechos.map((t) => {
      let ult = null, bloq = null, cart = null, parcial = null;
      for (const [d, s, f, cod] of t.os) {
        if (d > ref) continue;
        if (s === 1) {
          if (f >= P.cobEfetiva && (ult === null || d > ult)) ult = d;
          if (!parcial || d > parcial.d) parcial = { d, f };
          if (f >= P.cobBloqueio && ref - d <= P.carencia[t.c] * 30.44 && (!bloq || d > bloq.d)) bloq = { d, cod, f };
        } else if (f >= 0.3 && (!cart || f > cart.f)) cart = { d, cod, f };
      }
      // NAE, DEC e FEC contam só as ocorrências da janela depois da última limpeza efetiva: as de antes já foram tratadas.
      // Clientes por evento, meses com evento e eventos nos últimos 90 dias (regras F1 e F4) usam a janela inteira.
      let n = 0, chi = 0, ci = 0, nJan = 0, n90 = 0, posBloq = 0, cliMax = 0;
      const meses = new Set(), usadas = [];
      for (const [d, cons, dur, col, rg] of t.oc) {
        const age = ref - d;
        if (age < 0 || age > janela) continue;
        const pre = ult !== null && d < ult;
        if (!pre) { n++; chi += (cons * dur) / 60; ci += cons; }
        nJan++;
        if (age <= 90) n90++;
        if (bloq && d >= bloq.d) posBloq++;
        meses.add(mesDe(ctx, d));
        if (cons > cliMax) cliMax = cons;
        usadas.push({ d, cons, dur, col, rg, pre });
      }
      return { ult, parcial, bloq, cart, n, chi, ci, nJan, n90, posBloq, meses: meses.size, cliMax, usadas };
    });
    // por 100 km do trecho. Trecho mais curto que P.pisoKm (padrão 5 km) conta como P.pisoKm: a mediana dos trechos tem 0,21 km e,
    // sem esse mínimo, um trecho curtinho com uma só ocorrência passaria o tronco
    const kmConta = (t) => Math.max(P.pisoKm, t.km);
    F.forEach((f, i) => {
      const km = kmConta(ctx.trechos[i]);
      f.n100 = (f.n * 100) / km; f.chi100 = (f.chi * 100) / km; f.ci100 = (f.ci * 100) / km;
    });

    // 2. referência da rodada, calculada sobre a rede toda (não muda com filtro): clientes típicos de cada classe, para trecho sem evento
    const med = { cli: {} };
    for (const c of [1, 2, 3]) {
      med.cli[c] = Math.round(quantil(F.filter((f, i) => ctx.trechos[i].c === c && f.cliMax > 0).map((f) => f.cliMax), 0.5));
    }
    const C = Object.fromEntries(CRIT.map((c) => [c.k, c]));
    const M = Object.fromEntries(CRIT.map((c) => [c.k, maxDe(T, c.k)]));
    const Mtot = CRIT.reduce((s, c) => s + M[c.k], 0) || 1;

    // 3. pontos, regras e faixa
    const res = ctx.trechos.map((t, i) => {
      const f = F[i], eGA = ga.has(t.i), ePlano = plano.has(t.polo) || noPlano.has(t.i);
      // UCs ligadas dos trafos do trecho e dos que saem dele (planilha UC por trafo); alimentador sem a planilha usa os clientes por evento da Crítica
      const uc = ctx.ucs && ctx.ucs[t.al] ? (ctx.ucs[t.al][t.n] || [0, 0, 0]) : null;
      // situação da limpeza de faixa: vence na última limpeza efetiva + ciclo da classe (T1 3, T2 4, T3 5 anos)
      const base = f.ult !== null ? f.ult : ctx.osInicio, stL = f.ult !== null ? 'real' : 'est';
      const vence = Math.round(base + P.ciclo[t.c] * 365.25), faltam = vence - ref;
      const vencida = faltam < 0, aVencer = !vencida && faltam <= P.aVencer * 30.44;
      const origem = f.ult !== null ? 'última limpeza em ' + dataDe(ctx, f.ult)
        : f.parcial ? 'nenhuma limpeza cobrindo ≥ ' + pct(P.cobEfetiva) + ' do trecho desde ' + dataDe(ctx, ctx.osInicio) + ' (última parcial em ' + dataDe(ctx, f.parcial.d) + ', ' + pct(f.parcial.f) + ')'
        : 'sem limpeza registrada desde ' + dataDe(ctx, ctx.osInicio);
      const ciclo = 'ciclo T' + t.c + ' = ' + P.ciclo[t.c] + ' anos';
      const situacao = vencida ? 'vencida' : aVencer ? 'vence em até ' + meses(P.aVencer) : 'em dia';
      const limpeza = { situacao, vence: dataDe(ctx, vence), vencida, origem };

      // valor de cada critério no trecho: x (medida), j (faixa; -1 = não pontua), st (real, est = estimado, falta = sem dado),
      // dado e obs (texto do extrato da ficha)
      const kmTxt = nf2.format(t.km) + ' km' + (t.km < P.pisoKm ? ' (conta ' + fmtD(P.pisoKm) + ' km)' : '');
      const antes = f.nJan - f.n;
      const v = {
        nae: { x: f.n100, st: 'real', dado: f.n ? qtd(f.n, 'ocorrência', 'ocorrências') + ' em ' + kmTxt + ' = ' + mostra(f.n100) + ' por 100 km' : 'nenhuma ocorrência',
          obs: antes ? qtd(antes, 'ocorrência anterior', 'ocorrências anteriores') + ' à última limpeza não ' + (antes === 1 ? 'conta' : 'contam') : '' },
        dec: { x: f.chi100, st: 'real', dado: f.chi > 0 ? bruto(f.chi) + ' consumidor·hora = ' + mostra(f.chi100) + ' por 100 km' : 'nenhum consumidor·hora' },
        fec: { x: f.ci100, st: 'real', dado: f.ci > 0 ? qtd(f.ci, 'consumidor', 'consumidores') + ' = ' + mostra(f.ci100) + ' por 100 km' : 'nenhum consumidor interrompido' },
        cli: uc ? { x: uc[1], st: 'real', dado: qtd(uc[1], 'UC ligada', 'UCs ligadas') + ' nos trafos do trecho e a jusante' + (uc[1] !== uc[0] ? ' (' + fmtN(uc[0]) + ' nos do próprio trecho)' : '') }
          : f.cliMax > 0 ? { x: f.cliMax, st: 'real', dado: qtd(f.cliMax, 'cliente', 'clientes') + ' no maior evento' }
          : { x: med.cli[t.c], st: 'est', dado: (f.nJan > 1 ? 'eventos sem clientes registrados' : f.nJan ? 'evento sem clientes registrados' : 'sem evento') + ': típico de T' + t.c + ', ' + qtd(med.cli[t.c], 'cliente', 'clientes') },
        hier: { j: t.c - 1, st: 'real', dado: 'T' + t.c + (t.c === 1 ? ' (tronco)' : ' (ramal)') },
        ga: eGA ? { j: 0, st: 'real', dado: 'tem (marcado neste teste)' } : { j: -1, st: 'falta', dado: 'sem dado na base' },
        limp: { j: vencida ? 0 : aVencer ? 1 : -1, st: stL, dado: (vencida ? 'vencida em ' : aVencer ? 'vence em ' : 'em dia, vence em ') + dataDe(ctx, vence), obs: origem + ' · ' + ciclo },
      };
      for (const k of ['nae', 'dec', 'fec', 'cli']) v[k].j = faixaDe(C[k], v[k].x);

      // nota = soma dos pontos; confiança = parte da nota máxima que vem de dado real (estimado conta metade, sem dado não conta)
      let score = 0, conf = 0;
      const pts = {}, blk = { imp: 0, his: 0, man: 0 };
      for (const c of CRIT) {
        const x = v[c.k], p = x.j >= 0 ? T[c.k][x.j] || 0 : 0;
        pts[c.k] = p; score += p; blk[c.b] += p;
        conf += M[c.k] * (x.st === 'real' ? 1 : x.st === 'est' ? 0.5 : 0);
      }
      score = Math.round(score * 1e6) / 1e6;
      const segs = {};                                           // parte de cada bloco na barra, em % da barra (nota 100 = barra cheia)
      for (const b of BLOCOS) segs[b.k] = blk[b.k];
      const CH = blk.imp + blk.his;
      let UA = blk.man;
      const regras = [];
      let piso = 4, fila = 'Preventiva', status = 'Elegível', bonus = 0;
      if (ePlano) {
        bonus = Math.max(0, Math.min(P.bonus, 100 - score));
        score += bonus; UA += bonus;
        regras.push({ id: 'A1', tipo: 'aumento', txt: 'Incluído no plano climático: +' + fmtP(bonus) + (bonus > 0 && bonus < 2 ? ' ponto' : ' pontos') });
      }
      if (f.bloq) {
        if (f.posBloq > 0) regras.push({ id: 'L2', tipo: 'alerta', txt: 'Reincidência após a limpeza de ' + dataDe(ctx, f.bloq.d) + ' (' + qtd(f.posBloq, 'evento', 'eventos') + '): investigar a causa antes de repetir o serviço' });
        else {
          status = 'Executado recentemente';
          regras.push({ id: 'B1', tipo: 'bloqueio', txt: 'Limpeza executada em ' + dataDe(ctx, f.bloq.d) + ' cobrindo ' + pct(f.bloq.f) + ' do trecho (carência T' + t.c + ' = ' + meses(P.carencia[t.c]) + ')' });
        }
      }
      if (f.cart && status === 'Elegível') {
        status = 'Em carteira';
        regras.push({ id: 'B2', tipo: 'bloqueio', txt: 'OS aberta ' + f.cart.cod + ' já cobre ' + pct(f.cart.f) + ' do trecho' });
      }
      if (t.c === 1 && (f.meses >= 3 || f.n90 >= 2)) {
        piso = 1;
        regras.push({ id: 'F1', tipo: 'piso', txt: 'T1 com recorrência (' + meses(f.meses) + ' com evento, ' + f.n90 + ' nos últimos 90 dias): mínimo P1 e análise de causa' });
      } else if (f.meses >= 4) {
        piso = Math.min(piso, 2);
        regras.push({ id: 'F4', tipo: 'piso', txt: 'Recorrência em ' + f.meses + ' meses: mínimo P2' });
      }
      if (eGA) {
        piso = Math.min(piso, 2);
        regras.push({ id: 'F2', tipo: 'piso', txt: 'Clientes Grupo A no trecho: mínimo P2' });
      }
      const fScore = score >= P.lim.p1 ? 1 : score >= P.lim.p2 ? 2 : score >= P.lim.p3 ? 3 : 4;
      const faixa = Math.min(fScore, piso);
      const confR = conf / Mtot;
      if (confR < 0.6 && faixa <= 2) regras.push({ id: 'Q1', tipo: 'alerta', txt: 'Confiança ' + fmt1(10 * confR) + ' de 10: confirmar em inspeção antes de programar' });
      if (t.km < 0.5 && f.nJan > 0) regras.push({ id: 'Q4', tipo: 'alerta', txt: 'Trecho curto (' + fmtN(t.km * 1000) + ' m) com ' + qtd(f.nJan, 'ocorrência', 'ocorrências') + ': confirmar o local da falha antes de programar' });
      if (t.cf === 'revisar') regras.push({ id: 'Q3', tipo: 'alerta', txt: 'Segmentação deste trecho está marcada para revisão no cadastro' });
      return { t, f, v, pts, situacao, limpeza, score, segs, bonus, CH, UA, conf: confR, faixa, fScore, piso, fila, status, regras };
    });
    const ordemStatus = { 'Elegível': 0, 'Em carteira': 1, 'Executado recentemente': 2 };
    const ranked = res.slice().sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status] || a.faixa - b.faixa || cmpNota(a, b));
    let k = 0;
    for (const r of ranked) r.pos = r.status === 'Elegível' ? ++k : null;
    return { res, ranked, med, ref, M, Mtot };
  }

  function justificar(ctx, r, P, T) {
    const t = r.t, f = r.f, partes = [];
    partes.push(t.id + ' (T' + t.c + ', ' + fmtKm(t.km) + ' km, ' + t.mun + ', polo ' + t.polo + ').');
    partes.push('Prioridade P' + r.faixa + ' com nota ' + fmtP(r.score) + ' de ' + fmtP(notaMax(T)) + '.');
    if (r.faixa < r.fScore) partes.push('A nota sozinha daria P' + r.fScore + '; a faixa subiu por regra.');
    const lin = CRIT.filter((c) => r.pts[c.k] > 0).map((c) => c.curto + ' ' + fmtP(r.pts[c.k]) + ' (' + rotFaixa(c, r.v[c.k].j, P) + (r.v[c.k].st === 'est' && c.k === 'cli' ? ', típico de T' + t.c : '') + ')');
    if (r.bonus > 0) lin.push('plano climático ' + fmtP(r.bonus));
    partes.push(lin.length ? 'Pontos: ' + lin.join('; ') + '.' : 'Nenhum critério pontuou.');
    if (f.nJan) partes.push('Histórico: ' + qtd(f.nJan, 'ocorrência', 'ocorrências') + ' por vegetação nos últimos ' + P.janela + ' meses, em ' + qtd(f.meses, 'mês', 'meses diferentes') + (f.nJan > f.n ? '; ' + qtd(f.nJan - f.n, 'anterior', 'anteriores') + ' à última limpeza, fora do NAE, DEC e FEC' : '') + '.');
    else partes.push('Histórico: nenhuma ocorrência por vegetação nos últimos ' + P.janela + ' meses.');
    const uc = ctx.ucs && ctx.ucs[t.al] ? (ctx.ucs[t.al][t.n] || [0, 0, 0]) : null;
    if (uc) partes.push('Impacto: ' + qtd(uc[1], 'UC ligada', 'UCs ligadas') + ' nos trafos do trecho e a jusante' + (f.cliMax ? '; maior evento da Crítica: ' + qtd(f.cliMax, 'cliente', 'clientes') : '') + '.');
    else if (f.cliMax) partes.push('Impacto: até ' + qtd(f.cliMax, 'cliente desligado', 'clientes desligados') + ' por evento.');
    const L = r.limpeza;
    partes.push('Limpeza de faixa ' + L.situacao + ' (' + (L.vencida ? 'venceu' : 'vence') + ' em ' + L.vence + '; ' + L.origem + ').');
    for (const g of r.regras) partes.push('[' + g.id + '] ' + g.txt + '.');
    return partes.join(' ');
  }

  function hav(la1, lo1, la2, lo2) {
    const r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
    const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  /* Criticidade primeiro: o líder de cada pacote é o próximo trecho elegível do ranking. Vizinhos entram por
     proximidade; os de faixa inferior (aproveitamento) ficam limitados a uma fração da capacidade do pacote. */
  function pacotes(ctx, ranked, o) {
    const pool = ranked.filter((r) => r.status === 'Elegível' && r.faixa <= 3 && (o.polo === 'todos' || r.t.polo === o.polo));
    const usado = new Set(), out = [];
    for (const lider of pool) {
      if (out.length >= o.max) break;
      if (usado.has(lider.t.i)) continue;
      usado.add(lider.t.i);
      const pk = { lider, membros: [{ r: lider, aprov: false, dist: 0 }], km: lider.t.km, kmAprov: 0 };
      const cands = [];
      for (const c of pool) {
        if (usado.has(c.t.i) || c.t.polo !== lider.t.polo || c.score < o.scoreMin) continue;
        const d = hav(lider.t.la, lider.t.lo, c.t.la, c.t.lo);
        if (d <= o.raio) cands.push({ c, d });
      }
      cands.sort((a, b) => a.c.faixa - b.c.faixa || a.d - b.d);
      for (const { c, d } of cands) {
        if (pk.km + c.t.km > o.cap) continue;
        const aprov = c.faixa > lider.faixa;
        if (aprov && pk.kmAprov + c.t.km > o.limAprov * o.cap) continue;
        pk.membros.push({ r: c, aprov, dist: d });
        pk.km += c.t.km;
        if (aprov) pk.kmAprov += c.t.km;
        usado.add(c.t.i);
      }
      const a = ctx.alims[lider.t.a], bla = a[5], blo = a[6];
      let ind = 0;
      for (const m of pk.membros) ind += 2 * hav(bla, blo, m.r.t.la, m.r.t.lo);
      const rest = pk.membros.slice();
      let cla = bla, clo = blo, rota = 0;
      while (rest.length) {
        let bi = 0, bd = Infinity;
        rest.forEach((m, j) => { const dd = hav(cla, clo, m.r.t.la, m.r.t.lo); if (dd < bd) { bd = dd; bi = j; } });
        rota += bd; cla = rest[bi].r.t.la; clo = rest[bi].r.t.lo; rest.splice(bi, 1);
      }
      rota += hav(cla, clo, bla, blo);
      Object.assign(pk, { deslInd: ind * o.fator, deslPac: rota * o.fator, base: a[2], equipe: a[4] });
      out.push(pk);
    }
    return { pacotes: out, elegiveis: pool.length };
  }

  /* Teste retroativo: ranking calculado só com o que se sabia na data de corte, comparado com as ocorrências
     que aconteceram depois dela. */
  function retroativo(ctx, T, P, corte, fim) {
    const Pc = Object.assign({}, P, { ref: corte, planoPolos: [] });
    const { res } = avaliar(ctx, T, Pc, { ga: new Set(), plano: new Set() });
    const c0 = diaDe(ctx, corte), c1 = diaDe(ctx, fim);
    const futO = res.map((r) => r.t.oc.filter((o) => o[0] > c0 && o[0] <= c1));
    const fut = futO.map((l) => l.length);
    const futH = futO.map((l) => l.reduce((s, o) => s + (o[1] * o[2]) / 60, 0));
    const total = fut.reduce((s, x) => s + x, 0), totalH = futH.reduce((s, x) => s + x, 0);
    const kmTot = res.reduce((s, r) => s + r.t.km, 0);
    const passado = res.map((r) => r.f.nJan);
    const capt = (ordem, frac) => {
      const n = Math.round(res.length * frac);
      let oc = 0, km = 0, h = 0;
      for (let j = 0; j < n; j++) { oc += fut[ordem[j]]; h += futH[ordem[j]]; km += res[ordem[j]].t.km; }
      return { oc: total ? oc / total : 0, chi: totalH ? h / totalH : 0, km: km / kmTot, n };
    };
    const idx = res.map((_, i) => i);
    const porScore = idx.slice().sort((a, b) => cmpNota(res[a], res[b]));
    const porNae = idx.slice().sort((a, b) => passado[b] - passado[a] || res[b].t.km - res[a].t.km);
    const porKm = idx.slice().sort((a, b) => res[b].t.km - res[a].t.km);
    const linhas = [0.01, 0.05, 0.1].map((q) => ({ q, score: capt(porScore, q), nae: capt(porNae, q), km: capt(porKm, q) }));
    return { total, totalH, linhas, n: res.length };
  }

  return { CRIT, BLOCOS, PERFIS, parametrosPadrao, preparar, avaliar, justificar, pacotes, retroativo, faixaDe, rotFaixa, maxDe, notaMax, dataDe, diaDe, fmtN, fmt1, fmtP, fmtD, fmtKm, pct, qtd };
})();
if (typeof module !== 'undefined') module.exports = VERA;


'use strict';
(() => {
  const V = VERA, D = window.DADOS, ctx = V.preparar(D);   // window.UCS_TRECHOS (dados/ucs-trechos.js) alimenta os clientes por trecho
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { fmtN, fmt1, fmtP, fmtD, fmtKm, pct, qtd } = V;
  const CHAVE_VAL = 'vera-prior-validacoes';
  let validacoes = {};
  try { validacoes = JSON.parse(localStorage.getItem(CHAVE_VAL) || '{}') || {}; } catch (e) { validacoes = {}; }
  const salvarVal = () => { try { localStorage.setItem(CHAVE_VAL, JSON.stringify(validacoes)); } catch (e) {} };

  const clonaT = (t) => JSON.parse(JSON.stringify(t));
  const editada = () => JSON.stringify(S.T) !== JSON.stringify(V.PERFIS[S.perfil].t);
  const S = {
    perfil: 'padrao', T: clonaT(V.PERFIS.padrao.t), P: V.parametrosPadrao(),
    flags: { ga: new Set(), plano: new Set() },
    f: { polo: 'todos', mun: 'todos', busca: '', classes: new Set([1, 2, 3]), faixa: null, ocultos: false },
    out: null, sel: null,
    pk: { polo: 'NORTE', raio: 10, cap: 20, limAprov: 30, scoreMin: 30, fator: 1.4, max: 12 },
  };
  const POLOS = ['NORTE', 'CENTRO', 'SUL', 'Sem polo'];
  const gaveta = matchMedia('(max-width:860px)');   // celular: a ficha do trecho abre por cima da página

  // ---------- controles ----------
  const perfilSel = $('#perfil');
  for (const [k, p] of Object.entries(V.PERFIS)) perfilSel.add(new Option(p.nome, k));
  function dicaPerfil() {
    const m = Number(S.P.ref.slice(5, 7));
    const sug = m >= 9 && m <= 11 ? 'Pré-chuva (set–nov)' : 'Padrão';
    $('#perfil-dica').textContent = 'Sugerido para ' + S.P.ref.split('-').reverse().join('/') + ': ' + sug + '.';
    $('#pz-tit').title = 'Limpeza de faixa · referência ' + S.P.ref.split('-').reverse().join('/');
  }
  $('#ref').value = S.P.ref;
  const poloSel = $('#f-polo');
  poloSel.add(new Option('Todos os polos', 'todos'));
  POLOS.forEach((p) => poloSel.add(new Option(p, p)));
  const munSel = $('#f-mun');
  munSel.add(new Option('Todos', 'todos'));
  [...new Set(ctx.trechos.map((t) => t.mun))].filter((m) => m !== '—').sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((m) => munSel.add(new Option(m, m)));
  const pkPolo = $('#pk-polo');
  pkPolo.add(new Option('Todos', 'todos'));
  POLOS.forEach((p) => pkPolo.add(new Option(p, p)));
  $('#plano-polos').innerHTML = POLOS.map((p) => '<label><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>').join('');

  const corGrupo = (c) => V.BLOCOS.find((b) => b.k === c.b).cor;
  const pontos = (p) => fmtP(p) + (p > 0 && p < 2 ? ' ponto' : ' pontos');
  // como cada critério é medido: uma linha abaixo do nome, na tabela de pontos
  const REGRA = {
    nae: () => 'Ocorrências por vegetação dos últimos ' + S.P.janela + ' meses depois da última limpeza, por 100 km do trecho. Trecho com menos de ' + fmtD(S.P.pisoKm) + ' km conta como ' + fmtD(S.P.pisoKm) + ' km: cada ocorrência vale ' + fmtD(100 / S.P.pisoKm) + '.',
    dec: () => 'Consumidor·hora interrompido nessas ocorrências, por 100 km do trecho.',
    fec: () => 'Consumidores interrompidos nessas ocorrências, por 100 km do trecho.',
    cli: () => {
      const m = S.out && S.out.med.cli;
      if (ctx.ucs) return 'UCs ligadas nos transformadores do trecho e dos trechos que saem dele (planilha UC por trafo): quem um evento no trecho pode deixar sem energia. Alimentador fora da planilha usa os clientes do maior evento dos últimos ' + S.P.janela + ' meses, e trecho sem evento, o típico da classe.';
      return 'Clientes desligados no maior evento dos últimos ' + S.P.janela + ' meses. Trecho sem evento, ou só com eventos sem clientes registrados, usa o típico da classe' + (m ? ' (T1 ' + fmtN(m[1]) + ', T2 ' + fmtN(m[2]) + ', T3 ' + fmtN(m[3]) + ')' : '') + '.';
    },
    hier: () => 'Classe do trecho: tronco (T1) ou ramal (T2, T3).',
    ga: () => 'Cliente Grupo A (média tensão) no trecho. Ainda não há cadastro na base: só pontua quando marcado na ficha do trecho.',
    limp: () => 'Última limpeza efetiva + ciclo da classe (T1 ' + S.P.ciclo[1] + ', T2 ' + S.P.ciclo[2] + ', T3 ' + S.P.ciclo[3] + ' anos).',
  };
  // tabela de pontos: uma linha por critério, com os pontos de cada faixa de valor editáveis
  function desenharPontos() {
    $('#pontos').innerHTML = V.CRIT.map((c) => {
      const fx = S.T[c.k].map((p, j) => {
        const rot = V.rotFaixa(c, j, S.P);
        return '<label class="fx"><span>' + esc(rot) + '</span><input type="number" data-k="' + c.k + '" data-j="' + j + '" min="0" max="100" step="0.5" value="' + p + '" aria-label="' + esc(c.nome + ', ' + rot + ': pontos') + '"></label>';
      }).join('');
      return '<div class="pt-crit"><div class="pt-nome"><span class="amostra" style="background:' + corGrupo(c) + '"></span><b>' + esc(c.nome) + '</b><span class="pt-max" id="max-' + c.k + '"></span>' +
        '<p class="pt-regra" id="regra-' + c.k + '"></p></div><div class="pt-faixas">' + (c.zero ? '<span class="fx zero"><span>' + esc(c.zero) + '</span><b>0</b></span>' : '') + fx + '</div></div>';
    }).join('');
    atualizarRegras(); atualizarSomas();
  }
  function atualizarRegras() {
    for (const c of V.CRIT) { const el = $('#regra-' + c.k); if (el) el.textContent = REGRA[c.k](); }
  }
  function atualizarSomas() {
    const tot = V.notaMax(S.T), ok = Math.abs(tot - 100) < 1e-6;
    for (const c of V.CRIT) $('#max-' + c.k).textContent = 'até ' + pontos(V.maxDe(S.T, c.k));
    $('#nota-max').textContent = fmtP(tot);
    $('#pt-exemplo').textContent = 'por exemplo, 1 a 9 clientes vale ' + pontos(S.T.cli[0]) + ' e 10 a 99 clientes vale ' + pontos(S.T.cli[1]);
    $('#pt-total').classList.toggle('alerta', !ok);
    const av = $('#aviso-pontos');
    av.hidden = ok;
    if (!ok) av.textContent = 'Os máximos somam ' + fmtP(tot) + (tot > 100 ? ': a nota pode passar de 100' : ': nenhum trecho chega a 100') + '. Ajuste os pontos para somar 100.';
  }
  function preencherParams() {
    $('#p-avenc').value = S.P.aVencer;
    $('#p-cob').value = S.P.cobBloqueio; $('#p-car').value = [1, 2, 3].map((c) => fmtP(S.P.carencia[c])).join(' / ');
    $('#p-bonus').value = S.P.bonus;
    $('#p-lim').value = [S.P.lim.p1, S.P.lim.p2, S.P.lim.p3].map(fmtP).join(' / '); $('#p-piso').value = S.P.pisoKm;
    for (const [k, v] of Object.entries(S.pk)) { const el = $('#pk-' + ({ limAprov: 'aprov', scoreMin: 'min' }[k] || k)); if (el) el.value = v; }
  }
  // três números de um campo de texto ("6 / 9 / 12", "7,5/5/3"); null se não forem três números
  const tres = (s) => {
    const txt = String(s).trim();
    if (txt.includes('-')) return null;
    const le = (t) => { const p = t.split(/[^\d.]+/).filter(Boolean).map(Number); return p.length === 3 && p.every((x) => !isNaN(x) && x >= 0) ? p : null; };
    return le(txt.replace(/(\d),(\d)/g, '$1.$2')) || le(txt);
  };

  let tmr = null;
  let pend = false;
  function agendar() { clearTimeout(tmr); pend = true; tmr = setTimeout(recalcular, 140); }
  let recalcular = function () {
    clearTimeout(tmr); pend = false;
    const antes = new Map();
    if (S.out) for (const r of S.out.ranked) if (r.pos) antes.set(r.t.i, r.pos);
    S.out = V.avaliar(ctx, S.T, S.P, S.flags);
    atualizarRegras(); textoRecorte();
    for (const r of S.out.ranked) r.mov = r.pos && antes.has(r.t.i) ? antes.get(r.t.i) - r.pos : r.pos && antes.size ? 'novo' : 0;
    renderRanking();
    if (S.sel !== null) abrirFicha(S.sel, true);
    if ($('#sec-pacotes').open) renderPacotes();
    retroPendente = true;
    if ($('#sec-dados').open) renderRetro();
  };

  function aplicarPerfil() {
    S.T = clonaT(V.PERFIS[S.perfil].t);
    desenharPontos(); agendar();
  }
  perfilSel.addEventListener('change', () => { S.perfil = perfilSel.value; aplicarPerfil(); });
  $('#restaurar').addEventListener('click', aplicarPerfil);
  $('#pontos').addEventListener('input', (e) => {
    const d = e.target.dataset;
    if (!d.k || e.target.value === '' || isNaN(Number(e.target.value))) return;
    S.T[d.k][Number(d.j)] = Math.min(100, Math.max(0, Math.round(Number(e.target.value) * 100) / 100));   // pontos de 0 a 100
    atualizarSomas();
    agendar();
  });
  // ao sair do campo, mostra o valor que valeu (ex.: 12 vira 10; vazio volta ao anterior)
  $('#pontos').addEventListener('change', (e) => { const d = e.target.dataset; if (d.k) e.target.value = S.T[d.k][Number(d.j)]; });
  $('#ref').addEventListener('change', (e) => { if (e.target.value) { S.P.ref = e.target.value; dicaPerfil(); agendar(); } else e.target.value = S.P.ref; });
  poloSel.addEventListener('change', () => { S.f.polo = poloSel.value; renderRanking(); });
  munSel.addEventListener('change', () => { S.f.mun = munSel.value; renderRanking(); });
  let tmrBusca = null;
  $('#f-busca').addEventListener('input', (e) => { S.f.busca = e.target.value.trim().toUpperCase(); clearTimeout(tmrBusca); tmrBusca = setTimeout(renderRanking, 160); });
  $('#f-classe').addEventListener('change', () => { S.f.classes = new Set([...document.querySelectorAll('#f-classe input:checked')].map((i) => Number(i.value))); renderRanking(); });
  $('#f-ocultos').addEventListener('change', (e) => { S.f.ocultos = e.target.checked; renderRanking(); });
  $('#plano-polos').addEventListener('change', () => { S.P.planoPolos = [...document.querySelectorAll('#plano-polos input:checked')].map((i) => i.value); agendar(); });
  const numParam = (id, fn) => $(id).addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (e.target.value !== '' && !isNaN(v)) { fn(v); agendar(); }
    preencherParams();
  });
  numParam('#p-piso', (v) => { S.P.pisoKm = Math.min(50, Math.max(0.5, v)); atualizarRegras(); });
  numParam('#p-avenc', (v) => { S.P.aVencer = Math.min(12, Math.max(1, Math.round(v))); desenharPontos(); });
  numParam('#p-cob', (v) => { S.P.cobBloqueio = Math.min(1, Math.max(0.1, v)); });
  numParam('#p-bonus', (v) => { S.P.bonus = Math.max(0, v); });
  // texto ilegível volta ao valor anterior (o campo é reescrito); cortes em qualquer ordem viram P1 ≥ P2 ≥ P3
  $('#p-car').addEventListener('change', (e) => { const p = tres(e.target.value); if (p) { S.P.carencia = { 1: p[0], 2: p[1], 3: p[2] }; agendar(); } preencherParams(); });
  $('#p-lim').addEventListener('change', (e) => { const p = tres(e.target.value); if (p) { p.sort((a, b) => b - a); S.P.lim = { p1: p[0], p2: p[1], p3: p[2] }; agendar(); } preencherParams(); });
  for (const [k, id] of [['polo', 'polo'], ['raio', 'raio'], ['cap', 'cap'], ['limAprov', 'aprov'], ['scoreMin', 'min'], ['fator', 'fator'], ['max', 'max']]) {
    $('#pk-' + id).addEventListener('change', (e) => {
      const el = e.target, v = Number(String(el.value).replace(',', '.'));
      if (k === 'polo') S.pk[k] = el.value;
      else if (el.value !== '' && !isNaN(v)) { const x = Math.min(Number(el.max), Math.max(Number(el.min), v)); S.pk[k] = k === 'max' ? Math.round(x) : x; }
      preencherParams(); renderPacotes();
    });
  }

  // ---------- ranking ----------
  const FAIXA = (n) => '<span class="faixa f' + n + '"><span class="ponto"></span>P' + n + '</span>';
  function barra(r) {
    let h = '';
    for (const b of V.BLOCOS) if (r.segs[b.k] > 0.05) h += '<span style="width:' + r.segs[b.k].toFixed(2) + '%;background:' + b.cor + '"></span>';
    if (r.bonus > 0) h += '<span class="plano" style="width:' + r.bonus.toFixed(2) + '%"></span>';
    return '<div class="score"><div class="barra" role="img" aria-label="Nota ' + fmtP(r.score) + ' de 100">' + h + '</div><b>' + fmtP(r.score) + '</b></div>';
  }
  function filtrar(semFaixa) {
    const f = S.f;
    return S.out.ranked.filter((r) => {
      const t = r.t;
      if (!f.ocultos && r.status !== 'Elegível') return false;
      if (f.polo !== 'todos' && t.polo !== f.polo) return false;
      if (f.mun !== 'todos' && t.mun !== f.mun) return false;
      if (!f.classes.has(t.c)) return false;
      if (f.busca && !t.id.toUpperCase().includes(f.busca)) return false;
      if (!semFaixa && f.faixa && r.faixa !== f.faixa) return false;
      return true;
    });
  }
  function renderRanking() {
    const base = filtrar(true), lista = filtrar(false);
    const cont = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
    for (const r of base) if (r.status === 'Elegível') { cont[r.faixa][0]++; cont[r.faixa][1] += r.t.km; }
    const nomes = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' };
    $('#resumo').innerHTML = [1, 2, 3, 4].map((n) =>
      '<button type="button" class="tile' + (S.f.faixa === n ? ' on' : '') + '" data-faixa="' + n + '" aria-pressed="' + (S.f.faixa === n) + '"><span class="t f' + n + '"><span class="ponto"></span>' + nomes[n] + '</span><span class="v">' + fmtN(cont[n][0]) + '</span></button>').join('');
    const MAX = 200;
    $('#corpo').innerHTML = lista.length ? lista.slice(0, MAX).map((r) => {
      const t = r.t;
      const mv = r.mov === 'novo' ? '<span class="mov sobe">novo</span>' : r.mov > 0 ? '<span class="mov sobe">▲ ' + r.mov + '</span>' : r.mov < 0 ? '<span class="mov desce">▼ ' + -r.mov + '</span>' : '';
      return '<tr data-i="' + t.i + '" tabindex="0"' + (S.sel === t.i ? ' class="sel"' : '') + '>' +
        '<td class="r num muted">' + (r.pos ?? '—') + mv + '</td>' +
        '<td><span class="trecho-id">' + esc(t.id) + '</span></td>' +
        '<td>' + FAIXA(r.faixa) + '</td><td>' + barra(r) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="vazio">Nenhum trecho.</td></tr>';
    // computador: a ficha da direita nunca fica vazia; abre o primeiro trecho da lista
    if (S.sel === null && lista.length && !gaveta.matches) abrirFicha(lista[0].t.i, true);
  }
  $('#resumo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-faixa]'); if (!b) return;
    const n = Number(b.dataset.faixa); S.f.faixa = S.f.faixa === n ? null : n; renderRanking();
  });
  $('#corpo').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); });
  $('#corpo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr) { e.preventDefault(); abrirFicha(Number(tr.dataset.i)); } } });

  $('#copiar').addEventListener('click', (e) => {
    const lista = filtrar(false).slice(0, 500);
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const linhas = ['posicao;trecho;classe;polo;municipio;km;nota;faixa;' + V.CRIT.map((c) => 'pontos_' + ({ hier: 'hierarquia', ga: 'grupo_a', limp: 'limpeza', cli: 'clientes' }[c.k] || c.k)).join(';') + ';pontos_plano;situacao;regras;justificativa'];
    for (const r of lista) linhas.push([r.pos ?? '', q(r.t.id), 'T' + r.t.c, q(r.t.polo), q(r.t.mun), fmtKm(r.t.km), fmtP(r.score), 'P' + r.faixa, ...V.CRIT.map((c) => fmtP(r.pts[c.k])), fmtP(r.bonus), q(r.status), q(r.regras.map((g) => g.id).join(' ')), q(V.justificar(ctx, r, S.P, S.T))].join(';'));
    const txt = linhas.join('\n'), btn = e.currentTarget;
    const ok = () => { btn.textContent = 'Copiado: ' + qtd(lista.length, 'linha', 'linhas'); setTimeout(() => { btn.textContent = 'Copiar ranking (CSV)'; }, 2500); };
    const falha = () => {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (err) { btn.textContent = 'Não foi possível copiar'; }
      ta.remove();
    };
    try { navigator.clipboard.writeText(txt).then(ok, falha); } catch (err) { falha(); }
  });

  // ---------- ficha do trecho ----------
  const gav = $('#gaveta'), fundo = $('#fundo');
  let focoAnterior = null;
  function fecharFicha() {
    if (!gav.classList.contains('aberta')) return;
    gav.classList.remove('aberta'); fundo.hidden = true;
    const alvo = focoAnterior && document.contains(focoAnterior) ? focoAnterior : document.querySelector('#corpo tr[data-i="' + S.sel + '"]');
    if (alvo) alvo.focus();
  }
  fundo.addEventListener('click', fecharFicha);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gav.classList.contains('aberta')) fecharFicha(); });
  gaveta.addEventListener('change', () => { if (!gaveta.matches) { fecharFicha(); if (S.sel === null) renderRanking(); } });
  function abrirFicha(i, manter) {
    const r = S.out.res[i], t = r.t, f = r.f;
    if (!manter) focoAnterior = document.activeElement;
    const abertos = manter ? [...gav.querySelectorAll('details.g-mais')].map((d) => d.open) : [];
    S.sel = i;
    document.querySelectorAll('#corpo tr').forEach((tr) => tr.classList.toggle('sel', Number(tr.dataset.i) === i));
    // extrato: de onde vem cada ponto da nota (valor do trecho, faixa de valor e pontos de cada critério)
    const extrato = V.CRIT.map((c) => {
      const x = r.v[c.k], p = r.pts[c.k], rot = c.lim && x.j >= 0 ? V.rotFaixa(c, x.j, S.P) : '';
      const subs = [rot.replace(/^([\d.,]+) a ([\d.,]+)$/, 'entre $1 e $2'), x.obs].filter(Boolean).map((s) => '<span class="sub">' + esc(s) + '</span>').join('');
      return '<tr' + (p > 0 ? '' : ' class="zero"') + '><td><span class="amostra" style="background:' + corGrupo(c) + '"></span> ' + esc(c.curto) + '</td>' +
        '<td' + (x.st === 'est' ? ' class="st-est"' : '') + '>' + esc(x.dado) + subs + '</td><td class="r num"><b>' + fmtP(p) + '</b><span class="sub">de ' + fmtP(V.maxDe(S.T, c.k)) + '</span></td></tr>';
    }).join('') + (r.bonus > 0 ? '<tr><td>Plano climático</td><td>bônus da regra A1</td><td class="r num"><b>+' + fmtP(r.bonus) + '</b></td></tr>' : '') +
      '<tr class="total"><td colspan="2">Nota</td><td class="r num"><b>' + fmtP(r.score) + '</b><span class="sub">/' + fmtP(V.notaMax(S.T)) + '</span></td></tr>';
    const Lm = S.P.lim, pisos = r.regras.filter((g) => g.tipo === 'piso').map((g) => g.id).join(', ');
    const porque = r.faixa < r.fScore ? 'P' + r.faixa + ' pela regra ' + pisos + '; a nota sozinha daria P' + r.fScore
      : 'P' + r.faixa + ': ' + ['nota ' + fmtP(Lm.p1) + ' ou mais', 'nota de ' + fmtP(Lm.p2) + ' a ' + fmtP(Lm.p1), 'nota de ' + fmtP(Lm.p3) + ' a ' + fmtP(Lm.p2), 'nota abaixo de ' + fmtP(Lm.p3)][r.faixa - 1];
    const ocs = f.usadas.slice().sort((a, b) => b.d - a.d);
    const rgNome = ['chave do trecho', 'vão mais próximo', 'abrangência DJ'];
    const evOc = ocs.length ? '<div class="lista-ev"><table class="tab-mini"><thead><tr><th>Data</th><th class="r">Consum.</th><th class="r">Min</th><th>Tipo</th><th>Associação</th><th>Conta</th></tr></thead><tbody>' +
      ocs.map((o) => '<tr><td class="num">' + V.dataDe(ctx, o.d) + '</td><td class="r num">' + fmtN(o.cons) + '</td><td class="r num">' + fmtN(o.dur) + '</td><td>' + (o.col ? 'coletiva' : 'individual') + '</td><td>' + rgNome[o.rg] + '</td><td>' + (o.pre ? 'não *' : 'sim') + '</td></tr>').join('') +
      '</tbody></table></div>' + (ocs.some((o) => o.pre) ? '<p class="dica">* anterior à última limpeza efetiva: não conta no NAE, DEC e FEC.</p>' : '') : '<p class="dica">Nenhuma ocorrência por vegetação na janela.</p>';
    const sitN = { 1: 'executada', 2: 'criada', 3: 'reprogramar', 9: 'outra' };
    const evOs = t.os.length ? '<div class="lista-ev"><table class="tab-mini"><thead><tr><th>Data</th><th>OS</th><th>Situação</th><th class="r">Cobertura</th></tr></thead><tbody>' +
      t.os.slice().sort((a, b) => b[0] - a[0]).map((o) => '<tr><td class="num">' + V.dataDe(ctx, o[0]) + '</td><td class="mono">' + esc(o[3]) + '</td><td>' + sitN[o[1]] + '</td><td class="r num">' + pct(o[2]) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="dica">Nenhuma OS de limpeza de faixa associada.</p>';
    const val = validacoes[t.id];
    gav.innerHTML =
      '<div class="g-cab"><div class="g-topo"><div><h2 id="g-titulo">' + esc(t.id) + '</h2></div><button class="fechar" type="button" id="fechar">Fechar</button></div>' +
      '<div class="chips"><span class="chip">' + fmtKm(t.km) + ' km</span><span class="chip">' + esc(t.mun) + '</span>' + (r.status !== 'Elegível' ? '<span class="chip estado">' + esc(r.status) + '</span>' : '') + '</div></div>' +
      '<div class="g-nota"><span class="rot">Nota</span><b>' + fmtP(r.score) + '</b><span class="de">/' + fmtP(V.notaMax(S.T)) + '</span>' + FAIXA(r.faixa) + '<span class="por">' + esc(porque) + '</span></div>' +
      '<section><h3>De onde vem a nota</h3><div class="tabela-wrap"><table class="tab-mini extrato"><thead><tr><th>Critério</th><th>No trecho</th><th class="r">Pontos</th></tr></thead><tbody>' + extrato + '</tbody></table></div></section>' +
      (r.regras.length ? '<section><h3>Regras</h3><ul class="regras" style="margin-top:8px">' + r.regras.map((g) => '<li><span class="chip ' + g.tipo + '">' + g.id + '</span><span>' + esc(g.txt) + '</span></li>').join('') + '</ul></section>' : '') +
      '<details class="g-mais"><summary>Testar exceções</summary><div class="excecoes">' +
      '<label><input type="checkbox" id="x-ga"' + (S.flags.ga.has(t.i) ? ' checked' : '') + '> Há cliente Grupo A no trecho</label>' +
      '<label><input type="checkbox" id="x-plano"' + (S.flags.plano.has(t.i) ? ' checked' : '') + '> Incluir este trecho no plano climático</label></div></details>' +
      '<details class="g-mais"><summary>Ocorrências (' + ocs.length + ')</summary>' + evOc + '</details>' +
      '<details class="g-mais"><summary>Limpezas (' + t.os.length + ')</summary>' + evOs + '</details>' +
      '<details class="g-mais"><summary>Validar' + (val ? ' · ' + esc(val.decisao) : '') + '</summary><div class="validacao"><div class="val-botoes">' +
      [['Aprovado', 'Aprovar'], ['Adiado', 'Adiar'], ['Rejeitado', 'Rejeitar']].map(([d, rot]) => '<button type="button" class="botao" data-dec="' + d + '" aria-pressed="' + Boolean(val && val.decisao === d) + '">' + rot + '</button>').join('') + '</div>' +
      '<div class="campo"><label for="v-motivo">Motivo</label><select id="v-motivo"><option>Confirmo a prioridade</option><option>Executado e não registrado</option><option>Sem acesso ou autorização</option><option>Aguardar inspeção</option><option>Dado incorreto</option><option>Outro</option></select></div>' +
      '<div class="campo"><label for="v-obs">Observação</label><input type="text" id="v-obs" value="' + esc(val ? val.obs : '') + '"></div>' +
      '<p class="val-reg">' + (val ? esc(val.decisao + ' em ' + val.quando + ' · ' + val.motivo + ' · nota ' + fmtP(val.escala === 'soma' ? val.score * 10 : val.score) + '/100 · metodologia ' + val.perfil) : '') + '</p></div></details>';
    gav.querySelectorAll('details.g-mais').forEach((d, j) => { if (abertos[j]) d.open = true; });
    if (val) $('#v-motivo').value = val.motivo;
    if (gaveta.matches && !manter) { gav.classList.add('aberta'); fundo.hidden = false; $('#fechar').focus(); }
    $('#fechar').addEventListener('click', fecharFicha);
    $('#x-ga').addEventListener('change', (e) => { e.target.checked ? S.flags.ga.add(t.i) : S.flags.ga.delete(t.i); recalcular(); });
    $('#x-plano').addEventListener('change', (e) => { e.target.checked ? S.flags.plano.add(t.i) : S.flags.plano.delete(t.i); recalcular(); });
    gav.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      const motivo = $('#v-motivo').value, obs = $('#v-obs').value;
      if (pend) recalcular();
      const rr = S.out.res[i], Pp = S.P;
      validacoes[t.id] = { decisao: b.dataset.dec, motivo, obs, quando: new Date().toLocaleString('pt-BR'), score: Math.round(rr.score * 100) / 100, escala: 'soma100', perfil: V.PERFIS[S.perfil].nome + (editada() ? ' com pontos editados' : ''), pontos: clonaT(S.T),
        parametros: clonaT({ ref: Pp.ref, lim: Pp.lim, carencia: Pp.carencia, ciclo: Pp.ciclo, aVencer: Pp.aVencer, cobBloqueio: Pp.cobBloqueio, pisoKm: Pp.pisoKm, bonus: Pp.bonus, planoPolos: Pp.planoPolos }),
        excecoes: { grupoA: S.flags.ga.has(t.i), plano: S.flags.plano.has(t.i) } };
      salvarVal(); abrirFicha(i, true); renderRanking();
    }));
  }

  // ---------- pacotes ----------
  function renderPacotes() {
    const o = Object.assign({}, S.pk, { limAprov: S.pk.limAprov / 100 });
    const { pacotes, elegiveis } = V.pacotes(ctx, S.out.ranked, o);
    const totKm = pacotes.reduce((s, p) => s + p.km, 0), ind = pacotes.reduce((s, p) => s + p.deslInd, 0), pac = pacotes.reduce((s, p) => s + p.deslPac, 0);
    const nTre = pacotes.reduce((s, p) => s + p.membros.length, 0), nAp = pacotes.reduce((s, p) => s + p.membros.filter((m) => m.aprov).length, 0);
    $('#pk-resumo').innerHTML = '<span><b>' + fmtN(pacotes.length) + '</b> ' + (pacotes.length === 1 ? 'pacote' : 'pacotes') + '</span><span><b>' + fmtN(nTre) + '</b> trechos (' + fmtN(nAp) + ' por aproveitamento)</span><span><b>' + fmt1(totKm) + '</b> km de faixa</span><span>Deslocamento estimado <b>' + fmtN(pac) + ' km</b> contra ' + fmtN(ind) + ' km em visitas separadas</span><span>' + fmtN(elegiveis) + ' trechos P1–P3 elegíveis no polo</span>';
    $('#pk-lista').innerHTML = pacotes.length ? pacotes.map((p, j) => {
      const L = p.lider, efic = p.deslPac > 0 ? p.km / p.deslPac : 0;
      return '<article class="pk"><div class="pk-cab">' + FAIXA(L.faixa) + '<h3>Pacote ' + (j + 1) + ' · líder ' + esc(L.t.id) + ' (#' + L.pos + ', nota ' + fmtP(L.score) + ')</h3></div>' +
        '<div class="pk-meta"><span><b>' + fmt1(p.km) + '</b> km de faixa</span><span><b>' + p.membros.length + '</b> ' + (p.membros.length === 1 ? 'trecho' : 'trechos') + '</span><span>Saída: <b>' + esc(p.base) + '</b></span><span>Equipe provável: <b>' + esc(p.equipe || '—') + '</b></span><span>Deslocamento <b>' + fmtN(p.deslPac) + ' km</b> (separado: ' + fmtN(p.deslInd) + ' km)</span><span>Eficiência <b>' + fmt1(efic) + '</b> km faixa/km estrada</span></div>' +
        '<div class="tabela-wrap"><table class="tab-mini"><thead><tr><th>Trecho</th><th>Município</th><th class="r">km</th><th class="r">Nota</th><th>Faixa</th><th class="r">Dist. do líder</th><th>Entrada</th></tr></thead><tbody>' +
        p.membros.map((m) => '<tr data-i="' + m.r.t.i + '"><td class="trecho-id">' + esc(m.r.t.id) + '</td><td>' + esc(m.r.t.mun) + '</td><td class="r num">' + fmtKm(m.r.t.km) + '</td><td class="r num">' + fmtP(m.r.score) + '</td><td>' + FAIXA(m.r.faixa) + '</td><td class="r num">' + (m.dist ? fmt1(m.dist) + ' km' : 'líder') + '</td><td>' + (m.dist === 0 && m.r === L ? 'prioridade' : m.aprov ? 'aproveitamento' : 'mesma faixa') + '</td></tr>').join('') +
        '</tbody></table></div></article>';
    }).join('') : '<p class="vazio">Nenhum trecho P1–P3 elegível neste polo.</p>';
  }
  $('#pk-lista').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); });

  // ---------- dados e validação ----------
  const E = D.estat;
  $('#fontes').innerHTML = [
    '<b>' + fmtN(D.alims.length) + '</b> alimentadores · ' + fmtN(E.T1 + E.T2 + E.T3) + ' trechos',
    'Crítica <b>jan–ago/2026</b> · ' + fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências por vegetação',
    'OS de limpeza desde <b>' + D.os_inicio.split('-').reverse().slice(1).join('/') + '</b>',
  ].map((s) => '<li>' + s + '</li>').join('');
  const kmTot = E.km_T1 + E.km_T2 + E.km_T3;
  $('#tab-fontes').innerHTML = [
    ['Rede (GIS processado no protótipo /teste/)', fmtN(D.alims.length) + ' alimentadores, ' + fmtN(E.T1) + ' T1, ' + fmtN(E.T2) + ' T2, ' + fmtN(E.T3) + ' T3, ' + fmtN(kmTot) + ' km', 'Classe, extensão, município, polo, centro do trecho'],
    ['Crítica (causa árvore)', fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências de jan a ago/2026; ' + fmtN(D.nae_fora) + ' sem trecho associado', 'NAE, DEC (consumidor·hora), FEC (consumidores interrompidos)'],
    ['OS de limpeza de faixa', (D.os_fonte || 'Planilha de OS') + ' desde ' + D.os_inicio.split('-').reverse().join('/') + (D.os_fonte ? ', cobertura pelos vãos do mapa' : ', cobertura por vão estimada pela descrição'), 'Última limpeza, carência, OS abertas'],
    ['Inspeções do app de campo', fmtN(D.insp_total) + ' registros (jul–ago/2026), ' + fmtN(D.insp_casadas) + ' ligados a um poste da rede MT', 'Fora do score: não há medição de distância confiável'],
    ['Sem fonte na base', 'Grupo A e essenciais, classe de vegetação, produtividade por tipo de equipe, disponibilidade de equipes, plano climático, emergências do centro de operação', 'Marcação manual no teste ou parâmetro'],
  ].map((l) => '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td><td>' + l[2] + '</td></tr>').join('');
  $('#recorte').textContent = 'Recorte do teste: ' + fmtN(D.trechos.length) + ' trechos (todos os T1 e T2 e os T3 com ocorrência, OS ou inspeção). Ficaram de fora ' + fmtN(D.fora_recorte.n) + ' T3 (' + fmtN(D.fora_recorte.km) + ' km) sem nenhum desses sinais.';
  function textoRecorte() {
    const C = Object.fromEntries(V.CRIT.map((c) => [c.k, c])), tip = S.out.med.cli[3], jc = V.faixaDe(C.cli, tip);
    const nota = (S.T.limp[0] || 0) + (jc >= 0 ? S.T.cli[jc] || 0 : 0) + (S.T.hier[2] || 0), L = S.P.lim;
    const p = nota >= L.p1 ? 1 : nota >= L.p2 ? 2 : nota >= L.p3 ? 3 : 4;
    const faixaP = (x) => (x >= L.p1 ? 1 : x >= L.p2 ? 2 : x >= L.p3 ? 3 : 4), comBonus = nota + Math.max(0, Math.min(S.P.bonus, 100 - nota));
    $('#recorte-real').textContent = ' No sistema real eles entram: sem limpeza registrada, a limpeza conta como vencida e, com os clientes típicos de T3 e a classe T3, a nota fica ' + fmtP(nota) + ' (P' + p + ') na tabela de pontos atual' +
      (S.P.planoPolos.length && comBonus > nota ? '; nos polos do plano climático, ' + fmtP(comBonus) + ' (P' + faixaP(comBonus) + ').' : '.');
  }
  $('#qualidade').innerHTML = [
    'A distância à MT “0” aparece junto com distância à AT “0” em quase todos os registros, então foi lida como “não informado”. O formulário precisa separar “contato” de “não se aplica”.',
    'O app mostra a distância em “cm” na exportação e em “m” em uma das telas do histórico.',
    'As inspeções são quase todas de área urbana (Enecol Centro); o risco rural ainda não tem medição de campo.',
    fmtN(D.alims.filter((a) => !a[3]).length) + ' alimentadores sem polo no cadastro.',
    fmtN(D.nae_fora) + ' ocorrências (' + pct(D.nae_fora / Object.values(D.saz).reduce((a, b) => a + b, 0)) + ') sem trecho associado: ativo fora do cadastro atual.',
    'A OS não traz o traçado; a cobertura é estimada pelos ativos citados e pelos km da descrição.',
    'Nenhuma das 2.615 OS de limpeza informa o tipo de equipe (manual ou mecanizada) nem o tipo de vegetação. Só 267 trazem a categoria do defeito (galhos em contato, obstruindo a faixa, projeção de queda, dificultando acesso) com a severidade.',
    'Ocorrências com abrangência DJ caem no T1 inteiro; em T1 muito curto o local real da falha é incerto (alerta Q4).',
  ].map((s) => '<li>' + esc(s) + '</li>').join('');

  function grafSaz() {
    const meses = Object.keys(D.saz), vals = meses.map((m) => D.saz[m]);
    const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const W = 640, H = 240, ml = 44, mr = 12, mt = 26, mb = 30, max = 1200, iw = W - ml - mr, ih = H - mt - mb, bw = iw / vals.length;
    const y = (v) => mt + ih - (v / max) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ocorrências por vegetação por mês em 2026">';
    for (const g of [0, 300, 600, 900, 1200]) s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(g) + '" y2="' + y(g) + '"></line><text x="' + (ml - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + fmtN(g) + '</text>';
    vals.forEach((v, j) => {
      const x = ml + j * bw + bw * 0.18, w = bw * 0.64, h = mt + ih - y(v);
      s += '<rect class="b" data-j="' + j + '" x="' + x.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"></rect>';
      s += '<rect data-j="' + j + '" x="' + (ml + j * bw).toFixed(1) + '" y="' + mt + '" width="' + bw.toFixed(1) + '" height="' + ih + '" fill="transparent"></rect>';
      s += '<text x="' + (ml + j * bw + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + NOMES[Number(meses[j].slice(5)) - 1] + '</text>';
      if (j === 0 || j === vals.length - 1) s += '<text class="rotv" x="' + (ml + j * bw + bw / 2).toFixed(1) + '" y="' + (y(v) - 6).toFixed(1) + '" text-anchor="middle">' + fmtN(v) + '</text>';
    });
    s += '</svg>';
    const el = $('#graf-saz');
    el.innerHTML = '<h3 style="margin-bottom:8px">Ocorrências por vegetação por mês · Crítica 2026</h3>' + s + '<div class="valores">' + meses.map((m, j) => '<span>' + NOMES[Number(m.slice(5)) - 1] + ' ' + fmtN(vals[j]) + '</span>').join('') + '</div><p class="dica" style="margin-top:6px">Janeiro tem ' + fmt1(vals[0] / vals[vals.length - 1]) + ' vezes as ocorrências de agosto: o fim do período chuvoso concentra o risco.</p>';
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.appendChild(tip);
    const svg = el.querySelector('svg');
    svg.addEventListener('mousemove', (e) => {
      const r = e.target.closest('rect[data-j]');
      svg.querySelectorAll('rect.b').forEach((b) => b.classList.toggle('hover', r && b.dataset.j === r.dataset.j));
      if (!r) { tip.hidden = true; return; }
      const j = Number(r.dataset.j), tot = vals.reduce((a, b) => a + b, 0);
      tip.textContent = NOMES[Number(meses[j].slice(5)) - 1] + '/2026 · ' + fmtN(vals[j]) + ' ocorrências · ' + pct(vals[j] / tot) + ' do período';
      const box = el.getBoundingClientRect(); tip.hidden = false;
      tip.style.left = Math.min(e.clientX - box.left + 12, box.width - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY - box.top - 34) + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; svg.querySelectorAll('rect.b').forEach((b) => b.classList.remove('hover')); });
  }

  let retroPendente = true;
  function renderRetro() {
    if (!retroPendente) return;
    retroPendente = false;
    $('#tab-retro').innerHTML = '<tr><td colspan="6" class="vazio">Calculando…</td></tr>';
    setTimeout(() => {
      const rt = V.retroativo(ctx, S.T, S.P, '2026-04-30', '2026-08-31');
      const nomes = { score: 'Nota desta metodologia', nae: 'Só número de ocorrências', km: 'Só extensão' };
      $('#tab-retro').innerHTML = rt.linhas.map((l) => ['score', 'nae', 'km'].map((k, j) => {
        const x = l[k];
        return '<tr>' + (j === 0 ? '<td rowspan="3" class="num"><b>' + fmtN(l.q * 100) + '%</b><span class="sub">' + fmtN(x.n) + ' trechos</span></td>' : '') + '<td>' + (k === 'score' ? '<b>' + nomes[k] + '</b>' : nomes[k]) + '</td><td class="r num">' + fmt1(x.oc * 100) + '%</td><td class="r num">' + fmt1(x.chi * 100) + '%</td><td class="r num">' + fmt1(x.km * 100) + '%</td><td class="r num">' + fmt1(x.km ? x.chi / x.km : 0) + '</td></tr>';
      }).join('')).join('');
      $('#retro-nota').textContent = fmtN(rt.total) + ' ocorrências e ' + fmtN(rt.totalH) + ' consumidor·hora entre 01/05 e 31/08/2026 nos ' + fmtN(rt.n) + ' trechos do recorte. A última coluna mostra quanto consumidor·hora futuro cada % de extensão priorizada captou (1,0 = igual ao acaso por km). Limites: só 4 meses de janela futura, limpezas feitas no meio do período e associação aproximada da falha ao trecho.';
    }, 30);
  }

  // ---------- seções do rodapé ----------
  $('#sec-pacotes').addEventListener('toggle', (e) => { if (e.target.open) renderPacotes(); });
  $('#sec-dados').addEventListener('toggle', (e) => { if (e.target.open) renderRetro(); });
  function abrirSecao() {
    if (location.hash === '#premissas') { abrePrem(true); $('#sec-premissas').scrollIntoView(); return; }
    const sec = { opcoes: 'sec-opcoes', pacotes: 'sec-pacotes', metodologia: 'sec-metodologia', dados: 'sec-dados' }[location.hash.slice(1)];
    if (sec) { const d = document.getElementById(sec); d.open = true; d.scrollIntoView(); }
  }
  window.addEventListener('hashchange', abrirSecao);


  // premissas: o botão da barra abre e fecha a tabela de pontos
  const premBtn = $('#prem-btn'), prem = $('#sec-premissas');
  function abrePrem(sim) { prem.hidden = !sim; premBtn.setAttribute('aria-expanded', String(sim)); }
  premBtn.addEventListener('click', () => abrePrem(prem.hidden));

  perfilSel.value = S.perfil;
  dicaPerfil(); preencherParams(); grafSaz();
  S.out = V.avaliar(ctx, S.T, S.P, S.flags);
  desenharPontos(); textoRecorte();
  renderRanking();
  abrirSecao();
})();
