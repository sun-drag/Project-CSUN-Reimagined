// Shared interface behavior used across the website.

const navToggle = document.querySelector('.nav-toggle');
const primaryNav = document.querySelector('.primary-nav');
const currentYear = document.querySelector('#current-year');

function closeNavigation() {
  if (!navToggle || !primaryNav) return;

  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.querySelector('.sr-only').textContent = 'Open navigation';
  primaryNav.classList.remove('is-open');
  document.body.classList.remove('nav-open');
}

if (navToggle && primaryNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.getAttribute('aria-expanded') === 'true';

    navToggle.setAttribute('aria-expanded', String(!isOpen));
    navToggle.querySelector('.sr-only').textContent = isOpen ? 'Open navigation' : 'Close navigation';
    primaryNav.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('nav-open', !isOpen);
  });

  primaryNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeNavigation();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNavigation();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1080) closeNavigation();
  });
}

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}
