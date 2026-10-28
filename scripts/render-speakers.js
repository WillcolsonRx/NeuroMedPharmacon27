const speakers = require('../conference-speakers.json');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep the keynote and Pharmazz CEO first; group the remaining professional roles.
function designationPriority(speaker) {
  if (speaker.id === 'anil-gaikwad') return -2;
  if (speaker.id === 'anil-gulati') return -1;
  const title = speaker.designation.toLowerCase();
  if (/^president\b/.test(title)) return 0;
  if (title.includes('associate dean')) return 1;
  if (/\bhead\b/.test(title)) return 2;
  if (title.includes('in-charge')) return 3;
  if (/^professor\b/.test(title)) return 4;
  if (title.includes('additional professor')) return 5;
  if (title.includes('scientist')) return 6;
  if (title.includes('associate professor')) return 7;
  if (title.includes('assistant professor')) return 8;
  return 9;
}
function renderSpeakers(html) {
  const seen = new Set();
  const cards = speakers.filter(speaker => {
    if (!['verified','organizer_confirmed'].includes(speaker.profile_status)) return false;
    if (!speaker.designation || !speaker.affiliation) return false;
    const key = speaker.name.toLowerCase().replace(/\b(dr|prof)\b/g,'').replace(/[^a-z]/g,'');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => designationPriority(a) - designationPriority(b)).map(speaker => {
    const initials = speaker.name.replace(/\b(?:Dr|Prof)\.?\s*/g,'').split(/\s+/).map(word => word[0]).join('');
    const portrait = speaker.image
      ? `<img src="${escape(speaker.image)}" alt="${escape(speaker.name)}" width="180" height="200" loading="lazy" decoding="async">`
      : `<div class="speaker-portrait-pending" role="img" aria-label="Portrait forthcoming for ${escape(speaker.name)}"><span>${escape(initials)}</span><small>Photo forthcoming</small></div>`;
    const link = speaker.profile_url
      ? `<a class="speaker-profile" href="${escape(speaker.profile_url)}" target="_blank" rel="noopener noreferrer">View profile <span aria-hidden="true">↗</span></a>` : '';
    const profile = `<p class="speaker-designation">${escape(speaker.designation)}</p><p class="speaker-affiliation">${escape(speaker.affiliation)}</p>${link}`;
    return `<article class="speaker-card${speaker.role === 'Keynote Speaker' ? ' speaker-keynote' : ''}" data-speaker="${escape(speaker.id)}">${portrait}<p class="speaker-role">${escape(speaker.role)}</p><h3>${escape(speaker.name)}</h3>${profile}</article>`;
  }).join('\n');
  const pattern = /<!-- SPEAKER_CARDS_START -->[\s\S]*?<!-- SPEAKER_CARDS_END -->/;
  if (!pattern.test(html)) throw new Error('Speaker card markers are missing');
  return html.replace(pattern, `<!-- SPEAKER_CARDS_START -->\n${cards}\n<!-- SPEAKER_CARDS_END -->`);
}
module.exports = {renderSpeakers};
