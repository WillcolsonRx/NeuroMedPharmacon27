# Speaker profiles and editorial handoff

Research checked 28 October 2026 (India time). Edit `conference-speakers.json` to
update the speaker cards; `scripts/render-speakers.js` renders that catalogue at
build time. Keep root and public HTML synchronized when changing the committed
fallback. The section sits between the thematic tracks and program schedule.

The organizer supplied 14 unique names in the first list (PDF and DOCX duplicates were deduplicated)
and identified the Gaikwad file as keynote. Prof. Anil Gulati of Pharmazz was
explicitly confirmed by the organizer. No talk titles or speaking times have
been invented.

Portraits, designations, and affiliations were verified using the sources in
the catalogue. Public source links are available from the cards. These are
professional profile checks, not independent confirmations of attendance.

## Identity / designation decisions

- The keynote filename reads “Anil N Giakwad”. The matching pharmacology profile
  at BITS Pilani identifies Prof. Gaikwad Anil Bhanudas. The card uses Prof. Anil B.
  Gaikwad and links directly to that profile. The organizer was asked about the
  middle initial; their reply confirmed Gulati only. The initial discrepancy
  remains for organizer review; no unsupported “N” is published.
- Vinod Tiwari is the pharmaceutical engineering/pharmacology researcher at IIT
  (BHU), not the similarly named BHU chemistry professor. The official profile
  gives Associate Professor; that is used instead of promoting him to Professor.
- B. N. Srikumar's current NIMHANS profile states Additional Professor in
  Neurophysiology; the official faculty list's public read-only JSON endpoint
  corroborated the portrait and designation.
- Kanthi Kiran Kondepudi's institution is now styled BRIC-National Agri-Food and
  Biomanufacturing Institute (formerly NABI & CIAB). Its official profile/list
  states Scientist F. The updated institution name is used.
- Ritesh Kumar matches AIIMS Jammu’s pharmacology profile (Assistant Professor).
  Hemant Kumar was corrected to NIPER Ahmedabad’s Associate Professor after the
  organizer identified the intended person; his portrait was replaced as well.
- Central University of Haryana serves unrelated physics faculty in its initial
  HTML. Its public department data endpoint is what the browser uses to load the
  correct pharmacy faculty. The response for department 1069 / section 3 directly
  identifies Ashok Jangra as Assistant Professor and links the local portrait.

## Remaining profile: Nitesh Kumar

Discovery results point to NIPER Hajipur's `/nitesh-kumar/` page, but the official
site repeatedly returned HTTP 503 or timed out. A discovery snippet is not treated
as verified profile evidence. The record is retained privately in the source catalogue for editorial follow-up,
but is not rendered. No incomplete or placeholder speaker card is published.

## Sources requiring browser data requests

- CUH: https://www.cuh.ac.in/department.aspx?departmentid=1069&subid=3
  reads public POST `/cuh-recruitment.aspx/getdepatmentdata` with
  `{"departmentid":1069,"subid":3}`. It lists Ashok under Assistant Professors.
- NIMHANS: https://www.nimhans.ac.in/faculty/srikumar-b-n
  public faculty search at
  `https://bkend.nimhans.ac.in/api/faculty/website-faculty-list/`
  returned Srikumar B N, Additional Professor, Neurophysiology and the portrait URL.

No personal contact details from these profiles were added to the conference page.

## Follow-up speaker list (28 October 2026)

The organizer requested no duplicates and no incomplete profiles. Only verified
records now render publicly, including when the build reads the catalogue.
Nitesh Kumar's former placeholder is omitted.

- New verified addition: Dr. Mahendra Bishnoi, Scientist F, BRIC-NABI, Mohali.
  Profile and portrait were obtained directly from the institute's scientist page.
- Existing Ritesh Kumar, Anil Gaikwad, Yogesh Kulkarni (PDF/DOCX), Vinod Tiwari,
  Kanthi Kiran Kondepudi, B. N. Srikumar (PDF/DOCX), and Anil Gulati remain single
  entries. The second Gaikwad DOCX likewise does not create another card.
- Shyam S. Sharma: official profile and CV URLs were located but returned HTTP 503
  or proxy errors. No complete verified profile/portrait has been added.
- Ashutosh Kumar and Pragyanshu Khare: no complete verified profile/portrait was
  obtained in this research pass; search service throttling impeded further checks.
- YKG: filename contains initials only; no identity is inferred from those initials.
- The organizer confirmed Hemant Kumar is from NIPER Ahmedabad. His correct
  institutional portrait, Associate Professor designation, and affiliation are
  now used; the former AIIMS Jammu image and association were replaced.

## Organizer identifies the remaining four (28 October 2026)

The organizer supplied names, roles and affiliations for Ashutosh Kumar,
Y. K. Gupta, Shyam S. Sharma and Pragyanshu Khare. They are now added once each.

- Pragyanshu Khare: BITS Pilani's official profile confirms Assistant Professor,
  Department of Pharmacy, Pilani Campus and supplies the portrait.
- Y. K. Gupta: AIIMS Kalyani's current presidents API confirms Prof. (Dr.) Yogendra
  Kumar Gupta as President and supplies the portrait. The page is a JavaScript app;
  its public read-only JSON is `/aiimsapi/api/v1/presidents/current`. The card uses
  President, AIIMS Kalyani. It does not assign him a Department of Pharmaceutical
  Sciences appointment, which is not established by the current institutional bio.
  Ignore the API's inconsistent SEO meta_description; use the named current record
  and profile content, which also agree with the organizer's identification.
- Ashutosh Kumar: the organizer confirms Assistant Professor, Pharmacology &
  Toxicology, NIPER S.A.S. Nagar. Institutional profile pages still return 503.
- Shyam S. Sharma: the organizer confirms Head, Pharmacology & Toxicology,
  NIPER S.A.S. Nagar. Institutional profile and CV requests still fail.

The two NIPER Mohali records use `organizer_confirmed`, not `verified`, and retain
explicit "Photo forthcoming" initials avatars. Their names/designations/affiliations
are complete and organizer-confirmed; no stock or synthetic face is substituted
and no broken institutional link is shown. Nitesh Kumar remains omitted because
his identity/profile details are still unresolved. The renderer deduplicates
normalized names and only displays verified or organizer-confirmed complete records.
