/**
 * Pilote Landing Page — Interactions & Animations
 * Apple-style scroll reveals, counter animations, smooth navigation
 */

(function() {
  'use strict';

  // =================== SCROLL REVEAL ===================
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger children reveals
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -60px 0px'
  });

  function initReveals() {
    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach((el, i) => {
      // Add stagger delay for siblings
      const siblings = el.parentElement.querySelectorAll('.reveal');
      const index = Array.from(siblings).indexOf(el);
      el.dataset.delay = index * 100;
      revealObserver.observe(el);
    });
  }

  // =================== NAVBAR SCROLL ===================
  function initNavbar() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('nav-toggle');
    const mobile = document.getElementById('nav-mobile');

    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }, { passive: true });

    // Mobile toggle
    if (toggle && mobile) {
      toggle.addEventListener('click', () => {
        mobile.classList.toggle('open');
        toggle.classList.toggle('active');
      });

      // Close on link click
      mobile.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          mobile.classList.remove('open');
          toggle.classList.remove('active');
        });
      });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          const offset = 80; // navbar height
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  // =================== COUNTER ANIMATION ===================
  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.count);
    const duration = 2000;
    const start = performance.now();

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.round(easeOutExpo(progress) * target);
      el.textContent = value.toLocaleString('fr-FR');

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // =================== PARALLAX HERO ===================
  function initParallax() {
    const heroContent = document.querySelector('.hero-content');
    const heroVisual = document.querySelector('.hero-visual');

    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;

      if (scrollY < vh) {
        const progress = scrollY / vh;
        if (heroContent) {
          heroContent.style.transform = 'translateY(' + (scrollY * 0.3) + 'px)';
          heroContent.style.opacity = 1 - progress * 1.2;
        }
        if (heroVisual) {
          heroVisual.style.transform = 'translateY(' + (scrollY * 0.15) + 'px)';
        }
      }
    }, { passive: true });
  }

  // =================== CURSOR GLOW (DESKTOP) ===================
  function initCursorGlow() {
    if (window.matchMedia('(hover: none)').matches) return;

    const cards = document.querySelectorAll('.feature-card, .pricing-card');
    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--glow-x', x + 'px');
        card.style.setProperty('--glow-y', y + 'px');
        card.style.background = 'radial-gradient(300px circle at var(--glow-x) var(--glow-y), rgba(124,58,237,0.06), var(--bg-card) 70%)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = '';
      });
    });
  }

  // =================== CHART ANIMATION ===================
  function initChartAnimation() {
    const chartSvg = document.querySelector('.chart-svg');
    if (!chartSvg) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const paths = chartSvg.querySelectorAll('path');
          paths.forEach(p => {
            const length = p.getTotalLength ? p.getTotalLength() : 1000;
            if (p.getAttribute('fill') === 'none') {
              p.style.strokeDasharray = length;
              p.style.strokeDashoffset = length;
              p.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
              requestAnimationFrame(() => {
                p.style.strokeDashoffset = '0';
              });
            }
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(chartSvg);
  }

  // =================== INIT ===================
  document.addEventListener('DOMContentLoaded', () => {
    initReveals();
    initNavbar();
    initCounters();
    initParallax();
    initCursorGlow();
    initChartAnimation();
  });

})();
