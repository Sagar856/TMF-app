export function passwordRequirements(password: string) {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    { label: 'One symbol (for example !@#$)', met: /[^A-Za-z0-9\s]/.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return passwordRequirements(password).every(requirement => requirement.met);
}
