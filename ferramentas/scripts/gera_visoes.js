#!/usr/bin/env node
// Gera assets/mapa-municipios-visoes.js (window.MUN_VIS): as outras visões do mapa da página inicial, além da NAE —
// Manutenção, Inspeção, Inspeção que gerou manutenção e Limpeza de faixa — por município e, dentro dele, por alimentador.
// Uso: node gera-visoes.js [pasta do site (com alimentadores/ e assets/)] [arquivo de saída]
//      (padrão: ./teste e ./teste/assets/mapa-municipios-visoes.js, ao lado deste script). Só lê o site; escreve só a saída.
//
// Métricas (decisão do usuário; período: tudo o que está nos dados, sem filtro de data):
//   man   Manutenção: nº de OS executadas (alimentadores/<AL>/executadas.js), SEM os tipos de limpeza de faixa
//         ("MC - LIMPEZA DE FAIXA LD/RD"), que têm a visão deles.
//   insp  Inspeção: metros inspecionados (inspecao.js, m de cada OS), repartidos pelos vãos que a OS cobre.
//   im    Inspeção que gerou manutenção: nº de OS geradas pela inspeção (manutencao.js), em qualquer situação.
//   limp  Limpeza de faixa: metros limpos (limpeza.js, só OS EXECUTADA), repartidos pelos vãos que a OS cobre.
//
// Município de cada OS: pelo lugar dela, ponto-no-polígono nas divisas municipais em lat/lon (divisas.js de cada
// alimentador: o polígono IBGE de cada município, recortado na caixa do alimentador; todas as caixas juntas cobrem a rede).
//   Ponto (OS de contagem), na ordem:
//     man: posição do ativo da OS (poste da ESTRUTURA, ativo da ESTRUTURA ou ELEMENTO, como no mapa do alimentador)
//          → sem ativo: o município do alimentador com mais km de rede.
//     im:  ll da OS → sem ll: o poste da OS (pontas dos vãos do alimentador; senão postes das executadas; senão de
//          qualquer alimentador) → sem poste no mapa: o ponto da OS de inspeção que a gerou (pe, pt ou pa)
//          → sem nada: o município do alimentador com mais km de rede.
//   Ponto fora de todas as divisas (na beira do estado): o município mais perto (contado à parte).
//   Metros (insp, limp): cada vão coberto pela OS (window.INSPECAO.vaos / window.LIMPEZA.vaos: vão → OS) entra com o
//     comprimento dele (D.vaos[i][8]) no município do vão: trecho de um município só (D.meta.trecho_mun) → esse; trecho
//     em mais de um → as duas pontas do vão no polígono; pontas em municípios diferentes → o vão é cortado de 20 em 20 m.
//     (Conferido: o m de cada OS é a soma dos vãos dela; OS sem vão têm m = 0 e não somam km.)
// Repetidas: a mesma OS (número completo, com a equipe) em mais de um alimentador conta uma vez só. Na limpeza (a mesma
//   OS achada na rede de dois alimentadores) fica a cópia do próprio alimentador da OS (al_os) se ela tem metros; senão a
//   de mais metros.
// Por alimentador: o alimentador do arquivo (é na rede dele que o ativo ou o vão está hoje).
// Saída: window.MUN_VIS = {gerado, fonte, campos, faixas, total, muns: {<cod IBGE>: {man, insp, im, limp,
//   als: {<AL>: [man, insp, im, limp]}}}} — insp e limp em metros inteiros; o total do município é a soma dos alimentadores.
// faixas: 6 limites por visão (como as da NAE: 0 = "sem", depois 5 faixas), números redondos pelos quintis dos municípios.
// Mesma entrada, mesma saída (nada de data/hora de agora): rodar de novo não muda o arquivo se os dados não mudaram.
'use strict';
const fs = require('fs'), path = require('path');
const t0 = Date.now();
const SITE = path.resolve(process.argv[2] || path.join(__dirname, 'teste'));
const SAIDA = path.resolve(process.argv[3] || path.join(SITE, 'assets', 'mapa-municipios-visoes.js'));
const CAMPOS = ['man', 'insp', 'im', 'limp'];
// faixas da legenda: 0 = "sem"; depois 5 faixas pelos quintis dos municípios com valor (vs, em ordem: contagem, ou km), em
// números redondos (1; 1,5; 2; 2,5; 3; 4; 5 e 7,5 × 10^k). Contagem: só inteiros (abaixo de 10 sobram 1, 2, 3, 4, 5 e 10:
// nada de "3 a 7,5 OS") e, como a NAE (1, 11, 31…), o limite é o redondo + 1 ("1–10", "11–30"). Km: o redondo × 1000 (metros).
const REDONDOS = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
const candidatos = (x, inteiro) => { const b = 10 ** Math.floor(Math.log10(x)); return REDONDOS.map(f => f * b).filter(v => !inteiro || Number.isInteger(v)); };
const redondo = (x, inteiro) => !(x > 0) ? 1 : candidatos(x, inteiro).reduce((m, v) => Math.abs(Math.log(v / x)) < Math.abs(Math.log(m / x)) ? v : m);
const proximo = (v, inteiro) => candidatos(v, inteiro).find(f => f > v * 1.0001);
function faixasDe(vs, km) {
  const q = p => vs.length ? vs[Math.min(vs.length - 1, Math.floor(p * (vs.length - 1) + .5))] : 1;
  const lim = [];
  [.2, .4, .6, .8].forEach(p => {
    let v = Math.max(redondo(q(p), !km), km ? 0 : 1);
    if (lim.length && v <= lim[lim.length - 1]) v = proximo(lim[lim.length - 1], !km);
    lim.push(v);
  });
  return km ? [0, 1, ...lim.map(v => Math.round(v * 1000))] : [0, 1, ...lim.map(v => v + 1)];
}
// FAIXAS_TESTE='[[1,1,2,3],…]' (contagem) ou FAIXAS_KM='[[…]]' (km): só mostra as faixas desses valores e sai
if (process.env.FAIXAS_TESTE || process.env.FAIXAS_KM) {
  const km = !!process.env.FAIXAS_KM;
  JSON.parse(process.env.FAIXAS_KM || process.env.FAIXAS_TESTE).forEach(vs => console.log(km ? 'km' : 'contagem', JSON.stringify(vs), '→', JSON.stringify(faixasDe(vs.slice().sort((a, b) => a - b), km))));
  process.exit(0);
}
const LIMPEZA_TIPO = /LIMPEZA DE FAIXA/;

// ---------- leitura: os .js são "window.X = {json};" ----------
const le = f => {
  if (!fs.existsSync(f)) return null;
  const t = fs.readFileSync(f, 'utf8'), i = t.indexOf('=');
  return JSON.parse(t.slice(i + 1).trim().replace(/;\s*$/, ''));
};
const MUN = le(path.join(SITE, 'assets', 'mapa-municipios-dados.js'));
if (!MUN) throw new Error('falta assets/mapa-municipios-dados.js em ' + SITE);
const nomeMun = Object.fromEntries(MUN.muns.map(m => [m.cod, m.nome]));
const DIR = path.join(SITE, 'alimentadores');
const ALS = fs.readdirSync(DIR).filter(a => fs.statSync(path.join(DIR, a)).isDirectory()).sort();
const A = {};                                            // AL → {D, dv, E, I, MN, L}
for (const al of ALS) {
  const p = f => le(path.join(DIR, al, f + '.js'));
  A[al] = { D: p('dados'), dv: p('divisas'), E: p('executadas'), I: p('inspecao'), MN: p('manutencao'), L: p('limpeza') };
}
const tLeitura = Date.now() - t0;

// ---------- divisas: peças (município recortado na caixa de um alimentador) em lat/lon ----------
// anel em Float64Array [lat, lon, lat, lon, ...] com a caixa dele, para o teste ser rápido
const pecas = [], porAl = {}, vistas = new Map();
for (const al of ALS) {
  porAl[al] = [];
  (A[al].dv || []).forEach(m => {
    const k = m.cod + '|' + JSON.stringify(m.corte);
    let i = vistas.get(k);
    if (i === undefined) {
      const aneis = m.linhas.filter(r => r.length >= 3).map(r => {
        const f = new Float64Array(r.length * 2);
        let a0 = 90, a1 = -90, o0 = 180, o1 = -180;
        r.forEach(([la, lo], j) => { f[2 * j] = la; f[2 * j + 1] = lo; if (la < a0) a0 = la; if (la > a1) a1 = la; if (lo < o0) o0 = lo; if (lo > o1) o1 = lo; });
        return { f, bb: [a0, o0, a1, o1] };
      });
      const bb = aneis.reduce((b, r) => [Math.min(b[0], r.bb[0]), Math.min(b[1], r.bb[1]), Math.max(b[2], r.bb[2]), Math.max(b[3], r.bb[3])], [90, 180, -90, -180]);
      i = pecas.push({ cod: m.cod, aneis, bb }) - 1;
      vistas.set(k, i);
    }
    porAl[al].push(i);
  });
}
const G = 0.1, grade = new Map();                       // grade de 0,1° com as peças que encostam em cada célula
pecas.forEach((p, i) => {
  for (let a = Math.floor(p.bb[0] / G); a <= Math.floor(p.bb[2] / G); a++)
    for (let o = Math.floor(p.bb[1] / G); o <= Math.floor(p.bb[3] / G); o++) {
      const k = a * 10000 + o;
      if (!grade.has(k)) grade.set(k, []);
      grade.get(k).push(i);
    }
});
const noAnel = (r, la, lo) => {
  if (la < r.bb[0] || la > r.bb[2] || lo < r.bb[1] || lo > r.bb[3]) return false;
  const f = r.f, n = f.length;
  let d = false;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ai = f[i], aj = f[j];
    if ((ai > la) !== (aj > la) && lo < (f[j + 1] - f[i + 1]) * (la - ai) / (aj - ai) + f[i + 1]) d = !d;
  }
  return d;
};
const naPeca = (p, la, lo) => {
  if (la < p.bb[0] || la > p.bb[2] || lo < p.bb[1] || lo > p.bb[3]) return false;
  let d = false;
  for (const r of p.aneis) if (noAnel(r, la, lo)) d = !d;   // par-ímpar: buraco (anel dentro de anel) fica fora
  return d;
};
// distância (em graus, lon encolhida pelo cosseno) do ponto à borda da peça
const distPeca = (p, la, lo) => {
  const c = Math.cos(la * Math.PI / 180);
  let melhor = Infinity;
  for (const r of p.aneis) {
    const f = r.f;
    for (let i = 2; i < f.length; i += 2) {
      const ax = f[i - 1] * c, ay = f[i - 2], bx = f[i + 1] * c, by = f[i], px = lo * c, py = la;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d < melhor) melhor = d;
    }
  }
  return melhor;
};
// município do ponto: primeiro as peças do próprio alimentador, depois as de qualquer alimentador; fora de todas, o mais
// perto (como = 'perto'). Guardado por ponto.
const cacheMun = new Map();
let nPerto = 0;
function munDe(al, la, lo) {
  if (!(Number.isFinite(la) && Number.isFinite(lo))) return null;
  const k = la.toFixed(6) + ',' + lo.toFixed(6);
  let r = cacheMun.get(k);
  if (r) return r;
  for (const i of porAl[al] || []) if (naPeca(pecas[i], la, lo)) { r = { cod: pecas[i].cod, como: 'divisa' }; break; }
  if (!r) for (const i of grade.get(Math.floor(la / G) * 10000 + Math.floor(lo / G)) || []) if (naPeca(pecas[i], la, lo)) { r = { cod: pecas[i].cod, como: 'divisa' }; break; }
  if (!r) {
    const cands = new Set(porAl[al] || []);
    for (let a = -2; a <= 2; a++) for (let o = -2; o <= 2; o++) (grade.get((Math.floor(la / G) + a) * 10000 + Math.floor(lo / G) + o) || []).forEach(i => cands.add(i));
    let melhor = null, dm = Infinity;
    cands.forEach(i => { const d = distPeca(pecas[i], la, lo); if (d < dm) { dm = d; melhor = pecas[i].cod; } });
    if (melhor) { r = { cod: melhor, como: 'perto', d: dm }; nPerto++; }
  }
  if (r) cacheMun.set(k, r);
  return r || null;
}

// ---------- por alimentador: município principal, postes e vãos ----------
const principal = {};                                     // AL → município com mais km de rede
for (const al of ALS) {
  const ms = ((A[al].D || {}).meta || {}).municipios || [];
  let c = ms.slice().sort((a, b) => b.m - a.m)[0];
  if (!c) c = MUN.muns.map(m => ({ cod: m.cod, m: (m.als.find(x => x.cod === al) || {}).m || 0 })).filter(x => x.m > 0).sort((a, b) => b.m - a.m)[0];
  principal[al] = c ? c.cod : null;
}
// postes: pontas dos vãos (do alimentador; nós "N123" são internos de cada um) e postes das executadas
const postesAl = {}, postesTodos = new Map();
for (const al of ALS) {
  const P = postesAl[al] = new Map(), D = A[al].D;
  if (D) D.vaos.forEach(v => { if (!P.has(v[6])) P.set(v[6], [v[0], v[1]]); if (!P.has(v[7])) P.set(v[7], [v[2], v[3]]); });
  const E = A[al].E;
  if (E) E.ativos.forEach(a => { if (a[1] === 'poste' && !P.has(a[0])) P.set(a[0], [a[3], a[4]]); });
  P.forEach((ll, id) => { if (!/^N\d+$/.test(id) && !postesTodos.has(id)) postesTodos.set(id, ll); });
}
const posteLL = (al, id) => id && ((postesAl[al] && postesAl[al].get(String(id))) || (/^N\d+$/.test(id) ? null : postesTodos.get(String(id)))) || null;
// município(s) de cada vão do alimentador: [[cod, metros], ...]
const AMOSTRA = 20;
let nVaoTrecho = 0, nVaoPontas = 0, nVaoCortado = 0;
function vaosDe(al) {
  const D = A[al].D;
  if (!D) return {};
  if (D._mun) return D._mun;
  const tm = (D.meta && D.meta.trecho_mun) || {}, out = {};
  D.vaos.forEach(v => {
    const ms = tm[D.trechos[v[4]].nome] || [], ext = v[8] || 0;
    if (ms.length === 1) { out[v[5]] = [[ms[0], ext]]; nVaoTrecho++; return; }
    const c1 = munDe(al, v[0], v[1]), c2 = munDe(al, v[2], v[3]);
    if (c1 && c2 && c1.cod === c2.cod) { out[v[5]] = [[c1.cod, ext]]; nVaoPontas++; return; }
    const n = Math.max(1, Math.ceil(ext / AMOSTRA)), soma = {};
    for (let s = 0; s < n; s++) {
      const f = (s + .5) / n, c = munDe(al, v[0] + (v[2] - v[0]) * f, v[1] + (v[3] - v[1]) * f);
      const cod = c ? c.cod : principal[al];
      soma[cod] = (soma[cod] || 0) + ext / n;
    }
    out[v[5]] = Object.entries(soma);
    nVaoCortado++;
  });
  return (D._mun = out);
}

// ---------- acumuladores ----------
const ac = {};                                            // cod → AL → [man, insp, im, limp] (insp/limp em metros, float)
const soma = (cod, al, i, v) => {
  if (!cod || !v) return;
  const m = ac[cod] || (ac[cod] = {}), x = m[al] || (m[al] = [0, 0, 0, 0]);
  x[i] += v;
};
const rec = { man: { os: 0, total: 0, como: {} }, insp: { os: 0, total: 0, como: {} }, im: { os: 0, total: 0, como: {} }, limp: { os: 0, total: 0, como: {} } };
const conta = (v, como, n = 1) => { rec[v].como[como] = (rec[v].como[como] || 0) + n; };
const pertoOS = [];                                       // distância (km) dos pontos de OS fora das divisas
const semMun = { man: 0, insp: 0, im: 0, limp: 0 };
const ponto = (al, ll) => ll && ll.length >= 2 ? munDe(al, +ll[0], +ll[1]) : null;
const fonte = {};
const guardaFonte = (k, o, campos) => {
  if (!o) return;
  const f = fonte[k] || (fonte[k] = {});
  campos.forEach(c => { if (o[c] != null && (f[c] == null || String(o[c]) > String(f[c]))) f[c] = o[c]; });
};

// Manutenção: OS executadas (sem limpeza de faixa), no ativo da OS
const vistasEx = new Set();
let exLimpeza = 0, exRepetidas = 0;
for (const al of ALS) {
  const E = A[al].E;
  if (!E) continue;
  guardaFonte('executadas', E, ['fonte', 'gerado', 'de', 'ate']);
  const munAt = E.ativos.map(a => null);
  E.os.forEach(o => {
    if (LIMPEZA_TIPO.test(E.tipos[o[1]] || '')) { exLimpeza++; return; }
    if (vistasEx.has(o[0])) { exRepetidas++; return; }
    vistasEx.add(o[0]);
    rec.man.os++; rec.man.total++;
    let c = null, como;
    if (o[4] >= 0) {
      const a = E.ativos[o[4]];
      c = munAt[o[4]] || (munAt[o[4]] = munDe(al, a[3], a[4]));
      como = c && c.como === 'perto' ? 'ativo (fora das divisas: município mais perto)' : 'ativo da OS';
      if (c && c.como === 'perto') pertoOS.push(c.d * 111.2);
    }
    if (!c) { c = principal[al] ? { cod: principal[al] } : null; como = 'sem ativo no mapa: município do alimentador com mais km'; }
    conta('man', como);
    if (c) soma(c.cod, al, 0, 1); else semMun.man++;
  });
}

// Inspeção que gerou manutenção: OS geradas, no ll, no poste, no ponto da inspeção, no alimentador
const inspPorId = new Map();                              // OS de inspeção (número completo) → ponto dela
for (const al of ALS) (A[al].I ? A[al].I.os : []).forEach(o => { const p = o.pe || o.pt || o.pa; if (p && !inspPorId.has(o.os_completa)) inspPorId.set(o.os_completa, [al, p]); });
const vistasIm = new Set();
let imRepetidas = 0;
for (const al of ALS) {
  const MN = A[al].MN;
  if (!MN) continue;
  guardaFonte('manutencao', MN, ['fonte', 'gerado', 'base_ate']);
  const doAl = new Map((A[al].I ? A[al].I.os : []).map(o => [o.os_completa, o.pe || o.pt || o.pa]));
  MN.os.forEach(o => {
    if (vistasIm.has(o.os_completa)) { imRepetidas++; return; }
    vistasIm.add(o.os_completa);
    rec.im.os++; rec.im.total++;
    let c = ponto(al, o.ll), como = 'll da OS';
    if (!c) { c = ponto(al, posteLL(al, o.poste)); como = 'poste da OS (sem ll)'; }
    if (!c && o.insp) { const p = doAl.get(o.insp) || (inspPorId.get(o.insp) || [])[1]; c = ponto(al, p); como = 'ponto da OS de inspeção (sem ll nem poste)'; }
    if (!c) { c = principal[al] ? { cod: principal[al] } : null; como = 'município do alimentador com mais km'; }
    else if (c.como === 'perto') { como += ' (fora das divisas: município mais perto)'; pertoOS.push(c.d * 111.2); }
    conta('im', como);
    if (c) soma(c.cod, al, 2, 1); else semMun.im++;
  });
}

// metros por vão: Inspeção (todas) e Limpeza (só EXECUTADA)
function porVaos(al, X, ks, campo, i) {
  const mv = vaosDe(al), alvo = new Set(ks), m = {};
  Object.entries(X.vaos || {}).forEach(([v, os]) => os.forEach(k => {
    if (!alvo.has(k)) return;
    (mv[v] || []).forEach(([cod, ext]) => { soma(cod, al, i, ext); m[k] = (m[k] || 0) + ext; });
  }));
  return m;
}
const vistasInsp = new Set();
let inspRepetidas = 0;
for (const al of ALS) {
  const I = A[al].I;
  if (!I) continue;
  guardaFonte('inspecao', I, ['fonte', 'gerado', 'base_ate']);
  const ks = [];
  I.os.forEach((o, k) => { if (vistasInsp.has(o.os_completa)) { inspRepetidas++; return; } vistasInsp.add(o.os_completa); ks.push(k); });
  const m = porVaos(al, I, ks, 'insp', 1);
  ks.forEach(k => {
    rec.insp.os++; rec.insp.total += I.os[k].m || 0;
    conta('insp', m[k] ? 'vãos da OS (geometria)' : (I.os[k].m ? 'SEM vão (metros perdidos)' : 'sem vão e m = 0 (não soma km)'));
    if (I.os[k].m && Math.abs((m[k] || 0) - I.os[k].m) > 1) conta('insp', 'm da OS ≠ soma dos vãos');
  });
}
// limpeza: escolhe a cópia de cada OS executada
const copias = new Map();
for (const al of ALS) {
  const L = A[al].L;
  if (!L) continue;
  guardaFonte('limpeza', L, ['fonte', 'gerado']);
  L.os.forEach((o, k) => { if (o.sit !== 'EXECUTADA') return; if (!copias.has(o.os_completa)) copias.set(o.os_completa, []); copias.get(o.os_completa).push({ al, k, o }); });
}
const escolhe = cs => cs.find(c => c.al === c.o.al_os && c.o.m > 0) || cs.slice().sort((a, b) => (b.o.m || 0) - (a.o.m || 0) || (a.al < b.al ? -1 : 1))[0];
const limpPorAl = {};
let limpRepetidas = 0, limpRepetidasM = 0;
copias.forEach(cs => {
  const e = escolhe(cs);
  (limpPorAl[e.al] = limpPorAl[e.al] || []).push(e.k);
  cs.forEach(c => { if (c !== e) { limpRepetidas++; limpRepetidasM += c.o.m || 0; } });
});
let limpMaior = null;
for (const al of ALS) {
  const ks = limpPorAl[al];
  if (!ks) continue;
  const L = A[al].L, m = porVaos(al, L, ks, 'limp', 3);
  ks.forEach(k => {
    const o = L.os[k];
    rec.limp.os++; rec.limp.total += o.m || 0;
    if (!limpMaior || o.m > limpMaior.m) limpMaior = { os: o.os_completa, al, m: o.m, metodo: o.metodo };
    conta('limp', m[k] ? 'vãos da OS (geometria)' : (o.m ? 'SEM vão (metros perdidos)' : 'sem vão e m = 0 (não soma km)'));
    if (o.m && Math.abs((m[k] || 0) - o.m) > 1) conta('limp', 'm da OS ≠ soma dos vãos');
  });
}

// ---------- saída ----------
const muns = {};
Object.keys(ac).sort().forEach(cod => {
  const als = {}, t = [0, 0, 0, 0];
  Object.keys(ac[cod]).sort().forEach(al => {
    const x = ac[cod][al].map(v => Math.round(v));
    if (x.every(v => !v)) return;
    als[al] = x;
    x.forEach((v, i) => { t[i] += v; });
  });
  if (!Object.keys(als).length) return;
  muns[cod] = { man: t[0], insp: t[1], im: t[2], limp: t[3], als };
});
const faixas = {};
CAMPOS.forEach(c => {
  const km = c === 'insp' || c === 'limp';
  faixas[c] = faixasDe(MUN.muns.map(m => (muns[m.cod] || {})[c] || 0).filter(v => v > 0).map(v => km ? v / 1000 : v).sort((a, b) => a - b), km);
});
const total = {};
CAMPOS.forEach((c, i) => { total[c] = Object.values(muns).reduce((s, m) => s + m[c], 0); });
const gerado = Object.values(fonte).map(f => f.gerado).filter(Boolean).sort().pop() || null;
const out = { gerado, fonte, campos: CAMPOS, faixas, total, muns };
const txt = '// Gerado por gera-visoes.js (não editar à mão): visões do mapa da página inicial por município e alimentador.\n' +
  '// man = OS de manutenção executadas (sem limpeza de faixa), insp = metros inspecionados, im = OS geradas pela inspeção,\n' +
  '// limp = metros de limpeza de faixa executada; als: {AL: [man, insp, im, limp]}; faixas: limites da legenda (insp/limp em metros).\n' +
  'window.MUN_VIS=' + JSON.stringify(out) + ';\n';
const antes = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : null;
if (antes !== txt) fs.writeFileSync(SAIDA, txt);

// ---------- conferência ----------
const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
const fmt = (c, v) => c === 'insp' || c === 'limp' ? km(v) : v.toLocaleString('pt-BR') + ' OS';
const NOME = { man: 'Manutenção (OS executadas, sem limpeza de faixa)', insp: 'Inspeção (km inspecionados)', im: 'Inspeção que gerou manutenção (OS geradas)', limp: 'Limpeza de faixa (km executados)' };
console.log(`gera-visoes: ${ALS.length} pastas de alimentador (${ALS.filter(a => A[a].E).length} com OS), ${pecas.length} peças de divisa de ${new Set(pecas.map(p => p.cod)).size} municípios; leitura ${tLeitura} ms, total ${Date.now() - t0} ms`);
console.log(`saída ${SAIDA} (${fs.statSync(SAIDA).size.toLocaleString('pt-BR')} bytes) ${antes === txt ? 'SEM MUDANÇA' : 'escrita'}; gerado ${gerado}`);
console.log(`vãos: ${nVaoTrecho} pelo trecho (1 município), ${nVaoPontas} pelas 2 pontas, ${nVaoCortado} cortados de 20 em 20 m`);
pertoOS.sort((a, b) => a - b);
console.log(`pontos fora das divisas (vão ou OS; vai para o município mais perto): ${nPerto}; de OS: ${pertoOS.length}` +
  (pertoOS.length ? `, a ${pertoOS[pertoOS.length >> 1].toFixed(2)} km da divisa (mediana), no máximo ${pertoOS[pertoOS.length - 1].toFixed(2)} km` : ''));
CAMPOS.forEach((c, i) => {
  const r = rec[c], saiu = total[c], ok = c === 'insp' || c === 'limp' ? Math.abs(saiu - r.total) < Object.keys(muns).length * 50 : saiu === r.total;
  console.log(`\n${NOME[c]}\n  OS consideradas: ${r.os.toLocaleString('pt-BR')} · total das OS: ${fmt(c, Math.round(r.total))} · soma dos municípios: ${fmt(c, saiu)} ${ok ? 'CONFERE' : 'NÃO CONFERE'}` +
    (semMun[c] ? ` · sem município: ${semMun[c]}` : ''));
  Object.entries(r.como).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`    ${n.toLocaleString('pt-BR').padStart(8)}  ${k}`));
  const top = Object.entries(muns).sort((a, b) => b[1][c] - a[1][c]).slice(0, 5);
  console.log('  5 maiores: ' + top.map(([cod, m]) => `${nomeMun[cod] || cod} ${fmt(c, m[c])}`).join(' · '));
  console.log('  faixas: ' + JSON.stringify(faixas[c]) + ` · municípios sem: ${MUN.muns.filter(m => !(muns[m.cod] || {})[c]).length} de ${MUN.muns.length}`);
});
console.log(`\nrepetidas descartadas: executadas ${exRepetidas}, geradas ${imRepetidas}, inspeção ${inspRepetidas}, limpeza ${limpRepetidas} cópias (${km(limpRepetidasM)} das cópias descartadas)`);
console.log(`executadas de limpeza de faixa fora da Manutenção: ${exLimpeza.toLocaleString('pt-BR')}`);
if (limpMaior) console.log(`maior OS de limpeza: ${limpMaior.os} (${limpMaior.al}) ${km(limpMaior.m)} — ${limpMaior.metodo}`);
const foraMapa = Object.keys(muns).filter(c => !nomeMun[c]);
if (foraMapa.length) console.log('municípios fora do mapa: ' + foraMapa.join(', '));
// alimentadores com valor num município por onde a rede dele não passa (segundo o mapa)
let fora = 0, foraV = [0, 0, 0, 0];
MUN.muns.forEach(m => { const x = muns[m.cod]; if (!x) return; Object.entries(x.als).forEach(([al, v]) => { if (!m.als.some(a => a.cod === al)) { fora++; v.forEach((y, i) => { foraV[i] += y; }); } }); });
console.log(`pares município×alimentador fora da lista de alimentadores do município no mapa: ${fora} (man ${foraV[0]}, insp ${km(foraV[1])}, im ${foraV[2]}, limp ${km(foraV[3])})`);

// ---------- DIAG=1: confere o localizador com a rede de cada alimentador por município (D.meta.municipios, do gerador
// do site, amostrado de 20 em 20 m) e mostra os pontos fora das divisas ----------
if (process.env.DIAG) {
  let soma = 0, dif = 0;
  const piores = [];
  for (const al of ALS) {
    const D = A[al].D;
    if (!D) continue;
    const mv = vaosDe(al), meu = {};
    D.vaos.forEach(v => (mv[v[5]] || []).forEach(([c, e]) => { meu[c] = (meu[c] || 0) + e; }));
    const ref = Object.fromEntries((D.meta.municipios || []).map(m => [m.cod, m.m]));
    new Set([...Object.keys(meu), ...Object.keys(ref)]).forEach(c => {
      const d = Math.abs((meu[c] || 0) - (ref[c] || 0));
      soma += meu[c] || 0; dif += d;
      if (d > 200) piores.push([al, nomeMun[c] || c, Math.round(ref[c] || 0), Math.round(meu[c] || 0)]);
    });
  }
  console.log(`\nDIAG rede: ${km(soma)} somados; diferença com D.meta.municipios ${km(dif / 2)} (${(dif / 2 / soma * 100).toFixed(3)}%); pares com mais de 200 m: ${piores.length}`);
  piores.sort((a, b) => Math.abs(b[3] - b[2]) - Math.abs(a[3] - a[2])).slice(0, 10).forEach(p => console.log('  ', p.join(' · ')));
  const perto = [...cacheMun.entries()].filter(([, r]) => r.como === 'perto').map(([k, r]) => [k, r.cod, r.d * 111]);
  const ds = perto.map(p => p[2]).sort((a, b) => a - b);
  console.log(`pontos fora das divisas: ${perto.length}; distância à divisa (km): mediana ${(ds[ds.length >> 1] || 0).toFixed(3)}, p95 ${(ds[Math.floor(ds.length * .95)] || 0).toFixed(3)}, máx ${(ds[ds.length - 1] || 0).toFixed(3)}`);
  perto.sort((a, b) => b[2] - a[2]).slice(0, 5).forEach(p => console.log('  ', p[0], nomeMun[p[1]], p[2].toFixed(2) + ' km'));
  // postes das OS geradas sem ll
  let semLL = 0, achou = 0;
  for (const al of ALS) (A[al].MN ? A[al].MN.os : []).forEach(o => { if (!o.ll) { semLL++; if (posteLL(al, o.poste)) achou++; } });
  console.log(`OS geradas sem ll: ${semLL}; com o poste achado nos vãos/executadas: ${achou}`);
  CAMPOS.forEach(c => {
    const k = c === 'insp' || c === 'limp';
    const vs = MUN.muns.map(m => (muns[m.cod] || {})[c] || 0).filter(v => v > 0).map(v => k ? v / 1000 : v).sort((a, b) => a - b);
    console.log(c, 'quantis 10..90%:', [.1, .2, .3, .4, .5, .6, .7, .8, .9].map(p => Math.round(vs[Math.floor(p * (vs.length - 1) + .5)])).join(' '), 'máx', Math.round(vs[vs.length - 1]));
  });
}
