-- CreateTable
CREATE TABLE "ManualCalendarEntry" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "side" TEXT NOT NULL DEFAULT '매출',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReportState" (
    "month" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReportState_pkey" PRIMARY KEY ("month")
);

-- CreateIndex
CREATE INDEX "ManualCalendarEntry_date_idx" ON "ManualCalendarEntry"("date");
