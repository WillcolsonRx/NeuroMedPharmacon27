(function (root) {
  'use strict';
  const START = Date.parse('2027-02-18T09:00:00+05:30');
  const END = Date.parse('2027-02-20T18:00:00+05:30');
  function conferenceCountdown(now) {
    const phase = now >= END ? 'ended' : now >= START ? 'active' : 'upcoming';
    const remaining = Math.max(0, Math.floor((START - now) / 1000));
    return {phase, days:Math.floor(remaining / 86400), hours:Math.floor(remaining / 3600) % 24, minutes:Math.floor(remaining / 60) % 60, seconds:remaining % 60};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {conferenceCountdown, START, END};
  if (!root.document) return;
  const panel = root.document.getElementById('conferenceCountdown');
  if (!panel) return;
  let phase;
  function update() {
    const value = conferenceCountdown(Date.now());
    for (const unit of ['days','hours','minutes','seconds']) {
      root.document.getElementById('countdown-' + unit).textContent = String(value[unit]).padStart(2, '0');
    }
    if (phase !== value.phase) {
      phase = value.phase;
      root.document.getElementById('countdownStatus').textContent = phase === 'upcoming' ? 'Until the conference begins' : phase === 'active' ? 'The conference is underway. Welcome to NeuroMedPharmacon 2027!' : 'The conference has concluded. Thank you for joining us.';
    }
  }
  update();
  const timer = root.setInterval(() => {
    update();
    if (phase === 'ended') root.clearInterval(timer);
  }, 1000);
  root.document.addEventListener('visibilitychange', update);
})(typeof window === 'undefined' ? globalThis : window);
