# Scientific programme: ten-track structure

The ten tracks are an editorial conference programme, not a claim that any listed
intervention is clinically effective or that NIPER has endorsed this exact programme.

The institutional alignment was checked against NIPER-Raebareli's official faculty
research listing: https://niperraebareli.edu.in/faculty.html (accessed 26 October 2026).
The listing includes neurodegeneration/neuroinflammation (Prof. Rakesh Kumar Singh),
neurobiology of metabolism (Dr. Ashok K. Datusalia), ischemia-reperfusion injury
(Dr. Ravinder Kaundal), medicinal/synthetic/computational chemistry (Prof. Abha Sharma,
Dr. Sandeep Chaudhary and Dr. Gopal Lal Khatik), extracellular vesicles/natural products
(Dr. Nidhi Srivastava), neurotoxicity/nanotoxicology (Dr. Saba Naqvi), metabolic disorders
(Dr. Sapana Kushwaha), cancer and antibody-drug conjugates (Dr. Niranjan Meher), and
AI/complex networks (Dr. Suprateek Chatterjee).

PubMed searches through the NCBI Entrez skill were attempted for neurodegeneration
and metabolic dysfunction, pharmacovigilance-guided repurposing, and neuroprotective
ethnopharmacology. The workspace proxy blocked the API with HTTP 403. No papers were
retrieved, so this update does not claim a completed literature review or cite
unverified articles. The indigenous-systems and repurposing tracks reflect the
organizer's requested scope; listed approaches are research topics, not treatment
recommendations. Pharmacovigilance associations are explicitly described as
hypothesis-generating and requiring validation.

`conference-tracks.json` is the authoritative catalogue: exactly ten tracks,
exactly two Chemistry tracks and one Indigenous Systems & Ethnopharmacology track.
The five requested category families are retained; Ethnopharmacology and Toxicology
have their own filters for clear routing. `scripts/render-tracks.js` produces the
static card/filter/form markup, and the build renders those marked blocks from the
same catalogue. The guidelines PDF generator also reads that catalogue. Current
HTML downloads use those generated PDFs rather than a separate client-side list.

Existing submitted abstracts keep their original category strings. This update
changes choices for new submissions; it does not silently reclassify old records.
