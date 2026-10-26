(function(root){
  'use strict';
  const labels={student:'Research Scholar / PG Student',faculty:'Faculty / Academic Scientist',corporate:'Corporate / Industry Delegate',inhouse_student:'In-house students'};
  function isInHouseAffiliation(value){
    if(typeof value!=='string')return false;
    const text=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\bn\s+i\s+p\s+e\s+r\b/g,'niper').replace(/\s+/g,' ');
    const campus=/\b(?:rae\s*bareli|rbl)\b/.test(text);
    return /\bniper\s*(?:rae\s*bareli|rbl|r)\b/.test(text) || (campus&&/\bnational institute of pharmaceutical education (?:and )?research\b/.test(text));
  }
  function registrationAmount({category,workshop=false,affiliation},prices){
    if(!Object.hasOwn(labels,category))throw Error('Invalid delegate category');
    if(category==='inhouse_student'&&!isInHouseAffiliation(affiliation))throw Error('In-house student fees require a NIPER-Raebareli affiliation');
    if(![true,false,0,1].includes(workshop))throw Error('Invalid workshop selection');
    const base=category==='inhouse_student'?2000:prices[category];
    if(!Number.isFinite(base)||base<0)throw Error('Registration fees unavailable');
    return base+(workshop?(prices.workshop ?? 600):0);
  }
  const api={labels,isInHouseAffiliation,registrationAmount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.RegistrationPricing=api;
})(typeof window==='undefined'?globalThis:window);
