"""Crítica nova no site: a NAE de cada trecho só com os dados do próprio site (sem KML e sem o acervo do GIS).

    python scripts/atualiza_critica.py --site site --critica "Criticas/Critica-CHEIO_*-2026.txt" [--planilha NAE.xlsx]
    python scripts/atualiza_critica.py --site site --conferir

O site guarda tudo o que a associação usa:
  - dados/alimentadores/<AL>.json (scripts/gera_trechos.py): trechos com a chave de início, vãos, chaves e
    'chaves_sem_topologia' (pontos do KML que a topologia não usa, com o trecho do vão mais próximo);
  - dados/trafos_gis.json (scripts/ativos_gis.py): os transformadores do acervo do GIS com o alimentador do GIS.
Regras, nesta ordem (as mesmas de alimentador/critica.py e de scripts/ativos_gis.py):
  abrangência DJ → T1; abrangência SE → sem trecho ('na subestação'); chave do problema que abre um trecho → esse
  trecho; ativo (do problema ou o interrompido) com ponto no cadastro do alimentador → trecho do vão mais próximo;
  senão 'hoje no X' (ativo no cadastro de outro alimentador) ou 'fora do cadastro atual'; e, se for transformador do
  GIS a até 50 m da rede, o trecho do vão mais próximo (GIS). Depois, a NAE com o ativo hoje no X entra também no
  trecho do X ('nae.ext'), e cada NAE com trecho ganha o ponto do ativo (mapa).

Meses: os meses dos arquivos passados (MM-AAAA no nome) são trocados inteiros; os outros meses do site ficam. Mês de
competência que só aparece de passagem (linha do mês seguinte no arquivo de um mês) entra só se o site ainda não tem
esse mês. Passar todos os arquivos refaz tudo. Alimentadores bloqueados (status falha) ficam como estão.
Trechos, vãos, municípios e KMZ não mudam. Depois: páginas, índice, ranking, polos e relatório refeitos.

--conferir: refaz a associação das NAE que já estão no site com os dados guardados e compara; nada é gravado.
--semear: site gerado antes de 'chaves_sem_topologia' (sem os KMLs à mão): monta a lista com as chaves fora da
topologia que as NAE do site já localizaram (trecho e distância, sem o ponto). Rodar uma vez; a próxima geração com
os KMLs (gera_trechos.py) grava a lista completa, com o ponto de cada uma.
"""
import argparse
import copy
import glob
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ativos_gis as ag  # noqa: E402
import gera_trechos as gt  # noqa: E402
from alimentador import critica  # noqa: E402
from alimentador.regras import haversine  # noqa: E402

CAMPOS = ('trecho', 'regra', 'fora', 'ativo')        # o que a associação decide (mais a distância)


class Cadastro:
    """O que o site sabe de cada alimentador para localizar o ativo de uma ocorrência."""

    def __init__(self, site):
        self.site = site
        self.cs = {f.stem: json.loads(f.read_text(encoding='utf-8'))
                   for f in sorted((site / 'dados' / 'alimentadores').glob('*.json'))}
        self.trafos = ag.le_trafos(site)
        if self.trafos is None:
            raise SystemExit(f'{site}: sem dados/trafos_gis.json. Rode uma vez scripts/ativos_gis.py <site> <acervo do GIS>.')
        # ativos no cadastro de cada alimentador ('hoje no X'), na ordem de alimentador como na leitura dos KMLs
        self.membros = [(al, {ch['nome'] for ch in c.get('chaves') or []} | {p[0] for p in c.get('chaves_sem_topologia') or []})
                        for al, c in sorted(self.cs.items())]

    def publicado(self, al):
        return self.cs[al]['validacao']['status'] != 'falha' and (self.site / 'alimentadores' / al / 'dados.js').exists()

    def associa(self, al, oc):
        """Trecho, regra, distância, ativo e motivo em cada ocorrência (formato do site; '_cand' = [problema, interrompido])."""
        c = self.cs[al]
        ts, vaos = c['trechos'], c['vaos']
        inicio = {}
        for t in ts:
            inicio[(t['inicio'] or {}).get('chave')] = t['nome']
        pontos = {ch['nome']: (ch['lonlat'][1], ch['lonlat'][0]) for ch in c['chaves']}
        extra = {p[0]: p for p in c.get('chaves_sem_topologia') or [] if p[3]}   # sem trecho: só se sabe que existe
        perto, onde = {}, ag.onde_no(c, self.trafos)

        def trecho_do_ponto(cod):
            if cod not in perto:
                if cod in pontos:
                    p = pontos[cod]
                    d, i = min((min(haversine(p, (v[1], v[0])), haversine(p, (v[3], v[2]))), i) for i, v in enumerate(vaos))
                    perto[cod] = (ts[vaos[i][4]]['nome'], round(d, 1))
                else:
                    perto[cod] = (extra[cod][3], extra[cod][4])
            return perto[cod]

        for o in oc:
            cand = o.pop('_cand')
            o.update(trecho=None, fora=None, regra=None, dist_m=None)
            if o['abr'] == 'DJ':
                o.update(trecho='T1', ativo=o['prob'], regra='abrangência DJ')
            elif o['abr'] == 'SE':
                o.update(ativo=cand[0] or cand[1], fora='na subestação', regra='abrangência SE')
            elif o['prob'] in inicio:
                o.update(trecho=inicio[o['prob']], ativo=o['prob'], regra='chave de início do trecho')
            else:
                achado = next((x for x in cand if x and (x in pontos or x in extra)), None)
                if achado:
                    t, d = trecho_do_ponto(achado)
                    o.update(trecho=t, dist_m=d, ativo=achado, regra='vão mais próximo do ativo')
                else:
                    at = cand[0] or cand[1]
                    x = next((x for x, ms in self.membros if x != al and at and at in ms), None)
                    o.update(ativo=at, regra='ativo fora do KML', fora=f'hoje no {x}' if x else 'fora do cadastro atual')
                    ag.no_gis(o, al, self.trafos, onde)
        return oc


def no_formato(o):
    """Ocorrência de critica.ocorrencias() no formato do site (o mesmo de trechos.dados_mapa)."""
    return dict(mes=o['mes'], dia=f"{o['abert'][8:10]}/{o['abert'][5:7]} {o['abert'][11:16]}", col=o['coletiva'],
                abr=o['abr'], ativo=None, prob=o['prob'], causa=o['causa'], sub=o['sub'], prog=o['programada'],
                cons=o['cons'], dur=o['dur'], trecho=None, fora=None, regra=None, dist_m=None, _cand=[o['prob'], o['inter']])


def abertura(o):
    """Ordem das ocorrências: data de abertura (o ano sai do mês de competência; dezembro ↔ janeiro)."""
    ano, mc, ma = int(o['mes'][:4]), int(o['mes'][5:7]), int(o['dia'][3:5])
    ano += -1 if ma - mc > 6 else 1 if mc - ma > 6 else 0
    return ano, ma, int(o['dia'][:2]), o['dia'][6:]


def mes_do_arquivo(f):
    m = re.search(r'(\d{2})-(\d{4})', Path(f).name)
    return f'{m.group(2)}-{m.group(1)}' if m else None


def semear(site):
    """'chaves_sem_topologia' a partir das NAE já localizadas no site (ver --semear)."""
    cad = Cadastro(site)
    chaves = {al: {ch['nome'] for ch in c.get('chaves') or []} for al, c in cad.cs.items()}
    lista = {al: {p[0]: p for p in c.get('chaves_sem_topologia') or []} for al, c in cad.cs.items()}
    for al, c in sorted(cad.cs.items()):
        for o in (c.get('nae') or {}).get('oc') or []:
            at, fora = o.get('ativo'), o.get('fora') or ''
            if o.get('regra') == 'vão mais próximo do ativo' and at not in chaves[al]:
                lista[al][at] = [at, None, None, o['trecho'], o['dist_m']]       # chave no KML daqui, fora da topologia
            elif o.get('regra') == 'ativo fora do KML' and fora.startswith('hoje no ') and fora[8:] in lista:
                x, cod = fora[8:], next((k for k in (at, o.get('prob')) if k in cad.trafos), None)
                gis = ag.E_TRAFO(o) and cod and cad.trafos[cod][2] == x          # o X veio do GIS, não do KML
                if not gis and at not in chaves[x] and at not in lista[x]:
                    lista[x][at] = [at, None, None, None, None]                   # existe no KML do X (sem trecho)
    n = 0
    for al, c in sorted(cad.cs.items()):
        novo = sorted(lista[al].values())
        if novo != (c.get('chaves_sem_topologia') or []) or 'chaves_sem_topologia' not in c:
            c['chaves_sem_topologia'] = novo
            gt.grava_json(site / 'dados' / 'alimentadores' / f'{al}.json', c)
        n += len(novo)
    print(f'chaves fora da topologia guardadas: {n}')
    return 0


def conferir(site):
    """Refaz a associação das NAE do site e compara com o que está gravado."""
    cad = Cadastro(site)
    dif, n, ex = {}, 0, []
    for al in sorted(cad.cs):
        if not cad.publicado(al) or not (cad.cs[al].get('nae') or {}).get('oc'):
            continue
        antes = cad.cs[al]['nae']['oc']
        depois = cad.associa(al, [dict({k: v for k, v in o.items() if k not in ('lonlat', 'hoje')},
                                       _cand=[o['prob'], o['ativo']]) for o in antes])
        for a, b in zip(antes, depois):
            n += 1
            for k in CAMPOS:
                if a.get(k) != b.get(k):
                    dif[k] = dif.get(k, 0) + 1
                    if len(ex) < 10:
                        ex.append(f'{al} {a["mes"]} {a["dia"]} {a.get("ativo")}: {k} {a.get(k)!r} → {b.get(k)!r}')
            da, db = a.get('dist_m'), b.get('dist_m')
            if (da is None) != (db is None) or (da is not None and abs(da - db) > 0.15):
                dif['dist_m'] = dif.get('dist_m', 0) + 1
        if [abertura(o) for o in antes] != sorted(abertura(o) for o in antes):
            dif['ordem'] = dif.get('ordem', 0) + 1
    print(f'{n} NAE conferidas; diferenças: {dif or "nenhuma"}')
    for e in ex:
        print('  ' + e)
    return 0 if not dif else 1


def atualizar(site, arqs, filtro, planilha=None):
    cad = Cadastro(site)
    linhas = critica.ler(arqs)
    meses_novos = {f'20{d["DTA_CMPT_HDE"].strip()[6:8]}-{d["DTA_CMPT_HDE"].strip()[3:5]}' for ls in linhas.values() for d in ls}
    meses_arq = {m for m in map(mes_do_arquivo, arqs) if m}
    if not meses_arq:
        print('aviso: nenhum arquivo com MM-AAAA no nome; só entram meses que o site ainda não tem')
    meses_site = {m for al, c in cad.cs.items() if cad.publicado(al) for m in (c.get('nae') or {}).get('meses') or []}
    trocar = meses_arq | (meses_novos - meses_site)
    print(f'Crítica: {len(arqs)} arquivo(s); meses trocados ou novos: {", ".join(sorted(trocar)) or "nenhum"}')
    tot = dict(alimentadores=0, nae=0, com_trecho=0)
    sem = {}
    for al in sorted(cad.cs):
        c = cad.cs[al]
        if not cad.publicado(al):
            continue
        filtro_site = (c.get('origem') or {}).get('nae_filtro')
        if filtro_site and filtro_site != filtro and not meses_site <= trocar:
            raise SystemExit(f'{al}: o site tem NAE com filtro {filtro_site}; com --nae {filtro} passe todos os meses')
        oc = critica.ocorrencias(linhas.get(al, []))
        if filtro == 'arvore':
            oc = [o for o in oc if critica.arvore_na_rede(o)]
        novas = cad.associa(al, [no_formato(o) for o in oc if o['mes'] in trocar])
        velhas = [{k: v for k, v in o.items() if k not in ('lonlat', 'hoje')}
                  for o in (c.get('nae') or {}).get('oc') or [] if o['mes'] not in trocar]
        nae = dict(meses=sorted(meses_site | meses_novos), oc=sorted(velhas + novas, key=abertura))
        orig = c['origem']
        orig['critica'] = sorted([f for f in orig.get('critica') or [] if mes_do_arquivo(f) not in meses_arq] +
                                 [Path(f).name for f in arqs], key=lambda f: (mes_do_arquivo(f) or '', f))
        orig['nae_filtro'] = filtro
        c['nae'] = nae
        gt.grava_json(site / 'dados' / 'alimentadores' / f'{al}.json', c)
        js = site / 'alimentadores' / al / 'dados.js'
        cab, D = ag.le_js(js)
        D['nae'] = copy.deepcopy(nae)
        D['meta'] = gt.meta_interface(c)
        js.write_text(cab + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
        tot['alimentadores'] += 1
        tot['nae'] += len(nae['oc'])
        tot['com_trecho'] += sum(1 for o in nae['oc'] if o['trecho'])
        for o in nae['oc']:
            if not o['trecho']:
                k = (o.get('fora') or '')[:7] if (o.get('fora') or '').startswith('hoje no') else o.get('fora') or '?'
                sem[k] = sem.get(k, 0) + 1
    tot.update(ag.outros(site, pts=cad.trafos))       # 'hoje no X': também no trecho do X (nae.ext)
    tot.update(ag.posicoes(site, pts=cad.trafos))     # ponto do ativo de cada NAE com trecho (mapa)
    dados, man = gt.interface(site)
    rel = site / 'relatorio.md'
    sem_kml = re.findall(r'^- (\S+): sem KML do Daimon', rel.read_text(encoding='utf-8'), re.M) if rel.exists() else []
    gt.relatorio(site, dados, man, sem_kml)
    ok = gt.validar_saida(site)
    print(f'{tot["alimentadores"]} alimentador(es) · {tot["nae"]} NAE · {tot["com_trecho"]} com trecho · '
          f'{tot["no_trecho_do_outro"]} também no trecho de outro alimentador')
    print('sem trecho: ' + (', '.join(f'{k} {n}' for k, n in sorted(sem.items(), key=lambda x: -x[1])) or 'nenhuma'))
    if planilha:
        import planilha_trechos
        planilha_trechos.main(str(site / 'dados' / 'alimentadores'), str(site / 'manifesto.json'), str(planilha))
    return 0 if ok else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--site', required=True, help='pasta do site (a mesma publicada)')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--critica', action='append', help="Critica*.txt (aceita padrão entre aspas; repetir)")
    g.add_argument('--conferir', action='store_true', help='refaz a associação das NAE do site e compara')
    g.add_argument('--semear', action='store_true', help='site sem chaves_sem_topologia: monta pelas NAE já localizadas')
    ap.add_argument('--nae', choices=('arvore', 'todas'), default='arvore')
    ap.add_argument('--planilha', help='grava também a planilha (Excel) com trechos e NAE')
    a = ap.parse_args(argv)
    site = Path(a.site)
    if a.conferir:
        return conferir(site)
    if a.semear:
        return semear(site)
    arqs = sorted({f for p in a.critica for f in glob.glob(p)})
    if not arqs:
        raise SystemExit(f'nenhum arquivo da Crítica em {a.critica}')
    return atualizar(site, arqs, a.nae, a.planilha)


if __name__ == '__main__':
    sys.exit(main())
