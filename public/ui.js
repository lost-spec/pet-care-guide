/**
 * ui.js — presentation-only enhancements.
 * Contains no data fetching or business logic; script.js owns all behaviour
 * that touches the API or renders results.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- Scroll reveal -------------------------------------------------- */
  function initReveal() {
    var targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      targets.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---- Select: floating label + placeholder tone --------------------- */
  function initSelectState() {
    var select = document.getElementById('pet-type');
    if (!select) return;

    var field = document.getElementById('pet-type-field') || select.closest('.field');

    var sync = function () {
      var hasValue = !!select.value;
      // `select` cannot use :placeholder-shown, so mirror it with a class
      if (field) field.classList.toggle('has-value', hasValue);
      select.style.color = hasValue ? '' : 'var(--text-muted)';
    };

    select.addEventListener('change', sync);
    sync();
  }

  /* ---- Smooth in-page anchor scrolling -------------------------------- */
  function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        var id = link.getAttribute('href').slice(1);
        if (!id) return;
        var target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({
          behavior: reduceMotion.matches ? 'auto' : 'smooth',
          block: 'start'
        });
        if (typeof target.focus === 'function') target.focus({ preventScroll: true });
      });
    });
  }

  /* ---- Enter key submits from text inputs ----------------------------- */
  function initEnterSubmit() {
    var form = document.getElementById('pet-form');
    if (!form) return;

    ['breed', 'location'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    });
  }

  function init() {
    initReveal();
    initSelectState();
    initAnchors();
    initEnterSubmit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
