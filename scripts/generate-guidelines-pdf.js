const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

function generateAbstractGuidelinesPDF() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Page 1: Abstract Guidelines & Instructions
  // Header background
  doc.setFillColor(6, 14, 24);
  doc.rect(0, 0, 210, 38, 'F');

  // Gold accent strip
  doc.setFillColor(203, 162, 52);
  doc.rect(0, 38, 210, 2, 'F');

  // Header Typography
  doc.setTextColor(203, 162, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INDIAN PHARMACOLOGICAL SOCIETY ', 105, 12, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('NeuroMet Pharmacon-2027', 105, 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 215, 235);
  doc.text('Hosted by National Institute of Pharmaceutical Education & Research (NIPER), Raebareli at Lucknow', 105, 26, { align: 'center' });
  doc.text('19–20 February 2027 | Post-conference workshop: 21 February', 105, 32, { align: 'center' });

  // Document Title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('OFFICIAL CALL FOR ABSTRACTS & SUBMISSION GUIDELINES', 20, 48);

  doc.setDrawColor(203, 162, 52);
  doc.setLineWidth(0.5);
  doc.line(20, 50, 190, 50);

  // Section 1: General Submission Mandate
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 14, 24);
  doc.text('1. Eligibility & General Mandate', 20, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const mandateText = 'The Scientific Program Committee invites original research abstracts spanning chemistry, pharmacology, biotechnology, and translational drug discovery, with a focus on neuro-metabolic disorders, cancer, and safety sciences. Submissions are open to faculty members, scientists, postdoctoral researchers, PhD scholars, and postgraduate students (MD/MS/M.Pharm/Pharm.D/M.Sc) from recognized academic and research institutions across India and internationally. Registration for the conference is mandatory for the presenting author upon abstract acceptance.';
  doc.text(doc.splitTextToSize(mandateText, 170), 20, 63);

  // Section 2: Structured Abstract Format
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 14, 24);
  doc.text('2. Structured Abstract Format (Max 300 Words)', 20, 84);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const formatText = [
    '• Title: Brief, informative, in Title Case (e.g. Mechanistic Evaluation of Targeted Therapeutics). Avoid abbreviations.',
    '• Authors & Affiliations: Full names of all co-authors (e.g. Rahul Sharma1, Priya Verma2), departmental affiliations, institute, city, state, and pin code. Underline the Presenting Author. Provide asterisk (*) and valid email for Corresponding Author.',
    '• Background & Rationale: Concise statement (2–3 sentences) explaining the scientific gap, therapeutic unmet need, and primary hypothesis.',
    '• Materials & Methods: Experimental design, animal models/cell lines, pharmacological agents, dosages, analytical assays, instrumentation, or in-silico protocols. State IAEC/IEC ethics clearance number where applicable.',
    '• Results & Discussion: Summarize primary quantitative findings with statistical significance (p < 0.05, mean ± SEM). Figures, graphs, and tables are NOT permitted in abstract text.',
    '• Conclusions & Impact: Clear translational implications for drug development or clinical therapeutics.',
    '• Keywords: 4 to 6 relevant keywords separated by semicolons.'
  ];
  let curY = 89;
  formatText.forEach(bullet => {
    const lines = doc.splitTextToSize(bullet, 170);
    doc.text(lines, 20, curY);
    curY += lines.length * 4.2;
  });

  // Section 3: Thematic Tracks
  curY += 2;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 14, 24);
  doc.text('3. Curated Thematic Scientific Tracks', 20, curY);

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const { tracks } = require('../conference-tracks.json');
  for (let i = 0; i < 5; i++) {
    const left = doc.splitTextToSize(`TR-${tracks[i].id}: ${tracks[i].title}`, 80);
    const right = doc.splitTextToSize(`TR-${tracks[i + 5].id}: ${tracks[i + 5].title}`, 80);
    doc.text(left, 20, curY);
    doc.text(right, 105, curY);
    curY += Math.max(left.length, right.length) * 4 + 2;
  }
  curY += 3;

  // Section 4: Young Scientist Award & Important Dates
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, curY, 170, 36, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(184, 134, 11);
  doc.text('YOUNG SCIENTIST AWARDS (AGE <= 35 YEARS)', 25, curY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Delegates applying for the Indian Pharmacological Society Young Scientist Award must be under 35 years as of Feb 19, 2027. Proof of age (copy of birth certificate/Aadhaar/passport) and recommendation letter from Head of Department must be uploaded during online submission.', 25, curY + 11, { maxWidth: 160 });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 14, 24);
  doc.text('Key Dates: Abstract Deadline: 31st December 2026 | Acceptance Notice: 15th January 2027', 25, curY + 24);
  doc.setFont('helvetica', 'normal');
  doc.text('Official Submission Portal: https://neuro-med-pharmacon-27.vercel.app/#abstracts | Email: abstracts@niperraebareli.edu.in', 25, curY + 29);

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Page 1 of 2 — Indian Pharmacological Society Conference 2027 · NIPER-Raebareli Lucknow Campus', 105, 290, { align: 'center' });

  // Page 2: Official Template & Formatting Specifications
  doc.addPage('a4', 'portrait');

  // Header background
  doc.setFillColor(6, 14, 24);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setFillColor(203, 162, 52);
  doc.rect(0, 30, 210, 1.5, 'F');

  doc.setTextColor(203, 162, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('INDIAN PHARMACOLOGICAL SOCIETY ', 105, 12, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('OFFICIAL STRUCTURED ABSTRACT SUBMISSION TEMPLATE', 105, 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 215, 235);
  doc.text('Please use this exact layout for submission via the online portal or email', 105, 26, { align: 'center' });

  // Template Body Frame
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 162, 52);
  doc.setLineWidth(0.4);
  doc.roundedRect(20, 38, 170, 235, 2, 2, 'D');

  let tY = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 14, 24);
  doc.text('[TITLE]: MOLECULAR DISSECTION OF NEUROINFLAMMATORY SIGNALING IN ISCHEMIC STROKE', 25, tY, { maxWidth: 160 });

  tY += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Authors: Amit K. Sharma1*, Neha Rastogi1, Rajeshwar S. Verma2', 25, tY);
  tY += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('1Department of Pharmacology & Toxicology, NIPER-Raebareli, Lucknow 226002, India', 25, tY);
  tY += 4.5;
  doc.text('2Division of Neuroscience & Ageing Biology, CSIR-Central Drug Research Institute (CDRI), Lucknow 226031, India', 25, tY);
  tY += 4.5;
  doc.text('*Corresponding Author Email: amit.sharma@niperraebareli.edu.in | Track: TR-01 (NeuroTherapeutics)', 25, tY);

  tY += 7;
  doc.setDrawColor(226, 232, 240);
  doc.line(25, tY, 185, tY);

  tY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(184, 134, 11);
  doc.text('Background & Objectives:', 25, tY);
  tY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const exBg = 'Ischemic cerebral stroke initiates acute microglial polarization accompanied by catastrophic neurovascular breakdown. Despite recanalization therapies, post-ischemic secondary neuroinflammation remains therapeutically unaddressed. Here, we hypothesized that pharmacological inhibition of NLRP3 inflammasome priming via a novel small-molecule scaffold suppresses neurotoxic cytokines and salvages ischemic penumbral tissue.';
  doc.text(doc.splitTextToSize(exBg, 160), 25, tY);

  tY += 21;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(184, 134, 11);
  doc.text('Materials & Methods:', 25, tY);
  tY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const exMm = 'Adult male Sprague-Dawley rats (250–280 g, IAEC Approval # NIPER/IAEC/2026/04) were subjected to 90-minute transient middle cerebral artery occlusion (tMCAO) followed by 24h reperfusion. Vehicle or Test Agent (5, 10, 20 mg/kg i.v.) was administered at reperfusion onset. Neurological deficit scoring (mNSS), TTC cerebral infarct planimetry, blood-brain barrier permeability (Evans blue extravasation), and immunofluorescence for Iba-1/GFAP were quantified.';
  doc.text(doc.splitTextToSize(exMm, 160), 25, tY);

  tY += 25;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(184, 134, 11);
  doc.text('Results & Discussion:', 25, tY);
  tY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const exRd = 'Test Agent (10 mg/kg) caused a 48.6% reduction in total cerebral infarct volume compared to vehicle-treated controls (p < 0.001, one-way ANOVA with Dunnett\'s post-test). Neurological deficit scores improved significantly within 24 hours (mNSS 5.2 vs 11.8 in vehicle). Western blotting of penumbral tissue confirmed downregulation of cleaved caspase-1 and mature IL-1beta without altering systemic hemodynamics.';
  doc.text(doc.splitTextToSize(exRd, 160), 25, tY);

  tY += 23;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(184, 134, 11);
  doc.text('Conclusions:', 25, tY);
  tY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const exCo = 'The findings establish this novel pharmacophore as a potent, brain-penetrant neurovascular protective lead candidate capable of dampening neuroinflammation during the hyperacute reperfusion window.';
  doc.text(doc.splitTextToSize(exCo, 160), 25, tY);

  tY += 16;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(184, 134, 11);
  doc.text('Keywords:', 25, tY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('Ischemic Stroke; NLRP3 Inflammasome; Microglia; Neuroprotection; NIPER-Raebareli', 43, tY);

  tY += 10;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 14, 24);
  doc.text('Presentation Preference: [ ] Oral Presentation    [ ] Poster Presentation', 25, tY);
  tY += 5;
  doc.text('Apply for Young Scientist Award (Age <= 35 Years): [ ] Yes    [ ] No', 25, tY);
  tY += 5;
  doc.text('IPS Life / Annual Membership Number (if applicable): ___________________________', 25, tY);

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Page 2 of 2 — Official Submission Template · Secretariat: abstracts@niperraebareli.edu.in', 105, 290, { align: 'center' });

  const buffer = doc.output('arraybuffer');
  const targetDir = path.join(__dirname, '../public/downloads');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filePath = path.join(targetDir, 'NeuroMet_Pharmacon_2027_Abstract_Guidelines.pdf');
  fs.writeFileSync(filePath, Buffer.from(buffer));
  console.log(`Generated official PDF: ${filePath} (${fs.statSync(filePath).size} bytes)`);

  // Also write template copy
  const templatePath = path.join(targetDir, 'NeuroMet_Pharmacon_2027_Abstract_Template.pdf');
  fs.writeFileSync(templatePath, Buffer.from(buffer));
  console.log(`Generated template PDF: ${templatePath}`);
}

generateAbstractGuidelinesPDF();
