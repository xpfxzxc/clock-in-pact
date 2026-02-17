-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DISPUTED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "CheckinReviewAction" AS ENUM ('CONFIRMED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "FeedEventType" AS ENUM ('GROUP_CREATED', 'MEMBER_JOINED', 'GOAL_CREATED', 'GOAL_CONFIRMED', 'CHANGE_REQUEST_INITIATED', 'CHANGE_REQUEST_CONFIRMED', 'CHECKIN_SUBMITTED', 'REVIEW_SUBMITTED', 'SETTLEMENT_CONFIRMED', 'GOAL_STATUS_CHANGED', 'GOAL_AUTO_APPROVED', 'CHANGE_REQUEST_AUTO_APPROVED', 'CHALLENGER_AUTO_ENROLLED', 'GOAL_CONFIRMATION_RESET', 'CHANGE_REQUEST_RESULT', 'CHECKIN_CONFIRMED', 'CHECKIN_AUTO_APPROVED', 'SETTLEMENT_COMPLETED', 'DURATION_UNLOCKED');

-- CreateTable
CREATE TABLE "checkins" (
    "id" SERIAL NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "checkin_date" DATE NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "note" VARCHAR(500),
    "status" "CheckinStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_evidences" (
    "id" SERIAL NOT NULL,
    "checkin_id" INTEGER NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_reviews" (
    "id" SERIAL NOT NULL,
    "checkin_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "action" "CheckinReviewAction" NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_confirmations" (
    "id" SERIAL NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_events" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "event_type" "FeedEventType" NOT NULL,
    "actor_id" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkin_reviews_checkin_id_member_id_key" ON "checkin_reviews"("checkin_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_confirmations_goal_id_member_id_key" ON "settlement_confirmations"("goal_id", "member_id");

-- CreateIndex
CREATE INDEX "feed_events_group_id_id_idx" ON "feed_events"("group_id", "id" DESC);

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_evidences" ADD CONSTRAINT "checkin_evidences_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_reviews" ADD CONSTRAINT "checkin_reviews_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_reviews" ADD CONSTRAINT "checkin_reviews_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_confirmations" ADD CONSTRAINT "settlement_confirmations_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_confirmations" ADD CONSTRAINT "settlement_confirmations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
