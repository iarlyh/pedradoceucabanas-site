/* preabertura.js — aviso amigável de pré-abertura (Pedra do Céu Cabanas).

   Na página reservar.html, quando a pessoa escolhe datas ANTERIORES à abertura,
   essas datas aparecem bloqueadas e a página diria "já não está disponível".
   Este arquivo troca esse texto por um aviso de que as reservas ainda vão abrir,
   com o convite para a lista de espera.

   - Só mexe nesse caso. Se uma data de DEPOIS da abertura estiver indisponível
     de verdade (reservada, por exemplo), o texto original é mantido.
   - Para desligar: apague a linha <script src="preabertura.js"></script> do reservar.html.
   - Para mudar a data de abertura: altere ABERTURA e ABERTURA_BR abaixo. */
(function () {
  'use strict';
  if (window.__preaberturaIniciada) return;
  window.__preaberturaIniciada = true;

  var ABERTURA = '2026-12-18';     // primeira noite com reservas abertas (AAAA-MM-DD)
  var ABERTURA_BR = '18/12/2026';  // a mesma data, como aparece para o hóspede
  var observador = null;

  function paraISO(br) {
    var p = br.split('/');
    return p[2] + '-' + p[1] + '-' + p[0];
  }

  function linkListaDeEspera() {
    var texto = 'Olá! Quero entrar na lista de espera da Pedra do Céu Cabanas.';
    try {
      if (typeof waLink === 'function') return waLink(texto);
    } catch (e) { /* usa o link simples abaixo */ }
    return (typeof WHATSAPP_LINK !== 'undefined') ? WHATSAPP_LINK : '#';
  }

  function ajustar() {
    var msg = document.getElementById('datesMsg');
    if (!msg) return;
    var texto = msg.textContent || '';
    if (texto.indexOf('Infelizmente') !== 0) return;           // só a mensagem de datas indisponíveis
    var datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g);
    if (!datas || !datas.length) return;
    var todasAntesDaAbertura = datas.every(function (d) { return paraISO(d) < ABERTURA; });
    if (!todasAntesDaAbertura) return;                          // indisponível de verdade: mantém o original

    if (observador) observador.disconnect();
    try {
      msg.className = 'dates-msg ok';
      msg.textContent = '';
      msg.appendChild(document.createTextNode(
        'As reservas abrem em ' + ABERTURA_BR + '. As datas que você escolheu são anteriores à abertura. ' +
        'Escolha o check-in a partir de ' + ABERTURA_BR + ' ou '
      ));
      var a = document.createElement('a');
      a.textContent = 'entre na lista de espera';
      a.href = linkListaDeEspera();
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.textDecoration = 'underline';
      msg.appendChild(a);
      msg.appendChild(document.createTextNode(' para ser avisado em primeira mão.'));
      var botao = document.getElementById('submitBtn');
      if (botao) botao.textContent = 'Reservas abrem em ' + ABERTURA_BR;
    } finally {
      if (observador) observador.observe(msg, { childList: true, characterData: true, subtree: true });
    }
  }

  function iniciar() {
    var msg = document.getElementById('datesMsg');
    if (!msg || !window.MutationObserver) return;
    observador = new MutationObserver(ajustar);
    observador.observe(msg, { childList: true, characterData: true, subtree: true });
    ajustar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
