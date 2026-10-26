const data = require('../conference-tracks.json');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validateTracks() {
  if (data.tracks.length !== 10 || new Set(data.tracks.map(t => t.id)).size !== 10) throw Error('Conference must have exactly 10 distinct tracks');
  const categories = new Map(data.categories.map(c=>[c.id,c.label]));
  if (data.tracks.some((t,i)=>t.id!==String(i+1).padStart(2,'0') || !categories.has(t.category))) throw Error('Invalid track ordering or category');
  if (data.tracks.filter(t=>t.category==='chemistry').length !== 2) throw Error('Exactly two chemistry tracks are required');
  if (data.tracks.filter(t=>t.category==='indigenous').length !== 1) throw Error('Exactly one indigenous systems track is required');
  return categories;
}
function replaceBlock(html, name, content) {
  const start = `<!-- ${name}_START -->`, end = `<!-- ${name}_END -->`;
  const a=html.indexOf(start), b=html.indexOf(end,a);
  if(a<0 || b<0)throw Error(`Missing ${name} markers`);
  return html.slice(0,a+start.length)+'\n'+content+'\n'+html.slice(b);
}
function renderTracks(html) {
  const categories=validateTracks();
  const filters='<button type="button" class="track-filter-btn active" onclick="filterTracks(\'all\', this)">All 10 Tracks</button>\n'+data.categories.map(c=>`<button type="button" class="track-filter-btn" onclick="filterTracks('${c.id}', this)">${escape(c.label)}</button>`).join('\n');
  const cards=data.tracks.map(t=>{
    const value=`Track ${t.id}: ${t.title}`;
    return `<article class="track-card" data-category="${t.category}"><span class="track-number">TRACK ${t.id}</span><h3 class="track-title">${escape(t.title)}</h3><p class="track-desc">${escape(t.description)}</p><div class="track-card-footer"><span class="track-tag">${escape(categories.get(t.category))}</span><a class="track-submit-link" href="#abstracts" data-track="${escape(value)}" onclick="openAbstractWithTrack(this.dataset.track)">Submit Abstract &rarr;</a></div></article>`;
  }).join('\n');
  const options=data.categories.map(c=>`<optgroup label="${escape(c.label)}">`+data.tracks.filter(t=>t.category===c.id).map(t=>`<option value="${escape(`Track ${t.id}: ${t.title}`)}">${escape(`Track ${t.id}: ${t.title}`)}</option>`).join('')+'</optgroup>').join('\n');
  return replaceBlock(replaceBlock(replaceBlock(html,'TRACK_FILTERS',filters),'TRACK_CARDS',cards),'TRACK_OPTIONS',options);
}
function renderBrochure(text) {
  const start=text.indexOf('Track 01:');
  if(start<0)return text;
  const end=text.indexOf('\n\n',start);
  if(end<0)throw Error('Missing brochure track-list boundary');
  return text.slice(0,start)+data.tracks.map(t=>`Track ${t.id}: ${t.title}\n  ${t.description}`).join('\n')+text.slice(end);
}
module.exports={renderTracks,validateTracks,renderBrochure};
