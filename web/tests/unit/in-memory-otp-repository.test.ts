import { runOtpRepositoryContract } from "../support/otp-repository-contract";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

runOtpRepositoryContract("in memory", () => new InMemoryOtpRepository());
