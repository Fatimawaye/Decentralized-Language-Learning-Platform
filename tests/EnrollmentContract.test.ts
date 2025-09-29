// EnrollmentContract.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_COURSE_ID = 101;
const ERR_INVALID_FEE = 102;
const ERR_INVALID_ENROLLMENT_PERIOD = 103;
const ERR_INVALID_REFUND_RATE = 104;
const ERR_INVALID_APPROVAL_THRESHOLD = 105;
const ERR_ENROLLMENT_ALREADY_EXISTS = 106;
const ERR_ENROLLMENT_NOT_FOUND = 107;
const ERR_INVALID_ENROLLMENT_TYPE = 115;
const ERR_INVALID_DISCOUNT_RATE = 116;
const ERR_INVALID_GRACE_PERIOD = 117;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_CURRENCY = 119;
const ERR_INVALID_MIN_ENROLLMENTS = 110;
const ERR_INVALID_MAX_ENROLLMENTS = 111;
const ERR_MAX_ENROLLMENTS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_AUTHORITY_NOT_VERIFIED = 109;

interface Enrollment {
  student: string;
  courseId: number;
  feePaid: number;
  enrollmentPeriod: number;
  refundRate: number;
  approvalThreshold: number;
  timestamp: number;
  enroller: string;
  enrollmentType: string;
  discountRate: number;
  gracePeriod: number;
  location: string;
  currency: string;
  status: boolean;
  minEnrollments: number;
  maxEnrollments: number;
}

interface EnrollmentUpdate {
  updateFeePaid: number;
  updateEnrollmentPeriod: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class EnrollmentContractMock {
  state: {
    nextEnrollmentId: number;
    maxEnrollments: number;
    platformFee: number;
    authorityContract: string | null;
    enrollments: Map<number, Enrollment>;
    enrollmentUpdates: Map<number, EnrollmentUpdate>;
    enrollmentsByStudent: Map<string, number>;
  } = {
    nextEnrollmentId: 0,
    maxEnrollments: 10000,
    platformFee: 500,
    authorityContract: null,
    enrollments: new Map(),
    enrollmentUpdates: new Map(),
    enrollmentsByStudent: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextEnrollmentId: 0,
      maxEnrollments: 10000,
      platformFee: 500,
      authorityContract: null,
      enrollments: new Map(),
      enrollmentUpdates: new Map(),
      enrollmentsByStudent: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedAuthority(principal: string): Result<boolean> {
    return { ok: true, value: this.authorities.has(principal) };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setPlatformFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.platformFee = newFee;
    return { ok: true, value: true };
  }

  enroll(
    courseId: number,
    feePaid: number,
    enrollmentPeriod: number,
    refundRate: number,
    approvalThreshold: number,
    enrollmentType: string,
    discountRate: number,
    gracePeriod: number,
    location: string,
    currency: string,
    minEnrollments: number,
    maxEnrollments: number
  ): Result<number> {
    if (this.state.nextEnrollmentId >= this.state.maxEnrollments) return { ok: false, value: ERR_MAX_ENROLLMENTS_EXCEEDED };
    if (courseId <= 0) return { ok: false, value: ERR_INVALID_COURSE_ID };
    if (feePaid <= 0) return { ok: false, value: ERR_INVALID_FEE };
    if (enrollmentPeriod <= 0) return { ok: false, value: ERR_INVALID_ENROLLMENT_PERIOD };
    if (refundRate > 100) return { ok: false, value: ERR_INVALID_REFUND_RATE };
    if (approvalThreshold <= 0 || approvalThreshold > 100) return { ok: false, value: ERR_INVALID_APPROVAL_THRESHOLD };
    if (!["basic", "premium", "enterprise"].includes(enrollmentType)) return { ok: false, value: ERR_INVALID_ENROLLMENT_TYPE };
    if (discountRate > 50) return { ok: false, value: ERR_INVALID_DISCOUNT_RATE };
    if (gracePeriod > 30) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (minEnrollments <= 0) return { ok: false, value: ERR_INVALID_MIN_ENROLLMENTS };
    if (maxEnrollments <= 0) return { ok: false, value: ERR_INVALID_MAX_ENROLLMENTS };
    if (!this.isVerifiedAuthority(this.caller).value) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const key = `${this.caller}-${courseId}`;
    if (this.state.enrollmentsByStudent.has(key)) return { ok: false, value: ERR_ENROLLMENT_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.platformFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextEnrollmentId;
    const enrollment: Enrollment = {
      student: this.caller,
      courseId,
      feePaid,
      enrollmentPeriod,
      refundRate,
      approvalThreshold,
      timestamp: this.blockHeight,
      enroller: this.caller,
      enrollmentType,
      discountRate,
      gracePeriod,
      location,
      currency,
      status: true,
      minEnrollments,
      maxEnrollments,
    };
    this.state.enrollments.set(id, enrollment);
    this.state.enrollmentsByStudent.set(key, id);
    this.state.nextEnrollmentId++;
    return { ok: true, value: id };
  }

  getEnrollment(id: number): Enrollment | null {
    return this.state.enrollments.get(id) || null;
  }

  updateEnrollment(id: number, updateFeePaid: number, updateEnrollmentPeriod: number): Result<boolean> {
    const enrollment = this.state.enrollments.get(id);
    if (!enrollment) return { ok: false, value: false };
    if (enrollment.enroller !== this.caller) return { ok: false, value: false };
    if (updateFeePaid <= 0) return { ok: false, value: false };
    if (updateEnrollmentPeriod <= 0) return { ok: false, value: false };

    const updated: Enrollment = {
      ...enrollment,
      feePaid: updateFeePaid,
      enrollmentPeriod: updateEnrollmentPeriod,
      timestamp: this.blockHeight,
    };
    this.state.enrollments.set(id, updated);
    this.state.enrollmentUpdates.set(id, {
      updateFeePaid,
      updateEnrollmentPeriod,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getEnrollmentCount(): Result<number> {
    return { ok: true, value: this.state.nextEnrollmentId };
  }

  checkEnrollmentExistence(student: string, courseId: number): Result<boolean> {
    const key = `${student}-${courseId}`;
    return { ok: true, value: this.state.enrollmentsByStudent.has(key) };
  }
}

describe("EnrollmentContract", () => {
  let contract: EnrollmentContractMock;

  beforeEach(() => {
    contract = new EnrollmentContractMock();
    contract.reset();
  });

  it("creates an enrollment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const enrollment = contract.getEnrollment(0);
    expect(enrollment?.student).toBe("ST1TEST");
    expect(enrollment?.courseId).toBe(1);
    expect(enrollment?.feePaid).toBe(100);
    expect(enrollment?.enrollmentPeriod).toBe(30);
    expect(enrollment?.refundRate).toBe(5);
    expect(enrollment?.approvalThreshold).toBe(50);
    expect(enrollment?.enrollmentType).toBe("basic");
    expect(enrollment?.discountRate).toBe(10);
    expect(enrollment?.gracePeriod).toBe(7);
    expect(enrollment?.location).toBe("Online");
    expect(enrollment?.currency).toBe("STX");
    expect(enrollment?.minEnrollments).toBe(5);
    expect(enrollment?.maxEnrollments).toBe(100);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate enrollments", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    const result = contract.enroll(
      1,
      200,
      60,
      10,
      60,
      "premium",
      15,
      14,
      "Remote",
      "USD",
      10,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ENROLLMENT_ALREADY_EXISTS);
  });

  it("rejects non-authorized caller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.authorities = new Set();
    const result = contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("parses enrollment type with Clarity", () => {
    const cv = stringUtf8CV("premium");
    expect(cv.value).toBe("premium");
  });

  it("rejects enrollment without authority contract", () => {
    const result = contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid course id", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.enroll(
      0,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_COURSE_ID);
  });

  it("rejects invalid fee", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.enroll(
      1,
      0,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FEE);
  });

  it("rejects invalid enrollment type", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "invalid",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ENROLLMENT_TYPE);
  });

  it("updates an enrollment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    const result = contract.updateEnrollment(0, 200, 60);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const enrollment = contract.getEnrollment(0);
    expect(enrollment?.feePaid).toBe(200);
    expect(enrollment?.enrollmentPeriod).toBe(60);
    const update = contract.state.enrollmentUpdates.get(0);
    expect(update?.updateFeePaid).toBe(200);
    expect(update?.updateEnrollmentPeriod).toBe(60);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent enrollment", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateEnrollment(99, 200, 60);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-enroller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateEnrollment(0, 200, 60);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets platform fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setPlatformFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.platformFee).toBe(1000);
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects platform fee change without authority contract", () => {
    const result = contract.setPlatformFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct enrollment count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    contract.enroll(
      2,
      200,
      60,
      10,
      60,
      "premium",
      15,
      14,
      "Remote",
      "USD",
      10,
      200
    );
    const result = contract.getEnrollmentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks enrollment existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    const result = contract.checkEnrollmentExistence("ST1TEST", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkEnrollmentExistence("ST1TEST", 99);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses enrollment parameters with Clarity types", () => {
    const enrollmentType = stringUtf8CV("basic");
    const courseId = uintCV(1);
    const feePaid = uintCV(100);
    expect(enrollmentType.value).toBe("basic");
    expect(courseId.value).toEqual(BigInt(1));
    expect(feePaid.value).toEqual(BigInt(100));
  });

  it("rejects enrollment with invalid location", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "",
      "STX",
      5,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOCATION);
  });

  it("rejects enrollment with max enrollments exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxEnrollments = 1;
    contract.enroll(
      1,
      100,
      30,
      5,
      50,
      "basic",
      10,
      7,
      "Online",
      "STX",
      5,
      100
    );
    const result = contract.enroll(
      2,
      200,
      60,
      10,
      60,
      "premium",
      15,
      14,
      "Remote",
      "USD",
      10,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ENROLLMENTS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});