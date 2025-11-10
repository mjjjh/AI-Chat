/**
 * 延时函数
 */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
