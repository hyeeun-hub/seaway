-- CreateTable
CREATE TABLE "ProcessedFile" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" TEXT,
    "sheet" TEXT,
    "headerRow" INTEGER,
    "dataStartRow" INTEGER,
    "rowCount" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "txAdded" INTEGER NOT NULL DEFAULT 0,
    "txSkippedDuplicate" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "anomalies" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ProcessedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "txKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "amount" INTEGER,
    "proj" TEXT NOT NULL,
    "use" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "payer" TEXT,
    "settleDate" TEXT,
    "settleMethod" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "problemType" TEXT NOT NULL,
    "suggestion" TEXT,
    "suggestedCategory" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "resolvedCategory" TEXT,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminCategoryRule" (
    "id" TEXT NOT NULL,
    "matchOn" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "AdminCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedFile_fileHash_key" ON "ProcessedFile"("fileHash");

-- CreateIndex
CREATE INDEX "ProcessedFile_status_idx" ON "ProcessedFile"("status");

-- CreateIndex
CREATE INDEX "Transaction_month_idx" ON "Transaction"("month");

-- CreateIndex
CREATE INDEX "Transaction_proj_idx" ON "Transaction"("proj");

-- CreateIndex
CREATE INDEX "Transaction_side_idx" ON "Transaction"("side");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txKey_seq_key" ON "Transaction"("txKey", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDecision_transactionId_key" ON "ReviewDecision"("transactionId");

-- CreateIndex
CREATE INDEX "ReviewDecision_status_idx" ON "ReviewDecision"("status");

-- CreateIndex
CREATE INDEX "ReviewDecision_problemType_idx" ON "ReviewDecision"("problemType");

-- CreateIndex
CREATE UNIQUE INDEX "AdminCategoryRule_matchOn_pattern_key" ON "AdminCategoryRule"("matchOn", "pattern");

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
