;; ProgressContract.clar

(define-constant ERR-NOT-ENROLLED (err u107))
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-MILESTONE (err u200))
(define-constant ERR-MILESTONE-ALREADY-COMPLETE (err u201))
(define-constant ERR-MAX-MILESTONES-EXCEEDED (err u202))
(define-constant ERR-COURSE-NOT-FOUND (err u204))
(define-constant ERR-INSUFFICIENT-MILESTONES (err u205))
(define-constant ERR-REWARD-MINT-FAILED (err u206))
(define-constant ERR-NFT-MINT-FAILED (err u207))
(define-constant ERR-LEVEL-UPDATE-FAILED (err u208))
(define-constant ERR-INVALID-REWARD-AMOUNT (err u209))
(define-constant ERR-PROGRESS-NOT-FOUND (err u210))
(define-constant ERR-INVALID-COMPLETION-THRESHOLD (err u211))
(define-constant ERR-INSTRUCTOR-NOT-VERIFIED (err u212))

(define-data-var completion-threshold uint u5)
(define-data-var max-milestones uint u10)
(define-data-var reward-amount uint u100)
(define-data-var authority-contract (optional principal) none)

(define-map progress
  { student: principal, course-id: uint }
  {
    milestones: (list 10 uint),
    completed: bool,
    start-date: uint,
    last-update: uint,
    total-progress: uint
  }
)

(define-map instructor-courses
  { instructor: principal }
  (list 20 uint)
)

(define-map student-courses
  { student: principal }
  (list 20 uint)
)

(define-map course-progress-metrics
  uint
  {
    total-enrollments: uint,
    avg-progress: uint,
    completion-rate: uint
  }
)

(define-read-only (get-progress (student principal) (course-id uint))
  (map-get? progress { student: student, course-id: course-id })
)

(define-read-only (get-instructor-courses (instructor principal))
  (map-get? instructor-courses { instructor: instructor })
)

(define-read-only (get-student-courses (student principal))
  (map-get? student-courses { student: student })
)

(define-read-only (get-course-metrics (course-id uint))
  (map-get? course-progress-metrics course-id)
)

(define-read-only (is-milestone-complete (progress-data (optional {
    milestones: (list 10 uint),
    completed: bool,
    start-date: uint,
    last-update: uint,
    total-progress: uint
  })) (milestone uint))
  (match progress-data
    data (is-some (index-of (get milestones data) milestone))
    false
  )
)

(define-read-only (calculate-progress-percentage (milestones (list 10 uint)))
  (let ((count (len milestones)))
    (if (> count u0)
        (/ (* count u100) (var-get max-milestones))
        u0
    )
  )
)

(define-private (validate-enrollment (student principal) (course-id uint))
  (let ((enrollment (contract-call? 'SP000000000000000000002Q6VF78.enrollment is-enrolled student course-id)))
    (if (is-some enrollment)
        (ok true)
        (err ERR-NOT-ENROLLED)
    )
  )
)

(define-private (validate-instructor (instructor principal) (course-id uint))
  (let ((course (contract-call? 'SP000000000000000000002Q6VF78.course get-course course-id)))
    (match course
      c (if (is-eq (get instructor c) instructor)
            (ok true)
            (err ERR-NOT-AUTHORIZED)
        )
      (err ERR-COURSE-NOT-FOUND)
    )
  )
)

(define-private (validate-milestone (milestone uint))
  (if (and (> milestone u0) (<= milestone (var-get max-milestones)))
      (ok true)
      (err ERR-INVALID-MILESTONE)
  )
)

(define-private (validate-reward-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-REWARD-AMOUNT)
  )
)

(define-private (validate-completion (milestones (list 10 uint)))
  (if (>= (len milestones) (var-get completion-threshold))
      (ok true)
      (err ERR-INSUFFICIENT-MILESTONES)
  )
)

(define-private (validate-authority (caller principal))
  (if (is-eq caller (unwrap! (var-get authority-contract) (err ERR-INSTRUCTOR-NOT-VERIFIED)))
      (ok true)
      (err ERR-NOT-AUTHORIZED)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-INSTRUCTOR-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-completion-threshold (new-threshold uint))
  (begin
    (try! (validate-authority tx-sender))
    (asserts! (and (> new-threshold u0) (<= new-threshold (var-get max-milestones))) (err ERR-INVALID-COMPLETION-THRESHOLD))
    (var-set completion-threshold new-threshold)
    (ok true)
  )
)

(define-public (set-reward-amount (new-amount uint))
  (begin
    (try! (validate-authority tx-sender))
    (try! (validate-reward-amount new-amount))
    (var-set reward-amount new-amount)
    (ok true)
  )
)

(define-public (set-max-milestones (new-max uint))
  (begin
    (try! (validate-authority tx-sender))
    (asserts! (> new-max u0) (err ERR-MAX-MILESTONES-EXCEEDED))
    (var-set max-milestones new-max)
    (ok true)
  )
)

(define-public (initialize-progress (student principal) (course-id uint))
  (begin
    (try! (validate-enrollment student course-id))
    (asserts! (is-none (map-get? progress { student: student, course-id: course-id })) (err ERR-PROGRESS-NOT-FOUND))
    (let ((new-progress {
          milestones: (list ),
          completed: false,
          start-date: block-height,
          last-update: block-height,
          total-progress: u0
        }))
      (map-set progress { student: student, course-id: course-id } new-progress)
      (let ((student-courses (default-to (list ) (map-get? student-courses { student: student }))))
        (map-set student-courses { student: student } (as-max-len? (append student-courses course-id) u20))
      )
      (let ((metrics (default-to { total-enrollments: u0, avg-progress: u0, completion-rate: u0 } (map-get? course-progress-metrics course-id))))
        (map-set course-progress-metrics course-id
          {
            total-enrollments: (+ (get total-enrollments metrics) u1),
            avg-progress: (get avg-progress metrics),
            completion-rate: (get completion-rate metrics)
          }
        )
      )
      (print { event: "progress-initialized", student: student, course-id: course-id })
      (ok true)
    )
  )
)

(define-public (update-milestone (student principal) (course-id uint) (milestone uint))
  (let (
        (current-progress (unwrap! (map-get? progress { student: student, course-id: course-id }) (err ERR-PROGRESS-NOT-FOUND)))
        (course-result (contract-call? 'SP000000000000000000002Q6VF78.course get-course course-id))
      )
    (begin
      (try! (validate-enrollment student course-id))
      (try! (validate-instructor tx-sender course-id))
      (try! (validate-milestone milestone))
      (asserts! (not (is-milestone-complete (some current-progress) milestone)) (err ERR-MILESTONE-ALREADY-COMPLETE))
      (let (
            (new-milestones (as-max-len? (append (get milestones current-progress) milestone) u10))
            (new-progress-percentage (calculate-progress-percentage new-milestones))
          )
        (asserts! (<= (len new-milestones) (var-get max-milestones)) (err ERR-MAX-MILESTONES-EXCEEDED))
        (try! (contract-call? 'SP000000000000000000002Q6VF78.token mint (var-get reward-amount) student))
        (map-set progress { student: student, course-id: course-id }
          {
            milestones: new-milestones,
            completed: (get completed current-progress),
            start-date: (get start-date current-progress),
            last-update: block-height,
            total-progress: new-progress-percentage
          }
        )
        (let ((metrics (unwrap! (map-get? course-progress-metrics course-id) { total-enrollments: u0, avg-progress: u0, completion-rate: u0 })))
          (map-set course-progress-metrics course-id
            {
              total-enrollments: (get total-enrollments metrics),
              avg-progress: (/ (+ (get avg-progress metrics) new-progress-percentage) u2),
              completion-rate: (get completion-rate metrics)
            }
          )
        )
        (if (>= (len new-milestones) (var-get completion-threshold))
            (begin
              (map-set progress { student: student, course-id: course-id }
                {
                  milestones: new-milestones,
                  completed: true,
                  start-date: (get start-date current-progress),
                  last-update: block-height,
                  total-progress: u100
                }
              )
              (try! (contract-call? 'SP000000000000000000002Q6VF78.nft mint course-id student))
              (let ((user-data (unwrap! (contract-call? 'SP000000000000000000002Q6VF78.user get-user student) (err u103))))
                (try! (contract-call? 'SP000000000000000000002Q6VF78.user update-level student (+ (get level user-data) u1)))
              )
              (let ((updated-metrics (unwrap! (map-get? course-progress-metrics course-id) { completion-rate: u0 })))
                (map-set course-progress-metrics course-id
                  (merge updated-metrics { completion-rate: (+ (get completion-rate updated-metrics) u1) })
                )
              )
              (print { event: "course-completed", student: student, course-id: course-id })
              (ok u1)
            )
            (begin
              (print { event: "milestone-updated", student: student, course-id: course-id, milestone: milestone })
              (ok u0)
            )
        )
      )
    )
  )
)

(define-public (reset-progress (student principal) (course-id uint))
  (begin
    (try! (validate-authority tx-sender))
    (asserts! (is-some (map-get? progress { student: student, course-id: course-id })) (err ERR-PROGRESS-NOT-FOUND))
    (map-set progress { student: student, course-id: course-id }
      {
        milestones: (list ),
        completed: false,
        start-date: block-height,
        last-update: block-height,
        total-progress: u0
      }
    )
    (print { event: "progress-reset", student: student, course-id: course-id })
    (ok true)
  )
)

(define-public (get-total-completions (course-id uint))
  (ok (get completion-rate (default-to { completion-rate: u0 } (map-get? course-progress-metrics course-id))))
)