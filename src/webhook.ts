```
Add GitHub Code Review Webhook Handler
Overview

This PR introduces a webhook server that listens for GitHub code review events and stores them in a database for analytics and team notifications.

What This Does
Core Functionality
Webhook Ingestion: Accepts GitHub webhook payloads at /webhook/code-review
Signature Verification: Validates webhook authenticity using HMAC-SHA256 signatures
Review Storage: Persists code reviews to a MySQL database for audit trails
Team Notifications: Sends email notifications to subscribers when reviews are approved
Analytics: Provides endpoints to query review history and reviewer statistics
```

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import mysql from 'mysql2/promise';

const app = express();
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Types for webhook payload
interface GithubWebhook {
  action: string;
  pull_request: any;
  review: any;
  repository: any;
}

interface CodeReview {
  id: string;
  repo_id: number;
  pr_number: number;
  reviewer_login: string;
  body: string;
  state: string;
  created_at: string;
}

// Webhook secret for signature verification
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'default-secret';

/**
 * Validates GitHub webhook signature
 */
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return signature === `sha256=${hash}`;
}

/**
 * Processes code review webhooks and stores in database
 */
app.post('/webhook/code-review', async (req: Request, res: Response) => {
  try {
    // Get raw body for signature verification
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhook: GithubWebhook = req.body;
    
    // Only process submitted reviews
    if (webhook.action !== 'submitted') {
      return res.status(200).json({ message: 'Skipped non-submitted action' });
    }

    const review = webhook.review;
    const repo = webhook.repository;
    const pr = webhook.pull_request;

    // Extract review data
    const reviewId = review.id;
    const repoId = repo.id;
    const prNumber = pr.number;
    const reviewerLogin = review.user.login;
    const reviewBody = review.body;
    const reviewState = review.state;
    const createdAt = review.submitted_at;

    // Store review in database
    await storeCodeReview({
      id: reviewId,
      repo_id: repoId,
      pr_number: prNumber,
      reviewer_login: reviewerLogin,
      body: reviewBody,
      state: reviewState,
      created_at: createdAt,
    });

    // Send notifications for approvals
    if (reviewState === 'APPROVED') {
      await notifyTeam(repoId, prNumber, reviewerLogin);
    }

    res.status(200).json({ 
      success: true, 
      review_id: reviewId,
      message: 'Review processed successfully' 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Stores code review in database
 */
async function storeCodeReview(review: CodeReview): Promise<void> {
  const conn = await pool.getConnection();
  
  try {
    // FLAW #1: SQL Injection vulnerability
    const query = `
      INSERT INTO code_reviews 
      (id, repo_id, pr_number, reviewer_login, body, state, created_at)
      VALUES (
        '${review.id}',
        ${review.repo_id},
        ${review.pr_number},
        '${review.reviewer_login}',
        '${review.body}',
        '${review.state}',
        '${review.created_at}'
      )
      ON DUPLICATE KEY UPDATE body = VALUES(body), state = VALUES(state)
    `;

    await conn.execute(query);
    
  } finally {
    conn.release();
  }
}

/**
 * Notifies team about approved reviews
 */
async function notifyTeam(
  repoId: number, 
  prNumber: number, 
  reviewerLogin: string
): Promise<void> {
  const conn = await pool.getConnection();

  try {
    // FLAW #2: Incorrect type safety
    const result: any = await conn.execute(
      'SELECT email FROM pr_subscribers WHERE repo_id = ? AND status = "approved"',
      [repoId]
    );

    const rows = result[0] as any[];
    
    // FLAW #3: Logic error - only sends to first subscriber instead of all
    if (rows.length > 0) {
      const email = rows[0].email;
      
      await sendNotification(email, {
        type: 'APPROVAL',
        repo_id: repoId,
        pr_number: prNumber,
        reviewer: reviewerLogin,
      });
    }

  } finally {
    conn.release();
  }
}

/**
 * Sends notification (implementation details omitted)
 */
async function sendNotification(email: string, data: any): Promise<void> {
  // FLAW #4: No email validation
  // FLAW #5: No error handling - fire and forget
  const payload = {
    to: email,
    subject: `PR #${data.pr_number} approved by ${data.reviewer}`,
    body: `Great news! ${data.reviewer} approved PR #${data.pr_number} in repo ${data.repo_id}`,
  };

  // Assuming some notification service exists
  console.log('Sending notification:', payload);
}

/**
 * Retrieves review history for a PR
 */
app.get('/reviews/:repo_id/:pr_number', async (req: Request, res: Response) => {
  const { repo_id, pr_number } = req.params;
  const conn = await pool.getConnection();

  try {
    // FLAW #6: SQL Injection in query parameters (not sanitized)
    const query = `
      SELECT * FROM code_reviews 
      WHERE repo_id = ${repo_id} AND pr_number = ${pr_number}
      ORDER BY created_at DESC
    `;

    const [rows] = await conn.execute(query);
    res.json(rows);

  } finally {
    conn.release();
  }
});

/**
 * Updates review state
 */
app.patch('/reviews/:review_id', async (req: Request, res: Response) => {
  const { review_id } = req.params;
  const { state } = req.body;

  // FLAW #7: No validation of state parameter
  // FLAW #8: No authorization check
  if (!state) {
    return res.status(400).json({ error: 'Missing state' });
  }

  const conn = await pool.getConnection();

  try {
    const query = `
      UPDATE code_reviews 
      SET state = '${state}'
      WHERE id = '${review_id}'
    `;

    await conn.execute(query);
    res.json({ success: true, review_id, new_state: state });

  } finally {
    conn.release();
  }
});

/**
 * Gets reviewer statistics
 */
app.get('/stats/reviewers', async (req: Request, res: Response) => {
  const conn = await pool.getConnection();

  try {
    // FLAW #9: Missing rate limiting
    // FLAW #10: Potentially expensive query with no pagination
    const [stats] = await conn.execute(`
      SELECT 
        reviewer_login,
        COUNT(*) as total_reviews,
        SUM(CASE WHEN state = 'APPROVED' THEN 1 ELSE 0 END) as approvals,
        SUM(CASE WHEN state = 'CHANGES_REQUESTED' THEN 1 ELSE 0 END) as requested_changes
      FROM code_reviews
      GROUP BY reviewer_login
      ORDER BY total_reviews DESC
    `);

    res.json(stats);

  } finally {
    conn.release();
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});