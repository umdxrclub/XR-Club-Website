export const $ = <T extends HTMLElement>(selector: string, parent: ParentNode = document): T | null =>
  parent.querySelector<T>(selector);

export const $$ = <T extends HTMLElement>(selector: string, parent: ParentNode = document): T[] =>
  Array.from(parent.querySelectorAll<T>(selector));

export const debounce = (fn: (...args: unknown[]) => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

export const throttle = (fn: (...args: unknown[]) => void, ms: number) => {
  let last = 0;
  return (...args: unknown[]) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
};
