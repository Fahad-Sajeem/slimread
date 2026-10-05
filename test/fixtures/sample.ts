import { x } from "./x";

export interface User {
  id: string;
  name: string;
}

export type Id = string | number;

export enum Role {
  Admin,
  Guest,
}

/** Doubles a number. */
export function helper(n: number): number {
  return n * 2;
}

export const arrow = (a: number, b: number) => a + b;

export class AuthService {
  private db: Map<string, string>;

  constructor(db: Map<string, string>) {
    this.db = db;
  }

  async login(user: string, pw: string): Promise<string | undefined> {
    const t = this.db.get(user);
    return t ?? String(helper(0));
  }

  static hash(pw: string) {
    return pw.split("").reverse().join("");
  }
}
