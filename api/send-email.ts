
import type { VercelRequest, VercelResponse } from '@vercel/node';
// import nodemailer from 'nodemailer'; // Uncomment when installing nodemailer

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, payload } = req.body;

  try {
    // NOTE: In a real environment, configure Nodemailer or use Resend/SendGrid.
    // Example:
    /*
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    
    await transporter.sendMail({
        from: '"FitPro" <no-reply@fitpro.ir>',
        to: payload.email,
        subject: `Notification: ${type}`,
        text: `Hello ${payload.name}, you have a new update.`
    });
    */

    console.log(`[API] Mock Sending Email - Type: ${type}, Recipient: ${payload?.name || 'User'}`);

    return res.status(200).json({ 
        message: 'Email processed successfully', 
        status: 'Sent' 
    });
  } catch (error: any) {
    console.error("Email Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
