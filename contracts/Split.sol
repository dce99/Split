// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Split {
    /// Total Locked Amount, only visible to the contract owner.
    address payable public immutable owner;
    uint256 nonce;

    struct Borrower {
        address borrower;
        uint owedAmount;
        uint collateral;
    }

    struct SplitInfo {
        address creator; /// @dev this creator can not be a borrower, only a lender
        address baseTokenAddress;
        uint totalSplitAmount;
        uint lockTime;
        string splitDescription;
        Borrower[] borrowers;
        bytes32 splitName;
        uint remainingPayments;
        mapping(address => bool) vaildBorrower;
        mapping(address => uint) individualOwedAmount; /// @dev in base token
        mapping(address => uint) individualCollateral; /// @dev in base token
        mapping(address => bool) agreementApproved; /// @dev borrower agrees the contract of split made by creator against him, after approving contract to spend collateral amount
        mapping(address => bool) paymentApproved;
        mapping(address => bool) paidStatus;
        mapping(address => bool) penalyLevied;
        mapping(address => bool) collateralWithdrawed;
    }

    struct SplitGeneralData {
        address creator;
        bytes32 splitName;
        address baseTokenAddress;
        uint totalSplitAmount;
        uint lockTime;
        string splitDescription;
        uint remainingPayments;
        Borrower[] borrowers;
    }

    struct SplitBorrowerData {
        uint owedAmount;
        uint collateral;
        bool agreementApproved;
        bool paidStatus;
        bool penalyLevied;
        bool collateralWithdrawed;
        bool paymentApproved;
    }

    mapping(bytes32 => SplitInfo) splits;
    mapping(address => bytes32[]) mySplits;

    error AgreementHasZeroCollateral();
    error PenaltyAlreadyLevied();
    error InvalidBorrowersCount(uint given, uint min, uint max);
    error ZeroSplitAmount();
    error EmptySplitName();
    error SplitNameNotFound();
    error AgreementAlreadyApproved();
    error OnlySplitCreatorCanPerformOperation();
    error OnlyOwnerCanPerformOperation();
    error AlreadyPaid();
    error AgreementNotApprovedByBorrower();
    error CannotLevyPenaltyBeforeLockTime();
    error BorrowerAlreadyPaid();
    error OwedAmountNotPaid();
    error CollateralAlreadyWithdrawed();
    error PenaltyLeviedByLender();
    error InvalidLockTime();
    error BorrowerMustApproveAtleastValueEqualCollateralToApproveSplitAgreement();
    error BorrowerMustApproveContractAtleastOwedAmount();
    error OnlySplitBorrowersCanPerformOperation();
    error AccessDenied();

    event SplitCreated(
        address creator,
        bytes32 splitName,
        string splitDescription
    );
    event AgreementApproved(address borrower, bytes32 splitName);
    event PaymentApproved(address borrower, bytes32 splitName, uint amount);
    event PaymentMade(
        address borrower,
        address creator,
        bytes32 splitName,
        uint amount
    );
    event PenaltyLevied(
        address borrower,
        address creator,
        bytes32 splitName,
        uint collateral
    );
    event CollateralWithdrawed(
        address borrower,
        bytes32 splitName,
        uint collateral
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwnerCanPerformOperation();
        _;
    }

    modifier onlyCreator(bytes32 splitName) {
        if (msg.sender != splits[splitName].creator)
            revert OnlySplitCreatorCanPerformOperation();
        _;
    }

    modifier onlyValidBorrower(bytes32 splitName) {
        if (!splits[splitName].vaildBorrower[msg.sender])
            revert OnlySplitBorrowersCanPerformOperation();
        _;
    }

    modifier afterTime(bytes32 splitName) {
        if (block.timestamp < splits[splitName].lockTime)
            revert CannotLevyPenaltyBeforeLockTime();
        _;
    }

    modifier invalidSplitName(bytes32 splitName) {
        if (splitName.length == 0) revert EmptySplitName();
        if (splits[splitName].creator == address(0)) revert SplitNameNotFound();
        _;
    }

    constructor() payable {
        owner = payable(msg.sender);
        nonce = 0;
    }

    function getTokenBalance(
        address tokenAddress
    ) external view returns (uint) {
        return IERC20(tokenAddress).balanceOf(msg.sender);
    }

    function getContractTokenBalance(
        address tokenAddress
    ) external view onlyOwner returns (uint) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    function createSplit(
        address baseTokenAddress,
        uint totalSplitAmount,
        uint lockTime,
        string calldata splitDescription,
        Borrower[] calldata borrowers
    ) external {
        uint totalBorrowers = borrowers.length;
        if (totalBorrowers > 1000 || totalBorrowers < 1) {
            revert InvalidBorrowersCount({
                given: totalBorrowers,
                min: 1,
                max: 1000
            });
        }

        if (totalSplitAmount == 0) revert ZeroSplitAmount();

        if (lockTime <= block.timestamp) revert InvalidLockTime();

        ++nonce;
        bytes32 splitName = keccak256(abi.encodePacked(msg.sender, nonce));

        SplitInfo storage split = splits[splitName];
        split.baseTokenAddress = baseTokenAddress;
        split.creator = msg.sender;
        split.totalSplitAmount = totalSplitAmount;
        split.splitName = splitName;
        split.splitDescription = splitDescription;
        split.lockTime = lockTime;
        split.remainingPayments = totalBorrowers;

        mySplits[msg.sender].push(splitName);
        for (uint i = 0; i < totalBorrowers; ) {
            split.individualOwedAmount[borrowers[i].borrower] = borrowers[i]
                .owedAmount;
            split.individualCollateral[borrowers[i].borrower] = borrowers[i]
                .collateral;
            mySplits[borrowers[i].borrower].push(splitName);
            split.borrowers.push(borrowers[i]);
            split.vaildBorrower[borrowers[i].borrower] = true;
            ++i;
        }

        emit SplitCreated(msg.sender, splitName, splitDescription);
    }

    function approveAgreement(
        bytes32 splitName
    ) external invalidSplitName(splitName) onlyValidBorrower(splitName) {
        if (splits[splitName].agreementApproved[msg.sender])
            revert AgreementAlreadyApproved();

        splits[splitName].agreementApproved[msg.sender] = true;

        uint collateral = splits[splitName].individualCollateral[msg.sender];
        if (collateral > 0) {
            uint allowance = IERC20(splits[splitName].baseTokenAddress)
                .allowance(msg.sender, address(this));
            if (allowance < collateral)
                revert BorrowerMustApproveAtleastValueEqualCollateralToApproveSplitAgreement();

            try
                IERC20(splits[splitName].baseTokenAddress).transferFrom(
                    msg.sender,
                    address(this),
                    collateral
                )
            returns (bool res) {
                if (!res)
                    revert(
                        "Error while approving agreement: No error data generated"
                    );
                // TODO add oracle code here;
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert(
                    "Error while approving agreement: No error data generated"
                );
            }
        }

        emit AgreementApproved(msg.sender, splitName);
    }

    function approvePayment(
        bytes32 splitName
    ) external invalidSplitName(splitName) onlyValidBorrower(splitName) {
        if (!splits[splitName].agreementApproved[msg.sender])
            revert AgreementNotApprovedByBorrower();
        if (splits[splitName].paidStatus[msg.sender]) revert AlreadyPaid();

        uint owedAmount = splits[splitName].individualOwedAmount[msg.sender];
        uint allowance = IERC20(splits[splitName].baseTokenAddress).allowance(
            msg.sender,
            address(this)
        );
        if (allowance < owedAmount)
            revert BorrowerMustApproveContractAtleastOwedAmount();

        if (!splits[splitName].paymentApproved[msg.sender]) {
            splits[splitName].paymentApproved[msg.sender] = true;
            try
                IERC20(splits[splitName].baseTokenAddress).transferFrom(
                    msg.sender,
                    address(this),
                    owedAmount
                )
            returns (bool res) {
                if (!res)
                    revert(
                        "Error while approving payment: No error data generated"
                    );
                emit PaymentApproved(msg.sender, splitName, owedAmount);
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert(
                    "Error while approving payment: No error data generated"
                );
            }
        }

        splits[splitName].paidStatus[msg.sender] = true;
        splits[splitName].remainingPayments -= 1;

        try
            IERC20(splits[splitName].baseTokenAddress).transfer(
                splits[splitName].creator,
                owedAmount
            )
        returns (bool res) {
            if (!res)
                revert(
                    "Error while transferring owed amount: No error data generated"
                );
            emit PaymentMade(
                msg.sender,
                splits[splitName].creator,
                splitName,
                owedAmount
            );
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert(
                "Error while transferring owed amount: No error data generated"
            );
        }
    }

    function levyPenalty(
        bytes32 splitName,
        address borrower
    )
        external
        invalidSplitName(splitName)
        onlyCreator(splitName)
        afterTime(splitName)
    {
        uint collateral = splits[splitName].individualCollateral[borrower];
        if (!splits[splitName].agreementApproved[borrower])
            revert AgreementNotApprovedByBorrower();
        if (collateral == 0) revert AgreementHasZeroCollateral();
        if (splits[splitName].paidStatus[borrower])
            revert BorrowerAlreadyPaid();
        if (splits[splitName].penalyLevied[borrower])
            revert PenaltyAlreadyLevied();

        splits[splitName].penalyLevied[borrower] = true;
        try
            IERC20(splits[splitName].baseTokenAddress).transfer(
                splits[splitName].creator,
                collateral
            )
        returns (bool res) {
            if (!res)
                revert("Error while levying penalty: No error data generated");
            emit PenaltyLevied(borrower, msg.sender, splitName, collateral);
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert("Error while levying penalty: No error data generated");
        }
    }

    function withdrawCollateral(
        bytes32 splitName
    ) external invalidSplitName(splitName) onlyValidBorrower(splitName) {
        uint collateral = splits[splitName].individualCollateral[msg.sender];
        if (!splits[splitName].agreementApproved[msg.sender])
            revert AgreementNotApprovedByBorrower();
        if (collateral == 0) revert AgreementHasZeroCollateral();
        if (splits[splitName].penalyLevied[msg.sender])
            revert PenaltyLeviedByLender();
        if (!splits[splitName].paidStatus[msg.sender])
            revert OwedAmountNotPaid();
        if (splits[splitName].collateralWithdrawed[msg.sender])
            revert CollateralAlreadyWithdrawed();

        splits[splitName].collateralWithdrawed[msg.sender] = true;
        try
            IERC20(splits[splitName].baseTokenAddress).transfer(
                msg.sender,
                collateral
            )
        returns (bool res) {
            if (!res)
                revert(
                    " Error while withdrawing collateral: No error data generated"
                );
            emit CollateralWithdrawed(msg.sender, splitName, collateral);
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert(
                " Error while withdrawing collateral: No error data generated"
            );
        }
    }

    function getMySplits(
        uint start,
        uint size
    ) external view returns (bytes32[] memory) {
        bytes32[] memory _splits = new bytes32[](size);
        bytes32[] storage _mySplits = mySplits[msg.sender];
        uint index = 0;
        for (uint i = start; i < _mySplits.length && i < start + size; ) {
            _splits[index] = _mySplits[i];
            ++i;
            ++index;
        }

        return _splits;
    }

    function getSplitBorrowerData(
        bytes32 splitName
    )
        external
        view
        invalidSplitName(splitName)
        onlyValidBorrower(splitName)
        returns (SplitBorrowerData memory)
    {
        SplitInfo storage split = splits[splitName];
        SplitBorrowerData memory borrowerData = SplitBorrowerData({
            owedAmount: split.individualOwedAmount[msg.sender],
            collateral: split.individualCollateral[msg.sender],
            agreementApproved: split.agreementApproved[msg.sender],
            paymentApproved: split.paymentApproved[msg.sender],
            paidStatus: split.paidStatus[msg.sender],
            penalyLevied: split.penalyLevied[msg.sender],
            collateralWithdrawed: split.collateralWithdrawed[msg.sender]
        });

        return borrowerData;
    }

    function getSplitBorrowerDataForCreator(
        bytes32 splitName,
        address borrower
    ) external view onlyCreator(splitName) returns (SplitBorrowerData memory) {
        SplitInfo storage split = splits[splitName];
        SplitBorrowerData memory borrowerData = SplitBorrowerData({
            owedAmount: split.individualOwedAmount[borrower],
            collateral: split.individualCollateral[borrower],
            agreementApproved: split.agreementApproved[borrower],
            paymentApproved: split.paymentApproved[borrower],
            paidStatus: split.paidStatus[borrower],
            penalyLevied: split.penalyLevied[borrower],
            collateralWithdrawed: split.collateralWithdrawed[borrower]
        });

        return borrowerData;
    }

    function getSplitData(
        bytes32 splitName
    )
        external
        view
        invalidSplitName(splitName)
        returns (SplitGeneralData memory)
    {
        if (
            (msg.sender != splits[splitName].creator) &&
            !splits[splitName].vaildBorrower[msg.sender]
        ) revert AccessDenied();

        SplitInfo storage split = splits[splitName];
        SplitGeneralData memory splitData = SplitGeneralData({
            creator: split.creator,
            splitName: split.splitName,
            baseTokenAddress: split.baseTokenAddress,
            lockTime: split.lockTime,
            totalSplitAmount: split.totalSplitAmount,
            splitDescription: split.splitDescription,
            borrowers: split.borrowers,
            remainingPayments: split.remainingPayments
        });

        return splitData;
    }

    function getMyTotalSplits() external view returns (uint) {
        return mySplits[msg.sender].length;
    }

    function withdrawFunds(uint amount) external onlyOwner {
        owner.transfer(amount);
    }
}
