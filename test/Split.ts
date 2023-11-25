import {
    time,
    loadFixture,
    impersonateAccount,
    stopImpersonatingAccount,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Block, Contract, Wallet } from "ethers";




const tokenAddress = {
    USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    Dai: "0x6b175474e89094c44da98b954eedeac495271d0f",
    USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    TUSD: "0x0000000000085d4780B73119b644AE5ecd22b376",
}

const lockTime = Date.now() + 5 * 24 * 60 * 60 * 60;
const totalSplitAmount = ethers.parseEther("50");
const splitDescription = (num: number) => "Split " + num;
const Participants = [
    { participant: "", owedAmount: ethers.parseEther("10"), collateral: ethers.parseEther("1") }, { participant: "", owedAmount: ethers.parseEther("20"), collateral: ethers.parseEther("2") }, { participant: "", owedAmount: ethers.parseEther("20"), collateral: ethers.parseEther("2") }
]

function modifyParticipantsAddress(addr1: string, addr2: string, addr3: string) {
    Participants[0].participant = addr1;
    Participants[1].participant = addr2;
    Participants[2].participant = addr3;
}

async function createSplit(split: any, splitNumber: number, addr1: any, addr2: any, addr3: any, zeroCollateral?: boolean, diffTokenAddress?: string, diffLockTime?: number, diffParticipants?: [], diffSplitAmount?: number) {
    modifyParticipantsAddress(addr1.address, addr2.address, addr3.address);
    const time = diffLockTime ?? lockTime;
    const participants = diffParticipants ?? Participants;
    const splitAmount = diffSplitAmount ?? totalSplitAmount;
    const token = diffTokenAddress ?? tokenAddress.USDT;

    if (zeroCollateral) Participants[0].collateral = ethers.parseEther("0");
    else Participants[0].collateral = ethers.parseEther("1");

    const tx = split.createSplit(token, splitAmount, time, splitDescription(splitNumber), participants);
    return tx;
}

describe("Split", function () {

    async function deploySplit() {
        const [owner, addr1, addr2, addr3] = await ethers.getSigners();
        const split = await ethers.deployContract("Split", [], { value: ethers.parseEther("100") });
        await split.waitForDeployment();
        return { split, owner, addr1, addr2, addr3 };
    }

    async function deployToken() {
        const [owner] = await ethers.getSigners();
        const token = await ethers.deployContract("TetherToken", [ethers.parseEther("100")]);

        await token.waitForDeployment();
        return { token, owner };
    }

    it("Should set the right owner ", async function () {
        const { split, owner } = await loadFixture(deploySplit);
        expect(await split.owner()).equal(owner.address);
    });

    describe("Create Split", function () {

        it("Should revert with InvalidLockTime", async function () {

            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = createSplit(split, 1, addr1, addr2, addr3, false, undefined, await time.latest());
            await expect(tx).to.be.revertedWithCustomError(split, 'InvalidLockTime');
        });

        it("Should revert with InvalidParticipantsCount", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = createSplit(split, 1, addr1, addr2, addr3, false, undefined, undefined, []);
            await expect(tx).to.be.revertedWithCustomError(split, "InvalidParticipantsCount");
        });

        it("Should revert with ZeroSplitAmount", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = createSplit(split, 1, addr1, addr2, addr3, false, undefined, undefined, undefined, 0);
            await expect(tx).to.be.revertedWithCustomError(split, "ZeroSplitAmount");
        });

        it("Should create splits with valid bytes32 value", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await createSplit(split, 1, addr1, addr2, addr3);
            await tx.wait();
            const mySplits = await split.getMySplits(0, 5);

            const vaildBytes32Value: boolean = /^(0x)?[0-9a-fA-F]{64}$/.test(mySplits[0]);
            expect(vaildBytes32Value).to.be.true;
        });

        it("Should create splits with unique name", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx1 = await createSplit(split, 1, addr1, addr2, addr3);
            await tx1.wait();
            const tx2 = await createSplit(split, 2, addr1, addr2, addr3);
            await tx2.wait();

            const mySplits = await split.getMySplits(0, 5);
            expect(mySplits[0]).not.equal(mySplits[1]);
        });

    });

    describe("Read Operations", function () {


        it("Should not read split general data by anyone", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await split.connect(addr1).createSplit(tokenAddress.USDT, 10, lockTime, splitDescription(1), [{ participant: addr2.address, owedAmount: 10, collateral: 1 }]);
            await tx.wait();
            const mySplits = await split.connect(addr1).getMySplits(0, 5);

            const splitData = split.connect(addr3).getSplitData(mySplits[0]);
            await expect(splitData).to.be.revertedWithCustomError(split, "AccessDenied");

        });

        it("Should read split general data", async function () {
            const { split, owner, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await createSplit(split, 1, addr1, addr2, addr3);
            await tx.wait();
            const mySplits = await split.getMySplits(0, 5);

            const splitData = await split.getSplitData(mySplits[0]);
            expect(splitData.creator).to.be.equal(owner.address);
            expect(splitData.lockTime).to.be.equal(lockTime);
            expect(splitData.splitDescription).to.be.equal(splitDescription(1));
            expect(splitData.totalSplitAmount).to.be.equal(totalSplitAmount);
            expect(splitData.baseTokenAddress).to.be.equal(await ethers.getAddress(tokenAddress.USDT));
            expect(splitData.splitName).to.be.equal(mySplits[0]);
            expect(splitData.remainingPayments).to.be.equal(3);
            expect(splitData.participants[0].participant).to.be.equal(Participants[0].participant);
            expect(splitData.participants[0].owedAmount).to.be.equal(Participants[0].owedAmount);
            expect(splitData.participants[0].collateral).to.be.equal(Participants[0].collateral);
            expect(splitData.participants[1].participant).to.be.equal(Participants[1].participant);
            expect(splitData.participants[1].owedAmount).to.be.equal(Participants[1].owedAmount);
            expect(splitData.participants[1].collateral).to.be.equal(Participants[1].collateral);
            expect(splitData.participants[2].participant).to.be.equal(Participants[2].participant);
            expect(splitData.participants[2].owedAmount).to.be.equal(Participants[2].owedAmount);
            expect(splitData.participants[2].collateral).to.be.equal(Participants[2].collateral);
        });

        it("Should not read split borrower data by other than borrowers", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await split.connect(addr1).createSplit(tokenAddress.USDT, 10, lockTime, splitDescription(1), [{ participant: addr2.address, owedAmount: 10, collateral: 1 }]);
            await tx.wait();
            const mySplits = await split.connect(addr2).getMySplits(0, 5);

            const splitBorrowerData = split.connect(addr3).getSplitBorrowerData(mySplits[0]);
            await expect(splitBorrowerData).to.be.revertedWithCustomError(split, "OnlySplitBorrowersCanPerformOperation");
        });

        it("Should not read split borrower data for creator by other than split creator", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await split.createSplit(tokenAddress.USDT, 10, lockTime, splitDescription(1), [{ participant: addr2.address, owedAmount: 10, collateral: 1 }]);
            await tx.wait();
            const mySplits = await split.connect(addr2).getMySplits(0, 5);

            const splitBorrowerData = split.connect(addr3).getSplitBorrowerDataForCreator(mySplits[0], addr2);
            await expect(splitBorrowerData).to.be.revertedWithCustomError(split, "OnlySplitCreatorCanPerformOperation");
        });

        it("Should read split borrower data", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await createSplit(split, 1, addr1, addr2, addr3);
            await tx.wait();
            const mySplits = await split.getMySplits(0, 5);

            const splitBorrowerData = await split.connect(addr1).getSplitBorrowerData(mySplits[0]);
            expect(splitBorrowerData.owedAmount).to.be.equal(ethers.parseEther("10"));
            expect(splitBorrowerData.collateral).to.be.equal(ethers.parseEther("1"));
            expect(splitBorrowerData.agreementApproved).to.be.false;
            expect(splitBorrowerData.paymentApproved).to.be.false;
            expect(splitBorrowerData.paidStatus).to.be.false;
            expect(splitBorrowerData.penalyLevied).to.be.false;
            expect(splitBorrowerData.collateralWithdrawed).to.be.false;
        });

        it("Should read split borrower data for creator", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await createSplit(split, 1, addr1, addr2, addr3);
            await tx.wait();
            const mySplits = await split.getMySplits(0, 5);

            const splitBorrowerData = await split.getSplitBorrowerDataForCreator(mySplits[0], addr1.address);
            expect(splitBorrowerData.owedAmount).to.be.equal(ethers.parseEther("10"));
            expect(splitBorrowerData.collateral).to.be.equal(ethers.parseEther("1"));
            expect(splitBorrowerData.agreementApproved).to.be.false;
            expect(splitBorrowerData.paymentApproved).to.be.false;
            expect(splitBorrowerData.paidStatus).to.be.false;
            expect(splitBorrowerData.penalyLevied).to.be.false;
            expect(splitBorrowerData.collateralWithdrawed).to.be.false;
        });

    });


    async function approveSplitAgreement(split: any, addr1: any, addr2: any, addr3: any, token: any, tokenAddress: string, splitAddress: string, fundAmount: number, collateralAmount: number) {
        const tx = await createSplit(split, 1, addr1, addr2, addr3, (collateralAmount == 0) ? true : false, tokenAddress);
        await tx.wait();

        // Fund addr1 with some tokens
        const tx1 = await token.transfer(addr1.address, ethers.parseEther(`${fundAmount}`));
        await tx1.wait();

        let balance = await split.connect(addr1).getTokenBalance(tokenAddress);
        expect(balance).to.be.equal(ethers.parseEther(`${fundAmount}`));

        // Approve the contract by allowing it to spend the collateral amount
        const tx2 = await token.connect(addr1).approve(splitAddress, ethers.parseEther(`${collateralAmount}`));
        await tx2.wait();

        // Addr1 Approves the Split Agreement and allows the contract  to transfer the collateral amount to itself from addr1's account
        const mySplits = await split.connect(addr1).getMySplits(0, 5);
        const tx3 = split.connect(addr1).approveAgreement(mySplits[0])
        await expect(tx3).changeTokenBalances(token, [addr1.address, splitAddress], [ethers.parseEther(`${-collateralAmount}`), ethers.parseEther(`${collateralAmount}`)]);

        // Check if the agreement approved
        const splitBorrowerData = await split.connect(addr1).getSplitBorrowerData(mySplits[0]);
        expect(splitBorrowerData.agreementApproved).to.be.true;

        return mySplits[0]; // splitName
    }


    describe("Approve Split Agreement", function () {

        it("Should approve agreement with zero collateral for a borrower", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);

            const tx = await createSplit(split, 1, addr1, addr2, addr3, true);
            await tx.wait();
            const mySplits = await split.connect(addr1).getMySplits(0, 5);
            const tx1 = await split.connect(addr1).approveAgreement(mySplits[0]);
            await tx1.wait();
            expect(tx1.isMined()).to.be.true;

            const splitBorrowerData = await split.connect(addr1).getSplitBorrowerData(mySplits[0]);
            expect(splitBorrowerData.agreementApproved).to.be.true;
        });

        it("Should approve agreement with non-zero collateral after allowing token spending on caller and should check for double approving", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const fundAmount = 20; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            // Check if agreeing another time causes error
            const tx4 = split.connect(addr1).approveAgreement(splitName);
            await expect(tx4).to.be.revertedWithCustomError(split, "AgreementAlreadyApproved");
        });
    });

    async function approveAndMakePayment(split: any, addr1: any, addr2: any, addr3: any, token: any, tokenAddress: string, splitAddress: string, fundAmount: number, collateralAmount: number, splitName: string, owedAmount: number) {
        // Approve the contract to spend the owed amount 
        const tx4 = await token.connect(addr1).approve(splitAddress, ethers.parseEther(`${owedAmount}`));
        await tx4.wait();

        // Approve the payment for addr1. Contract transfers the owed amount to first itself and then to the split creator
        const splitData = await split.connect(addr1).getSplitData(splitName);
        const tx5 = split.connect(addr1).approvePayment(splitName);
        // Check if the payment approved and tokens transferred
        await expect(tx5).changeTokenBalances(token, [addr1.address, splitData.creator], [ethers.parseEther(`${-owedAmount}`), ethers.parseEther(`${owedAmount}`)]);
        const splitBorrowerData = await split.connect(addr1).getSplitBorrowerData(splitName);
        expect(splitBorrowerData.paymentApproved).to.be.true;
        expect(splitBorrowerData.paidStatus).to.be.true;
    }

    describe("Approve Payment", function () {

        it("Should not approve payment if agreement not approved by borrower", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const tx = await createSplit(split, 1, addr1, addr2, addr3, false, tokenAddress);
            await tx.wait();

            const mySplits = await split.getMySplits(0, 5);
            const tx1 = split.connect(addr1).approvePayment(mySplits[0]);
            expect(tx1).to.be.revertedWithCustomError(split, "AgreementNotApprovedByBorrower");
        });

        it("Should approve payment and transfer tokens to split creator", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const owedAmount = 10; // in base token
            const fundAmount = 50; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            // Aprrove payment and allow contract to transfer owed amount to split creator on befalf of addr1
            await approveAndMakePayment(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount, splitName, owedAmount);

        });

    });

    async function levyPenalty(split: any, splitName: string, addr1: any, token: any, splitAddress: string, collateralAmount: number) {
        // Levy penalty on addr1 borrower as lock time passed and owed amount not paid. 
        // Check if tokens transferred
        await time.increaseTo(lockTime + 1 * 24 * 60 * 60 * 60);
        const tx = split.levyPenalty(splitName, addr1.address);
        const splitData = await split.getSplitData(splitName);
        await expect(tx).to.changeTokenBalances(token, [splitAddress, splitData.creator], [ethers.parseEther(`${-collateralAmount}`), ethers.parseEther(`${collateralAmount}`)]);
        const splitBorrowerData = await split.connect(addr1).getSplitBorrowerData(splitName);
        expect(splitBorrowerData.penalyLevied).to.be.true;

        const tx1 = split.levyPenalty(splitName, addr1.address);
        await expect(tx1).to.be.revertedWithCustomError(split, "PenaltyAlreadyLevied");
    }

    describe("Levy Penalty", function () {

        it("Should not levy penalt if sender is not split creator", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();


            const tx = await createSplit(split, 1, addr1, addr2, addr3, false, tokenAddress);
            await tx.wait();

            await time.increaseTo(lockTime + 1 * 24 * 60 * 60 * 60);
            const mySplits = await split.getMySplits(0, 5);
            const tx1 = split.connect(addr1).levyPenalty(mySplits[0], addr1.address);
            await expect(tx1).to.be.revertedWithCustomError(split, "OnlySplitCreatorCanPerformOperation");
        });

        it("Should not levy penalt before lock time completes", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();


            const tx = await createSplit(split, 1, addr1, addr2, addr3, false, tokenAddress);
            await tx.wait();

            const mySplits = await split.getMySplits(0, 5);
            const tx1 = split.levyPenalty(mySplits[0], addr1.address);
            await expect(tx1).to.be.revertedWithCustomError(split, "CannotLevyPenaltyBeforeLockTime");
        });

        it("Should not levy penalt if agreement not approved", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();


            const tx = await createSplit(split, 1, addr1, addr2, addr3, false, tokenAddress);
            await tx.wait();

            await time.increaseTo(lockTime + 1 * 24 * 60 * 60 * 60);
            const mySplits = await split.getMySplits(0, 5);
            const tx1 = split.levyPenalty(mySplits[0], addr1.address);
            await expect(tx1).to.be.revertedWithCustomError(split, "AgreementNotApprovedByBorrower");
        });

        it("Should not levy penalt if agreement has zero collateral", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const fundAmount = 50; // in base token
            const collateralAmount = 0; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            await time.increaseTo(lockTime + 1 * 24 * 60 * 60 * 60);
            const tx1 = split.levyPenalty(splitName, addr1.address);
            await expect(tx1).to.be.revertedWithCustomError(split, "AgreementHasZeroCollateral");
        });

        it("Should not levy penalt if borrower already paid owed amount", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const owedAmount = 10; // in base token
            const fundAmount = 50; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            // Aprrove payment and allow contract to transfer owed amount to split creator on befalf of addr1
            await approveAndMakePayment(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount, splitName, owedAmount);

            await time.increaseTo(lockTime + 1 * 24 * 60 * 60 * 60);
            const tx = split.levyPenalty(splitName, addr1.address);
            await expect(tx).to.be.revertedWithCustomError(split, "BorrowerAlreadyPaid");
        });

        it("Should levy penalty on borrower as lock time passed and owed amount not paid and prevent double penalty .", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const owedAmount = 10; // in base token
            const fundAmount = 50; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            // // Levy penalty on addr1 borrower as lock time passed and owed amount not paid. 
            // // Check if tokens transferred
            await levyPenalty(split, splitName, addr1, token, splitAddress, collateralAmount);

        });

    });


    describe("Withdraw Collateral", function () {

        it("Should not withdraw collateral if sender is split creator", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();


            const tx = await createSplit(split, 1, addr1, addr2, addr3, false, tokenAddress);
            await tx.wait();

            const mySplits = await split.getMySplits(0, 5);
            const tx1 = split.withdrawCollateral(mySplits[0]);
            await expect(tx1).to.be.revertedWithCustomError(split, "OnlySplitBorrowersCanPerformOperation");
        });

        it("Should not withdraw collateral if agreement not approved", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();


            const tx = await createSplit(split, 1, addr1, addr2, addr3, false, tokenAddress);
            await tx.wait();

            const mySplits = await split.getMySplits(0, 5);
            const tx1 = split.connect(addr1).withdrawCollateral(mySplits[0]);
            await expect(tx1).to.be.revertedWithCustomError(split, "AgreementNotApprovedByBorrower");
        });

        it("Should not withdraw collateral if agreement has zero collateral", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const fundAmount = 50; // in base token
            const collateralAmount = 0; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            const tx1 = split.connect(addr1).withdrawCollateral(splitName);
            await expect(tx1).to.be.revertedWithCustomError(split, "AgreementHasZeroCollateral");
        });

        it("Should not withdraw collateral if borrower did not pay owed amount", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const owedAmount = 10; // in base token
            const fundAmount = 50; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            const tx = split.connect(addr1).withdrawCollateral(splitName);
            await expect(tx).to.be.revertedWithCustomError(split, "OwedAmountNotPaid");
        });

        it("Should not withdraw collateral if penalty levied by the split creator after lock time", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const owedAmount = 10; // in base token
            const fundAmount = 50; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            // // Levy penalty on addr1 borrower as lock time passed and owed amount not paid. 
            // // Check if tokens transferred
            await levyPenalty(split, splitName, addr1, token, splitAddress, collateralAmount);

            const tx = split.connect(addr1).withdrawCollateral(splitName);
            await expect(tx).to.be.revertedWithCustomError(split, "PenaltyLeviedByLender");
        });

        it("Should withdraw collateral if amount paid and penalty not levied, prevent double withdrawal", async function () {
            const { split, addr1, addr2, addr3 } = await loadFixture(deploySplit);
            const { token, owner: tokenOwner } = await deployToken();
            const tokenAddress = await token.getAddress();
            const splitAddress = await split.getAddress();

            const owedAmount = 10; // in base token
            const fundAmount = 50; // in base token
            const collateralAmount = 1; // in base token

            // Approve split agreement and allow the contract to spend collateral on befalf of addr1
            const splitName = await approveSplitAgreement(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount);

            // Aprrove payment and allow contract to transfer owed amount to split creator on befalf of addr1
            await approveAndMakePayment(split, addr1, addr2, addr3, token, tokenAddress, splitAddress, fundAmount, collateralAmount, splitName, owedAmount);

            const tx = split.connect(addr1).withdrawCollateral(splitName);
            await expect(tx).to.changeTokenBalances(token, [splitAddress, addr1.address], [ethers.parseEther(`${-collateralAmount}`), ethers.parseEther(`${collateralAmount}`)]);

            const splitBorrowerData = await split.connect(addr1).getSplitBorrowerData(splitName);
            expect(splitBorrowerData.collateralWithdrawed).to.be.true;

            const tx1 = split.connect(addr1).withdrawCollateral(splitName);
            await expect(tx1).to.be.revertedWithCustomError(split, "CollateralAlreadyWithdrawed");
        });

    });

});