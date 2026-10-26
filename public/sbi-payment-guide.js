(() => {
  const guide = document.querySelector('.sbi-payment-guide');
  if (!guide) return;
  const steps = Array.from(guide.querySelectorAll('.sbi-guide-steps > li'));
  const selectors = Array.from(guide.querySelectorAll('[data-guide-step]'));
  const back = guide.querySelector('[data-guide-back]');
  const next = guide.querySelector('[data-guide-next]');
  const progress = guide.querySelector('[data-guide-progress]');
  if (!steps.length || selectors.length !== steps.length || !back || !next || !progress) return;
  let current = 0;
  function show(index) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((step, i) => { step.hidden = i !== current; });
    selectors.forEach((button, i) => {
      if (i === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    back.disabled = current === 0;
    next.disabled = current === steps.length - 1;
    progress.textContent = `Step ${current + 1} of ${steps.length}`;
  }
  selectors.forEach((button, i) => button.addEventListener('click', () => show(i)));
  back.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  guide.classList.add('is-interactive');
  guide.querySelector('.sbi-walk-navigation').hidden = false;
  guide.querySelector('.sbi-walk-controls').hidden = false;
  show(0);
})();
