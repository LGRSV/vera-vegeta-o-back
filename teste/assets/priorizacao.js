// Priorização de limpeza de faixa e poda (/teste/priorizacao/): motor e tela do Artifact "VERA Priorização de Faixa".
// Dados: window.DADOS (priorizacao-dados.js; ocorrências até D.oc_ate), DECFEC_TRECHOS (dados/decfec-trechos.js: DEC e FEC
// de cada ocorrência, na ordem de oc, e as expurgadas), LENTE_IMAGEM (dados/lente-imagem.js: nota 1 a 4 por alimentador),
// SOLICITACOES (dados/solicitacoes-trechos.js: pedidos de limpeza do app de faixa por trecho), UCS_TRECHOS e URBANO_TRECHOS.
// Nota no modelo da planilha do Ranking de faixa (RANKING_FAIXA_APP, aba Base de solicitações, coluna Ranking2; decisão do
// dono em 16/11/2026): soma ponderada dos valores crus do trecho, sem dividir pela extensão:
//   0,3 × NAE (ocorrências) + 0,3 × DEC (h) + 0,2 × FEC + 0,1 × Lente de imagem (1 a 4) + 3 no T1 da regra F5,
// sem as lentes de Meio Ambiente e de Segurança. Opcionais, desligados no padrão: Clientes (0,3 por mil UCs ligadas a
// jusante) e Grupo A (regra F2, mínimo P2, no trecho marcado na ficha; ainda não há cadastro). Faixas: P1 nota ≥ 3,
// P2 ≥ 1,2, P3 ≥ 0,6, P4 abaixo. Pesos, bônus e cortes editáveis na tela.
// DEC e FEC: contribuição das ocorrências do trecho no DEC (horas) e no FEC (interrupções) do conjunto ANEEL, pela Crítica, já
// sem o que o PRODIST não conta; ocorrência expurgada como situação de emergência vale 0, como no indicador oficial (continua no
// NAE). Janela de 12 meses (U12M) contada da data de referência; contam só as ocorrências depois da última limpeza efetiva.
// Regra F5: T1 sem limpeza nos últimos P.t1Anos (3) anos ganha o "+3" da planilha, fica no mínimo P1 e vai ao topo do ranking
// (entre si, pela nota). Conta como limpeza uma OS executada cobrindo ≥ 50% do trecho ou OS executadas no período que, somadas,
// cubram ≥ 50%; T1 com menos de P.t1KmMin (0,5 km) fica fora da regra (segue pela nota). Solicitações do app de faixa não mudam
// a nota: bandeira na lista, ficha e filtro (a de trecho criado depois de 07/10 vai para o trecho que o contém).
'use strict';
/* Motor de priorização VERA (teste). Funções puras: recebem dados + pesos + parâmetros e devolvem o ranking com
   a parcela de cada critério, regras e justificativa. É o mesmo código que iria para o serviço de score do backend. */
const VERA = (() => {
  const DIA = 864e5;
  // critérios da nota: valor cru do trecho × peso. opc: só entra ligado na tela (P.usa); mil: conta por mil (UCs)
  const CRIT = [
    { k: 'nae', b: 'his', nome: 'NAE Vegetação', curto: 'NAE' },
    { k: 'dec', b: 'his', nome: 'DEC', curto: 'DEC' },
    { k: 'fec', b: 'his', nome: 'FEC', curto: 'FEC' },
    // Lente de imagem da planilha (aba Lente de imagem): risco de imagem do alimentador, 1 a 4 (4 = maior); sem lente vale 0
    { k: 'img', b: 'imp', nome: 'Lente de imagem', curto: 'Lente' },
    { k: 'cli', b: 'imp', nome: 'Clientes', curto: 'Clientes', opc: true, mil: true },
  ];
  const BLOCOS = [
    { k: 'imp', nome: 'Impacto', cor: 'var(--c-imp)' },
    { k: 'his', nome: 'Histórico', cor: 'var(--c-his)' },
    { k: 'man', nome: 'T1 sem limpeza (F5)', cor: 'var(--c-man)' },
  ];
  // pesos da planilha (Ranking2 = DEC 0,3 + NAE 0,3 + FEC 0,2 + Lente de imagem 0,1 + Lente de Meio Ambiente 0,1, sem a de
  // Meio Ambiente). Clientes não está na planilha: 0,3 por mil UCs (proposta de 16/11/2026), desligado no padrão
  const PESOS = { nae: 0.3, dec: 0.3, fec: 0.2, img: 0.1, cli: 0.3 };
  const VERSAO = 'planilha-2026-11-16';   // gravada nas validações; as de antes usavam a nota de 0 a 100 por faixas

  // referência padrão: o último dia com ocorrência nos dados (D.oc_ate); a janela de 12 meses (U12M) conta dela
  function parametrosPadrao(D) {
    const dd = D || (typeof window !== 'undefined' && window.DADOS) || null;
    return {
      ref: (dd && dd.oc_ate) || '2026-11-09', janela: 12, cobEfetiva: 0.5, cobBloqueio: 0.8,
      carencia: { 1: 6, 2: 9, 3: 12 }, ciclo: { 1: 3, 2: 4, 3: 5 }, aVencer: 3,
      lim: { p1: 3, p2: 1.2, p3: 0.6 }, planoPolos: [], bonus: 0.3,
      t1Anos: 3,   // regra F5: T1 sem limpeza efetiva há mais que isso (ou sem registro) vai a P1 e ao topo
      t1KmMin: 0.5,   // regra F5: T1 mais curto que isso (km) fica fora dela (decisão de 16/11/2026)
      t1Bonus: 3,   // regra F5: o "+3" da planilha na nota
      usa: { cli: false, ga: false },   // critérios opcionais ligados na tela
    };
  }

  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfP = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const nfD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf4 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  const nf3 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
  const fmtH = (x) => nf4.format(x);   // horas de DEC e interrupções de FEC de cada ocorrência (0,0012)
  const fmtN = (x) => nf0.format(x);
  const fmt1 = (x) => nf1.format(x);
  const fmtP = (x) => nfP.format(x);   // pesos e cortes: 0,25 · 1,5 · 3
  // nota e parcelas: 2 casas; abaixo de 0,01, até 4 (DEC de 0,0026 h × 0,3 = 0,0008)
  const fmtV = (x) => (x > 0 && x < 0.005 ? nf4.format(x) : nfP.format(x));
  const fmtD = (x) => nfD.format(x);
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKm = (x) => (x < 1 ? nf2.format(x) : nf1.format(x));
  const pct = (x) => nf0.format(Math.round(x * 100)) + '%';
  const qtd = (n, um, muitos) => fmtN(n) + ' ' + (n === 1 ? um : muitos);
  const meses = (n) => n + (n === 1 ? ' mês' : ' meses');

  function quantil(arr, q) {
    if (!arr.length) return 0;
    const a = Float64Array.from(arr).sort();
    const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }

  // valor cru do critério como aparece no extrato e na justificativa
  const valor = (k, x) => (k === 'nae' ? fmtN(x) : k === 'dec' ? fmtH(x) + ' h' : k === 'fec' ? fmtH(x) : k === 'img' ? 'nota ' + fmtN(x) : fmtD(x / 1000) + ' mil UCs');
  // desempate entre notas iguais: mais ocorrências, depois mais DEC, depois o trecho mais longo
  const cmpNota = (a, b) => b.score - a.score || b.f.n - a.f.n || b.f.dec - a.f.dec || b.t.km - a.t.km;

  function preparar(D) {
    const d0 = Date.parse(D.d0 + 'T00:00:00Z');
    const W = typeof window !== 'undefined' ? window : {};
    const ctx = { D, d0, alims: D.alims, muns: D.muns, ucs: (W.UCS_TRECHOS && W.UCS_TRECHOS.al) || (typeof UCS_TRECHOS !== 'undefined' && UCS_TRECHOS.al) || null,
      // fração urbana por trecho (dados/urbano-trechos.js); sem o arquivo, null
      urb: (W.URBANO_TRECHOS && W.URBANO_TRECHOS.al) || null,
      urbCorte: (W.URBANO_TRECHOS && W.URBANO_TRECHOS.corte) || 0.5,
      // DEC e FEC de cada ocorrência (dados/decfec-trechos.js) e as expurgadas como situação de emergência; sem o arquivo, null
      dfc: (W.DECFEC_TRECHOS && W.DECFEC_TRECHOS.al) || null,
      exp: (W.DECFEC_TRECHOS && W.DECFEC_TRECHOS.expurgo) || {},
      // Lente de imagem por alimentador (dados/lente-imagem.js) e solicitações por trecho (dados/solicitacoes-trechos.js)
      img: (W.LENTE_IMAGEM && W.LENTE_IMAGEM.al) || null,
      sol: (W.SOLICITACOES && W.SOLICITACOES.al) || null,
      // alimentadores divididos por exceção em 16/10/2026 (GIS sem as chaves fechadas), já pela segmentação de hoje (alerta Q5)
      excecao: new Set(D.excecao || []) };
    // solicitações por trecho do DADOS: a de um trecho criado depois da segmentação do DADOS (D.sobe: trecho de hoje → trecho
    // do DADOS que o contém) vai para esse trecho, com o nome pedido em `de`
    ctx.solT = null;
    if (ctx.sol) {
      const sobe = D.sobe || {};
      ctx.solT = {};
      for (const [al, tr] of Object.entries(ctx.sol)) {
        for (const [n, l] of Object.entries(tr)) {
          if (!Array.isArray(l)) continue;
          const p = (sobe[al] && sobe[al][n]) || n, dest = (ctx.solT[al] = ctx.solT[al] || {});
          dest[p] = (dest[p] || []).concat(p === n ? l : l.map((x) => Object.assign({}, x, { de: n })));
        }
      }
    }
    ctx.osInicio = Math.round((Date.parse(D.os_inicio + 'T00:00:00Z') - d0) / DIA);
    ctx.kmClasse = { 1: D.estat.km_T1, 2: D.estat.km_T2, 3: D.estat.km_T3 };
    // período que a Crítica cobre: do 1º dia do primeiro mês de D.saz até D.oc_ate (último dia com dado; nov/2026 vai até
    // 09/11) ou, sem ele, até o último dia do último mês de D.saz
    const ms = Object.keys(D.saz).sort(), [ua, um] = ms[ms.length - 1].split('-').map(Number);
    ctx.ocIni = Math.round((Date.parse(ms[0] + '-01T00:00:00Z') - d0) / DIA);
    ctx.ocFim = D.oc_ate ? Math.round((Date.parse(D.oc_ate + 'T00:00:00Z') - d0) / DIA) : Math.round((Date.UTC(ua, um, 0) - d0) / DIA);
    let desal = 0;
    ctx.trechos = D.trechos.map((t, i) => {
      const a = D.alims[t.a], al = a[0];
      // DEC/FEC: a lista do trecho tem de ter o tamanho de oc (mesma ordem); fora disso (arquivo de outra versão) fica sem dado
      let dfc = null;
      if (ctx.dfc) {
        const x = ctx.dfc[al] && ctx.dfc[al][t.n];
        dfc = x && x.length === t.oc.length ? x : (t.oc.length && desal++, []);
      }
      const ex = dfc && dfc.length && ctx.exp[al] && ctx.exp[al][t.n];
      const lente = ctx.img ? ctx.img[al] : undefined, sol = ctx.solT && ctx.solT[al] && ctx.solT[al][t.n];
      return Object.assign(t, {
        i, al, se: a[2], reg: a[3] || 'Sem regional', polo: a[4] || 'Sem polo', equipe: a[4] || '',
        cls: t.c === 1 ? 'T1' : t.c === 2 ? 'T2' : 'T3',   // T1 do DJ ao fim do tronco; T2 só ramal de religador (24/11/2026)
        urb: ctx.urb ? (ctx.urb[al] && ctx.urb[al][t.n]) || 0 : null,
        mun: t.mu >= 0 ? D.muns[t.mu] : '—', id: al + ' · ' + t.n,
        dfc, exp: ex ? new Set(ex) : null,
        lente: Number.isInteger(lente) && lente >= 1 && lente <= 4 ? lente : null,
        // solicitações do trecho, da mais recente para a mais antiga
        sol: Array.isArray(sol) && sol.length ? sol.slice().sort((p, q) => String(q.criado || '').localeCompare(String(p.criado || ''))) : null,
      });
    });
    ctx.dfcDesal = desal;   // trechos com DEC/FEC desalinhado de oc (deve ser 0)
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

  // período de ocorrências que a nota enxerga na referência: a janela de P.janela meses (U12M) cortada pelo que a Crítica tem.
  // lacuna: [primeiro, último dia] entre o fim da Crítica e a referência, que o histórico recente (F1 de 90 dias, NAE, DEC, FEC)
  // não vê; vazia quando a referência está dentro dos dados. cob: a cobertura em meses ("jan a nov/2026, até 09/11").
  // avisos: notas sobre meses da janela (set/2026: registros expurgados como situação de emergência na Crítica)
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const AVISOS = [
    { ini: '2026-09-01', fim: '2026-09-30', txt: 'set/2026: 3.363 registros da Crítica expurgados como situação de emergência; a NAE desse mês pode estar menor.' },
  ];
  function periodo(ctx, P) {
    const ref = diaDe(ctx, P.ref), ini = Math.max(ctx.ocIni, Math.ceil(ref - P.janela * 30.44)), fim = Math.min(ctx.ocFim, ref);
    const m0 = mesDe(ctx, ini), m1 = mesDe(ctx, fim), vazio = fim < ini;
    const txt = vazio ? 'nenhuma ocorrência na janela' : dataDe(ctx, ini).slice(0, 5) + ' a ' + dataDe(ctx, fim) + ' (' + meses(m1 - m0 + 1) + ')';
    let cob = 'nenhuma ocorrência na janela';
    if (!vazio) {
      const di = dataDe(ctx, ini), df = dataDe(ctx, fim), mi = MES[m0 % 12], mf = MES[m1 % 12], ai = Math.floor(m0 / 12), af = Math.floor(m1 / 12);
      const fimMes = mesDe(ctx, fim + 1) !== m1;   // fim é o último dia do mês
      cob = (m0 === m1 ? mf : mi + (ai !== af ? '/' + ai : '') + ' a ' + mf) + '/' + af +
        (di.slice(0, 2) !== '01' ? ', desde ' + di.slice(0, 5) : '') + (fimMes ? '' : ', até ' + df.slice(0, 5));
    }
    const avisos = vazio ? [] : AVISOS.filter((a) => diaDe(ctx, a.ini) <= fim && diaDe(ctx, a.fim) >= ini && diaDe(ctx, a.ini) <= ctx.ocFim).map((a) => a.txt);
    return { ini, fim, txt, cob, avisos, fimTxt: dataDe(ctx, ctx.ocFim), lacuna: ref > ctx.ocFim ? [dataDe(ctx, ctx.ocFim + 1), dataDe(ctx, ref)] : [] };
  }

  // abertura de disjuntor (T1) ou religador (T2) do trecho, ou abrangência do DJ: o defeito está em ponto não identificado da zona
  const deProtecao = (t, o) => o.rg === 2 || (o.rg === 0 && t.c <= 2);

  function avaliar(ctx, T, P, flags) {
    const ref = diaDe(ctx, P.ref), janela = P.janela * 30.44, per = periodo(ctx, P);
    const plano = new Set(P.planoPolos);
    const ga = flags.ga, noPlano = flags.plano;

    // 1. fatos por trecho na data de referência
    const F = ctx.trechos.map((t) => {
      let ult = null, bloq = null, cart = null, parcial = null, soma3 = 0, nSoma3 = 0;
      for (const [d, s, f, cod] of t.os) {
        if (d > ref) continue;
        if (s === 1) {
          if (f >= P.cobEfetiva && (ult === null || d > ult)) ult = d;
          if (f >= 0.01 && ref - d <= P.t1Anos * 365.25) { soma3 += f; nSoma3++; }   // regra F5: OS executadas no período, somadas
          if (f >= 0.01 && (!parcial || d > parcial.d)) parcial = { d, f };   // OS sem cobertura no trecho (0%) não é "parcial"
          if (f >= P.cobBloqueio && ref - d <= P.carencia[t.c] * 30.44 && (!bloq || d > bloq.d)) bloq = { d, cod, f };
        } else if (f >= 0.3 && (!cart || f > cart.f)) cart = { d, cod, f };
      }
      // NAE, DEC e FEC contam só as ocorrências da janela depois da última limpeza efetiva: as de antes já foram tratadas.
      // Clientes por evento, meses com evento e eventos nos últimos 90 dias (regras F1 e F4) usam a janela inteira.
      // DEC e FEC: a contribuição de cada ocorrência no DEC (horas) e no FEC (interrupções) do conjunto ANEEL, pela Crítica
      // (t.dfc, mesma ordem de t.oc). Expurgada como situação de emergência (t.exp): 0, como no indicador oficial (nExp).
      // null = ocorrência não achada na Crítica: conta 0 e entra em nSem ("sem dado")
      const dfc = t.dfc, exp = t.exp;
      let n = 0, dec = 0, fec = 0, nSem = 0, nExp = 0, nJan = 0, n90 = 0, posBloq = 0, cliMax = 0;
      const meses = new Set(), usadas = [];
      for (let ix = 0; ix < t.oc.length; ix++) {
        const [d, cons, dur, col, rg] = t.oc[ix];
        const age = ref - d;
        if (age < 0 || age > janela) continue;
        const pre = ult !== null && d < ult;
        const ex = !!(exp && exp.has(ix)), x = dfc && !ex ? dfc[ix] || null : null;
        if (!pre) {
          n++;
          if (ex) nExp++;
          else if (x) { dec += x[0]; fec += x[1]; } else if (dfc) nSem++;
        }
        nJan++;
        if (age <= 90) n90++;
        if (bloq && d >= bloq.d) posBloq++;
        meses.add(mesDe(ctx, d));
        if (cons > cliMax) cliMax = cons;
        usadas.push({ d, cons, dur, col, rg, pre, ex, dh: ex ? 0 : x ? x[0] : null, fc: ex ? 0 : x ? x[1] : null });
      }
      return { ult, parcial, soma3, nSoma3, bloq, cart, n, dec, fec, nSem, nExp, nJan, n90, posBloq, meses: meses.size, cliMax, usadas };
    });
    // DEC e FEC sem dado: sem o arquivo por ocorrência, ou com todas as ocorrências que contam não achadas na Crítica
    const semDfc = (f, t) => !ctx.dfc || (f.n > 0 && f.nSem === f.n) || (t.oc.length > 0 && t.dfc && !t.dfc.length);

    // 2. referência da rodada, calculada sobre a rede toda (não muda com filtro): clientes típicos de cada classe, para trecho sem evento
    const med = { cli: {} };
    for (const c of [1, 2, 3]) {
      med.cli[c] = Math.round(quantil(F.filter((f, i) => ctx.trechos[i].c === c && f.cliMax > 0).map((f) => f.cliMax), 0.5));
    }
    // 3. nota, regras e faixa
    const res = ctx.trechos.map((t, i) => {
      const f = F[i], eGA = P.usa.ga && ga.has(t.i), ePlano = plano.has(t.reg) || noPlano.has(t.i);
      // UCs ligadas dos trafos do trecho e dos que saem dele (planilha UC por trafo); alimentador sem a planilha usa os clientes
      // por evento da Crítica. Trecho que não está na planilha do seu alimentador fica "sem dado" (vale 0), não "0 UCs"
      const ucAl = ctx.ucs && ctx.ucs[t.al], uc = ucAl ? ucAl[t.n] || null : null;
      // situação da limpeza de faixa: vence na última limpeza efetiva + ciclo da classe (T1 3, T2 4, T3 5 anos).
      // Sem limpeza efetiva registrada é "sem registro": não há data para vencer, então não se inventa vencimento
      const semReg = f.ult === null;
      const vence = semReg ? null : Math.round(f.ult + P.ciclo[t.c] * 365.25), faltam = semReg ? 0 : vence - ref;
      const vencida = !semReg && faltam < 0, aVencer = !semReg && !vencida && faltam <= P.aVencer * 30.44;
      const situacao = semReg ? 'sem registro' : vencida ? 'vencida' : aVencer ? 'vence em até ' + meses(P.aVencer) : 'em dia';
      const limpeza = { situacao, vence, vencida, aVencer, semReg };

      // valor cru de cada critério no trecho: x, st (real, est = estimado, falta = sem dado). O texto do extrato (dado e obs)
      // só é montado quando a ficha ou a justificativa pede (textos), para a abertura ser rápida
      const sem = semDfc(f, t);
      const v = {
        nae: { x: f.n, st: 'real' },
        dec: { x: f.dec, st: sem ? 'falta' : 'real' },
        fec: { x: f.fec, st: sem ? 'falta' : 'real' },
        img: t.lente ? { x: t.lente, st: 'real' } : { x: 0, st: 'falta' },
        cli: uc ? { x: uc[1], st: 'real', uc } : ucAl ? { x: 0, st: 'falta', fora: true }
          : f.cliMax > 0 ? { x: f.cliMax, st: 'real' } : { x: med.cli[t.c], st: 'est' },
      };

      // nota = soma de peso × valor (Clientes por mil UCs, só ligado); confiança = parte dos pesos que vem de dado real
      // (estimado conta metade, sem dado não conta)
      let score = 0, conf = 0, pesoTot = 0;
      const pts = {}, segs = { imp: 0, his: 0, man: 0 };
      for (const c of CRIT) {
        const liga = !c.opc || P.usa[c.k], w = liga ? T[c.k] || 0 : 0, x = v[c.k];
        const p = w * (c.mil ? x.x / 1000 : x.x);
        pts[c.k] = p; score += p; segs[c.b] += p;
        pesoTot += w; conf += w * (x.st === 'real' ? 1 : x.st === 'est' ? 0.5 : 0);
      }
      const regras = [];
      let piso = 4, fila = 'Preventiva', status = 'Elegível', bonus = 0, bonusT1 = 0;
      if (ePlano) {
        bonus = Math.max(0, P.bonus);
        score += bonus;
        regras.push({ id: 'A1', tipo: 'aumento', txt: 'Incluído no plano climático: +' + fmtP(bonus) + ' na nota' });
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
      // F5 (Ranking de faixa, 16/11/2026): T1 sem limpeza nos últimos P.t1Anos anos da referência fica no mínimo P1 e vai ao topo
      // do ranking (entre si, pela nota). Conta como limpeza a OS executada cobrindo ≥ P.cobEfetiva do trecho ou as OS executadas
      // no período que, somadas (f.soma3), cubram ≥ P.cobEfetiva (decisão do dono, 16/11). T1 com menos de P.t1KmMin km fica fora.
      const anosTxt = fmtP(P.t1Anos) + (P.t1Anos === 1 ? ' ano' : ' anos');
      const limpo = (f.ult !== null && ref - f.ult <= P.t1Anos * 365.25) || f.soma3 >= P.cobEfetiva;
      const kmMin = P.t1KmMin ?? 0.5;   // validação gravada antes de 16/11 não tem t1KmMin
      const topo = t.c === 1 && !limpo && t.km >= kmMin;
      if (topo) {
        piso = 1;
        bonusT1 = Math.max(0, P.t1Bonus ?? 3);   // o "+3" da planilha (validação antiga não tem t1Bonus)
        score += bonusT1; segs.man += bonusT1;
        const somaTxt = f.nSoma3 ? '; ' + (f.nSoma3 === 1 ? 'a OS executada nos últimos ' + anosTxt + ' cobre ' : 'as ' + f.nSoma3 + ' OS executadas nos últimos ' + anosTxt + ' somam ') + pct(Math.min(1, f.soma3)) : '';
        regras.push({ id: 'F5', tipo: 'piso', txt: (f.ult === null ? 'T1 sem limpeza efetiva registrada (nenhuma OS executada cobrindo ≥ ' + pct(P.cobEfetiva) + ' do trecho' + (f.parcial && !f.nSoma3 ? '; a última parcial, em ' + dataDe(ctx, f.parcial.d) + ', cobriu ' + pct(f.parcial.f) : '') + somaTxt + ')' : 'T1 com a última limpeza efetiva em ' + dataDe(ctx, f.ult) + ', há mais de ' + anosTxt + (somaTxt ? ' (' + somaTxt.slice(2) + ')' : '')) + ': ' + (bonusT1 ? '+' + fmtP(bonusT1) + ' na nota (como na planilha), ' : '') + 'mínimo P1 e topo do ranking' });
      } else if (t.c === 1 && !limpo) {
        regras.push({ id: 'Q6', tipo: 'alerta', txt: 'T1 de ' + fmtN(t.km * 1000) + ' m sem limpeza nos últimos ' + anosTxt + ': fora da regra F5 (T1 com menos de ' + fmtP(kmMin) + ' km segue pela nota)' });
      }
      if (t.c === 1 && (f.meses >= 3 || f.n90 >= 2)) {
        piso = 1;
        regras.push({ id: 'F1', tipo: 'piso', txt: 'T1 com recorrência (' + meses(f.meses) + ' com evento, ' + f.n90 + ' nos últimos 90 dias' + (per.lacuna.length ? ', com a Crítica só até ' + per.fimTxt : '') + '): mínimo P1 e análise de causa' });
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
      score = Math.round(score * 1e6) / 1e6;
      const confR = pesoTot ? conf / pesoTot : 1;
      if (confR < 0.6 && faixa <= 2) regras.push({ id: 'Q1', tipo: 'alerta', txt: 'Confiança ' + fmt1(10 * confR) + ' de 10: confirmar em inspeção antes de programar' });
      if (t.km < 0.5 && f.nJan > 0) regras.push({ id: 'Q4', tipo: 'alerta', txt: 'Trecho curto (' + fmtN(t.km * 1000) + ' m) com ' + qtd(f.nJan, 'ocorrência', 'ocorrências') + ': confirmar o local da falha antes de programar' });
      if (t.cf === 'revisar') regras.push({ id: 'Q3', tipo: 'alerta', txt: 'Segmentação deste trecho está marcada para revisão no cadastro' });
      if (ctx.excecao.has(t.al)) regras.push({ id: 'Q5', tipo: 'alerta', txt: 'Alimentador dividido por exceção em 16/10/2026 (GIS sem as chaves fechadas): poucos trechos e longos, a NAE por trecho é pouco confiável; confirmar em campo' });
      return { t, f, v, pts, situacao, limpeza, score, segs, bonus, bonusT1, CH: segs.imp + segs.his, UA: segs.man + bonus, conf: confR, faixa, fScore, piso, fila, status, regras, topo };
    });
    const ordemStatus = { 'Elegível': 0, 'Em carteira': 1, 'Executado recentemente': 2 };
    // T1 da regra F5 antes de todos os demais (dentro da mesma situação), depois faixa e nota
    const ranked = res.slice().sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status] || b.topo - a.topo || a.faixa - b.faixa || cmpNota(a, b));
    let k = 0;
    for (const r of ranked) r.pos = r.status === 'Elegível' ? ++k : null;
    return { res, ranked, med, ref, per };
  }

  // texto do extrato da ficha (dado e obs de cada critério) e da limpeza; montado sob demanda e guardado no próprio resultado
  const S_GA = (r) => r.regras.some((g) => g.id === 'F2');
  function textos(ctx, r, P) {
    if (r.txt) return r.txt;
    const t = r.t, f = r.f, v = r.v, L = r.limpeza;
    const antes = f.nJan - f.n, prot = f.usadas.filter((o) => !o.pre && deProtecao(t, o)).length;
    const origem = !L.semReg ? 'última limpeza em ' + dataDe(ctx, f.ult)
      : f.parcial ? 'nenhuma limpeza cobrindo ≥ ' + pct(P.cobEfetiva) + ' do trecho desde ' + dataDe(ctx, ctx.osInicio) + ' (última parcial em ' + dataDe(ctx, f.parcial.d) + ', ' + pct(f.parcial.f) + ')'
      : 'nenhuma OS de limpeza executada desde ' + dataDe(ctx, ctx.osInicio);
    const ciclo = 'ciclo T' + t.c + ' = ' + P.ciclo[t.c] + ' anos';
    // DEC e FEC: o que não conta (expurgada, sem dado) vai junto do extrato
    const notas = [f.nExp ? qtd(f.nExp, 'expurgada (situação de emergência): não conta', 'expurgadas (situação de emergência): não contam') + ' no DEC/FEC' : '',
      f.nSem ? qtd(f.nSem, 'ocorrência sem dado na Crítica conta 0', 'ocorrências sem dado na Crítica contam 0') : ''].filter(Boolean);
    const semD = v.dec.st === 'falta', obsDF = (ind) => (!ctx.dfc || !f.n ? '' : ['contribuição das ocorrências no ' + ind + ' do conjunto ANEEL, pela Crítica', ...notas].join(' · '));
    const cli = v.cli.uc ? qtd(v.cli.uc[1], 'UC ligada', 'UCs ligadas') + ' nos trafos do trecho e a jusante' + (v.cli.uc[1] !== v.cli.uc[0] ? ' (' + fmtN(v.cli.uc[0]) + ' nos do próprio trecho)' : '')
      : v.cli.fora ? 'sem dado: trecho fora da planilha UC por trafo'
      : v.cli.st === 'real' ? qtd(f.cliMax, 'cliente', 'clientes') + ' no maior evento'
      : (f.nJan > 1 ? 'eventos sem clientes registrados' : f.nJan ? 'evento sem clientes registrados' : 'sem evento') + ': típico de T' + t.c + ', ' + qtd(v.cli.x, 'cliente', 'clientes');
    const d = {
      nae: [f.n ? qtd(f.n, 'ocorrência', 'ocorrências') + ' em ' + nf2.format(t.km) + ' km' : 'nenhuma ocorrência',
        [prot ? fmtN(prot) + ' de ' + fmtN(f.n) + ' por disjuntor ou religador: defeito em ponto desconhecido da zona' : '',
          antes ? qtd(antes, 'ocorrência anterior', 'ocorrências anteriores') + ' à última limpeza não ' + (antes === 1 ? 'conta' : 'contam') : ''].filter(Boolean).join(' · ')],
      dec: [!ctx.dfc ? 'sem dado: DEC por ocorrência não carregado' : semD && f.n ? 'sem dado na Crítica' : f.dec > 0 ? fmtH(f.dec) + ' h de DEC do conjunto' : f.n ? 'nenhuma contribuição no DEC' : 'nenhuma ocorrência', obsDF('DEC')],
      fec: [!ctx.dfc ? 'sem dado: FEC por ocorrência não carregado' : semD && f.n ? 'sem dado na Crítica' : f.fec > 0 ? fmtH(f.fec) + ' interrupções de FEC do conjunto' : f.n ? 'nenhuma contribuição no FEC' : 'nenhuma ocorrência', obsDF('FEC')],
      img: [t.lente ? 'nota ' + t.lente + ' de 4 no ' + t.al : ctx.img ? 'sem dado: alimentador sem Lente de imagem na planilha' : 'sem dado: Lente de imagem não carregada',
        t.lente ? 'risco de imagem do alimentador (planilha RANKING_FAIXA_APP, aba Lente de imagem); 4 = maior' : ''],
      cli: [cli, ''],
      ga: [S_GA(r) ? 'tem (marcado neste teste): mínimo P2 (regra F2)' : 'sem dado na base (marque na ficha, em Testar exceções)', ''],
      limp: [L.semReg ? 'sem registro de limpeza efetiva' : (L.vencida ? 'vencida em ' : L.aVencer ? 'vence em ' : 'em dia, vence em ') + dataDe(ctx, L.vence), origem + (L.semReg ? '' : ' · ' + ciclo)],
    };
    r.txt = { d, origem, prot };
    return r.txt;
  }

  function justificar(ctx, r, P, T) {
    const t = r.t, f = r.f, partes = [];
    partes.push(t.id + ' (T' + t.c + ', ' + fmtKm(t.km) + ' km, ' + t.mun + ', regional ' + t.reg + ', polo ' + t.polo + ').');
    partes.push('Prioridade P' + r.faixa + ' com nota ' + fmtV(r.score) + '.');
    if (r.faixa < r.fScore) partes.push('A nota sozinha daria P' + r.fScore + '; a faixa subiu por regra.');
    const lin = CRIT.filter((c) => r.pts[c.k] > 0).map((c) => c.curto + ' ' + fmtV(r.pts[c.k]) + ' (' + fmtP(T[c.k]) + ' × ' + valor(c.k, r.v[c.k].x) + (r.v[c.k].st === 'est' && c.k === 'cli' ? ', típico de T' + t.c : '') + ')');
    if (r.bonusT1 > 0) lin.push('T1 da regra F5 +' + fmtP(r.bonusT1));
    if (r.bonus > 0) lin.push('plano climático +' + fmtP(r.bonus));
    partes.push(lin.length ? 'Nota: ' + lin.join('; ') + '.' : 'Nenhum critério somou na nota.');
    const per = periodo(ctx, P), X = textos(ctx, r, P);
    if (f.nJan) partes.push('Histórico: ' + qtd(f.nJan, 'ocorrência', 'ocorrências') + ' por vegetação de ' + per.txt + ', em ' + qtd(f.meses, 'mês', 'meses diferentes') + (X.prot ? '; ' + fmtN(X.prot) + ' por disjuntor ou religador' : '') + (f.nJan > f.n ? '; ' + qtd(f.nJan - f.n, 'anterior', 'anteriores') + ' à última limpeza, fora do NAE, DEC e FEC' : '') + '.');
    else partes.push('Histórico: nenhuma ocorrência por vegetação de ' + per.txt + '.');
    if (f.nExp) partes.push(qtd(f.nExp, 'ocorrência expurgada', 'ocorrências expurgadas') + ' como situação de emergência: ' + (f.nExp === 1 ? 'não conta no DEC/FEC (conta no NAE).' : 'não contam no DEC/FEC (contam no NAE).'));
    if (f.nSem) partes.push(qtd(f.nSem, 'ocorrência sem dado', 'ocorrências sem dado') + ' de DEC e FEC na Crítica (contam 0).');
    if (t.sol) {
      const s0 = t.sol[0];
      partes.push('Solicitações: ' + fmtN(t.sol.length) + (s0.criado ? ', a mais recente em ' + s0.criado.split('-').reverse().join('/') : '') + (s0.prio ? ' (' + s0.prio + ')' : '') + '.');
    }
    const uc = r.v.cli.uc;
    if (r.v.cli.fora) partes.push('Impacto: sem dado de UCs (trecho fora da planilha UC por trafo).');
    else if (uc) partes.push('Impacto: ' + qtd(uc[1], 'UC ligada', 'UCs ligadas') + ' nos trafos do trecho e a jusante' + (f.cliMax ? '; maior evento da Crítica: ' + qtd(f.cliMax, 'cliente', 'clientes') : '') + '.');
    else if (f.cliMax) partes.push('Impacto: até ' + qtd(f.cliMax, 'cliente desligado', 'clientes desligados') + ' por evento.');
    const L = r.limpeza;
    partes.push(L.semReg ? 'Limpeza de faixa sem registro (' + X.origem + ').' : 'Limpeza de faixa ' + L.situacao + ' (' + (L.vencida ? 'venceu' : 'vence') + ' em ' + dataDe(ctx, L.vence) + '; ' + X.origem + ').');
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
    const pool = ranked.filter((r) => r.status === 'Elegível' && r.faixa <= 3 && (o.polo === 'todos' || r.t.reg === o.polo));
    const usado = new Set(), out = [];
    for (const lider of pool) {
      if (out.length >= o.max) break;
      if (usado.has(lider.t.i)) continue;
      usado.add(lider.t.i);
      const pk = { lider, membros: [{ r: lider, aprov: false, dist: 0 }], km: lider.t.km, kmAprov: 0 };
      const cands = [];
      for (const c of pool) {
        if (usado.has(c.t.i) || c.t.reg !== lider.t.reg || c.score < o.scoreMin) continue;
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

  return { CRIT, BLOCOS, PESOS, VERSAO, parametrosPadrao, preparar, avaliar, textos, periodo, deProtecao, justificar, pacotes, retroativo, valor, dataDe, diaDe, fmtN, fmt1, fmtP, fmtD, fmtH, fmtV, fmtKm, pct, qtd };
})();
if (typeof module !== 'undefined') module.exports = VERA;


'use strict';
(() => {
  const V = VERA, D = window.DADOS, ctx = V.preparar(D);   // window.UCS_TRECHOS (dados/ucs-trechos.js) alimenta os clientes por trecho
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { fmtN, fmt1, fmtP, fmtD, fmtH, fmtV, fmtKm, pct, qtd } = V;
  // validações gravadas no navegador: a chave é a mesma desde o início. As anteriores ao modelo da planilha (16/11/2026) têm a
  // nota de 0 a 100 (escala soma100 ou soma); só a decisão, o motivo, a data e a nota são lidos de volta, e o que vier
  // estragado é ignorado
  const CHAVE_VAL = 'vera-prior-validacoes';
  let validacoes = {};
  try {
    const x = JSON.parse(localStorage.getItem(CHAVE_VAL) || '{}');
    validacoes = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  } catch (e) { validacoes = {}; }
  const valDe = (id) => { const v = validacoes[id]; return v && typeof v === 'object' && typeof v.decisao === 'string' ? v : null; };
  const salvarVal = () => { try { localStorage.setItem(CHAVE_VAL, JSON.stringify(validacoes)); } catch (e) {} };

  const clonaT = (t) => JSON.parse(JSON.stringify(t));
  // pesos editados: diferentes dos da planilha (ou o +3 do T1 da F5 mudado)
  const editada = () => JSON.stringify(S.T) !== JSON.stringify(V.PESOS) || S.P.t1Bonus !== V.parametrosPadrao(D).t1Bonus;
  // filtros: conjunto vazio = todos (seleção múltipla, como o segmentador do Power BI); faixa idem, pelos quadros P1–P4
  const S = {
    T: clonaT(V.PESOS), P: V.parametrosPadrao(D),
    flags: { ga: new Set(), plano: new Set() },
    f: { reg: new Set(), polo: new Set(), cls: new Set(), zona: new Set(), sol: new Set(), mun: new Set(), faixa: new Set(), busca: '', ocultos: false },
    out: null, sel: null,
    pk: { polo: 'NORTE', raio: 10, cap: 20, limAprov: 30, scoreMin: 0.6, fator: 1.4, max: 12 },
  };
  const REGIONAIS = ['NORTE', 'CENTRO', 'SUL', 'Sem regional'];   // a[3] do alimentador; o polo é a equipe (a[4])
  const POLO_NOME = { 'ETO-RD-AR': 'Araguaína', 'ETO-RD-AG': 'Augustinópolis', 'ETO-RD-GR': 'Guaraí', 'ETO-RD-PA': 'Palmas', 'ETO-RD-PS': 'Paraíso', 'ETO-RD-PO': 'Porto Nacional', 'ETO-RD-GU': 'Gurupi', 'ETO-RD-DP': 'Dianópolis' };
  const poloTxt = (p) => (POLO_NOME[p] ? POLO_NOME[p] + ' (' + p + ')' : p);
  const temUrb = !!ctx.urb;
  const gaveta = matchMedia('(max-width:860px)');   // celular: a ficha do trecho abre por cima da página

  // ---------- controles ----------
  function tituloRef() { $('#pz-tit').title = 'Limpeza de faixa · referência ' + S.P.ref.split('-').reverse().join('/'); }
  $('#ref').value = S.P.ref;
  // filtro de seleção múltipla: botão com o resumo ("Todas", "Norte", "T1 e T2", "Norte e mais 2") e lista de caixas
  const MS = {};
  const nomeReg = (p) => (p === 'Sem regional' ? p : p[0] + p.slice(1).toLowerCase());
  function rotuloMs(k) {
    const m = MS[k], sel = m.ops.filter(([v]) => S.f[k].has(v)).map(([, n]) => n);
    m.val.textContent = !sel.length || sel.length === m.ops.length ? m.todos : sel.length === 1 ? sel[0] : sel.length === 2 ? sel[0] + ' e ' + sel[1] : sel[0] + ' e mais ' + (sel.length - 1);
    m.el.classList.toggle('on', sel.length > 0 && sel.length < m.ops.length);
    m.btn.title = sel.length ? sel.join(', ') : m.todos;
  }
  function opcoesMs(k, ops) {
    const m = MS[k];
    m.ops = ops;
    for (const v of [...S.f[k]]) if (!ops.some(([o]) => o === v)) S.f[k].delete(v);   // some da lista: sai do filtro
    m.lista.innerHTML = ops.map(([v, n]) => '<label><input type="checkbox" value="' + esc(v) + '"' + (S.f[k].has(v) ? ' checked' : '') + '> ' + esc(n) + '</label>').join('');
    rotuloMs(k);
  }
  function fechaMs(foco) {
    for (const m of Object.values(MS)) if (!m.pop.hidden) { m.pop.hidden = true; m.btn.setAttribute('aria-expanded', 'false'); if (foco) m.btn.focus(); }
  }
  function abreMs(k) {
    const m = MS[k], abrir = m.pop.hidden;
    fechaMs();
    if (!abrir) return;
    m.pop.hidden = false; m.btn.setAttribute('aria-expanded', 'true');
    m.pop.style.left = '0px';
    const r = m.pop.getBoundingClientRect(), sobra = r.right - (document.documentElement.clientWidth - 8);
    if (sobra > 0) m.pop.style.left = -Math.min(sobra, r.left - 8) + 'px';   // não passa da borda direita da tela
    const b = m.pop.querySelector('.ms-busca');
    (b || m.pop.querySelector('input')).focus();
  }
  function multi(k, todos, ops, aoMudar, busca) {
    const el = document.querySelector('.ms[data-f="' + k + '"]');
    const m = MS[k] = { el, todos, ops: [], btn: el.querySelector('.ms-btn'), val: el.querySelector('.ms-val'), pop: el.querySelector('.ms-pop') };
    m.pop.innerHTML = (busca ? '<input class="ms-busca" type="search" placeholder="Buscar" aria-label="Buscar ' + esc(el.querySelector('.rot').textContent.toLowerCase()) + '" autocomplete="off">' : '') +
      '<div class="ms-lista"></div><div class="ms-pe"><button type="button" class="ms-limpar">Limpar</button></div>';
    m.lista = m.pop.querySelector('.ms-lista');
    m.btn.addEventListener('click', () => abreMs(k));
    m.lista.addEventListener('change', (e) => {
      const i = e.target; i.checked ? S.f[k].add(i.value) : S.f[k].delete(i.value);
      rotuloMs(k); aoMudar();
    });
    m.pop.querySelector('.ms-limpar').addEventListener('click', () => {
      S.f[k].clear(); m.lista.querySelectorAll('input').forEach((i) => { i.checked = false; }); rotuloMs(k); aoMudar();
    });
    if (busca) m.pop.querySelector('.ms-busca').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      m.lista.querySelectorAll('label').forEach((l) => { l.hidden = !!q && !l.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q); });
    });
    opcoesMs(k, ops);
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.ms')) fechaMs(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && Object.values(MS).some((m) => !m.pop.hidden)) { e.stopPropagation(); fechaMs(true); } }, true);
  // o polo lista só os das regionais escolhidas (pares regional/polo que existem nos trechos)
  const poloPorReg = {};
  for (const t of ctx.trechos) (poloPorReg[t.reg] = poloPorReg[t.reg] || new Set()).add(t.polo);
  const opsPolo = () => {
    const ps = new Set();
    for (const [r, set] of Object.entries(poloPorReg)) if (!S.f.reg.size || S.f.reg.has(r)) set.forEach((p) => ps.add(p));
    return [...ps].sort((a, b) => (a === 'Sem polo') - (b === 'Sem polo') || a.localeCompare(b, 'pt-BR')).map((p) => [p, poloTxt(p)]);
  };
  const filtroMudou = () => renderRanking();
  multi('reg', 'Todas', REGIONAIS.map((p) => [p, nomeReg(p)]), () => { opcoesMs('polo', opsPolo()); renderRanking(); });
  multi('polo', 'Todos', opsPolo(), filtroMudou);
  multi('cls', 'Todas', [['T1', 'T1'], ['T2', 'T2'], ['T3', 'T3']], filtroMudou);
  multi('zona', 'Todos', [['urbano', 'Urbano'], ['rural', 'Rural']], filtroMudou);
  multi('sol', 'Todas', [['com', 'Com solicitação'], ['sem', 'Sem solicitação']], filtroMudou);
  multi('mun', 'Todos', [...new Set(ctx.trechos.map((t) => t.mun))].filter((m) => m !== '—').sort((a, b) => a.localeCompare(b, 'pt-BR')).map((m) => [m, m]), filtroMudou, true);
  const pkPolo = $('#pk-polo');
  pkPolo.add(new Option('Todos', 'todos'));
  REGIONAIS.forEach((p) => pkPolo.add(new Option(p, p)));
  $('#plano-polos').innerHTML = REGIONAIS.map((p) => '<label><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>').join('');

  const corGrupo = (c) => V.BLOCOS.find((b) => b.k === c.b).cor;
  const per = () => V.periodo(ctx, S.P).txt;   // período real das ocorrências (Crítica) dentro da janela de 12 meses
  const anos = () => fmtP(S.P.t1Anos) + (S.P.t1Anos === 1 ? ' ano' : ' anos');
  const semDF = ctx.dfc ? '' : ' Base de DEC e FEC por ocorrência não carregada: vale 0.';
  // como cada critério é medido: uma linha abaixo do nome, no painel de pesos
  const REGRA = {
    nae: () => 'Ocorrências por vegetação de ' + per() + ' no trecho, depois da última limpeza efetiva. Valor cru, sem dividir pela extensão.',
    dec: () => 'Horas que essas ocorrências pesam no DEC do conjunto ANEEL, pela Crítica (momentânea, dia crítico e expurgada valem 0).' + semDF,
    fec: () => 'Interrupções que elas pesam no FEC do conjunto ANEEL, pela Crítica (mesmas exclusões).' + semDF,
    img: () => 'Nota do alimentador de 1 a 4 (aba Lente de imagem da planilha); sem lente vale 0.' + (ctx.img ? '' : ' Lente de imagem não carregada.'),
    cli: () => 'UCs ligadas nos trafos do trecho e a jusante (planilha UC por trafo), por mil. Entra só com Clientes marcado no topo.',
    f5: () => 'O "+3" da planilha: T1 com a última limpeza efetiva há mais de ' + anos() + ', ou sem nenhuma, e com ' + fmtP(S.P.t1KmMin ?? 0.5) + ' km ou mais. Vai também a P1 e ao topo (regra F5).',
  };
  function formula() {
    const w = (k) => fmtP(S.T[k]);
    $('#formula').innerHTML = '<b>Nota</b> = ' + w('nae') + ' × NAE + ' + w('dec') + ' × DEC + ' + w('fec') + ' × FEC + ' + w('img') + ' × Lente' +
      (S.P.usa.cli ? ' + ' + w('cli') + ' × mil UCs' : '') + ' <span>+ ' + fmtP(S.P.t1Bonus) + ' no T1 da F5</span>';
  }
  function desenharPesos() {
    const linha = (cor, nome, k, campo) => '<div class="pt-crit"><div class="pt-nome"><span class="amostra" style="background:' + cor + '"></span><b>' + esc(nome) + '</b><span class="pt-max">' +
      (k === 'cli' ? (S.P.usa.cli ? 'marcado' : 'desmarcado') : '') + '</span><p class="pt-regra" id="regra-' + k + '"></p></div><div class="pt-faixas">' + campo + '</div></div>';
    $('#pesos').innerHTML = V.CRIT.map((c) => linha(corGrupo(c), c.nome, c.k, '<label class="fx"><span>' + (c.mil ? 'peso por mil UCs' : 'peso') + '</span><input type="number" data-k="' + c.k + '" min="0" max="10" step="0.05" value="' + S.T[c.k] + '" aria-label="Peso de ' + esc(c.nome) + '"></label>')).join('') +
      linha('var(--c-man)', 'T1 sem limpeza (F5)', 'f5', '<label class="fx"><span>soma na nota</span><input type="number" id="p-t1b" min="0" max="20" step="0.5" value="' + S.P.t1Bonus + '" aria-label="Quanto o T1 da regra F5 soma na nota"></label>');
    atualizarRegras(); formula();
  }
  function atualizarRegras() {
    for (const k of Object.keys(REGRA)) { const el = $('#regra-' + k); if (el) el.textContent = REGRA[k](); }
  }
  function preencherParams() {
    $('#p-avenc').value = S.P.aVencer;
    $('#p-cob').value = S.P.cobBloqueio; $('#p-car').value = [1, 2, 3].map((c) => fmtP(S.P.carencia[c])).join(' / ');
    $('#p-bonus').value = S.P.bonus;
    for (const k of ['p1', 'p2', 'p3']) if (document.activeElement !== $('#c-' + k)) $('#c-' + k).value = S.P.lim[k];
    $('#p-t1').value = S.P.t1Anos;
    $('#u-cli').checked = S.P.usa.cli; $('#u-ga').checked = S.P.usa.ga;
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
    atualizarRegras(); formula(); textoRecorte(); linhaRef();
    for (const r of S.out.ranked) r.mov = r.pos && antes.has(r.t.i) ? antes.get(r.t.i) - r.pos : r.pos && antes.size ? 'novo' : 0;
    renderRanking(true);
    if (S.sel !== null) abrirFicha(S.sel, true);
    if ($('#sec-pacotes').open) renderPacotes();
    retroPendente = true;
    if ($('#sec-dados').open) renderRetro();
  };

  $('#restaurar').addEventListener('click', () => {
    S.T = clonaT(V.PESOS); S.P.t1Bonus = V.parametrosPadrao(D).t1Bonus;
    desenharPesos(); agendar();
  });
  $('#pesos').addEventListener('input', (e) => {
    const el = e.target, v = Number(String(el.value).replace(',', '.'));
    if (el.value === '' || !isFinite(v)) return;
    if (el.dataset.k) S.T[el.dataset.k] = Math.min(10, Math.max(0, v));
    else if (el.id === 'p-t1b') S.P.t1Bonus = Math.min(20, Math.max(0, v));
    else return;
    formula(); agendar();
  });
  // ao sair do campo, mostra o valor que valeu (vazio volta ao anterior)
  $('#pesos').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.k) el.value = S.T[el.dataset.k]; else if (el.id === 'p-t1b') el.value = S.P.t1Bonus;
  });
  // critérios opcionais (desligados no padrão): Clientes soma na nota; Grupo A liga a regra F2 no trecho marcado na ficha
  for (const k of ['cli', 'ga']) $('#u-' + k).addEventListener('change', (e) => { S.P.usa[k] = e.target.checked; if (k === 'cli') desenharPesos(); agendar(); });
  $('#ref').addEventListener('change', (e) => { if (e.target.value) { S.P.ref = e.target.value; tituloRef(); agendar(); } else e.target.value = S.P.ref; });
  if (!temUrb) { const z = MS.zona.btn; z.disabled = true; z.title = 'Sem a base de área urbanizada (dados/urbano-trechos.js): filtro indisponível'; $('#aviso-zona').hidden = false; }
  if (!ctx.sol) { const z = MS.sol.btn; z.disabled = true; z.title = 'Sem a base de solicitações (dados/solicitacoes-trechos.js): filtro indisponível'; }
  let tmrBusca = null;
  $('#f-busca').addEventListener('input', (e) => { S.f.busca = e.target.value.trim().toUpperCase(); clearTimeout(tmrBusca); tmrBusca = setTimeout(renderRanking, 160); });
  $('#f-ocultos').addEventListener('change', (e) => { S.f.ocultos = e.target.checked; renderRanking(); });
  $('#plano-polos').addEventListener('change', () => { S.P.planoPolos = [...document.querySelectorAll('#plano-polos input:checked')].map((i) => i.value); agendar(); });
  const numParam = (id, fn) => $(id).addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (e.target.value !== '' && !isNaN(v)) { fn(v); agendar(); }
    preencherParams();
  });
  numParam('#p-t1', (v) => { S.P.t1Anos = Math.min(20, Math.max(0.5, v)); atualizarRegras(); formula(); });
  numParam('#p-avenc', (v) => { S.P.aVencer = Math.min(12, Math.max(1, Math.round(v))); });
  numParam('#p-cob', (v) => { S.P.cobBloqueio = Math.min(1, Math.max(0.1, v)); });
  numParam('#p-bonus', (v) => { S.P.bonus = Math.max(0, v); });
  // texto ilegível volta ao valor anterior (o campo é reescrito); cortes em qualquer ordem viram P1 ≥ P2 ≥ P3
  $('#p-car').addEventListener('change', (e) => { const p = tres(e.target.value); if (p) { S.P.carencia = { 1: p[0], 2: p[1], 3: p[2] }; agendar(); } preencherParams(); });
  // cortes das faixas (nota mínima de P1, P2 e P3; P4 é o resto): valem na hora; ao sair do campo viram P1 ≥ P2 ≥ P3
  for (const k of ['p1', 'p2', 'p3']) {
    $('#c-' + k).addEventListener('input', (e) => {
      const v = Number(String(e.target.value).replace(',', '.'));
      if (e.target.value === '' || !isFinite(v)) return;
      S.P.lim[k] = Math.min(50, Math.max(0, v)); agendar();
    });
    $('#c-' + k).addEventListener('change', () => {
      const p = [S.P.lim.p1, S.P.lim.p2, S.P.lim.p3].sort((a, b) => b - a);
      S.P.lim = { p1: p[0], p2: p[1], p3: p[2] };
      for (const k2 of ['p1', 'p2', 'p3']) $('#c-' + k2).value = S.P.lim[k2];   // também com o campo em foco (Enter)
      agendar();
    });
  }
  for (const [k, id] of [['polo', 'polo'], ['raio', 'raio'], ['cap', 'cap'], ['limAprov', 'aprov'], ['scoreMin', 'min'], ['fator', 'fator'], ['max', 'max']]) {
    $('#pk-' + id).addEventListener('change', (e) => {
      const el = e.target, v = Number(String(el.value).replace(',', '.'));
      if (k === 'polo') S.pk[k] = el.value;
      else if (el.value !== '' && !isNaN(v)) { const x = Math.min(Number(el.max), Math.max(Number(el.min), v)); S.pk[k] = k === 'max' ? Math.round(x) : x; }
      preencherParams(); renderPacotes();
    });
  }

  // linha fixa acima da lista: referência, perfil, cobertura das ocorrências e a data de cada base; abaixo, os avisos da
  // Crítica (lacuna entre o fim dos dados e a referência, set/2026 com registros expurgados como situação de emergência)
  function linhaRef() {
    const pe = V.periodo(ctx, S.P), refBr = V.dataDe(ctx, V.diaDe(ctx, S.P.ref));
    $('#pz-ref').innerHTML = ['Referência <b>' + refBr + '</b>', 'Pesos <b>' + (editada() ? 'editados' : 'da planilha') + (S.P.usa.cli ? ' + Clientes' : '') + (S.P.usa.ga ? ' + Grupo A' : '') + '</b>',
      'NAE e DEC/FEC <b>' + esc(pe.cob) + '</b>', 'OS de <b>' + (osData || '—') + '</b>', 'Trechos de <b>' + segData + '</b>'].map((x) => '<span>' + x + '</span>').join('');
    const lac = pe.lacuna, el = $('#pz-lacuna');
    const avisos = (lac.length ? ['As ocorrências param em ' + pe.fimTxt + ': os critérios de histórico recente (NAE, DEC, FEC, F1 de 90 dias e F4) não enxergam ' + (lac[0] === lac[1] ? lac[0] : 'de ' + lac[0] + ' a ' + lac[1]) + '. Sem evento recente pode ser falta de dado.'] : []).concat(pe.avisos);
    el.hidden = !avisos.length;
    el.textContent = avisos.join(' ');
  }

  // ---------- ranking ----------
  const FAIXA = (n) => '<span class="faixa f' + n + '"><span class="ponto"></span>P' + n + '</span>';
  // barra da nota: cheia no dobro do corte de P1 (6 no padrão); cada bloco com a sua parte (o +3 da F5 é o bloco da limpeza)
  function barra(r) {
    const cheia = Math.max(2 * S.P.lim.p1, 1e-9);
    let h = '', usado = 0;
    const seg = (x, attr) => {
      const w = Math.max(0, Math.min(100 - usado, (x / cheia) * 100));
      usado += w;
      return w >= 0.5 ? '<span ' + attr.replace('W', w.toFixed(2)) + '></span>' : '';
    };
    for (const b of V.BLOCOS) h += seg(r.segs[b.k], 'style="width:W%;background:' + b.cor + '"');
    if (r.bonus > 0) h += seg(r.bonus, 'class="plano" style="width:W%"');
    return '<div class="score"><div class="barra" role="img" aria-label="Nota ' + fmtV(r.score) + '">' + h + '</div><b>' + fmtV(r.score) + '</b></div>';
  }
  function filtrar(semFaixa) {
    const f = S.f;
    return S.out.ranked.filter((r) => {
      const t = r.t;
      if (!f.ocultos && r.status !== 'Elegível') return false;
      if (f.reg.size && !f.reg.has(t.reg)) return false;
      if (f.polo.size && !f.polo.has(t.polo)) return false;
      if (f.mun.size && !f.mun.has(t.mun)) return false;
      if (f.cls.size && !f.cls.has(t.cls)) return false;
      if (temUrb && f.zona.size && !f.zona.has(t.urb >= ctx.urbCorte ? 'urbano' : 'rural')) return false;
      if (ctx.sol && f.sol.size && !f.sol.has(t.sol ? 'com' : 'sem')) return false;
      if (f.busca && !t.id.toUpperCase().includes(f.busca)) return false;
      if (!semFaixa && f.faixa.size && !f.faixa.has(r.faixa)) return false;
      return true;
    });
  }
  // a lista desenha PASSO linhas por vez e diz quantas mostra: desenhar os milhares de trechos de uma vez trava a página
  const PASSO = 100;
  let mostrar = PASSO, listaAtual = [];
  // marca discreta abaixo do trecho: T1 no topo pela regra F5 ("efetiva" = OS executada cobrindo ≥ 50% do trecho; com OS só
  // parcial, a marca diz). Bandeira ao lado do trecho: pedido de limpeza do app de faixa (planilha do Ranking de faixa)
  const marcaF5 = (r) => (r.f.ult === null ? 'T1 sem limpeza efetiva registrada' + (r.f.parcial ? ' (só OS parcial)' : '') : 'T1 com limpeza efetiva há mais de ' + fmtP(S.P.t1Anos) + (S.P.t1Anos === 1 ? ' ano' : ' anos'));
  const BANDEIRA = '<svg class="pz-band" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.3 2.2h8.4l-2.1 3 2.1 3H4.3z" fill="currentColor"/></svg>';
  function linha(r) {
    const t = r.t;
    const mv = r.mov === 'novo' ? '<span class="mov sobe">novo</span>' : r.mov > 0 ? '<span class="mov sobe">▲ ' + r.mov + '</span>' : r.mov < 0 ? '<span class="mov desce">▼ ' + -r.mov + '</span>' : '';
    const marcas = r.topo ? [marcaF5(r)] : [];
    const sol = t.sol ? '<span class="pz-sol" title="' + qtd(t.sol.length, 'solicitação', 'solicitações') + ' do app de faixa" role="img" aria-label="' + qtd(t.sol.length, 'solicitação', 'solicitações') + ' do app de faixa">' + BANDEIRA + (t.sol.length > 1 ? '<small>' + t.sol.length + '</small>' : '') + '</span>' : '';
    return '<tr data-i="' + t.i + '" tabindex="0"' + (S.sel === t.i ? ' class="sel"' : '') + '>' +
      '<td class="r num muted">' + (r.pos ?? '—') + mv + '</td>' +
      '<td><span class="trecho-id">' + esc(t.id) + '</span>' + sol + (marcas.length ? '<span class="sub pz-marca">' + esc(marcas.join(' · ')) + '</span>' : '') + '</td>' +
      '<td>' + FAIXA(r.faixa) + '</td><td>' + barra(r) + '</td></tr>';
  }
  function rodapeLista() {
    const m = listaAtual.length, n = Math.min(mostrar, m), btn = $('#mais');
    $('#exibindo').textContent = m ? 'Exibindo ' + fmtN(n) + ' de ' + qtd(m, 'trecho', 'trechos') : '';
    btn.hidden = n >= m;
    btn.textContent = 'Carregar mais ' + fmtN(Math.min(PASSO, m - n));
  }
  $('#mais').addEventListener('click', () => {
    const de = mostrar; mostrar += PASSO;
    $('#corpo').insertAdjacentHTML('beforeend', listaAtual.slice(de, mostrar).map(linha).join(''));
    rodapeLista();
  });
  // manter: recálculo ou validação mantém quantas linhas já estavam abertas; filtro novo volta ao começo
  function renderRanking(manter) {
    if (!S.out) return;   // filtro usado antes da primeira conta: a lista sai com ele quando a conta terminar
    if (manter !== true) mostrar = PASSO;
    const base = filtrar(true), lista = filtrar(false);
    const cont = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
    for (const r of base) if (r.status === 'Elegível') { cont[r.faixa][0]++; cont[r.faixa][1] += r.t.km; }
    const nomes = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' };
    $('#resumo').innerHTML = [1, 2, 3, 4].map((n) =>
      '<button type="button" class="tile' + (S.f.faixa.has(n) ? ' on' : '') + '" data-faixa="' + n + '" aria-pressed="' + S.f.faixa.has(n) + '"><span class="t f' + n + '"><span class="ponto"></span>' + nomes[n] + '</span><span class="v">' + fmtN(cont[n][0]) + '</span></button>').join('');
    listaAtual = lista;
    $('#corpo').innerHTML = lista.length ? lista.slice(0, mostrar).map(linha).join('') : '<tr><td colspan="4" class="vazio">Nenhum trecho.</td></tr>';
    rodapeLista();
    // computador: a ficha da direita nunca fica vazia; abre o primeiro trecho da lista
    if (S.sel === null && lista.length && !gaveta.matches) abrirFicha(lista[0].t.i, true);
  }
  $('#resumo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-faixa]'); if (!b) return;
    const n = Number(b.dataset.faixa); S.f.faixa.has(n) ? S.f.faixa.delete(n) : S.f.faixa.add(n); renderRanking();   // várias faixas ao mesmo tempo
  });
  $('#corpo').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); });
  $('#corpo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr) { e.preventDefault(); abrirFicha(Number(tr.dataset.i)); } } });

  $('#copiar').addEventListener('click', (e) => {
    const todos = filtrar(false), lista = todos.slice(0, 500);
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const CLS = { T1: 'T1', T2: 'T2', T3: 'T3' };
    const linhas = ['posicao;trecho;classe;regional;polo;municipio;km;nota;faixa;nae;dec_h;fec;lente_imagem;ucs_jusante;' + V.CRIT.map((c) => 'parcela_' + ({ img: 'lente', cli: 'clientes' }[c.k] || c.k)).join(';') + ';soma_t1_f5;soma_plano;situacao;regras;solicitacoes;ultima_solicitacao;justificativa'];
    for (const r of lista) {
      const sl = r.t.sol, s0 = sl ? sl[0] : null;
      const n4 = (x) => String(Math.round(x * 1e4) / 1e4).replace('.', ',');
      linhas.push([r.pos ?? '', q(r.t.id), q(CLS[r.t.cls]), q(r.t.reg), q(r.t.polo), q(r.t.mun), fmtKm(r.t.km), n4(r.score), 'P' + r.faixa, r.f.n, n4(r.f.dec), n4(r.f.fec), r.t.lente || '', r.v.cli.uc ? r.v.cli.uc[1] : '',
        ...V.CRIT.map((c) => n4(r.pts[c.k])), n4(r.bonusT1), n4(r.bonus), q(r.status), q(r.regras.map((g) => g.id).join(' ')), sl ? sl.length : 0, q(s0 ? [s0.criado ? s0.criado.split('-').reverse().join('/') : '', s0.prio, s0.os].filter(Boolean).join(' · ') : ''), q(V.justificar(ctx, r, S.P, S.T))].join(';'));
    }
    const txt = linhas.join('\n'), btn = e.currentTarget;
    const ok = () => { btn.textContent = 'Copiado: ' + fmtN(lista.length) + ' de ' + qtd(todos.length, 'linha', 'linhas'); setTimeout(() => { btn.textContent = 'Copiar ranking (CSV)'; }, 2500); };
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
    // extrato: de onde vem a nota (valor cru do trecho × peso de cada critério, a limpeza com o +3 do T1 da F5 e o Grupo A)
    const X = V.textos(ctx, r, S.P);
    const td = (st) => (st === 'est' ? ' class="st-est"' : st === 'falta' ? ' class="st-falta"' : '');
    const subTxt = (x) => (x ? '<span class="sub">' + esc(x) + '</span>' : '');
    const eGA = S.flags.ga.has(t.i);
    const extrato = V.CRIT.filter((c) => !c.opc || S.P.usa[c.k]).map((c) => {
      const x = r.v[c.k], [dado, obs] = X.d[c.k], p = r.pts[c.k];
      return '<tr' + (p > 0 ? '' : ' class="zero"') + '><td><span class="amostra" style="background:' + corGrupo(c) + '"></span> ' + esc(c.curto) + '</td>' +
        '<td' + td(x.st) + '>' + esc(dado) + subTxt(obs) + '</td><td class="r num"><b>' + fmtV(p) + '</b><span class="sub">× ' + fmtP(S.T[c.k]) + '</span></td></tr>';
    }).join('') +
      '<tr' + (r.bonusT1 ? '' : ' class="zero"') + '><td><span class="amostra" style="background:var(--c-man)"></span> Limpeza</td><td' + td(r.limpeza.semReg ? 'est' : 'real') + '>' + esc(X.d.limp[0]) + subTxt(X.d.limp[1]) +
      '</td><td class="r num"><b>' + (r.bonusT1 ? '+' + fmtP(r.bonusT1) : '0') + '</b><span class="sub">' + (r.bonusT1 ? 'T1 da F5' : 'só T1 da F5') + '</span></td></tr>' +
      (S.P.usa.ga ? '<tr' + (eGA ? '' : ' class="zero"') + '><td><span class="amostra" style="background:var(--c-imp)"></span> Grupo A</td><td' + td(eGA ? 'real' : 'falta') + '>' + (eGA ? 'tem (marcado neste teste)' : 'sem dado na base') +
        '</td><td class="r num"><b>' + (eGA ? 'P2' : '—') + '</b><span class="sub">mínimo</span></td></tr>' : '') +
      (r.bonus > 0 ? '<tr><td>Plano climático</td><td>bônus da regra A1</td><td class="r num"><b>+' + fmtP(r.bonus) + '</b></td></tr>' : '') +
      '<tr class="total"><td colspan="2">Nota</td><td class="r num"><b>' + fmtV(r.score) + '</b></td></tr>';
    const Lm = S.P.lim, pisos = r.regras.filter((g) => g.tipo === 'piso').map((g) => g.id).join(', ');
    const porque = (r.faixa < r.fScore ? 'P' + r.faixa + ' pela regra ' + pisos + '; a nota sozinha daria P' + r.fScore
      : 'P' + r.faixa + ': ' + ['nota ' + fmtP(Lm.p1) + ' ou mais', 'nota de ' + fmtP(Lm.p2) + ' a ' + fmtP(Lm.p1), 'nota de ' + fmtP(Lm.p3) + ' a ' + fmtP(Lm.p2), 'nota abaixo de ' + fmtP(Lm.p3)][r.faixa - 1]) +
      (r.topo ? '; no topo do ranking pela regra F5' : '');
    const ocs = f.usadas.slice().sort((a, b) => b.d - a.d);
    // associação: chave de início do trecho (disjuntor no T1, religador no T2, fusível no T3), vão mais próximo do ativo
    // ou abrangência do DJ. † = defeito em ponto desconhecido da zona de proteção
    const rgNome = (o) => o.rg === 1 ? 'vão mais próximo' : o.rg === 2 ? 'abrangência do disjuntor †' : ['', 'disjuntor do trecho †', 'religador do trecho †', 'fusível do trecho'][t.c];
    const curta = ocs.filter((o) => o.dur < 3).length;
    // DEC (h) e FEC de cada ocorrência: § = expurgada como situação de emergência (0, decisão de 16/11/2026); — = sem dado
    const dfTxt = (o, k) => (o.ex ? '0 §' : o[k] === null ? '—' : fmtH(o[k]));
    const evOc = ocs.length ? '<div class="lista-ev"><table class="tab-mini"><thead><tr><th>Data</th><th class="r">Consum.</th><th class="r">Min</th><th>Tipo</th><th>Associação</th><th>Conta</th><th class="r">DEC (h)</th><th class="r">FEC</th></tr></thead><tbody>' +
      ocs.map((o) => '<tr><td class="num">' + V.dataDe(ctx, o.d) + '</td><td class="r num">' + fmtN(o.cons) + '</td><td class="r num">' + fmtN(o.dur) + (o.dur < 3 ? ' ‡' : '') + '</td><td>' + (o.col ? 'coletiva' : 'individual') + '</td><td>' + rgNome(o) + '</td><td>' + (o.pre ? 'não *' : 'sim') + '</td><td class="r num">' + dfTxt(o, 'dh') + '</td><td class="r num">' + dfTxt(o, 'fc') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<p class="dica">DEC (h) e FEC: o que a ocorrência pesa no DEC e no FEC do conjunto ANEEL, pela Crítica' + (ctx.dfc ? (ocs.some((o) => !o.ex && o.dh === null) ? '; “—” = ocorrência não achada na Crítica (conta 0, sem dado)' : '') : '; base de DEC e FEC por ocorrência não carregada') + '.</p>' +
      (ocs.some((o) => o.ex) ? '<p class="dica">§ expurgada (situação de emergência): não conta no DEC/FEC.</p>' : '') +
      (ocs.some((o) => V.deProtecao(t, o)) ? '<p class="dica">† abertura de disjuntor ou religador: o defeito está em algum ponto da zona protegida, não necessariamente neste trecho.</p>' : '') +
      (curta ? '<p class="dica">‡ interrupção de menos de 3 minutos (o PRODIST não conta no DEC e FEC); aqui ainda entra no NAE (no DEC e no FEC vale 0).</p>' : '') +
      (ocs.some((o) => o.pre) ? '<p class="dica">* anterior à última limpeza efetiva: não conta no NAE, DEC e FEC.</p>' : '') : '<p class="dica">Nenhuma ocorrência por vegetação em ' + esc(V.periodo(ctx, S.P).txt) + '.</p>';
    // solicitações de limpeza do trecho (planilha do Ranking de faixa, aba Base de solicitações), da mais recente para a mais antiga
    const dBr = (x) => (x ? x.split('-').reverse().join('/') : 'sem data');
    const sitOs = (x) => (x.os ? 'OS ' + x.os + (x.sit ? ' · ' + x.sit.toLowerCase() : '') : 'sem OS');
    // como o pedido foi ligado a este trecho: pelo ativo (início, chave irmã, dentro do trecho, fim, descrição); pedido feito
    // para outra classe ou para um trecho criado depois da segmentação do Priorizador (que aqui está dentro deste) é explicado
    const COMO = { 'ativo inicial (no trecho)': 'ativo inicial, que fica dentro dele', 'ativo na descrição': 'ativo citado na descrição' };
    const cl = 'T' + t.c, ligTxt = (x) => {
      const como = x.como ? COMO[x.como] || x.como : '';
      if (x.de) return 'pedido para o ' + x.de + ', trecho criado depois de ' + dBr(D.gerado).slice(0, 5) + ' que aqui está dentro deste ' + cl + (como ? ' (ligado pelo ' + como + ')' : '');
      if (x.cls && x.cls !== cl) return 'pedido como ' + x.cls + ' e ligado a este ' + cl + (como ? ' pelo ' + como : '');
      return como ? 'ligada pelo ' + como : '';
    };
    const evSol = t.sol ? '<ul class="regras sol-lista">' + t.sol.map((x) => '<li><span class="chip' + (x.prio === 'Emergencial' ? ' corr' : '') + '">' + esc(x.prio || 'sem prioridade') + '</span><span><b>' + dBr(x.criado) + '</b> · ' +
      esc([x.dep, x.cls && x.cls === cl && !x.de ? 'pedido como ' + x.cls : '', typeof x.km === 'number' ? fmtD(x.km) + ' km' : '', sitOs(x)].filter(Boolean).join(' · ')) +
      (x.obs ? '<span class="sub">' + esc(x.obs) + '</span>' : '') +
      '<span class="sub">' + esc(['nº ' + x.n + ' da planilha', ligTxt(x), x.al_planilha ? 'na planilha: ' + x.al_planilha : ''].filter(Boolean).join(' · ')) + '</span></span></li>').join('') + '</ul>' : '';
    const sitN = { 1: 'executada', 2: 'criada', 3: 'reprogramar', 9: 'outra' };
    const evOs = t.os.length ? '<div class="lista-ev"><table class="tab-mini"><thead><tr><th>Data</th><th>OS</th><th>Situação</th><th class="r">Cobertura</th></tr></thead><tbody>' +
      t.os.slice().sort((a, b) => b[0] - a[0]).map((o) => '<tr><td class="num">' + V.dataDe(ctx, o[0]) + '</td><td class="mono">' + esc(o[3]) + '</td><td>' + sitN[o[1]] + '</td><td class="r num">' + pct(o[2]) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="dica">Nenhuma OS de limpeza de faixa associada.</p>';
    const val = valDe(t.id);
    gav.innerHTML =
      '<div class="g-cab"><div class="g-topo"><div><h2 id="g-titulo">' + esc(t.id) + '</h2></div><button class="fechar" type="button" id="fechar">Fechar</button></div>' +
      '<div class="chips"><a class="botao g-mapa" href="../alimentadores/' + encodeURIComponent(t.al) + '/?t=' + encodeURIComponent(t.n) + '">Ver no mapa</a><span class="chip">' + fmtKm(t.km) + ' km</span><span class="chip">' + esc(t.reg) + (t.polo !== 'Sem polo' ? ' · ' + esc(POLO_NOME[t.polo] || t.polo) : '') + '</span><span class="chip">' + esc(t.mun) + '</span>' + (t.sol ? '<span class="chip chip-sol">' + BANDEIRA + qtd(t.sol.length, 'solicitação', 'solicitações') + ' do app</span>' : '') + (r.status !== 'Elegível' ? '<span class="chip estado">' + esc(r.status) + '</span>' : '') + '</div></div>' +
      '<div class="g-nota"><span class="rot">Nota</span><b>' + fmtV(r.score) + '</b>' + FAIXA(r.faixa) + '<span class="por">' + esc(porque) + '</span></div>' +
      '<section><h3>De onde vem a nota</h3><div class="tabela-wrap"><table class="tab-mini extrato"><thead><tr><th>Critério</th><th>No trecho</th><th class="r">Na nota</th></tr></thead><tbody>' + extrato + '</tbody></table></div></section>' +
      (r.regras.length ? '<section><h3>Regras</h3><ul class="regras" style="margin-top:8px">' + r.regras.map((g) => '<li><span class="chip ' + g.tipo + '">' + g.id + '</span><span>' + esc(g.txt) + '</span></li>').join('') + '</ul></section>' : '') +
      (t.sol ? '<details class="g-mais" open><summary>Solicitações (' + t.sol.length + ')</summary>' + evSol + '<p class="dica">Pedidos de limpeza do app de faixa (planilha do Ranking de faixa): não mudam a nota.</p></details>' : '') +
      '<details class="g-mais"><summary>Testar exceções</summary><div class="excecoes">' +
      '<label><input type="checkbox" id="x-ga"' + (S.flags.ga.has(t.i) ? ' checked' : '') + '> Há cliente Grupo A no trecho' + (S.P.usa.ga ? '' : ' (vale com Grupo A marcado no topo)') + '</label>' +
      '<label><input type="checkbox" id="x-plano"' + (S.flags.plano.has(t.i) ? ' checked' : '') + '> Incluir este trecho no plano climático</label></div></details>' +
      '<details class="g-mais"><summary>Ocorrências (' + ocs.length + ')</summary>' + evOc + '</details>' +
      '<details class="g-mais"><summary>Limpezas (' + t.os.length + ')</summary>' + evOs + '</details>' +
      '<details class="g-mais"><summary>Validar' + (val ? ' · ' + esc(val.decisao) : '') + '</summary><div class="validacao"><div class="val-botoes">' +
      [['Aprovado', 'Aprovar'], ['Adiado', 'Adiar'], ['Rejeitado', 'Rejeitar']].map(([d, rot]) => '<button type="button" class="botao" data-dec="' + d + '" aria-pressed="' + Boolean(val && val.decisao === d) + '">' + rot + '</button>').join('') + '</div>' +
      '<div class="campo"><label for="v-motivo">Motivo</label><select id="v-motivo"><option>Confirmo a prioridade</option><option>Executado e não registrado</option><option>Sem acesso ou autorização</option><option>Aguardar inspeção</option><option>Dado incorreto</option><option>Outro</option></select></div>' +
      '<div class="campo"><label for="v-obs">Observação</label><input type="text" id="v-obs" value="' + esc(val ? val.obs : '') + '"></div>' +
      '<p class="val-reg">' + (val ? esc([val.decisao + ' em ' + (val.quando || '—'), val.motivo, typeof val.score === 'number' ? 'nota ' + (val.escala === 'planilha' ? fmtV(val.score) : fmtP(val.escala === 'soma' ? val.score * 10 : val.score) + '/100 (escala anterior)') : '',
        'metodologia ' + (val.perfil || '—') + (val.escala === 'planilha' ? '' : ' (anterior ao modelo da planilha)')].filter(Boolean).join(' · ')) : '') + '</p></div></details>';
    // recálculo do mesmo trecho: cada seção volta como estava (aberta ou fechada)
    const dets = gav.querySelectorAll('details.g-mais');
    if (abertos.length === dets.length) dets.forEach((d, j) => { d.open = !!abertos[j]; });
    if (val && val.motivo) $('#v-motivo').value = val.motivo;
    if (gaveta.matches && !manter) { gav.classList.add('aberta'); fundo.hidden = false; $('#fechar').focus(); }
    $('#fechar').addEventListener('click', fecharFicha);
    $('#x-ga').addEventListener('change', (e) => { e.target.checked ? S.flags.ga.add(t.i) : S.flags.ga.delete(t.i); recalcular(); });
    $('#x-plano').addEventListener('change', (e) => { e.target.checked ? S.flags.plano.add(t.i) : S.flags.plano.delete(t.i); recalcular(); });
    gav.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      const motivo = $('#v-motivo').value, obs = $('#v-obs').value;
      if (pend) recalcular();
      const rr = S.out.res[i], Pp = S.P;
      validacoes[t.id] = { decisao: b.dataset.dec, motivo, obs, quando: new Date().toLocaleString('pt-BR'), score: Math.round(rr.score * 1e4) / 1e4, escala: 'planilha', metodologia: V.VERSAO, perfil: 'Planilha' + (editada() ? ' com pesos editados' : ''), pesos: clonaT(S.T),
        parametros: clonaT({ ref: Pp.ref, lim: Pp.lim, carencia: Pp.carencia, ciclo: Pp.ciclo, aVencer: Pp.aVencer, cobBloqueio: Pp.cobBloqueio, bonus: Pp.bonus, planoPolos: Pp.planoPolos, t1Anos: Pp.t1Anos, t1KmMin: Pp.t1KmMin, t1Bonus: Pp.t1Bonus, usa: Pp.usa }),
        excecoes: { grupoA: S.flags.ga.has(t.i), plano: S.flags.plano.has(t.i) } };
      salvarVal(); abrirFicha(i, true); renderRanking(true);
    }));
  }

  // ---------- pacotes ----------
  function renderPacotes() {
    if (!S.out) return;
    const o = Object.assign({}, S.pk, { limAprov: S.pk.limAprov / 100 });
    const { pacotes, elegiveis } = V.pacotes(ctx, S.out.ranked, o);
    const totKm = pacotes.reduce((s, p) => s + p.km, 0), ind = pacotes.reduce((s, p) => s + p.deslInd, 0), pac = pacotes.reduce((s, p) => s + p.deslPac, 0);
    const nTre = pacotes.reduce((s, p) => s + p.membros.length, 0), nAp = pacotes.reduce((s, p) => s + p.membros.filter((m) => m.aprov).length, 0);
    $('#pk-resumo').innerHTML = '<span><b>' + fmtN(pacotes.length) + '</b> ' + (pacotes.length === 1 ? 'pacote' : 'pacotes') + '</span><span><b>' + fmtN(nTre) + '</b> trechos (' + fmtN(nAp) + ' por aproveitamento)</span><span><b>' + fmt1(totKm) + '</b> km de faixa</span><span>Deslocamento estimado <b>' + fmtN(pac) + ' km</b> contra ' + fmtN(ind) + ' km em visitas separadas</span><span>' + fmtN(elegiveis) + ' trechos P1–P3 elegíveis na regional</span>';
    $('#pk-lista').innerHTML = pacotes.length ? pacotes.map((p, j) => {
      const L = p.lider, efic = p.deslPac > 0 ? p.km / p.deslPac : 0;
      return '<article class="pk"><div class="pk-cab">' + FAIXA(L.faixa) + '<h3>Pacote ' + (j + 1) + ' · líder ' + esc(L.t.id) + ' (#' + L.pos + ', nota ' + fmtP(L.score) + ')</h3></div>' +
        '<div class="pk-meta"><span><b>' + fmt1(p.km) + '</b> km de faixa</span><span><b>' + p.membros.length + '</b> ' + (p.membros.length === 1 ? 'trecho' : 'trechos') + '</span><span>Saída: <b>' + esc(p.base) + '</b></span><span>Equipe provável: <b>' + esc(p.equipe || '—') + '</b></span><span>Deslocamento <b>' + fmtN(p.deslPac) + ' km</b> (separado: ' + fmtN(p.deslInd) + ' km)</span><span>Eficiência <b>' + fmt1(efic) + '</b> km faixa/km estrada</span></div>' +
        '<div class="tabela-wrap"><table class="tab-mini"><thead><tr><th>Trecho</th><th>Município</th><th class="r">km</th><th class="r">Nota</th><th>Faixa</th><th class="r">Dist. do líder</th><th>Entrada</th></tr></thead><tbody>' +
        p.membros.map((m) => '<tr data-i="' + m.r.t.i + '"><td class="trecho-id">' + esc(m.r.t.id) + '</td><td>' + esc(m.r.t.mun) + '</td><td class="r num">' + fmtKm(m.r.t.km) + '</td><td class="r num">' + fmtP(m.r.score) + '</td><td>' + FAIXA(m.r.faixa) + '</td><td class="r num">' + (m.dist ? fmt1(m.dist) + ' km' : 'líder') + '</td><td>' + (m.dist === 0 && m.r === L ? 'prioridade' : m.aprov ? 'aproveitamento' : 'mesma faixa') + '</td></tr>').join('') +
        '</tbody></table></div></article>';
    }).join('') : '<p class="vazio">Nenhum trecho P1–P3 elegível nesta regional.</p>';
  }
  $('#pk-lista').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) abrirFicha(Number(tr.dataset.i)); });

  // ---------- dados e validação ----------
  const E = D.estat, dBr = (s) => s.split('-').reverse().join('/');
  const segData = dBr(D.gerado), osData = D.os_gerado ? dBr(D.os_gerado) : null, ocFim = V.dataDe(ctx, ctx.ocFim);
  // números das bases novas (DEC/FEC por ocorrência, Lente de imagem, solicitações), contados nos próprios arquivos
  const WD = window.DECFEC_TRECHOS, WL = window.LENTE_IMAGEM, WS = window.SOLICITACOES;
  const nb = { oc: 0, nul: 0, exp: 0, alL: 0, solT: 0, solN: 0, solForaT: 0, solForaN: 0, solSobe: 0 };
  for (const t of ctx.trechos) {
    nb.oc += t.oc.length;
    if (t.dfc) for (let ix = 0; ix < t.oc.length; ix++) { if (t.exp && t.exp.has(ix)) nb.exp++; else if (!t.dfc[ix]) nb.nul++; }
    if (t.sol) { nb.solT++; nb.solN += t.sol.length; nb.solSobe += t.sol.filter((x) => x.de).length; }
  }
  nb.alL = D.alims.filter((a) => ctx.img && Number.isInteger(ctx.img[a[0]])).length;
  if (ctx.solT) {
    const ids = new Set(ctx.trechos.map((t) => t.id));
    for (const [al, tr] of Object.entries(ctx.solT)) for (const [n, l] of Object.entries(tr)) if (!ids.has(al + ' · ' + n)) { nb.solForaT++; nb.solForaN += l.length; }
  }
  const exc = D.excecao || [], excTxt = exc.length ? exc.slice(0, -1).join(', ') + (exc.length > 1 ? ' e ' : '') + exc[exc.length - 1] : '';
  const gerBr = (o) => (o && o.gerado ? dBr(o.gerado) : '—');
  $('#fontes').innerHTML = [
    '<b>' + fmtN(D.alims.length) + '</b> alimentadores · ' + fmtN(E.T1 + E.T2 + E.T3) + ' trechos da segmentação de <b>' + segData + '</b>',
    'Crítica <b>' + V.dataDe(ctx, ctx.ocIni) + ' a ' + ocFim + '</b> · ' + fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências por vegetação',
    'OS de limpeza desde <b>' + D.os_inicio.split('-').reverse().slice(1).join('/') + '</b>' + (osData ? ', situação de <b>' + osData + '</b>' : ''),
    'Ranking de faixa <b>' + gerBr(WL || WS) + '</b> · Lente de imagem e ' + (WS ? fmtN(WS.total) : '—') + ' solicitações',
  ].map((s) => '<li>' + s + '</li>').join('');
  // datas das bases nos textos fixos da metodologia e das premissas (lidas dos dados, não escritas à mão)
  const perDados = V.dataDe(ctx, ctx.ocIni) + ' a ' + ocFim + ', ' + Object.keys(D.saz).length + ' meses';
  document.querySelectorAll('.js-periodo').forEach((el) => { el.textContent = perDados; });
  document.querySelectorAll('.js-seg').forEach((el) => { el.textContent = segData; });
  document.querySelectorAll('.js-os').forEach((el) => { el.textContent = osData || '—'; });
  const kmTot = E.km_T1 + E.km_T2 + E.km_T3;
  $('#tab-fontes').innerHTML = [
    ['Rede (GIS processado no protótipo /teste/)', 'Segmentação de ' + segData + ' (não regerada aqui; os trechos do mapa podem ter mudado depois)' + (exc.length ? ', com ' + excTxt + ' (divididos por exceção em 16/10/2026) já pela segmentação de hoje' : '') + ': ' + fmtN(D.alims.length) + ' alimentadores, ' + fmtN(E.T1) + ' T1, ' + fmtN(E.T2) + ' T2, ' + fmtN(E.T3) + ' T3, ' + fmtN(kmTot) + ' km', 'Classe, extensão, município, polo, centro do trecho'],
    ['Crítica (causa árvore)', fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências de ' + V.dataDe(ctx, ctx.ocIni) + ' a ' + ocFim + '; ' + fmtN(D.nae_fora) + ' sem trecho associado. Jan–mar/2026: extração anterior ao expurgo. Refeito sozinho a cada Crítica enviada pelo menu', 'NAE Vegetação'],
    ['DEC e FEC por ocorrência (Crítica, conjunto ANEEL)', WD ? fmtN(nb.oc) + ' ocorrências dos trechos, de ' + V.dataDe(ctx, ctx.ocIni) + ' a ' + ocFim + ': ' + fmtN(nb.exp) + ' expurgadas como situação de emergência (valem 0) e ' + fmtN(nb.nul) + ' sem dado na Crítica (contam 0). Jan–mar/2026 pela Crítica refeita depois do expurgo; gerado em ' + gerBr(WD) + ' (refeito a cada Crítica do menu)' : 'Não carregado (dados/decfec-trechos.js)', 'DEC e FEC'],
    ['Lente de imagem (planilha RANKING_FAIXA_APP, aba Lente de imagem)', WL ? fmtN(Object.keys(WL.al).length) + ' alimentadores com nota de 1 a 4 (4 = maior risco); ' + fmtN(D.alims.length - nb.alL) + ' dos ' + fmtN(D.alims.length) + ' deste recorte sem nota' : 'Não carregada (dados/lente-imagem.js)', 'Lente de imagem'],
    ['Solicitações de limpeza (planilha RANKING_FAIXA_APP, aba Base de solicitações)', WS ? fmtN(WS.total) + ' pedidos de 2023 a 2026; ' + fmtN(WS.no_site) + ' ligados a um trecho, ' + fmtN(nb.solN) + ' deles em ' + fmtN(nb.solT) + ' trechos desta lista' + (nb.solSobe ? ' (' + fmtN(nb.solSobe) + ' feitos para trecho criado depois de ' + segData.slice(0, 5) + ', no trecho que o contém)' : '') + (nb.solForaN ? ' e ' + fmtN(nb.solForaN) + ' em ' + fmtN(nb.solForaT) + ' trechos fora do recorte' : '') + '; ' + fmtN((WS.sem_trecho || []).length) + ' sem trecho' : 'Não carregadas (dados/solicitacoes-trechos.js)', 'Bandeira na lista, ficha e filtro; fora da nota'],
    ['OS de limpeza de faixa', (D.os_fonte || 'Planilha de OS') + ' desde ' + D.os_inicio.split('-').reverse().join('/') + (D.os_fonte ? ', cobertura pelos vãos do mapa' : ', cobertura por vão estimada pela descrição'), 'Última limpeza, carência, OS abertas'],
    ['Inspeções do app de campo', fmtN(D.insp_total) + ' registros (jul–ago/2026), ' + fmtN(D.insp_casadas) + ' ligados a um poste da rede MT', 'Fora do score: não há medição de distância confiável'],
    ['Sem fonte na base', 'Grupo A e essenciais, classe de vegetação, produtividade por tipo de equipe, disponibilidade de equipes, plano climático, emergências do centro de operação', 'Marcação manual no teste ou parâmetro'],
  ].map((l) => '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td><td>' + l[2] + '</td></tr>').join('');
  $('#recorte').textContent = 'Recorte do teste: ' + fmtN(D.trechos.length) + ' trechos (todos os T1 e T2 e os T3 com ocorrência, OS, inspeção ou solicitação). Ficaram de fora ' + fmtN(D.fora_recorte.n) + ' T3 (' + fmtN(D.fora_recorte.km) + ' km) sem nenhum desses sinais.';
  // T3 fora do recorte: sem ocorrência nem limpeza registrada; com os pesos atuais só a Lente do alimentador (e Clientes, se marcado)
  function textoRecorte() {
    const L = S.P.lim, cli = S.P.usa.cli ? (S.T.cli * S.out.med.cli[3]) / 1000 : 0, nMax = cli + S.T.img * 4;
    const faixaP = (x) => (x >= L.p1 ? 1 : x >= L.p2 ? 2 : x >= L.p3 ? 3 : 4), comBonus = nMax + Math.max(0, S.P.bonus);
    const fx = faixaP(cli) === faixaP(nMax) ? 'P' + faixaP(cli) : 'P' + faixaP(cli) + ' a P' + faixaP(nMax);
    $('#recorte-real').textContent = ' No sistema real eles entram: sem ocorrência e sem limpeza registrada, só com a Lente de imagem do alimentador' + (S.P.usa.cli ? ' e os clientes típicos de T3' : '') + ', a nota fica de ' + fmtV(cli) + ' a ' + fmtV(nMax) + ' (' + fx + ') com os pesos atuais' +
      (S.P.planoPolos.length && comBonus > nMax ? '; nos polos do plano climático, até ' + fmtV(comBonus) + ' (P' + faixaP(comBonus) + ').' : '.');
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
    'set/2026: 3.363 registros da Crítica expurgados como situação de emergência; a NAE desse mês pode estar menor.',
    'Jan–mar/2026: a NAE é a da extração anterior ao expurgo; na Crítica refeita, ' + (WD ? fmtN(nb.exp) : 'parte') + ' dessas ocorrências estão expurgadas como situação de emergência e valem 0 no DEC e no FEC (continuam no NAE).',
    WS ? (nb.solForaN ? fmtN(nb.solForaN) + ' solicitações (' + fmtN(nb.solForaT) + ' trechos) caem em trecho fora do recorte e não aparecem na lista; ' : '') + fmtN((WS.sem_trecho || []).length) + ' solicitações não foram ligadas a um trecho (ativo não achado, sem código ou alimentador fora do site).' : '',
    exc.length ? excTxt + ' foram divididos por exceção em 16/10/2026 (GIS sem as chaves fechadas): poucos trechos e longos, a NAE por trecho é pouco confiável (alerta Q5).' : '',
  ].filter(Boolean).map((s) => '<li>' + esc(s) + '</li>').join('');

  function grafSaz() {
    const meses = Object.keys(D.saz), vals = meses.map((m) => D.saz[m]);
    // último mês incompleto (D.oc_ate antes do fim do mês): barra clara e "até dd/mm"
    const ult = meses[meses.length - 1], [ua, um] = ult.split('-').map(Number);
    const parc = D.oc_ate && D.oc_ate < new Date(Date.UTC(ua, um, 0)).toISOString().slice(0, 10) ? meses.length - 1 : -1;
    const ateTxt = parc >= 0 ? ' (até ' + dBr(D.oc_ate).slice(0, 5) + ')' : '';
    const ago = D.saz['2026-08'];
    const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const W = 640, H = 240, ml = 44, mr = 12, mt = 26, mb = 30, max = 1200, iw = W - ml - mr, ih = H - mt - mb, bw = iw / vals.length;
    const y = (v) => mt + ih - (v / max) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ocorrências por vegetação por mês em 2026">';
    for (const g of [0, 300, 600, 900, 1200]) s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(g) + '" y2="' + y(g) + '"></line><text x="' + (ml - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + fmtN(g) + '</text>';
    vals.forEach((v, j) => {
      const x = ml + j * bw + bw * 0.18, w = bw * 0.64, h = mt + ih - y(v);
      s += '<rect class="b" data-j="' + j + '" x="' + x.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"' + (j === parc ? ' fill-opacity="0.45"' : '') + '></rect>';
      s += '<rect data-j="' + j + '" x="' + (ml + j * bw).toFixed(1) + '" y="' + mt + '" width="' + bw.toFixed(1) + '" height="' + ih + '" fill="transparent"></rect>';
      s += '<text x="' + (ml + j * bw + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + NOMES[Number(meses[j].slice(5)) - 1] + '</text>';
      if (j === 0 || j === vals.length - 1) s += '<text class="rotv" x="' + (ml + j * bw + bw / 2).toFixed(1) + '" y="' + (y(v) - 6).toFixed(1) + '" text-anchor="middle">' + fmtN(v) + '</text>';
    });
    s += '</svg>';
    const el = $('#graf-saz');
    el.innerHTML = '<h3 style="margin-bottom:8px">Ocorrências por vegetação por mês · Crítica 2026</h3>' + s + '<div class="valores">' + meses.map((m, j) => '<span>' + NOMES[Number(m.slice(5)) - 1] + ' ' + fmtN(vals[j]) + (j === parc ? ateTxt : '') + '</span>').join('') + '</div><p class="dica" style="margin-top:6px">' +
      (ago ? 'Janeiro tem ' + fmt1(vals[0] / ago) + ' vezes as ocorrências de agosto: o fim do período chuvoso concentra o risco. ' : '') + (parc >= 0 ? NOMES[um - 1] + '/' + ua + ' vai só' + ateTxt.replace(/[()]/g, '') + '. ' : '') + 'Em set/2026, 3.363 registros da Crítica foram expurgados como situação de emergência: a barra pode estar menor.</p>';
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.appendChild(tip);
    const svg = el.querySelector('svg');
    svg.addEventListener('mousemove', (e) => {
      const r = e.target.closest('rect[data-j]');
      svg.querySelectorAll('rect.b').forEach((b) => b.classList.toggle('hover', r && b.dataset.j === r.dataset.j));
      if (!r) { tip.hidden = true; return; }
      const j = Number(r.dataset.j), tot = vals.reduce((a, b) => a + b, 0);
      tip.textContent = NOMES[Number(meses[j].slice(5)) - 1] + '/2026' + (j === parc ? ateTxt : '') + ' · ' + fmtN(vals[j]) + ' ocorrências · ' + pct(vals[j] / tot) + ' do período';
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
      $('#retro-nota').textContent = fmtN(rt.total) + ' ocorrências e ' + fmtN(rt.totalH) + ' consumidor·hora (real, não é critério da nota) entre 01/05 e 31/08/2026 nos ' + fmtN(rt.n) + ' trechos do recorte. A última coluna mostra quanto consumidor·hora futuro cada % de extensão priorizada captou (1,0 = igual ao acaso por km). Limites: só 4 meses de janela futura, limpezas feitas no meio do período e associação aproximada da falha ao trecho.';
      // a nota só vale como método se captar mais que a contagem simples; enquanto não captar, a tela diz que é experimental
      const l1 = rt.linhas[0], pior = l1.score.oc < l1.nae.oc;
      const av = $('#retro-aviso');
      av.hidden = !pior;
      if (pior) av.textContent = 'Nota experimental: no topo de 1%, ela capta ' + fmt1(l1.score.oc * 100) + '% das ocorrências futuras, contra ' + fmt1(l1.nae.oc * 100) + '% da ordenação só pelo número de ocorrências. Pesos e cortes ainda não foram calibrados por este teste.';
    }, 30);
  }

  // ---------- seções do rodapé ----------
  $('#sec-pacotes').addEventListener('toggle', (e) => { if (e.target.open) renderPacotes(); });
  let sazFeito = false;   // gráfico só quando a seção abre: não pesa na abertura da página
  $('#sec-dados').addEventListener('toggle', (e) => { if (e.target.open) { if (!sazFeito) { sazFeito = true; grafSaz(); } renderRetro(); } });
  function abrirSecao() {
    if (location.hash === '#premissas') { abrePrem(true); $('#sec-premissas').scrollIntoView(); return; }
    const sec = { opcoes: 'sec-opcoes', pacotes: 'sec-pacotes', metodologia: 'sec-metodologia', dados: 'sec-dados' }[location.hash.slice(1)];
    if (sec) { const d = document.getElementById(sec); d.open = true; d.scrollIntoView(); }
  }
  window.addEventListener('hashchange', abrirSecao);


  // pesos: o botão da barra abre e fecha o painel
  const premBtn = $('#prem-btn'), prem = $('#sec-premissas');
  function abrePrem(sim) { prem.hidden = !sim; premBtn.setAttribute('aria-expanded', String(sim)); }
  premBtn.addEventListener('click', () => abrePrem(prem.hidden));

  // abertura em partes: controles e linha de referência primeiro; nota e lista no quadro seguinte, para a página pintar antes
  tituloRef(); preencherParams();
  $('#corpo').innerHTML = '<tr><td colspan="4" class="vazio">Calculando as notas…</td></tr>';
  setTimeout(() => {
    S.out = V.avaliar(ctx, S.T, S.P, S.flags);
    linhaRef(); renderRanking();
    setTimeout(() => { desenharPesos(); textoRecorte(); abrirSecao(); }, 0);   // pesos ficam recolhidos: podem vir depois
  }, 0);
})();
