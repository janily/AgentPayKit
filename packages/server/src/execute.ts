import type { DefinedPaidSkill } from "./config.js";

export type PaidSkillErrorCode =
  | "INVALID_INPUT"
  | "EXECUTION_FAILED"
  | "EXECUTION_TIMEOUT"
  | "INVALID_OUTPUT"
  | "SUCCESS_POLICY_FAILED"
  | "SUCCESS_POLICY_REJECTED";

export class PaidSkillExecutionError extends Error {
  constructor(
    readonly code: PaidSkillErrorCode,
    readonly status: 400 | 422 | 502 | 504,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "PaidSkillExecutionError";
  }
}

export async function executePaidSkill<TInput, TOutput>(
  skill: DefinedPaidSkill<TInput, TOutput>,
  rawInput: unknown,
): Promise<TOutput> {
  const parsedInput = skill.input.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new PaidSkillExecutionError("INVALID_INPUT", 400);
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new PaidSkillExecutionError("EXECUTION_TIMEOUT", 504));
      controller.abort();
    }, skill.timeoutMs);
  });

  try {
    let result: TOutput;
    try {
      result = await Promise.race([
        Promise.resolve().then(() =>
          skill.execute(parsedInput.data, { signal: controller.signal }),
        ),
        timeout,
      ]);
      if (timedOut) {
        throw new PaidSkillExecutionError("EXECUTION_TIMEOUT", 504);
      }
    } catch (error) {
      if (timedOut) {
        throw new PaidSkillExecutionError("EXECUTION_TIMEOUT", 504, {
          cause: error,
        });
      }
      if (error instanceof PaidSkillExecutionError) {
        throw error;
      }
      throw new PaidSkillExecutionError("EXECUTION_FAILED", 502, {
        cause: error,
      });
    }

    let parsedOutput: ReturnType<typeof skill.output.safeParse>;
    try {
      parsedOutput = skill.output.safeParse(result);
    } catch (error) {
      throw new PaidSkillExecutionError("INVALID_OUTPUT", 502, {
        cause: error,
      });
    }
    if (!parsedOutput.success) {
      throw new PaidSkillExecutionError("INVALID_OUTPUT", 502);
    }

    if (skill.success !== undefined) {
      let accepted: boolean;
      try {
        accepted = skill.success(parsedOutput.data);
      } catch (error) {
        throw new PaidSkillExecutionError("SUCCESS_POLICY_FAILED", 502, {
          cause: error,
        });
      }
      if (!accepted) {
        throw new PaidSkillExecutionError("SUCCESS_POLICY_REJECTED", 422);
      }
    }

    return parsedOutput.data;
  } finally {
    clearTimeout(timer);
  }
}
