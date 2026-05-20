import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pipelineRouter } from './routes/pipeline.js';
import { exportRouter } from './routes/export.js';
import { outreachRouter } from './routes/outreach.js';
import { mapsRouter } from './routes/maps.js';
import { summaryRouter } from './routes/linkedin-summary.js';

const app = express();
app.use(cors({ origin: '*' }));
// Default express.json() limit is 100 KB, which trips the moment the
// frontend POSTs an enriched-companies array (Outreach FIND CONTACTS)
// or a multi-hundred-lead Excel export. 25 MB is generous headroom
// without becoming a memory-DoS risk for a local-dev backend.
app.use(express.json({ limit: '25mb' }));
app.use('/api/summary', summaryRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/export', exportRouter);
app.use('/api/outreach', outreachRouter);
app.use('/api/maps', mapsRouter);  // ← this line was missing

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LeadGen backend running -> http://localhost:${PORT}`);
});