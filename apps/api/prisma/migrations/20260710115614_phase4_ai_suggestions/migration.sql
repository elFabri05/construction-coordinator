-- CreateEnum
CREATE TYPE "AiSuggestionType" AS ENUM ('resequence', 'rework', 'blocker', 'guideline_conflict', 'other');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('pending', 'accepted', 'dismissed');

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_id" TEXT,
    "related_task_ids" TEXT[],
    "triggered_by_submission_id" TEXT,
    "suggestion_type" "AiSuggestionType" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_suggestions_project_id_status_created_at_idx" ON "ai_suggestions"("project_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_triggered_by_submission_id_fkey" FOREIGN KEY ("triggered_by_submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
