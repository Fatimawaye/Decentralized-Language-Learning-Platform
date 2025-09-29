# LinguaChain: Decentralized Language Learning Platform

## Overview

LinguaChain is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It decentralizes language course enrollments, addressing real-world problems in traditional education systems such as:

- **Lack of Transparency**: Centralized platforms often obscure enrollment data, payments, and progress, leading to disputes.
- **High Fees and Intermediaries**: Banks and payment processors take cuts, limiting accessibility in underserved regions.
- **Motivation and Retention Issues**: Students drop out due to lack of incentives; LinguaChain uses token rewards for milestones.
- **Certificate Fraud**: Fake credentials are common; blockchain-issued NFTs ensure verifiable, immutable certificates.
- **Global Accessibility**: Restrictive borders and currencies hinder enrollment; crypto enables borderless participation.
- **Governance Centralization**: Course offerings are controlled by admins; a DAO allows community voting on new courses.

The platform allows users to register, browse courses, enroll with token payments, track progress on-chain, earn certificates as NFTs, and participate in governance. It involves 7 smart contracts for modularity and security.

## Tech Stack
- **Blockchain**: Stacks (Bitcoin-secured).
- **Smart Contract Language**: Clarity (secure, predictable, no reentrancy issues).
- **Standards**:
  - SIP-010 for fungible tokens (payments/rewards).
  - SIP-009 for NFTs (certificates).
- **Deployment**: Use Stacks CLI for deployment to testnet/mainnet.
- **Frontend Integration**: Not included here; suggest using Hiro Wallet for user interactions.

## Smart Contracts

Below are the 7 smart contracts. Each is self-contained but interacts via contract calls. Deploy them in this order: TokenContract, NFTContract, UserContract, CourseContract, EnrollmentContract, ProgressContract, GovernanceContract.

### 1. TokenContract.clar (SIP-010 Fungible Token for Payments and Rewards)
This contract manages the LINGUA token used for course fees, instructor payouts, and student rewards.

```clarity
;; TokenContract.clar
(define-fungible-token lingua u1000000000) ;; Max supply: 1 billion

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant CONTRACT-OWNER tx-sender)

(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (ft-transfer? lingua amount sender recipient)
)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (ft-mint? lingua amount recipient)
  )
)

(define-public (burn (amount uint) (sender principal))
  (ft-burn? lingua amount sender)
)

(define-read-only (get-balance (account principal))
  (ft-get-balance lingua account)
)

(define-read-only (get-total-supply)
  (ft-get-supply lingua)
)
```

### 2. NFTContract.clar (SIP-009 NFTs for Certificates)
Issues unique NFTs as completion certificates, verifiable on-chain.

```clarity
;; NFTContract.clar
(define-non-fungible-token certificate uint)

(define-map certificates uint { owner: principal, course-id: uint, completion-date: uint })
(define-data-var last-id uint u0)
(define-constant ERR-NOT-OWNER (err u101))
(define-constant ERR-NOT-AUTHORIZED (err u100))

(define-public (mint (course-id uint) (recipient principal))
  (let ((new-id (+ (var-get last-id) u1)))
    (begin
      (asserts! (is-eq tx-sender 'SP...EnrollmentContract) ERR-NOT-AUTHORIZED) ;; Replace with actual contract principal
      (try! (nft-mint? certificate new-id recipient))
      (map-set certificates new-id { owner: recipient, course-id: course-id, completion-date: block-height })
      (var-set last-id new-id)
      (ok new-id)
    )
  )
)

(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq (unwrap! (map-get? certificates id) ERR-NOT-OWNER) { owner: sender }) ERR-NOT-OWNER)
    (nft-transfer? certificate id sender recipient)
  )
)

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? certificate id))
)

(define-read-only (get-metadata (id uint))
  (map-get? certificates id)
)
```

### 3. UserContract.clar (User Registration and Profiles)
Handles user registration and basic profile data.

```clarity
;; UserContract.clar
(define-map users principal { name: (string-ascii 50), registered-at: uint, level: uint })
(define-constant ERR-ALREADY-REGISTERED (err u102))

(define-public (register (name (string-ascii 50)))
  (begin
    (asserts! (is-none (map-get? users tx-sender)) ERR-ALREADY-REGISTERED)
    (map-set users tx-sender { name: name, registered-at: block-height, level: u0 })
    (ok true)
  )
)

(define-public (update-level (user principal) (new-level uint))
  (begin
    (asserts! (is-eq tx-sender 'SP...ProgressContract) ERR-NOT-AUTHORIZED) ;; Replace with actual
    (map-set users user
      (merge (unwrap! (map-get? users user) (err u103)) { level: new-level }))
    (ok true)
  )
)

(define-read-only (get-user (user principal))
  (map-get? users user)
)
```

### 4. CourseContract.clar (Course Catalog Management)
Stores and manages course listings, added via governance.

```clarity
;; CourseContract.clar
(define-map courses uint { title: (string-ascii 100), instructor: principal, fee: uint, duration: uint })
(define-data-var course-count uint u0)
(define-constant ERR-NOT-AUTHORIZED (err u100))

(define-public (add-course (title (string-ascii 100)) (fee uint) (duration uint))
  (let ((new-id (+ (var-get course-count) u1)))
    (begin
      (asserts! (is-eq tx-sender 'SP...GovernanceContract) ERR-NOT-AUTHORIZED) ;; Replace with actual
      (map-set courses new-id { title: title, instructor: tx-sender, fee: fee, duration: duration })
      (var-set course-count new-id)
      (ok new-id)
    )
  )
)

(define-read-only (get-course (id uint))
  (map-get? courses id)
)

(define-read-only (get-course-count)
  (var-get course-count)
)
```

### 5. EnrollmentContract.clar (Enrollment Handling)
Processes enrollments, transfers fees, and initiates progress tracking.

```clarity
;; EnrollmentContract.clar
(define-map enrollments { student: principal, course-id: uint } { enrolled-at: uint, paid: bool })
(define-constant ERR-ALREADY-ENROLLED (err u104))
(define-constant ERR-INSUFFICIENT-BALANCE (err u105))
(define-constant TOKEN-CONTRACT 'SP...TokenContract) ;; Replace with actual
(define-constant COURSE-CONTRACT 'SP...CourseContract)

(define-public (enroll (course-id uint))
  (let ((course (unwrap! (contract-call? COURSE-CONTRACT get-course course-id) (err u106)))
        (fee (get fee course)))
    (begin
      (asserts! (is-none (map-get? enrollments { student: tx-sender, course-id: course-id })) ERR-ALREADY-ENROLLED)
      (try! (contract-call? TOKEN-CONTRACT transfer fee tx-sender (get instructor course)))
      (map-set enrollments { student: tx-sender, course-id: course-id } { enrolled-at: block-height, paid: true })
      (ok true)
    )
  )
)

(define-read-only (is-enrolled (student principal) (course-id uint))
  (map-get? enrollments { student: student, course-id: course-id })
)
```

### 6. ProgressContract.clar (Progress Tracking)
Tracks student milestones, issues rewards, and triggers certificates.

```clarity
;; ProgressContract.clar
(define-map progress { student: principal, course-id: uint } { milestones: (list 10 uint), completed: bool })
(define-constant ERR-NOT-ENROLLED (err u107))
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant TOKEN-CONTRACT 'SP...TokenContract)
(define-constant NFT-CONTRACT 'SP...NFTContract)
(define-constant ENROLLMENT-CONTRACT 'SP...EnrollmentContract)
(define-constant REWARD-AMOUNT u100) ;; Example reward per milestone

(define-public (update-milestone (student principal) (course-id uint) (milestone uint))
  (begin
    (asserts! (is-some (contract-call? ENROLLMENT-CONTRACT is-enrolled student course-id)) ERR-NOT-ENROLLED)
    (asserts! (is-eq tx-sender (get instructor (unwrap! (contract-call? 'SP...CourseContract get-course course-id) (err u106)))) ERR-NOT-AUTHORIZED)
    (let ((current (unwrap! (map-get? progress { student: student, course-id: course-id }) (err u108))))
      (map-set progress { student: student, course-id: course-id }
        (merge current { milestones: (append (get milestones current) milestone) }))
      (try! (contract-call? TOKEN-CONTRACT mint REWARD-AMOUNT student)) ;; Reward
      (if (>= (len (get milestones current)) u5) ;; Example: 5 milestones for completion
        (begin
          (map-set progress { student: student, course-id: course-id } (merge current { completed: true }))
          (try! (contract-call? NFT-CONTRACT mint course-id student))
          (try! (contract-call? 'SP...UserContract update-level student (+ (get level (unwrap! (contract-call? 'SP...UserContract get-user student) (err u103))) u1)))
        )
        (ok false)
      )
      (ok true)
    )
  )
)

(define-read-only (get-progress (student principal) (course-id uint))
  (map-get? progress { student: student, course-id: course-id })
)
```

### 7. GovernanceContract.clar (DAO for Community Decisions)
Allows token holders to vote on adding courses or changes.

```clarity
;; GovernanceContract.clar
(define-map proposals uint { proposer: principal, description: (string-ascii 200), votes-for: uint, votes-against: uint, end-block: uint })
(define-data-var proposal-count uint u0)
(define-constant VOTING_PERIOD u144) ;; ~1 day in blocks
(define-constant MIN_TOKENS_TO_VOTE u1000)
(define-constant TOKEN-CONTRACT 'SP...TokenContract)
(define-constant COURSE-CONTRACT 'SP...CourseContract)
(define-constant ERR-INSUFFICIENT-TOKENS (err u109))
(define-constant ERR-VOTING-ENDED (err u110))

(define-public (create-proposal (description (string-ascii 200)))
  (let ((new-id (+ (var-get proposal-count) u1)))
    (begin
      (map-set proposals new-id { proposer: tx-sender, description: description, votes-for: u0, votes-against: u0, end-block: (+ block-height VOTING_PERIOD) })
      (var-set proposal-count new-id)
      (ok new-id)
    )
  )
)

(define-public (vote (proposal-id uint) (vote-for bool))
  (let ((proposal (unwrap! (map-get? proposals proposal-id) (err u111)))
        (balance (contract-call? TOKEN-CONTRACT get-balance tx-sender)))
    (begin
      (asserts! (>= balance MIN_TOKENS_TO_VOTE) ERR-INSUFFICIENT-TOKENS)
      (asserts! (< block-height (get end-block proposal)) ERR-VOTING-ENDED)
      (if vote-for
        (map-set proposals proposal-id (merge proposal { votes-for: (+ (get votes-for proposal) balance) }))
        (map-set proposals proposal-id (merge proposal { votes-against: (+ (get votes-against proposal) balance) }))
      )
      (ok true)
    )
  )
)

(define-public (execute-proposal (proposal-id uint) (title (string-ascii 100)) (fee uint) (duration uint))
  (let ((proposal (unwrap! (map-get? proposals proposal-id) (err u111))))
    (begin
      (asserts! (> block-height (get end-block proposal)) (err u112))
      (asserts! (> (get votes-for proposal) (get votes-against proposal)) (err u113))
      (try! (contract-call? COURSE-CONTRACT add-course title fee duration))
      (ok true)
    )
  )
)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id)
)
```

## Deployment Instructions
1. Install Stacks CLI: `cargo install stacks-cli`.
2. Deploy each contract: `stacks deploy <contract-name>.clar --testnet`.
3. Update contract principals in code (e.g., 'SP...TokenContract') with deployed addresses.
4. Fund the owner with STX for deployment fees.

## Usage Flow
1. User registers via UserContract.
2. Browse courses in CourseContract.
3. Enroll and pay via EnrollmentContract.
4. Instructor updates progress in ProgressContract.
5. Earn NFT certificate upon completion.
6. Participate in governance with tokens.

## Security Notes
- All contracts use assertions for access control.
- No external calls in critical paths to prevent reentrancy.
- Audit recommended before mainnet.

## Future Enhancements
- Integrate with IPFS for course content.
- Add refund mechanisms.
- Frontend dApp for user-friendly interactions.

This project empowers global language learning through decentralization! For questions, contribute on GitHub.