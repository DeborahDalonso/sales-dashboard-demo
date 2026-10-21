(function () {
  'use strict';

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var D, C = {}, mesIdx = {}, nomesUF = {};
  var filtro = { periodo: '', local: '', cat: '', pag: '' };
  var graficos = {};

  // ---------- Formatação ----------
  var fmtInt = new Intl.NumberFormat('pt-BR');
  var fmtDec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmtUma = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function brlCurto(v) {
    if (v >= 1e6) return 'R$ ' + fmtDec.format(v / 1e6) + ' mi';
    if (v >= 1e3) return 'R$ ' + fmtInt.format(Math.round(v / 1e3)) + ' mil';
    return 'R$ ' + fmtInt.format(Math.round(v));
  }
  function brl(v) { return 'R$ ' + fmtDec.format(v); }
  function pct(v) { return fmtUma.format(v * 100) + '%'; }
  function rotuloMes(m) { var p = m.split('-'); return MESES[+p[1] - 1] + '/' + p[0].slice(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function cor(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }
  function anoAntes(m) { var p = m.split('-'); return (+p[0] - 1) + '-' + p[1]; }
  function soma(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }

  // ---------- Dados ----------
  function mesesDoPeriodo() {
    var p = filtro.periodo.split('|');
    return D.meses.filter(function (m) { return m >= p[0] && m <= p[1]; });
  }

  function passa(l, meses, ignorar) {
    if (meses.indexOf(D.meses[l[C.mes]]) === -1) return false;
    if (ignorar !== 'local' && filtro.local) {
      var uf = D.estados[l[C.customer_state]];
      if (filtro.local.indexOf('UF:') === 0) { if (uf !== filtro.local.slice(3)) return false; }
      else if (D.regioes[filtro.local.slice(2)].indexOf(uf) === -1) return false;
    }
    if (ignorar !== 'cat' && filtro.cat !== '' && l[C.categoria] !== +filtro.cat) return false;
    if (ignorar !== 'pag' && filtro.pag !== '' && l[C.pagamento] !== +filtro.pag) return false;
    return true;
  }
  function linhas(meses, ignorar) { return D.linhas.filter(function (l) { return passa(l, meses, ignorar); }); }

  function somar(ls) {
    var t = { pedidos: 0, faturamento: 0, nota_soma: 0, nota_n: 0, entregues: 0, dias_soma: 0, f: [] };
    for (var k = 0; k < 4; k++) t.f.push({ n: 0, nota: 0, av: 0 });
    ls.forEach(function (l) {
      t.pedidos += l[C.pedidos];
      t.faturamento += l[C.faturamento];
      t.nota_soma += l[C.nota_soma];
      t.nota_n += l[C.nota_n];
      t.entregues += l[C.entregues];
      t.dias_soma += l[C.dias_soma];
      for (var k = 0; k < 4; k++) {
        t.f[k].n += l[C['f' + k + '_n']];
        t.f[k].nota += l[C['f' + k + '_nota']];
        t.f[k].av += l[C['f' + k + '_av']];
      }
    });
    t.ticket = t.pedidos ? t.faturamento / t.pedidos : 0;
    t.nota = t.nota_n ? t.nota_soma / t.nota_n : 0;
    t.prazo = t.entregues ? t.f[0].n / t.entregues : 0;
    t.dias = t.entregues ? t.dias_soma / t.entregues : 0;
    return t;
  }

  // Soma uma medida agrupando pela coluna pedida.
  function agrupar(ls, coluna, medida) {
    var m = {};
    ls.forEach(function (l) {
      var k = l[C[coluna]];
      m[k] = (m[k] || 0) + l[C[medida || 'faturamento']];
    });
    return m;
  }

  // ---------- Base comum dos gráficos ----------
  function base() {
    return {
      animationDuration: 300,
      textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: cor('--tinta-2') },
      tooltip: {
        backgroundColor: cor('--superficie'), borderColor: cor('--borda'), borderWidth: 1,
        textStyle: { color: cor('--tinta'), fontSize: 13 },
        extraCssText: 'box-shadow:0 6px 20px rgba(40,5,15,.16);border-radius:10px;',
      },
    };
  }
  function eixoCat(extra) {
    return Object.assign({
      axisLine: { lineStyle: { color: cor('--eixo') } }, axisTick: { show: false },
      axisLabel: { color: cor('--tinta-muda') },
    }, extra || {});
  }
  function eixoVal(extra) {
    return Object.assign({
      splitLine: { lineStyle: { color: cor('--grade') } }, axisLine: { show: false },
      axisLabel: { color: cor('--tinta-muda') },
    }, extra || {});
  }
  function dica(valor, rotulo) {
    return '<b style="font-size:14px">' + valor + '</b><br><span style="color:' + cor('--tinta-2') + '">' + esc(rotulo) + '</span>';
  }

  // ---------- Indicadores com minigráfico ----------
  function renderIndicadores(meses, atual, anterior) {
    var porMes = meses.map(function (m) { return somar(linhas([m])); });
    var defs = [
      { id: 'fat', nome: 'Faturamento', valor: brlCurto(atual.faturamento), d: anterior && delta(atual.faturamento, anterior.faturamento), serie: porMes.map(function (t) { return t.faturamento; }) },
      { id: 'ped', nome: 'Pedidos', valor: fmtInt.format(atual.pedidos), d: anterior && delta(atual.pedidos, anterior.pedidos), serie: porMes.map(function (t) { return t.pedidos; }) },
      { id: 'tic', nome: 'Ticket médio', valor: brl(atual.ticket), d: anterior && delta(atual.ticket, anterior.ticket), serie: porMes.map(function (t) { return t.ticket; }) },
      { id: 'nota', nome: 'Nota média', valor: fmtDec.format(atual.nota) + ' de 5', d: anterior && diff(atual.nota, anterior.nota, fmtDec, ''), serie: porMes.map(function (t) { return t.nota; }) },
      { id: 'prazo', nome: 'Entregas no prazo', valor: pct(atual.prazo), d: anterior && diff(atual.prazo * 100, anterior.prazo * 100, fmtUma, ' p.p.'), serie: porMes.map(function (t) { return t.prazo; }) },
    ];
    var raiz = document.getElementById('indicadores');
    if (!raiz.children.length) {
      defs.forEach(function (def) {
        var card = document.createElement('article'); card.className = 'indicador';
        card.innerHTML = '<p class="indicador-nome"></p><p class="indicador-valor"></p><p class="indicador-delta"></p><div class="indicador-mini" aria-hidden="true"></div>';
        card.querySelector('.indicador-mini').id = 'mini-' + def.id;
        raiz.appendChild(card);
      });
    }
    defs.forEach(function (def, i) {
      var card = raiz.children[i];
      card.querySelector('.indicador-nome').textContent = def.nome;
      card.querySelector('.indicador-valor').textContent = def.valor;
      var d = card.querySelector('.indicador-delta');
      d.className = 'indicador-delta';
      d.textContent = '';
      if (def.d) {
        d.classList.add(def.d.sinal > 0 ? 'bom' : def.d.sinal < 0 ? 'ruim' : 'neutro');
        var b = document.createElement('b');
        b.textContent = (def.d.sinal > 0 ? '▲ ' : def.d.sinal < 0 ? '▼ ' : '= ') + def.d.texto;
        d.appendChild(b);
        d.appendChild(document.createTextNode(' vs ano anterior'));
      } else {
        d.textContent = 'sem ano anterior para comparar';
      }
      desenharMini('mini-' + def.id, def.serie);
    });
  }
  function delta(a, b) {
    if (!b) return null;
    var r = a / b - 1;
    return { sinal: Math.abs(r) < 0.0005 ? 0 : Math.sign(r), texto: (r > 0 ? '+' : '') + fmtUma.format(r * 100) + '%' };
  }
  function diff(a, b, fmt, sufixo) {
    var r = a - b;
    return { sinal: Math.abs(r) < 0.005 ? 0 : Math.sign(r), texto: (r > 0 ? '+' : '') + fmt.format(r) + sufixo };
  }
  function desenharMini(id, serie) {
    var c = cor('--cereja');
    desenhar(id, {
      animation: false,
      grid: { left: 2, right: 2, top: 4, bottom: 2 },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: serie.map(function (_, i) { return i; }) },
      yAxis: { type: 'value', show: false, scale: true },
      series: [{
        type: 'line', data: serie, symbol: 'none', smooth: 0.3, lineStyle: { width: 2, color: c },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: hexA(c, 0.22) }, { offset: 1, color: hexA(c, 0) }]) },
      }],
    });
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---------- Faturamento mensal ----------
  function renderMensal(meses, temComparacao) {
    var cereja = cor('--cereja'), ref = cor('--serie-ref');
    var atual = meses.map(function (m) { return somar(linhas([m])).faturamento; });
    var series = [{
      name: 'Período atual', type: 'line', data: atual, symbol: 'circle', symbolSize: 8, z: 3,
      lineStyle: { width: 2.5, color: cereja },
      itemStyle: { color: cereja, borderColor: cor('--superficie'), borderWidth: 2 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: hexA(cereja, 0.18) }, { offset: 1, color: hexA(cereja, 0) }]) },
      endLabel: { show: true, formatter: 'Atual', color: cor('--tinta'), fontWeight: 600 },
    }];
    var anterior = null;
    if (temComparacao) {
      anterior = meses.map(function (m) { return somar(linhas([anoAntes(m)])).faturamento; });
      series.push({
        name: 'Ano anterior', type: 'line', data: anterior, symbol: 'circle', symbolSize: 7, z: 2,
        lineStyle: { width: 2, color: ref },
        itemStyle: { color: ref, borderColor: cor('--superficie'), borderWidth: 2 },
        endLabel: { show: true, formatter: 'Ano anterior', color: cor('--tinta-muda') },
      });
    }
    var opt = base();
    opt.grid = { left: 8, right: 92, top: 40, bottom: 4, containLabel: true };
    opt.legend = { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 3, textStyle: { color: cor('--tinta-2') } };
    opt.tooltip.trigger = 'axis';
    opt.tooltip.axisPointer = { type: 'line', lineStyle: { color: cor('--eixo') } };
    opt.tooltip.formatter = function (ps) {
      var h = '<div style="font-weight:600;margin-bottom:4px">' + esc(ps[0].axisValue) + '</div>';
      ps.forEach(function (p) {
        h += '<div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:2px;background:' + p.color + '"></span><b>' + brl(p.value) + '</b><span style="color:' + cor('--tinta-2') + '">' + esc(p.seriesName) + '</span></div>';
      });
      return h;
    };
    opt.xAxis = eixoCat({ type: 'category', data: meses.map(rotuloMes), boundaryGap: false });
    opt.yAxis = eixoVal({ type: 'value', axisLabel: { color: cor('--tinta-muda'), formatter: function (v) { return brlCurto(v); } } });
    opt.series = series;
    desenhar('g-mensal', opt);

    var pico = atual.indexOf(Math.max.apply(null, atual));
    document.getElementById('sub-mensal').textContent = meses.length > 1
      ? 'Melhor mês: ' + rotuloMes(meses[pico]) + ', com ' + brlCurto(atual[pico])
      : 'Total do mês: ' + brlCurto(atual[0] || 0);

    var cab = ['Mês', 'Faturamento'];
    if (anterior) cab.push('Ano anterior', 'Variação');
    tabela('g-mensal', cab, meses.map(function (m, i) {
      var linha = [rotuloMes(m), brl(atual[i])];
      if (anterior) linha.push(brl(anterior[i]), anterior[i] ? (atual[i] > anterior[i] ? '+' : '') + fmtUma.format((atual[i] / anterior[i] - 1) * 100) + '%' : '—');
      return linha;
    }));
  }

  // ---------- Barras horizontais com destaque do selecionado ----------
  function barrasH(id, itens, opcoes) {
    var cereja = cor('--cereja');
    var opt = base();
    opt.grid = { left: 4, right: opcoes.margemDireita || 72, top: 4, bottom: 4, containLabel: true };
    opt.tooltip.trigger = 'item';
    opt.tooltip.formatter = function (p) { return dica(opcoes.dica(itens[p.dataIndex]), p.name); };
    opt.xAxis = { type: 'value', show: false, max: opcoes.max };
    opt.yAxis = eixoCat({
      type: 'category', inverse: true, data: itens.map(function (i) { return i.nome; }),
      axisLine: { show: false }, axisLabel: { color: cor('--tinta-2'), width: opcoes.larguraRotulo || 150, overflow: 'truncate' },
    });
    opt.series = [{
      type: 'bar', barWidth: '60%', cursor: opcoes.aoClicar ? 'pointer' : 'default',
      showBackground: true, backgroundStyle: { color: cor('--superficie-2'), borderRadius: 4 },
      data: itens.map(function (i) {
        return { value: i.valor, itemStyle: { color: cereja, opacity: i.apagado ? 0.28 : 1, borderRadius: [0, 4, 4, 0] } };
      }),
      label: { show: true, position: 'right', color: cor('--tinta-2'), formatter: function (p) { return opcoes.rotulo(itens[p.dataIndex]); } },
      emphasis: { itemStyle: { color: cor('--cereja-forte') } },
      markLine: opcoes.linha ? {
        symbol: 'none', silent: true, label: { show: false },
        lineStyle: { color: cor('--tinta-muda'), type: 'solid', width: 1 }, data: [{ xAxis: opcoes.linha.valor }],
      } : undefined,
    }];
    desenhar(id, opt, opcoes.aoClicar ? function (p) { opcoes.aoClicar(itens[p.dataIndex]); } : null);
  }

  // ---------- Categorias ----------
  function renderCategorias(meses) {
    var m = agrupar(linhas(meses, 'cat'), 'categoria');
    var todas = Object.keys(m).map(function (k) { return { idx: +k, nome: D.categorias[k], valor: m[k] }; })
      .sort(function (a, b) { return b.valor - a.valor; });
    var top = todas.slice(0, 10);
    if (filtro.cat !== '' && !top.some(function (c) { return c.idx === +filtro.cat; })) {
      var sel = todas.filter(function (c) { return c.idx === +filtro.cat; })[0];
      if (sel) top[top.length - 1] = sel;
    }
    top.forEach(function (c) { c.apagado = filtro.cat !== '' && c.idx !== +filtro.cat; });
    barrasH('g-categorias', top, {
      rotulo: function (c) { return brlCurto(c.valor); },
      dica: function (c) { return brl(c.valor); },
      aoClicar: function (c) { filtro.cat = filtro.cat === String(c.idx) ? '' : String(c.idx); sincronizarSelects(); atualizar(); },
    });
    var tot = soma(todas.map(function (c) { return c.valor; }));
    tabela('g-categorias', ['Categoria', 'Faturamento', 'Participação'], todas.map(function (c) { return [c.nome, brl(c.valor), pct(c.valor / tot)]; }));
  }

  // ---------- Pagamento ----------
  function renderPagamento(meses) {
    var m = agrupar(linhas(meses, 'pag'), 'pagamento');
    var tot = soma(Object.keys(m).map(function (k) { return m[k]; }));
    var itens = Object.keys(m).map(function (k) {
      return { idx: +k, nome: D.pagamentos[k], bruto: m[k], valor: tot ? m[k] / tot : 0, apagado: filtro.pag !== '' && +k !== +filtro.pag };
    }).sort(function (a, b) { return b.valor - a.valor; });
    barrasH('g-pagamento', itens, {
      max: 1, margemDireita: 52, larguraRotulo: 110,
      rotulo: function (i) { return pct(i.valor); },
      dica: function (i) { return pct(i.valor) + ' · ' + brlCurto(i.bruto); },
      aoClicar: function (i) { filtro.pag = filtro.pag === String(i.idx) ? '' : String(i.idx); sincronizarSelects(); atualizar(); },
    });
    document.getElementById('sub-pagamento').textContent = itens.length
      ? itens[0].nome + ' responde por ' + pct(itens[0].valor) + ' do faturamento'
      : 'Sem pedidos no filtro';
    tabela('g-pagamento', ['Forma de pagamento', 'Faturamento', 'Participação'], itens.map(function (i) { return [i.nome, brl(i.bruto), pct(i.valor)]; }));
  }

  // ---------- Mapa ----------
  function renderMapa(meses) {
    var m = agrupar(linhas(meses, 'local'), 'customer_state');
    var dados = D.estados.map(function (uf, i) { return { name: uf, value: m[i] || 0 }; });
    var max = Math.max.apply(null, dados.map(function (d) { return d.value; }));
    var tot = soma(dados.map(function (d) { return d.value; }));
    var selecionados = [];
    if (filtro.local.indexOf('UF:') === 0) selecionados = [filtro.local.slice(3)];
    else if (filtro.local) selecionados = D.regioes[filtro.local.slice(2)];

    var opt = base();
    opt.tooltip.trigger = 'item';
    opt.tooltip.formatter = function (p) { return dica(brl(p.value || 0) + ' · ' + pct(tot ? (p.value || 0) / tot : 0), nomesUF[p.name] || p.name); };
    opt.visualMap = {
      min: 0, max: max, left: 0, bottom: 4, itemWidth: 10, itemHeight: 120, calculable: false,
      text: [brlCurto(max), 'R$ 0'], textStyle: { color: cor('--tinta-muda'), fontSize: 11 },
      inRange: { color: [cor('--seq-0'), cor('--cereja'), cor('--seq-1')] },
    };
    opt.series = [{
      type: 'map', map: 'BR', roam: false, layoutCenter: ['56%', '50%'], layoutSize: '96%', cursor: 'pointer',
      selectedMode: false,
      itemStyle: { borderColor: cor('--superficie'), borderWidth: 1, areaColor: cor('--grade') },
      emphasis: { label: { show: true, color: cor('--tinta'), fontWeight: 700 }, itemStyle: { areaColor: null, borderColor: cor('--tinta'), borderWidth: 1.5 } },
      label: { show: false },
      data: dados.map(function (d) {
        var marcado = selecionados.indexOf(d.name) !== -1;
        return Object.assign({}, d, {
          itemStyle: marcado ? { borderColor: cor('--tinta'), borderWidth: 2 } : (selecionados.length ? { opacity: 0.4 } : {}),
          label: marcado ? { show: true, color: cor('--tinta'), fontWeight: 700, textBorderColor: cor('--superficie'), textBorderWidth: 3 } : undefined,
        });
      }),
    }];
    desenhar('g-mapa', opt, function (p) {
      var alvo = 'UF:' + p.name;
      filtro.local = filtro.local === alvo ? '' : alvo;
      sincronizarSelects(); atualizar();
    });
    var ordem = dados.slice().sort(function (a, b) { return b.value - a.value; });
    document.getElementById('sub-mapa').textContent = tot
      ? (nomesUF[ordem[0].name] || ordem[0].name) + ' concentra ' + pct(ordem[0].value / tot) + ' do faturamento. Clique num estado para filtrar.'
      : 'Clique num estado para filtrar o painel';
    tabela('g-mapa', ['Estado', 'Faturamento', 'Participação'], ordem.map(function (d) { return [nomesUF[d.name] + ' (' + d.name + ')', brl(d.value), pct(tot ? d.value / tot : 0)]; }));
  }

  // ---------- Atraso x nota ----------
  function renderAtraso(t) {
    var notas = t.f.map(function (f) { return f.av ? f.nota / f.av : 0; });
    var cereja = cor('--cereja');
    var opt = base();
    opt.grid = { left: 4, right: 8, top: 28, bottom: 4, containLabel: true };
    opt.tooltip.trigger = 'item';
    opt.tooltip.formatter = function (p) { return dica('Nota ' + fmtDec.format(p.value), p.name + ' · ' + fmtInt.format(t.f[p.dataIndex].n) + ' entregas'); };
    opt.xAxis = eixoCat({ type: 'category', data: D.faixas_atraso, axisLabel: { color: cor('--tinta-2') } });
    opt.yAxis = eixoVal({ type: 'value', min: 0, max: 5, interval: 1 });
    opt.series = [{
      type: 'bar', barWidth: '46%',
      data: notas.map(function (v) { return { value: v, itemStyle: { color: cereja, borderRadius: [5, 5, 0, 0] } }; }),
      label: { show: true, position: 'top', color: cor('--tinta'), fontWeight: 700, formatter: function (p) { return fmtDec.format(p.value); } },
    }];
    desenhar('g-atraso', opt);
    document.getElementById('sub-atraso').textContent = t.f[3].av
      ? 'No prazo, a nota média é ' + fmtDec.format(notas[0]) + '. Com 8 dias ou mais de atraso, cai para ' + fmtDec.format(notas[3]) + '.'
      : 'Nota média por dias de atraso em relação à data prometida';
    tabela('g-atraso', ['Atraso', 'Entregas', 'Nota média'], D.faixas_atraso.map(function (n, k) {
      return [n, fmtInt.format(t.f[k].n), t.f[k].av ? fmtDec.format(notas[k]) : '—'];
    }));
  }

  // ---------- Prazo médio de entrega por estado ----------
  function renderPrazo(meses, atual) {
    var ls = linhas(meses, 'local');
    var dias = agrupar(ls, 'customer_state', 'dias_soma');
    var ent = agrupar(ls, 'customer_state', 'entregues');
    var todos = Object.keys(ent).filter(function (k) { return ent[k] >= 20; }).map(function (k) {
      var uf = D.estados[k];
      return { uf: uf, nome: nomesUF[uf] || uf, valor: dias[k] / ent[k], n: ent[k] };
    }).sort(function (a, b) { return b.valor - a.valor; });
    var geral = somar(ls).dias;
    var selecionados = [];
    if (filtro.local.indexOf('UF:') === 0) selecionados = [filtro.local.slice(3)];
    else if (filtro.local) selecionados = D.regioes[filtro.local.slice(2)];
    var top = todos.slice(0, 8);
    todos.forEach(function (e) { if (selecionados.indexOf(e.uf) !== -1 && top.indexOf(e) === -1) top.push(e); });
    top.forEach(function (e) { e.apagado = selecionados.length > 0 && selecionados.indexOf(e.uf) === -1; });
    barrasH('g-prazo', top, {
      margemDireita: 64, larguraRotulo: 130,
      rotulo: function (e) { return fmtUma.format(e.valor) + ' dias'; },
      dica: function (e) { return fmtUma.format(e.valor) + ' dias · ' + fmtInt.format(e.n) + ' entregas'; },
      linha: { valor: geral, rotulo: 'Média ' + fmtUma.format(geral) },
      aoClicar: function (e) { var alvo = 'UF:' + e.uf; filtro.local = filtro.local === alvo ? '' : alvo; sincronizarSelects(); atualizar(); },
    });
    document.getElementById('sub-prazo').textContent = todos.length
      ? 'Dias entre a compra e a entrega. A linha vertical marca a média do país: ' + fmtUma.format(geral) + ' dias.'
      : 'Sem entregas no filtro';
    tabela('g-prazo', ['Estado', 'Dias médios', 'Entregas'], todos.map(function (e) { return [e.nome + ' (' + e.uf + ')', fmtUma.format(e.valor), fmtInt.format(e.n)]; }));
  }

  // ---------- Infra de gráficos e tabelas ----------
  function desenhar(id, opt, aoClicar) {
    var el = document.getElementById(id);
    if (!graficos[id]) {
      graficos[id] = echarts.init(el, null, { renderer: 'svg' });
      graficos[id].__clique = aoClicar;
      graficos[id].on('click', function (p) { if (graficos[id].__clique) graficos[id].__clique(p); });
    }
    graficos[id].__clique = aoClicar;
    graficos[id].setOption(opt, true);
  }

  function tabela(id, cab, dados) {
    var wrap = document.querySelector('[data-tabela="' + id + '"]');
    var t = document.createElement('table');
    var thead = t.createTHead().insertRow();
    cab.forEach(function (c, i) { var th = document.createElement('th'); th.textContent = c; if (i) th.className = 'num'; thead.appendChild(th); });
    var tb = t.createTBody();
    dados.forEach(function (linha) {
      var tr = tb.insertRow();
      linha.forEach(function (v, i) { var td = tr.insertCell(); td.textContent = v; if (i) td.className = 'num'; });
    });
    wrap.textContent = '';
    wrap.appendChild(t);
  }

  document.querySelectorAll('.botao-tabela').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-alvo');
      var g = document.getElementById(id), t = document.querySelector('[data-tabela="' + id + '"]');
      var mostrarTabela = t.hidden;
      t.hidden = !mostrarTabela; g.hidden = mostrarTabela;
      b.textContent = mostrarTabela ? 'Ver gráfico' : 'Ver tabela';
      if (!mostrarTabela && graficos[id]) graficos[id].resize();
    });
  });

  // ---------- Filtros ----------
  function opcao(sel, valor, texto, grupo) {
    var o = document.createElement('option'); o.value = valor; o.textContent = texto;
    (grupo || sel).appendChild(o);
  }
  function montarFiltros() {
    var local = document.getElementById('f-local');
    opcao(local, '', 'Todo o Brasil');
    var gR = document.createElement('optgroup'); gR.label = 'Regiões'; local.appendChild(gR);
    Object.keys(D.regioes).forEach(function (r) { opcao(local, 'R:' + r, r, gR); });
    var gE = document.createElement('optgroup'); gE.label = 'Estados'; local.appendChild(gE);
    D.estados.slice().sort(function (a, b) { return (nomesUF[a] || a).localeCompare(nomesUF[b] || b, 'pt-BR'); })
      .forEach(function (uf) { opcao(local, 'UF:' + uf, nomesUF[uf] || uf, gE); });

    var cat = document.getElementById('f-categoria');
    opcao(cat, '', 'Todas');
    D.categorias.map(function (n, i) { return { n: n, i: i }; })
      .sort(function (a, b) { return a.n.localeCompare(b.n, 'pt-BR'); })
      .forEach(function (c) { opcao(cat, String(c.i), c.n); });

    var pag = document.getElementById('f-pagamento');
    opcao(pag, '', 'Todas');
    D.pagamentos.forEach(function (p, i) { opcao(pag, String(i), p); });

    filtro.periodo = document.getElementById('f-periodo').value;
    [['f-periodo', 'periodo'], ['f-local', 'local'], ['f-categoria', 'cat'], ['f-pagamento', 'pag']].forEach(function (par) {
      document.getElementById(par[0]).addEventListener('change', function (e) { filtro[par[1]] = e.target.value; atualizar(); });
    });
    document.getElementById('botao-limpar').addEventListener('click', function () {
      filtro.local = ''; filtro.cat = ''; filtro.pag = '';
      sincronizarSelects(); atualizar();
    });
  }
  function sincronizarSelects() {
    document.getElementById('f-local').value = filtro.local;
    document.getElementById('f-categoria').value = filtro.cat;
    document.getElementById('f-pagamento').value = filtro.pag;
  }

  // ---------- Atualização ----------
  function atualizar() {
    var meses = mesesDoPeriodo();
    var mesesAnt = meses.map(anoAntes);
    var temComparacao = mesesAnt.every(function (m) { return m in mesIdx; });
    var atual = somar(linhas(meses));
    var anterior = temComparacao ? somar(linhas(mesesAnt)) : null;

    var sel = document.getElementById('f-periodo');
    document.getElementById('comparacao').textContent = temComparacao
      ? 'Comparando ' + sel.options[sel.selectedIndex].text.toLowerCase() + ' com os mesmos meses do ano anterior.'
      : 'O dataset começa em jan/2017, então este período não tem ano anterior para comparar.';

    renderIndicadores(meses, atual, anterior);
    renderMensal(meses, temComparacao);
    renderPagamento(meses);
    renderCategorias(meses);
    renderMapa(meses);
    renderAtraso(atual);
    renderPrazo(meses, atual);
  }

  // ---------- Menu no celular ----------
  var menu = document.getElementById('menu'), fundo = document.getElementById('menu-fundo'), botaoMenu = document.getElementById('botao-menu');
  function abrirMenu(abrir) {
    menu.classList.toggle('aberto', abrir);
    fundo.hidden = !abrir;
    botaoMenu.setAttribute('aria-expanded', String(abrir));
    botaoMenu.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
  }
  botaoMenu.addEventListener('click', function () { abrirMenu(!menu.classList.contains('aberto')); });
  fundo.addEventListener('click', function () { abrirMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') abrirMenu(false); });
  menu.querySelectorAll('nav a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      menu.querySelectorAll('nav a').forEach(function (x) { x.classList.remove('ativo'); x.removeAttribute('aria-current'); });
      a.classList.add('ativo'); a.setAttribute('aria-current', 'page');
      abrirMenu(false);
    });
  });

  // ---------- Tema ----------
  function temaEscuro() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.getElementById('botao-tema').addEventListener('click', function () {
    var novo = temaEscuro() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    try { localStorage.setItem('tema', novo); } catch (e) {}
    if (D) atualizar();
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (D) atualizar(); });
  }
  var espera;
  window.addEventListener('resize', function () {
    clearTimeout(espera);
    espera = setTimeout(function () { Object.keys(graficos).forEach(function (k) { graficos[k].resize(); }); }, 120);
  });

  // ---------- Início ----------
  Promise.all([
    fetch('data/vendas.json').then(function (r) { return r.json(); }),
    fetch('data/brasil.json').then(function (r) { return r.json(); }),
  ]).then(function (res) {
    D = res[0];
    D.colunas.forEach(function (c, i) { C[c] = i; });
    D.meses.forEach(function (m, i) { mesIdx[m] = i; });
    res[1].features.forEach(function (f) { nomesUF[f.properties.name] = f.properties.nome; });
    echarts.registerMap('BR', res[1]);
    montarFiltros();
    atualizar();
  }).catch(function (e) {
    document.getElementById('comparacao').textContent = 'Não foi possível carregar os dados: ' + e.message;
  });
})();
