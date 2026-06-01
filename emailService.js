import { createTransport } from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

function getTransporter() {
  return createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Format a deal into HTML block */
function dealHtml(d) {
  const discountPct = d.discountPct || Math.round(((d.normalPrice - d.dealPrice) / d.normalPrice) * 100) || 0;
  return `
    <div style="background:#fff;border-radius:12px;padding:20px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
      <div style="font-size:18px;font-weight:600;color:#1e293b;margin-bottom:8px;">✈️ ${d.departureAirport || 'ATL'} → ${d.destination}</div>
      <div>
        <span style="font-size:28px;font-weight:700;color:#1d4ed8;">$${d.dealPrice}</span>
        &nbsp;<span style="color:#9ca3af;text-decoration:line-through;font-size:14px;">$${d.normalPrice}</span>
        &nbsp;<span style="display:inline-block;background:#16a34a;color:#fff;border-radius:20px;padding:2px 10px;font-size:13px;font-weight:600;">Save ${discountPct}%</span>
      </div>
      <div style="color:#64748b;font-size:13px;margin-top:8px;">📅 ${d.outboundDate} – ${d.returnDate} &nbsp;|&nbsp; ${d.airlines}</div>
      <div style="color:#64748b;font-size:13px;margin-top:4px;">⏰ Book: ${d.bookingWindow}</div>
      ${d.description ? `<p style="color:#374151;font-size:14px;margin-top:10px;">${d.description}</p>` : ''}
      ${d.bookingLink ? `<a href="${d.bookingLink}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;">View Flights →</a>` : ''}
    </div>`;
}

export async function shareViaEmail(deals, topDealsArray) {
  const transporter = getTransporter();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fa;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;">
    <h1 style="color:#1e293b;margin-bottom:4px;">✈️ AeroFamily Deal Alert</h1>
    <p style="color:#64748b;margin-top:0;margin-bottom:24px;">${today} · ${deals.length} deals found today</p>
    ${topDealsArray.map(dealHtml).join('')}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center;">AeroFamily · Your daily flight deal agent</p>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `AeroFamily ✈️ <${process.env.SMTP_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `✈️ ${topDealsArray.length} Flight Deals Today — Best: ${topDealsArray[0]?.destination} from $${topDealsArray[0]?.dealPrice}`,
    html: htmlBody,
  });

  console.log(`[EmailService] Daily email sent to ${process.env.EMAIL_TO}`);
  return { sent: true, count: topDealsArray.length };
}

export async function sendWishlistAlertEmail(deals, destination) {
  const transporter = getTransporter();

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fa;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;">
    <h1 style="color:#1e293b;margin-bottom:4px;">⭐ Wishlist Alert: ${destination}</h1>
    <p style="color:#64748b;margin-top:0;margin-bottom:24px;">We found ${deals.length} live flight deal(s) matching your wishlist for <strong>${destination}</strong>!</p>
    ${deals.map(dealHtml).join('')}
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center;">AeroFamily · Don't wait, wishlist deals book fast!</p>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `AeroFamily Wishlist ⭐ <${process.env.SMTP_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `⭐ Wishlist Alert: Deals found for ${destination}!`,
    html: htmlBody,
  });

  console.log(`[EmailService] Wishlist alert for ${destination} sent to ${process.env.EMAIL_TO}`);
  return { sent: true };
}
