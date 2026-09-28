import PDFDocument from "pdfkit";
import { prisma } from "../config/database.js";
import { uploadToS3 } from "../infrastructure/services/uploadToS3.js";
import { decrypt, decryptDeterministic, decryptUserKey, encryptUserKey } from "./encryption.js"
import { NotificationService } from "../infrastructure/services/notificationService.js"

/**
 * Calculate session duration
 * @param {Date} loginTime
 * @param {Date|null} logoutTime
 * @returns {string} Formatted duration
 */
function calculateSessionDuration(loginTime, logoutTime) {
    const endTime = logoutTime || new Date();
    const durationMs = endTime - loginTime;

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Calculate total active days from login history
 * @param {Array} loginHistory
 * @returns {number} Number of unique active days
 */
function calculateActiveDays(loginHistory) {
    const uniqueDays = new Set();
    loginHistory.forEach(log => {
        const dateStr = new Date(log.loggedInAt).toDateString();
        uniqueDays.add(dateStr);
    });
    return uniqueDays.size;
}

/**
 * Draw table with proper formatting
 */
function drawTable(doc, headers, rows, startY, columnWidths) {
    let currentY = startY;
    const tableX = 50;
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const rowHeight = 35;
    const headerHeight = 30;

    // Draw header
    doc.rect(tableX, currentY, tableWidth, headerHeight)
        .fillAndStroke('#2C3E50', '#2C3E50');

    doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold');
    let xPos = tableX;
    headers.forEach((header, i) => {
        doc.text(header, xPos + 5, currentY + 10, {
            width: columnWidths[i] - 10,
            align: 'left'
        });
        xPos += columnWidths[i];
    });

    currentY += headerHeight;

    // Draw rows
    rows.forEach((row, rowIndex) => {
        // Check if we need a new page
        if (currentY > 720) {
            doc.addPage();
            currentY = 50;

            // Redraw header on new page
            doc.rect(tableX, currentY, tableWidth, headerHeight)
                .fillAndStroke('#2C3E50', '#2C3E50');

            doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold');
            let xPos = tableX;
            headers.forEach((header, i) => {
                doc.text(header, xPos + 5, currentY + 10, {
                    width: columnWidths[i] - 10,
                    align: 'left'
                });
                xPos += columnWidths[i];
            });
            currentY += headerHeight;
        }

        // Alternate row colors
        const bgColor = rowIndex % 2 === 0 ? '#F8F9FA' : '#FFFFFF';
        doc.rect(tableX, currentY, tableWidth, rowHeight)
            .fillAndStroke(bgColor, '#DEE2E6');

        // Draw cell borders
        let cellX = tableX;
        columnWidths.forEach((width) => {
            doc.moveTo(cellX, currentY)
                .lineTo(cellX, currentY + rowHeight)
                .stroke('#DEE2E6');
            cellX += width;
        });

        // Draw cell content
        doc.fontSize(8).fillColor('#2C3E50').font('Helvetica');
        xPos = tableX;
        row.forEach((cell, i) => {
            const cellY = currentY + (rowHeight - 16) / 2;
            doc.text(cell, xPos + 5, cellY, {
                width: columnWidths[i] - 10,
                align: i === 0 ? 'center' : 'left',
                lineBreak: false,
                ellipsis: true
            });
            xPos += columnWidths[i];
        });

        currentY += rowHeight;
    });

    return currentY;
}

export const userDecryption = (user) => {
    const userKey = decryptUserKey(user.encryptedUserKey);
    if (user.name) user.name = decrypt(user.name, userKey);
    if (user.email) user.email = decryptDeterministic(user.email, userKey);

    return user
}

/**
 * Generate professional PDF report for last 30 days and upload to S3
 * @param {string} userId
 * @param {string} destinationFolder S3 folder
 * @returns {Promise<string>} S3 URL of the PDF
 */
export async function generateAndUploadLogsPDF(userId, destinationFolder = "reports") {
    try {
        // 1️⃣ Calculate 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 2️⃣ Fetch user details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true, encryptedUserKey: true }
        });

        // 3️⃣ Fetch login history
        const loginHistory = await prisma.loginHistory.findMany({
            where: { userId, loggedInAt: { gte: thirtyDaysAgo } },
            orderBy: { loggedInAt: "desc" },
        });

        // 4️⃣ Fetch meditation watch history with meditation details
        const meditationHistory = await prisma.meditationWatchHistory.findMany({
            where: { userId, watchedAt: { gte: thirtyDaysAgo } },
            include: {
                meditation: {
                    select: {
                        title: true
                    }
                }
            },
            orderBy: { watchedAt: "desc" },
        });

        // 5️⃣ Calculate active days
        const activeDays = calculateActiveDays(loginHistory);

        // 6️⃣ Create PDF in memory
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true
        });

        // ========== HEADER ==========
        doc.fontSize(28).fillColor('#1A5490').font('Helvetica-Bold')
            .text("BeingOneWithin", { align: "center" });
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor('#5A6C7D').font('Helvetica')
            .text("Subject Access Request (SAR) Report", { align: "center" });
        doc.moveDown(0.5);

        // Decorative line
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(2).stroke('#1A5490');
        doc.moveDown(1.5);

        // ========== REPORT METADATA ==========
        const metaBoxY = doc.y;
        doc.roundedRect(50, metaBoxY, 495, 100, 5).fillAndStroke('#F0F4F8', '#D1D9E6');

        doc.fontSize(9).fillColor('#2C3E50').font('Helvetica-Bold');
        doc.text("Report Details", 65, metaBoxY + 15);

        doc.fontSize(8).font('Helvetica');
        doc.text(`Generated: ${new Date().toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        })}`, 65, metaBoxY + 35);
        doc.text(`Activity Period: ${thirtyDaysAgo.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        })} - ${new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        })}`, 65, metaBoxY + 50);

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text("User Information", 320, metaBoxY + 15);

        doc.fontSize(8).font('Helvetica');
        if (user) {
            const decryptedUser = userDecryption(user);
            doc.text(`Name: ${decryptedUser.name || 'N/A'}`, 320, metaBoxY + 35);
            doc.text(`Email: ${decryptedUser.email || 'N/A'}`, 320, metaBoxY + 50);
        }

        doc.y = metaBoxY + 110;
        doc.moveDown(1);

        // ========== SUMMARY STATISTICS (CENTERED) ==========
        doc.fontSize(12).fillColor('#1A5490').font('Helvetica-Bold')
            .text("Activity Summary", 50, doc.y, { align: "center", width: 495, underline: true });
        doc.moveDown(0.8);

        const summaryY = doc.y;
        doc.roundedRect(50, summaryY, 160, 60, 5).fillAndStroke('#E8F4F8', '#B8D4E8');
        doc.roundedRect(220, summaryY, 160, 60, 5).fillAndStroke('#FFF4E6', '#FFD699');
        doc.roundedRect(390, summaryY, 155, 60, 5).fillAndStroke('#E8F8F5', '#A3E4D7');

        doc.fontSize(10).fillColor('#2C3E50').font('Helvetica-Bold');
        doc.text("Total Logins", 65, summaryY + 15, { width: 130, align: 'center' });
        doc.text("Meditation Sessions", 235, summaryY + 15, { width: 130, align: 'center' });
        doc.text("Active Days", 405, summaryY + 15, { width: 125, align: 'center' });

        doc.fontSize(20).fillColor('#1A5490');
        doc.text(loginHistory.length.toString(), 65, summaryY + 32, { width: 130, align: 'center' });
        doc.fillColor('#E67E22');
        doc.text(meditationHistory.length.toString(), 235, summaryY + 32, { width: 130, align: 'center' });
        doc.fillColor('#27AE60');
        doc.text(activeDays.toString(), 405, summaryY + 32, { width: 125, align: 'center' });

        doc.y = summaryY + 75;
        doc.moveDown(2);

        // ========== LOGIN HISTORY TABLE (CENTERED HEADING) ==========
        doc.fontSize(12).fillColor('#1A5490').font('Helvetica-Bold')
            .text("Login Activity History", 50, doc.y, { align: "center", width: 495, underline: true });
        doc.moveDown(1);

        if (loginHistory.length === 0) {
            doc.fontSize(10).fillColor('#7F8C8D').font('Helvetica-Oblique')
                .text("No login activity recorded during this period.", { italic: true, align: 'center' });
            doc.moveDown(1);
        } else {
            const loginHeaders = ["S.No", "Login Date & Time", "Logout Date & Time", "Duration", "Device"];
            const loginColumnWidths = [35, 130, 130, 70, 130];

            const loginRows = loginHistory.map((log, index) => {
                const loginTime = new Date(log.loggedInAt);
                const logoutTime = log.loggedOutAt ? new Date(log.loggedOutAt) : null;
                const duration = calculateSessionDuration(loginTime, logoutTime);
                const status = logoutTime ? "" : " (Active)";

                return [
                    (index + 1).toString(),
                    loginTime.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    logoutTime
                        ? logoutTime.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })
                        : "Currently Logged In",
                    duration + status,
                    log.device || "Unknown Device"
                ];
            });

            const endY = drawTable(doc, loginHeaders, loginRows, doc.y, loginColumnWidths);
            doc.y = endY + 20;
        }

        // ========== MEDITATION HISTORY TABLE (CENTERED HEADING) ==========
        doc.fontSize(12).fillColor('#1A5490').font('Helvetica-Bold')
            .text("Meditation Activity History", 50, doc.y, { align: "center", width: 495, underline: true });
        doc.moveDown(1);

        if (meditationHistory.length === 0) {
            doc.fontSize(10).fillColor('#7F8C8D').font('Helvetica-Oblique')
                .text("No meditation activity recorded during this period.", { italic: true, align: 'center' });
        } else {
            const meditationHeaders = ["S.No", "Meditation Name", "Date & Time", "Duration", "Status"];
            const meditationColumnWidths = [35, 180, 130, 80, 70];

            const meditationRows = meditationHistory.map((med, index) => {
                const watchedTime = new Date(med.watchedAt);
                const meditationName = med.meditation?.title || "Unknown Meditation";
                const durationMinutes = Math.floor((med.watchedSeconds || 0) / 60);
                const durationSeconds = (med.watchedSeconds || 0) % 60;
                const durationStr = durationMinutes > 0
                    ? `${durationMinutes}m ${durationSeconds}s`
                    : `${durationSeconds}s`;

                return [
                    (index + 1).toString(),
                    meditationName,
                    watchedTime.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    durationStr,
                    med.completed ? "✓ Completed" : "Incomplete"
                ];
            });

            drawTable(doc, meditationHeaders, meditationRows, doc.y, meditationColumnWidths);
        }

        // ========== FOOTER ==========
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);

            // Footer line
            doc.moveTo(50, doc.page.height - 70)
                .lineTo(545, doc.page.height - 70)
                .stroke('#D1D9E6');

            // Footer text
            doc.fontSize(7).fillColor('#7F8C8D').font('Helvetica');
            doc.text(
                "This report contains your personal data as requested under GDPR and applicable data protection regulations.",
                50,
                doc.page.height - 60,
                { align: 'center', width: 495 }
            );
            doc.text(
                `For inquiries, contact: privacy@beingonewithin.com | Page ${i + 1} of ${pageCount}`,
                50,
                doc.page.height - 45,
                { align: 'center', width: 495 }
            );
        }

        doc.end();

        // 7️⃣ Convert PDF to buffer
        const pdfBuffer = await new Promise((resolve, reject) => {
            const resultBuffers = [];
            doc.on("data", (chunk) => resultBuffers.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(resultBuffers)));
            doc.on("error", (err) => reject(err));
        });

        // 8️⃣ Upload to S3
        const timestamp = new Date().toISOString().split('T')[0];
        const s3Urls = await uploadToS3(
            {
                buffer: pdfBuffer,
                name: `BeingOneWithin_SAR_Report_${userId}_${timestamp}.pdf`
            },
            destinationFolder
        );
        if (user && s3Urls[0]) {
            const decryptedUser = userDecryption(user);
            const { subject, text, html } = generateSARReportEmailTemplate({ userName: decryptedUser.name, s3Url: s3Urls[0] })
            const notification = new NotificationService();
            await notification.sendEmail(decryptedUser.email, subject, text, html)
        }
        return s3Urls[0];
    } catch (error) {
        console.log(error)
        throw new Error(`Failed to generate SAR report: ${error.message}`);
    }
}

/**
 * Generate SAR Report Email Template
    * @param { Object } params
        * @param { string } params.userName - User's name
            * @param { string } params.s3Url - S3 URL for cloud download
                * @returns { Object } { subject, text, html }
 */
export function generateSARReportEmailTemplate({ userName, s3Url }) {
    const subject = "Your Data Access Request Report - BeingOneWithin";

    const text = `
Dear ${userName},

Thank you for requesting your personal data report from BeingOneWithin.

As per your Subject Access Request (SAR) under GDPR and applicable data protection regulations, we have prepared a comprehensive report containing your activity data for the last 30 days.

This report includes:
- Login activity history with session details
- Meditation session records and progress
- Summary statistics of your account activity

The report is attached to this email as a PDF document. You can also access it securely at:
${s3Url}

If you have any questions about your data or need further assistance, please don't hesitate to contact our privacy team at privacy@beingonewithin.com

Important Information:
- This report contains sensitive personal information. Please keep it secure.
- The data in this report covers the period of the last 30 days.
- You have the right to request corrections, deletions, or additional information about your data.

Thank you for being a valued member of the BeingOneWithin community.

Best regards,
BeingOneWithin Privacy Team

---
This is an automated message. Please do not reply directly to this email.
For support inquiries, contact: support@beingonewithin.com
  `.trim();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Data Access Request Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1A5490 0%, #2980b9 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">BeingOneWithin</h1>
              <p style="margin: 10px 0 0 0; color: #e8f4f8; font-size: 14px; letter-spacing: 1px;">YOUR WELLNESS JOURNEY</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #2C3E50; font-size: 22px; font-weight: 600;">Your Data Access Request Report</h2>
              
              <p style="margin: 0 0 15px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                Dear <strong>${userName}</strong>,
              </p>

              <p style="margin: 0 0 15px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                Thank you for requesting your personal data report from BeingOneWithin. As per your Subject Access Request (SAR) under GDPR and applicable data protection regulations, we have prepared a comprehensive report containing your activity data.
              </p>

              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0; background-color: #E8F4F8; border-left: 4px solid #1A5490; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px 0; color: #2C3E50; font-size: 15px; font-weight: 600;">📊 Your Report Includes:</p>
                    <ul style="margin: 0; padding-left: 20px; color: #555555; font-size: 14px; line-height: 1.8;">
                      <li>Login activity history with session details</li>
                      <li>Meditation session records and progress</li>
                      <li>Summary statistics of your account activity</li>
                      <li>Active days tracking over the last 30 days</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 15px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                The report is attached to this email as a PDF document. You can download and review it at your convenience.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color: #1A5490; border-radius: 6px; padding: 14px 30px;">
                          <a href="${s3Url}" target="_blank" style="color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
                            📎 Download Report from Cloud
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Important Notice -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0; background-color: #FFF4E6; border-left: 4px solid #E67E22; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 10px 0; color: #2C3E50; font-size: 14px; font-weight: 600;">⚠️ Important Information:</p>
                    <ul style="margin: 0; padding-left: 20px; color: #555555; font-size: 13px; line-height: 1.7;">
                      <li>This report contains sensitive personal information. Please keep it secure.</li>
                      <li>The data in this report covers the period of the last 30 days.</li>
                      <li>You have the right to request corrections, deletions, or additional information.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin: 25px 0 15px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                If you have any questions about your data or need further assistance, please contact our privacy team at 
                <a href="mailto:privacy@beingonewithin.com" style="color: #1A5490; text-decoration: none; font-weight: 600;">privacy@beingonewithin.com</a>
              </p>

              <p style="margin: 25px 0 0 0; color: #555555; font-size: 15px; line-height: 1.6;">
                Thank you for being a valued member of the BeingOneWithin community.
              </p>

              <p style="margin: 20px 0 0 0; color: #555555; font-size: 15px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #1A5490;">BeingOneWithin Privacy Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px 0; color: #7f8c8d; font-size: 12px; line-height: 1.5;">
                This is an automated message from BeingOneWithin.<br>
                Please do not reply directly to this email.
              </p>
              <p style="margin: 10px 0 0 0; color: #7f8c8d; font-size: 12px;">
                For support inquiries: 
                <a href="mailto:support@beingonewithin.com" style="color: #1A5490; text-decoration: none;">support@beingonewithin.com</a>
              </p>
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                <p style="margin: 0; color: #95a5a6; font-size: 11px;">
                  © ${new Date().getFullYear()} BeingOneWithin. All rights reserved.
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

    return { subject, text, html };
}