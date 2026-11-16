// Priorização de limpeza de faixa e poda (/teste/priorizacao/): motor e tela do Artifact "VERA Priorização de Faixa".
// Dados: window.DADOS (priorizacao-dados.js; ocorrências até D.oc_ate), DECFEC_TRECHOS (dados/decfec-trechos.js: DEC e FEC
// de cada ocorrência, na ordem de oc, e as expurgadas), LENTE_IMAGEM (dados/lente-imagem.js: nota 1 a 4 por alimentador),
// SOLICITACOES (dados/solicitacoes-trechos.js: pedidos de limpeza por trecho), UCS_TRECHOS e URBANO_TRECHOS.
// Nota de 0 a 100 = soma de pontos, como numa prova: cada critério dá os pontos da faixa de valor em que o trecho está.
// Perfil padrão (decisão do dono em 16/11/2026): premissas do Ranking de faixa (planilha RANKING_FAIXA_APP, 16/11/2026) sem as
// lentes de Meio Ambiente e de Segurança, reescaladas para somar 100: NAE Vegetação/100 km 33, DEC/100 km 33, FEC/100 km 22 e
// Lente de imagem 12. Clientes, Hierarquia, Grupo A e Limpeza seguem na tabela de pontos com 0 no padrão (editáveis).
// DEC e FEC: contribuição das ocorrências do trecho no DEC (horas) e no FEC (interrupções) do conjunto ANEEL, pela Crítica, já
// sem o que o PRODIST não conta; ocorrência expurgada como situação de emergência vale 0, como no indicador oficial (continua no
// NAE). Janela de 12 meses (U12M) contada da data de referência. As UCs a jusante só entram no critério Clientes.
// Regra F5: T1 com a última limpeza efetiva (OS executada cobrindo ≥ 50% do trecho) há mais de P.t1Anos (3) anos, ou sem
// limpeza efetiva registrada, fica no mínimo P1 e no topo do ranking, entre si pela nota. Solicitações não mudam a nota:
// marcam o trecho na lista e na ficha e têm filtro próprio (a de trecho criado depois de 07/10 vai para o trecho que o contém).
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
    { k: 'nae', b: 'his', nome: 'NAE Vegetação/100 km', curto: 'NAE', lim: [20, 40, 60], passo: 0.1, zero: 'nenhuma' },
    // limites de DEC e FEC (editáveis na tela, P.fx): calibrados nas ocorrências de jan a nov/2026 (até 09/11), referência 09/11,
    // 12 meses, depois da última limpeza e com o piso de 5 km. Ficam abaixo deles cerca de 57% e 91% dos trechos com DEC e
    // 48%, 83% e 98% dos com FEC. Com a janela de 12 meses cheia os valores sobem (~15%): rever
    { k: 'dec', b: 'his', nome: 'DEC/100 km', curto: 'DEC', lim: [0.07, 0.8], passo: 0.001, zero: 'nenhum', edita: true },
    { k: 'fec', b: 'his', nome: 'FEC/100 km', curto: 'FEC', lim: [0.006, 0.06, 0.6], passo: 0.001, zero: 'nenhum', edita: true },
    // Lente de imagem da planilha (aba Lente de imagem): risco de imagem do alimentador, 1 a 4 (4 = maior); sem lente não pontua
    { k: 'img', b: 'imp', nome: 'Lente de imagem', curto: 'Lente', rot: ['1', '2', '3', '4'], zero: 'sem dado' },
    { k: 'cli', b: 'imp', nome: 'Clientes (UCs ligadas)', curto: 'Clientes', lim: [10, 100, 1000], passo: 1, inteiro: true },
    { k: 'hier', b: 'imp', nome: 'Hierarquia do trecho', curto: 'Hierarquia', rot: ['T1', 'T2', 'T3'] },
    { k: 'ga', b: 'imp', nome: 'Cliente Grupo A', curto: 'Grupo A', rot: ['tem'], zero: 'não tem ou sem dado' },
    { k: 'limp', b: 'man', nome: 'Limpeza de faixa', curto: 'Limpeza', rot: ['vencida', 'vence em breve', 'sem registro'], zero: 'em dia' },
  ];
  const BLOCOS = [
    { k: 'imp', nome: 'Impacto', cor: 'var(--c-imp)' },
    { k: 'his', nome: 'Histórico', cor: 'var(--c-his)' },
    { k: 'man', nome: 'Limpeza de faixa', cor: 'var(--c-man)' },
  ];
  // pontos por faixa (inteiros), na ordem das faixas de CRIT; cada perfil soma 100 nos máximos.
  // Padrão: premissas do Ranking de faixa (planilha RANKING_FAIXA_APP, 16/11/2026). Na planilha a nota é DEC 30% + NAE 30% +
  // FEC 20% + Lente de imagem 10% + Lente de Meio Ambiente 10%; sem a de Meio Ambiente (e a de Segurança), reescalados: 33, 33,
  // 22 e 12; os pontos de cada faixa são os do padrão anterior na mesma proporção, arredondados (NAE 5/10/15/20 × 1,65 =
  // 8/17/25/33, DEC 5/10/15 × 2,2 = 11/22/33, FEC 3/5/8/10 × 2,2 = 7/11/18/22). Clientes, Hierarquia, Grupo A e Limpeza: 0
  // no padrão (editáveis).
  // Pré-chuva e Plano climático: os perfis anteriores, mantidos como opção (Lente 0). Neles a limpeza "sem registro" (nenhuma
  // OS efetiva) vale metade dos pontos de vencida, porque falta de OS não prova vencimento
  const VERSAO = 'ranking-faixa-2026-11-16';   // gravada nas validações: as anteriores não têm (metodologia de antes de 16/11)
  const PERFIS = {
    padrao: { nome: 'Padrão', t: { nae: [8, 17, 25, 33], dec: [11, 22, 33], fec: [7, 11, 18, 22], img: [3, 6, 9, 12], cli: [0, 0, 0, 0], hier: [0, 0, 0], ga: [0], limp: [0, 0, 0] } },
    prechuva: { nome: 'Pré-chuva (set–nov)', t: { nae: [5, 10, 15, 20], dec: [3, 5, 10], fec: [3, 5, 8, 10], img: [0, 0, 0, 0], cli: [3, 5, 10, 15], hier: [10, 5, 3], ga: [5], limp: [30, 15, 15] } },
    clima: { nome: 'Plano climático', t: { nae: [5, 10, 15, 25], dec: [5, 10, 20], fec: [3, 5, 8, 10], img: [0, 0, 0, 0], cli: [3, 5, 10, 15], hier: [10, 5, 3], ga: [5], limp: [15, 8, 8] } },
  };

  // referência padrão: o último dia com ocorrência nos dados (D.oc_ate, 09/11/2026); a janela de 12 meses (U12M) conta dela
  function parametrosPadrao(D) {
    const dd = D || (typeof window !== 'undefined' && window.DADOS) || null;
    return {
      ref: (dd && dd.oc_ate) || '2026-11-09', janela: 12, cobEfetiva: 0.5, cobBloqueio: 0.8,
      carencia: { 1: 6, 2: 9, 3: 12 }, ciclo: { 1: 3, 2: 4, 3: 5 }, aVencer: 3,
      lim: { p1: 70, p2: 50, p3: 30 }, planoPolos: [], bonus: 8, pisoKm: 5,
      t1Anos: 3,   // regra F5: T1 sem limpeza efetiva há mais que isso (ou sem registro) vai a P1 e ao topo
      fx: Object.fromEntries(CRIT.filter((c) => c.edita).map((c) => [c.k, c.lim.slice()])),   // limites de faixa editáveis (DEC e FEC)
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
  const fmtP = (x) => nfP.format(x);   // pontos e nota: 0,25 · 1,5 · 7
  const fmtD = (x) => nfD.format(x);
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKm = (x) => (x < 1 ? nf2.format(x) : nf1.format(x));
  const pct = (x) => nf0.format(Math.round(x * 100)) + '%';
  const qtd = (n, um, muitos) => fmtN(n) + ' ' + (n === 1 ? um : muitos);
  // medida por 100 km como aparece no extrato: cortada (não arredondada) na casa mostrada, para bater com a faixa
  const corta = (x, casas) => Math.floor(x * 10 ** casas + 1e-9) / 10 ** casas;
  const mostra = (x) => (x >= 100 ? fmtN(corta(x, 0)) : x >= 1 ? fmtD(corta(x, 1)) : x >= 0.01 ? fmtP(corta(x, 2)) : x >= 0.001 ? nf3.format(corta(x, 3)) : 'menos de 0,001');
  const meses = (n) => n + (n === 1 ? ' mês' : ' meses');

  function quantil(arr, q) {
    if (!arr.length) return 0;
    const a = Float64Array.from(arr).sort();
    const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }

  // faixa do valor x no critério c (índice na tabela de pontos); -1 = valor 0, não pontua
  const limDe = (c, P) => (P && P.fx && P.fx[c.k]) || c.lim;
  function faixaDe(c, x, P) {
    if (!(x > 0)) return -1;
    const L = limDe(c, P);
    let j = 0;
    while (j < L.length && x + 1e-9 >= L[j]) j++;   // 1e-9: conta de ponto flutuante que dá 39,999… vale 40
    return j;
  }
  // nome da faixa j: "menos de 20", "20 a 39,9", "60 ou mais"; contagem inteira: "1 a 9", "10 a 99", "1.000 ou mais"
  function rotFaixa(c, j, P) {
    if (c.k === 'limp' && j === 1) return 'vence em até ' + meses(P.aVencer);
    if (c.rot) return c.rot[j];
    // limites editáveis (DEC e FEC) com até 4 casas; NAE com 1 casa; contagens inteiras
    const L = limDe(c, P), f = (x) => (c.edita ? nf4.format(x) : c.passo < 1 ? fmtD(x) : fmtN(x));
    if (j === 0) return c.inteiro ? '1 a ' + f(L[0] - 1) : 'menos de ' + f(L[0]);
    if (c.edita && j < L.length) return f(L[j - 1]) + ' a menos de ' + f(L[j]);   // qualquer limite editado, sem "0,0599"
    if (j < L.length) return f(L[j - 1]) + ' a ' + f(Math.round((L[j] - c.passo) * 10) / 10);
    return f(L[j - 1]) + ' ou mais';
  }
  const maxDe = (T, k) => Math.max(0, ...T[k]);
  const notaMax = (T) => CRIT.reduce((s, c) => s + maxDe(T, c.k), 0);
  // desempate entre notas iguais: mais ocorrências por 100 km, depois mais DEC por 100 km, depois o trecho mais longo
  const cmpNota = (a, b) => b.score - a.score || b.f.n100 - a.f.n100 || b.f.dec100 - a.f.dec100 || b.t.km - a.t.km;

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
      let ult = null, bloq = null, cart = null, parcial = null;
      for (const [d, s, f, cod] of t.os) {
        if (d > ref) continue;
        if (s === 1) {
          if (f >= P.cobEfetiva && (ult === null || d > ult)) ult = d;
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
      return { ult, parcial, bloq, cart, n, dec, fec, nSem, nExp, nJan, n90, posBloq, meses: meses.size, cliMax, usadas };
    });
    // por 100 km do trecho. Trecho mais curto que P.pisoKm (padrão 5 km) conta como P.pisoKm: a mediana dos trechos tem 0,21 km e,
    // sem esse mínimo, um trecho curtinho com uma só ocorrência passaria o tronco
    const kmConta = (t) => Math.max(P.pisoKm, t.km);
    F.forEach((f, i) => {
      const km = kmConta(ctx.trechos[i]);
      f.n100 = (f.n * 100) / km; f.dec100 = (f.dec * 100) / km; f.fec100 = (f.fec * 100) / km;
    });
    // DEC e FEC sem dado: sem o arquivo por ocorrência, ou com todas as ocorrências que contam não achadas na Crítica
    const semDfc = (f, t) => !ctx.dfc || (f.n > 0 && f.nSem === f.n) || (t.oc.length > 0 && t.dfc && !t.dfc.length);

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
      const f = F[i], eGA = ga.has(t.i), ePlano = plano.has(t.reg) || noPlano.has(t.i);
      // UCs ligadas dos trafos do trecho e dos que saem dele (planilha UC por trafo); alimentador sem a planilha usa os clientes
      // por evento da Crítica. Trecho que não está na planilha do seu alimentador fica "sem dado" (0 pontos), não "0 UCs"
      const ucAl = ctx.ucs && ctx.ucs[t.al], uc = ucAl ? ucAl[t.n] || null : null;
      // situação da limpeza de faixa: vence na última limpeza efetiva + ciclo da classe (T1 3, T2 4, T3 5 anos).
      // Sem limpeza efetiva registrada é "sem registro": não há data para vencer, então não se inventa vencimento
      const semReg = f.ult === null;
      const vence = semReg ? null : Math.round(f.ult + P.ciclo[t.c] * 365.25), faltam = semReg ? 0 : vence - ref;
      const vencida = !semReg && faltam < 0, aVencer = !semReg && !vencida && faltam <= P.aVencer * 30.44;
      const situacao = semReg ? 'sem registro' : vencida ? 'vencida' : aVencer ? 'vence em até ' + meses(P.aVencer) : 'em dia';
      const limpeza = { situacao, vence, vencida, aVencer, semReg };

      // valor de cada critério no trecho: x (medida), j (faixa; -1 = não pontua), st (real, est = estimado, falta = sem dado).
      // O texto do extrato (dado e obs) só é montado quando a ficha ou a justificativa pede (textos), para a abertura ser rápida
      const sem = semDfc(f, t);
      const v = {
        nae: { x: f.n100, st: 'real' },
        dec: { x: f.dec100, st: sem ? 'falta' : 'real' },
        fec: { x: f.fec100, st: sem ? 'falta' : 'real' },
        // Lente de imagem do alimentador (1 a 4): a faixa é a própria nota; sem lente, sem dado (não pontua)
        img: t.lente ? { x: t.lente, j: t.lente - 1, st: 'real' } : { x: 0, j: -1, st: 'falta' },
        cli: uc ? { x: uc[1], st: 'real', uc } : ucAl ? { x: 0, st: 'falta', fora: true }
          : f.cliMax > 0 ? { x: f.cliMax, st: 'real' } : { x: med.cli[t.c], st: 'est' },
        hier: { j: t.c - 1, st: 'real' },
        ga: eGA ? { j: 0, st: 'real' } : { j: -1, st: 'falta' },
        limp: { j: semReg ? 2 : vencida ? 0 : aVencer ? 1 : -1, st: semReg ? 'est' : 'real' },
      };
      for (const k of ['nae', 'dec', 'fec', 'cli']) v[k].j = faixaDe(C[k], v[k].x, P);

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
      // F5 (Ranking de faixa, 16/11/2026): T1 com a última limpeza efetiva (OS executada cobrindo ≥ P.cobEfetiva do trecho) há
      // mais de P.t1Anos anos da referência, ou sem limpeza efetiva registrada, fica no mínimo P1 e vai ao topo do ranking (entre
      // si, pela nota). OS parcial (abaixo de P.cobEfetiva) não conta como limpeza efetiva; o texto diz a última, se houver.
      // T1 com menos de 0,5 km (o corte do Q4) é sinalizado: pode não ter faixa a limpar (a regra não tem piso de km)
      const topo = t.c === 1 && (f.ult === null || ref - f.ult > P.t1Anos * 365.25);
      if (topo) {
        piso = 1;
        const curto = t.km < 0.5 ? '; trecho de ' + fmtN(t.km * 1000) + ' m: confirmar se há faixa a limpar' : '';
        regras.push({ id: 'F5', tipo: 'piso', txt: (f.ult === null ? 'T1 sem limpeza efetiva registrada (nenhuma OS executada cobrindo ≥ ' + pct(P.cobEfetiva) + ' do trecho' + (f.parcial ? '; a última parcial, em ' + dataDe(ctx, f.parcial.d) + ', cobriu ' + pct(f.parcial.f) : '') + ')' : 'T1 com a última limpeza efetiva em ' + dataDe(ctx, f.ult) + ', há mais de ' + fmtP(P.t1Anos) + (P.t1Anos === 1 ? ' ano' : ' anos')) + ': mínimo P1 e topo do ranking' + curto });
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
      const confR = conf / Mtot;
      if (confR < 0.6 && faixa <= 2) regras.push({ id: 'Q1', tipo: 'alerta', txt: 'Confiança ' + fmt1(10 * confR) + ' de 10: confirmar em inspeção antes de programar' });
      if (t.km < 0.5 && f.nJan > 0) regras.push({ id: 'Q4', tipo: 'alerta', txt: 'Trecho curto (' + fmtN(t.km * 1000) + ' m) com ' + qtd(f.nJan, 'ocorrência', 'ocorrências') + ': confirmar o local da falha antes de programar' });
      if (t.cf === 'revisar') regras.push({ id: 'Q3', tipo: 'alerta', txt: 'Segmentação deste trecho está marcada para revisão no cadastro' });
      if (ctx.excecao.has(t.al)) regras.push({ id: 'Q5', tipo: 'alerta', txt: 'Alimentador dividido por exceção em 16/10/2026 (GIS sem as chaves fechadas): poucos trechos e longos, a NAE por trecho é pouco confiável; confirmar em campo' });
      return { t, f, v, pts, situacao, limpeza, score, segs, bonus, CH, UA, conf: confR, faixa, fScore, piso, fila, status, regras, topo };
    });
    const ordemStatus = { 'Elegível': 0, 'Em carteira': 1, 'Executado recentemente': 2 };
    // T1 da regra F5 antes de todos os demais (dentro da mesma situação), depois faixa e nota
    const ranked = res.slice().sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status] || b.topo - a.topo || a.faixa - b.faixa || cmpNota(a, b));
    let k = 0;
    for (const r of ranked) r.pos = r.status === 'Elegível' ? ++k : null;
    return { res, ranked, med, ref, M, Mtot, per };
  }

  // texto do extrato da ficha (dado e obs de cada critério) e da limpeza; montado sob demanda e guardado no próprio resultado
  function textos(ctx, r, P) {
    if (r.txt) return r.txt;
    const t = r.t, f = r.f, v = r.v, L = r.limpeza;
    const kmTxt = nf2.format(t.km) + ' km' + (t.km < P.pisoKm ? ' (conta ' + fmtD(P.pisoKm) + ' km)' : '');
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
      nae: [f.n ? qtd(f.n, 'ocorrência', 'ocorrências') + ' em ' + kmTxt + ' = ' + mostra(f.n100) + ' por 100 km' : 'nenhuma ocorrência',
        [prot ? fmtN(prot) + ' de ' + fmtN(f.n) + ' por disjuntor ou religador: defeito em ponto desconhecido da zona' : '',
          antes ? qtd(antes, 'ocorrência anterior', 'ocorrências anteriores') + ' à última limpeza não ' + (antes === 1 ? 'conta' : 'contam') : ''].filter(Boolean).join(' · ')],
      dec: [!ctx.dfc ? 'sem dado: DEC por ocorrência não carregado' : semD && f.n ? 'sem dado na Crítica' : f.dec > 0 ? fmtH(f.dec) + ' h de DEC do conjunto = ' + mostra(f.dec100) + ' por 100 km' : f.n ? 'nenhuma contribuição no DEC' : 'nenhuma ocorrência', obsDF('DEC')],
      fec: [!ctx.dfc ? 'sem dado: FEC por ocorrência não carregado' : semD && f.n ? 'sem dado na Crítica' : f.fec > 0 ? fmtH(f.fec) + ' interrupções de FEC do conjunto = ' + mostra(f.fec100) + ' por 100 km' : f.n ? 'nenhuma contribuição no FEC' : 'nenhuma ocorrência', obsDF('FEC')],
      img: [t.lente ? 'nota ' + t.lente + ' de 4 no ' + t.al : ctx.img ? 'sem dado: alimentador sem Lente de imagem na planilha' : 'sem dado: Lente de imagem não carregada',
        t.lente ? 'risco de imagem do alimentador (planilha RANKING_FAIXA_APP, aba Lente de imagem); 4 = maior' : ''],
      cli: [cli, ''],
      hier: ['T' + t.c + (t.c === 1 ? ' (tronco)' : ' (ramal)'), ''],
      ga: [v.ga.j === 0 ? 'tem (marcado neste teste)' : 'sem dado na base', ''],
      limp: [L.semReg ? 'sem registro de limpeza efetiva' : (L.vencida ? 'vencida em ' : L.aVencer ? 'vence em ' : 'em dia, vence em ') + dataDe(ctx, L.vence), origem + (L.semReg ? '' : ' · ' + ciclo)],
    };
    r.txt = { d, origem, prot };
    return r.txt;
  }

  function justificar(ctx, r, P, T) {
    const t = r.t, f = r.f, partes = [];
    partes.push(t.id + ' (T' + t.c + ', ' + fmtKm(t.km) + ' km, ' + t.mun + ', regional ' + t.reg + ', polo ' + t.polo + ').');
    partes.push('Prioridade P' + r.faixa + ' com nota ' + fmtP(r.score) + ' de ' + fmtP(notaMax(T)) + '.');
    if (r.faixa < r.fScore) partes.push('A nota sozinha daria P' + r.fScore + '; a faixa subiu por regra.');
    const lin = CRIT.filter((c) => r.pts[c.k] > 0).map((c) => c.curto + ' ' + fmtP(r.pts[c.k]) + ' (' + (c.k === 'img' ? 'nota ' : '') + rotFaixa(c, r.v[c.k].j, P) + (r.v[c.k].st === 'est' && c.k === 'cli' ? ', típico de T' + t.c : '') + ')');
    if (r.bonus > 0) lin.push('plano climático ' + fmtP(r.bonus));
    partes.push(lin.length ? 'Pontos: ' + lin.join('; ') + '.' : 'Nenhum critério pontuou.');
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

  return { CRIT, BLOCOS, PERFIS, VERSAO, parametrosPadrao, preparar, avaliar, textos, periodo, deProtecao, justificar, pacotes, retroativo, faixaDe, rotFaixa, maxDe, notaMax, dataDe, diaDe, fmtN, fmt1, fmtP, fmtD, fmtH, fmtKm, pct, qtd };
})();
if (typeof module !== 'undefined') module.exports = VERA;


'use strict';
(() => {
  const V = VERA, D = window.DADOS, ctx = V.preparar(D);   // window.UCS_TRECHOS (dados/ucs-trechos.js) alimenta os clientes por trecho
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { fmtN, fmt1, fmtP, fmtD, fmtH, fmtKm, pct, qtd } = V;
  // validações gravadas no navegador: a chave é a mesma desde o início. As anteriores a 16/11/2026 não têm a versão da
  // metodologia (nem a Lente de imagem nos pontos); só a decisão, o motivo, a data e a nota são lidos de volta, e o que vier
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
  // tabela editada: pontos diferentes do perfil ou limites de faixa (DEC e FEC) diferentes do padrão
  const editada = () => JSON.stringify(S.T) !== JSON.stringify(V.PERFIS[S.perfil].t) || JSON.stringify(S.P.fx) !== JSON.stringify(V.parametrosPadrao(D).fx);
  const S = {
    perfil: 'padrao', T: clonaT(V.PERFIS.padrao.t), P: V.parametrosPadrao(D),
    flags: { ga: new Set(), plano: new Set() },
    f: { reg: 'todos', polo: 'todos', mun: 'todos', busca: '', tipo: 'todos', zona: 'todos', sol: 'todos', faixa: null, ocultos: false },
    out: null, sel: null,
    pk: { polo: 'NORTE', raio: 10, cap: 20, limAprov: 30, scoreMin: 30, fator: 1.4, max: 12 },
  };
  const REGIONAIS = ['NORTE', 'CENTRO', 'SUL', 'Sem regional'];   // a[3] do alimentador; o polo é a equipe (a[4])
  const POLO_NOME = { 'ETO-RD-AR': 'Araguaína', 'ETO-RD-AG': 'Augustinópolis', 'ETO-RD-GR': 'Guaraí', 'ETO-RD-PA': 'Palmas', 'ETO-RD-PS': 'Paraíso', 'ETO-RD-PO': 'Porto Nacional', 'ETO-RD-GU': 'Gurupi', 'ETO-RD-DP': 'Dianópolis' };
  const poloTxt = (p) => (POLO_NOME[p] ? POLO_NOME[p] + ' (' + p + ')' : p);
  const temUrb = !!ctx.urb;
  const gaveta = matchMedia('(max-width:860px)');   // celular: a ficha do trecho abre por cima da página

  // ---------- controles ----------
  const perfilSel = $('#perfil');
  for (const [k, p] of Object.entries(V.PERFIS)) perfilSel.add(new Option(p.nome, k));
  // o padrão segue a planilha do Ranking de faixa; os perfis sazonais ficam como opção
  function dicaPerfil() {
    const m = Number(S.P.ref.slice(5, 7)), refBr = S.P.ref.split('-').reverse().join('/');
    $('#perfil-dica').textContent = 'Padrão: premissas do Ranking de faixa (planilha RANKING_FAIXA_APP, 16/11/2026). Pré-chuva e Plano climático são opções' + (m >= 9 && m <= 11 ? '; ' + refBr + ' está no pré-chuva.' : '.');
    $('#pz-tit').title = 'Limpeza de faixa · referência ' + refBr;
  }
  $('#ref').value = S.P.ref;
  const regSel = $('#f-reg'), poloSel = $('#f-polo');
  regSel.add(new Option('Todas', 'todos'));
  REGIONAIS.forEach((p) => regSel.add(new Option(p === 'Sem regional' ? p : p[0] + p.slice(1).toLowerCase(), p)));
  // o polo lista só os da regional escolhida (pares regional/polo que existem nos trechos)
  const poloPorReg = {};
  for (const t of ctx.trechos) (poloPorReg[t.reg] = poloPorReg[t.reg] || new Set()).add(t.polo);
  function listaPolos() {
    const ps = new Set();
    for (const [r, set] of Object.entries(poloPorReg)) if (S.f.reg === 'todos' || S.f.reg === r) set.forEach((p) => ps.add(p));
    const l = [...ps].sort((a, b) => (a === 'Sem polo') - (b === 'Sem polo') || a.localeCompare(b, 'pt-BR'));
    poloSel.length = 0;
    poloSel.add(new Option('Todos', 'todos'));
    l.forEach((p) => poloSel.add(new Option(poloTxt(p), p)));
    if (!ps.has(S.f.polo)) S.f.polo = 'todos';
    poloSel.value = S.f.polo;
  }
  listaPolos();
  const munSel = $('#f-mun');
  munSel.add(new Option('Todos', 'todos'));
  [...new Set(ctx.trechos.map((t) => t.mun))].filter((m) => m !== '—').sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((m) => munSel.add(new Option(m, m)));
  const pkPolo = $('#pk-polo');
  pkPolo.add(new Option('Todos', 'todos'));
  REGIONAIS.forEach((p) => pkPolo.add(new Option(p, p)));
  $('#plano-polos').innerHTML = REGIONAIS.map((p) => '<label><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>').join('');

  const corGrupo = (c) => V.BLOCOS.find((b) => b.k === c.b).cor;
  const pontos = (p) => fmtP(p) + (p > 0 && p < 2 ? ' ponto' : ' pontos');
  // como cada critério é medido: uma linha abaixo do nome, na tabela de pontos
  const per = () => V.periodo(ctx, S.P).txt;   // período real das ocorrências (Crítica) dentro da janela de 12 meses
  // critério com 0 em todas as faixas (no padrão: Clientes, Hierarquia, Grupo A e Limpeza): fica na tabela, editável
  const zero = (k) => (V.maxDe(S.T, k) > 0 ? '' : ' Nesta tabela vale 0: fora da nota, mas editável.');
  const semDF = ctx.dfc ? '' : ' Base de DEC e FEC por ocorrência não carregada: o critério fica sem dado.';
  const REGRA = {
    nae: () => 'Ocorrências por vegetação de ' + per() + ' depois da última limpeza, por 100 km do trecho. Trecho com menos de ' + fmtD(S.P.pisoKm) + ' km conta como ' + fmtD(S.P.pisoKm) + ' km: cada ocorrência vale ' + fmtD(100 / S.P.pisoKm) + '.' + zero('nae'),
    dec: () => 'Contribuição das ocorrências no DEC do conjunto ANEEL (horas), pela Crítica: soma, nas ocorrências de ' + per() + ' depois da última limpeza, das horas que cada uma pesa no DEC, por 100 km do trecho. O que o PRODIST não conta (momentânea, dia crítico etc.) e a expurgada como situação de emergência entram com 0; ocorrência sem dado na Crítica conta 0 e o extrato avisa.' + semDF + zero('dec'),
    fec: () => 'Contribuição das ocorrências no FEC do conjunto ANEEL (interrupções), pela Crítica: soma, nas mesmas ocorrências, das interrupções que cada uma pesa no FEC, por 100 km do trecho. Momentânea, dia crítico e expurgada (situação de emergência) entram com 0.' + semDF + zero('fec'),
    img: () => 'Risco de imagem do alimentador, de 1 a 4 (4 = maior), da planilha do Ranking de faixa (aba Lente de imagem): vale para todos os trechos do alimentador. Alimentador sem lente fica sem dado (0 pontos).' + (ctx.img ? '' : ' Lente de imagem não carregada.') + zero('img'),
    cli: () => {
      const m = S.out && S.out.med.cli;
      if (ctx.ucs) return 'UCs ligadas nos transformadores do trecho e dos trechos que saem dele (planilha UC por trafo): quem um evento no trecho pode deixar sem energia. Alimentador fora da planilha usa os clientes do maior evento de ' + per() + ', e trecho sem evento, o típico da classe. Trecho que não está na planilha do alimentador fica sem dado (0 pontos).' + zero('cli');
      return 'Clientes desligados no maior evento de ' + per() + '. Trecho sem evento, ou só com eventos sem clientes registrados, usa o típico da classe' + (m ? ' (T1 ' + fmtN(m[1]) + ', T2 ' + fmtN(m[2]) + ', T3 ' + fmtN(m[3]) + ')' : '') + '.' + zero('cli');
    },
    hier: () => 'Classe do trecho: tronco (T1) ou ramal (T2, T3).' + zero('hier'),
    ga: () => 'Cliente Grupo A (média tensão) no trecho. Ainda não há cadastro na base: só pontua quando marcado na ficha do trecho' + (V.maxDe(S.T, 'ga') > 0 ? ', então hoje a nota máxima alcançável é ' + fmtP(V.notaMax(S.T) - V.maxDe(S.T, 'ga')) + '.' : '; a regra F2 (mínimo P2) vale do mesmo jeito.') + zero('ga'),
    limp: () => 'Última limpeza efetiva + ciclo da classe (T1 ' + S.P.ciclo[1] + ', T2 ' + S.P.ciclo[2] + ', T3 ' + S.P.ciclo[3] + ' anos; regra interna, sem estudo de crescimento publicado). Sem registro: nenhuma OS executada cobrindo ≥ 50% do trecho desde ' + V.dataDe(ctx, ctx.osInicio) + '; não há data de vencimento. O T1 com a última limpeza efetiva há mais de ' + fmtP(S.P.t1Anos) + (S.P.t1Anos === 1 ? ' ano' : ' anos') + ', ou sem limpeza efetiva registrada, vai ao topo pela regra F5 (OS parcial não conta).' + zero('limp'),
  };
  // tabela de pontos: uma linha por critério, com os pontos de cada faixa de valor editáveis
  function desenharPontos() {
    $('#pontos').innerHTML = V.CRIT.map((c) => {
      const fx = S.T[c.k].map((p, j) => {
        const rot = V.rotFaixa(c, j, S.P);
        return '<label class="fx"><span>' + esc(rot) + '</span><input type="number" data-k="' + c.k + '" data-j="' + j + '" min="0" max="100" step="0.5" value="' + p + '" aria-label="' + esc(c.nome + ', ' + rot + ': pontos') + '"></label>';
      }).join('');
      // DEC e FEC: os limites que separam as faixas também são editáveis
      const lim = c.edita ? '<div class="pt-lim"><span>Limites das faixas</span>' + (S.P.fx[c.k]).map((x, j) =>
        '<input type="number" data-lim="' + c.k + '" data-j="' + j + '" min="0" step="any" value="' + x + '" aria-label="' + esc(c.nome + ': limite ' + (j + 1) + ' (começo da faixa ' + (j + 2) + ')') + '">').join('') + '</div>' : '';
      return '<div class="pt-crit"><div class="pt-nome"><span class="amostra" style="background:' + corGrupo(c) + '"></span><b>' + esc(c.nome) + '</b><span class="pt-max" id="max-' + c.k + '"></span>' +
        '<p class="pt-regra" id="regra-' + c.k + '"></p></div><div class="pt-faixas">' + (c.zero ? '<span class="fx zero"><span>' + esc(c.zero) + '</span><b>0</b></span>' : '') + fx + lim + '</div></div>';
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
    const cN = V.CRIT[0];   // NAE: o critério de maior peso no padrão
    $('#pt-exemplo').textContent = 'por exemplo, NAE de ' + V.rotFaixa(cN, 1, S.P) + ' por 100 km vale ' + pontos(S.T.nae[1]) + ' e de ' + V.rotFaixa(cN, 2, S.P) + ' vale ' + pontos(S.T.nae[2]);
    $('#pt-total').classList.toggle('alerta', !ok);
    const av = $('#aviso-pontos');
    av.hidden = ok;
    if (!ok) av.textContent = 'Os máximos somam ' + fmtP(tot) + (tot > 100 ? ': a nota pode passar de 100' : ': nenhum trecho chega a 100') + '. Ajuste os pontos para somar 100.';
  }
  function preencherParams() {
    $('#p-avenc').value = S.P.aVencer;
    $('#p-cob').value = S.P.cobBloqueio; $('#p-car').value = [1, 2, 3].map((c) => fmtP(S.P.carencia[c])).join(' / ');
    $('#p-bonus').value = S.P.bonus;
    for (const k of ['p1', 'p2', 'p3']) if (document.activeElement !== $('#c-' + k)) $('#c-' + k).value = S.P.lim[k];
    $('#p-piso').value = S.P.pisoKm;
    $('#p-t1').value = S.P.t1Anos;
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
    atualizarRegras(); textoRecorte(); linhaRef();
    for (const r of S.out.ranked) r.mov = r.pos && antes.has(r.t.i) ? antes.get(r.t.i) - r.pos : r.pos && antes.size ? 'novo' : 0;
    renderRanking(true);
    if (S.sel !== null) abrirFicha(S.sel, true);
    if ($('#sec-pacotes').open) renderPacotes();
    retroPendente = true;
    if ($('#sec-dados').open) renderRetro();
  };

  function aplicarPerfil() {
    S.T = clonaT(V.PERFIS[S.perfil].t);
    S.P.fx = clonaT(V.parametrosPadrao().fx);
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
  $('#pontos').addEventListener('change', (e) => {
    const d = e.target.dataset;
    if (d.k) { e.target.value = S.T[d.k][Number(d.j)]; return; }
    if (!d.lim) return;
    // limite de faixa: tem de ficar entre o anterior e o seguinte; senão volta ao valor que valia
    const L = S.P.fx[d.lim], j = Number(d.j), v = Number(String(e.target.value).replace(',', '.'));
    if (e.target.value !== '' && isFinite(v) && v > (j ? L[j - 1] : 0) && (j === L.length - 1 || v < L[j + 1])) { L[j] = v; agendar(); }
    desenharPontos();
  });
  $('#ref').addEventListener('change', (e) => { if (e.target.value) { S.P.ref = e.target.value; dicaPerfil(); agendar(); } else e.target.value = S.P.ref; });
  regSel.addEventListener('change', () => { S.f.reg = regSel.value; listaPolos(); renderRanking(); });
  poloSel.addEventListener('change', () => { S.f.polo = poloSel.value; renderRanking(); });
  $('#f-tipo').addEventListener('change', (e) => { S.f.tipo = e.target.value; renderRanking(); });
  $('#f-zona').addEventListener('change', (e) => { S.f.zona = e.target.value; renderRanking(); });
  if (!temUrb) { const z = $('#f-zona'); z.disabled = true; z.title = 'Sem a base de área urbanizada (dados/urbano-trechos.js): filtro indisponível'; $('#aviso-zona').hidden = false; }
  $('#f-sol').addEventListener('change', (e) => { S.f.sol = e.target.value; renderRanking(); });
  if (!ctx.sol) { const z = $('#f-sol'); z.disabled = true; z.title = 'Sem a base de solicitações (dados/solicitacoes-trechos.js): filtro indisponível'; }
  munSel.addEventListener('change', () => { S.f.mun = munSel.value; renderRanking(); });
  let tmrBusca = null;
  $('#f-busca').addEventListener('input', (e) => { S.f.busca = e.target.value.trim().toUpperCase(); clearTimeout(tmrBusca); tmrBusca = setTimeout(renderRanking, 160); });
  $('#f-ocultos').addEventListener('change', (e) => { S.f.ocultos = e.target.checked; renderRanking(); });
  $('#plano-polos').addEventListener('change', () => { S.P.planoPolos = [...document.querySelectorAll('#plano-polos input:checked')].map((i) => i.value); agendar(); });
  const numParam = (id, fn) => $(id).addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (e.target.value !== '' && !isNaN(v)) { fn(v); agendar(); }
    preencherParams();
  });
  numParam('#p-piso', (v) => { S.P.pisoKm = Math.min(50, Math.max(0.5, v)); atualizarRegras(); });
  numParam('#p-t1', (v) => { S.P.t1Anos = Math.min(20, Math.max(0.5, v)); atualizarRegras(); });
  numParam('#p-avenc', (v) => { S.P.aVencer = Math.min(12, Math.max(1, Math.round(v))); desenharPontos(); });
  numParam('#p-cob', (v) => { S.P.cobBloqueio = Math.min(1, Math.max(0.1, v)); });
  numParam('#p-bonus', (v) => { S.P.bonus = Math.max(0, v); });
  // texto ilegível volta ao valor anterior (o campo é reescrito); cortes em qualquer ordem viram P1 ≥ P2 ≥ P3
  $('#p-car').addEventListener('change', (e) => { const p = tres(e.target.value); if (p) { S.P.carencia = { 1: p[0], 2: p[1], 3: p[2] }; agendar(); } preencherParams(); });
  // cortes das faixas (nota mínima de P1, P2 e P3; P4 é o resto): valem na hora; ao sair do campo viram P1 ≥ P2 ≥ P3
  for (const k of ['p1', 'p2', 'p3']) {
    $('#c-' + k).addEventListener('input', (e) => {
      const v = Number(String(e.target.value).replace(',', '.'));
      if (e.target.value === '' || !isFinite(v)) return;
      S.P.lim[k] = Math.min(100, Math.max(0, v)); agendar();
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
    $('#pz-ref').innerHTML = ['Referência <b>' + refBr + '</b>', 'Tabela <b>' + esc(V.PERFIS[S.perfil].nome) + (editada() ? ' editada' : '') + '</b>',
      'NAE e DEC/FEC <b>' + esc(pe.cob) + '</b>', 'OS de <b>' + (osData || '—') + '</b>', 'Trechos de <b>' + segData + '</b>'].map((x) => '<span>' + x + '</span>').join('');
    const lac = pe.lacuna, el = $('#pz-lacuna');
    const avisos = (lac.length ? ['As ocorrências param em ' + pe.fimTxt + ': os critérios de histórico recente (NAE, DEC, FEC, F1 de 90 dias e F4) não enxergam ' + (lac[0] === lac[1] ? lac[0] : 'de ' + lac[0] + ' a ' + lac[1]) + '. Sem evento recente pode ser falta de dado.'] : []).concat(pe.avisos);
    el.hidden = !avisos.length;
    el.textContent = avisos.join(' ');
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
      if (f.reg !== 'todos' && t.reg !== f.reg) return false;
      if (f.polo !== 'todos' && t.polo !== f.polo) return false;
      if (f.mun !== 'todos' && t.mun !== f.mun) return false;
      if (f.tipo === 'tronco' ? t.c !== 1 : f.tipo === 'ramal' ? t.c === 1 : f.tipo !== 'todos' && t.c !== Number(f.tipo)) return false;
      if (temUrb && f.zona !== 'todos' && (t.urb >= ctx.urbCorte) !== (f.zona === 'urbano')) return false;
      if (ctx.sol && f.sol !== 'todos' && !!t.sol !== (f.sol === 'com')) return false;
      if (f.busca && !t.id.toUpperCase().includes(f.busca)) return false;
      if (!semFaixa && f.faixa && r.faixa !== f.faixa) return false;
      return true;
    });
  }
  // a lista desenha PASSO linhas por vez e diz quantas mostra: desenhar os milhares de trechos de uma vez trava a página
  const PASSO = 100;
  let mostrar = PASSO, listaAtual = [];
  // marca discreta abaixo do trecho: T1 no topo pela regra F5 e solicitações de limpeza (planilha do Ranking de faixa).
  // "Efetiva" = OS executada cobrindo ≥ 50% do trecho; com OS só parcial, a marca diz (a ficha lista as OS)
  const marcaF5 = (r) => (r.f.ult === null ? 'T1 sem limpeza efetiva registrada' + (r.f.parcial ? ' (só OS parcial)' : '') : 'T1 com limpeza efetiva há mais de ' + fmtP(S.P.t1Anos) + (S.P.t1Anos === 1 ? ' ano' : ' anos'));
  function linha(r) {
    const t = r.t;
    const mv = r.mov === 'novo' ? '<span class="mov sobe">novo</span>' : r.mov > 0 ? '<span class="mov sobe">▲ ' + r.mov + '</span>' : r.mov < 0 ? '<span class="mov desce">▼ ' + -r.mov + '</span>' : '';
    const marcas = [r.topo ? marcaF5(r) : '', t.sol ? qtd(t.sol.length, 'solicitação', 'solicitações') : ''].filter(Boolean);
    return '<tr data-i="' + t.i + '" tabindex="0"' + (S.sel === t.i ? ' class="sel"' : '') + '>' +
      '<td class="r num muted">' + (r.pos ?? '—') + mv + '</td>' +
      '<td><span class="trecho-id">' + esc(t.id) + '</span>' + (marcas.length ? '<span class="sub pz-marca">' + esc(marcas.join(' · ')) + '</span>' : '') + '</td>' +
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
      '<button type="button" class="tile' + (S.f.faixa === n ? ' on' : '') + '" data-faixa="' + n + '" aria-pressed="' + (S.f.faixa === n) + '"><span class="t f' + n + '"><span class="ponto"></span>' + nomes[n] + '</span><span class="v">' + fmtN(cont[n][0]) + '</span></button>').join('');
    listaAtual = lista;
    $('#corpo').innerHTML = lista.length ? lista.slice(0, mostrar).map(linha).join('') : '<tr><td colspan="4" class="vazio">Nenhum trecho.</td></tr>';
    rodapeLista();
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
    const todos = filtrar(false), lista = todos.slice(0, 500);
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const linhas = ['posicao;trecho;classe;regional;polo;municipio;km;nota;faixa;' + V.CRIT.map((c) => 'pontos_' + ({ img: 'lente_imagem', hier: 'hierarquia', ga: 'grupo_a', limp: 'limpeza', cli: 'clientes' }[c.k] || c.k)).join(';') + ';pontos_plano;situacao;regras;lente_imagem;solicitacoes;ultima_solicitacao;justificativa'];
    for (const r of lista) {
      const sl = r.t.sol, s0 = sl ? sl[0] : null;
      linhas.push([r.pos ?? '', q(r.t.id), 'T' + r.t.c, q(r.t.reg), q(r.t.polo), q(r.t.mun), fmtKm(r.t.km), fmtP(r.score), 'P' + r.faixa, ...V.CRIT.map((c) => fmtP(r.pts[c.k])), fmtP(r.bonus), q(r.status), q(r.regras.map((g) => g.id).join(' ')),
        r.t.lente || '', sl ? sl.length : 0, q(s0 ? [s0.criado ? s0.criado.split('-').reverse().join('/') : '', s0.prio, s0.os].filter(Boolean).join(' · ') : ''), q(V.justificar(ctx, r, S.P, S.T))].join(';'));
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
    // extrato: de onde vem cada ponto da nota (valor do trecho, faixa de valor e pontos de cada critério)
    const X = V.textos(ctx, r, S.P);
    const extrato = V.CRIT.map((c) => {
      const x = r.v[c.k], [dado, obs] = X.d[c.k], p = r.pts[c.k], rot = c.lim && x.j >= 0 ? V.rotFaixa(c, x.j, S.P) : '';
      const subs = [rot.replace(/^([\d.,]+) a ([\d.,]+)$/, 'entre $1 e $2'), obs].filter(Boolean).map((s) => '<span class="sub">' + esc(s) + '</span>').join('');
      return '<tr' + (p > 0 ? '' : ' class="zero"') + '><td><span class="amostra" style="background:' + corGrupo(c) + '"></span> ' + esc(c.curto) + '</td>' +
        '<td' + (x.st === 'est' ? ' class="st-est"' : x.st === 'falta' ? ' class="st-falta"' : '') + '>' + esc(dado) + subs + '</td><td class="r num"><b>' + fmtP(p) + '</b><span class="sub">de ' + fmtP(V.maxDe(S.T, c.k)) + '</span></td></tr>';
    }).join('') + (r.bonus > 0 ? '<tr><td>Plano climático</td><td>bônus da regra A1</td><td class="r num"><b>+' + fmtP(r.bonus) + '</b></td></tr>' : '') +
      '<tr class="total"><td colspan="2">Nota</td><td class="r num"><b>' + fmtP(r.score) + '</b><span class="sub">/' + fmtP(V.notaMax(S.T)) + '</span></td></tr>';
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
      '<div class="chips"><a class="botao g-mapa" href="../alimentadores/' + encodeURIComponent(t.al) + '/?t=' + encodeURIComponent(t.n) + '">Ver no mapa</a><span class="chip">' + fmtKm(t.km) + ' km</span><span class="chip">' + esc(t.reg) + (t.polo !== 'Sem polo' ? ' · ' + esc(POLO_NOME[t.polo] || t.polo) : '') + '</span><span class="chip">' + esc(t.mun) + '</span>' + (t.sol ? '<span class="chip">' + qtd(t.sol.length, 'solicitação', 'solicitações') + '</span>' : '') + (r.status !== 'Elegível' ? '<span class="chip estado">' + esc(r.status) + '</span>' : '') + '</div></div>' +
      '<div class="g-nota"><span class="rot">Nota</span><b>' + fmtP(r.score) + '</b><span class="de">/' + fmtP(V.notaMax(S.T)) + '</span>' + FAIXA(r.faixa) + '<span class="por">' + esc(porque) + '</span></div>' +
      '<section><h3>De onde vem a nota</h3><div class="tabela-wrap"><table class="tab-mini extrato"><thead><tr><th>Critério</th><th>No trecho</th><th class="r">Pontos</th></tr></thead><tbody>' + extrato + '</tbody></table></div></section>' +
      (r.regras.length ? '<section><h3>Regras</h3><ul class="regras" style="margin-top:8px">' + r.regras.map((g) => '<li><span class="chip ' + g.tipo + '">' + g.id + '</span><span>' + esc(g.txt) + '</span></li>').join('') + '</ul></section>' : '') +
      (t.sol ? '<details class="g-mais" open><summary>Solicitações (' + t.sol.length + ')</summary>' + evSol + '<p class="dica">Pedidos de limpeza da planilha do Ranking de faixa: não mudam a nota.</p></details>' : '') +
      '<details class="g-mais"><summary>Testar exceções</summary><div class="excecoes">' +
      '<label><input type="checkbox" id="x-ga"' + (S.flags.ga.has(t.i) ? ' checked' : '') + '> Há cliente Grupo A no trecho</label>' +
      '<label><input type="checkbox" id="x-plano"' + (S.flags.plano.has(t.i) ? ' checked' : '') + '> Incluir este trecho no plano climático</label></div></details>' +
      '<details class="g-mais"><summary>Ocorrências (' + ocs.length + ')</summary>' + evOc + '</details>' +
      '<details class="g-mais"><summary>Limpezas (' + t.os.length + ')</summary>' + evOs + '</details>' +
      '<details class="g-mais"><summary>Validar' + (val ? ' · ' + esc(val.decisao) : '') + '</summary><div class="validacao"><div class="val-botoes">' +
      [['Aprovado', 'Aprovar'], ['Adiado', 'Adiar'], ['Rejeitado', 'Rejeitar']].map(([d, rot]) => '<button type="button" class="botao" data-dec="' + d + '" aria-pressed="' + Boolean(val && val.decisao === d) + '">' + rot + '</button>').join('') + '</div>' +
      '<div class="campo"><label for="v-motivo">Motivo</label><select id="v-motivo"><option>Confirmo a prioridade</option><option>Executado e não registrado</option><option>Sem acesso ou autorização</option><option>Aguardar inspeção</option><option>Dado incorreto</option><option>Outro</option></select></div>' +
      '<div class="campo"><label for="v-obs">Observação</label><input type="text" id="v-obs" value="' + esc(val ? val.obs : '') + '"></div>' +
      '<p class="val-reg">' + (val ? esc([val.decisao + ' em ' + (val.quando || '—'), val.motivo, typeof val.score === 'number' ? 'nota ' + fmtP(val.escala === 'soma' ? val.score * 10 : val.score) + '/100' : '',
        'metodologia ' + (val.perfil || '—') + (val.metodologia ? '' : ' (anterior a 16/11/2026)')].filter(Boolean).join(' · ')) : '') + '</p></div></details>';
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
      validacoes[t.id] = { decisao: b.dataset.dec, motivo, obs, quando: new Date().toLocaleString('pt-BR'), score: Math.round(rr.score * 100) / 100, escala: 'soma100', metodologia: V.VERSAO, perfil: V.PERFIS[S.perfil].nome + (editada() ? ' com pontos editados' : ''), pontos: clonaT(S.T),
        parametros: clonaT({ ref: Pp.ref, lim: Pp.lim, carencia: Pp.carencia, ciclo: Pp.ciclo, aVencer: Pp.aVencer, cobBloqueio: Pp.cobBloqueio, pisoKm: Pp.pisoKm, bonus: Pp.bonus, planoPolos: Pp.planoPolos, fx: Pp.fx, t1Anos: Pp.t1Anos }),
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
    ['Crítica (causa árvore)', fmtN(Object.values(D.saz).reduce((a, b) => a + b, 0)) + ' ocorrências de ' + V.dataDe(ctx, ctx.ocIni) + ' a ' + ocFim + '; ' + fmtN(D.nae_fora) + ' sem trecho associado. Jan–mar/2026: extração anterior ao expurgo', 'NAE Vegetação'],
    ['DEC e FEC por ocorrência (Crítica, conjunto ANEEL)', WD ? fmtN(nb.oc) + ' ocorrências dos trechos, de ' + V.dataDe(ctx, ctx.ocIni) + ' a ' + ocFim + ': ' + fmtN(nb.exp) + ' expurgadas como situação de emergência (valem 0) e ' + fmtN(nb.nul) + ' sem dado na Crítica (contam 0). Jan–mar/2026 pela Crítica refeita depois do expurgo; gerado em ' + gerBr(WD) : 'Não carregado (dados/decfec-trechos.js)', 'DEC/100 km e FEC/100 km'],
    ['Lente de imagem (planilha RANKING_FAIXA_APP, aba Lente de imagem)', WL ? fmtN(Object.keys(WL.al).length) + ' alimentadores com nota de 1 a 4 (4 = maior risco); ' + fmtN(D.alims.length - nb.alL) + ' dos ' + fmtN(D.alims.length) + ' deste recorte sem nota' : 'Não carregada (dados/lente-imagem.js)', 'Lente de imagem'],
    ['Solicitações de limpeza (planilha RANKING_FAIXA_APP, aba Base de solicitações)', WS ? fmtN(WS.total) + ' pedidos de 2023 a 2026; ' + fmtN(WS.no_site) + ' ligados a um trecho, ' + fmtN(nb.solN) + ' deles em ' + fmtN(nb.solT) + ' trechos desta lista' + (nb.solSobe ? ' (' + fmtN(nb.solSobe) + ' feitos para trecho criado depois de ' + segData.slice(0, 5) + ', no trecho que o contém)' : '') + (nb.solForaN ? ' e ' + fmtN(nb.solForaN) + ' em ' + fmtN(nb.solForaT) + ' trechos fora do recorte' : '') + '; ' + fmtN((WS.sem_trecho || []).length) + ' sem trecho' : 'Não carregadas (dados/solicitacoes-trechos.js)', 'Marca na lista, ficha e filtro; fora da nota'],
    ['OS de limpeza de faixa', (D.os_fonte || 'Planilha de OS') + ' desde ' + D.os_inicio.split('-').reverse().join('/') + (D.os_fonte ? ', cobertura pelos vãos do mapa' : ', cobertura por vão estimada pela descrição'), 'Última limpeza, carência, OS abertas'],
    ['Inspeções do app de campo', fmtN(D.insp_total) + ' registros (jul–ago/2026), ' + fmtN(D.insp_casadas) + ' ligados a um poste da rede MT', 'Fora do score: não há medição de distância confiável'],
    ['Sem fonte na base', 'Grupo A e essenciais, classe de vegetação, produtividade por tipo de equipe, disponibilidade de equipes, plano climático, emergências do centro de operação', 'Marcação manual no teste ou parâmetro'],
  ].map((l) => '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td><td>' + l[2] + '</td></tr>').join('');
  $('#recorte').textContent = 'Recorte do teste: ' + fmtN(D.trechos.length) + ' trechos (todos os T1 e T2 e os T3 com ocorrência, OS, inspeção ou solicitação). Ficaram de fora ' + fmtN(D.fora_recorte.n) + ' T3 (' + fmtN(D.fora_recorte.km) + ' km) sem nenhum desses sinais.';
  // T3 fora do recorte: sem ocorrência nem limpeza registrada, clientes típicos de T3, classe T3 e a Lente do alimentador
  function textoRecorte() {
    const C = Object.fromEntries(V.CRIT.map((c) => [c.k, c])), tip = S.out.med.cli[3], jc = V.faixaDe(C.cli, tip);
    const nota = (S.T.limp[2] || 0) + (jc >= 0 ? S.T.cli[jc] || 0 : 0) + (S.T.hier[2] || 0), L = S.P.lim, nMax = nota + V.maxDe(S.T, 'img');
    const faixaP = (x) => (x >= L.p1 ? 1 : x >= L.p2 ? 2 : x >= L.p3 ? 3 : 4), comBonus = nMax + Math.max(0, Math.min(S.P.bonus, 100 - nMax));
    const fx = faixaP(nota) === faixaP(nMax) ? 'P' + faixaP(nota) : 'P' + faixaP(nota) + ' a P' + faixaP(nMax);
    $('#recorte-real').textContent = ' No sistema real eles entram: sem ocorrência e sem limpeza registrada, com os clientes típicos de T3, a classe T3 e a Lente de imagem do alimentador, a nota fica ' + (nMax > nota ? 'de ' + fmtP(nota) + ' a ' + fmtP(nMax) : fmtP(nota)) + ' (' + fx + ') na tabela de pontos atual' +
      (S.P.planoPolos.length && comBonus > nMax ? '; nos polos do plano climático, até ' + fmtP(comBonus) + ' (P' + faixaP(comBonus) + ').' : '.');
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


  // premissas: o botão da barra abre e fecha a tabela de pontos
  const premBtn = $('#prem-btn'), prem = $('#sec-premissas');
  function abrePrem(sim) { prem.hidden = !sim; premBtn.setAttribute('aria-expanded', String(sim)); }
  premBtn.addEventListener('click', () => abrePrem(prem.hidden));

  // abertura em partes: controles e linha de referência primeiro; nota e lista no quadro seguinte, para a página pintar antes
  perfilSel.value = S.perfil;
  dicaPerfil(); preencherParams();
  $('#corpo').innerHTML = '<tr><td colspan="4" class="vazio">Calculando as notas…</td></tr>';
  setTimeout(() => {
    S.out = V.avaliar(ctx, S.T, S.P, S.flags);
    linhaRef(); renderRanking();
    setTimeout(() => { desenharPontos(); textoRecorte(); abrirSecao(); }, 0);   // premissas ficam recolhidas: podem vir depois
  }, 0);
})();
