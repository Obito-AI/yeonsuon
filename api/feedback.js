import { put } from '@vercel/blob';
import { createFeedbackHandler } from '../lib/feedback.js';

// Standalone Vercel Node functions use build-time NODEJS_HELPERS=0 for raw bodies.
// The shared handler also accepts a restored stream or an already parsed body.
export { createFeedbackHandler };
export default createFeedbackHandler({ put });
