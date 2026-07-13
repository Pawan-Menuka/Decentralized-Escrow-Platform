// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title FreelanceEscrow
/// @notice A milestone-based escrow protocol for freelance work. A client creates and
///         fully funds a job split into milestones; a freelancer accepts the job and
///         submits work per milestone; the client approves (releasing funds via a
///         pull-payment) or disputes; an arbitrator resolves disputes with an arbitrary
///         split; client silence after submission auto-releases funds after a time-lock.
/// @dev Single immutable contract holding all jobs (struct + mapping + counter pattern,
///      no proxy/factory). Funds move exclusively via pull-payments
///      (`pendingWithdrawals`) credited during state transitions and claimed later via
///      `withdraw`, per the Checks-Effects-Interactions pattern and `nonReentrant`.
///      A protocol fee (basis points, capped at `MAX_FEE_BPS`) is skimmed from every
///      amount that flows to the freelancer (approval, auto-release, or the
///      freelancer's share of a dispute resolution) — never from client refunds.
///
///      Fund custody, milestone lifecycle, disputes, time-lock release, and USD-priced
///      job creation (via a Chainlink ETH/USD feed) are all implemented. Remaining
///      blueprint phases add Chainlink Automation (9) and ERC-20/USDC support (10).
contract FreelanceEscrow is ReentrancyGuard, Pausable, Ownable {
    // ---------------------------------------------------------------------
    // Enums
    // ---------------------------------------------------------------------

    /// @notice Lifecycle states of a Job.
    /// @dev `NONE` (default 0) doubles as the "does not exist" sentinel — a job read
    ///      from an empty mapping slot has state `NONE`.
    enum JobState {
        NONE,
        FUNDED,
        IN_PROGRESS,
        COMPLETED,
        DISPUTED,
        CANCELLED
    }

    /// @notice Lifecycle states of a single Milestone.
    /// @dev `NONE` (default 0) doubles as the "does not exist" sentinel — a milestone
    ///      read from an empty mapping slot has state `NONE`. Terminal states are
    ///      `APPROVED`, `AUTO_RELEASED`, and `RESOLVED`.
    enum MilestoneState {
        NONE,
        PENDING,
        SUBMITTED,
        APPROVED,
        DISPUTED,
        RESOLVED,
        AUTO_RELEASED
    }

    // ---------------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------------

    /// @notice A single escrowed job between a client and a freelancer.
    /// @dev Packed deliberately across storage slots (see blueprint §4.2):
    ///      slot0 {client, createdAt, timelock, state}; slot1 {freelancer,
    ///      milestoneCount, approvedCount}; slot2 {token}; slot3 {arbitrator};
    ///      slot4 {totalAmount}. Enum-typed fields are stored as `uint8` by the
    ///      compiler, matching the byte budget in the blueprint.
    struct Job {
        /// @notice The party who created and funded the job.
        address client;
        /// @notice Unix timestamp (seconds) the job was created.
        uint48 createdAt;
        /// @notice Seconds of client silence after submission before auto-release.
        uint32 timelock;
        /// @notice Current lifecycle state of the job.
        JobState state;
        /// @notice The party who accepts and performs the work.
        address freelancer;
        /// @notice Total number of milestones in this job.
        uint16 milestoneCount;
        /// @notice Number of milestones that have reached a terminal state.
        uint16 approvedCount;
        /// @notice Payment token; `address(0)` means native ETH. ERC-20 enabled Phase 10.
        address token;
        /// @notice Arbitrator snapshotted at creation time (does not track the global
        ///         arbitrator if it is later changed via `setArbitrator`).
        address arbitrator;
        /// @notice Sum of all milestone amounts, in token/wei units.
        uint256 totalAmount;
    }

    /// @notice A single milestone within a Job.
    struct Milestone {
        /// @notice Amount owed for this milestone, in wei/token units.
        uint128 amount;
        /// @notice Timestamp of the latest submission (0 if never submitted).
        uint40 submittedAt;
        /// @notice Current lifecycle state of the milestone.
        MilestoneState state;
        /// @notice IPFS CID of the submitted deliverable (empty until submitted).
        /// @dev Stored as `string`, not `bytes32`, because CIDv1 can exceed 32 bytes.
        string deliverableCid;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The next job id to be assigned; ids start at 1 (0 = nonexistent).
    uint256 public jobCounter;

    /// @notice jobId => Job.
    mapping(uint256 => Job) public jobs;

    /// @notice jobId => milestone index => Milestone.
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;

    /// @notice jobId => number of milestones currently in the DISPUTED state.
    /// @dev Lets `resolveDispute` return a job to IN_PROGRESS/COMPLETED only once every
    ///      open dispute on it has been resolved, without scanning all milestones.
    mapping(uint256 => uint16) public disputedCount;

    /// @notice token => account => withdrawable amount. `token == address(0)` is ETH.
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;

    /// @notice token => owner-withdrawable accrued protocol fees.
    mapping(address => uint256) public accruedFees;

    /// @notice Protocol fee in basis points, applied to freelancer-bound releases.
    uint16 public feeBps;

    /// @notice Hard cap on `feeBps`: 500 = 5%.
    uint16 public constant MAX_FEE_BPS = 500;

    /// @notice Minimum allowed job timelock.
    uint32 public constant MIN_TIMELOCK = 1 days;

    /// @notice Maximum allowed job timelock.
    uint32 public constant MAX_TIMELOCK = 90 days;

    /// @notice Maximum milestones per job (bounds loops in `createJob`).
    uint16 public constant MAX_MILESTONES = 50;

    /// @notice Global arbitrator address, snapshotted into each Job at creation time.
    /// @dev Changing this does not retroactively change who arbitrates existing jobs —
    ///      see SECURITY.md (written in Phase 5).
    address public arbitrator;

    /// @notice Chainlink ETH/USD price feed (8 decimals) used by `createJobUsd`.
    /// @dev Immutable and injected at construction so tests can supply a mock aggregator.
    AggregatorV3Interface public immutable ethUsdFeed;

    /// @notice Max age (seconds) of a price answer before `createJobUsd` rejects it.
    uint256 public constant PRICE_STALENESS_THRESHOLD = 1 hours;

    /// @notice Packed keys (see `_key`) of milestones currently in state `SUBMITTED`.
    /// @dev Scan set for Chainlink Automation (Phase 9); maintained via swap-and-pop.
    uint256[] public activeSubmitted;

    /// @notice packedKey => index+1 in `activeSubmitted` (0 = absent).
    mapping(uint256 => uint256) internal activeSubmittedIndex;

    // ---------------------------------------------------------------------
    // Custom errors (complete list per blueprint §4.5 — no `require` strings)
    // ---------------------------------------------------------------------

    error JobNotFound();
    error MilestoneNotFound();
    error NotClient();
    error NotFreelancer();
    error NotArbitrator();
    /// @dev raiseDispute: caller is neither client nor freelancer.
    error NotParticipant();
    error InvalidJobState(uint8 current);
    error InvalidMilestoneState(uint8 current);
    error ZeroAddress();
    /// @dev client == freelancer.
    error SelfDealing();
    error NoMilestones();
    error TooManyMilestones();
    error ZeroMilestoneAmount();
    /// @dev msg.value != sum(amounts).
    error ValueMismatch(uint256 expected, uint256 actual);
    error TimelockOutOfRange();
    error TimelockNotExpired();
    /// @dev freelancerBps > 10000 or fee > MAX_FEE_BPS.
    error InvalidBps();
    error NothingToWithdraw();
    error EthTransferFailed();
    /// @dev token != address(0) before Phase 10.
    error TokenNotSupported();
    /// @dev Phase 8.
    error StalePrice();
    /// @dev Phase 8.
    error InvalidPrice();

    // ---------------------------------------------------------------------
    // Events (complete list per blueprint §4.6 — one per state change)
    // ---------------------------------------------------------------------

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        address token,
        uint256 totalAmount,
        uint256 milestoneCount,
        uint32 timelock
    );
    /// @notice Emitted alongside `JobCreated` for USD-denominated jobs, recording the USD
    ///         total (8 decimals) and the ETH/USD price used to convert it at funding time.
    event JobCreatedUsd(uint256 indexed jobId, uint256 usdTotal, uint256 ethUsdPrice);
    event JobAccepted(uint256 indexed jobId, address indexed freelancer);
    event JobCancelled(uint256 indexed jobId);
    event JobCompleted(uint256 indexed jobId);
    event MilestoneSubmitted(uint256 indexed jobId, uint256 indexed mIndex, string deliverableCid);
    event MilestoneApproved(uint256 indexed jobId, uint256 indexed mIndex, uint256 amount, uint256 fee);
    event MilestoneRejected(uint256 indexed jobId, uint256 indexed mIndex, string reason);
    event MilestoneAutoReleased(uint256 indexed jobId, uint256 indexed mIndex, uint256 amount, uint256 fee);
    event DisputeRaised(
        uint256 indexed jobId, uint256 indexed mIndex, address indexed raisedBy, string evidenceCid
    );
    event DisputeResolved(
        uint256 indexed jobId,
        uint256 indexed mIndex,
        uint16 freelancerBps,
        uint256 freelancerAmount,
        uint256 clientAmount,
        uint256 fee
    );
    event Withdrawal(address indexed account, address indexed token, uint256 amount);
    event FeeUpdated(uint16 oldBps, uint16 newBps);
    event FeesWithdrawn(address indexed token, uint256 amount);
    event ArbitratorUpdated(address indexed oldArbitrator, address indexed newArbitrator);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Deploys the escrow with an initial protocol fee, arbitrator, and price feed.
    /// @param _feeBps Initial protocol fee in basis points; must be `<= MAX_FEE_BPS`.
    /// @param _arbitrator Initial global arbitrator; must be nonzero.
    /// @param _ethUsdFeed Chainlink ETH/USD aggregator (8 decimals); must be nonzero.
    constructor(uint16 _feeBps, address _arbitrator, address _ethUsdFeed) Ownable(msg.sender) {
        if (_feeBps > MAX_FEE_BPS) revert InvalidBps();
        if (_arbitrator == address(0)) revert ZeroAddress();
        if (_ethUsdFeed == address(0)) revert ZeroAddress();
        feeBps = _feeBps;
        arbitrator = _arbitrator;
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /// @notice Packs a job id and milestone index into a single scan-set key.
    /// @dev `jobId` occupies the high bits, `mIndex` the low 32 bits. Used to
    ///      maintain `activeSubmitted` / `activeSubmittedIndex` for Chainlink
    ///      Automation (Phase 9).
    /// @param jobId The job id.
    /// @param mIndex The milestone index within the job.
    /// @return The packed key.
    function _key(uint256 jobId, uint256 mIndex) internal pure returns (uint256) {
        return (jobId << 32) | mIndex;
    }

    /// @dev Adds a milestone's packed key to the active-submitted scan set. Idempotent:
    ///      a key already present is left untouched.
    function _addActive(uint256 jobId, uint256 mIndex) internal {
        uint256 k = _key(jobId, mIndex);
        if (activeSubmittedIndex[k] != 0) return;
        activeSubmitted.push(k);
        activeSubmittedIndex[k] = activeSubmitted.length; // store index + 1
    }

    /// @dev Removes a milestone's packed key from the active-submitted scan set via
    ///      swap-and-pop, keeping `activeSubmittedIndex` consistent. No-op if absent.
    function _removeActive(uint256 jobId, uint256 mIndex) internal {
        uint256 k = _key(jobId, mIndex);
        uint256 idxPlus1 = activeSubmittedIndex[k];
        if (idxPlus1 == 0) return;
        uint256 idx = idxPlus1 - 1;
        uint256 lastIdx = activeSubmitted.length - 1;
        if (idx != lastIdx) {
            uint256 lastKey = activeSubmitted[lastIdx];
            activeSubmitted[idx] = lastKey;
            activeSubmittedIndex[lastKey] = idx + 1;
        }
        activeSubmitted.pop();
        activeSubmittedIndex[k] = 0;
    }

    /// @dev Credits a freelancer's pull-payment balance for `gross`, skimming the
    ///      protocol fee (read at release time, per spec) into `accruedFees`. The fee
    ///      applies ONLY to freelancer-bound funds — never to client refunds.
    /// @param job The job (supplies the payment token and freelancer address).
    /// @param gross The pre-fee amount owed to the freelancer.
    /// @return fee The fee skimmed (floor division; dust stays with the client side).
    function _creditFreelancer(Job storage job, uint256 gross) internal returns (uint256 fee) {
        fee = (gross * feeBps) / 10_000;
        uint256 net = gross - fee;
        pendingWithdrawals[job.token][job.freelancer] += net;
        if (fee > 0) accruedFees[job.token] += fee;
    }

    /// @dev Marks a job COMPLETED once every milestone has reached a terminal state
    ///      (tracked by `approvedCount`). Emits `JobCompleted`. Callers must only invoke
    ///      this from a non-terminal, non-disputed job context.
    function _maybeCompleteJob(uint256 jobId, Job storage job) internal {
        if (job.approvedCount == job.milestoneCount) {
            job.state = JobState.COMPLETED;
            emit JobCompleted(jobId);
        }
    }

    // ---------------------------------------------------------------------
    // External / public function surface — Phase 1 stubs
    // (implemented in Phases 2, 3, 8, 9, 10 exactly per blueprint §5)
    // ---------------------------------------------------------------------

    /// @notice Creates and fully funds a new job in native ETH.
    /// @dev Fund-on-create: `msg.value` must exactly equal the sum of `amounts`. ERC-20
    ///      tokens are rejected until Phase 10 (`token` must be `address(0)`). The global
    ///      arbitrator is snapshotted into the job so later `setArbitrator` calls do not
    ///      affect it.
    /// @param freelancer The counterparty who will perform the work; nonzero, not the caller.
    /// @param token Payment token; must be `address(0)` (native ETH) in this phase.
    /// @param amounts Per-milestone amounts (wei); 1..MAX_MILESTONES entries, each > 0.
    /// @param timelock Seconds of client silence after a submission before auto-release.
    /// @return jobId The id assigned to the new job.
    function createJob(address freelancer, address token, uint128[] calldata amounts, uint32 timelock)
        external
        payable
        whenNotPaused
        returns (uint256 jobId)
    {
        if (freelancer == address(0)) revert ZeroAddress();
        if (freelancer == msg.sender) revert SelfDealing();
        if (token != address(0)) revert TokenNotSupported();
        uint256 n = amounts.length;
        if (n == 0) revert NoMilestones();
        if (n > MAX_MILESTONES) revert TooManyMilestones();
        if (timelock < MIN_TIMELOCK || timelock > MAX_TIMELOCK) revert TimelockOutOfRange();

        // Gas: single pass validates amounts, sums the total, AND writes each milestone.
        // Writing before the msg.value check is safe — a mismatch reverts and rolls all
        // of this back. `unchecked { ++i }` skips a redundant overflow check (i < n <= 50).
        jobId = ++jobCounter;
        uint256 total = 0;
        for (uint256 i = 0; i < n;) {
            uint128 amt = amounts[i];
            if (amt == 0) revert ZeroMilestoneAmount();
            total += amt;
            Milestone storage m = milestones[jobId][i];
            m.amount = amt;
            m.state = MilestoneState.PENDING;
            unchecked {
                ++i;
            }
        }
        if (msg.value != total) revert ValueMismatch(total, msg.value);

        Job storage job = jobs[jobId];
        job.client = msg.sender;
        job.createdAt = uint48(block.timestamp);
        job.timelock = timelock;
        job.state = JobState.FUNDED;
        job.freelancer = freelancer;
        job.milestoneCount = uint16(n);
        job.token = token;
        job.arbitrator = arbitrator;
        job.totalAmount = total;

        emit JobCreated(jobId, msg.sender, freelancer, token, total, n, timelock);
    }

    /// @notice Creates and fully funds a job whose milestones are quoted in USD, converting
    ///         each to ETH at the current Chainlink ETH/USD price. Native ETH only.
    /// @dev `usdAmounts` carry 8 decimals to match the feed (e.g. $500.00 = `500_00000000`).
    ///      The price is read once at funding; the job is thereafter a normal ETH job.
    ///      `msg.value` must exactly equal the converted ETH total — the frontend quotes via
    ///      the same feed immediately before sending. Reverts on a stale or non-positive
    ///      price. Conversion: `wei = usdAmount(8dp) * 1e18 / price(8dp)` (the 8-decimal
    ///      scales cancel, leaving a wei-scaled result).
    /// @param freelancer The counterparty; nonzero, not the caller.
    /// @param usdAmounts Per-milestone USD amounts, 8 decimals; 1..MAX_MILESTONES, each > 0.
    /// @param timelock Seconds of client silence after a submission before auto-release.
    /// @return jobId The id assigned to the new job.
    function createJobUsd(address freelancer, uint128[] calldata usdAmounts, uint32 timelock)
        external
        payable
        whenNotPaused
        returns (uint256 jobId)
    {
        if (freelancer == address(0)) revert ZeroAddress();
        if (freelancer == msg.sender) revert SelfDealing();
        uint256 n = usdAmounts.length;
        if (n == 0) revert NoMilestones();
        if (n > MAX_MILESTONES) revert TooManyMilestones();
        if (timelock < MIN_TIMELOCK || timelock > MAX_TIMELOCK) revert TimelockOutOfRange();

        uint256 price = _readEthUsdPrice(); // 8 decimals; reverts if stale / non-positive

        jobId = ++jobCounter;
        uint256 ethTotal = 0;
        uint256 usdTotal = 0;
        for (uint256 i = 0; i < n;) {
            uint128 usdAmt = usdAmounts[i];
            if (usdAmt == 0) revert ZeroMilestoneAmount();
            uint256 weiAmount = (uint256(usdAmt) * 1e18) / price;
            if (weiAmount == 0) revert ZeroMilestoneAmount(); // dust: USD too small to fund
            usdTotal += usdAmt;
            ethTotal += weiAmount;
            Milestone storage m = milestones[jobId][i];
            m.amount = uint128(weiAmount);
            m.state = MilestoneState.PENDING;
            unchecked {
                ++i;
            }
        }
        if (msg.value != ethTotal) revert ValueMismatch(ethTotal, msg.value);

        Job storage job = jobs[jobId];
        job.client = msg.sender;
        job.createdAt = uint48(block.timestamp);
        job.timelock = timelock;
        job.state = JobState.FUNDED;
        job.freelancer = freelancer;
        job.milestoneCount = uint16(n);
        job.token = address(0);
        job.arbitrator = arbitrator;
        job.totalAmount = ethTotal;

        emit JobCreated(jobId, msg.sender, freelancer, address(0), ethTotal, n, timelock);
        emit JobCreatedUsd(jobId, usdTotal, price);
    }

    /// @dev Reads the ETH/USD feed, reverting on a non-positive answer (`InvalidPrice`) or a
    ///      price older than `PRICE_STALENESS_THRESHOLD` (`StalePrice`). Returns the price
    ///      as an unsigned 8-decimal value.
    function _readEthUsdPrice() internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = ethUsdFeed.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > PRICE_STALENESS_THRESHOLD) revert StalePrice();
        return uint256(answer);
    }

    /// @notice Freelancer accepts a funded job, beginning work.
    /// @param jobId The job to accept; must be FUNDED and caller must be its freelancer.
    function acceptJob(uint256 jobId) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.freelancer) revert NotFreelancer();
        if (job.state != JobState.FUNDED) revert InvalidJobState(uint8(job.state));

        job.state = JobState.IN_PROGRESS;
        emit JobAccepted(jobId, msg.sender);
    }

    /// @notice Client cancels a job before it is accepted, refunding themselves in full.
    /// @dev Pre-acceptance only (state must be FUNDED). The refund is credited via
    ///      pull-payment with NO fee — cancellation is not a release to the freelancer.
    /// @param jobId The job to cancel; caller must be its client.
    function cancelJob(uint256 jobId) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.client) revert NotClient();
        if (job.state != JobState.FUNDED) revert InvalidJobState(uint8(job.state));

        job.state = JobState.CANCELLED;
        pendingWithdrawals[job.token][job.client] += job.totalAmount;

        emit JobCancelled(jobId);
    }

    /// @notice Freelancer submits a deliverable for a pending milestone.
    /// @dev Records the submission timestamp (starts the time-lock clock) and adds the
    ///      milestone to the active-submitted scan set.
    /// @param jobId The job; must be IN_PROGRESS and caller must be its freelancer.
    /// @param mIndex The milestone index; must exist and be PENDING.
    /// @param deliverableCid IPFS CID of the deliverable.
    function submitMilestone(uint256 jobId, uint256 mIndex, string calldata deliverableCid)
        external
        whenNotPaused
    {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.freelancer) revert NotFreelancer();
        if (job.state != JobState.IN_PROGRESS) revert InvalidJobState(uint8(job.state));
        if (mIndex >= job.milestoneCount) revert MilestoneNotFound();
        Milestone storage m = milestones[jobId][mIndex];
        if (m.state != MilestoneState.PENDING) revert InvalidMilestoneState(uint8(m.state));

        m.state = MilestoneState.SUBMITTED;
        m.submittedAt = uint40(block.timestamp);
        m.deliverableCid = deliverableCid;
        _addActive(jobId, mIndex);

        emit MilestoneSubmitted(jobId, mIndex, deliverableCid);
    }

    /// @notice Client approves a submitted milestone, crediting the freelancer (minus
    ///         the protocol fee) via pull-payment.
    /// @dev No external call is made here (pull-over-push): funds are only credited to
    ///      `pendingWithdrawals`, so a malicious freelancer contract cannot brick
    ///      approval. `nonReentrant` is retained defensively per spec. Completes the job
    ///      if this was the last outstanding milestone.
    /// @param jobId The job; must be IN_PROGRESS and caller must be its client.
    /// @param mIndex The milestone index; must exist and be SUBMITTED.
    function approveMilestone(uint256 jobId, uint256 mIndex) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.client) revert NotClient();
        if (job.state != JobState.IN_PROGRESS) revert InvalidJobState(uint8(job.state));
        if (mIndex >= job.milestoneCount) revert MilestoneNotFound();
        Milestone storage m = milestones[jobId][mIndex];
        if (m.state != MilestoneState.SUBMITTED) revert InvalidMilestoneState(uint8(m.state));

        uint256 amount = m.amount;
        m.state = MilestoneState.APPROVED;
        _removeActive(jobId, mIndex);
        uint256 fee = _creditFreelancer(job, amount);
        job.approvedCount += 1;

        emit MilestoneApproved(jobId, mIndex, amount, fee);
        _maybeCompleteJob(jobId, job);
    }

    /// @notice Client rejects a submitted milestone, returning it to PENDING for rework.
    /// @dev Clears the deliverable + submission timestamp and removes the milestone from
    ///      the auto-release scan set. The freelancer may resubmit. (Reject-griefing is a
    ///      known, documented limitation; the freelancer's recourse is `raiseDispute`.)
    /// @param jobId The job; must be IN_PROGRESS and caller must be its client.
    /// @param mIndex The milestone index; must exist and be SUBMITTED.
    /// @param reason Free-text reason, surfaced in the event for the UI/subgraph.
    function rejectMilestone(uint256 jobId, uint256 mIndex, string calldata reason) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.client) revert NotClient();
        if (job.state != JobState.IN_PROGRESS) revert InvalidJobState(uint8(job.state));
        if (mIndex >= job.milestoneCount) revert MilestoneNotFound();
        Milestone storage m = milestones[jobId][mIndex];
        if (m.state != MilestoneState.SUBMITTED) revert InvalidMilestoneState(uint8(m.state));

        m.state = MilestoneState.PENDING;
        m.submittedAt = 0;
        m.deliverableCid = "";
        _removeActive(jobId, mIndex);

        emit MilestoneRejected(jobId, mIndex, reason);
    }

    /// @notice Client or freelancer raises a dispute on a submitted milestone.
    /// @dev Moves the milestone (and the job) to DISPUTED and pulls the milestone out of
    ///      the auto-release scan set so a disputed milestone can never auto-release. A
    ///      job may hold several concurrent disputes (`disputedCount`).
    /// @param jobId The job; must be IN_PROGRESS or already DISPUTED.
    /// @param mIndex The milestone index; must exist and be SUBMITTED.
    /// @param evidenceCid IPFS CID of the disputing party's evidence.
    function raiseDispute(uint256 jobId, uint256 mIndex, string calldata evidenceCid) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.client && msg.sender != job.freelancer) revert NotParticipant();
        if (job.state != JobState.IN_PROGRESS && job.state != JobState.DISPUTED) {
            revert InvalidJobState(uint8(job.state));
        }
        if (mIndex >= job.milestoneCount) revert MilestoneNotFound();
        Milestone storage m = milestones[jobId][mIndex];
        if (m.state != MilestoneState.SUBMITTED) revert InvalidMilestoneState(uint8(m.state));

        m.state = MilestoneState.DISPUTED;
        job.state = JobState.DISPUTED;
        _removeActive(jobId, mIndex);
        disputedCount[jobId] += 1;

        emit DisputeRaised(jobId, mIndex, msg.sender, evidenceCid);
    }

    /// @notice Arbitrator resolves a disputed milestone, splitting the funds at any ratio.
    /// @dev Uses the job's SNAPSHOTTED arbitrator (not the current global one). The
    ///      protocol fee is taken only from the freelancer's share. Rounding dust (≤1 wei)
    ///      accrues to the client side by construction. Once the job has no remaining open
    ///      disputes it returns to IN_PROGRESS (or COMPLETED if every milestone is now
    ///      terminal). No external call is made (pull-payment), `nonReentrant` retained
    ///      defensively per spec.
    /// @param jobId The disputed job.
    /// @param mIndex The disputed milestone index.
    /// @param freelancerBps Basis points (0..10000) of the milestone awarded to the
    ///        freelancer; the remainder refunds the client.
    function resolveDispute(uint256 jobId, uint256 mIndex, uint16 freelancerBps)
        external
        whenNotPaused
        nonReentrant
    {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (msg.sender != job.arbitrator) revert NotArbitrator();
        if (job.state != JobState.DISPUTED) revert InvalidJobState(uint8(job.state));
        if (mIndex >= job.milestoneCount) revert MilestoneNotFound();
        if (freelancerBps > 10_000) revert InvalidBps();
        Milestone storage m = milestones[jobId][mIndex];
        if (m.state != MilestoneState.DISPUTED) revert InvalidMilestoneState(uint8(m.state));

        uint256 amount = m.amount;
        uint256 freelancerGross = (amount * freelancerBps) / 10_000;
        uint256 clientAmount = amount - freelancerGross;

        // Fee is skimmed from the freelancer's share only (mirrors _creditFreelancer).
        uint256 fee = _creditFreelancer(job, freelancerGross);
        uint256 freelancerAmount = freelancerGross - fee;
        if (clientAmount > 0) pendingWithdrawals[job.token][job.client] += clientAmount;

        m.state = MilestoneState.RESOLVED;
        job.approvedCount += 1;
        disputedCount[jobId] -= 1;

        if (disputedCount[jobId] == 0) {
            job.state = JobState.IN_PROGRESS;
            _maybeCompleteJob(jobId, job);
        }

        emit DisputeResolved(jobId, mIndex, freelancerBps, freelancerAmount, clientAmount, fee);
    }

    /// @notice Anyone triggers auto-release of a submitted milestone whose timelock has
    ///         expired (the client stayed silent past the deadline).
    /// @dev No caller restriction — this is the anti-griefing escape hatch and is what
    ///      Chainlink Automation calls in Phase 9. Credits the freelancer net-of-fee via
    ///      pull-payment. A DISPUTED milestone is not SUBMITTED, so it can never be
    ///      auto-released here.
    /// @param jobId The job.
    /// @param mIndex The milestone index; must exist, be SUBMITTED, and be past deadline.
    function claimTimelockRelease(uint256 jobId, uint256 mIndex) external whenNotPaused nonReentrant {
        Job storage job = jobs[jobId];
        if (job.state == JobState.NONE) revert JobNotFound();
        if (mIndex >= job.milestoneCount) revert MilestoneNotFound();
        Milestone storage m = milestones[jobId][mIndex];
        if (m.state != MilestoneState.SUBMITTED) revert InvalidMilestoneState(uint8(m.state));
        if (block.timestamp < uint256(m.submittedAt) + job.timelock) revert TimelockNotExpired();

        uint256 amount = m.amount;
        m.state = MilestoneState.AUTO_RELEASED;
        _removeActive(jobId, mIndex);
        uint256 fee = _creditFreelancer(job, amount);
        job.approvedCount += 1;

        emit MilestoneAutoReleased(jobId, mIndex, amount, fee);
        _maybeCompleteJob(jobId, job);
    }

    /// @notice Withdraws the caller's pending pull-payment balance for a given token.
    /// @dev Follows Checks-Effects-Interactions: the balance is zeroed BEFORE the
    ///      transfer, and the function is `nonReentrant`. Intentionally NOT
    ///      `whenNotPaused` — credited funds must always be exitable, even while paused.
    ///      ERC-20 withdrawals are enabled in Phase 10; until then only ETH balances can
    ///      exist (createJob rejects non-ETH tokens).
    /// @param token The token to withdraw; `address(0)` for native ETH.
    function withdraw(address token) external nonReentrant {
        uint256 amount = pendingWithdrawals[token][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[token][msg.sender] = 0;

        if (token == address(0)) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            revert TokenNotSupported(); // ERC-20 path implemented in Phase 10
        }

        emit Withdrawal(msg.sender, token, amount);
    }

    /// @notice Owner sets the protocol fee (basis points), capped at `MAX_FEE_BPS`.
    /// @dev The fee is read at release time, so this affects only future releases —
    ///      documented as an accepted design point.
    /// @param _feeBps New fee in basis points; must be `<= MAX_FEE_BPS`.
    function setFeeBps(uint16 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert InvalidBps();
        uint16 old = feeBps;
        feeBps = _feeBps;
        emit FeeUpdated(old, _feeBps);
    }

    /// @notice Owner sets the global arbitrator used for FUTURE jobs.
    /// @dev Existing jobs keep the arbitrator snapshotted at their creation, so changing
    ///      this can never move who arbitrates an in-flight dispute.
    /// @param _arbitrator New global arbitrator; must be nonzero.
    function setArbitrator(address _arbitrator) external onlyOwner {
        if (_arbitrator == address(0)) revert ZeroAddress();
        address old = arbitrator;
        arbitrator = _arbitrator;
        emit ArbitratorUpdated(old, _arbitrator);
    }

    /// @notice Owner withdraws accrued protocol fees for a given token to an address.
    /// @dev Zero-then-send (CEI) + `nonReentrant`. ERC-20 fee withdrawal enabled Phase 10.
    /// @param token The token whose accrued fees to withdraw; `address(0)` for ETH.
    /// @param to Recipient of the fees; must be nonzero.
    function withdrawFees(address token, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accruedFees[token];
        if (amount == 0) revert NothingToWithdraw();
        accruedFees[token] = 0;

        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            revert TokenNotSupported(); // ERC-20 path implemented in Phase 10
        }

        emit FeesWithdrawn(token, amount);
    }

    /// @notice Owner pauses state-changing entry points (circuit breaker). `withdraw` is
    ///         deliberately excluded so funds remain exitable while paused.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Owner unpauses the contract.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views (implemented now — trivial, unblock testing)
    // ---------------------------------------------------------------------

    /// @notice Returns the full Job struct for a given job id.
    /// @param jobId The job id to look up.
    /// @return The Job struct (all-zero / `NONE` state if it does not exist).
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    /// @notice Returns a single Milestone struct.
    /// @param jobId The job id.
    /// @param mIndex The milestone index within the job.
    /// @return The Milestone struct (all-zero / `NONE` state if it does not exist).
    function getMilestone(uint256 jobId, uint256 mIndex) external view returns (Milestone memory) {
        return milestones[jobId][mIndex];
    }

    /// @notice Returns every Milestone belonging to a job.
    /// @param jobId The job id.
    /// @return result Array of Milestone structs, length `jobs[jobId].milestoneCount`.
    function getMilestones(uint256 jobId) external view returns (Milestone[] memory result) {
        uint16 count = jobs[jobId].milestoneCount;
        result = new Milestone[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = milestones[jobId][i];
        }
    }

    /// @notice Returns the number of packed keys currently tracked in the
    ///         active-submitted scan set (Chainlink Automation, Phase 9).
    /// @return The length of `activeSubmitted`.
    function activeSubmittedLength() external view returns (uint256) {
        return activeSubmitted.length;
    }

    /// @notice Allows the contract to receive ETH only via `createJob`'s payable path
    ///         in later phases; a bare `receive` is intentionally omitted so stray ETH
    ///         transfers revert rather than becoming stuck with no accounting entry.
}
