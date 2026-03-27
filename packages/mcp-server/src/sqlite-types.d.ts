/* eslint-disable @typescript-eslint/no-explicit-any */
export {};
declare module "node:sqlite" {
  interface StatementSync {
    all(...params: any[]): any[];
    get(...params: any[]): any;
  }
}
