"""Interrupções da Crítica (Critica*.txt) somadas por trecho: NAE (coletivas) e individuais.

Leitura (ver bases.md do usuário): separador ';', latin-1, sem tratamento de aspas, mapear colunas pelo nome.
Uma linha é um passo de manobra (o mesmo passo pode vir em várias linhas, uma por localidade: somam-se); a
ocorrência é NUM_SEQ_OPER_INIC_HDE. O mês é a competência (DTA_CMPT_HDE), não a data de abertura: o arquivo de
um mês traz linhas de competência do mês seguinte, que voltam no arquivo do próprio mês só com os indicadores
recalculados; fica uma vez só, a do arquivo do mês da competência.

Onde cai cada ocorrência:
    - DJ (ABRANGÊNCIA = DJ): T1.
    - Subestação (ABRANGÊNCIA = SE): fora dos trechos, como "na subestação" (o defeito não está na rede).
    - Ativo do problema que abre um trecho (religador ou fusível): esse trecho.
    - Senão, o ativo (do problema ou interrompido) com ponto no cadastro: trecho do vão mais próximo.
      Individual (UC) cai pelo trafo que atende o consumidor.
    - Ativo que não está no cadastro atual: fora dos trechos ("hoje no <outro alimentador>" quando achado
      no KML de outro alimentador passado em `outros`).
Consumidor·hora (chi) é a soma, passo a passo, de consumidores × duração do passo; cons × dur (maior passo) dobrava o
número. Cada ocorrência leva as marcas mom (todos os passos momentâneos, < 3 min: COD_TEMP_MIN_HDE = AN1), dc (passo
em dia crítico: STA_CALC_IND_HDE = C) e long (mais de 24 h); nenhuma sai da NAE, as telas decidem. DEC e FEC pelo
PRODIST (sem momentâneas e sem dia crítico), para conferir com o oficial: prodist(). Cada ocorrência leva também
dec_conj e fec_conj: o que ela pesa no DEC (h) e no FEC do conjunto ANEEL (QTD_IDEC_CONJ, QTD_IFEC_CONJ), somado só
nos passos que o PRODIST conta (sem momentâneo e sem dia crítico); são os critérios DEC e FEC da Priorização.
O número da UC (consumidor) não entra nas ocorrências; a busca por UC do site guarda à parte só UC → transformador
(scripts/atualiza_critica.py, dados/uc/).
"""
import csv
import re
import unicodedata
from collections import OrderedDict
from pathlib import Path

from .regras import haversine

csv.field_size_limit(10**7)


# identifica um passo de manobra; o que muda entre arquivos para o mesmo passo são só os indicadores (QTD_I…)
PASSO = ('NUM_SEQ_OPER_INIC_HDE', 'NUM_PASSO_INIC_HDE', 'NUM_PASSO_FIM_HDE', 'DTA_CMPT_HDE', 'TIPO_INTER_KTI',
         'COD_ELE_PROBLEMA', 'COD_ELE_INTERROMPIDO', 'DTA_ABERT', 'DTA_FECH', 'COD_ELE_FECHADO')


# Alimentador reclassificado: código que a Crítica passou a usar → alimentador do cadastro do site onde essa rede está.
# As ocorrências entram no alimentador do site; o ativo que ainda não está no cadastro fica sem trecho (conta no
# alimentador, no município e no polo). Tirar a linha quando o cadastro do GIS trouxer o código novo.
RECLASSIFICADOS = {'PS01112193': 'LD03105019'}      # Campos Lindos, conjunto Bielândia (Crítica de mai/2026)


# colunas guardadas de cada linha (o resto do arquivo não é usado)
CAMPOS = PASSO + ('ABRANGÊNCIA', 'COD_ELE_REDE_PROBLEMA', 'COD_ELE_REDE_INTERROMPIDO', 'QTD_CONS_INTER_FAT', 'DURACAO',
                  'DES_CAUSA_INTER_CAU', 'DES_SUB_CAUSA_INTER_SCR', 'QTD_IFEC_ALIM', 'QTD_IDEC_ALIM', 'COD_ALIMENTADOR',
                  'COD_TEMP_MIN_HDE', 'STA_CALC_IND_HDE', 'QTD_IDEC_ETO', 'QTD_IFEC_ETO', 'QTD_IDEC_CONJ', 'QTD_IFEC_CONJ')

LONGA_MIN = 24 * 60        # ocorrência acima de 24 h: provável registro não fechado; marcada (long), não tirada


def momentanea(d):
    """Passo de menos de 3 min (PRODIST: fora do DEC e do FEC). AN1 na Crítica; arquivo sem a coluna: pela duração."""
    t = (d.get('COD_TEMP_MIN_HDE') or '').strip()
    return t == 'AN1' if t else _num(d['DURACAO']) < 3


def dia_critico(d):
    """Passo em dia crítico (PRODIST: fora do DEC e do FEC; a Crítica marca STA_CALC_IND_HDE = C)."""
    return (d.get('STA_CALC_IND_HDE') or '').strip().upper() == 'C'


def ler(arquivos, alimentador=None):
    """Linhas do alimentador de todos os arquivos (alimentador=None: dict alimentador → linhas, lendo os arquivos
    uma vez só). Passo que vem em mais de um arquivo fica uma vez só: a versão do arquivo do mês da competência
    (Critica-…_MM-AAAA.txt) ou, sem ele, a do primeiro arquivo."""
    por_passo = OrderedDict()                       # (alimentador, passo) → (mês-ano do arquivo, linhas desse arquivo)
    for arq in arquivos:
        m = re.search(r'(\d{2})-(\d{4})', Path(arq).name)
        mes_arq = f'{m.group(1)}/{m.group(2)[2:]}' if m else None      # 'mm/aa', como no fim de DTA_CMPT_HDE
        deste, vistas = {}, set()
        with open(arq, encoding='latin-1', newline='') as fh:
            r = csv.reader(fh, delimiter=';', quoting=csv.QUOTE_NONE)
            cab = next(r)
            for row in r:
                if len(row) != len(cab) or tuple(row) in vistas:
                    continue
                vistas.add(tuple(row))
                d = dict(zip(cab, row))
                al = d['COD_ALIMENTADOR'].strip()
                al = RECLASSIFICADOS.get(al, al)
                if alimentador is None or al == alimentador:
                    d = {c: d.get(c, '') for c in CAMPOS}
                    deste.setdefault((al,) + tuple(d[c] for c in PASSO), []).append(d)
        for k, ls in deste.items():
            if k not in por_passo or _mes_cmpt(ls[0]) == mes_arq != por_passo[k][0]:
                por_passo[k] = (mes_arq, ls)
    if alimentador is not None:
        return [d for _, ls in por_passo.values() for d in ls]
    todos = {}
    for (al, *_), (_, ls) in por_passo.items():
        todos.setdefault(al, []).extend(ls)
    return todos


def _mes_cmpt(d):
    return d['DTA_CMPT_HDE'].strip()[3:8]              # 'dd/mm/aa' → 'mm/aa'


def pontos_kml(arq):
    """nome → (lat, lon) de todo Placemark de ponto do KML (chaves e transformadores)."""
    s = open(arq, encoding='utf-8', errors='replace').read()
    out = {}
    for pm in re.findall(r'<Placemark>(.*?)</Placemark>', s, re.S):      # um Placemark por vez: linear no arquivo
        nome = re.match(r'\s*<name>([^<]+)</name>', pm)
        pt = re.search(r'<Point>\s*<coordinates>\s*([-\d.]+),([-\d.]+)', pm)
        if nome and pt:
            out.setdefault(nome.group(1).strip(), (float(pt.group(2)), float(pt.group(1))))
    return out


def _num(x):
    x = x.strip().replace(',', '.')
    return float(x) if x not in ('', '.') else 0.0


def _data(s):   # 'dd/mm/aaaa hh:mm' → 'aaaa-mm-dd hh:mm' (ordena)
    return f'{s[6:10]}-{s[3:5]}-{s[:2]}{s[10:16]}'


def _programada(causa):
    """'DISTRIBUICAO PROGRAMADA' e 'PROGRAMADAS' sim; 'NAO-PROGRAMADAS…' não."""
    c = causa.strip().upper()
    return 'PROGRAMADA' in c and not c.startswith('NAO')


def arvore_na_rede(o):
    """Ocorrência de vegetação: causa MEIO AMBIENTE e subcausa ÁRVORE (pequeno/médio ou grande porte) ou EUCALIPTO,
    na rede/faixa. Ficam fora árvore no ramal (causa entrada de serviço) e poda de árvores."""
    return _sem_acento(o['causa']) == 'MEIO AMBIENTE' and _sem_acento(o['sub']).startswith(('ARVORE', 'EUCALIPTO'))


def _sem_acento(x):
    return unicodedata.normalize('NFKD', x).encode('ascii', 'ignore').decode().upper().strip()


def vegetacao_ampla(o, poda=True):
    """Leitura ampla de vegetação, só para conferir a sensibilidade (a NAE do site usa arvore_na_rede): mais ventos
    fortes (Meio Ambiente), árvore no ramal e, com poda=True, poda de árvores por terceiros."""
    sub = _sem_acento(o['sub'])
    return (arvore_na_rede(o) or (_sem_acento(o['causa']) == 'MEIO AMBIENTE' and sub.startswith('VENTOS'))
            or 'ARVORE NO RAMAL' in sub or (poda and 'ARVORE' in sub))


def ocorrencias(linhas):
    """Agrupa os passos por ocorrência e mês de competência."""
    oc = OrderedDict()
    for d in sorted(linhas, key=lambda d: _data(d['DTA_ABERT'])):
        cmpt = d['DTA_CMPT_HDE'].strip()            # dd/mm/aa
        k = (d['NUM_SEQ_OPER_INIC_HDE'], cmpt)
        o = oc.get(k)
        if o is None:
            o = oc[k] = dict(
                mes=f'20{cmpt[6:8]}-{cmpt[3:5]}', abert=_data(d['DTA_ABERT']), coletiva=d['TIPO_INTER_KTI'].startswith('COLE'),
                abr=d['ABRANGÊNCIA'].strip(), prob=d['COD_ELE_PROBLEMA'].strip(), prob_tipo=d['COD_ELE_REDE_PROBLEMA'].strip(),
                inter=d['COD_ELE_INTERROMPIDO'].strip(), inter_tipo=d['COD_ELE_REDE_INTERROMPIDO'].strip(),
                causa=d['DES_CAUSA_INTER_CAU'].strip().capitalize(), sub=d['DES_SUB_CAUSA_INTER_SCR'].strip().capitalize(),
                programada=_programada(d['DES_CAUSA_INTER_CAU']), cons=0, chi=0.0, dur=0, fec=0.0, dec=0.0,
                mom=True, dc=False, dec_conj=0.0, fec_conj=0.0)
        c = int(_num(d['QTD_CONS_INTER_FAT']))
        o['cons'] += c
        o['chi'] += c * _num(d['DURACAO']) / 60
        o['dur'] = max(o['dur'], int(_num(d['DURACAO'])))
        o['fec'] += _num(d['QTD_IFEC_ALIM'])
        o['dec'] += _num(d['QTD_IDEC_ALIM'])
        if not momentanea(d) and not dia_critico(d):   # DEC e FEC do conjunto pelo PRODIST, passo a passo
            o['dec_conj'] += _num(d.get('QTD_IDEC_CONJ') or '')
            o['fec_conj'] += _num(d.get('QTD_IFEC_CONJ') or '')
        o['mom'] = o['mom'] and momentanea(d)      # momentânea só se todos os passos forem
        o['dc'] = o['dc'] or dia_critico(d)
    for o in oc.values():
        o['long'] = o['dur'] > LONGA_MIN
        if o['prob_tipo'] == 'UC':                  # não guarda o número do consumidor (a busca por UC tem o dela)
            o['prob'] = ''
    return list(oc.values())


def prodist(linhas, nivel='ETO', causa=None):
    """DEC (h) e FEC somados dos passos (QTD_IDEC_<nivel>, QTD_IFEC_<nivel>): bruto e pelo PRODIST, sem os passos
    momentâneos e sem os de dia crítico. Para conferir com o oficial; linhas de critica.ler() (um passo uma vez só).
    causa: só os passos dessa causa (arvore_na_rede, vegetacao_ampla...), para a fatia de vegetação."""
    ls = [d for v in (linhas.values() if isinstance(linhas, dict) else [linhas]) for d in v
          if causa is None or causa(dict(causa=d['DES_CAUSA_INTER_CAU'], sub=d['DES_SUB_CAUSA_INTER_SCR']))]
    soma = lambda f, k: sum(_num(d.get(f'QTD_{k}_{nivel}') or '') for d in ls if f(d))
    todos, fora_mom, fora_dc = (lambda d: True), momentanea, (lambda d: dia_critico(d) and not momentanea(d))
    ok = lambda d: not momentanea(d) and not dia_critico(d)
    return dict(dec=soma(ok, 'IDEC'), fec=soma(ok, 'IFEC'), dec_bruto=soma(todos, 'IDEC'), fec_bruto=soma(todos, 'IFEC'),
                dec_mom=soma(fora_mom, 'IDEC'), fec_mom=soma(fora_mom, 'IFEC'),
                dec_dc=soma(fora_dc, 'IDEC'), fec_dc=soma(fora_dc, 'IFEC'))


def dec_prodist(linhas, nivel='ETO'):
    """DEC em horas pelo PRODIST (sem momentâneas e sem dia crítico)."""
    return prodist(linhas, nivel)['dec']


def fec_prodist(linhas, nivel='ETO'):
    """FEC pelo PRODIST (sem momentâneas e sem dia crítico)."""
    return prodist(linhas, nivel)['fec']


def por_trecho(oc, res, ts, pontos, outros=None):
    """Põe em cada ocorrência o trecho (ou o motivo de ficar fora), o ativo usado para localizar, a regra
    (abrangência DJ, chave de início do trecho, vão mais próximo do ponto do ativo) e, na última, a distância em m."""
    inicio = {t['inicio']: t['nome'] for t in ts}
    perto = {}

    def trecho_do_ponto(cod):
        if cod not in perto:
            p = pontos[cod]
            dist, v = min((min(haversine(p, v['a']), haversine(p, v['b'])), i) for i, v in enumerate(res['vaos']))
            perto[cod] = (res['vaos'][v]['trecho'], round(dist, 1))
        return perto[cod]

    for o in oc:
        o['dist_m'] = None
        if o['abr'] == 'DJ':
            o['trecho'], o['ativo'], o['regra'] = 'T1', o['prob'], 'abrangência DJ'
        elif o['abr'] == 'SE':
            o['trecho'], o['ativo'], o['fora'], o['regra'] = None, o['prob'] or o['inter'], 'na subestação', 'abrangência SE'
        elif o['prob'] in inicio:
            o['trecho'], o['ativo'], o['regra'] = inicio[o['prob']], o['prob'], 'chave de início do trecho'
        else:
            achado = next((c for c in (o['prob'], o['inter']) if c and c in pontos), None)
            if achado:
                (o['trecho'], o['dist_m']), o['ativo'], o['regra'] = trecho_do_ponto(achado), achado, 'vão mais próximo do ativo'
            else:
                o['regra'] = 'ativo fora do KML'
                o['ativo'] = o['prob'] or o['inter']
                onde = next((nome for nome, pts in (outros or {}).items() if o['ativo'] in pts), None)
                o['trecho'] = None
                o['fora'] = f'hoje no {onde}' if onde else 'fora do cadastro atual'
    return oc
