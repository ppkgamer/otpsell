// Fix SSL cert verification on Windows dev environment only
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const gmailRoutes = require('./routes/gmail');
const otpRoutes = require('./routes/otp');
const adminRoutes = require('./routes/admin');
const { startPollingJob } = require('./jobs/pollEmails');
const { startCreditDeductionJob } = require('./jobs/creditDeduction');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startPollingJob();
  startCreditDeductionJob();
});
