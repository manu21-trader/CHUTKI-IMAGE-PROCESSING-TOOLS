// backend/utils/emailService.js
// Email service using Resend API

import { Resend } from 'resend';

const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const APP_NAME = 'CHUTKI Image Tools';

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email service is not configured');
  }
  return new Resend(process.env.RESEND_API_KEY);
};

/**
 * Send password reset email with a clickable link
 * @param {string} toEmail - Recipient email
 * @param {string} resetToken - The reset token
 * @param {string} resetUrl - Full reset URL (e.g. https://yoursite.com/reset-password?token=xxx)
 */
export const sendPasswordResetEmail = async (toEmail, resetToken, resetUrl) => {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to: [toEmail],
    subject: 'Reset Your CHUTKI Password',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Reset Your Password</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f5f3ff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,0.10);">
                
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);padding:36px 40px 28px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">[SECURE] CHUTKI</h1>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Image Processing Tools</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:40px 40px 32px;">
                    <h2 style="margin:0 0 12px;color:#1e1b4b;font-size:22px;font-weight:700;">Password Reset Request</h2>
                    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
                      We received a request to reset the password for your CHUTKI account associated with <strong>${toEmail}</strong>.
                    </p>
                    <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                      Click the button below to set a new password. This link expires in <strong>10 minutes</strong>.
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:0 0 28px;">
                          <a href="${resetUrl}"
                            style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:#fff;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.3px;">
                            Reset My Password →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

                    <!-- Token fallback -->
                    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin:0 0 24px;word-break:break-all;">
                      <a href="${resetUrl}" style="color:#7c3aed;font-size:13px;">${resetUrl}</a>
                    </p>

                    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                      If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#9ca3af;font-size:12px;">
                      © ${new Date().getFullYear()} CHUTKI Image Tools. This link expires in 10 minutes.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  });

  if (error) {
    console.error('[EMAIL] Resend error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log(`[EMAIL] [OK] Password reset email sent to ${toEmail} (id: ${data?.id})`);
  return data;
};
