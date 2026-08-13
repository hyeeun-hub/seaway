-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "loanCode" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "loanType" TEXT NOT NULL,
    "principal" BIGINT NOT NULL,
    "annualRate" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "repayMethod" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "projectName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "acquireDate" TIMESTAMP(3) NOT NULL,
    "acquireCost" BIGINT NOT NULL,
    "usefulYears" INTEGER NOT NULL,
    "depMethod" TEXT NOT NULL,
    "residualValue" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "projectName" TEXT,
    "monthlyDep" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "client" TEXT,
    "contractAmt" BIGINT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "location" TEXT,
    "status" TEXT,
    "isAutoAdded" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivedCost" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "costType" TEXT NOT NULL,
    "projectName" TEXT,
    "amount" BIGINT NOT NULL,
    "basis" TEXT NOT NULL,
    "sourceCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DerivedCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loanCode_key" ON "Loan"("loanCode");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectName_key" ON "Project"("projectName");

-- CreateIndex
CREATE INDEX "DerivedCost_runId_yearMonth_idx" ON "DerivedCost"("runId", "yearMonth");

-- CreateIndex
CREATE INDEX "DerivedCost_projectName_idx" ON "DerivedCost"("projectName");
