const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

function generateSponsorshipProspectusPDF() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Page 1: Cover & Congress Overview
  doc.setFillColor(6, 14, 24);
  doc.rect(0, 0, 210, 297, 'F');

  // Decorative border
  doc.setDrawColor(203, 162, 52);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, 186, 273, 'D');

  doc.setTextColor(203, 162, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('INDIAN PHARMACOLOGICAL SOCIETY (NORTHERN CHAPTER)', 105, 35, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('IPS NORTH ZONE CONFERENCE 2027', 105, 52, { align: 'center' });

  doc.setTextColor(200, 215, 235);
  doc.setFontSize(12);
  doc.text('NeuroMedPharmacon: Regional Frontiers in Pharmacology & Drug Delivery', 105, 62, { align: 'center' });

  doc.setDrawColor(203, 162, 52);
  doc.setLineWidth(0.5);
  doc.line(40, 70, 170, 70);

  doc.setTextColor(203, 162, 52);
  doc.setFontSize(16);
  doc.text('INDUSTRY SPONSORSHIP & EXHIBITION PROSPECTUS', 105, 84, { align: 'center' });

  doc.setTextColor(220, 230, 242);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Host Institution: Department of Pharmacology & Toxicology', 105, 96, { align: 'center' });
  doc.text('National Institute of Pharmaceutical Education and Research (NIPER), Raebareli at Lucknow', 105, 102, { align: 'center' });
  doc.text('In Association with CSIR-CDRI, CSIR-IITR & KGMU Lucknow · February 18–20, 2027', 105, 108, { align: 'center' });

  // Key stats box
  doc.setFillColor(15, 34, 56);
  doc.roundedRect(25, 120, 160, 48, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(203, 162, 52);
  doc.text('EXPECTED AUDIENCE & CONGRESS FOOTPRINT', 105, 130, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('• 500+ Registered Pharmacologists, Toxicologists, and R&D Leaders across North India', 32, 140);
  doc.text('• 60+ Renowned Plenary Speakers & Department Chairs (AIIMS, PGIMER, CDRI, IITR, NIPERs)', 32, 147);
  doc.text('• 20+ Commercial Pharmaceutical, Analytical Instrument, and Biotech Exhibitors', 32, 154);
  doc.text('• 3 Days of High-Impact Plenary Symposia, Industry Showcases, and Networking Dinners', 32, 161);

  // Sponsorship Summary Table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(203, 162, 52);
  doc.text('SPONSORSHIP TIERS AT A GLANCE', 105, 178, { align: 'center' });

  // Tier 1: Platinum (Rs. 100,000)
  doc.setFillColor(20, 40, 68);
  doc.roundedRect(25, 186, 160, 19, 2, 2, 'F');
  doc.setTextColor(203, 162, 52);
  doc.setFontSize(10.5);
  doc.text('PLATINUM SPONSOR — Rs. 100,000 (INR 1,00,000 + 18% GST)', 32, 194);
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 245);
  doc.setFont('helvetica', 'normal');
  doc.text('Space for one display booth · Two complimentary registrations · Listed as sponsor of conference', 32, 200);

  // Tier 2: Gold (Rs. 75,000)
  doc.setFillColor(20, 40, 68);
  doc.roundedRect(25, 208, 160, 19, 2, 2, 'F');
  doc.setTextColor(203, 162, 52);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('GOLD SPONSOR — Rs. 75,000 (INR 75,000 + 18% GST)', 32, 216);
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 245);
  doc.setFont('helvetica', 'normal');
  doc.text('Space for one display booth · One complimentary registration · Listed as sponsor of conference', 32, 222);

  // Tier 3: Silver (Rs. 50,000)
  doc.setFillColor(20, 40, 68);
  doc.roundedRect(25, 230, 160, 19, 2, 2, 'F');
  doc.setTextColor(203, 162, 52);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('SILVER SPONSOR — Rs. 50,000 (INR 50,000 + 18% GST)', 32, 238);
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 245);
  doc.setFont('helvetica', 'normal');
  doc.text('Complimentary sponsorship · Space for one display booth · Listed as sponsor of conference', 32, 244);

  // Tier 4: Bronze (Rs. 25,000)
  doc.setFillColor(20, 40, 68);
  doc.roundedRect(25, 252, 160, 19, 2, 2, 'F');
  doc.setTextColor(203, 162, 52);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('BRONZE SPONSOR — Rs. 25,000 (INR 25,000 + 18% GST)', 32, 260);
  doc.setFontSize(8);
  doc.setTextColor(220, 230, 245);
  doc.setFont('helvetica', 'normal');
  doc.text('Appreciative sponsorship · No space for display · Only listed as a sponsor of the conference', 32, 266);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Contact Secretariat: neuromedpharmacon26@gmail.com | (+91) 9250446799', 105, 280, { align: 'center' });

  // Page 2: Detailed Matrix & Booking Information
  doc.addPage('a4', 'portrait');

  doc.setFillColor(6, 14, 24);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setFillColor(203, 162, 52);
  doc.rect(0, 32, 210, 1.5, 'F');

  doc.setTextColor(203, 162, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('IPS NORTH ZONE CONFERENCE 2027 · NIPER-RAEBARELI LUCKNOW', 105, 14, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('COMPREHENSIVE DELIVERABLES & SPONSOR MATRIX', 105, 23, { align: 'center' });

  let rY = 44;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text('Deliverables & Benefits Comparison Table', 20, rY);

  rY += 6;
  doc.setFillColor(241, 245, 249);
  doc.rect(20, rY, 170, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Benefits / Entitlements', 23, rY + 5.5);
  doc.text('Platinum (Rs. 1 Lakh)', 88, rY + 5.5);
  doc.text('Gold (Rs. 75k)', 118, rY + 5.5);
  doc.text('Silver (Rs. 50k)', 143, rY + 5.5);
  doc.text('Bronze (Rs. 25k)', 168, rY + 5.5);

  const matrix = [
    ['Display Booth Allocation', 'Space for 1 booth', 'Space for 1 booth', 'Space for 1 booth', 'No display space'],
    ['Complimentary Registration', '2 Registrations', '1 Registration', 'Complimentary', '—'],
    ['Conference Sponsor Recognition', 'Listed as sponsor', 'Listed as sponsor', 'Listed as sponsor', 'Only listed sponsor'],
    ['Official Category', 'Prime Sponsor', 'Leading Sponsor', 'Complimentary', 'Appreciative Sponsor']
  ];

  rY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  matrix.forEach((row, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, rY, 170, 7, 'F');
    }
    doc.setTextColor(30, 41, 59);
    doc.text(row[0], 23, rY + 4.8);
    doc.setTextColor(15, 23, 42);
    doc.text(row[1], 88, rY + 4.8);
    doc.text(row[2], 118, rY + 4.8);
    doc.text(row[3], 143, rY + 4.8);
    doc.text(row[4], 168, rY + 4.8);
    rY += 7;
  });

  // Terms & Payment Details
  rY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 14, 24);
  doc.text('Stall Allocation & Booking Protocol', 20, rY);

  rY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const terms = [
    '1. Stalls will be allotted strictly on a first-come, first-served basis upon receipt of official confirmation & advance payment.',
    '2. 50% advance payment is required upon confirmation; remaining balance must be settled 30 days prior to the conference.',
    '3. GST at 18% is applicable as per Govt of India tax regulations. Formal GST invoice will be issued by NIPER-Raebareli.',
    '4. Standard stall provisions include octanorm structure, 2 spotlights, 1 power socket (5A), 1 discussion table, and 2 chairs.',
    '5. Bank Wire Transfer (NEFT/RTGS) Details: Account Name: NIPER-Raebareli Conferences | Bank: State Bank of India | IFSC: SBIN0011214.'
  ];
  terms.forEach(t => {
    const lines = doc.splitTextToSize(t, 170);
    doc.text(lines, 20, rY);
    rY += lines.length * 4.2;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Page 2 of 2 — Sponsorship Secretariat: neuromedpharmacon26@gmail.com | (+91) 9250446799', 105, 290, { align: 'center' });

  const buffer = doc.output('arraybuffer');
  const targetDir = path.join(__dirname, '../public/downloads');
  const filePath = path.join(targetDir, 'IPS_NorthZone_Sponsorship_Prospectus_2027.pdf');
  fs.writeFileSync(filePath, Buffer.from(buffer));
  console.log(`Generated official Sponsorship PDF: ${filePath} (${fs.statSync(filePath).size} bytes)`);
}

generateSponsorshipProspectusPDF();
