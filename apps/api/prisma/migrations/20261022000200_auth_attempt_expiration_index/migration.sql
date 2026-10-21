-- Support bounded expiry cleanup without scanning every client attempt bucket.
CREATE INDEX "AuthAttempt_resetAt_idx" ON "AuthAttempt"("resetAt");
