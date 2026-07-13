// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FreelanceEscrow} from "../../contracts/FreelanceEscrow.sol";
import {EscrowHandler} from "./handlers/EscrowHandler.sol";

/// @title EscrowInvariants
/// @notice Property-based (invariant) tests for FreelanceEscrow. The handler drives random
///         valid sequences of the full lifecycle; after every sequence these properties
///         must hold. Configured via `foundry.toml` ([invariant] runs/depth, fail_on_revert
///         = false so reverting random calls are discarded, not counted as failures).
contract EscrowInvariants is Test {
    EscrowHandler internal handler;
    FreelanceEscrow internal escrow;

    function setUp() public {
        handler = new EscrowHandler();
        escrow = handler.escrow();

        // Restrict the fuzzer to the handler's action functions only (not inherited
        // Test helpers or public getters).
        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = handler.createJob.selector;
        selectors[1] = handler.acceptJob.selector;
        selectors[2] = handler.submitMilestone.selector;
        selectors[3] = handler.approveMilestone.selector;
        selectors[4] = handler.rejectMilestone.selector;
        selectors[5] = handler.raiseDispute.selector;
        selectors[6] = handler.resolveDispute.selector;
        selectors[7] = handler.claimTimelockRelease.selector;
        selectors[8] = handler.cancelJob.selector;
        selectors[9] = handler.withdraw.selector;
        selectors[10] = handler.withdrawFees.selector;
        selectors[11] = handler.setFeeBps.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev Conservation: every wei is accounted for. The escrow's ETH balance equals
    ///      exactly what was deposited minus what was paid out (to freelancers/clients via
    ///      `withdraw` and to the fee sink via `withdrawFees`). No path creates or destroys
    ///      ETH; nothing gets stuck unaccounted.
    function invariant_conservation() public view {
        assertEq(
            address(escrow).balance,
            handler.ghost_totalDeposited() - handler.ghost_totalWithdrawn() - handler.ghost_totalFeesWithdrawn(),
            "escrow balance != deposited - withdrawn - feesWithdrawn"
        );
    }

    /// @dev Solvency: the escrow can always pay everything it currently owes. Its balance
    ///      is at least the sum of all outstanding withdrawable balances plus accrued fees.
    ///      (Any excess is funds still locked in non-terminal milestones.)
    function invariant_solvency() public view {
        uint256 owed = handler.sumPendingWithdrawals() + escrow.accruedFees(address(0));
        assertGe(address(escrow).balance, owed, "escrow cannot cover pending withdrawals + fees");
    }

    /// @dev The protocol fee can never exceed its hard cap, even though the handler calls
    ///      `setFeeBps` with unbounded random values — the guard must always reject them.
    function invariant_feeCapEnforced() public view {
        assertLe(escrow.feeBps(), escrow.MAX_FEE_BPS(), "feeBps exceeded MAX_FEE_BPS");
    }
}
