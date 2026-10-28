# Speaker profiles and editorial handoff

Research checked 28 October 2026 (India time). Edit `conference-speakers.json` to
update the speaker cards; `scripts/render-speakers.js` renders that catalogue at
build time. Keep root and public HTML synchronized when changing the committed
fallback. The section sits between the thematic tracks and program schedule.

The organizer supplied 14 unique names (PDF and DOCX duplicates were deduplicated)
and identified the Gaikwad file as keynote. Prof. Anil Gulati of Pharmazz was
explicitly confirmed by the organizer. No talk titles or speaking times have
been invented.

13 portraits, designations, and affiliations were verified using the sources in
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
- Hemant Kumar and Ritesh Kumar match the neuroscience/pharmacology profiles
  linked from AIIMS Jammu's pharmacology department. Both are Assistant Professors.
- Central University of Haryana serves unrelated physics faculty in its initial
  HTML. Its public department data endpoint is what the browser uses to load the
  correct pharmacy faculty. The response for department 1069 / section 3 directly
  identifies Ashok Jangra as Assistant Professor and links the local portrait.

## Remaining profile: Nitesh Kumar

Discovery results point to NIPER Hajipur's `/nitesh-kumar/` page, but the official
site repeatedly returned HTTP 503 or timed out. A discovery snippet is not treated
as verified profile evidence. Only the supplied name is published, with an initials
placeholder and a “profile details will be updated soon” message. No affiliation,
designation, stock portrait, or another person's photo is substituted.

## Sources requiring browser data requests

- CUH: https://www.cuh.ac.in/department.aspx?departmentid=1069&subid=3
  reads public POST `/cuh-recruitment.aspx/getdepatmentdata` with
  `{"departmentid":1069,"subid":3}`. It lists Ashok under Assistant Professors.
- NIMHANS: https://www.nimhans.ac.in/faculty/srikumar-b-n
  public faculty search at
  `https://bkend.nimhans.ac.in/api/faculty/website-faculty-list/`
  returned Srikumar B N, Additional Professor, Neurophysiology and the portrait URL.

No personal contact details from these profiles were added to the conference page.
