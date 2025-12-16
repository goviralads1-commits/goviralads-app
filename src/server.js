require('dotenv').config();

const express = require('express');
const morgan = require('morgan');

const { connectToDatabase } = require('./config/db');
const { ensureMainAdminSeed } = require('./models/seedMainAdmin');
const { ensureClientWallets } = require('./models/seedWallets');
const { runPhase2SafetyChecks, runPhase3SafetyChecks } = require('./utils/safetyChecks');

const app = express();

app.use(express.json());
app.use(morgan('dev'));

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');

app.use('/auth', authRoutes);
app.use('/client', clientRoutes);
app.use('/admin', adminRoutes);

// Placeholder for routes (auth, protected, etc.)
// They will be added step-by-step as we implement Phase 1.

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'goviral-backend' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectToDatabase();
    await ensureMainAdminSeed();
    await ensureClientWallets();
    await runPhase2SafetyChecks();
    await runPhase3SafetyChecks();

    app.listen(PORT, () => {
      console.log(`GoViral backend listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
