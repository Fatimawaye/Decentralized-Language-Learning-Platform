;; EnrollmentContract.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-COURSE-ID u101)
(define-constant ERR-INVALID-FEE u102)
(define-constant ERR-INVALID-ENROLLMENT-PERIOD u103)
(define-constant ERR-INVALID-REFUND-RATE u104)
(define-constant ERR-INVALID-APPROVAL-THRESHOLD u105)
(define-constant ERR-ENROLLMENT-ALREADY-EXISTS u106)
(define-constant ERR-ENROLLMENT-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u109)
(define-constant ERR-INVALID-MIN-ENROLLMENTS u110)
(define-constant ERR-INVALID-MAX-ENROLLMENTS u111)
(define-constant ERR-ENROLLMENT-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-ENROLLMENTS-EXCEEDED u114)
(define-constant ERR-INVALID-ENROLLMENT-TYPE u115)
(define-constant ERR-INVALID-DISCOUNT-RATE u116)
(define-constant ERR-INVALID-GRACE-PERIOD u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-enrollment-id uint u0)
(define-data-var max-enrollments uint u10000)
(define-data-var platform-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map enrollments
  uint
  {
    student: principal,
    course-id: uint,
    fee-paid: uint,
    enrollment-period: uint,
    refund-rate: uint,
    approval-threshold: uint,
    timestamp: uint,
    enroller: principal,
    enrollment-type: (string-utf8 50),
    discount-rate: uint,
    grace-period: uint,
    location: (string-utf8 100),
    currency: (string-utf8 20),
    status: bool,
    min-enrollments: uint,
    max-enrollments: uint
  }
)

(define-map enrollments-by-student
  { student: principal, course-id: uint }
  uint)

(define-map enrollment-updates
  uint
  {
    update-fee-paid: uint,
    update-enrollment-period: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-enrollment (id uint))
  (map-get? enrollments id)
)

(define-read-only (get-enrollment-updates (id uint))
  (map-get? enrollment-updates id)
)

(define-read-only (is-enrollment-registered (student principal) (course-id uint))
  (is-some (map-get? enrollments-by-student { student: student, course-id: course-id }))
)

(define-private (validate-course-id (course uint))
  (if (> course u0)
      (ok true)
      (err ERR-INVALID-COURSE-ID))
)

(define-private (validate-fee (fee uint))
  (if (> fee u0)
      (ok true)
      (err ERR-INVALID-FEE))
)

(define-private (validate-enrollment-period (period uint))
  (if (> period u0)
      (ok true)
      (err ERR-INVALID-ENROLLMENT-PERIOD))
)

(define-private (validate-refund-rate (rate uint))
  (if (<= rate u100)
      (ok true)
      (err ERR-INVALID-REFUND-RATE))
)

(define-private (validate-approval-threshold (threshold uint))
  (if (and (> threshold u0) (<= threshold u100))
      (ok true)
      (err ERR-INVALID-APPROVAL-THRESHOLD))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-enrollment-type (type (string-utf8 50)))
  (if (or (is-eq type u"basic") (is-eq type u"premium") (is-eq type u"enterprise"))
      (ok true)
      (err ERR-INVALID-ENROLLMENT-TYPE))
)

(define-private (validate-discount-rate (rate uint))
  (if (<= rate u50)
      (ok true)
      (err ERR-INVALID-DISCOUNT-RATE))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u30)
      (ok true)
      (err ERR-INVALID-GRACE-PERIOD))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD") (is-eq cur u"BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-min-enrollments (min uint))
  (if (> min u0)
      (ok true)
      (err ERR-INVALID-MIN-ENROLLMENTS))
)

(define-private (validate-max-enrollments (max uint))
  (if (> max u0)
      (ok true)
      (err ERR-INVALID-MAX-ENROLLMENTS))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-enrollments (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-ENROLLMENTS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-enrollments new-max)
    (ok true)
  )
)

(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set platform-fee new-fee)
    (ok true)
  )
)

(define-public (enroll
  (course-id uint)
  (fee-paid uint)
  (enrollment-period uint)
  (refund-rate uint)
  (approval-threshold uint)
  (enrollment-type (string-utf8 50))
  (discount-rate uint)
  (grace-period uint)
  (location (string-utf8 100))
  (currency (string-utf8 20))
  (min-enrollments uint)
  (max-enrollments uint)
)
  (let (
        (next-id (var-get next-enrollment-id))
        (current-max (var-get max-enrollments))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ENROLLMENTS-EXCEEDED))
    (try! (validate-course-id course-id))
    (try! (validate-fee fee-paid))
    (try! (validate-enrollment-period enrollment-period))
    (try! (validate-refund-rate refund-rate))
    (try! (validate-approval-threshold approval-threshold))
    (try! (validate-enrollment-type enrollment-type))
    (try! (validate-discount-rate discount-rate))
    (try! (validate-grace-period grace-period))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (try! (validate-min-enrollments min-enrollments))
    (try! (validate-max-enrollments max-enrollments))
    (asserts! (is-none (map-get? enrollments-by-student { student: tx-sender, course-id: course-id })) (err ERR-ENROLLMENT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get platform-fee) tx-sender authority-recipient))
    )
    (map-set enrollments next-id
      {
        student: tx-sender,
        course-id: course-id,
        fee-paid: fee-paid,
        enrollment-period: enrollment-period,
        refund-rate: refund-rate,
        approval-threshold: approval-threshold,
        timestamp: block-height,
        enroller: tx-sender,
        enrollment-type: enrollment-type,
        discount-rate: discount-rate,
        grace-period: grace-period,
        location: location,
        currency: currency,
        status: true,
        min-enrollments: min-enrollments,
        max-enrollments: max-enrollments
      }
    )
    (map-set enrollments-by-student { student: tx-sender, course-id: course-id } next-id)
    (var-set next-enrollment-id (+ next-id u1))
    (print { event: "enrollment-created", id: next-id })
    (ok next-id)
  )
)

(define-public (update-enrollment
  (enrollment-id uint)
  (update-fee-paid uint)
  (update-enrollment-period uint)
)
  (let ((enrollment (map-get? enrollments enrollment-id)))
    (match enrollment
      e
        (begin
          (asserts! (is-eq (get enroller e) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-fee update-fee-paid))
          (try! (validate-enrollment-period update-enrollment-period))
          (map-set enrollments enrollment-id
            {
              student: (get student e),
              course-id: (get course-id e),
              fee-paid: update-fee-paid,
              enrollment-period: update-enrollment-period,
              refund-rate: (get refund-rate e),
              approval-threshold: (get approval-threshold e),
              timestamp: block-height,
              enroller: (get enroller e),
              enrollment-type: (get enrollment-type e),
              discount-rate: (get discount-rate e),
              grace-period: (get grace-period e),
              location: (get location e),
              currency: (get currency e),
              status: (get status e),
              min-enrollments: (get min-enrollments e),
              max-enrollments: (get max-enrollments e)
            }
          )
          (map-set enrollment-updates enrollment-id
            {
              update-fee-paid: update-fee-paid,
              update-enrollment-period: update-enrollment-period,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "enrollment-updated", id: enrollment-id })
          (ok true)
        )
      (err ERR-ENROLLMENT-NOT-FOUND)
    )
  )
)

(define-public (get-enrollment-count)
  (ok (var-get next-enrollment-id))
)

(define-public (check-enrollment-existence (student principal) (course-id uint))
  (ok (is-enrollment-registered student course-id))
)