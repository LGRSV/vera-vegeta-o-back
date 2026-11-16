"""Indicadores da Priorização (assets/priorizacao-dados.js e dados/decfec-trechos.js) a partir da NAE dos alimentadores.

Roda sozinho depois de cada Crítica enviada pelo menu (atualiza_bases.py); também roda à mão. Lê a NAE de cada
alimentador da Priorização (dados/alimentadores/<AL>.json, a mesma do mapa e dos rankings) e refaz:
  - oc de cada trecho: [dia desde d0, clientes, duração (min), coletiva 1/0, regra 0 chave de início · 1 vão mais
    próximo do ativo · 2 abrangência DJ]. Trecho criado depois da segmentação da Priorização vai para o trecho que o
    contém (`sobe`); T3 fora do recorte que passa a ter ocorrência entra no fim de trechos (dados do mapa de hoje).
  - saz, saz_assoc, nae_fora e oc_ate (último dia com ocorrência; ou o fim da extração da Crítica, dados/bases.json).
  - tr de cada T2: 1 se é tronco no mapa de hoje (trecho do caminho principal), 0 se é ramal (filtro de classe).
  - decfec-trechos.js: DEC (h) e FEC do conjunto ANEEL de cada ocorrência, na ordem de oc. Vem da própria ocorrência
    (dec_conj e fec_conj, que a leitura da Crítica grava desde 16/11/2026: passos sem momentâneo e sem dia crítico);
    ocorrência sem esses campos (meses lidos antes) mantém o valor e o expurgo que já estavam no arquivo, pela mesma
    data, clientes e duração; sem nenhum dos dois fica null ("sem dado").
O resto (rede, OS, inspeções, solicitações, recorte) fica como está; as OS são do priorizacao_os.py.

Uso:
  python scripts/priorizacao_indicadores.py <pasta do site> [--conferir]
  --conferir: só compara com os arquivos atuais e lista as diferenças (não grava)
"""
import argparse
import datetime as dt
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

DADOS, DECFEC = 'assets/priorizacao-dados.js', 'dados/decfec-trechos.js'
NOTA = re.compile(r'^// Ocorrências \(oc\) .*\n', re.M)


def le_js(p, var):
    s = Path(p).read_text(encoding='utf-8')
    i = s.index(var)
    j = s.index('=', i) + 1
    return s[:i], json.loads(s[j:].strip().rstrip(';'))


def grava_js(p, cab, var, obj):
    Path(p).write_text(cab + var + ' = ' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';\n',
                       encoding='utf-8')


def data_de(o):
    """Data de abertura da ocorrência: 'dd/mm HH:MM' com o ano do mês da Crítica (passo de dez/jan no meio)."""
    dd, hh = o['dia'].split(' ')
    dia, ma = map(int, dd.split('/'))
    ano, mc = int(o['mes'][:4]), int(o['mes'][5:7])
    ano += -1 if ma - mc > 6 else 1 if mc - ma > 6 else 0
    return dt.date(ano, ma, dia), hh


def regra(o, subiu):
    r = o.get('regra') or ''
    if 'abrangência' in r:
        return 2
    return 0 if r.startswith('chave de início') and not subiu else 1


def trecho_novo(ai, al, j, nome, muns):
    """Trecho de hoje (mapa do alimentador) no formato da Priorização."""
    idx = {t['nome']: i for i, t in enumerate(j['trechos'])}
    t = j['trechos'][idx[nome]]
    vs = [v for v in j['vaos'] if v[4] == idx[nome]]
    la = sum(v[1] + v[3] for v in vs) / (2 * len(vs)) if vs else t['inicio']['lonlat'][1]
    lo = sum(v[0] + v[2] for v in vs) / (2 * len(vs)) if vs else t['inicio']['lonlat'][0]
    nomes = {m['cod']: m['nome'] for m in j.get('municipios', [])}
    mu = -1
    if t.get('municipios'):
        m = nomes.get(max(t['municipios'].items(), key=lambda kv: kv[1])[0])
        if m:
            if m not in muns:
                muns.append(m)
            mu = muns.index(m)
    ext = t['ext_m'] or 0
    mono = sum(v for k, v in (t.get('fases') or {}).items() if len(k) == 1) / ext if ext else 0.0
    return dict(a=ai, n=nome, c=int(t['classe'][1]), km=round(ext / 1000, 2), la=round(la, 2), lo=round(lo, 2),
                mu=mu, mono=round(mono, 1), oc=[], rep=0, os=[], cf='alta' if t.get('confianca') == 'alta' else 'revisar')


def main(site, conferir=False, hoje=None):
    site = Path(site)
    cab, D = le_js(site / DADOS, 'window.DADOS')
    cabf, DF = le_js(site / DECFEC, 'window.DECFEC_TRECHOS')
    d0 = dt.date.fromisoformat(D['d0'])
    alims = [a[0] for a in D['alims']]
    pos = {(alims[t['a']], t['n']): i for i, t in enumerate(D['trechos'])}
    sobe = D.get('sobe', {})
    novo = defaultdict(list)                        # índice do trecho -> [(chave de ordem, oc, dec/fec da ocorrência)]
    saz, assoc, fora, ate, fontes = Counter(), Counter(), 0, None, set()
    acrescidos, sem_json, sem_trecho, tronco = [], [], [], {}
    for ai, al in enumerate(alims):
        p = site / 'dados' / 'alimentadores' / f'{al}.json'
        if not p.exists():
            sem_json.append(al)
            continue
        j = json.loads(p.read_text(encoding='utf-8'))
        fontes.update((j.get('origem') or {}).get('critica') or [])
        nomes_hoje = {t['nome'] for t in j['trechos']}
        for t in j['trechos']:
            if t['classe'] == 'T2':
                tronco[(al, t['nome'])] = 1 if t.get('tronco') else 0
        for o in j['nae']['oc']:
            data, hora = data_de(o)
            saz[o['mes']] += 1
            ate = max(ate or data, data)
            if not o.get('trecho'):
                fora += 1
                continue
            assoc[o['mes']] += 1
            n = sobe.get(al, {}).get(o['trecho'], o['trecho'])
            if (al, n) not in pos:
                if n not in nomes_hoje:
                    sem_trecho.append((al, n))
                    continue
                t = trecho_novo(ai, al, j, n, D['muns'])
                pos[(al, n)] = len(D['trechos'])
                D['trechos'].append(t)
                acrescidos.append(t)
            dfc = [o['dec_conj'], o['fec_conj']] if 'dec_conj' in o and 'fec_conj' in o else None
            novo[pos[(al, n)]].append(((data, hora), [(data - d0).days, o['cons'], o['dur'], 1 if o['col'] else 0,
                                                      regra(o, n != o['trecho'])], dfc, o['mes']))
    antigo_al, antigo_exp = DF.get('al', {}), DF.get('expurgo', {})
    dif_oc, dfc_al, exp_al, origem, meses_crit, dif_tr = [], {}, {}, Counter(), set(), 0
    ids_novos = {id(t) for t in acrescidos}
    for i, t in enumerate(D['trechos']):
        al = alims[t['a']]
        if t['c'] == 2 and (al, t['n']) in tronco and t.get('tr') != tronco[(al, t['n'])]:
            t['tr'] = tronco[(al, t['n'])]
            dif_tr += 1
        lst = sorted(novo.get(i, []), key=lambda x: x[0])
        oc = [x[1] for x in lst]
        # DEC/FEC que já estavam no arquivo, pela mesma ocorrência (dia, clientes, duração), na ordem antiga
        velho = defaultdict(list)
        vals, exps = antigo_al.get(al, {}).get(t['n']), set(antigo_exp.get(al, {}).get(t['n'], []))
        if vals and len(vals) == len(t['oc']):
            for k, x in enumerate(t['oc']):
                velho[tuple(x[:3])].append((vals[k], k in exps))
        if oc != t['oc']:
            dif_oc.append((al, t['n'], len(t['oc']), len(oc)))
        t['oc'] = oc
        if id(t) in ids_novos:
            t['rep'] = len(oc)
        if not oc:
            continue
        lv, le = [], []
        for k, (_, x, dfc, mes) in enumerate(lst):
            v = velho.get(tuple(x[:3]))
            antes = v.pop(0) if v else None
            if antes and antes[1]:                  # expurgada como situação de emergência: vale 0, como no oficial
                lv.append([0.0, 0.0]); le.append(k); origem['expurgo mantido'] += 1
            elif dfc is not None:
                lv.append(dfc); origem['da Crítica (dec_conj)'] += 1; meses_crit.add(mes)
            elif antes:
                lv.append(antes[0]); origem['mantido do arquivo'] += 1
            else:
                lv.append(None); origem['sem dado'] += 1
        dfc_al.setdefault(al, {})[t['n']] = lv
        if le:
            exp_al.setdefault(al, {})[t['n']] = le
    # último dia com dado: a última ocorrência ou, se for depois, o fim da extração da Crítica (dados/bases.json)
    pb = site / 'dados' / 'bases.json'
    fim = (json.loads(pb.read_text(encoding='utf-8')).get('critica') or {}).get('ate') if pb.exists() else None
    ate = max(x for x in (ate.isoformat() if ate else None, fim, None if ate else D.get('oc_ate')) if x)
    saz, assoc = dict(sorted(saz.items())), dict(sorted(assoc.items()))
    fr = D.get('fora_recorte')
    if fr and acrescidos:
        fr = dict(n=fr['n'] - len(acrescidos), km=round(fr['km'] - sum(t['km'] for t in acrescidos), 1))
    dif_df = sorted(k for k in set(dfc_al) | set(antigo_al) if dfc_al.get(k) != antigo_al.get(k))
    dif_exp = sorted(k for k in set(exp_al) | set(antigo_exp) if exp_al.get(k) != antigo_exp.get(k))
    res = dict(trechos=len(D['trechos']), acrescidos=[f"{alims[t['a']]} {t['n']}" for t in acrescidos],
               oc_diferentes=len(dif_oc), tr_mudou=dif_tr, ex_oc=dif_oc[:5], decfec_alims_diferentes=len(dif_df), ex_decfec=dif_df[:5],
               expurgo_diferente=dif_exp[:5], saz=saz == D.get('saz'), saz_assoc=assoc == D.get('saz_assoc'),
               nae_fora=(D.get('nae_fora'), fora), oc_ate=(D.get('oc_ate'), ate), decfec=dict(origem),
               sem_json=sem_json, sem_trecho=sorted(set(sem_trecho)))
    if conferir:
        return res
    hoje = hoje or dt.date.today().isoformat()
    mudou = bool(dif_oc or dif_tr or acrescidos or saz != D.get('saz') or assoc != D.get('saz_assoc') or fora != D.get('nae_fora')
                 or ate != D.get('oc_ate'))
    if mudou:
        D.update(saz=saz, saz_assoc=assoc, nae_fora=fora, oc_ate=ate)
        if fr:
            D['fora_recorte'] = fr
        nota = (f"// Ocorrências (oc) até {ate[8:10]}/{ate[5:7]}/{ate[:4]} (oc_ate), refeitas em {hoje} pela NAE dos "
                f"alimentadores (scripts/priorizacao_indicadores.py, roda a cada Crítica do menu); trechos_0710 = os do "
                f"Artifact; T3 que passaram a ter ocorrência estão no fim de trechos. saz, saz_assoc, nae_fora e "
                f"fora_recorte vão até oc_ate; estat e total_trechos são da rede de 07/10. DEC/FEC de cada ocorrência: "
                f"dados/decfec-trechos.js.\n")
        cab = NOTA.sub(lambda _: nota, cab, count=1) if NOTA.search(cab) else cab.rstrip('\n') + '\n' + nota
        grava_js(site / DADOS, cab, 'window.DADOS', D)
    if mudou or dif_df or dif_exp:
        DF['al'], DF['expurgo'], DF['oc_ate'], DF['gerado'] = dfc_al, exp_al, ate, hoje
        # um arquivo por mês: o da Crítica que deu o DEC/FEC (dec_conj) ou, nos outros meses, o que já estava
        meses = {}
        for f in DF.get('fonte', []) + sorted(fontes):
            m = re.search(r'(\d\d)-(20\d\d)', f)
            if m and (f in DF.get('fonte', []) or f'{m.group(2)}-{m.group(1)}' in meses_crit):
                meses[m.group(2) + m.group(1)] = f
        if meses:
            DF['fonte'] = [meses[k] for k in sorted(meses)]
        grava_js(site / DECFEC, cabf, 'window.DECFEC_TRECHOS', DF)
    res['gravado'] = mudou or bool(dif_df or dif_exp)
    return res


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('site')
    ap.add_argument('--conferir', action='store_true')
    a = ap.parse_args()
    print(json.dumps(main(a.site, a.conferir), ensure_ascii=False, indent=1))
