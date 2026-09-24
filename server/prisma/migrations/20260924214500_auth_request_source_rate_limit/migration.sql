ALTER TABLE "AuthChallenge"
ADD COLUMN "requestSourceHash" VARCHAR(64);

CREATE INDEX "AuthChallenge_requestSourceHash_createdAt_idx"
ON "AuthChallenge"("requestSourceHash", "createdAt");
