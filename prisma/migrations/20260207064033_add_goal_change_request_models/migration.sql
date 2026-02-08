-- CreateEnum
CREATE TYPE "GoalChangeRequestType" AS ENUM ('MODIFY', 'CANCEL');

-- CreateEnum
CREATE TYPE "GoalChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'VOIDED');

-- CreateTable
CREATE TABLE "goal_change_requests" (
    "id" SERIAL NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "type" "GoalChangeRequestType" NOT NULL,
    "status" "GoalChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "initiator_id" INTEGER NOT NULL,
    "proposed_changes" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_change_votes" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "status" "ConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_change_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goal_change_votes_request_id_member_id_key" ON "goal_change_votes"("request_id", "member_id");

-- AddForeignKey
ALTER TABLE "goal_change_requests" ADD CONSTRAINT "goal_change_requests_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_change_requests" ADD CONSTRAINT "goal_change_requests_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "group_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_change_votes" ADD CONSTRAINT "goal_change_votes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "goal_change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_change_votes" ADD CONSTRAINT "goal_change_votes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
