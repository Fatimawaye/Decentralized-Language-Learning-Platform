// ProgressContract.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV } from "@stacks/transactions";

const ERR_NOT_ENROLLED = 107;
const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_MILESTONE = 200;
const ERR_MILESTONE_ALREADY_COMPLETE = 201;
const ERR_MAX_MILESTONES_EXCEEDED = 202;
const ERR_COURSE_NOT_FOUND = 204;
const ERR_INSUFFICIENT_MILESTONES = 205;
const ERR_REWARD_MINT_FAILED = 206;
const ERR_NFT_MINT_FAILED = 207;
const ERR_LEVEL_UPDATE_FAILED = 208;
const ERR_INVALID_REWARD_AMOUNT = 209;
const ERR_PROGRESS_NOT_FOUND = 210;
const ERR_INVALID_COMPLETION_THRESHOLD = 211;
const ERR_INSTRUCTOR_NOT_VERIFIED = 212;

interface ProgressData {
  milestones: number[];
  completed: boolean;
  startDate: number;
  lastUpdate: number;
  totalProgress: number;
}

interface CourseMetrics {
  totalEnrollments: number;
  avgProgress: number;
  completionRate: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class EnrollmentMock {
  isEnrolled(student: string, courseId: number): Result<boolean> {
    return { ok: true, value: true };
  }
}

class CourseMock {
  getCourse(courseId: number): Result<{ instructor: string }> {
    return { ok: true, value: { instructor: "ST1INSTRUCTOR" } };
  }
}

class TokenMock {
  mint(amount: number, recipient: string): Result<boolean> {
    return { ok: true, value: true };
  }
}

class NFTMock {
  mint(courseId: number, student: string): Result<number> {
    return { ok: true, value: 1 };
  }
}

class UserMock {
  getUser(student: string): Result<{ level: number }> {
    return { ok: true, value: { level: 1 } };
  }
  updateLevel(student: string, newLevel: number): Result<boolean> {
    return { ok: true, value: true };
  }
}

class ProgressFactoryMock {
  state: {
    completionThreshold: number;
    maxMilestones: number;
    rewardAmount: number;
    authorityContract: string | null;
    progress: Map<string, ProgressData>;
    instructorCourses: Map<string, number[]>;
    studentCourses: Map<string, number[]>;
    courseProgressMetrics: Map<number, CourseMetrics>;
  } = {
    completionThreshold: 5,
    maxMilestones: 10,
    rewardAmount: 100,
    authorityContract: null,
    progress: new Map(),
    instructorCourses: new Map(),
    studentCourses: new Map(),
    courseProgressMetrics: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1INSTRUCTOR";
  authorities: Set<string> = new Set(["ST1AUTHORITY"]);

  enrollmentMock: EnrollmentMock = new EnrollmentMock();
  courseMock: CourseMock = new CourseMock();
  tokenMock: TokenMock = new TokenMock();
  nftMock: NFTMock = new NFTMock();
  userMock: UserMock = new UserMock();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      completionThreshold: 5,
      maxMilestones: 10,
      rewardAmount: 100,
      authorityContract: null,
      progress: new Map(),
      instructorCourses: new Map(),
      studentCourses: new Map(),
      courseProgressMetrics: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1INSTRUCTOR";
    this.authorities = new Set(["ST1AUTHORITY"]);
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setCompletionThreshold(newThreshold: number): Result<boolean> {
    if (!this.authorities.has(this.caller)) return { ok: false, value: false };
    if (newThreshold <= 0 || newThreshold > this.state.maxMilestones) return { ok: false, value: false };
    this.state.completionThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setRewardAmount(newAmount: number): Result<boolean> {
    if (!this.authorities.has(this.caller)) return { ok: false, value: false };
    if (newAmount <= 0) return { ok: false, value: false };
    this.state.rewardAmount = newAmount;
    return { ok: true, value: true };
  }

  setMaxMilestones(newMax: number): Result<boolean> {
    if (!this.authorities.has(this.caller)) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxMilestones = newMax;
    return { ok: true, value: true };
  }

  initializeProgress(student: string, courseId: number): Result<boolean> {
    const key = `${student}-${courseId}`;
    if (this.state.progress.has(key)) return { ok: false, value: ERR_PROGRESS_NOT_FOUND };
    if (!this.enrollmentMock.isEnrolled(student, courseId).value) return { ok: false, value: ERR_NOT_ENROLLED };

    this.state.progress.set(key, {
      milestones: [],
      completed: false,
      startDate: this.blockHeight,
      lastUpdate: this.blockHeight,
      totalProgress: 0,
    });

    let studentCourses = this.state.studentCourses.get(student) || [];
    studentCourses.push(courseId);
    if (studentCourses.length > 20) studentCourses = studentCourses.slice(-20);
    this.state.studentCourses.set(student, studentCourses);

    let metrics = this.state.courseProgressMetrics.get(courseId) || { totalEnrollments: 0, avgProgress: 0, completionRate: 0 };
    metrics.totalEnrollments += 1;
    this.state.courseProgressMetrics.set(courseId, metrics);

    return { ok: true, value: true };
  }

  updateMilestone(student: string, courseId: number, milestone: number): Result<number> {
    const key = `${student}-${courseId}`;
    const currentProgress = this.state.progress.get(key);
    if (!currentProgress) return { ok: false, value: ERR_PROGRESS_NOT_FOUND };

    if (!this.enrollmentMock.isEnrolled(student, courseId).value) return { ok: false, value: ERR_NOT_ENROLLED };
    const course = this.courseMock.getCourse(courseId);
    if (!course.ok || course.value.instructor !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };

    if (milestone <= 0 || milestone > this.state.maxMilestones) return { ok: false, value: ERR_INVALID_MILESTONE };
    if (currentProgress.milestones.includes(milestone)) return { ok: false, value: ERR_MILESTONE_ALREADY_COMPLETE };

    const newMilestones = [...currentProgress.milestones, milestone].sort((a, b) => a - b);
    if (newMilestones.length > this.state.maxMilestones) return { ok: false, value: ERR_MAX_MILESTONES_EXCEEDED };

    const newProgressPercentage = Math.floor((newMilestones.length / this.state.maxMilestones) * 100);

    if (!this.tokenMock.mint(this.state.rewardAmount, student).value) return { ok: false, value: ERR_REWARD_MINT_FAILED };

    currentProgress.milestones = newMilestones;
    currentProgress.lastUpdate = this.blockHeight;
    currentProgress.totalProgress = newProgressPercentage;
    this.state.progress.set(key, currentProgress);

    let metrics = this.state.courseProgressMetrics.get(courseId) || { totalEnrollments: 0, avgProgress: 0, completionRate: 0 };
    const updatedAvg = metrics.totalEnrollments === 0 ? newProgressPercentage : Math.floor((metrics.avgProgress * (metrics.totalEnrollments - 1) + newProgressPercentage) / metrics.totalEnrollments);
    metrics.avgProgress = updatedAvg;
    this.state.courseProgressMetrics.set(courseId, metrics);

    if (newMilestones.length >= this.state.completionThreshold) {
      currentProgress.completed = true;
      currentProgress.totalProgress = 100;
      this.state.progress.set(key, currentProgress);

      if (!this.nftMock.mint(courseId, student).ok) return { ok: false, value: ERR_NFT_MINT_FAILED };

      const user = this.userMock.getUser(student);
      if (!this.userMock.updateLevel(student, (user.value.level || 0) + 1).value) return { ok: false, value: ERR_LEVEL_UPDATE_FAILED };

      metrics.completionRate += 1;
      this.state.courseProgressMetrics.set(courseId, metrics);

      return { ok: true, value: 1 };
    }

    return { ok: true, value: 0 };
  }

  resetProgress(student: string, courseId: number): Result<boolean> {
    if (!this.authorities.has(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const key = `${student}-${courseId}`;
    if (!this.state.progress.has(key)) return { ok: false, value: ERR_PROGRESS_NOT_FOUND };

    this.state.progress.set(key, {
      milestones: [],
      completed: false,
      startDate: this.blockHeight,
      lastUpdate: this.blockHeight,
      totalProgress: 0,
    });

    return { ok: true, value: true };
  }

  getProgress(student: string, courseId: number): ProgressData | null {
    const key = `${student}-${courseId}`;
    return this.state.progress.get(key) || null;
  }

  getTotalCompletions(courseId: number): Result<number> {
    const metrics = this.state.courseProgressMetrics.get(courseId) || { completionRate: 0 };
    return { ok: true, value: metrics.completionRate };
  }
}

describe("ProgressContract", () => {
  let contract: ProgressFactoryMock;

  beforeEach(() => {
    contract = new ProgressFactoryMock();
    contract.reset();
    contract.setAuthorityContract("ST1AUTHORITY");
  });

  it("initializes progress successfully", () => {
    const result = contract.initializeProgress("ST1STUDENT", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const progress = contract.getProgress("ST1STUDENT", 1);
    expect(progress).toBeDefined();
    expect(progress?.milestones).toEqual([]);
    expect(progress?.completed).toBe(false);
    expect(progress?.totalProgress).toBe(0);

    const studentCourses = contract.state.studentCourses.get("ST1STUDENT");
    expect(studentCourses).toEqual([1]);

    const metrics = contract.state.courseProgressMetrics.get(1);
    expect(metrics?.totalEnrollments).toBe(1);
  });

  it("rejects initialization for existing progress", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    const result = contract.initializeProgress("ST1STUDENT", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROGRESS_NOT_FOUND);
  });

  it("rejects initialization without enrollment", () => {
    (contract.enrollmentMock as any).isEnrolled = () => ({ ok: true, value: false });
    const result = contract.initializeProgress("ST1STUDENT", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ENROLLED);
  });

  it("updates milestone successfully without completion", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    const result = contract.updateMilestone("ST1STUDENT", 1, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const progress = contract.getProgress("ST1STUDENT", 1);
    expect(progress?.milestones).toEqual([1]);
    expect(progress?.totalProgress).toBe(10);
  });

  it("completes course and mints rewards/NFT on threshold", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    for (let i = 1; i <= 5; i++) {
      contract.updateMilestone("ST1STUDENT", 1, i);
    }
    const progress = contract.getProgress("ST1STUDENT", 1);
    expect(progress?.completed).toBe(true);
    expect(progress?.totalProgress).toBe(100);

    const metrics = contract.state.courseProgressMetrics.get(1);
    expect(metrics?.completionRate).toBe(1);
  });

  it("rejects milestone update by non-instructor", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    contract.caller = "ST2FAKE";
    const result = contract.updateMilestone("ST1STUDENT", 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects duplicate milestone", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    contract.updateMilestone("ST1STUDENT", 1, 1);
    const result = contract.updateMilestone("ST1STUDENT", 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MILESTONE_ALREADY_COMPLETE);
  });

  it("rejects invalid milestone", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    const result = contract.updateMilestone("ST1STUDENT", 1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MILESTONE);
  });

  it("rejects update without enrollment", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    (contract.enrollmentMock as any).isEnrolled = () => ({ ok: true, value: false });
    const result = contract.updateMilestone("ST1STUDENT", 1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ENROLLED);
  });

  it("resets progress successfully", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    contract.updateMilestone("ST1STUDENT", 1, 1);
    contract.caller = "ST1AUTHORITY";
    const result = contract.resetProgress("ST1STUDENT", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const progress = contract.getProgress("ST1STUDENT", 1);
    expect(progress?.milestones).toEqual([]);
    expect(progress?.completed).toBe(false);
  });

  it("rejects reset by non-authority", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    const result = contract.resetProgress("ST1STUDENT", 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets completion threshold successfully", () => {
    contract.caller = "ST1AUTHORITY";
    const result = contract.setCompletionThreshold(3);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.completionThreshold).toBe(3);
  });

  it("rejects invalid completion threshold", () => {
    contract.caller = "ST1AUTHORITY";
    const result = contract.setCompletionThreshold(11);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets reward amount successfully", () => {
    contract.caller = "ST1AUTHORITY";
    const result = contract.setRewardAmount(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.rewardAmount).toBe(200);
  });

  it("rejects invalid reward amount", () => {
    contract.caller = "ST1AUTHORITY";
    const result = contract.setRewardAmount(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns total completions correctly", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    for (let i = 1; i <= 5; i++) {
      contract.updateMilestone("ST1STUDENT", 1, i);
    }
    const result = contract.getTotalCompletions(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("updates course metrics on progress", () => {
    contract.initializeProgress("ST1STUDENT", 1);
    contract.updateMilestone("ST1STUDENT", 1, 1);
    const metrics = contract.state.courseProgressMetrics.get(1);
    expect(metrics?.avgProgress).toBe(10);
  });
});