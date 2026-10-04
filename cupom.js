/* cupom.js — cupom de parceiro e promoção da primeira semana do mês.
   Pedra do Céu Cabanas.

   Funciona "por cima" da página reservar.html: não muda o cálculo original,
   só acrescenta o desconto no total mostrado e na mensagem do WhatsApp.
   Configuração em cupons.json. Sem esse arquivo, nada aparece na página.

   Regras: desconto único (percentual do cupons.json) sobre as DIÁRIAS; adicionais
   não entram; noites em datas comemorativas ficam sem desconto; não acumula
   (vale um só); a confirmação final é sempre da equipe, pelo WhatsApp. */
(function () {
  'use strict';
  if (window.__cupomIniciado) return;
  window.__cupomIniciado = true;

  var SAL = 'pdc-cupom-v1:';
  var cfg = null;
  var estado = null; // { tipo: 'parceiro' | 'mensal', nome: '...' }
  var ultimo = null; // último cálculo de desconto (usado na mensagem do WhatsApp)
  var observador = null;
  var el = {};

  // ---------- utilidades ----------
  function hoje() {
    // data de hoje em Recife, no formato AAAA-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }
  function normaliza(c) {
    return String(c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function sha256(txt) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }
  function dentroDaJanela() {
    var p = cfg && cfg.promocaoMensal;
    if (!p || !p.ativa) return false;
    var dia = parseInt(hoje().slice(8, 10), 10);
    return dia >= p.diaInicio && dia <= p.diaFim;
  }
  function percentual() { return Number(cfg && cfg.percentual) || 10; }
  function dinheiro(v) { return typeof formatMoney === 'function' ? formatMoney(v) : 'R$ ' + v.toFixed(2).replace('.', ','); }

  function estadoAtivo() {
    if (!estado) return false;
    if (estado.tipo === 'mensal' && !dentroDaJanela()) { estado = null; return false; }
    return true;
  }

  // ---------- regra do desconto ----------
  function noiteExcluida(dia) {
    try {
      if (typeof findSpecialPeriod === 'function' && findSpecialPeriod(activeCabin, dia)) return true;
    } catch (e) { /* segue com a lista do cupons.json */ }
    return (cfg.periodosExcluidos || []).some(function (p) { return dia >= p.de && dia <= p.ate; });
  }

  function calcular() {
    var ci = document.getElementById('checkinInput').value;
    var co = document.getElementById('checkoutInput').value;
    if (!ci || !co) return null;
    var par = pairFridaySaturday(ci, co);
    var checkin = par.checkin, checkout = par.checkout;
    if (checkout <= checkin) return null;

    var total = 0, elegivel = 0, noites = 0, elegiveis = 0, dia = checkin;
    while (dia < checkout) {
      var preco = getPriceForDate(activeCabin, dia);
      total += preco; noites++;
      if (!noiteExcluida(dia)) { elegivel += preco; elegiveis++; }
      dia = addDaysToStr(dia, 1);
    }
    var adicionais = (data.addons || [])
      .filter(function (a) { return selectedAddonIds.includes(a.id) && a.price > 0; })
      .reduce(function (s, a) { return s + a.price; }, 0);
    var desconto = Math.round(elegivel * percentual()) / 100;
    return { total: total, noites: noites, elegiveis: elegiveis, adicionais: adicionais,
             desconto: desconto, final: total - desconto + adicionais };
  }

  // ---------- encaixe no cálculo original ----------
  var recalcOriginal = window.recalculate;
  window.recalculate = function () {
    var calc = recalcOriginal.apply(this, arguments);
    ultimo = null;
    if (!calc || !estadoAtivo()) return calc;
    var r = calcular();
    if (r && r.desconto > 0) {
      ultimo = r;
      calc.grandTotal = r.final; // a mensagem do WhatsApp usa este valor
    }
    return calc;
  };

  var waOriginal = window.waLink;
  window.waLink = function (mensagem) {
    if (estadoAtivo() && ultimo && ultimo.desconto > 0) {
      var linha = '🎟️ Cupom: ' + estado.nome + ' — ' + percentual() + '% nas diárias (−' + dinheiro(ultimo.desconto) + ')\n';
      // entra logo abaixo da linha do total; se não achar, vai antes do nome do hóspede
      var t = mensagem.indexOf('💰 Total estimado');
      var pos = t >= 0 ? mensagem.indexOf('\n', t) + 1 : mensagem.indexOf('Nome:');
      if (pos > 0) mensagem = mensagem.slice(0, pos) + linha + mensagem.slice(pos);
      else mensagem += '\n' + linha;
    }
    return waOriginal.call(this, mensagem);
  };

  // mostra o desconto na tabela de valores toda vez que a página a redesenha
  function decorar() {
    var alvo = document.getElementById('totalBreakdown');
    if (!alvo) return;
    if (observador) observador.disconnect();
    try {
      var antigas = alvo.querySelectorAll('.cupom-row');
      for (var i = 0; i < antigas.length; i++) antigas[i].remove();
      if (estadoAtivo()) {
        var grand = alvo.querySelector('.total-row.grand');
        var r = grand ? calcular() : null;
        if (r && r.desconto > 0) {
          ultimo = r;
          var linha = document.createElement('div');
          linha.className = 'total-row cupom-row';
          linha.innerHTML = '<span>Desconto — ' + escapar(estado.nome) + ' (' + percentual() + '%)</span><span>−' + dinheiro(r.desconto) + '</span>';
          grand.parentNode.insertBefore(linha, grand);
          var b = grand.querySelector('b');
          if (b) b.textContent = dinheiro(r.final);
        } else if (!r) {
          ultimo = null;
        }
        mensagem(r);
      } else {
        mensagem(null);
      }
    } finally {
      if (observador && alvo) observador.observe(alvo, { childList: true });
    }
  }
  function escapar(t) { return String(t).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // ---------- interface ----------
  function mensagem(r) {
    if (!el.msg) return;
    if (!estadoAtivo()) { el.msg.className = 'cupom-msg'; el.msg.textContent = ''; el.chip.style.display = 'none'; return; }
    el.chip.style.display = '';
    el.chipNome.textContent = estado.nome;
    var texto, tipo = 'ok';
    if (!r) {
      texto = 'Desconto de ' + percentual() + '% garantido. Ele aparece quando você escolher as datas.';
    } else if (r.desconto <= 0) {
      texto = 'Este desconto não vale para as datas escolhidas (datas comemorativas). Tente outro período.';
      tipo = 'aviso';
    } else if (r.elegiveis < r.noites) {
      texto = 'Desconto aplicado em ' + r.elegiveis + ' de ' + r.noites + ' noites. As noites em datas comemorativas ficam sem desconto.';
    } else {
      texto = percentual() + '% de desconto aplicado nas diárias.';
    }
    el.msg.className = 'cupom-msg ' + tipo;
    el.msg.textContent = texto;
  }

  function definir(novo) {
    estado = novo;
    if (typeof gtag === 'function') {
      try { gtag('event', 'cupom_aplicado', { cupom_tipo: novo.tipo, cupom_nome: novo.nome }); } catch (e) { /* ignora */ }
    }
    window.recalculate(); // redesenha; o observador desenha o desconto
    decorar();
  }
  function remover() {
    estado = null; ultimo = null;
    window.recalculate();
    decorar();
  }

  function erro(texto) { el.msg.className = 'cupom-msg erro'; el.msg.textContent = texto; }

  function aplicarCodigo() {
    var cod = normaliza(el.input.value);
    if (!cod) { erro('Digite o código do cupom.'); return; }
    sha256(SAL + cod).then(function (h) {
      var achado = (cfg.cupons || []).filter(function (c) { return c.ativo !== false && c.hash === h; })[0];
      if (!achado) { erro('Cupom inválido ou expirado.'); return; }
      var d = hoje();
      if ((achado.validoDe && d < achado.validoDe) || (achado.validoAte && d > achado.validoAte)) {
        erro('Este cupom não está válido hoje.'); return;
      }
      el.input.value = '';
      definir({ tipo: 'parceiro', nome: achado.parceiro || 'Parceiro' });
    });
  }

  function montar() {
    var temCupons = (cfg.cupons || []).some(function (c) { return c.ativo !== false; });
    var temPromo = dentroDaJanela();
    var botao = document.getElementById('submitBtn');
    if ((!temCupons && !temPromo) || !botao) return;

    var css = document.createElement('style');
    css.textContent =
      '.cupom-box{margin:22px 0 10px}' +
      '.cupom-box h3{margin:0 0 10px}' +
      '.cupom-promo{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--bege,#F5F0E8);border:1px solid var(--ouro,#C49A50);border-radius:6px;padding:12px 14px;margin-bottom:12px}' +
      '.cupom-promo b{display:block;font-weight:500;color:var(--preto,#1A1A18)}' +
      '.cupom-promo span{font-size:.88em;color:var(--ouro-escuro,#9A7338)}' +
      '.cupom-btn{background:var(--preto,#1A1A18);color:var(--offwhite,#FDFAF5);border:0;border-radius:4px;padding:11px 18px;font-family:inherit;font-size:.9em;letter-spacing:.04em;cursor:pointer}' +
      '.cupom-btn:hover{background:var(--ouro-escuro,#9A7338)}' +
      '.cupom-linha{display:flex;gap:8px}' +
      '.cupom-linha .field{flex:1;margin:0}' +
      '.cupom-linha input{text-transform:uppercase;width:100%}' +
      '.cupom-chip{display:inline-flex;align-items:center;gap:8px;margin-top:10px;background:var(--areia,#E8DFD0);border-radius:999px;padding:6px 8px 6px 14px;font-size:.9em}' +
      '.cupom-chip button{background:none;border:0;cursor:pointer;font-size:1.1em;line-height:1;color:var(--preto,#1A1A18)}' +
      '.cupom-msg{margin-top:8px;font-size:.9em;min-height:1.2em}' +
      '.cupom-msg.ok{color:var(--ouro-escuro,#9A7338)}' +
      '.cupom-msg.aviso{color:#8a5a00}' +
      '.cupom-msg.erro{color:#a33}' +
      '.cupom-regras{margin-top:8px;font-size:.8em;opacity:.75;line-height:1.5}' +
      '.cupom-row span:last-child{color:var(--ouro-escuro,#9A7338)}';
    document.head.appendChild(css);

    var box = document.createElement('div');
    box.className = 'cupom-box';
    var html = '<h3>Desconto</h3>';
    if (temPromo) {
      html += '<div class="cupom-promo"><div><b>' + escapar(cfg.promocaoMensal.titulo || 'Promoção do mês') + ': ' + percentual() + '% de desconto</b>' +
              '<span>nas diárias, em pedidos feitos do dia ' + cfg.promocaoMensal.diaInicio + ' ao dia ' + cfg.promocaoMensal.diaFim + '</span></div>' +
              '<button type="button" class="cupom-btn" id="cupomPromoBtn">Aplicar desconto</button></div>';
    }
    if (temCupons) {
      html += '<label for="cupomInput" style="display:block;margin-bottom:6px">Tem um cupom de parceiro?</label>' +
              '<div class="cupom-linha"><div class="field"><input type="text" id="cupomInput" placeholder="Código do cupom" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>' +
              '<button type="button" class="cupom-btn" id="cupomAplicarBtn">Aplicar</button></div>';
    }
    html += '<div class="cupom-chip" id="cupomChip" style="display:none"><span>🎟️ <b id="cupomChipNome"></b></span><button type="button" id="cupomRemover" aria-label="Remover cupom">×</button></div>' +
            '<div class="cupom-msg" id="cupomMsg" role="status" aria-live="polite"></div>' +
            '<div class="cupom-regras">Desconto de ' + percentual() + '% sobre as diárias; os adicionais não entram. Não vale em datas comemorativas e períodos especiais, não se acumula com outras ofertas e depende da confirmação de disponibilidade pela nossa equipe.</div>';
    box.innerHTML = html;
    botao.parentNode.insertBefore(box, botao);

    el = {
      msg: document.getElementById('cupomMsg'), chip: document.getElementById('cupomChip'),
      chipNome: document.getElementById('cupomChipNome'), input: document.getElementById('cupomInput')
    };
    var promo = document.getElementById('cupomPromoBtn');
    if (promo) promo.addEventListener('click', function () { definir({ tipo: 'mensal', nome: cfg.promocaoMensal.titulo || 'Promoção do mês' }); });
    var aplicar = document.getElementById('cupomAplicarBtn');
    if (aplicar) {
      aplicar.addEventListener('click', aplicarCodigo);
      el.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarCodigo(); } });
    }
    document.getElementById('cupomRemover').addEventListener('click', remover);

    var alvo = document.getElementById('totalBreakdown');
    if (alvo && window.MutationObserver) {
      observador = new MutationObserver(decorar);
      observador.observe(alvo, { childList: true });
    }
  }

  // ---------- partida ----------
  function iniciar() {
    fetch('cupons.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('sem cupons.json'); return r.json(); })
      .then(function (c) { cfg = c; montar(); })
      .catch(function () { /* sem configuração: a página segue normal, sem cupom */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
