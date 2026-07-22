const PROJECT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function validateProjectName(value: string): string {
  if (value.length > 214 || !PROJECT_NAME.test(value)) {
    throw new Error("INVALID_PROJECT_NAME");
  }

  return value;
}
