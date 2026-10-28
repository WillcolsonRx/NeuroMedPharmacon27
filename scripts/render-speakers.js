const speakers = require('../conference-speakers.json');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderSpeakers(html) {
  const cards = speakers.map(speaker => {
    const portrait = speaker.image
      ? `<img src="${escape(speaker.image)}" alt="${escape(speaker.name)}" width="180" height="200" loading="lazy" decoding="async">`
      : '<div class="speaker-portrait-pending" role="img" aria-label="Portrait forthcoming">NK</div>';
    const profile = speaker.profile_status === 'verified'
      ? `<p class="speaker-designation">${escape(speaker.designation)}</p><p class="speaker-affiliation">${escape(speaker.affiliation)}</p><a class="speaker-profile" href="${escape(speaker.profile_url)}" target="_blank" rel="noopener noreferrer">View profile <span aria-hidden="true">↗</span></a>`
      : '<p class="speaker-designation">Portrait and profile details will be updated soon.</p>';
    return `<article class="speaker-card${speaker.role === 'Keynote Speaker' ? ' speaker-keynote' : ''}" data-speaker="${escape(speaker.id)}">${portrait}<p class="speaker-role">${escape(speaker.role)}</p><h3>${escape(speaker.name)}</h3>${profile}</article>`;
  }).join('\n');
  const pattern = /<!-- SPEAKER_CARDS_START -->[\s\S]*?<!-- SPEAKER_CARDS_END -->/;
  if (!pattern.test(html)) throw new Error('Speaker card markers are missing');
  return html.replace(pattern, `<!-- SPEAKER_CARDS_START -->\n${cards}\n<!-- SPEAKER_CARDS_END -->`);
}
module.exports = {renderSpeakers};
